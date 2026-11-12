import { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { parse, schema, type Issue, type Range } from "./source-document";
import {
  buildSourceLedger,
  sourceToVisual,
  visualToSource,
  type LedgerSpan,
  type SourceLinkOwner,
  type SourceLedger,
  type SourceRange,
} from "./source-ledger";
import { applyNativePatches, planNativeTransaction, type NativePatch, type NativePlan } from "./source-transaction";
import { createInkoraProjectionState, type EditorStateOptions } from "./editor-session";
import { isWellFormed } from "./source-replacement";
import type { VisualTextEdit } from "./visual-search";
import { escapeEditableText, planVisualReplacementPatch, renderAutolinkLabel } from "./visual-replacement";

export type Affinity = 'left' | 'right';
export type RawSelection = { anchor: number; head: number; affinity: Affinity };
export type ProjectionAnchor = { visual: number; raw: number; reason: string };
export type ProjectionAudit = {
  kind: 'exact' | 'anchored';
  reason: string;
  anchors: ProjectionAnchor[];
  provenance: string[];
};
export type SourceDraft = { raw: string; selection: RawSelection };
export type ManagedImageInsertion = {
  assetID?: string;
  uri: string;
  alt: string;
  title: string | null;
};
export type ManagedImageRewrite = { assetID: string; from: string; to: string };
export type CanonicalImageOwnership = {
  readonly raw: string;
  readonly imageURIs: readonly string[];
};

type Snapshot = {
  raw: string;
  state: EditorState;
  rawSelection: RawSelection;
  projection: ProjectionAudit;
  issues: Issue[];
  managedImageOwners: Map<string, string>;
  sourceCommit: SourceCommit | null;
};

type SourceCommit = {
  // Content-state provenance, not a mode flag. The immutable document and raw
  // travel together in history; a new epoch cannot reuse the author's receipt.
  readonly raw: string;
  readonly doc: PMNode;
  readonly epoch: number;
};

type CompositionGroup = {
  id: unknown;
  before: Snapshot;
  past: Snapshot[];
  future: Snapshot[];
};

type ProjectionContext = {
  ledger: SourceLedger;
  ranges: Range[];
  parsedDoc: PMNode;
};

function semanticWhitespaceShadow(raw: string): {
  shadow: string;
  shadowToRaw: number[];
  removed: Array<{ start: number; end: number }>;
} {
  let shadow = '';
  const shadowToRaw = [0];
  const removed: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < raw.length; index++) {
    const singleBeforeEol = raw[index] === ' '
      && raw[index - 1] !== ' '
      && (raw[index + 1] === '\n' || (raw[index + 1] === '\r' && raw[index + 2] === '\n'));
    if (singleBeforeEol) {
      removed.push({ start: index, end: index + 1 });
      continue;
    }
    shadow += raw[index];
    shadowToRaw.push(index + 1);
  }
  return { shadow, shadowToRaw, removed };
}

function baseLedger(raw: string, parsed: ReturnType<typeof parse>): SourceLedger {
  const direct = buildSourceLedger(raw, parsed.doc, parsed.ranges, parsed.tokenEvidence);
  if (direct.ok) return direct.ledger;
  const shadow = semanticWhitespaceShadow(raw);
  if (!shadow.removed.length) throw Error(`投影账本失败：${direct.reason}`);
  const shadowParsed = parse(shadow.shadow);
  if (!shadowParsed.doc.eq(parsed.doc)) throw Error(`投影账本失败：${direct.reason}`);
  const fallback = buildSourceLedger(shadow.shadow, shadowParsed.doc, shadowParsed.ranges, shadowParsed.tokenEvidence);
  if (!fallback.ok) throw Error(`投影账本失败：${fallback.reason}`);
  const translated = fallback.ledger.spans.map(span => ({
    ...span,
    sourceStart: shadow.shadowToRaw[span.sourceStart] ?? raw.length,
    sourceEnd: shadow.shadowToRaw[span.sourceEnd] ?? raw.length,
  }));
  const removed: LedgerSpan[] = shadow.removed.map(range => ({
    sourceStart: range.start,
    sourceEnd: range.end,
    role: 'gap',
    syntax: 'legal-single-trailing-space',
    visible: false,
    detail: 'CommonMark 语义隐藏；字节仍由当前原文权威持有',
  }));
  const translateRange = (range: SourceRange): SourceRange => ({
    from: shadow.shadowToRaw[range.from] ?? raw.length,
    to: shadow.shadowToRaw[range.to] ?? raw.length,
  });
  return {
    ...fallback.ledger,
    sourceLength: raw.length,
    spans: [...translated, ...removed],
    blocks: fallback.ledger.blocks.map((block, index) => ({
      ...block,
      range: parsed.ranges[index] ?? block.range,
      spans: block.spans.map(span => translated[fallback.ledger.spans.indexOf(span)] ?? span),
    })),
    links: fallback.ledger.links.map(link => ({
      ...link,
      source: translateRange(link.source),
      labelSource: translateRange(link.labelSource),
      labelMarkupSource: translateRange(link.labelMarkupSource),
      hrefSource: link.hrefSource ? translateRange(link.hrefSource) : undefined,
      titleSource: link.titleSource ? translateRange(link.titleSource) : undefined,
      titleSeparatorSource: link.titleSeparatorSource
        ? translateRange(link.titleSeparatorSource)
        : undefined,
      trailingSource: link.trailingSource ? translateRange(link.trailingSource) : undefined,
      definition: link.definition ? {
        source: translateRange(link.definition.source),
        hrefSource: translateRange(link.definition.hrefSource),
        destinationSource: link.definition.destinationSource
          ? translateRange(link.definition.destinationSource) : undefined,
        titleSource: link.definition.titleSource
          ? translateRange(link.definition.titleSource)
          : undefined,
        titleSeparatorSource: link.definition.titleSeparatorSource
          ? translateRange(link.definition.titleSeparatorSource)
          : undefined,
      } : undefined,
    })),
    diagnostics: [...fallback.ledger.diagnostics, {
      code: 'legal_single_trailing_space_projection',
      message: '以显式 shadow→raw 边界表审计 CommonMark 隐藏的单尾随空格',
    }],
  };
}

/** Preserve only source-identical plain paragraphs whose edge spaces CommonMark hides. */
function literalWhitespaceProjection(raw: string, parsed: ReturnType<typeof parse>, doc: PMNode): ProjectionContext | null {
  if (parsed.issues.length || parsed.doc.childCount !== doc.childCount) return null;
  const firstLineStart = raw.startsWith('\uFEFF') ? 1 : 0;
  const firstEol = /\r\n|\n/.exec(raw);
  const ranges = parsed.ranges.length ? parsed.ranges :
    /^ *(?:\r?\n[ \r\n]*)?$/.test(raw.slice(firstLineStart))
      ? [{ start: firstLineStart, end: firstEol?.index ?? raw.length,
        pos: 0, size: parsed.doc.firstChild!.nodeSize, kind: 'paragraph' }] : [];
  if (ranges.length !== doc.childCount) return null;
  const changed: Array<{ from: number; to: number; pos: number; text: string }> = [];
  const positions: number[] = [];
  let pos = 0;
  for (let index = 0; index < doc.childCount; index++) {
    const before = parsed.doc.child(index), after = doc.child(index), range = ranges[index];
    positions.push(pos);
    if (!before.eq(after)) {
      if (before.type.name !== 'paragraph' || after.type.name !== 'paragraph' ||
          before.childCount > 1 || after.childCount !== 1 || !after.firstChild?.isText ||
          after.firstChild.marks.length || (before.firstChild && (!before.firstChild.isText || before.firstChild.marks.length))) return null;
      const text = after.textContent;
      if (raw.slice(range.start, range.end) !== text ||
          text.replace(/^ +| +$/g, '') !== before.textContent || !/^ | $/.test(text)) return null;
      changed.push({ from: range.start, to: range.end, pos, text });
    }
    pos += after.nodeSize;
  }
  if (!changed.length) return null;
  const base = baseLedger(raw, parsed);
  const shift = (visual: number) => {
    const index = ranges.findIndex(range => visual >= range.pos && visual < range.pos + range.size);
    return index < 0 ? visual + doc.content.size - parsed.doc.content.size : visual + positions[index] - ranges[index].pos;
  };
  const spans = base.spans.filter(span => !changed.some(item => span.sourceStart < item.to && span.sourceEnd > item.from))
    .map(span => ({ ...span, visualStart: span.visualStart === undefined ? undefined : shift(span.visualStart),
      visualEnd: span.visualEnd === undefined ? undefined : shift(span.visualEnd) }));
  for (const item of changed) {
    for (let index = 0; index < item.text.length; index++) spans.push({
      sourceStart: item.from + index, sourceEnd: item.from + index + 1,
      role: 'text', syntax: 'literal-paragraph-whitespace', visible: true,
      text: item.text[index], visualStart: item.pos + 1 + index, visualEnd: item.pos + 2 + index,
    });
  }
  const mappedRanges = ranges.map((range, index) => ({ ...range, pos: positions[index], size: doc.child(index).nodeSize }));
  return { parsedDoc: parsed.doc, ranges: mappedRanges, ledger: { ...base, docSize: doc.content.size, spans,
    blocks: base.blocks.map((block, index) => ({ ...block, range: mappedRanges[index],
      spans: spans.filter(span => span.sourceStart >= block.range.start && span.sourceEnd <= block.range.end) })),
    links: base.links.map(link => ({ ...link, visual: { from: shift(link.visual.from), to: shift(link.visual.to) } })),
  } };
}

/** Prove trailing spaces against accepted plain-text owners, including list paragraphs. */
function ownerTrailingWhitespaceProjection(raw: string, parsed: ReturnType<typeof parse>, doc: PMNode): ProjectionContext | null {
  if (parsed.issues.length || parsed.doc.eq(doc)) return null;
  const base = baseLedger(raw, parsed);
  const changed: Array<{ from: number; to: number; oldPos: number; pos: number; beforeSize: number; afterSize: number; text: string }> = [];
  const pair = (before: PMNode, after: PMNode, oldPos: number, pos: number): boolean => {
    if (before.eq(after)) return true;
    if (!before.sameMarkup(after)) return false;
    if (before.isTextblock) {
      if (!['paragraph', 'heading'].includes(before.type.name) || before.childCount !== 1 || after.childCount !== 1 ||
          !before.firstChild?.isText || !after.firstChild?.isText || before.firstChild.marks.length || after.firstChild.marks.length ||
          !after.textContent.startsWith(before.textContent) || !/^ +$/.test(after.textContent.slice(before.textContent.length))) return false;
      const body = base.spans.filter(span => span.visible && span.role === 'text' && span.visualStart !== undefined &&
        span.visualEnd !== undefined && span.visualStart >= oldPos + 1 && span.visualEnd <= oldPos + 1 + before.content.size)
        .sort((left, right) => left.visualStart! - right.visualStart!);
      if (!body.length) return false;
      const from = body[0].sourceStart;
      let visual = oldPos + 1;
      for (const span of body) {
        if (span.visualStart !== visual || span.sourceStart !== from + visual - oldPos - 1 ||
            span.sourceEnd - span.sourceStart !== span.visualEnd! - span.visualStart!) return false;
        visual = span.visualEnd!;
      }
      if (visual !== oldPos + 1 + before.content.size) return false;
      const to = from + after.textContent.length;
      const owner = parsed.ranges.find(range => oldPos >= range.pos && oldPos + before.nodeSize <= range.pos + range.size);
      if (!owner || from < owner.start || to > owner.end || raw.slice(from, to) !== after.textContent) return false;
      changed.push({ from, to, oldPos, pos, beforeSize: before.nodeSize, afterSize: after.nodeSize, text: after.textContent });
      return true;
    }
    if (!['doc', 'bullet_list', 'ordered_list', 'list_item'].includes(before.type.name) || before.childCount !== after.childCount) return false;
    let oldOffset = before.type.name === 'doc' ? 0 : oldPos + 1;
    let offset = after.type.name === 'doc' ? 0 : pos + 1;
    for (let index = 0; index < before.childCount; index++) {
      if (!pair(before.child(index), after.child(index), oldOffset, offset)) return false;
      oldOffset += before.child(index).nodeSize;
      offset += after.child(index).nodeSize;
    }
    return true;
  };
  if (!pair(parsed.doc, doc, 0, 0) || !changed.length) return null;
  const shift = (visual: number) => visual + changed.reduce((delta, item) =>
    delta + (visual >= item.oldPos + item.beforeSize ? item.afterSize - item.beforeSize : 0), 0);
  const spans = base.spans.filter(span => !changed.some(item => span.sourceStart < item.to && span.sourceEnd > item.from))
    .map(span => ({ ...span, visualStart: span.visualStart === undefined ? undefined : shift(span.visualStart),
      visualEnd: span.visualEnd === undefined ? undefined : shift(span.visualEnd) }));
  for (const item of changed) for (let index = 0; index < item.text.length; index++) spans.push({
    sourceStart: item.from + index, sourceEnd: item.from + index + 1, role: 'text',
    syntax: 'literal-owner-trailing-whitespace', visible: true, text: item.text[index],
    visualStart: item.pos + 1 + index, visualEnd: item.pos + 2 + index,
  });
  let pos = 0;
  const ranges = parsed.ranges.map((range, index) => {
    const mapped = { ...range, pos, size: doc.child(index).nodeSize };
    pos += mapped.size;
    return mapped;
  });
  return { parsedDoc: parsed.doc, ranges, ledger: { ...base, docSize: doc.content.size, spans,
    blocks: base.blocks.map((block, index) => ({ ...block, range: ranges[index],
      spans: spans.filter(span => span.sourceStart >= block.range.start && span.sourceEnd <= block.range.end) })),
    links: base.links.map(link => ({ ...link, visual: { from: shift(link.visual.from), to: shift(link.visual.to) } })),
  } };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function cloneSelection(value: RawSelection): RawSelection {
  return { ...value };
}

function cloneProjection(value: ProjectionAudit): ProjectionAudit {
  return {
    ...value,
    anchors: value.anchors.map(anchor => ({ ...anchor })),
    provenance: [...value.provenance],
  };
}

function markdownImage(value: ManagedImageInsertion): string {
  if (!value.uri || /[\u0000-\u0020<>]/.test(value.uri) || /%(?![0-9A-Fa-f]{2})/.test(value.uri)) {
    throw Error('图片 URI 必须是已按 UTF-8 百分号编码的安全相对 URI 或受控草稿 URI');
  }
  if (/[\r\n]/.test(value.alt) || (value.title !== null && /[\r\n]/.test(value.title))) {
    throw Error('图片 alt/title 不能包含换行');
  }
  const alt = value.alt.replace(/([\\\]])/g, '\\$1');
  const title = value.title === null ? '' : ` "${value.title.replace(/([\\"])/g, '\\$1')}"`;
  return `![${alt}](${value.uri}${title})`;
}

function eolAt(raw: string, offset: number): '\n' | '\r\n' {
  const after = raw.slice(offset).match(/\r\n|\n/);
  if (after) return after[0] as '\n' | '\r\n';
  const before = [...raw.matchAll(/\r\n|\n/g)].at(-1)?.[0];
  return (before ?? '\n') as '\n' | '\r\n';
}

function mapRawOffset(offset: number, patches: readonly NativePatch[], side: -1 | 1): number {
  let delta = 0;
  for (const patch of [...patches].sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (offset < patch.from) break;
    const mappedFrom = patch.from + delta;
    if (patch.from === patch.to) {
      if (offset === patch.from) return mappedFrom + (side < 0 ? 0 : patch.insert.length);
      delta += patch.insert.length;
      continue;
    }
    if (offset === patch.from) return mappedFrom;
    if (offset === patch.to) return mappedFrom + patch.insert.length;
    if (offset < patch.to) return mappedFrom + (side < 0 ? 0 : patch.insert.length);
    delta += patch.insert.length - (patch.to - patch.from);
  }
  return offset + delta;
}

function normalizeProjectionText(text: string): string {
  // A single ordinary space immediately before a logical line end is a legal
  // source byte but is absent from CommonMark semantics. Two spaces are not
  // removed: they are a hardbreak and must cause semantic reprojection.
  return text.replace(/(^|[^ ]) (?=\n|$)/g, '$1');
}

function comparableNode(node: PMNode): PMNode | null {
  if (node.isText) {
    const text = normalizeProjectionText(node.text ?? '');
    return text ? schema.text(text, node.marks) : null;
  }
  if (node.isLeaf) return node;
  const children: PMNode[] = [];
  node.forEach(child => {
    const normalized = comparableNode(child);
    if (normalized) children.push(normalized);
  });
  if (node.type.name === 'paragraph' && children.length === 0) return null;
  return node.type.create(node.attrs, children, node.marks);
}

function comparableDoc(doc: PMNode): PMNode {
  const children: PMNode[] = [];
  doc.forEach(child => {
    const normalized = comparableNode(child);
    if (normalized) children.push(normalized);
  });
  if (!children.length) children.push(schema.nodes.paragraph.create());
  return schema.topNodeType.createChecked(null, children);
}

function nodeCount(doc: PMNode, type: string): number {
  let count = 0;
  doc.descendants(node => { if (node.type.name === type) count++; });
  return count;
}

function semanticReprojectionProof(beforeRaw: string, beforeDoc: PMNode, projection: ProjectionAudit, plan: NativePlan, parsedDoc: PMNode, targetDoc: PMNode): string | null {
  if (!['text', 'empty-text', 'projection-sync'].includes(plan.kind) || plan.patches.length !== 1) return null;
  const patch = plan.patches[0];

  if (patch.from !== patch.to) return null;

  const eofEolStart = beforeRaw.endsWith('\r\n') ? beforeRaw.length - 2
    : beforeRaw.endsWith('\n') ? beforeRaw.length - 1 : -1;
  const continuesAcceptedRawEof = patch.from === beforeRaw.length
    && patch.insert.length > 0
    && !/[\r\n]/.test(patch.insert)
    && eofEolStart >= 0
    && projection.anchors.some(anchor => anchor.raw === patch.from)
    && parse(beforeRaw.slice(0, eofEolStart) + patch.insert).doc.eq(targetDoc);
  if (continuesAcceptedRawEof) {
    const eol = beforeRaw.slice(eofEolStart);
    return `semantic-contract: accepted raw EOF anchor reveals ${JSON.stringify(eol)} as an internal semantic break`;
  }

  const rawLineStart = patch.from === 0 ? 0 : beforeRaw.lastIndexOf('\n', patch.from - 1) + 1;
  const rawLineEndMatch = /\r\n|\n/.exec(beforeRaw.slice(patch.from));
  const rawLineEnd = rawLineEndMatch ? patch.from + rawLineEndMatch.index : beforeRaw.length;
  const activatesAtxOnEmptyLine = /^#{1,6}$/.test(patch.insert)
    && patch.from === rawLineStart
    && patch.from === rawLineEnd
    && nodeCount(parsedDoc, 'heading') === nodeCount(beforeDoc, 'heading') + 1
    && nodeCount(targetDoc, 'heading') === nodeCount(beforeDoc, 'heading');
  if (activatesAtxOnEmptyLine) return `semantic-contract: ${patch.insert.length}-level ATX heading activation on an empty raw line`;

  const activatesHardbreak = patch.insert === ' '
    && beforeRaw[patch.from - 1] === ' '
    && beforeRaw[patch.from - 2] !== ' '
    && /^(?:\r\n|\n|$)/.test(beforeRaw.slice(patch.from))
    && nodeCount(parsedDoc, 'hard_break') === nodeCount(beforeDoc, 'hard_break') + 1
    && nodeCount(targetDoc, 'hard_break') === nodeCount(beforeDoc, 'hard_break');
  if (activatesHardbreak) return 'semantic-contract: second trailing space activates one hardbreak';

  const exposesHiddenSingleSpace = patch.insert.length > 0
    && !/[\r\n]/.test(patch.insert)
    && beforeRaw[patch.from - 1] === ' '
    && beforeRaw[patch.from - 2] !== ' '
    && /^(?:\r\n|\n|$)/.test(beforeRaw.slice(patch.from))
    && comparableDoc(parse(beforeRaw).doc).eq(comparableDoc(beforeDoc));
  if (exposesHiddenSingleSpace) return 'semantic-contract: inserted text exposes one source-owned hidden trailing space';

  const materializesAnchoredEmptyLine = patch.insert.length > 0
    && !/[\r\n]/.test(patch.insert)
    && /(?:\r\n|\n)$/.test(beforeRaw.slice(0, patch.from))
    && /^(?:\r\n|\n)/.test(beforeRaw.slice(patch.from))
    && projection.anchors.some(anchor => anchor.raw === patch.from);
  if (materializesAnchoredEmptyLine) return 'semantic-contract: insertion at an audited raw anchor materializes an empty line';

  if (patch.insert === ' ') {
    const marker = beforeRaw.slice(rawLineStart, patch.from);
    const activatesEmptyAtxHeading = /^#{1,6}$/.test(marker)
      && patch.from === rawLineEnd
      && nodeCount(parsedDoc, 'heading') === nodeCount(beforeDoc, 'heading') + 1
      && nodeCount(targetDoc, 'heading') === nodeCount(beforeDoc, 'heading');
    if (activatesEmptyAtxHeading) return `semantic-contract: ${marker.length}-level empty ATX heading whitespace activation`;
  }
  // The source patch itself is already proven local, mapped and grapheme-safe.
  // A plain insertion may activate or deactivate Markdown syntax while the PM
  // transaction still describes the pre-insertion projection (input rules are
  // allowed to run only after the text event). In that case the parser result
  // is the derived projection of the accepted bytes, not a serializer escape
  // hatch. Unknown/ambiguous candidates never reach this branch because the
  // caller requires a clean parse before accepting the proof.
  return `source-authoritative local insertion: ${patch.from}..${patch.to} -> ${JSON.stringify(patch.insert)}`;
}

function implicitLinkReprojectionProof(
  raw: string, ledger: SourceLedger, plan: NativePlan,
  parsed: ReturnType<typeof parse>, targetDoc: PMNode, mapping: Transaction['mapping'],
): string | null {
  if (plan.kind !== 'text' || plan.patches.length !== 1) return null;
  const patch = plan.patches[0];
  if (/[\r\n]/.test(patch.insert)) return null;
  const owners = ledger.links.filter(owner => owner.kind === 'autolink'
    && raw[owner.source.from] !== '<'
    && patch.from >= owner.source.from && patch.to <= owner.source.to);
  if (owners.length !== 1) return null;
  const from = mapping.map(owners[0].visual.from, -1);
  const to = mapping.map(owners[0].visual.to, 1);
  const updated = baseLedger(plan.candidate, parsed);
  const links = updated.links.filter(owner => owner.visual.from < to && owner.visual.to > from);
  if (links.some(owner => owner.kind !== 'autolink' || plan.candidate[owner.source.from] === '<'
      || owner.visual.from < from || owner.visual.to > to)) return null;
  const withoutImplicitLink = (doc: PMNode): PMNode =>
    EditorState.create({ doc }).tr.removeMark(from, to, schema.marks.link).doc;
  if (!withoutImplicitLink(parsed.doc).eq(withoutImplicitLink(targetDoc))) return null;
  return 'semantic-contract: a mapped text edit changes only the derived bare-link mark in its audited owner';
}

function rawCodeUnitBoundaryError(raw: string, offset: number): string | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > raw.length) return `原文位置 ${offset} 越界`;
  if (raw.startsWith('\uFEFF') && offset === 0) return 'BOM 前位置不是正文边界';
  if (offset > 0 && offset < raw.length && raw[offset - 1] === '\r' && raw[offset] === '\n') return 'CRLF 内部不是合法边界';
  if (offset > 0 && offset < raw.length) {
    const previous = raw.charCodeAt(offset - 1);
    const next = raw.charCodeAt(offset);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) return 'surrogate pair 内部不是合法边界';
  }
  return null;
}

function rawBoundaryError(raw: string, offset: number, knownBoundaries?: Pick<ReadonlySet<number>, 'has'>): string | null {
  const structuralError = rawCodeUnitBoundaryError(raw, offset);
  if (structuralError) return structuralError;
  const boundaries = knownBoundaries ?? new Set<number>([0, raw.length]);
  if (!knownBoundaries) {
    const writable = boundaries as Set<number>;
    for (const part of segmenter.segment(raw)) {
      writable.add(part.index);
      writable.add(part.index + part.segment.length);
    }
  }
  if (!boundaries.has(offset)) return 'grapheme 内部不是合法边界';
  return null;
}

function dedupeAnchors(anchors: ProjectionAnchor[]): ProjectionAnchor[] {
  return anchors.filter((anchor, index, all) => all.findIndex(candidate =>
    candidate.visual === anchor.visual && candidate.raw === anchor.raw) === index);
}

function cloneRange(range: SourceRange): SourceRange {
  return { ...range };
}

function cloneLinkOwner(owner: SourceLinkOwner): SourceLinkOwner {
  return {
    ...owner,
    source: cloneRange(owner.source),
    labelSource: cloneRange(owner.labelSource),
    labelMarkupSource: cloneRange(owner.labelMarkupSource),
    visual: cloneRange(owner.visual),
    hrefSource: owner.hrefSource ? cloneRange(owner.hrefSource) : undefined,
    titleSource: owner.titleSource ? cloneRange(owner.titleSource) : undefined,
    titleSeparatorSource: owner.titleSeparatorSource
      ? cloneRange(owner.titleSeparatorSource)
      : undefined,
    trailingSource: owner.trailingSource ? cloneRange(owner.trailingSource) : undefined,
    definition: owner.definition ? {
      source: cloneRange(owner.definition.source),
      hrefSource: cloneRange(owner.definition.hrefSource),
      destinationSource: owner.definition.destinationSource
        ? cloneRange(owner.definition.destinationSource) : undefined,
      titleSource: owner.definition.titleSource
        ? cloneRange(owner.definition.titleSource)
        : undefined,
      titleSeparatorSource: owner.definition.titleSeparatorSource
        ? cloneRange(owner.definition.titleSeparatorSource)
        : undefined,
    } : undefined,
  };
}

function sameLinkOwner(left: SourceLinkOwner, right: SourceLinkOwner): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function escapedTitle(value: string, delimiter: string): string {
  const escapedBackslashes = value.replace(/\\/g, '\\\\');
  return escapedBackslashes.replace(new RegExp(`\\${delimiter}`, 'g'), `\\${delimiter}`);
}

function titleToken(value: string, current?: string): string {
  const open = current?.[0];
  const close = current?.at(-1);
  if ((open === '"' && close === '"') || (open === "'" && close === "'") ||
      (open === '(' && close === ')')) {
    return `${open}${escapedTitle(value, close)}${close}`;
  }
  return `"${escapedTitle(value, '"')}"`;
}

function destinationToken(raw: string, range: SourceRange, href: string): string {
  const current = raw.slice(range.from, range.to);
  return current.startsWith('<') && current.endsWith('>') ? `<${href}>` : href;
}

function linkTail(href: string, title: string | null): string {
  return `](${href}${title === null ? '' : ` ${titleToken(title)}`})`;
}

function planOwnedLinkPatches(
  raw: string,
  owner: SourceLinkOwner,
  attrs: { href: string; title: string | null } | null,
): NativePatch[] {
  if (!attrs) {
    if (owner.kind === 'autolink' && raw[owner.source.from] !== '<') {
      return [{ from: owner.source.from, to: owner.source.to,
        insert: escapeEditableText(raw.slice(owner.labelMarkupSource.from, owner.labelMarkupSource.to)) }];
    }
    return [
      { from: owner.source.from, to: owner.labelMarkupSource.from, insert: '' },
      { from: owner.labelMarkupSource.to, to: owner.source.to, insert: '' },
    ];
  }
  if (attrs.href === owner.href && attrs.title === owner.title) return [];
  if (owner.kind === 'autolink') {
    const label = raw.slice(owner.labelMarkupSource.from, owner.labelMarkupSource.to);
    return [{
      from: owner.source.from,
      to: owner.source.to,
      insert: `[${label}${linkTail(attrs.href, attrs.title)}`,
    }];
  }
  if (owner.kind === 'reference' &&
      (owner.referenceUsageCount !== 1 || !owner.definition)) {
    return [{
      from: owner.labelMarkupSource.to,
      to: owner.source.to,
      insert: linkTail(attrs.href, attrs.title),
    }];
  }

  const hrefSource = owner.kind === 'reference'
    ? owner.definition!.hrefSource
    : owner.hrefSource;
  if (!hrefSource) throw Error('链接 owner 缺少 href 原文范围');
  const patches: NativePatch[] = attrs.href === owner.href ? [] : [{
    from: hrefSource.from,
    to: hrefSource.to,
    insert: destinationToken(raw, hrefSource, attrs.href),
  }];
  if (attrs.title === owner.title) return patches;
  const currentTitleSource = owner.kind === 'reference'
    ? owner.definition!.titleSource
    : owner.titleSource;
  const titleSeparator = owner.kind === 'reference'
    ? owner.definition!.titleSeparatorSource
    : owner.titleSeparatorSource;
  if (currentTitleSource && attrs.title === null) {
    if (owner.kind === 'reference') {
      const opening = currentTitleSource.from - 1;
      const closing = currentTitleSource.to + 1;
      patches.push({
        from: titleSeparator?.from ?? opening,
        to: closing,
        insert: '',
      });
    } else {
      patches.push({
        from: titleSeparator?.from ?? currentTitleSource.from,
        to: currentTitleSource.to,
        insert: '',
      });
    }
  } else if (currentTitleSource && attrs.title !== null) {
    if (owner.kind === 'reference') {
      const delimiter = raw[currentTitleSource.from - 1] ?? '"';
      patches.push({
        from: currentTitleSource.from,
        to: currentTitleSource.to,
        insert: escapedTitle(attrs.title, delimiter === '(' ? ')' : delimiter),
      });
    } else {
      patches.push({
        from: currentTitleSource.from,
        to: currentTitleSource.to,
        insert: titleToken(attrs.title, raw.slice(currentTitleSource.from, currentTitleSource.to)),
      });
    }
  } else if (attrs.title !== null) {
    const destinationEnd = owner.kind === 'reference'
      ? owner.definition!.destinationSource?.to ?? hrefSource.to
      : hrefSource.to;
    patches.push({
      from: destinationEnd,
      to: destinationEnd,
      insert: ` ${titleToken(attrs.title)}`,
    });
  }
  return patches;
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.raw === b.raw && a.state.doc.eq(b.state.doc)
    && a.rawSelection.anchor === b.rawSelection.anchor
    && a.rawSelection.head === b.rawSelection.head;
}

export class SourceAuthoritySession {
  currentRaw: string;
  savedRaw: string;
  state: EditorState;
  rawSelection: RawSelection;
  projection: ProjectionAudit;
  issues: Issue[];
  version = 0;
  private logicalRevision = 0;
  epoch = 1;
  past: Snapshot[] = [];
  future: Snapshot[] = [];
  draft: SourceDraft | null = null;
  diagnostic = '';
  unresolvedIntent: { description: string; raw?: string } | null = null;
  composing = false;
  private compositionStartRaw: string | undefined;
  private compositionGroup: CompositionGroup | null = null;
  private readonly options: EditorStateOptions;
  private preferredEol: '\r\n' | '\n';
  private managedImageOwners = new Map<string, string>();
  private sourceCommit: SourceCommit | null = null;
  // Parsing is a pure function of raw within this document epoch. Keep one
  // immutable result across validation/acceptance/ledger construction;
  // projection proofs still bind raw + PM doc identity + projection identity.
  private parsedSourceCache: { raw: string; parsed: ReturnType<typeof parse> } | null = null;
  private projectionContextCache: {
    raw: string;
    doc: PMNode;
    projection: ProjectionAudit;
    context: ProjectionContext;
  } | null = null;
  private rawBoundaryCache: { raw: string; boundaries: Pick<ReadonlySet<number>, 'has'> } | null = null;
  private mathContentCache: { raw: string; doc: PMNode; values: Map<number, string> } | null = null;

  constructor(
    raw: string,
    options: EditorStateOptions = {},
    selection: RawSelection = { anchor: 0, head: 0, affinity: 'right' },
  ) {
    this.options = options;
    this.preferredEol = raw.match(/\r\n|\n/)?.[0] === '\r\n' ? '\r\n' : '\n';
    const parsed = this.parseSource(raw);
    this.currentRaw = raw;
    this.savedRaw = raw;
    this.state = createInkoraProjectionState(parsed.doc, this.options);
    this.issues = parsed.issues;
    this.projection = { kind: 'exact', reason: '由当前原文直接解析', anchors: [], provenance: [] };
    this.rawSelection = { anchor: raw.startsWith('\uFEFF') ? 1 : 0, head: raw.startsWith('\uFEFF') ? 1 : 0, affinity: 'right' };
    if (selection.anchor || selection.head || raw.length === 0) this.setRawSelection(selection.anchor, selection.head, selection.affinity);
  }

  get documentDirty(): boolean { return this.currentRaw !== this.savedRaw; }
  get draftDirty(): boolean { return !!this.draft && this.draft.raw !== this.currentRaw; }
  get status() {
    return {
      revision: this.logicalRevision,
      dirty: this.documentDirty,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      composing: this.composing,
    };
  }
  get saveEligible(): boolean {
    if (this.composing || this.draftDirty || this.unresolvedIntent) return false;
    const source = this.sourceCommit;
    if (source && source.raw === this.currentRaw && source.doc === this.state.doc &&
        source.epoch === this.epoch) return true;
    return !this.issues.length && this.projectionIsAuditable();
  }
  get sourceAccessible(): boolean { return !this.composing; }

  captureImageOwnership(): CanonicalImageOwnership {
    const imageURIs: string[] = [];
    this.state.doc.descendants(node => {
      if (node.type.name === 'image' && typeof node.attrs.href === 'string' && node.attrs.href) {
        imageURIs.push(node.attrs.href);
      }
    });
    return { raw: this.currentRaw, imageURIs };
  }

  /** Display-only content from the same canonical tokens; never a save source. */
  captureMathContent(position: number | undefined, expectedRaw: string): string | undefined {
    if (position === undefined) return undefined;
    const raw = this.currentRaw;
    const doc = this.state.doc;
    let cached = this.mathContentCache;
    if (!cached || cached.raw !== raw || cached.doc !== doc) {
      const tokens = this.parseSource(raw).tokenEvidence.tokens.filter(token =>
        token.type === 'inkora_protected_block' && token.meta?.inkoraOpaque === 'math');
      const values = new Map<number, string>();
      let index = 0;
      doc.descendants((node, pos) => {
        if (node.type.name !== 'protected_block' || node.attrs.kind !== 'math') return;
        const token = tokens[index++];
        if (token?.meta?.inkoraRule === 'SYN-D003' && !token.meta.inkoraIssue &&
            token.meta.inkoraRaw === node.attrs.raw && typeof token.meta.inkoraMathContent === 'string') {
          values.set(pos, token.meta.inkoraMathContent);
        }
      });
      this.mathContentCache = cached = { raw, doc, values };
    }
    if (doc.nodeAt(position)?.attrs.raw !== expectedRaw) return undefined;
    return cached.values.get(position);
  }

  captureProtectedRanges(raw = this.currentRaw): { raw: string; ranges: Array<{ start: number; end: number }> } {
    const parsed = this.parseSource(raw);
    const candidates = parsed.opaqueSpans.map(span => ({ start: span.sourceStart, end: span.sourceEnd }));
    candidates.sort((a, b) => a.start - b.start || a.end - b.end);
    const ranges: Array<{ start: number; end: number }> = [];
    for (const range of candidates) {
      const previous = ranges.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else ranges.push({ ...range });
    }
    return { raw, ranges };
  }

  private parseSource(raw: string): ReturnType<typeof parse> {
    if (this.parsedSourceCache?.raw === raw) return this.parsedSourceCache.parsed;
    const parsed = parse(raw);
    this.parsedSourceCache = { raw, parsed };
    return parsed;
  }

  private snapshot(): Snapshot {
    return {
      raw: this.currentRaw,
      state: this.state,
      rawSelection: cloneSelection(this.rawSelection),
      projection: cloneProjection(this.projection),
      issues: this.issues.map(issue => ({ ...issue })),
      managedImageOwners: new Map(this.managedImageOwners),
      sourceCommit: this.sourceCommit,
    };
  }

  private boundaryError(raw: string, offset: number): string | null {
    let cached = this.rawBoundaryCache;
    if (!cached || cached.raw !== raw) {
      // Query ICU's boundary in the complete raw string. This is the same
      // grapheme segmentation as enumeration, without allocating one Set entry
      // per character for a handful of selection/anchor checks. No substring
      // window or ASCII approximation can truncate a combining/ZWJ sequence.
      const segments = segmenter.segment(raw);
      const boundaries = {
        has: (offset: number): boolean => offset === raw.length || segments.containing(offset)?.index === offset,
      };
      cached = { raw, boundaries };
      this.rawBoundaryCache = cached;
    }
    return rawBoundaryError(raw, offset, cached.boundaries);
  }

  private restore(snapshot: Snapshot): void {
    this.currentRaw = snapshot.raw;
    this.state = snapshot.state;
    this.rawSelection = cloneSelection(snapshot.rawSelection);
    this.projection = cloneProjection(snapshot.projection);
    this.issues = snapshot.issues.map(issue => ({ ...issue }));
    this.managedImageOwners = new Map(snapshot.managedImageOwners);
    this.sourceCommit = snapshot.sourceCommit;
    this.draft = null;
  }

  private projectionContext(state = this.state, projection = this.projection): ProjectionContext {
    const raw = this.currentRaw;
    const cached = this.projectionContextCache;
    if (cached && cached.raw === raw && cached.doc === state.doc && cached.projection === projection) {
      return cached.context;
    }
    const remember = (context: ProjectionContext): ProjectionContext => {
      if (raw === this.currentRaw && state.doc === this.state.doc && projection === this.projection) {
        this.projectionContextCache = { raw, doc: state.doc, projection, context };
      }
      return context;
    };
    const parsed = this.parseSource(raw);
    const literal = literalWhitespaceProjection(raw, parsed, state.doc)
      ?? ownerTrailingWhitespaceProjection(raw, parsed, state.doc);
    if (literal) return remember(literal);
    const base = baseLedger(raw, parsed);
    if (parsed.doc.eq(state.doc)) {
      return remember({ ledger: base, ranges: parsed.ranges, parsedDoc: parsed.doc });
    }
    if (!comparableDoc(parsed.doc).eq(comparableDoc(state.doc))) {
      throw Error('当前 PM 投影与原文派生语义不满足有界投影关系');
    }

    const ranges: Range[] = [];
    const shifts: number[] = [];
    let targetIndex = 0;
    let targetPos = 0;
    for (let sourceIndex = 0; sourceIndex < parsed.doc.childCount; sourceIndex++) {
      const sourceBlock = parsed.doc.child(sourceIndex);
      const sourceComparable = comparableNode(sourceBlock);
      if (!sourceComparable) continue;
      let matched = false;
      while (targetIndex < state.doc.childCount) {
        const targetBlock = state.doc.child(targetIndex++);
        const pos = targetPos;
        targetPos += targetBlock.nodeSize;
        const targetComparable = comparableNode(targetBlock);
        if (!targetComparable) continue;
        if (!sourceComparable.eq(targetComparable)) throw Error(`第 ${sourceIndex + 1} 块投影不一致`);
        ranges.push({ ...parsed.ranges[sourceIndex], pos, size: targetBlock.nodeSize });
        shifts[sourceIndex] = pos - parsed.ranges[sourceIndex].pos;
        matched = true;
        break;
      }
      if (!matched) throw Error(`第 ${sourceIndex + 1} 块缺少 PM 投影`);
    }
    while (targetIndex < state.doc.childCount) {
      const target = state.doc.child(targetIndex++);
      targetPos += target.nodeSize;
      if (comparableNode(target)) throw Error('PM 投影有未归属结构');
    }

    const translatedSpans = base.spans.map(span => {
      if (!span.visible || span.visualStart === undefined || span.visualEnd === undefined) return { ...span };
      const sourceIndex = parsed.ranges.findIndex(range => span.visualStart! >= range.pos && span.visualEnd! <= range.pos + range.size);
      if (sourceIndex < 0 || shifts[sourceIndex] === undefined) return { ...span };
      return { ...span, visualStart: span.visualStart + shifts[sourceIndex], visualEnd: span.visualEnd + shifts[sourceIndex] };
    });
    const anchorSpans: LedgerSpan[] = projection.anchors.map(anchor => ({
      sourceStart: anchor.raw,
      sourceEnd: anchor.raw,
      role: 'insertion-anchor',
      syntax: 'source-authority-anchor',
      visible: true,
      text: '',
      visualStart: anchor.visual,
      visualEnd: anchor.visual,
      detail: anchor.reason,
    }));
    const ledger: SourceLedger = {
      ...base,
      docSize: state.doc.content.size,
      spans: [...translatedSpans, ...anchorSpans],
      blocks: base.blocks.map((block, index) => ({
        ...block,
        range: ranges[index] ?? block.range,
        spans: block.spans.map(span => translatedSpans[base.spans.indexOf(span)] ?? span),
      })),
      links: base.links.map(link => {
        const sourceIndex = parsed.ranges.findIndex(range =>
          link.visual.from >= range.pos && link.visual.to <= range.pos + range.size);
        const shift = sourceIndex < 0 ? undefined : shifts[sourceIndex];
        return shift === undefined
          ? { ...link }
          : { ...link, visual: { from: link.visual.from + shift, to: link.visual.to + shift } };
      }),
    };
    return remember({ ledger, ranges, parsedDoc: parsed.doc });
  }

  private projectionIsAuditable(): boolean {
    try { this.projectionContext(); return true; } catch { return false; }
  }

  private mapVisualEndpoint(position: number, side: 'from' | 'to' | 'any' = 'any', knownLedger?: SourceLedger): number {
    const exact = this.projection.anchors.filter(anchor => anchor.visual === position);
    if (exact.length) {
      const offsets = [...new Set(exact.map(anchor => anchor.raw))];
      if (offsets.length === 1) return offsets[0];
      const selected = side === 'to' ? Math.min(...offsets) : Math.max(...offsets);
      return selected;
    }
    const ledger = knownLedger ?? this.projectionContext().ledger;
    const mapped = visualToSource(ledger, position, position, { collapsedAffinity: side === 'to' ? 'left' : 'right' });
    if (!mapped.ok) throw Error(mapped.reason);
    return mapped.anchor;
  }

  private syntaxAwareRawMap(offset: number, affinity: Affinity): { visual: number; note: string } {
    const { ledger } = this.projectionContext();
    const direct = sourceToVisual(ledger, offset, offset, { collapsedAffinity: affinity });
    if (direct.ok) return { visual: direct.anchor, note: direct.snapped.join('; ') || '精确 span 边界' };
    const hardbreak = ledger.spans.find(span => span.visible
      && span.syntax === 'hardbreak-spaces'
      && span.visualStart !== undefined
      && offset > span.sourceStart
      && offset < span.sourceEnd
      && /^ +$/.test(this.currentRaw.slice(span.sourceStart, offset))
      && /^\r?\n/.test(this.currentRaw.slice(offset, span.sourceEnd)));
    if (hardbreak?.visualStart !== undefined) {
      return { visual: hardbreak.visualStart, note: 'hardbreak marker 与 EOL 的显式原文边界' };
    }
    const block = ledger.blocks.find(item => offset >= item.range.start && offset <= item.range.end);
    const visible = block?.spans.filter((span): span is LedgerSpan & { visualStart: number; visualEnd: number } =>
      span.visible && span.visualStart !== undefined && span.visualEnd !== undefined) ?? [];
    const left = visible.filter(span => span.sourceEnd <= offset).sort((a, b) => b.sourceEnd - a.sourceEnd)[0];
    const right = visible.filter(span => span.sourceStart >= offset).sort((a, b) => a.sourceStart - b.sourceStart)[0];
    if (affinity === 'right' && left) {
      const between = ledger.spans.filter(span => !span.visible && span.sourceStart >= left.sourceEnd && span.sourceEnd <= offset);
      const covered = between.reduce((end, span) => Math.max(end, span.sourceEnd), left.sourceEnd);
      if (covered === offset || left.sourceEnd === offset) return { visual: left.visualEnd, note: `right affinity 经 ${between.map(s => s.syntax).join(',') || '相邻边界'} 绑定前一内容` };
    }
    if (affinity === 'left' && right) return { visual: right.visualStart, note: `left affinity 绑定后一内容 ${right.syntax}` };
    const adjacent = sourceToVisual(ledger, offset, offset, { collapsedAffinity: affinity, snap: 'adjacent-gap' });
    if (adjacent.ok) return { visual: adjacent.anchor, note: adjacent.snapped.join('; ') };
    throw Error(direct.reason);
  }

  linkOwnerAtSelection(): SourceLinkOwner | null {
    const { ledger } = this.projectionContext();
    const visualAnchor = this.state.selection.anchor;
    const visualHead = this.state.selection.head;
    const visualFrom = Math.min(visualAnchor, visualHead);
    const visualTo = Math.max(visualAnchor, visualHead);
    let candidates: SourceLinkOwner[];
    if (visualFrom !== visualTo) {
      candidates = ledger.links.filter(link =>
        visualFrom >= link.visual.from && visualTo <= link.visual.to);
    } else {
      const strict = ledger.links.filter(link =>
        visualFrom > link.visual.from && visualFrom < link.visual.to);
      if (strict.length) candidates = strict;
      else {
        const raw = this.rawSelection.head;
        candidates = ledger.links.filter(link =>
          raw >= link.labelMarkupSource.from && raw <= link.labelMarkupSource.to &&
          visualFrom >= link.visual.from && visualFrom <= link.visual.to);
      }
    }
    return candidates.length === 1 ? cloneLinkOwner(candidates[0]) : null;
  }

  applyLinkOwnerEdit(
    expected: SourceLinkOwner,
    attrs: { href: string; title: string | null } | null,
  ): boolean {
    if (this.composing) return this.guard('link_edit');
    const current = this.linkOwnerAtSelection();
    if (!current || !sameLinkOwner(current, expected)) {
      this.diagnostic = '链接 owner 或选区已变化，请重新执行 Mod-K';
      return false;
    }
    const patches = planOwnedLinkPatches(this.currentRaw, current, attrs);
    const candidate = applyNativePatches(this.currentRaw, patches);
    if (candidate === this.currentRaw) return true;
    const before = this.snapshot();
    const selection = cloneSelection(this.rawSelection);
    const forward = selection.anchor <= selection.head;
    let mappedSelection: RawSelection = {
      anchor: mapRawOffset(
        selection.anchor,
        patches,
        selection.anchor === selection.head
          ? (selection.affinity === 'right' ? 1 : -1)
          : (forward ? -1 : 1),
      ),
      head: mapRawOffset(
        selection.head,
        patches,
        selection.anchor === selection.head
          ? (selection.affinity === 'right' ? 1 : -1)
          : (forward ? 1 : -1),
      ),
      affinity: selection.affinity,
    };
    try {
      const parsed = this.parseSource(candidate);
      if (parsed.issues.length) throw Error(parsed.issues[0].message);
      if (current.kind === 'autolink') {
        const expectedDoc = attrs
          ? before.state.tr.addMark(current.visual.from, current.visual.to, schema.marks.link.create(attrs)).doc
          : before.state.tr.removeMark(current.visual.from, current.visual.to, schema.marks.link).doc;
        if (!parsed.doc.eq(expectedDoc)) throw Error('自动链接属性更新改变了请求之外的投影');
        const ledger = baseLedger(candidate, parsed);
        const updatedOwners = attrs ? ledger.links.filter(owner => owner.visual.from === current.visual.from
          && owner.visual.to === current.visual.to && owner.href === attrs.href && owner.title === attrs.title) : [];
        if (attrs && updatedOwners.length !== 1) throw Error('自动链接转换后没有唯一的字段归属');
        const endpoint = (visual: number): number => {
          const owner = updatedOwners[0];
          if (owner && visual === current.visual.from) return owner.labelMarkupSource.from;
          if (owner && visual === current.visual.to) return owner.labelMarkupSource.to;
          const mapped = visualToSource(ledger, visual, visual, { collapsedAffinity: selection.affinity });
          if (!mapped.ok) throw Error(mapped.reason);
          return mapped.anchor;
        };
        mappedSelection = { anchor: endpoint(before.state.selection.anchor),
          head: endpoint(before.state.selection.head), affinity: selection.affinity };
      }
      this.currentRaw = candidate;
      this.state = createInkoraProjectionState(parsed.doc, this.options);
      this.issues = parsed.issues;
      this.projection = {
        kind: 'exact',
        reason: 'source-ledger owner 链接编辑',
        anchors: [],
        provenance: patches.map(patch =>
          `${patch.from}..${patch.to} -> ${JSON.stringify(patch.insert)}`),
      };
      this.rawSelection = mappedSelection;
      if (!this.setRawSelection(
        mappedSelection.anchor,
        mappedSelection.head,
        mappedSelection.affinity,
      )) throw Error(`链接编辑后的选区无法恢复：${this.diagnostic}`);
      const acceptedOwner = this.linkOwnerAtSelection();
      if (attrs) {
        if (!acceptedOwner || acceptedOwner.href !== attrs.href ||
            acceptedOwner.title !== attrs.title) {
          throw Error('链接编辑后的 source-ledger owner 与请求属性不一致');
        }
      } else if (acceptedOwner) {
        throw Error('移除链接后选区仍由 link owner 持有');
      }
      this.past.push(before);
      this.future = [];
      this.version++;
      this.logicalRevision++;
      this.unresolvedIntent = null;
      this.diagnostic = '';
      return true;
    } catch (error) {
      this.restore(before);
      this.diagnostic = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  setRawSelection(anchor: number, head = anchor, affinity: Affinity = 'right'): boolean {
    const anchorError = this.boundaryError(this.currentRaw, anchor);
    const headError = this.boundaryError(this.currentRaw, head);
    if (anchorError || headError) {
      this.diagnostic = anchorError ?? headError ?? '非法原文边界';
      return false;
    }
    try {
      const mappedAnchor = this.syntaxAwareRawMap(anchor, anchor === head ? affinity : anchor > head ? 'right' : 'left');
      const mappedHead = anchor === head
        ? mappedAnchor
        : this.syntaxAwareRawMap(head, anchor > head ? 'left' : 'right');
      const selection = TextSelection.create(this.state.doc, mappedAnchor.visual, mappedHead.visual);
      this.state = this.state.apply(this.state.tr.setSelection(selection));
      this.rawSelection = { anchor, head, affinity };
      this.projection = {
        ...this.projection,
        anchors: dedupeAnchors([
          ...this.projection.anchors,
          { visual: selection.anchor, raw: anchor, reason: mappedAnchor.note },
          { visual: selection.head, raw: head, reason: mappedHead.note },
        ]),
      };
      this.diagnostic = '';
      return true;
    } catch (error) {
      this.diagnostic = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  setSourceSelection(anchor: number, head = anchor, affinity: Affinity = 'right'): boolean {
    const anchorError = this.boundaryError(this.currentRaw, anchor);
    const headError = this.boundaryError(this.currentRaw, head);
    if (anchorError || headError) {
      this.diagnostic = anchorError ?? headError ?? '非法原文边界';
      return false;
    }
    this.rawSelection = { anchor, head, affinity };
    this.diagnostic = '';
    return true;
  }

  private updateSelectionFromState(state: EditorState): RawSelection {
    const anchor = this.mapVisualEndpoint(state.selection.anchor, state.selection.anchor === state.selection.head ? 'any' : state.selection.anchor < state.selection.head ? 'from' : 'to');
    const head = this.mapVisualEndpoint(state.selection.head, state.selection.anchor === state.selection.head ? 'any' : state.selection.anchor < state.selection.head ? 'to' : 'from');
    return { anchor, head, affinity: this.rawSelection.affinity };
  }

  private beginCompositionGroup(id: unknown): void {
    if (this.compositionGroup?.id === id) return;
    this.finishComposition();
    this.compositionGroup = {
      id,
      before: this.snapshot(),
      past: [...this.past],
      future: [...this.future],
    };
  }

  private compactComposition(): void {
    const group = this.compositionGroup;
    if (!group) return;
    const current = this.snapshot();
    if (sameSnapshot(current, group.before)) {
      this.past = [...group.past];
      this.future = [...group.future];
    } else {
      this.past = [...group.past, group.before];
      this.future = [];
    }
  }

  finishComposition(): void {
    if (!this.compositionGroup) return;
    this.compactComposition();
    this.compositionGroup = null;
  }

  startComposition(): void {
    this.composing = true;
    this.compositionStartRaw = this.currentRaw;
  }

  beginComposition(): void {
    this.startComposition();
  }

  endComposition(): void {
    const changed = this.compositionStartRaw !== undefined &&
      this.compositionStartRaw !== this.currentRaw;
    this.composing = false;
    this.compositionStartRaw = undefined;
    if (!this.compositionGroup) {
      if (changed) this.logicalRevision++;
      return;
    }
    this.compactComposition();
    this.finishComposition();
    if (changed) this.logicalRevision++;
  }

  private accept(raw: string, target: EditorState, patches: NativePatch[], before: Snapshot, reason: string, sourceCaret?: number, mapping?: Transaction['mapping']): void {
    const parsed = this.parseSource(raw);
    const needsAnchorReproof = mapping && this.projection.anchors.some(anchor =>
      patches.some(patch => patch.from < anchor.raw && anchor.raw < patch.to));
    let exactTargetLedger = needsAnchorReproof && !parsed.issues.length && parsed.doc.eq(target.doc)
      ? baseLedger(raw, parsed)
      : undefined;
    this.currentRaw = raw;
    this.issues = parsed.issues;
    const mappedAnchors = this.projection.anchors.map(anchor => {
      const visualResult = mapping?.mapResult(anchor.visual, -1);
      const visual = visualResult?.pos ?? anchor.visual;
      let mappedRaw = mapRawOffset(anchor.raw, patches, -1);
      let rebound = false;
      if (exactTargetLedger && !visualResult?.deletedAcross &&
          patches.some(patch => patch.from < anchor.raw && anchor.raw < patch.to)) {
        const proven = visualToSource(exactTargetLedger, visual, visual, {
          collapsedAffinity: before.rawSelection.affinity,
        });
        if (!proven.ok) throw Error(`owner 改写后的 anchor 无法重证：${proven.reason}`);
        mappedRaw = sourceCaret !== undefined && target.selection.empty &&
          visual === target.selection.head ? sourceCaret : proven.head;
        rebound = true;
      }
      return {
        visual,
        raw: mappedRaw,
        reason: rebound ? `${anchor.reason}；owner 改写后按目标 ledger 重证` :
          visualResult?.deletedAcross ? `${anchor.reason}；替换跨越旧 anchor，绑定左边界` : anchor.reason,
      };
    });
    const oldAnchorCount = mappedAnchors.length;
    const step = target.selection;
    if (sourceCaret !== undefined) mappedAnchors.push({ visual: step.head, raw: sourceCaret, reason });
    const validatedAnchors: ProjectionAnchor[] = [];
    for (const [index, anchor] of mappedAnchors.entries()) {
      if (anchor.visual < 0 || anchor.visual > target.doc.content.size) throw Error(`投影 anchor 的 PM 位置 ${anchor.visual} 越界`);
      const boundaryError = this.boundaryError(raw, anchor.raw);
      if (boundaryError) {
        // A text edit can merge two old graphemes. Retire only a former
        // boundary proven to be inside the same new visible raw/PM unit.
        // Never snap BOM/CRLF/surrogate boundaries or the new caret anchor.
        if (index < oldAnchorCount && !rawCodeUnitBoundaryError(raw, anchor.raw) &&
            !parsed.issues.length && parsed.doc.eq(target.doc)) {
          exactTargetLedger ??= baseLedger(raw, parsed);
          if (exactTargetLedger.spans.some(span =>
            span.visible && span.visualStart !== undefined && span.visualEnd !== undefined &&
            span.sourceStart < anchor.raw && anchor.raw < span.sourceEnd &&
            span.visualStart < anchor.visual && anchor.visual < span.visualEnd)) continue;
        }
        throw Error(`投影 anchor 映射失败：${boundaryError}`);
      }
      validatedAnchors.push(anchor);
    }

    if (parsed.issues.length) {
      this.state = createInkoraProjectionState(parsed.doc, this.options);
      this.rawSelection = { anchor: Math.min(raw.length, sourceCaret ?? patches.at(-1)?.from ?? 0), head: Math.min(raw.length, sourceCaret ?? patches.at(-1)?.from ?? 0), affinity: 'right' };
      this.projection = { kind: 'exact', reason: '含混原文的保守保护投影', anchors: [], provenance: parsed.issues.map(issue => issue.message) };
    } else if (parsed.doc.eq(target.doc)) {
      this.state = target;
      this.projection = { kind: 'exact', reason: '当前原文与 PM 投影精确一致', anchors: dedupeAnchors(validatedAnchors), provenance: [reason] };
      try {
        this.rawSelection = this.updateSelectionFromState(this.state);
      } catch (error) {
        if (sourceCaret === undefined) throw error;
        this.rawSelection = { anchor: sourceCaret, head: sourceCaret, affinity: 'right' };
        if (!this.setRawSelection(sourceCaret, sourceCaret, 'right')) {
          throw Error(`接受后原文 ${sourceCaret} 映射失败：${this.diagnostic}`);
        }
      }
    } else {
      this.state = target;
      this.projection = { kind: 'anchored', reason, anchors: dedupeAnchors(validatedAnchors), provenance: [reason, ...patches.map(patch => `${patch.from}..${patch.to} -> ${JSON.stringify(patch.insert)}`)] };
      this.projectionContext();
      this.rawSelection = this.updateSelectionFromState(this.state);
    }
    if (!this.compositionGroup) { this.past.push(before); this.future = []; }
    this.version++;
    this.unresolvedIntent = null;
    this.diagnostic = '';
  }

  dispatch(transaction: Transaction): boolean {
    const before = this.currentRaw;
    const accepted = this.dispatchTransaction(transaction);
    if (accepted && before !== this.currentRaw && !this.composing) {
      // A composition-tagged transaction outside an active UI composition is
      // a new logical edit, not permission to reopen an already published
      // composition group.
      this.finishComposition();
      this.logicalRevision++;
    }
    return accepted;
  }

  private dispatchTransaction(transaction: Transaction): boolean {
    if (transaction.before !== this.state.doc) {
      this.diagnostic = '过期事务：事务基线不是当前投影';
      this.unresolvedIntent = { description: this.diagnostic };
      return false;
    }
    const compositionId = transaction.getMeta('composition');
    // Selection-only transactions do not start or seal an input history unit.
    if (transaction.docChanged) {
      if (compositionId !== undefined) this.beginCompositionGroup(compositionId);
      else this.finishComposition();
    }
    if (!transaction.docChanged) {
      try {
        const rawSelection = this.updateSelectionFromState(this.state.apply(transaction));
        this.state = this.state.apply(transaction);
        this.rawSelection = rawSelection;
        this.projection = {
          ...this.projection,
          anchors: dedupeAnchors([
            ...this.projection.anchors,
            { visual: this.state.selection.anchor, raw: rawSelection.anchor, reason: '真实 PM 选区移动' },
            { visual: this.state.selection.head, raw: rawSelection.head, reason: '真实 PM 选区移动' },
          ]),
        };
        if (compositionId !== undefined) this.compactComposition();
        return true;
      } catch (error) {
        this.diagnostic = error instanceof Error ? error.message : String(error);
        return false;
      }
    }

    const before = this.snapshot();
    let attemptedRaw: string | undefined;
    try {
      // D fragments are read-only in the visual projection, including a
      // selection covering the whole atom. Only an explicit source commit
      // authorizes removing/changing their raw bytes (GATE-002/GATE-004).
      this.state.doc.descendants((node, pos) => {
        if (!['protected_inline', 'protected_block'].includes(node.type.name)) return;
        const mapped = transaction.mapping.mapResult(pos, 1);
        const after = transaction.doc.nodeAt(mapped.pos);
        if (mapped.deleted || after?.type !== node.type ||
            after.attrs.raw !== node.attrs.raw || after.attrs.kind !== node.attrs.kind) {
          throw Error('保护片段只读；完整删除或改写必须在源码中显式提交');
        }
      });
      let tr = transaction;
      const step = tr.steps[0]?.toJSON() as { stepType?: string; from?: number; to?: number; slice?: { content?: Array<{ text?: string }> } } | undefined;
      const insert = step?.stepType === 'replace' && !(step.slice?.content ?? []).some(node => node.text === undefined)
        ? (step.slice?.content ?? []).map(node => node.text ?? '').join('') : '';
      if (step?.from !== undefined && step.from === step.to && /^ +$/.test(insert)) {
        tr = tr.removeMark(step.from, step.from + insert.length);
      }
      const context = this.projectionContext();
      const plan = planNativeTransaction(this.currentRaw, this.state, context.ranges, tr,
        (position, side = 'any') => {
          try {
            return this.mapVisualEndpoint(position, side);
          } catch (error) {
            throw Error(`事务 PM ${position}/${side} 映射失败：${error instanceof Error ? error.message : String(error)}`);
          }
        }, this.preferredEol);
      attemptedRaw = plan.candidate;
      const target = this.state.apply(tr);
      let sourceCaret = plan.sourceCaret;
      // Only a text replacement proves that the resulting caret belongs at
      // the end of inserted source. Attribute/format patches can be far from
      // the unchanged selection (for example a task marker before its label).
      const textReplacement = step?.stepType === 'replace' &&
        !(step.slice?.content ?? []).some(node => node.text === undefined);
      if (sourceCaret === undefined && plan.patches.length === 1 && textReplacement) {
        sourceCaret = plan.patches[0].from + plan.patches[0].insert.length;
      }
      const parsed = this.parseSource(plan.candidate);
      if (!parsed.issues.length && !parsed.doc.eq(target.doc) && !literalWhitespaceProjection(plan.candidate, parsed, target.doc) && !ownerTrailingWhitespaceProjection(plan.candidate, parsed, target.doc) && !comparableDoc(parsed.doc).eq(comparableDoc(target.doc))) {
        const proof = implicitLinkReprojectionProof(before.raw, context.ledger, plan, parsed, target.doc, tr.mapping)
          ?? semanticReprojectionProof(before.raw, before.state.doc, before.projection, plan, parsed.doc, target.doc);
        if (!proof) throw Error('parser 与 PM 事务的语义差异没有共享字节/意图契约，已原子拒绝');
        const semanticCaret = sourceCaret ?? plan.patches.at(-1)!.from + plan.patches.at(-1)!.insert.length;
        this.currentRaw = plan.candidate;
        this.state = createInkoraProjectionState(parsed.doc, this.options);
        this.projection = {
          kind: 'exact',
          reason: `有界语义投影更新：${plan.kind}`,
          anchors: [],
          provenance: [proof, ...plan.patches.map(patch => `${patch.from}..${patch.to} -> ${JSON.stringify(patch.insert)}`)],
        };
        this.issues = parsed.issues;
        this.rawSelection = { anchor: semanticCaret, head: semanticCaret, affinity: 'right' };
        if (!this.setRawSelection(semanticCaret, semanticCaret, 'right')) throw Error(this.diagnostic);
        if (!this.compositionGroup) { this.past.push(before); this.future = []; }
        this.version++;
        this.unresolvedIntent = null;
        this.diagnostic = '';
        if (compositionId !== undefined) this.compactComposition();
        return true;
      }
      this.accept(plan.candidate, target, plan.patches, before, `PM ${plan.kind}`, sourceCaret, tr.mapping);
      if (compositionId !== undefined) this.compactComposition();
      return true;
    } catch (error) {
      this.restore(before);
      this.diagnostic = error instanceof Error ? error.message : String(error);
      this.unresolvedIntent = { description: this.diagnostic, raw: attemptedRaw };
      if (compositionId !== undefined) this.compactComposition();
      return false;
    }
  }

  replaceVisualText(raw: string, edits: readonly VisualTextEdit[]):
    { ok: true; value: { changed: boolean; replacedCount: number } } |
    { ok: false; message: string } {
    if (raw !== this.currentRaw || !this.saveEligible || this.draft) {
      return { ok: false, message: '文档或输入状态已变化，请重新查找' };
    }
    const before = this.snapshot();
    try {
      const ordered = [...edits].sort((a, b) => b.from - a.from);
      const patches: NativePatch[] = [];
      let replacedCount = 0;
      const { ledger } = this.projectionContext();
      const autolinkGroups = new Map<number, {
        owner: SourceLedger['links'][number];
        labelPatches: NativePatch[];
        emitted: Set<NativePatch>;
      }>();
      const boundaries = new Set<number>([0, raw.length]);
      for (const part of segmenter.segment(raw)) {
        boundaries.add(part.index);
        boundaries.add(part.index + part.segment.length);
      }
      let transaction = this.state.tr;
      let previousVisualFrom = this.state.doc.content.size + 1;
      const selectedEdit = edits.find(edit =>
        Math.min(this.state.selection.anchor, this.state.selection.head) === edit.from &&
        Math.max(this.state.selection.anchor, this.state.selection.head) === edit.to);
      let previousFrom = this.state.doc.content.size + 1;
      for (const edit of ordered) {
        if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < 0 ||
            edit.to <= edit.from || edit.to > previousFrom || edit.to > this.state.doc.content.size ||
            !isWellFormed(edit.insert) || /\r(?!\n)/.test(edit.insert)) {
          throw Error('替换范围、顺序或Unicode无效，整批未应用');
        }
        previousFrom = edit.from;
        const expected = this.state.doc.textBetween(edit.from, edit.to, '', node =>
          node.type.name === 'hard_break' ? '\n' : node.textContent);
        if (expected !== edit.expected) throw Error('替换目标已变化，整批未应用');
        if (edit.insert === expected) continue;
        replacedCount++;
        const from = this.mapVisualEndpoint(edit.from, 'from', ledger);
        const to = this.mapVisualEndpoint(edit.to, 'to', ledger);
        if (from > to || rawBoundaryError(raw, from, boundaries) || rawBoundaryError(raw, to, boundaries)) {
          throw Error('替换目标没有安全原文边界，整批未应用');
        }
        const start = this.state.doc.resolve(edit.from);
        const marks = start.nodeAfter?.marks ?? start.marks();
        const owned = planVisualReplacementPatch(raw, ledger, edit, from, to, marks);
        if (owned.visualTo > previousVisualFrom ||
            this.state.doc.textBetween(edit.to, owned.visualTo, '') !==
              owned.visualInsert.slice(edit.insert.length)) {
          throw Error('替换owner的可视范围重叠或与原文不一致，整批未应用');
        }
        previousVisualFrom = owned.visualFrom;
        transaction = transaction.replaceWith(owned.visualFrom, owned.visualTo,
          owned.visualInsert ? schema.text(owned.visualInsert, owned.marks) : []);
        const eol = raw.slice(from).match(/\r\n|\n/)?.[0] ?? this.preferredEol;
        const patch = { from: owned.from, to: owned.to, insert: owned.insert.replace(/\r\n|\n/g, eol) };
        patches.push(patch);
        const autolink = ledger.links.find(owner => owner.kind === 'autolink' &&
          edit.from >= owner.visual.from && edit.to <= owner.visual.to);
        if (autolink) {
          let group = autolinkGroups.get(autolink.source.from);
          if (!group) {
            group = { owner: autolink, labelPatches: [], emitted: new Set() };
            autolinkGroups.set(autolink.source.from, group);
          }
          group.labelPatches.push({
            from: from - autolink.labelMarkupSource.from,
            to: to - autolink.labelMarkupSource.from,
            insert: edit.insert,
          });
          group.emitted.add(patch);
        }
      }
      if (!patches.length) return { ok: true, value: { changed: false, replacedCount: 0 } };
      for (const { owner, labelPatches, emitted } of autolinkGroups.values()) {
        if (labelPatches.length < 2) continue;
        const label = applyNativePatches(
          raw.slice(owner.labelMarkupSource.from, owner.labelMarkupSource.to), labelPatches,
        );
        for (let index = patches.length - 1; index >= 0; index--) {
          if (emitted.has(patches[index]!)) patches.splice(index, 1);
        }
        patches.push({ from: owner.source.from, to: owner.source.to,
          insert: renderAutolinkLabel(raw, owner, label) });
      }
      // A code owner may contain several matches. Rebuild only its exact raw
      // span once, retaining untouched body bytes while growing delimiters.
      const codeOpens = ledger.spans.filter(span => span.syntax === 'code-open');
      for (const open of codeOpens) {
        const close = ledger.spans.filter(span => span.syntax === 'code-close' && span.sourceStart >= open.sourceEnd)
          .sort((a, b) => a.sourceStart - b.sourceStart)[0];
        if (!close) throw Error('行内代码缺少闭合原文owner');
        const contained = patches.filter(patch => patch.from >= open.sourceEnd && patch.to <= close.sourceStart);
        if (!contained.length) continue;
        let inner = applyNativePatches(raw.slice(open.sourceEnd, close.sourceStart), contained.map(patch => ({
          ...patch, from: patch.from - open.sourceEnd, to: patch.to - open.sourceEnd,
        })));
        const hasPadding = ledger.spans.some(span => span.syntax === 'code-padding' &&
          span.sourceStart === open.sourceEnd && span.sourceEnd === open.sourceEnd + 1);
        if (hasPadding && !/[^ ]/.test(inner.slice(1, -1))) inner = inner.slice(1, -1);
        else if (!hasPadding && (inner.startsWith('`') || inner.endsWith('`') ||
          (inner.startsWith(' ') && inner.endsWith(' ') && /[^ ]/.test(inner)))) inner = ` ${inner} `;
        const runs = [...inner.matchAll(/`+/g)].map(match => match[0].length);
        const delimiter = '`'.repeat(Math.max(open.sourceEnd - open.sourceStart, ...runs.map(width => width + 1)));
        for (let i = patches.length - 1; i >= 0; i--) {
          if (contained.includes(patches[i])) patches.splice(i, 1);
        }
        patches.push({ from: open.sourceStart, to: close.sourceEnd,
          insert: inner.length ? `${delimiter}${inner}${delimiter}` : '' });
      }
      patches.sort((a, b) => b.from - a.from || b.to - a.to);
      for (let index = 1; index < patches.length; index++) {
        if (patches[index].to > patches[index - 1].from) throw Error('原文owner范围重叠，整批未应用');
      }
      const candidate = applyNativePatches(raw, patches);
      if (selectedEdit) {
        transaction = transaction.setSelection(TextSelection.create(
          transaction.doc,
          transaction.mapping.map(selectedEdit.from, -1) + selectedEdit.insert.length,
        ));
      }
      const target = this.state.apply(transaction);
      const parsed = this.parseSource(candidate);
      if (parsed.issues.length || !parsed.doc.eq(target.doc)) {
        throw Error('替换候选与可视意图不一致，整批未应用');
      }
      let sourceCaret: number | undefined;
      if (selectedEdit) {
        const acceptedSelection = visualToSource(
          baseLedger(candidate, parsed),
          target.selection.head,
          target.selection.head,
          { collapsedAffinity: 'left' },
        );
        if (!acceptedSelection.ok) {
          throw Error(`替换后的光标没有安全原文位置：${acceptedSelection.reason}`);
        }
        sourceCaret = acceptedSelection.head;
      }
      this.finishComposition();
      this.accept(candidate, target, patches, before, '整批可视文字替换', sourceCaret, transaction.mapping);
      this.logicalRevision++;
      return { ok: true, value: { changed: true, replacedCount } };
    } catch (error) {
      this.restore(before);
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  nativeType(text: string, compositionId?: unknown): boolean {
    let tr = this.state.tr.insertText(text);
    if (compositionId !== undefined) tr = tr.setMeta('composition', compositionId);
    return this.dispatch(tr);
  }

  nativeReplace(from: number, to: number, text: string, compositionId?: unknown): boolean {
    let tr = this.state.tr.insertText(text, from, to);
    if (compositionId !== undefined) tr = tr.setMeta('composition', compositionId);
    return this.dispatch(tr);
  }

  nativeEnter(): boolean {
    if (this.composing) return this.guard('Enter');
    this.finishComposition();
    const caret = this.rawSelection.head;
    const eol = eolAt(this.currentRaw, caret);
    const insert = eol + eol;
    const before = this.snapshot();
    const raw = this.currentRaw.slice(0, caret) + insert + this.currentRaw.slice(caret);
    const transaction = this.state.tr.split(this.state.selection.from);
    const target = this.state.apply(transaction);
    try {
      this.accept(raw, target, [{ from: caret, to: caret, insert }], before, '真实 EditorView Enter 拆段', caret + insert.length, transaction.mapping);
      this.logicalRevision++;
      return true;
    } catch (error) {
      this.restore(before);
      this.diagnostic = error instanceof Error ? error.message : String(error);
      this.unresolvedIntent = { description: this.diagnostic, raw: insert };
      return false;
    }
  }

  nativeBackspace(): boolean {
    if (this.composing) return this.guard('Backspace');
    this.finishComposition();
    if (!this.state.selection.empty) return this.nativeType('');
    const caret = this.rawSelection.head;
    if (caret <= (this.currentRaw.startsWith('\uFEFF') ? 1 : 0)) return false;
    let from = caret - 1;
    if (from > 0 && this.currentRaw[from] === '\n' && this.currentRaw[from - 1] === '\r') from--;
    const part = [...segmenter.segment(this.currentRaw.slice(0, caret))].at(-1);
    if (part) from = part.index;
    const before = this.snapshot();
    const raw = this.currentRaw.slice(0, from) + this.currentRaw.slice(caret);
    const parsed = this.parseSource(raw);
    this.currentRaw = raw;
    this.state = createInkoraProjectionState(parsed.doc, this.options);
    this.issues = parsed.issues;
    this.projection = { kind: 'exact', reason: '真实 Backspace 原文边界删除', anchors: [], provenance: [`${from}..${caret}`] };
    this.rawSelection = { anchor: from, head: from, affinity: 'right' };
    if (!this.setRawSelection(from, from, 'right')) { this.restore(before); return false; }
    this.past.push(before); this.future = []; this.version++;
    this.logicalRevision++;
    this.unresolvedIntent = null; this.diagnostic = '';
    return true;
  }

  insertImage(value: ManagedImageInsertion): boolean {
    if (this.composing) return this.guard('image_import');
    if (this.draftDirty || this.issues.length || this.unresolvedIntent) {
      this.diagnostic = '源码草稿、含混原文或未解决输入存在；图片已由原生保留但不能应用到当前原文';
      return false;
    }
    this.finishComposition();
    const before = this.snapshot();
    try {
      const image = markdownImage(value);
      const from = Math.min(this.rawSelection.anchor, this.rawSelection.head);
      const to = Math.max(this.rawSelection.anchor, this.rawSelection.head);
      const raw = this.currentRaw.slice(0, from) + image + this.currentRaw.slice(to);
      const parsed = this.parseSource(raw);
      if (parsed.issues.length) throw Error(parsed.issues[0].message);
      this.currentRaw = raw;
      this.state = createInkoraProjectionState(parsed.doc, this.options);
      this.issues = [];
      this.projection = {
        kind: 'exact',
        reason: '原生确认资源后应用图片原文事务',
        anchors: [],
        provenance: [`managed image ${from}..${to} -> ${value.uri}`],
      };
      const caret = from + image.length;
      this.rawSelection = { anchor: caret, head: caret, affinity: 'right' };
      if (!this.setRawSelection(caret, caret, 'right')) throw Error(this.diagnostic);
      this.past.push(before);
      if (value.assetID) this.managedImageOwners.set(value.assetID, value.uri);
      this.future = [];
      this.version++;
      this.logicalRevision++;
      this.unresolvedIntent = null;
      this.diagnostic = '';
      return true;
    } catch (error) {
      this.restore(before);
      this.diagnostic = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  rewriteManagedImages(rewrites: readonly ManagedImageRewrite[]): boolean {
    if (this.composing) return this.guard('image_save_prepare');
    if (!rewrites.length || this.draftDirty || this.issues.length || this.unresolvedIntent) {
      this.diagnostic = '当前源码草稿、含混原文或未解决输入阻止图片保存路径准备';
      return false;
    }
    this.finishComposition();
    const before = this.snapshot();
    try {
      const patches: NativePatch[] = [];
      const acceptedOwners = new Map<string, string>();
      const seenAssets = new Set<string>();
      for (const rewrite of rewrites) {
        if (!rewrite.assetID || seenAssets.has(rewrite.assetID)) throw Error('图片保存映射包含重复 asset owner');
        seenAssets.add(rewrite.assetID);
        markdownImage({ uri: rewrite.to, alt: '', title: null });
        const currentOwner = this.managedImageOwners.get(rewrite.assetID) ?? rewrite.from;
        const hits: number[] = [];
        for (let at = this.currentRaw.indexOf(currentOwner); at >= 0;
          at = this.currentRaw.indexOf(currentOwner, at + currentOwner.length)) hits.push(at);
        if (hits.length !== 1) throw Error(`图片草稿 owner ${rewrite.assetID} 不是唯一当前原文引用`);
        let imageAtoms = 0;
        this.state.doc.descendants(node => {
          if (node.type.name === 'image' && node.attrs.href === currentOwner) imageAtoms++;
        });
        if (imageAtoms !== 1) {
          throw Error(`图片草稿 owner ${rewrite.assetID} 不再对应唯一图片 atom`);
        }
        const from = hits[0];
        if (this.currentRaw.slice(Math.max(0, from - 2), from) !== '](') {
          throw Error(`图片草稿 owner ${rewrite.assetID} 不在行内图片 destination 边界`);
        }
        acceptedOwners.set(rewrite.assetID, rewrite.to);
        if (currentOwner !== rewrite.to) {
          patches.push({ from, to: from + currentOwner.length, insert: rewrite.to });
        }
      }
      if (!patches.length) {
        for (const [assetID, owner] of acceptedOwners) this.managedImageOwners.set(assetID, owner);
        this.diagnostic = '';
        return true;
      }
      const raw = applyNativePatches(this.currentRaw, patches);
      const parsed = this.parseSource(raw);
      if (parsed.issues.length) throw Error(parsed.issues[0].message);
      const mappedAnchor = mapRawOffset(this.rawSelection.anchor, patches, -1);
      const mappedHead = mapRawOffset(this.rawSelection.head, patches, 1);
      this.currentRaw = raw;
      this.state = createInkoraProjectionState(parsed.doc, this.options);
      this.issues = [];
      this.projection = {
        kind: 'exact',
        reason: '首次保存前图片 owner 路径准备事务',
        anchors: [],
        provenance: patches.map(patch => `${patch.from}..${patch.to} -> ${patch.insert}`),
      };
      this.rawSelection = { anchor: mappedAnchor, head: mappedHead, affinity: this.rawSelection.affinity };
      if (!this.setRawSelection(mappedAnchor, mappedHead, this.rawSelection.affinity)) {
        throw Error(this.diagnostic);
      }
      this.past.push(before);
      for (const [assetID, owner] of acceptedOwners) this.managedImageOwners.set(assetID, owner);
      this.future = [];
      this.version++;
      this.logicalRevision++;
      this.unresolvedIntent = null;
      this.diagnostic = '';
      return true;
    } catch (error) {
      this.restore(before);
      this.diagnostic = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private guard(command: string): false {
    this.diagnostic = `composition 期间拒绝 ${command}；内容、选区、历史与版本未改变`;
    return false;
  }

  beginSource(): boolean {
    if (this.composing) return this.guard('source_enter');
    this.finishComposition();
    if (this.draft) return true;
    this.draft = { raw: this.currentRaw, selection: cloneSelection(this.rawSelection) };
    return true;
  }

  updateDraft(raw: string, selection = this.draft?.selection): boolean {
    if (!this.draft || !selection) return false;
    this.draft = { raw, selection: cloneSelection(selection) };
    return true;
  }

  cancelSource(): boolean {
    if (this.composing) return this.guard('source_cancel');
    if (!this.draft) return true;
    this.draft = null;
    return true;
  }

  private recordSourceCommit(): void {
    this.sourceCommit = { raw: this.currentRaw, doc: this.state.doc, epoch: this.epoch };
  }

  applySource(): boolean {
    if (this.composing) return this.guard('source_apply');
    if (!this.draft) return false;
    const draft = this.draft;
    if (!isWellFormed(draft.raw)) {
      this.diagnostic = '源码草稿含无效 Unicode，无法无损编码为 UTF-8；草稿已保留';
      return false;
    }
    if (/\r(?!\n)/.test(draft.raw)) {
      this.diagnostic = '源码草稿含 bare CR，须先显式转换换行；草稿已保留';
      return false;
    }
    if (draft.raw === this.currentRaw) {
      this.recordSourceCommit();
      this.draft = null;
      return true;
    }
    const anchorError = this.boundaryError(draft.raw, draft.selection.anchor);
    const headError = this.boundaryError(draft.raw, draft.selection.head);
    if (anchorError || headError) { this.diagnostic = anchorError ?? headError ?? '非法源码选区'; return false; }
    const before = this.snapshot();
    try {
      const parsed = this.parseSource(draft.raw);
      const firstEol = draft.raw.match(/\r\n|\n/)?.[0];
      if (firstEol) this.preferredEol = firstEol === '\r\n' ? '\r\n' : '\n';
      this.currentRaw = draft.raw;
      this.state = createInkoraProjectionState(parsed.doc, this.options);
      this.issues = parsed.issues;
      this.projection = { kind: 'exact', reason: '主动源码提交后重新建立投影', anchors: [], provenance: ['source apply'] };
      this.rawSelection = cloneSelection(draft.selection);
      this.draft = null;
      if (!parsed.issues.length && !this.setRawSelection(
        draft.selection.anchor,
        draft.selection.head,
        draft.selection.affinity,
      )) {
        // 源码模式可以接受保护片段内部的精确原文选区；该选区没有可视
        // 对应时保留原文位置，回到可视模式后使用可信投影默认选区。
        this.rawSelection = cloneSelection(draft.selection);
        this.diagnostic = '';
      }
      this.past.push(before); this.future = []; this.version++;
      this.logicalRevision++;
      this.recordSourceCommit();
      this.unresolvedIntent = null; this.diagnostic = '';
      return true;
    } catch (error) {
      this.restore(before);
      this.draft = draft;
      this.diagnostic = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  saveMemory(): boolean {
    if (this.composing) return this.guard('save');
    this.finishComposition();
    if (!this.saveEligible) { this.diagnostic ||= '当前投影、草稿或未解决意图不具备保存资格'; return false; }
    this.savedRaw = this.currentRaw;
    return true;
  }

  markSaved(raw: string): void {
    this.savedRaw = raw;
  }

  undo(): boolean {
    if (this.composing) return this.guard('undo');
    if (this.draftDirty) { this.diagnostic = '源码草稿尚未提交，拒绝 Undo；草稿、原文、历史与选区保持不变'; return false; }
    this.finishComposition();
    const previous = this.past.at(-1);
    if (!previous) return false;
    const current = this.snapshot();
    this.past.pop(); this.future.push(current); this.restore(previous);
    this.version++; this.unresolvedIntent = null; this.diagnostic = '';
    this.logicalRevision++;
    return true;
  }

  redo(): boolean {
    if (this.composing) return this.guard('redo');
    if (this.draftDirty) { this.diagnostic = '源码草稿尚未提交，拒绝 Redo；草稿、原文、历史与选区保持不变'; return false; }
    this.finishComposition();
    const next = this.future.at(-1);
    if (!next) return false;
    const current = this.snapshot();
    this.future.pop(); this.past.push(current); this.restore(next);
    this.version++; this.unresolvedIntent = null; this.diagnostic = '';
    this.logicalRevision++;
    return true;
  }

  reopen(raw: string, selection?: RawSelection): boolean {
    if (this.composing) return this.guard('reset');
    this.finishComposition();
    // Equal bytes in a new document epoch cannot reuse the old PM identity:
    // transactions retained by an old view must fail the baseline guard.
    this.parsedSourceCache = null;
    this.projectionContextCache = null;
    this.rawBoundaryCache = null;
    const parsed = this.parseSource(raw);
    this.currentRaw = raw; this.savedRaw = raw;
    this.sourceCommit = null;
    this.managedImageOwners.clear();
    this.preferredEol = raw.match(/\r\n|\n/)?.[0] === '\r\n' ? '\r\n' : '\n';
    this.state = createInkoraProjectionState(parsed.doc, this.options); this.issues = parsed.issues;
    this.projection = { kind: 'exact', reason: 'scratch UTF-8 重开新 epoch', anchors: [], provenance: ['new epoch'] };
    this.past = []; this.future = []; this.draft = null; this.unresolvedIntent = null; this.diagnostic = '';
    this.version = 0; this.epoch++;
    this.logicalRevision = 0;
    const start = raw.startsWith('\uFEFF') ? 1 : 0;
    this.rawSelection = { anchor: start, head: start, affinity: 'right' };
    return selection ? this.setRawSelection(selection.anchor, selection.head, selection.affinity) : true;
  }

  semanticBreak(): 'softbreak' | 'hardbreak' | 'none' {
    let hard = false;
    this.state.doc.descendants(node => { if (node.type.name === 'hard_break') hard = true; });
    if (hard) return 'hardbreak';
    return this.state.doc.textContent.includes('\n') ? 'softbreak' : 'none';
  }

  stateReport(): Record<string, unknown> {
    return {
      epoch: this.epoch,
      currentRaw: this.currentRaw,
      savedRaw: this.savedRaw,
      projection: this.projection,
      rawSelection: this.rawSelection,
      visualSelection: this.state.selection.toJSON(),
      version: this.version,
      undo: this.past.length,
      redo: this.future.length,
      documentDirty: this.documentDirty,
      draftDirty: this.draftDirty,
      saveEligible: this.saveEligible,
      sourceAccessible: this.sourceAccessible,
      issues: this.issues,
      unresolvedIntent: this.unresolvedIntent,
      diagnostic: this.diagnostic,
      composing: this.composing,
      semanticBreak: this.semanticBreak(),
    };
  }
}

export { applyNativePatches, rawBoundaryError };

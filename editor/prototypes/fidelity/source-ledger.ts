// PROTOTYPE (INK-PROT-019): auditable lexical source ownership for inline text.
//
// This module is deliberately independent from FidelityModel and the DOM. It
// consumes only the canonical Markdown string, the PM document produced from
// that string, and model.ts's top-level ranges. All coordinates are UTF-16.

import MarkdownIt, { type Token } from 'markdown-it';
import type { Node as PMNode } from 'prosemirror-model';
import type { Range } from './model';

export type SourceRole =
  | 'text' | 'link-label' | 'image-alt' | 'autolink-text' | 'code-text'
  | 'delimiter' | 'href' | 'title' | 'reference-label'
  | 'definition-label' | 'definition-href' | 'definition-title'
  | 'block-prefix' | 'block-suffix' | 'line-ending' | 'gap'
  | 'protected';

export type LedgerSpan = {
  sourceStart: number;
  sourceEnd: number;
  role: SourceRole;
  syntax: string;
  visible: boolean;
  text?: string;
  visualStart?: number;
  visualEnd?: number;
  owner?: string;
  detail?: string;
};

export type LedgerBlock = {
  range: Range;
  spans: LedgerSpan[];
  visualText: string;
  inlineCount: number;
};

export type LedgerDiagnostic = {
  code: string;
  message: string;
  sourceStart?: number;
  sourceEnd?: number;
};

export type SourceLedger = {
  sourceLength: number;
  docSize: number;
  blocks: LedgerBlock[];
  spans: LedgerSpan[];
  diagnostics: LedgerDiagnostic[];
};

export type BuildLedgerResult =
  | { ok: true; ledger: SourceLedger }
  | { ok: false; reason: string; diagnostics: LedgerDiagnostic[] };

export type MapOptions = {
  snap?: 'none' | 'nearest';
  collapsedAffinity?: 'left' | 'right';
};

export type LedgerMapResult =
  | { ok: true; anchor: number; head: number; snapped: string[] }
  | { ok: false; reason: string; candidates?: number[] };

type RawUnit = { start: number; end: number };
type InlineInput = { text: string; units: RawUnit[] };
type Atom = LedgerSpan & { visible: true; text: string };
type ReferenceDefinition = {
  key: string;
  href: string;
  title: string | null;
  spans: LedgerSpan[];
};
type LinkExpectation = {
  owner: string;
  mark: 'link' | 'image_ref';
  href: string;
  title: string | null;
};
type ScanState = {
  spans: LedgerSpan[];
  atoms: Atom[];
  expectations: LinkExpectation[];
  references: Map<string, ReferenceDefinition>;
  ownerSerial: number;
};
type TextLeaf = {
  start: number;
  end: number;
  text: string;
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[];
};

const markdown = new MarkdownIt('commonmark', {
  breaks: false,
  html: false,
  linkify: false,
}).enable(['table', 'strikethrough']);

const ESCAPABLE = new Set('\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'.split(''));
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function diagnostic(code: string, message: string, start?: number, end?: number): LedgerDiagnostic {
  return { code, message, sourceStart: start, sourceEnd: end };
}

function fail(reason: string, diagnostics: LedgerDiagnostic[] = []): BuildLedgerResult {
  return { ok: false, reason, diagnostics: diagnostics.length ? diagnostics : [diagnostic('ledger_build_failed', reason)] };
}

function normalizeReference(label: string): string {
  return markdown.utils.normalizeReference(label);
}

function addHidden(state: ScanState, input: InlineInput, from: number, to: number, role: SourceRole, syntax: string, owner?: string, detail?: string): void {
  if (to <= from) return;
  const first = input.units[from];
  const last = input.units[to - 1];
  if (!first || !last) throw Error(`词法范围 ${from}..${to} 越界`);
  state.spans.push({ sourceStart: first.start, sourceEnd: last.end, role, syntax, visible: false, owner, detail });
}

function addAtom(state: ScanState, input: InlineInput, from: number, to: number, text: string, role: SourceRole, syntax: string, owner?: string, detail?: string): void {
  if (to <= from) throw Error(`可视词法范围 ${from}..${to} 为空`);
  const first = input.units[from];
  const last = input.units[to - 1];
  if (!first || !last) throw Error(`可视词法范围 ${from}..${to} 越界`);
  const atom: Atom = { sourceStart: first.start, sourceEnd: last.end, role, syntax, visible: true, text, owner, detail };
  state.spans.push(atom);
  state.atoms.push(atom);
}

function addDecodedAtom(state: ScanState, input: InlineInput, from: number, to: number, text: string, role: SourceRole, syntax: string, owner?: string): void {
  // A decoded entity can expand to several graphemes. The whole decoded value
  // is one indivisible source atom because no interior raw boundary exists.
  addAtom(state, input, from, to, text, role, syntax, owner, '仅原文 span 两端是合法映射边界');
}

function scanPlain(state: ScanState, input: InlineInput, from: number, to: number, role: SourceRole, syntax: string, owner?: string): void {
  const text = input.text.slice(from, to);
  for (const part of segmenter.segment(text)) {
    const start = from + part.index;
    addAtom(state, input, start, start + part.segment.length, part.segment, role, syntax, owner,
      part.segment.length > 1 ? 'grapheme 内部 UTF-16 位置不映射' : undefined);
  }
}

function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '[') depth++;
    if (text[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

function delimiterAt(text: string, start: number, delimiter: string): number {
  for (let at = text.indexOf(delimiter, start); at >= 0; at = text.indexOf(delimiter, at + 1)) {
    let slashes = 0;
    for (let i = at - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
    if (slashes % 2 === 0) return at;
  }
  return -1;
}

function scanLinkTail(text: string, pos: number): { end: number; hrefStart: number; hrefEnd: number; titleStart?: number; titleEnd?: number; href: string; title: string | null } | undefined {
  if (text[pos] !== '(') return undefined;
  let cursor = pos + 1;
  while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  const helper = markdown.helpers.parseLinkDestination(text, cursor, text.length);
  if (!helper.ok) return undefined;
  const hrefStart = cursor;
  const hrefEnd = helper.pos;
  cursor = helper.pos;
  const spaceStart = cursor;
  while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  let titleStart: number | undefined;
  let titleEnd: number | undefined;
  let title: string | null = null;
  if (cursor > spaceStart) {
    const parsedTitle = markdown.helpers.parseLinkTitle(text, cursor, text.length);
    if (parsedTitle.ok) {
      titleStart = cursor;
      titleEnd = parsedTitle.pos;
      title = parsedTitle.str;
      cursor = parsedTitle.pos;
      while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
    }
  }
  if (text[cursor] !== ')') return undefined;
  const href = markdown.normalizeLink(helper.str);
  if (!markdown.validateLink(href)) return undefined;
  return { end: cursor + 1, hrefStart, hrefEnd, titleStart, titleEnd, href, title };
}

function scanInline(state: ScanState, input: InlineInput, from = 0, to = input.text.length, role: SourceRole = 'text', owner?: string): void {
  const text = input.text;
  let i = from;
  while (i < to) {
    // Escapes are owned by one displayed grapheme, never by a search for the
    // decoded character elsewhere in the block.
    if (text[i] === '\\' && i + 1 < to && ESCAPABLE.has(text[i + 1])) {
      addDecodedAtom(state, input, i, i + 2, text[i + 1], role, 'escape', owner);
      i += 2;
      continue;
    }

    // CommonMark entities decode once. &amp;amp; therefore displays &amp;:
    // the first '&' owns &amp;, while the following "amp;" remains literal.
    if (text[i] === '&') {
      const entity = text.slice(i, to).match(/^(?:&#(?:x[a-f0-9]{1,6}|[0-9]{1,7});|&[a-z][a-z0-9]{1,31};)/i)?.[0];
      if (entity) {
        const decoded = markdown.utils.unescapeAll(entity);
        if (decoded !== entity) {
          addDecodedAtom(state, input, i, i + entity.length, decoded, role, 'entity', owner);
          i += entity.length;
          continue;
        }
      }
    }

    // Code spans use exact delimiter runs and CommonMark's newline/outer-space
    // normalization. Removed padding is retained as non-visible ledger spans.
    if (text[i] === '`') {
      let openerEnd = i + 1;
      while (openerEnd < to && text[openerEnd] === '`') openerEnd++;
      const marker = text.slice(i, openerEnd);
      const close = delimiterAt(text, openerEnd, marker);
      if (close >= 0 && close < to) {
        addHidden(state, input, i, openerEnd, 'delimiter', 'code-open', owner);
        let contentStart = openerEnd;
        let contentEnd = close;
        const inner = text.slice(contentStart, contentEnd);
        if (inner.startsWith(' ') && inner.endsWith(' ') && /[^ ]/.test(inner)) {
          addHidden(state, input, contentStart, contentStart + 1, 'delimiter', 'code-padding', owner);
          addHidden(state, input, contentEnd - 1, contentEnd, 'delimiter', 'code-padding', owner);
          contentStart++;
          contentEnd--;
        }
        for (let p = contentStart; p < contentEnd; ) {
          if (text[p] === '\n') {
            addAtom(state, input, p, p + 1, ' ', 'code-text', 'code-newline', owner, '源码换行按 CommonMark 显示为空格');
            p++;
            continue;
          }
          const part = segmenter.segment(text.slice(p, contentEnd))[Symbol.iterator]().next().value as Intl.SegmentData | undefined;
          if (!part) break;
          addAtom(state, input, p, p + part.segment.length, part.segment, 'code-text', 'code', owner,
            part.segment.length > 1 ? 'grapheme 内部 UTF-16 位置不映射' : undefined);
          p += part.segment.length;
        }
        addHidden(state, input, close, close + marker.length, 'delimiter', 'code-close', owner);
        i = close + marker.length;
        continue;
      }
    }

    // Inline image/link. Bracket ownership is lexical; destination text can
    // equal adjacent body text without becoming a mapping candidate.
    const image = text[i] === '!' && text[i + 1] === '[';
    if (image || text[i] === '[') {
      const bracket = image ? i + 1 : i;
      const labelEnd = closingBracket(text, bracket);
      if (labelEnd >= 0 && labelEnd < to) {
        let end = labelEnd + 1;
        let href = '';
        let title: string | null = null;
        let resolved = false;
        let referenceStart: number | undefined;
        let referenceEnd: number | undefined;
        const tail = scanLinkTail(text, end);
        if (tail && tail.end <= to) {
          end = tail.end;
          href = tail.href;
          title = tail.title;
          resolved = true;
        } else {
          let rawReference: string | undefined;
          if (text[end] === '[') {
            const refEnd = closingBracket(text, end);
            if (refEnd >= 0 && refEnd < to) {
              referenceStart = end;
              referenceEnd = refEnd + 1;
              rawReference = text.slice(end + 1, refEnd) || text.slice(bracket + 1, labelEnd);
              end = refEnd + 1;
            }
          } else {
            rawReference = text.slice(bracket + 1, labelEnd);
          }
          const definition = rawReference === undefined ? undefined : state.references.get(normalizeReference(rawReference));
          if (definition) {
            href = definition.href;
            title = definition.title;
            resolved = true;
          }
        }
        if (resolved) {
          const linkOwner = `inline-${++state.ownerSerial}`;
          state.expectations.push({ owner: linkOwner, mark: image ? 'image_ref' : 'link', href, title });
          if (image) addHidden(state, input, i, i + 1, 'delimiter', 'image-marker', linkOwner);
          addHidden(state, input, bracket, bracket + 1, 'delimiter', image ? 'image-alt-open' : 'link-label-open', linkOwner);
          scanInline(state, input, bracket + 1, labelEnd, image ? 'image-alt' : 'link-label', linkOwner);
          addHidden(state, input, labelEnd, labelEnd + 1, 'delimiter', image ? 'image-alt-close' : 'link-label-close', linkOwner);
          if (tail) {
            addHidden(state, input, labelEnd + 1, tail.hrefStart, 'delimiter', 'inline-link-open', linkOwner);
            addHidden(state, input, tail.hrefStart, tail.hrefEnd, 'href', 'inline-href', linkOwner, href);
            if (tail.titleStart !== undefined && tail.titleEnd !== undefined) {
              addHidden(state, input, tail.hrefEnd, tail.titleStart, 'delimiter', 'inline-link-separator', linkOwner);
              addHidden(state, input, tail.titleStart, tail.titleEnd, 'title', 'inline-title', linkOwner, title ?? undefined);
              addHidden(state, input, tail.titleEnd, tail.end - 1, 'delimiter', 'inline-link-space', linkOwner);
            } else addHidden(state, input, tail.hrefEnd, tail.end - 1, 'delimiter', 'inline-link-space', linkOwner);
            addHidden(state, input, tail.end - 1, tail.end, 'delimiter', 'inline-link-close', linkOwner);
          } else if (referenceStart !== undefined && referenceEnd !== undefined) {
            addHidden(state, input, referenceStart, referenceStart + 1, 'delimiter', 'reference-open', linkOwner);
            addHidden(state, input, referenceStart + 1, referenceEnd - 1, 'reference-label', 'reference-label', linkOwner);
            addHidden(state, input, referenceEnd - 1, referenceEnd, 'delimiter', 'reference-close', linkOwner);
          }
          i = end;
          continue;
        }
      }
    }

    // Autolinks are deliberately limited to forms whose visible value is the
    // literal value between angle brackets. Any normalization difference is a
    // safe build failure later when PM text is compared.
    if (text[i] === '<') {
      const close = delimiterAt(text, i + 1, '>');
      if (close > i + 1 && close < to) {
        const value = text.slice(i + 1, close);
        if (/^[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\x00-\x20]*$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          const href = markdown.normalizeLink(value.includes('@') && !value.includes(':') ? `mailto:${value}` : value);
          const visible = markdown.normalizeLinkText(value);
          const linkOwner = `inline-${++state.ownerSerial}`;
          state.expectations.push({ owner: linkOwner, mark: 'link', href, title: null });
          addHidden(state, input, i, i + 1, 'delimiter', 'autolink-open', linkOwner);
          if (visible !== value) throw Error(`尖括号链接 ${JSON.stringify(value)} 发生显示规范化，当前账本明确拒绝`);
          scanPlain(state, input, i + 1, close, 'autolink-text', 'autolink', linkOwner);
          addHidden(state, input, close, close + 1, 'delimiter', 'autolink-close', linkOwner);
          i = close + 1;
          continue;
        }
      }
    }

    // Supported mark delimiters. This is intentionally conservative: a form
    // not proven here remains literal or fails PM projection validation.
    const marks = ['**', '__', '~~', '*', '_'];
    const marker = marks.find(candidate => text.startsWith(candidate, i));
    if (marker) {
      const close = delimiterAt(text, i + marker.length, marker);
      if (close > i + marker.length && close < to) {
        addHidden(state, input, i, i + marker.length, 'delimiter', marker === '~~' ? 'strike-open' : marker.length === 2 ? 'strong-open' : 'em-open', owner);
        scanInline(state, input, i + marker.length, close, role, owner);
        addHidden(state, input, close, close + marker.length, 'delimiter', marker === '~~' ? 'strike-close' : marker.length === 2 ? 'strong-close' : 'em-close', owner);
        i = close + marker.length;
        continue;
      }
    }

    if (text[i] === '\n') {
      addAtom(state, input, i, i + 1, '\n', role, 'softbreak', owner);
      i++;
      continue;
    }

    // Accumulate only until the next possible syntax character; scanPlain then
    // creates grapheme atoms and forbids surrogate/combining interior offsets.
    let end = i + 1;
    while (end < to && !'\\&`![<*_~\n'.includes(text[end])) end++;
    scanPlain(state, input, i, end, role, 'literal', owner);
    i = end;
  }
}

function lineTable(source: string): Array<{ start: number; contentEnd: number; end: number; text: string }> {
  const lines: Array<{ start: number; contentEnd: number; end: number; text: string }> = [];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i !== source.length && source[i] !== '\n') continue;
    const end = i < source.length ? i + 1 : i;
    const contentEnd = i > start && source[i - 1] === '\r' ? i - 1 : i;
    lines.push({ start, contentEnd, end, text: source.slice(start, contentEnd) });
    start = end;
  }
  return lines;
}

function prefixCursor(line: string, heading: boolean): number {
  let cursor = line.startsWith('\uFEFF') ? 1 : 0;
  let changed = true;
  while (changed) {
    changed = false;
    const quote = line.slice(cursor).match(/^ {0,3}>[ \t]?/);
    if (quote) { cursor += quote[0].length; changed = true; continue; }
    const list = line.slice(cursor).match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/);
    if (list) { cursor += list[0].length; changed = true; }
  }
  if (heading) {
    const marker = line.slice(cursor).match(/^ {0,3}#{1,6}(?:[ \t]+|$)/);
    if (marker) cursor += marker[0].length;
  }
  return cursor;
}

function mapInlineToken(source: string, lines: ReturnType<typeof lineTable>, token: Token, heading: boolean, occupied: LedgerSpan[]): InlineInput {
  if (!token.map) throw Error('inline token 缺少块级行范围');
  const desired = token.content.split('\n');
  const physical = lines.slice(token.map[0], token.map[1]);
  const units: RawUnit[] = [];
  let text = '';
  let physicalIndex = 0;
  for (let part = 0; part < desired.length; part++) {
    const wanted = desired[part];
    let match: { line: (typeof physical)[number]; start: number; end: number } | undefined;
    for (; physicalIndex < physical.length; physicalIndex++) {
      const line = physical[physicalIndex];
      const cursor = prefixCursor(line.text, heading && part === 0);
      let content = line.text.slice(cursor);
      if (heading && part === 0) content = content.replace(/[ \t]+#+[ \t]*$/, '');
      if (content !== wanted) continue;
      match = { line, start: line.start + cursor, end: line.start + cursor + wanted.length };
      physicalIndex++;
      break;
    }
    if (!match) throw Error(`inline 原文行无法词法定位：${JSON.stringify(wanted)}`);
    if (match.start > match.line.start) occupied.push({ sourceStart: match.line.start, sourceEnd: match.start, role: 'block-prefix', syntax: 'block-prefix', visible: false });
    if (match.end < match.line.contentEnd) occupied.push({ sourceStart: match.end, sourceEnd: match.line.contentEnd, role: 'block-suffix', syntax: heading ? 'heading-close' : 'block-suffix', visible: false });
    for (let j = 0; j < wanted.length; j++) units.push({ start: match.start + j, end: match.start + j + 1 });
    text += wanted;
    if (part < desired.length - 1) {
      if (match.line.end === match.line.contentEnd) throw Error('inline softbreak 缺少原文行尾');
      units.push({ start: match.line.contentEnd, end: match.line.end });
      text += '\n';
    }
  }
  return { text, units };
}

function parseDefinitions(source: string, lines: ReturnType<typeof lineTable>): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>();
  for (const line of lines) {
    const match = line.text.match(/^( {0,3})\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]*)>|([^\s]+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/);
    if (!match) continue;
    const label = match[2];
    const destination = match[3] ?? match[4];
    const title = match[5] ?? match[6] ?? match[7] ?? null;
    const href = markdown.normalizeLink(markdown.utils.unescapeAll(destination));
    const labelStart = line.start + match[1].length + 1;
    const labelEnd = labelStart + label.length;
    const destinationAt = line.text.indexOf(destination, labelEnd - line.start + 2);
    const destinationStart = line.start + destinationAt;
    const destinationEnd = destinationStart + destination.length;
    const titleAt = title === null ? -1 : line.text.indexOf(title, destinationEnd - line.start);
    const titleStart = titleAt < 0 ? -1 : line.start + titleAt;
    const spans: LedgerSpan[] = [
      { sourceStart: line.start, sourceEnd: labelStart, role: 'delimiter', syntax: 'definition-open', visible: false },
      { sourceStart: labelStart, sourceEnd: labelEnd, role: 'definition-label', syntax: 'definition-label', visible: false, detail: normalizeReference(label) },
      { sourceStart: labelEnd, sourceEnd: destinationStart, role: 'delimiter', syntax: 'definition-separator', visible: false },
      { sourceStart: destinationStart, sourceEnd: destinationEnd, role: 'definition-href', syntax: 'definition-href', visible: false, detail: href },
    ];
    if (titleStart >= 0 && title !== null) {
      spans.push({ sourceStart: destinationEnd, sourceEnd: titleStart, role: 'delimiter', syntax: 'definition-title-separator', visible: false });
      spans.push({ sourceStart: titleStart, sourceEnd: titleStart + title.length, role: 'definition-title', syntax: 'definition-title', visible: false, detail: title });
      spans.push({ sourceStart: titleStart + title.length, sourceEnd: line.end, role: 'delimiter', syntax: 'definition-close', visible: false });
    } else spans.push({ sourceStart: destinationEnd, sourceEnd: line.end, role: 'delimiter', syntax: 'definition-close', visible: false });
    const key = normalizeReference(label);
    const existing = definitions.get(key);
    // CommonMark keeps the first definition for resolution. Later duplicate
    // definitions are still audited as non-visible source, but cannot replace
    // the href/title used by PM.
    if (existing) existing.spans.push(...spans);
    else definitions.set(key, { key, href, title, spans });
  }
  return definitions;
}

function leavesFor(doc: PMNode, range: Range): TextLeaf[] {
  const leaves: TextLeaf[] = [];
  doc.nodesBetween(range.pos, range.pos + range.size, (node, pos) => {
    if (!node.isText || !node.text) return;
    leaves.push({ start: pos, end: pos + node.text.length, text: node.text, marks: node.marks as TextLeaf['marks'] });
  });
  return leaves;
}

function assignVisualPositions(atoms: Atom[], leaves: TextLeaf[], expectations: LinkExpectation[]): string {
  const expected = atoms.map(atom => atom.text).join('');
  const actual = leaves.map(leaf => leaf.text).join('');
  if (actual !== expected) return `词法投影与 PM 文本不一致：lex=${JSON.stringify(expected)} pm=${JSON.stringify(actual)}`;
  let leafIndex = 0;
  let leafOffset = 0;
  for (const atom of atoms) {
    while (leafIndex < leaves.length && leafOffset === leaves[leafIndex].text.length) { leafIndex++; leafOffset = 0; }
    const leaf = leaves[leafIndex];
    if (!leaf || leafOffset + atom.text.length > leaf.text.length) return `词法 atom ${JSON.stringify(atom.text)} 跨越 PM 文本叶，拒绝猜测`;
    if (leaf.text.slice(leafOffset, leafOffset + atom.text.length) !== atom.text) return `词法 atom ${JSON.stringify(atom.text)} 未命中 PM 叶`;
    atom.visualStart = leaf.start + leafOffset;
    atom.visualEnd = atom.visualStart + atom.text.length;
    if (atom.owner) {
      const expectedMark = expectations.find(item => item.owner === atom.owner);
      if (expectedMark) {
        const mark = leaf.marks.find(item => item.type.name === expectedMark.mark);
        if (!mark) return `${expectedMark.mark} 的可视文本缺少对应 PM mark`;
        if (mark.attrs.href !== expectedMark.href || (mark.attrs.title ?? null) !== expectedMark.title) return `${expectedMark.mark} 的 href/title 与词法来源不一致`;
      }
    }
    leafOffset += atom.text.length;
  }
  while (leafIndex < leaves.length && leafOffset === leaves[leafIndex].text.length) { leafIndex++; leafOffset = 0; }
  return leafIndex === leaves.length ? '' : 'PM 文本叶仍有未归属内容';
}

function fillGaps(source: string, spans: LedgerSpan[], ranges: Range[]): LedgerSpan[] {
  const covered = new Uint8Array(source.length);
  for (const span of spans) for (let i = span.sourceStart; i < span.sourceEnd && i < covered.length; i++) covered[i] = 1;
  const protectedRanges = ranges.filter(range => range.kind === 'protected_block');
  const extra: LedgerSpan[] = [];
  for (let i = 0; i < source.length; ) {
    if (covered[i]) { i++; continue; }
    const start = i;
    while (i < source.length && !covered[i]) i++;
    const owner = protectedRanges.find(range => start >= range.start && start < range.end);
    extra.push({ sourceStart: start, sourceEnd: i, role: owner ? 'protected' : source.slice(start, i).trim() ? 'gap' : 'line-ending', syntax: owner ? 'protected-block' : 'unprojected-gap', visible: false,
      detail: owner ? '受保护块内部不建立文本锚点' : '块间空白、BOM、定义残余或未投影语法' });
  }
  return [...spans, ...extra].sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd || Number(b.visible) - Number(a.visible));
}

export function buildSourceLedger(source: string, pmDoc: PMNode, ranges: readonly Range[]): BuildLedgerResult {
  const diagnostics: LedgerDiagnostic[] = [];
  try {
    const lines = lineTable(source);
    const references = parseDefinitions(source, lines);
    const env: Record<string, unknown> = {};
    const tokens = markdown.parse(source.replace(/^\uFEFF/, ' '), env);
    const blocks: LedgerBlock[] = [];
    const allSpans: LedgerSpan[] = [];
    for (const range of ranges) {
      if (range.kind === 'protected_block') {
        blocks.push({ range, spans: [{ sourceStart: range.start, sourceEnd: range.end, role: 'protected', syntax: 'protected-block', visible: false, detail: '受保护块内部不建立文本锚点' }], visualText: '', inlineCount: 0 });
        allSpans.push(...blocks[blocks.length - 1].spans);
        continue;
      }
      const state: ScanState = { spans: [], atoms: [], expectations: [], references, ownerSerial: 0 };
      const inlineTokens = tokens.filter(token => {
        if (token.type !== 'inline' || !token.map) return false;
        const tokenStart = lines[token.map[0]]?.start;
        const tokenEnd = lines[Math.max(token.map[1] - 1, token.map[0])]?.contentEnd;
        // A leading BOM belongs to the file gap while the first model range
        // starts one UTF-16 unit later. The token's physical line still owns
        // that range, so use overlap rather than requiring identical starts.
        return tokenStart !== undefined && tokenEnd !== undefined && tokenEnd > range.start && tokenStart < range.end;
      });
      for (const token of inlineTokens) {
        const tokenIndex = tokens.indexOf(token);
        const heading = tokenIndex > 0 && tokens[tokenIndex - 1].type === 'heading_open';
        const input = mapInlineToken(source, lines, token, heading, state.spans);
        scanInline(state, input);
      }
      if (!inlineTokens.length && leavesFor(pmDoc, range).length) throw Error(`范围 ${range.start}..${range.end} 有 PM 文本但没有可审计 inline token`);
      const projectionError = assignVisualPositions(state.atoms, leavesFor(pmDoc, range), state.expectations);
      if (projectionError) throw Error(`范围 ${range.start}..${range.end}：${projectionError}`);
      const visualText = state.atoms.map(atom => atom.text).join('');
      const block = { range: range as Range, spans: state.spans, visualText, inlineCount: inlineTokens.length };
      blocks.push(block);
      allSpans.push(...state.spans);
    }
    for (const definition of references.values()) allSpans.push(...definition.spans);
    const spans = fillGaps(source, allSpans, ranges as Range[]);
    return { ok: true, ledger: { sourceLength: source.length, docSize: pmDoc.content.size, blocks, spans, diagnostics } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diagnostics.push(diagnostic('unsupported_or_ambiguous_syntax', reason));
    return fail(reason, diagnostics);
  }
}

function visibleSpans(ledger: SourceLedger): Array<LedgerSpan & { visible: true; visualStart: number; visualEnd: number; text: string }> {
  return ledger.spans.filter((span): span is LedgerSpan & { visible: true; visualStart: number; visualEnd: number; text: string } =>
    span.visible && span.visualStart !== undefined && span.visualEnd !== undefined && span.text !== undefined);
}

function nearestVisual(ledger: SourceLedger, sourceOffset: number): { value: number; note: string } | undefined {
  const spans = visibleSpans(ledger);
  const candidates = spans.flatMap(span => [
    { distance: Math.abs(sourceOffset - span.sourceStart), source: span.sourceStart, visual: span.visualStart },
    { distance: Math.abs(sourceOffset - span.sourceEnd), source: span.sourceEnd, visual: span.visualEnd },
  ]).sort((a, b) => a.distance - b.distance || a.source - b.source);
  const first = candidates[0];
  return first ? { value: first.visual, note: `原文 ${sourceOffset} 位于非可视语法，吸附到 source ${first.source} / PM ${first.visual}` } : undefined;
}

function mapVisualEndpoint(ledger: SourceLedger, position: number, affinity: 'left' | 'right' | undefined, options: MapOptions, snapped: string[]): number {
  if (position < 0 || position > ledger.docSize) throw Error(`PM 位置 ${position} 越界（0..${ledger.docSize}）`);
  const spans = visibleSpans(ledger);
  const interiors = spans.filter(span => position > span.visualStart && position < span.visualEnd);
  if (interiors.length) throw Error(`PM ${position} 位于 ${interiors[0].syntax} grapheme/entity/escape 内部，UTF-16 中间位置不安全`);
  const left = spans.filter(span => span.visualEnd === position);
  const right = spans.filter(span => span.visualStart === position);
  if (affinity === 'left' && left.length) return left[left.length - 1].sourceEnd;
  if (affinity === 'right' && right.length) return right[0].sourceStart;
  const exact = [...new Set([...left.map(span => span.sourceEnd), ...right.map(span => span.sourceStart)])];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw Object.assign(Error(`PM ${position} 两侧隔着非可视语法，折叠端点需要 left/right affinity`), { candidates: exact });
  if (options.snap === 'nearest') {
    const candidates = spans.flatMap(span => [
      { distance: Math.abs(position - span.visualStart), visual: span.visualStart, source: span.sourceStart },
      { distance: Math.abs(position - span.visualEnd), visual: span.visualEnd, source: span.sourceEnd },
    ]).sort((a, b) => a.distance - b.distance || a.visual - b.visual);
    if (candidates[0]) {
      snapped.push(`PM ${position} 位于结构边界，吸附到 PM ${candidates[0].visual} / source ${candidates[0].source}`);
      return candidates[0].source;
    }
  }
  throw Error(`PM ${position} 没有可审计文本锚点`);
}

export function visualToSource(ledger: SourceLedger, anchor: number, head: number, options: MapOptions = {}): LedgerMapResult {
  const snapped: string[] = [];
  try {
    let anchorAffinity: 'left' | 'right' | undefined;
    let headAffinity: 'left' | 'right' | undefined;
    if (anchor === head) anchorAffinity = headAffinity = options.collapsedAffinity;
    else if (anchor < head) { anchorAffinity = 'right'; headAffinity = 'left'; }
    else { anchorAffinity = 'left'; headAffinity = 'right'; }
    const mappedAnchor = mapVisualEndpoint(ledger, anchor, anchorAffinity, options, snapped);
    const mappedHead = mapVisualEndpoint(ledger, head, headAffinity, options, snapped);
    return { ok: true, anchor: mappedAnchor, head: mappedHead, snapped };
  } catch (error) {
    const candidateValue = (error as { candidates?: number[] }).candidates;
    return { ok: false, reason: error instanceof Error ? error.message : String(error), candidates: candidateValue };
  }
}

function mapSourceEndpoint(ledger: SourceLedger, offset: number, affinity: 'left' | 'right' | undefined, options: MapOptions, snapped: string[]): number {
  if (offset < 0 || offset > ledger.sourceLength) throw Error(`原文位置 ${offset} 越界（0..${ledger.sourceLength}）`);
  const spans = visibleSpans(ledger);
  const interior = spans.find(span => offset > span.sourceStart && offset < span.sourceEnd);
  if (interior) throw Error(`原文 ${offset} 位于 ${interior.syntax} 的不可分割 span ${interior.sourceStart}..${interior.sourceEnd} 内部`);
  const left = spans.filter(span => span.sourceEnd === offset);
  const right = spans.filter(span => span.sourceStart === offset);
  if (affinity === 'left' && left.length) return left[left.length - 1].visualEnd;
  if (affinity === 'right' && right.length) return right[0].visualStart;
  const exact = [...new Set([...left.map(span => span.visualEnd), ...right.map(span => span.visualStart)])];
  if (exact.length === 1) return exact[0];
  const hidden = ledger.spans.find(span => !span.visible && offset > span.sourceStart && offset < span.sourceEnd);
  if (hidden && options.snap !== 'nearest') throw Error(`原文 ${offset} 位于非可视 ${hidden.role}/${hidden.syntax}，不盲映射到正文`);
  if (options.snap === 'nearest') {
    const nearest = nearestVisual(ledger, offset);
    if (nearest) { snapped.push(nearest.note); return nearest.value; }
  }
  throw Error(hidden ? `原文 ${offset} 位于非可视 ${hidden.role}/${hidden.syntax}` : `原文 ${offset} 没有可审计文本锚点`);
}

export function sourceToVisual(ledger: SourceLedger, anchor: number, head: number, options: MapOptions = {}): LedgerMapResult {
  const snapped: string[] = [];
  try {
    let anchorAffinity: 'left' | 'right' | undefined;
    let headAffinity: 'left' | 'right' | undefined;
    if (anchor === head) anchorAffinity = headAffinity = options.collapsedAffinity;
    else if (anchor < head) { anchorAffinity = 'right'; headAffinity = 'left'; }
    else { anchorAffinity = 'left'; headAffinity = 'right'; }
    const mappedAnchor = mapSourceEndpoint(ledger, anchor, anchorAffinity, options, snapped);
    const mappedHead = mapSourceEndpoint(ledger, head, headAffinity, options, snapped);
    return { ok: true, anchor: mappedAnchor, head: mappedHead, snapped };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function debugSourceLedger(ledger: SourceLedger): string {
  return ledger.spans.map(span => {
    const visual = span.visible ? ` -> PM ${span.visualStart}..${span.visualEnd} ${JSON.stringify(span.text)}` : '';
    return `${span.sourceStart}..${span.sourceEnd} ${span.role}/${span.syntax}${visual}${span.detail ? ` (${span.detail})` : ''}`;
  }).join('\n');
}

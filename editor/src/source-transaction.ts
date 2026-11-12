import { validTableSize, type TableCommandMeta } from "./table-commands";
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import MarkdownIt from 'markdown-it';
import { parse } from './source-document';
import type { SourceLedger } from './source-ledger';

export type NativeRange = { start: number; end: number; pos: number; size: number; kind: string };
export type NativePatch = { from: number; to: number; insert: string };
export type NativeAnchor = { pmPos: number; sourceOffset: number };

export type NativePlan = {
  patches: NativePatch[];
  candidate: string;
  kind: 'text' | 'empty-text' | 'paste' | 'inline-code' | 'inline-mark' | 'image-attrs' | 'block-structure' | 'table-text' | 'table-structure' | 'task-toggle' | 'projection-sync' | 'heading-level' | 'fence-language' | 'paragraph-split' | 'paragraph-join' | 'list-split' | 'list-join' | 'code-exit';
  /** A Markdown source cannot represent a newly-created empty paragraph. */
  mayStage?: boolean;
  /** Proven source caret in candidate coordinates after a text/input-rule edit. */
  sourceCaret?: number;
  sourceBoundary?: NativeAnchor;
};

type SourcePosition = (position: number, side?: 'from' | 'to' | 'any') => number;

function imageSource(attrs: Record<string, unknown>): string {
  const href = attrs.href;
  const alt = attrs.alt;
  const title = attrs.title;
  if (typeof href !== 'string' || href.length === 0 || /[\u0000-\u0020<>]/.test(href) || /%(?![0-9A-Fa-f]{2})/.test(href)) {
    throw Error('图片目标不能安全表示为 Markdown destination');
  }
  if (typeof alt !== 'string' || /[\r\n]/.test(alt)) throw Error('图片 alt 不能包含换行');
  if (title !== null && title !== undefined && (typeof title !== 'string' || /[\r\n]/.test(title))) {
    throw Error('图片 title 无效');
  }
  const escapedAlt = alt.replace(/([\\\]])/g, '\\$1');
  const suffix = title === null || title === undefined
    ? ''
    : ` "${title.replace(/([\\"])/g, '\\$1')}"`;
  return `![${escapedAlt}](${href}${suffix})`;
}

function imageAttributePlan(
  source: string,
  state: EditorState,
  step: Record<string, any>,
  position: SourcePosition,
): NativePlan | null {
  if (step.stepType !== 'replace' || step.structure || step.from + 1 !== step.to ||
      step.slice?.openStart || step.slice?.openEnd) return null;
  const content = step.slice?.content ?? [];
  if (content.length !== 1 || content[0]?.type !== 'image') return null;
  const before = state.doc.nodeAt(step.from);
  if (before?.type.name !== 'image') return null;
  const from = position(step.from, 'from');
  const to = position(step.to, 'to');
  if (from >= to) throw Error('图片 owner 无法唯一映射到原文');
  const patches = [{ from, to, insert: imageSource(content[0].attrs ?? {}) }];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'image-attrs' };
}

function pastePlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  const paste = tr.getMeta('inkoraSourcePaste') as {
    kind?: string;
    source?: string;
  } | undefined;
  if (paste?.kind !== 'plain_text' || typeof paste.source !== 'string') return null;
  const step = tr.steps[0]?.toJSON() as Record<string, any> | undefined;
  if (!step || step.stepType !== 'replace') return null;
  const from = position(step.from, 'from');
  const to = position(step.to, 'to');
  const eol = eolForLine(source, from, fallbackEol);
  const visible = selectionInsideTableCell(state, step.from, step.to)
    ? encodeTableCellText(paste.source)
    : paste.source;
  const insert = visible.replace(/\r\n?|\n/g, `${eol}${eol}`);
  const patches = [{ from, to, insert }];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'paste' };
}

function inputRulePlan(
  source: string,
  tr: Transaction,
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  const metadata = Object.values((tr as unknown as { meta?: Record<string, unknown> }).meta ?? {})
    .find((value): value is { transform: Transaction; from: number; to: number; text: string } => {
      if (typeof value !== 'object' || value === null) return false;
      const candidate = value as Record<string, unknown>;
      return candidate.transform === tr && Number.isInteger(candidate.from) &&
        Number.isInteger(candidate.to) && typeof candidate.text === 'string';
    });
  if (!metadata || metadata.text.length === 0) return null;
  const from = position(metadata.from, 'from');
  const to = position(metadata.to, 'to');
  const insert = metadata.text.replace(/\n/g, eolForLine(source, from, fallbackEol));
  const patches = [{ from, to, insert }];
  const candidate = applyNativePatches(source, patches);
  try {
    // An input rule must retain the characters actually entered even when
    // canonical priority makes them an unsafe candidate (BOF `---`). The
    // session installs that parser-owned U projection and blocks structured
    // saving; clean candidates still require the usual projection proof.
    parse(candidate);
  } catch {
    return null;
  }
  return { patches, candidate, kind: 'projection-sync', sourceCaret: from + insert.length };
}

export function applyNativePatches(source: string, patches: readonly NativePatch[]): string {
  let candidate = source;
  for (const patch of [...patches].sort((a, b) => b.from - a.from)) {
    if (patch.from < 0 || patch.to < patch.from || patch.to > candidate.length) throw Error('原文补丁范围无效');
    candidate = candidate.slice(0, patch.from) + patch.insert + candidate.slice(patch.to);
  }
  return candidate;
}

function eolForLine(
  source: string,
  offset: number,
  fallback: '\r\n' | '\n' = '\n',
): '\r\n' | '\n' {
  const after = source.slice(offset).match(/\r\n|\n/);
  if (after) return after[0] as '\r\n' | '\n';
  const before = source.slice(0, offset).match(/(?:\r\n|\n)(?![\s\S]*(?:\r\n|\n))/);
  return (before?.[0] ?? fallback) as '\r\n' | '\n';
}

function textSlice(step: Record<string, any>): string | null {
  if (step.stepType !== 'replace' || step.structure || step.slice?.openStart || step.slice?.openEnd) return null;
  const content = step.slice?.content ?? [];
  if (content.some((node: { type?: string }) => node.type !== 'text')) return null;
  return content.map((node: { text?: string }) => node.text ?? '').join('');
}

function onlyEmptyParagraph(state: EditorState): boolean {
  return state.doc.childCount === 1
    && state.doc.firstChild?.type.name === 'paragraph'
    && state.doc.firstChild.content.size === 0;
}

function selectionInsideTableCell(state: EditorState, from: number, to: number): boolean {
  const inside = (position: number): boolean => {
    const resolved = state.doc.resolve(position);
    for (let depth = resolved.depth; depth > 0; depth--) {
      if (["table_cell", "table_header"].includes(resolved.node(depth).type.name)) return true;
    }
    return false;
  };
  return inside(from) && inside(to);
}

function encodeTableCellText(text: string): string {
  return text.replace(/(\\*)\|/g, (_match, slashes: string) =>
    `${"\\".repeat(slashes.length * 2 + 1)}|`);
}

function emptySourceAnchor(source: string): number {
  // Preserve a BOM and all pre-existing whitespace bytes. Inserting after the
  // BOM and before the whitespace yields the only visible paragraph while the
  // untouched suffix remains an unowned source gap.
  return source.startsWith('\uFEFF') ? 1 : 0;
}

function textNodeAt(state: EditorState, position: number): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  state.doc.descendants((node, pos) => {
    if (found || !node.isText || position < pos || position > pos + node.nodeSize) return;
    found = { node, pos };
  });
  return found;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}

function inlineCodePlan(source: string, state: EditorState, step: Record<string, any>, insert: string, position: SourcePosition): NativePlan | null {
  if (!insert.includes('`') || step.from !== step.to) return null;
  const hit = textNodeAt(state, step.from);
  if (!hit?.node.marks.some(mark => mark.type.name === 'code')) return null;
  const leafStart = position(hit.pos, 'from');
  const leafEnd = position(hit.pos + hit.node.nodeSize, 'to');
  const open = /(`+)$/.exec(source.slice(0, leafStart));
  const close = /^(`+)/.exec(source.slice(leafEnd));
  if (!open || !close || open[1].length !== close[1].length) throw Error('行内代码定界符无法安全定位');
  const insertion = position(step.from, 'from');
  const nextText = hit.node.text!.slice(0, step.from - hit.pos) + insert + hit.node.text!.slice(step.from - hit.pos);
  const width = Math.max(open[1].length, longestBacktickRun(nextText) + 1);
  const delimiter = '`'.repeat(width);
  const patches: NativePatch[] = [
    { from: leafEnd, to: leafEnd + close[1].length, insert: delimiter },
    { from: insertion, to: insertion, insert },
    { from: leafStart - open[1].length, to: leafStart, insert: delimiter },
  ];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'inline-code' };
}

function longestRun(text: string, character: string): number {
  const expression = new RegExp(`${character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}+`, 'g');
  let longest = 0;
  for (const match of text.matchAll(expression)) longest = Math.max(longest, match[0].length);
  return longest;
}

function linkTail(attrs: Record<string, unknown>): string {
  const href = attrs.href;
  const title = attrs.title;
  if (typeof href !== 'string' || href.length === 0 || /[\u0000-\u001f<>\s]/.test(href)) {
    throw Error('链接目标不能安全表示为局部 Markdown destination');
  }
  if (title !== null && title !== undefined && typeof title !== 'string') throw Error('链接 title 无效');
  const suffix = title === null || title === undefined
    ? ''
    : ` "${title.replace(/([\\"])/g, '\\$1')}"`;
  return `](${href}${suffix})`;
}

function markDelimiters(mark: Record<string, any>, sourceText: string): { open: string; close: string } {
  switch (mark.type) {
    case 'strong': return { open: '**', close: '**' };
    case 'em': return { open: '*', close: '*' };
    case 'strike': return { open: '~~', close: '~~' };
    case 'code': {
      const delimiter = '`'.repeat(Math.max(1, longestRun(sourceText, '`') + 1));
      const padding = sourceText.startsWith(' ') || sourceText.endsWith(' ') ? ' ' : '';
      return { open: delimiter + padding, close: padding + delimiter };
    }
    case 'link': return { open: '[', close: linkTail(mark.attrs ?? {}) };
    default: throw Error(`尚未支持 ${String(mark.type)} mark 的原文局部事务`);
  }
}

function existingMarkDelimiters(
  source: string,
  from: number,
  to: number,
  mark: Record<string, any>,
): { openFrom: number; open: string; closeTo: number; close: string } {
  if (mark.type === 'strong') {
    const open = source.slice(Math.max(0, from - 2), from);
    if (!['**', '__'].includes(open) || source.slice(to, to + 2) !== open) throw Error('strong 定界符不是可安全局部删除的成对写法');
    return { openFrom: from - 2, open, closeTo: to + 2, close: open };
  }
  if (mark.type === 'em') {
    const open = source.slice(Math.max(0, from - 1), from);
    if (!['*', '_'].includes(open) || source.slice(to, to + 1) !== open) throw Error('em 定界符不是可安全局部删除的成对写法');
    return { openFrom: from - 1, open, closeTo: to + 1, close: open };
  }
  if (mark.type === 'strike') {
    if (source.slice(Math.max(0, from - 2), from) !== '~~' || source.slice(to, to + 2) !== '~~') throw Error('strike 定界符不是可安全局部删除的成对写法');
    return { openFrom: from - 2, open: '~~', closeTo: to + 2, close: '~~' };
  }
  if (mark.type === 'code') {
    const open = /(`+)[ ]?$/.exec(source.slice(0, from));
    if (!open) throw Error('code opening delimiter 无法安全定位');
    const close = /^ ?(`+)/.exec(source.slice(to));
    if (!close || open[1] !== close[1]) throw Error('code closing delimiter 无法安全定位');
    return { openFrom: from - open[0].length, open: open[0], closeTo: to + close[0].length, close: close[0] };
  }
  if (mark.type === 'link') {
    if (source[from - 1] !== '[' || source[to] !== ']' || source[to + 1] !== '(') throw Error('link 定界符无法安全定位');
    let depth = 0;
    let escaped = false;
    for (let index = to + 1; index < source.length; index++) {
      const character = source[index];
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '(') depth++;
      if (character === ')' && --depth === 0) {
        return { openFrom: from - 1, open: '[', closeTo: index + 1, close: source.slice(to, index + 1) };
      }
    }
    throw Error('link closing delimiter 无法安全定位');
  }
  throw Error(`尚未支持 ${String(mark.type)} mark 的原文局部删除`);
}

function sameMark(left: Record<string, any>, right: { type: { name: string }; attrs: Record<string, unknown> }): boolean {
  return left.type === right.type.name && JSON.stringify(left.attrs ?? {}) === JSON.stringify(right.attrs ?? {});
}

function textSegments(
  state: EditorState,
  from: number,
  to: number,
): Array<{ from: number; to: number }> {
  const segments: Array<{ from: number; to: number }> = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    if (start < end) segments.push({ from: start, to: end });
  });
  return segments;
}

function markedRuns(
  state: EditorState,
  mark: Record<string, any>,
): Array<{ from: number; to: number }> {
  const segments: Array<{ from: number; to: number }> = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.marks.some(candidate => sameMark(mark, candidate))) return;
    const previous = segments.at(-1);
    if (previous?.to === pos) previous.to = pos + node.nodeSize;
    else segments.push({ from: pos, to: pos + node.nodeSize });
  });
  return segments;
}

function markPlan(source: string, state: EditorState, tr: Transaction, position: SourcePosition): NativePlan | null {
  const steps = tr.steps.map(step => step.toJSON() as Record<string, any>);
  if (!steps.length || steps.some(step => step.stepType !== 'addMark' && step.stepType !== 'removeMark')) return null;
  const patches: NativePatch[] = [];
  for (const step of steps) {
    if (step.stepType === 'addMark') {
      const segments = textSegments(state, step.from, step.to);
      if (!segments.length) throw Error('mark 事务缺少可编辑文字范围');
      for (const segment of segments) {
        const from = position(segment.from, 'from');
        const to = position(segment.to, 'to');
        const delimiters = markDelimiters(step.mark, source.slice(from, to));
        patches.push(
          { from: to, to, insert: delimiters.close },
          { from, to: from, insert: delimiters.open },
        );
      }
    } else {
      const runs = markedRuns(state, step.mark).filter(run => run.from < step.to && run.to > step.from);
      if (!runs.length) throw Error('removeMark 事务缺少可编辑 mark 范围');
      for (const run of runs) {
        const selectedFrom = Math.max(run.from, step.from);
        const selectedTo = Math.min(run.to, step.to);
        const runFrom = position(run.from, 'from');
        const runTo = position(run.to, 'to');
        const from = position(selectedFrom, 'from');
        const to = position(selectedTo, 'to');
        const delimiters = existingMarkDelimiters(source, runFrom, runTo, step.mark);
        if (selectedFrom === run.from) {
          patches.push({ from: delimiters.openFrom, to: runFrom, insert: '' });
        } else {
          patches.push({ from, to: from, insert: delimiters.close });
        }
        if (selectedTo === run.to) {
          patches.push({ from: runTo, to: delimiters.closeTo, insert: '' });
        } else {
          patches.push({ from: to, to, insert: delimiters.open });
        }
      }
    }
  }
  return { patches, candidate: applyNativePatches(source, patches), kind: 'inline-mark' };
}

function topLevelAt(doc: PMNode, pos: number): PMNode | null {
  return doc.nodeAt(pos);
}

function attrPlan(source: string, state: EditorState, tr: Transaction, ranges: readonly NativeRange[]): NativePlan | null {
  for (const range of ranges) {
    const before = topLevelAt(state.doc, range.pos);
    const after = topLevelAt(tr.doc, range.pos);
    if (!before || !after || before.type !== after.type || !before.content.eq(after.content) || before.sameMarkup(after)) continue;
    const raw = source.slice(range.start, range.end);
    if (before.type.name === 'heading') {
      if (before.attrs.style !== 'atx' || after.attrs.style !== 'atx') throw Error('仅支持 ATX 标题等级的局部原文事务');
      const match = /^(#{1,6})([\t ]+)/.exec(raw);
      if (!match || match[1].length !== before.attrs.level) throw Error('ATX 标题标记与当前源元数据不一致');
      const marker = '#'.repeat(after.attrs.level);
      const patches = [{ from: range.start, to: range.start + match[1].length, insert: marker }];
      return { patches, candidate: applyNativePatches(source, patches), kind: 'heading-level' };
    }
    if (before.type.name === 'code_block') {
      if (before.attrs.style !== 'fenced' || after.attrs.style !== 'fenced' || before.attrs.fence !== after.attrs.fence) throw Error('仅支持保留围栏的语言信息局部事务');
      const match = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)/.exec(raw);
      if (!match || match[2] !== before.attrs.fence) throw Error('代码围栏与当前源元数据不一致');
      const info = match[3];
      const oldLanguage = before.attrs.language ?? '';
      const startInInfo = info.indexOf(oldLanguage);
      if (info.trim() !== oldLanguage || startInInfo < 0) throw Error('代码围栏 info string 含未建模字节，已拒绝局部改写');
      const start = range.start + match[1].length + match[2].length + startInInfo;
      const replacement = after.attrs.language ?? '';
      const patches = [{ from: start, to: start + oldLanguage.length, insert: replacement }];
      return { patches, candidate: applyNativePatches(source, patches), kind: 'fence-language' };
    }
  }
  return null;
}

function lineStarts(source: string, from: number, to: number): number[] {
  const starts = [from];
  for (let index = from; index < to; index++) {
    if (source[index] === '\n' && index + 1 < to) starts.push(index + 1);
  }
  return starts;
}

function matchingStructuralPlan(
  source: string,
  target: PMNode,
  candidates: Array<{ patches: NativePatch[]; description: string }>,
): NativePlan | null {
  const matches = candidates.map(candidate => ({
    ...candidate,
    raw: applyNativePatches(source, candidate.patches),
  })).filter(candidate => {
    try { return parse(candidate.raw).doc.eq(target); } catch { return false; }
  });
  const unique = matches.filter((candidate, index, all) =>
    all.findIndex(value => value.raw === candidate.raw) === index);
  if (unique.length !== 1) return null;
  return {
    patches: unique[0].patches,
    candidate: unique[0].raw,
    kind: 'block-structure',
  };
}

function structuralPlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  ranges: readonly NativeRange[],
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  if (!tr.steps.some(step => step.toJSON().stepType === 'replaceAround')) return null;
  const selected = ranges.filter(range => {
    const end = range.pos + range.size;
    return state.selection.from <= end && state.selection.to >= range.pos;
  });
  const active = selected.length ? selected : ranges.filter(range =>
    state.selection.from >= range.pos && state.selection.from <= range.pos + range.size);
  if (!active.length) return null;
  const from = Math.min(...active.map(range => range.start));
  const to = Math.max(...active.map(range => range.end));
  const raw = source.slice(from, to);
  const eol = eolForLine(source, from, fallbackEol);
  const candidates: Array<{ patches: NativePatch[]; description: string }> = [];
  const add = (patches: NativePatch[], description: string) => candidates.push({ patches, description });

  for (let level = 1; level <= 6; level++) add([{ from, to: from, insert: `${'#'.repeat(level)} ` }], 'paragraph to heading');
  const atx = /^( {0,3}#{1,6})(?:[\t ]+|$)/.exec(raw);
  if (atx) add([{ from, to: from + atx[0].length, insert: '' }], 'heading to paragraph');
  const setext = /(?:\r\n|\n)(?:=+|-+)[\t ]*$/.exec(raw);
  if (setext) add([{ from: from + setext.index, to, insert: '' }], 'setext heading to paragraph');

  const starts = lineStarts(source, from, to);
  add(starts.map(start => ({ from: start, to: start, insert: '> ' })), 'wrap blockquote');
  const quotePatches = starts.map(start => {
    const match = /^( {0,3}>[\t ]?)/.exec(source.slice(start, to));
    return match ? { from: start, to: start + match[1].length, insert: '' } : null;
  }).filter((patch): patch is NativePatch => patch !== null);
  if (quotePatches.length === starts.length) add(quotePatches, 'lift blockquote');

  add(starts.map(start => ({ from: start, to: start, insert: '- ' })), 'wrap bullet list');
  add(starts.map((start, index) => ({ from: start, to: start, insert: `${index + 1}. ` })), 'wrap ordered list');

  const caret = position(state.selection.from, 'any');
  const currentLineStart = source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const listMarker = /^(\s*)([-+*]|\d+[.)])([\t ]+)/.exec(source.slice(currentLineStart));
  if (listMarker) {
    add([{ from: currentLineStart, to: currentLineStart, insert: '  ' }], 'indent list item');
    if (listMarker[1].length >= 2) {
      add([{ from: currentLineStart, to: currentLineStart + 2, insert: '' }], 'outdent list item');
    }
    if (listMarker[1].length >= 4) {
      add([{ from: currentLineStart, to: currentLineStart + 4, insert: '' }], 'outdent four-space list item');
    }
  }

  const targetPosition = active.length === 1
    ? tr.mapping.map(active[0].pos, -1)
    : -1;
  const targetTop = targetPosition >= 0 ? tr.doc.nodeAt(targetPosition) : null;
  if (active.length === 1 && targetTop?.type.name === 'code_block') {
    const language = targetTop.attrs.language ? String(targetTop.attrs.language) : '';
    const preferredFence = String(targetTop.attrs.fence || '```');
    const marker = preferredFence[0] === '~' ? '~' : '`';
    const closingCandidate = new RegExp(`^ {0,3}(${marker === '`' ? '`' : '~'}+)[\\t ]*\\r?$`, 'gm');
    let longestClosingCandidate = 0;
    for (const match of raw.matchAll(closingCandidate)) {
      longestClosingCandidate = Math.max(longestClosingCandidate, match[1].length);
    }
    const fence = marker.repeat(Math.max(3, preferredFence.length, longestClosingCandidate + 1));
    add([
      { from: to, to, insert: `${eol}${fence}` },
      { from, to: from, insert: `${fence}${language}${eol}` },
    ], 'paragraph to code block');
  }
  const fenced = /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r\n|\n)([\s\S]*?)(?:\r\n|\n)\2[\t ]*$/.exec(raw);
  if (fenced) {
    const openingEnd = from + raw.indexOf(fenced[3]);
    const closingStart = openingEnd + fenced[3].length;
    add([
      { from: closingStart, to, insert: '' },
      { from, to: openingEnd, insert: '' },
    ], 'code block to paragraph');
  }
  return matchingStructuralPlan(source, tr.doc, candidates);
}

function codeExitPlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  ranges: readonly NativeRange[],
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  if (!state.selection.empty || state.selection.$from.parent.type.name !== 'code_block') return null;
  const step = tr.steps[0]?.toJSON() as Record<string, any> | undefined;
  const content = step?.slice?.content;
  if (tr.steps.length !== 1 || step?.stepType !== 'replace' || step.from !== step.to ||
      !Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'paragraph' ||
      content[0]?.content !== undefined) return null;
  const activeIndex = ranges.findIndex(range =>
    range.kind === 'code_block' && state.selection.from > range.pos &&
    state.selection.from < range.pos + range.size);
  if (activeIndex < 0) return null;
  const range = ranges[activeIndex];
  if (step.from !== range.pos + range.size || tr.doc.childCount !== state.doc.childCount + 1) return null;
  for (let index = 0; index < state.doc.childCount; index++) {
    const before = state.doc.child(index);
    const afterIndex = index <= activeIndex ? index : index + 1;
    if (!before.eq(tr.doc.child(afterIndex))) return null;
  }
  const inserted = tr.doc.child(activeIndex + 1);
  if (inserted.type.name !== 'paragraph' || inserted.content.size !== 0) return null;
  const eol = eolForLine(source, range.end, fallbackEol);
  const patches = [{ from: range.end, to: range.end, insert: eol }];
  return {
    patches,
    candidate: applyNativePatches(source, patches),
    kind: 'code-exit',
    mayStage: true,
    sourceCaret: range.end + eol.length,
  };
}

function countType(doc: PMNode, type: string): number {
  let count = 0;
  doc.descendants(node => { if (node.type.name === type) count++; });
  return count;
}

function listContext(state: EditorState): boolean {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.name === 'list_item') return true;
  return false;
}

function taskListContext(state: EditorState): boolean {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'list_item') return node.attrs.task === true;
  }
  return false;
}

function splitPlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  ranges: readonly NativeRange[],
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  if (!state.selection.empty || tr.doc.content.size <= state.doc.content.size) return null;
  const step = tr.steps[0]?.toJSON() as Record<string, any> | undefined;
  if (!step || step.stepType !== 'replace' || step.from !== step.to) return null;
  const anchor = position(state.selection.from, 'any');
  const eol = eolForLine(source, anchor, fallbackEol);
  if (listContext(state) && countType(tr.doc, 'list_item') === countType(state.doc, 'list_item') + 1) {
    const lineStart = source.lastIndexOf('\n', Math.max(0, anchor - 1)) + 1;
    const prefix = source.slice(lineStart, anchor);
    const marker = /^(?:\uFEFF)?((?:[\t ]*>[\t ]*)*)([\t ]*)([-+*]|\d+[.)])([\t ]+)/.exec(prefix);
    if (!marker) throw Error('列表项标记无法从当前源行安全定位');
    const taskMarker = taskListContext(state) ? '[ ] ' : '';
    // The file BOM stays at BOF; quote/indent ownership continues on the new line.
    const insertion = `${eol}${marker[1]}${marker[2]}${marker[3]}${marker[4]}${taskMarker}`;
    const patches = [{ from: anchor, to: anchor, insert: insertion }];
    return { patches, candidate: applyNativePatches(source, patches), kind: 'list-split', mayStage: true, sourceCaret: anchor + insertion.length };
  }
  // WebKit's native Enter at a heading end inserts a closed empty paragraph
  // after the heading, whereas PM splitBlock may express the same result as
  // an open slice. Prove the complete target doc before granting this intent.
  const $from = state.selection.$from;
  if ($from.depth === 1 && $from.parent.type.name === 'heading' &&
      $from.parentOffset === $from.parent.content.size) {
    const owner = ranges.find(range => range.kind === 'heading' && range.pos === $from.before());
    const paragraph = state.schema.nodes.paragraph.create();
    const expected = state.tr.insert($from.after(), paragraph);
    if (owner && expected.doc.eq(tr.doc)) {
      // range.end is after ATX closing hashes / the setext underline, before
      // the original line ending. Keep those source bytes on the heading.
      const at = owner.end;
      const insertion = eol + eol;
      const patches = [{ from: at, to: at, insert: insertion }];
      return { patches, candidate: applyNativePatches(source, patches), kind: 'paragraph-split',
        mayStage: true, sourceCaret: at + insertion.length };
    }
  }
  if (state.selection.$from.parent.type.name === 'paragraph' && countType(tr.doc, 'paragraph') === countType(state.doc, 'paragraph') + 1) {
    const insertion = eol + eol;
    const patches = [{ from: anchor, to: anchor, insert: insertion }];
    return { patches, candidate: applyNativePatches(source, patches), kind: 'paragraph-split', mayStage: true, sourceCaret: anchor + insertion.length };
  }
  return null;
}

function paragraphJoinPlan(source: string, state: EditorState, tr: Transaction, ranges: readonly NativeRange[], position: SourcePosition): NativePlan | null {
  if (!state.selection.empty || countType(tr.doc, 'paragraph') >= countType(state.doc, 'paragraph')) return null;
  const caret = state.selection.from;
  const { $from } = state.selection;
  if ($from.parent.type.name === 'paragraph' && $from.parentOffset === 0 &&
      $from.depth > 1 && $from.node(-1).type.name === 'blockquote' && $from.index(-1) > 0 &&
      $from.node(-1).child($from.index(-1) - 1).type.name === 'paragraph') {
    const from = position($from.before() - 1, 'to');
    const to = position(caret, 'from');
    const separator = source.slice(from, to);
    // The two adjacent paragraphs share this quote owner. Only their line
    // endings and repeated quote prefixes may be removed, never hidden syntax.
    if (from < to && /^(?:[\t ]*(?:\r\n|\n)[\t ]*(?:>[\t ]*)*)+$/.test(separator)) {
      const patches = [{ from, to, insert: '' }];
      const candidate = applyNativePatches(source, patches);
      if (parse(candidate).doc.eq(tr.doc)) return { patches, candidate, kind: 'paragraph-join' };
    }
  }
  let left: NativeRange | undefined;
  let right: NativeRange | undefined;
  for (let index = 0; index < ranges.length; index++) {
    const current = ranges[index];
    const next = ranges[index + 1];
    if (current?.kind === 'paragraph' && next?.kind === 'paragraph') {
      if (caret === next.pos + 1 || caret === current.pos + current.size - 1) { left = current; right = next; break; }
    }
  }
  if (!left || !right) return null;
  const patches = [{ from: left.end, to: right.start, insert: '' }];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'paragraph-join' };
}

function listJoinPlan(source: string, state: EditorState, tr: Transaction, position: SourcePosition): NativePlan | null {
  if (!state.selection.empty || !listContext(state) ||
      countType(tr.doc, 'list_item') >= countType(state.doc, 'list_item')) return null;
  const contentStart = position(state.selection.from, 'from');
  const lineStart = source.lastIndexOf('\n', Math.max(0, contentStart - 1)) + 1;
  const prefix = source.slice(lineStart, contentStart);
  const marker = /^(\uFEFF?)((?:[\t ]*>[\t ]*)*)[\t ]*([-+*]|\d+[.)])[\t ]*(?:\[[ xX]\][\t ]*)?$/.exec(prefix);
  if (!marker) throw Error('列表 join 的行标记无法安全定位');
  const markerStart = lineStart + marker[1].length + marker[2].length;
  let separatorStart = lineStart;
  if (separatorStart > 0 && source[separatorStart - 1] === '\n') {
    separatorStart--;
    if (separatorStart > 0 && source[separatorStart - 1] === '\r') separatorStart--;
  }
  const eol = eolForLine(source, lineStart);
  const previousLineStart = source.lastIndexOf('\n', Math.max(0, separatorStart - 1)) + 1;
  const previousLine = source.slice(previousLineStart, separatorStart);
  // Lifting keeps the existing paragraph boundary. Adjacent nonblank lines
  // need a second EOL so Markdown does not turn them into one softbreak.
  const previousContent = previousLine.replace(/^(?:\uFEFF)?(?:[\t ]*>[\t ]*)*/, '');
  const liftInsert = separatorStart < lineStart && !/^[\t ]*$/.test(previousContent) ? eol + marker[2] : '';
  const candidates = [
    { patches: [{ from: markerStart, to: contentStart, insert: liftInsert }], description: 'lift list item' },
    { patches: [{ from: separatorStart, to: contentStart, insert: '' }], description: 'join list contents' },
  ];
  const matched = matchingStructuralPlan(source, tr.doc, candidates);
  if (matched) return { ...matched, kind: 'list-join' };
  // At EOF an empty lifted paragraph is represented by the blank source line,
  // not by a parser paragraph. Prove the complete remaining document and the
  // single empty caret block before accepting that bounded projection.
  const targetCaret = tr.selection.$from;
  const last = targetCaret.parent;
  const quotedEof = targetCaret.depth > 1 && Array.from({ length: targetCaret.depth - 1 }, (_, index) => index + 1)
    .every(depth => targetCaret.node(depth).type.name === 'blockquote' &&
      targetCaret.index(depth - 1) === targetCaret.node(depth - 1).childCount - 1);
  if (state.selection.$from.parent.content.size === 0 &&
      /^(?:\r\n|\n)?$/.test(source.slice(contentStart)) && last.type.name === 'paragraph' &&
      last.content.size === 0 && tr.selection.empty &&
      targetCaret.index(-1) === targetCaret.node(-1).childCount - 1 &&
      (targetCaret.depth === 1 || quotedEof)) {
    const withoutEmpty = tr.doc.replace(targetCaret.before(), targetCaret.after(), tr.doc.slice(0, 0));
    const lifted = matchingStructuralPlan(source, withoutEmpty, [candidates[0]]);
    if (lifted) return { ...lifted, kind: 'list-join', sourceCaret: lifted.candidate.length };
  }
  return null;
}

type SourceLine = { start: number; contentEnd: number; end: number; eol: string };
const tableTokenizer = new MarkdownIt('commonmark', { html: false }).enable('table');

function sourceLines(source: string, from: number, to: number): SourceLine[] {
  const result: SourceLine[] = [];
  let start = from;
  while (start <= to) {
    const lf = source.indexOf('\n', start);
    if (lf < 0 || lf >= to) {
      result.push({ start, contentEnd: to, end: to, eol: '' });
      break;
    }
    const contentEnd = lf > start && source[lf - 1] === '\r' ? lf - 1 : lf;
    result.push({ start, contentEnd, end: lf + 1, eol: source.slice(contentEnd, lf + 1) });
    start = lf + 1;
    if (start === to) break;
  }
  return result;
}

function structuralPipes(text: string): number[] {
  const offsets: number[] = [];
  let code = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '`') {
      let end = index + 1;
      while (text[end] === '`') end++;
      const run = text.slice(index, end);
      if (!code) code = run;
      else if (code === run) code = '';
      index = end - 1;
      continue;
    }
    if (text[index] !== '|' || code) continue;
    let slashes = 0;
    for (let before = index - 1; before >= 0 && text[before] === '\\'; before--) slashes++;
    if (slashes % 2 === 0) offsets.push(index);
  }
  return offsets;
}

function rowCellBounds(source: string, line: SourceLine, column: number): { before: number; after: number; start: number; end: number } | null {
  const text = source.slice(line.start, line.contentEnd);
  const pipes = structuralPipes(text);
  const leading = pipes[0] !== undefined && /^[>\t ]*$/.test(text.slice(0, pipes[0]));
  const beforeIndex = leading ? column : column - 1;
  const afterIndex = leading ? column + 1 : column;
  const before = beforeIndex < 0 ? line.start - 1 : line.start + (pipes[beforeIndex] ?? -1);
  const afterPipe = pipes[afterIndex];
  if (afterPipe === undefined) return null;
  let start = before + 1;
  let end = line.start + afterPipe;
  while (start < end && /[\t ]/.test(source[start])) start++;
  while (end > start && /[\t ]/.test(source[end - 1])) end--;
  return { before, after: line.start + afterPipe, start, end };
}

function splitTableSourceRow(text: string): { prefix: string; cells: string[]; suffix: string; leading: boolean; trailing: boolean } | null {
  const pipes = structuralPipes(text);
  const containerPrefix = /^(?:(?:[ \t]*>[ \t]?)|(?:[ \t]*(?:[-+*]|\d+[.)])[ \t]+))*[ \t]*/.exec(text)![0];
  if (!pipes.length) return { prefix: containerPrefix, cells: [text.slice(containerPrefix.length)], suffix: '', leading: false, trailing: false };
  const leading = text.slice(0, pipes[0]) === containerPrefix;
  const trailing = /^[\t ]*$/.test(text.slice(pipes.at(-1)! + 1));
  const start = leading ? pipes[0] + 1 : containerPrefix.length;
  const end = trailing ? pipes.at(-1)! : text.length;
  const cuts = pipes.filter(at => at >= start && at < end);
  const cells: string[] = [];
  let from = start;
  for (const at of [...cuts, end]) { cells.push(text.slice(from, at)); from = at + 1; }
  return { prefix: text.slice(0, leading ? pipes[0] : start), cells,
    suffix: trailing ? text.slice(pipes.at(-1)! + 1) : '', leading, trailing };
}

function tableCommandSourceRange(
  source: string,
  ranges: readonly NativeRange[],
  state: EditorState,
  tablePos: number,
): { start: number; end: number } | null {
  const owner = ranges.find(range => tablePos >= range.pos && tablePos < range.pos + range.size);
  if (!owner) return null;
  if (owner.kind === 'table' && owner.pos === tablePos) return { start: owner.start, end: owner.end };
  const tables: number[] = [];
  state.doc.nodesBetween(owner.pos, owner.pos + owner.size, (node, pos) => {
    if (node.type.name === 'table') tables.push(pos);
  });
  const tableIndex = tables.indexOf(tablePos);
  if (tableIndex < 0) return null;
  const lines = sourceLines(source, 0, source.length);
  const tokens = tableTokenizer.parse(source.replace(/^\uFEFF/, ' '), {});
  const candidates = tokens.filter(token => token.type === 'table_open' && token.map &&
    lines[token.map[0]]?.start >= owner.start && lines[token.map[0]]!.start < owner.end);
  const token = candidates[tableIndex];
  if (!token?.map) return null;
  return {
    start: lines[token.map[0]].start,
    end: lines[token.map[1] - 1]?.contentEnd ?? owner.end,
  };
}

function tableCommandPlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  ranges: readonly NativeRange[],
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  const meta = tr.getMeta('inkoraTableCommand') as TableCommandMeta | undefined;
  if (!meta) return null;
  const range = tableCommandSourceRange(source, ranges, state, meta.tablePos);
  if (!range) throw Error('表格结构命令已过期或不属于当前 table 范围');
  const lines = sourceLines(source, range.start, range.end);
  if (lines.length < 2) throw Error('表格结构命令缺少表头或分隔行');
  const table = tr.before.nodeAt(meta.tablePos);
  const columns = table?.firstChild?.firstChild?.childCount ?? 0;
  if (!columns) throw Error('表格结构命令无法确定列数');
  const patches: NativePatch[] = [];

  if (meta.type === 'move_column' || meta.type === 'move_row' || meta.type === 'resize') {
    const rowCount = (table?.firstChild?.childCount ?? 0) + (table?.lastChild?.type.name === 'table_body' ? table.lastChild.childCount : 0);
    if (lines.length !== rowCount + 1) throw Error('表格源码行数与当前投影不一致');
    const content = lines.map(line => source.slice(line.start, line.contentEnd));
    if (meta.type === 'move_row') {
      const target = meta.targetIndex!;
      if (!Number.isInteger(target) || target < 1 || target >= rowCount || meta.rowIndex < 1 || meta.rowIndex >= rowCount) throw Error('移动数据行范围无效');
      // Move row payloads; EOL and container prefix belong to their destination.
      const prefixes = content.map(text => splitTableSourceRow(text)?.prefix ?? '');
      const original = content.map((text, index) => text.slice(prefixes[index].length));
      original.splice(target + 1, 0, original.splice(meta.rowIndex + 1, 1)[0]);
      content.splice(0, content.length, ...original.map((payload, index) => prefixes[index] + payload));
    } else {
      for (let index = 0; index < lines.length; index++) {
        const line = splitTableSourceRow(content[index]);
        if (!line) throw Error('无法确定表格单元格范围');
        const cells = [...line.cells];
        while (cells.length < columns) cells.push('  ');
        if (meta.type === 'move_column') {
          if (!Number.isInteger(meta.targetIndex) || meta.targetIndex! < 0 || meta.targetIndex! >= columns) throw Error('移动列范围无效');
          cells.splice(meta.targetIndex!, 0, cells.splice(meta.columnIndex, 1)[0]);
        } else {
          const count = meta.columns!;
          if (!validTableSize({ columns: count, rows: meta.rows! })) throw Error('表格规模无效');
          if ((count < columns || meta.rows! < rowCount) && !meta.confirmShrink) throw Error('缩减表格尚未确认');
          if (count > columns) cells.splice(columns, 0, ...Array(count - columns).fill(index === 1 ? ' --- ' : '  '));
          else cells.splice(count, columns - count);
        }
        content[index] = line.prefix + (line.leading || !cells[0].trim() ? '|' : '') + cells.join('|') +
          (line.trailing || !cells.at(-1)!.trim() ? '|' : '') + line.suffix;
      }
      if (meta.type === 'resize') {
        const total = meta.rows! + 1;
        const prefix = splitTableSourceRow(content[1])!.prefix;
        while (content.length < total) content.push(prefix + '|' + '  |'.repeat(meta.columns!));
        content.length = total;
      }
    }
    const replacement = content.map((text, index) => text + (index < content.length - 1 ?
      (lines[index]?.eol || eolForLine(source, range.start, fallbackEol)) : '')).join('');
    const trailingEol = /^(\r\n|\n)/.exec(source.slice(range.end))?.[0] ?? '';
    const shrinksRows = meta.type === 'resize' && meta.rows! < rowCount;
    // Keep the surviving physical row's terminator, not the deleted last row's.
    // At EOF without a terminator retain the original no-final-newline policy.
    const retainedEol = shrinksRows && trailingEol ? lines[content.length - 1].eol : '';
    patches.push({ from: range.start, to: range.end + (shrinksRows ? trailingEol.length : 0), insert: replacement + retainedEol });
  } else if (meta.type === 'add_row_before' || meta.type === 'add_row_after') {
    const row = meta.rowIndex === 0 ? 1 : Math.min(meta.rowIndex + 1, lines.length - 1);
    const selectedLine = lines[row];
    const rowEol = selectedLine.eol || eolForLine(source, selectedLine.start, fallbackEol);
    const firstPipe = structuralPipes(source.slice(selectedLine.start, selectedLine.contentEnd))[0] ?? 0;
    const prefix = source.slice(selectedLine.start, selectedLine.start + firstPipe);
    const empty = `${prefix}|${'  |'.repeat(columns)}`;
    if (meta.type === 'add_row_before' && meta.rowIndex > 0) {
      patches.push({ from: lines[row].start, to: lines[row].start, insert: empty + rowEol });
    } else {
      patches.push({ from: lines[row].contentEnd, to: lines[row].contentEnd, insert: rowEol + empty });
    }
  } else if (meta.type === 'delete_row') {
    if (meta.rowIndex <= 0) throw Error('不能删除表头行');
    const row = lines[meta.rowIndex + 1];
    if (!row) throw Error('删除行目标已过期');
    if (row.end > row.contentEnd) patches.push({ from: row.start, to: row.end, insert: '' });
    else {
      let from = row.start;
      if (from > range.start && source[from - 1] === '\n') {
        from--;
        if (from > range.start && source[from - 1] === '\r') from--;
      }
      patches.push({ from, to: row.contentEnd, insert: '' });
    }
  } else if (meta.type === 'add_column_before' || meta.type === 'add_column_after') {
    for (const [index, line] of lines.entries()) {
      const bounds = rowCellBounds(source, line, meta.columnIndex);
      if (!bounds) {
        if (index >= 2) continue;
        throw Error(`第 ${index + 1} 行缺少目标列边界`);
      }
      const at = meta.type === 'add_column_before' ? bounds.before + 1 : bounds.after + 1;
      patches.push({ from: at, to: at, insert: index === 1 ? ' --- |' : '  |' });
    }
  } else if (meta.type === 'delete_column') {
    if (columns <= 1) throw Error('不能删除表格最后一列');
    for (const [index, line] of lines.entries()) {
      const bounds = rowCellBounds(source, line, meta.columnIndex);
      if (!bounds) {
        if (index >= 2) continue;
        throw Error(`第 ${index + 1} 行缺少目标列边界`);
      }
      patches.push({ from: bounds.before + 1, to: bounds.after + 1, insert: '' });
    }
  } else if (meta.type.startsWith('align_')) {
    const alignment = meta.alignment ?? meta.type.slice('align_'.length) as TableCommandMeta['alignment'];
    const bounds = rowCellBounds(source, lines[1], meta.columnIndex);
    if (!bounds) throw Error('分隔行缺少目标列边界');
    const marker = source.slice(bounds.start, bounds.end);
    const hyphens = marker.replace(/:/g, '');
    if (!/^-{3,}$/.test(hyphens)) throw Error('分隔单元不是合法 GFM marker');
    const replacement = `${alignment === 'left' || alignment === 'center' ? ':' : ''}${hyphens}${alignment === 'right' || alignment === 'center' ? ':' : ''}`;
    patches.push({ from: bounds.start, to: bounds.end, insert: replacement });
  } else if (meta.type === 'delete_table') {
    patches.push({ from: range.start, to: range.end, insert: '' });
  } else throw Error(`未知表格命令：${meta.type}`);

  const candidate = applyNativePatches(source, patches);
  try {
    if (!parse(candidate).doc.eq(tr.doc)) throw Error('表格结构候选与 PM 投影语义不一致');
  } catch (error) {
    if (error instanceof Error && error.message === '表格结构候选与 PM 投影语义不一致') throw error;
    throw Error(`表格结构候选无法重解析：${error instanceof Error ? error.message : String(error)}`);
  }
  return { patches, candidate, kind: 'table-structure' };
}

function taskTogglePlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  position: SourcePosition,
): NativePlan | null {
  const meta = tr.getMeta('inkoraTaskToggle') as { pos?: unknown; checked?: unknown } | undefined;
  if (!meta) return null;
  if (!Number.isInteger(meta.pos) || typeof meta.checked !== 'boolean') throw Error('任务切换元数据无效');
  const pos = meta.pos as number;
  const before = state.doc.nodeAt(pos);
  const after = tr.doc.nodeAt(pos);
  if (!before?.attrs.task || !after?.attrs.task || before.type !== after.type || before.content !== after.content && !before.content.eq(after.content)) {
    throw Error('任务切换目标已过期');
  }
  const toggledAttrs = { ...before.attrs, checked: meta.checked, stateChar: meta.checked ? 'x' : ' ' };
  if (!state.tr.setNodeMarkup(pos, undefined, toggledAttrs).doc.eq(tr.doc)) {
    throw Error('任务切换事务混入其他内容修改');
  }
  const labelStart = position(pos + 2, 'from');
  const lineStart = source.lastIndexOf('\n', Math.max(0, labelStart - 1)) + 1;
  const prefix = source.slice(lineStart, labelStart);
  const markers = [...prefix.matchAll(/\[([ xX])\](?:[\t ]+|$)/g)];
  const marker = markers.at(-1);
  if (!marker) throw Error('任务 checkbox 原文标记无法定位');
  const stateOffset = lineStart + marker.index + 1;
  const patches = [{ from: stateOffset, to: stateOffset + 1, insert: meta.checked ? 'x' : ' ' }];
  const candidate = applyNativePatches(source, patches);
  if (!parse(candidate).doc.eq(tr.doc)) {
    // A just-entered empty task separator may be an accepted literal space in
    // the projection. Remove exactly that owner's single unmarked space for
    // the canonical before/after proof; no other projection mismatch qualifies.
    const paragraph = before.firstChild;
    const singleSeparator = paragraph?.childCount === 1 && paragraph.firstChild?.isText &&
      paragraph.firstChild.text === ' ' && paragraph.firstChild.marks.length === 0 &&
      source.slice(stateOffset + 2) === ' ';
    if (!singleSeparator) throw Error('任务切换候选与 PM 投影语义不一致');
    const canonical = state.tr.delete(pos + 2, pos + 3);
    if (!parse(source).doc.eq(canonical.doc) ||
        !parse(candidate).doc.eq(canonical.setNodeMarkup(pos, undefined, toggledAttrs).doc)) {
      throw Error('空任务分隔空格缺少完整原文归属证明');
    }
  }
  return { patches, candidate, kind: 'task-toggle' };
}

function insertTablePlan(
  source: string,
  state: EditorState,
  tr: Transaction,
  ranges: readonly NativeRange[],
  fallbackEol: '\r\n' | '\n',
): NativePlan | null {
  const meta = tr.getMeta('inkoraInsertTable') as { raw?: unknown; anchorPos?: unknown } | undefined;
  if (!meta) return null;
  if (typeof meta.raw !== 'string' || !/^\|[^\n]+\|\n\|[^\n]+\|(?:\n\|[^\n]*\|)*$/.test(meta.raw)) {
    throw Error('新建表格命令缺少合法原文');
  }
  let at: number;
  let insert: string;
  if (source.slice(source.startsWith('\uFEFF') ? 1 : 0).trim().length === 0) {
    at = emptySourceAnchor(source);
    insert = meta.raw.replace(/\n/g, eolForLine(source, at, fallbackEol));
  } else {
    if (!Number.isInteger(meta.anchorPos)) throw Error('新建表格命令缺少当前块边界');
    const anchorPos = meta.anchorPos as number;
    const currentIndex = ranges.findIndex(range => range.pos + range.size === anchorPos);
    if (currentIndex < 0 || !state.doc.nodeAt(ranges[currentIndex].pos)) {
      throw Error('新建表格命令的当前块已过期');
    }
    const current = ranges[currentIndex];
    const next = ranges[currentIndex + 1];
    const eol = eolForLine(source, current.end, fallbackEol);
    const tableRaw = meta.raw.replace(/\n/g, eol);
    if (next) {
      at = next.start;
      insert = tableRaw + eol + eol;
    } else {
      at = source.length;
      const doubleEol = eol + eol;
      const separator = source.endsWith(doubleEol) ? '' : source.endsWith(eol) ? eol : doubleEol;
      insert = separator + tableRaw;
    }
  }
  const patches = [{ from: at, to: at, insert }];
  const candidate = applyNativePatches(source, patches);
  if (!parse(candidate).doc.eq(tr.doc)) throw Error('新建表格候选与 PM 投影语义不一致');
  return { patches, candidate, kind: 'table-structure' };
}

function trailingMarkedSpacePlan(source: string, state: EditorState, tr: Transaction,
  ranges: readonly NativeRange[], ledger: SourceLedger | undefined): NativePlan | null {
  const step = tr.steps[0]?.toJSON() as Record<string, any>;
  const insert = step && textSlice(step);
  if (!ledger || insert === null || !/^ +$/.test(insert) || step.from !== step.to ||
      !state.selection.empty || state.selection.from !== step.from ||
      ledger.sourceLength !== source.length || ledger.docSize !== state.doc.content.size) return null;
  const position = state.doc.resolve(step.from);
  const marks = position.nodeBefore?.marks ?? [];
  if (!marks.length || marks.some(mark => !['strong', 'em', 'strike', 'link'].includes(mark.type.name)) ||
      !['paragraph', 'heading'].includes(position.parent.type.name) || position.parentOffset !== position.parent.content.size ||
      !parse(source).doc.eq(state.doc)) return null;
  const owner = ledger.blocks.find(block => step.from > block.range.pos && step.from < block.range.pos + block.range.size);
  if (!owner || !ranges.some(range => range.start === owner.range.start && range.end === owner.range.end &&
      range.pos === owner.range.pos && range.size === owner.range.size)) return null;
  const last = owner.spans.filter(span => span.visible && span.visualEnd === step.from &&
    ['text', 'link-label'].includes(span.role)).sort((left, right) => right.sourceEnd - left.sourceEnd)[0];
  if (!last) return null;
  const link = marks.find(mark => mark.type.name === 'link');
  const links = link ? ledger.links.filter(item => item.visual.to === step.from && item.source.from >= owner.range.start &&
    item.source.to <= owner.range.end && item.href === link.attrs.href && item.title === link.attrs.title) : [];
  if (link && links.length !== 1) return null;
  let from = last.sourceEnd;
  const closed = new Set<string>();
  while (from < owner.range.end) {
    const candidates = owner.spans.filter(span => !span.visible && span.sourceStart === from && span.sourceEnd > from &&
      (span.role === 'delimiter' || (!!link && ['href', 'title', 'reference-label'].includes(span.role))));
    if (candidates.length !== 1) break;
    const closing = candidates[0];
    const emphasis = /^(strong|em|strike)-close$/.exec(closing.syntax);
    if (emphasis) closed.add(emphasis[1]);
    else if (!link || closing.owner !== links[0].owner) return null;
    from = closing.sourceEnd;
  }
  if (marks.some(mark => mark.type.name !== 'link' && !closed.has(mark.type.name)) ||
      (link && from < links[0].source.to) || from <= last.sourceEnd || /[\r\n]/.test(source.slice(last.sourceEnd, from))) return null;
  const expected = state.tr.insertText(insert, step.from, step.to).removeMark(step.from, step.from + insert.length).doc;
  if (!expected.eq(tr.doc)) return null;
  const patches = [{ from, to: from, insert }];
  const candidate = applyNativePatches(source, patches);
  const parsed = parse(candidate);
  if (parsed.issues.length || !parsed.doc.eq(state.doc)) return null;
  return { patches, candidate, kind: 'text', sourceCaret: from + insert.length,
    sourceBoundary: { pmPos: step.from, sourceOffset: from } };
}

export function planNativeTransaction(
  source: string,
  state: EditorState,
  ranges: readonly NativeRange[],
  tr: Transaction,
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n' = '\n',
  ledger?: SourceLedger,
): NativePlan {
  if (!tr.docChanged) throw Error('原生补丁规划器只接受文档事务');
  if (tr.getMeta('inkoraParagraphAfterListJoin') === true && state.selection.empty &&
      state.selection.$from.parentOffset === 0 && state.selection.$from.parent.type.name === 'paragraph' &&
      state.selection.$from.index(-1) > 0) {
    const resolved = state.selection.$from;
    const previous = resolved.node(-1).child(resolved.index(-1) - 1);
    if ((resolved.depth === 1 || resolved.node(-1).type.name === 'blockquote') &&
        ['bullet_list', 'ordered_list'].includes(previous.type.name) && previous.lastChild?.childCount === 1 &&
        previous.lastChild.firstChild?.type.name === 'paragraph') {
      const from = position(resolved.before() - 3, 'to');
      const to = position(resolved.pos, 'from');
      if (from < to && /^(?:[\t ]*(?:\r\n|\n)[\t ]*(?:>[\t ]*)*)+$/.test(source.slice(from, to))) {
        const patches = [{ from, to, insert: '' }];
        const candidate = applyNativePatches(source, patches);
        if (parse(candidate).doc.eq(tr.doc)) return { patches, candidate, kind: 'list-join', sourceCaret: from };
      }
    }
  }
  if (tr.getMeta('inkoraListBoundaryLift') === true && tr.steps[0]?.toJSON().stepType === 'replaceAround' &&
      state.selection.empty && state.selection.$from.parentOffset === 0) {
    const listLift = listJoinPlan(source, state, tr, position);
    if (listLift) return listLift;
  }
  const supplemental = tr.steps.slice(1).map(step => step.toJSON() as Record<string, any>);
  if (supplemental.some(step => step.stepType !== 'addMark' && step.stepType !== 'removeMark' && !(step.stepType === 'replace' && step.structure))) {
    // A real wrapping input rule can delete its prefix and wrap the remaining
    // body. Accept it only when its original typed patch proves the entire target.
    const rule = inputRulePlan(source, tr, position, fallbackEol);
    if (rule) {
      const parsed = parse(rule.candidate);
      if (!parsed.issues.length && parsed.doc.eq(tr.doc)) return rule;
    }
    throw Error('该多步原生事务尚未支持；可信原文与 PM 状态保持不变');
  }
  const step = tr.steps[0].toJSON() as Record<string, any>;

  try {
    const deletedText = step.stepType === 'replace' && step.to > step.from && textSlice(step) === ''
      ? state.doc.textBetween(step.from, step.to) : '';
    const deletesOwnedSpaces = /^ +$/.test(deletedText) &&
      source.slice(position(step.from, 'from'), position(step.to, 'to')) === deletedText;
    if (!deletesOwnedSpaces && parse(source).doc.eq(tr.doc)) {
      return { patches: [], candidate: source, kind: 'projection-sync' };
    }
  } catch {
    // The session owns the diagnostic for malformed source. Continue through
    // the explicit local planners; none may accept by parser failure alone.
  }

  if (step.stepType === 'replace' && state.doc.nodeAt(step.from)?.type.name === 'horizontal_rule') {
    const range = ranges.find(item => item.kind === 'horizontal_rule' &&
      item.pos === step.from && item.pos + item.size === step.to);
    if (range) {
      const patches = [{ from: range.start, to: range.end, insert: '' }];
      const candidate = applyNativePatches(source, patches);
      if (parse(candidate).doc.eq(tr.doc)) {
        return { patches, candidate, kind: 'block-structure', sourceCaret: range.start };
      }
    }
  }

  const paste = pastePlan(source, state, tr, position, fallbackEol);
  if (paste) return paste;
  const inputRule = inputRulePlan(source, tr, position, fallbackEol);
  if (inputRule) return inputRule;

  const taskToggle = taskTogglePlan(source, state, tr, position);
  if (taskToggle) return taskToggle;

  const insertedTable = insertTablePlan(source, state, tr, ranges, fallbackEol);
  if (insertedTable) return insertedTable;

  const table = tableCommandPlan(source, state, tr, ranges, fallbackEol);
  if (table) return table;
  const imageAttributes = imageAttributePlan(source, state, step, position);
  if (imageAttributes) return imageAttributes;

  const mark = markPlan(source, state, tr, position);
  if (mark) return mark;
  const attrs = attrPlan(source, state, tr, ranges);
  if (attrs) return attrs;
  if (tr.getMeta('inkoraEmptyParagraphAfterList') === true && state.selection.empty &&
      state.selection.$from.depth === 1 && state.selection.$from.parent.type.name === 'paragraph' &&
      state.selection.$from.parent.content.size === 0 &&
      state.selection.$from.after() === state.doc.content.size && tr.steps.length === 1) {
    const previous = ranges.at(-1);
    if (previous && ['bullet_list', 'ordered_list'].includes(previous.kind) &&
        /^[\r\n]+$/.test(source.slice(previous.end)) &&
        tr.doc.eq(state.doc.copy(state.doc.content.cut(0, state.selection.$from.before())))) {
      const patches = [{ from: previous.end, to: source.length, insert: '' }];
      const candidate = applyNativePatches(source, patches);
      if (parse(candidate).doc.eq(tr.doc)) return { patches, candidate, kind: 'paragraph-join', sourceCaret: previous.end };
    }
  }
  const structure = structuralPlan(source, state, tr, ranges, position, fallbackEol);
  if (structure) return structure;

  const codeExit = codeExitPlan(source, state, tr, ranges, fallbackEol);
  if (codeExit) return codeExit;

  const insert = textSlice(step);
  if (insert !== null) {
    const trailingSpace = trailingMarkedSpacePlan(source, state, tr, ranges, ledger);
    if (trailingSpace) return trailingSpace;
    const inlineCode = inlineCodePlan(source, state, step, insert, position);
    if (inlineCode) return inlineCode;
    let from: number;
    let to: number;
    if (!ranges.length && onlyEmptyParagraph(state) && step.from === 1 && step.to === 1) {
      from = to = emptySourceAnchor(source);
    } else {
      from = position(step.from, 'from');
      to = position(step.to, 'to');
    }
    if (from > to || (step.from === step.to && from !== to)) throw Error('选区边界无法唯一映射到原文');
    const inTableCell = selectionInsideTableCell(state, step.from, step.to);
    const visibleInsert = inTableCell ? encodeTableCellText(insert) : insert;
    const sourceInsert = visibleInsert.replace(/\n/g, eolForLine(source, from, fallbackEol));
    const resolved = state.doc.resolve(step.from);
    if (!inTableCell && step.from === step.to && resolved.depth >= 2 &&
        resolved.parent.type.name === 'paragraph' && resolved.parent.content.size === 0 &&
        resolved.node(-1).type.name === 'list_item' && resolved.node(-1).attrs.task === true &&
        resolved.index(-1) === 0 && /^[^\s]/u.test(sourceInsert) &&
        /^\[[ xX]\]$/.test(source.slice(Math.max(0, from - 3), from))) {
      // The empty task's label has no visible separator yet. Add only the
      // necessary source space, and keep the already accepted task structure.
      const patches = [{ from, to, insert: ` ${sourceInsert}` }];
      const candidate = applyNativePatches(source, patches);
      const parsed = parse(candidate);
      if (!parsed.issues.length && parsed.doc.eq(tr.doc)) {
        return { patches, candidate, kind: 'text', sourceCaret: from + patches[0].insert.length };
      }
    }
    if (inTableCell) {
      const spellings = [sourceInsert];
      if (step.from === step.to && sourceInsert.length > 0) {
        spellings.push(source[from] === '|' ? `| ${sourceInsert} ` : ` | ${sourceInsert}`);
      }
      const matches = spellings.map(spelling => {
        const tablePatches = [{ from, to, insert: spelling }];
        return { patches: tablePatches, candidate: applyNativePatches(source, tablePatches) };
      }).filter(candidate => {
        try { return parse(candidate.candidate).doc.eq(tr.doc); } catch { return false; }
      });
      const unique = matches.filter((candidate, index, all) =>
        all.findIndex(other => other.candidate === candidate.candidate) === index);
      if (unique.length !== 1) throw Error('表格单元格文字没有唯一的最小原文候选');
      return { ...unique[0], kind: 'table-text' };
    }
    const patches = [{ from, to, insert: sourceInsert }];
    return { patches, candidate: applyNativePatches(source, patches), kind: ranges.length ? 'text' : 'empty-text' };
  }

  const split = splitPlan(source, state, tr, ranges, position, fallbackEol);
  if (split) return split;
  const listJoin = listJoinPlan(source, state, tr, position);
  if (listJoin) return listJoin;
  const paragraphJoin = paragraphJoinPlan(source, state, tr, ranges, position);
  if (paragraphJoin) return paragraphJoin;
  throw Error(`该原生事务尚未支持（${step.stepType ?? 'unknown'}）；可信原文与 PM 状态保持不变`);
}

function mapSourceAnchor(anchor: number, patch: NativePatch): number {
  if (anchor < patch.from) return anchor;
  if (anchor > patch.to) return anchor + patch.insert.length - (patch.to - patch.from);
  return patch.from + patch.insert.length;
}

export function advanceStagedText(
  candidate: string,
  anchors: readonly NativeAnchor[],
  state: EditorState,
  tr: Transaction,
  position: SourcePosition,
): { candidate: string; patch: NativePatch; anchors: NativeAnchor[] } {
  if (tr.steps.length !== 1) throw Error('暂存结构之后仅接受单步文字事务');
  const step = tr.steps[0].toJSON() as Record<string, any>;
  const insert = textSlice(step);
  if (insert === null) throw Error('暂存结构之后的非文字事务尚未支持');
  const from = position(step.from, step.from === step.to ? 'any' : 'from');
  const to = step.from === step.to ? from : position(step.to, 'to');
  if (from > to || (step.from === step.to && from !== to)) throw Error('暂存选区边界无法唯一映射到候选原文');
  const patch = { from, to, insert };
  const targetSelection = tr.selection;
  const mapped = anchors.map(anchor => ({
    pmPos: tr.mapping.map(anchor.pmPos, 1),
    sourceOffset: mapSourceAnchor(anchor.sourceOffset, patch),
  }));
  // Keep both sides of every staged replacement explicit. In particular,
  // sequential spaces need the boundary before each newly inserted byte so a
  // later caret move/selection never guesses through an unprojected suffix.
  mapped.push(
    { pmPos: tr.mapping.map(step.from, -1), sourceOffset: patch.from },
    { pmPos: tr.mapping.map(step.to, 1), sourceOffset: patch.from + insert.length },
  );
  if (targetSelection.empty && tr.selectionSet) mapped.push({
    pmPos: targetSelection.from,
    sourceOffset: patch.from + insert.length,
  });
  const deduped = mapped.filter((anchor, index, all) => all.findIndex(item => item.pmPos === anchor.pmPos && item.sourceOffset === anchor.sourceOffset) === index);
  return {
    candidate: applyNativePatches(candidate, [patch]),
    patch,
    anchors: deduped,
  };
}

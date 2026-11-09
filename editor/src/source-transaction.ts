import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { parse } from './source-document';

export type NativeRange = { start: number; end: number; pos: number; size: number; kind: string };
export type NativePatch = { from: number; to: number; insert: string };
export type NativeAnchor = { pmPos: number; sourceOffset: number };

export type NativePlan = {
  patches: NativePatch[];
  candidate: string;
  kind: 'text' | 'empty-text' | 'paste' | 'inline-code' | 'inline-mark' | 'block-structure' | 'projection-sync' | 'heading-level' | 'fence-language' | 'paragraph-split' | 'paragraph-join' | 'list-split' | 'list-join' | 'code-exit';
  /** A Markdown source cannot represent a newly-created empty paragraph. */
  mayStage?: boolean;
  /** Source caret in candidate coordinates, used only while a split is staged. */
  sourceCaret?: number;
};

type SourcePosition = (position: number, side?: 'from' | 'to' | 'any') => number;

function pastePlan(
  source: string,
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
  const insert = paste.source.replace(/\r\n?|\n/g, `${eol}${eol}`);
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
    if (parse(candidate).issues.length) return null;
  } catch {
    return null;
  }
  return { patches, candidate, kind: 'projection-sync' };
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
  const atx = /^(#{1,6})([\t ]+)/.exec(raw);
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

function splitPlan(
  source: string,
  state: EditorState,
  tr: Transaction,
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
    const marker = /^(\s*)([-+*]|\d+[.)])([\t ]+)/.exec(prefix);
    if (!marker) throw Error('列表项标记无法从当前源行安全定位');
    const insertion = `${eol}${marker[1]}${marker[2]}${marker[3]}`;
    const patches = [{ from: anchor, to: anchor, insert: insertion }];
    return { patches, candidate: applyNativePatches(source, patches), kind: 'list-split', mayStage: true, sourceCaret: anchor + insertion.length };
  }
  if (state.selection.$from.parent.type.name === 'paragraph' && countType(tr.doc, 'paragraph') === countType(state.doc, 'paragraph') + 1) {
    const insertion = eol + eol;
    const patches = [{ from: anchor, to: anchor, insert: insertion }];
    return { patches, candidate: applyNativePatches(source, patches), kind: 'paragraph-split', mayStage: true, sourceCaret: anchor + insertion.length };
  }
  return null;
}

function paragraphJoinPlan(source: string, state: EditorState, tr: Transaction, ranges: readonly NativeRange[]): NativePlan | null {
  if (!state.selection.empty || countType(tr.doc, 'paragraph') >= countType(state.doc, 'paragraph')) return null;
  const caret = state.selection.from;
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
  if (!state.selection.empty || countType(tr.doc, 'list_item') >= countType(state.doc, 'list_item')) return null;
  const contentStart = position(state.selection.from, 'from');
  const lineStart = source.lastIndexOf('\n', Math.max(0, contentStart - 1)) + 1;
  const prefix = source.slice(lineStart, contentStart);
  if (!/^(\s*)([-+*]|\d+[.)])[\t ]+$/.test(prefix)) throw Error('列表 join 的行标记无法安全定位');
  let separatorStart = lineStart;
  if (separatorStart > 0 && source[separatorStart - 1] === '\n') {
    separatorStart--;
    if (separatorStart > 0 && source[separatorStart - 1] === '\r') separatorStart--;
  }
  const patches = [{ from: separatorStart, to: contentStart, insert: '' }];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'list-join' };
}

export function planNativeTransaction(
  source: string,
  state: EditorState,
  ranges: readonly NativeRange[],
  tr: Transaction,
  position: SourcePosition,
  fallbackEol: '\r\n' | '\n' = '\n',
): NativePlan {
  if (!tr.docChanged) throw Error('原生补丁规划器只接受文档事务');
  const supplemental = tr.steps.slice(1).map(step => step.toJSON() as Record<string, any>);
  if (supplemental.some(step => step.stepType !== 'addMark' && step.stepType !== 'removeMark' && !(step.stepType === 'replace' && step.structure))) throw Error('该多步原生事务尚未支持；可信原文与 PM 状态保持不变');
  const step = tr.steps[0].toJSON() as Record<string, any>;

  try {
    if (parse(source).doc.eq(tr.doc)) {
      return { patches: [], candidate: source, kind: 'projection-sync' };
    }
  } catch {
    // The session owns the diagnostic for malformed source. Continue through
    // the explicit local planners; none may accept by parser failure alone.
  }

  const paste = pastePlan(source, tr, position, fallbackEol);
  if (paste) return paste;
  const inputRule = inputRulePlan(source, tr, position, fallbackEol);
  if (inputRule) return inputRule;

  const mark = markPlan(source, state, tr, position);
  if (mark) return mark;
  const attrs = attrPlan(source, state, tr, ranges);
  if (attrs) return attrs;
  const structure = structuralPlan(source, state, tr, ranges, position, fallbackEol);
  if (structure) return structure;

  const codeExit = codeExitPlan(source, state, tr, ranges, fallbackEol);
  if (codeExit) return codeExit;

  const insert = textSlice(step);
  if (insert !== null) {
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
    const sourceInsert = insert.replace(/\n/g, eolForLine(source, from, fallbackEol));
    const patches = [{ from, to, insert: sourceInsert }];
    return { patches, candidate: applyNativePatches(source, patches), kind: ranges.length ? 'text' : 'empty-text' };
  }

  const split = splitPlan(source, state, tr, position, fallbackEol);
  if (split) return split;
  const listJoin = listJoinPlan(source, state, tr, position);
  if (listJoin) return listJoin;
  const paragraphJoin = paragraphJoinPlan(source, state, tr, ranges);
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

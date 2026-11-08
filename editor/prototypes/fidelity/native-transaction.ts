// PROTOTYPE: translate a deliberately bounded set of native ProseMirror
// transactions into byte-local Markdown source patches. This module never
// serializes a block or document; callers still own re-parse/doc.eq checks.
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';

export type NativeRange = { start: number; end: number; pos: number; size: number; kind: string };
export type NativePatch = { from: number; to: number; insert: string };
export type NativeAnchor = { pmPos: number; sourceOffset: number };

export type NativePlan = {
  patches: NativePatch[];
  candidate: string;
  kind: 'text' | 'empty-text' | 'inline-code' | 'remove-strong' | 'heading-level' | 'fence-language' | 'paragraph-split' | 'paragraph-join' | 'list-split' | 'list-join';
  /** A Markdown source cannot represent a newly-created empty paragraph. */
  mayStage?: boolean;
  /** Source caret in candidate coordinates, used only while a split is staged. */
  sourceCaret?: number;
};

type SourcePosition = (position: number, side?: 'from' | 'to' | 'any') => number;

export function applyNativePatches(source: string, patches: readonly NativePatch[]): string {
  let candidate = source;
  for (const patch of [...patches].sort((a, b) => b.from - a.from)) {
    if (patch.from < 0 || patch.to < patch.from || patch.to > candidate.length) throw Error('原文补丁范围无效');
    candidate = candidate.slice(0, patch.from) + patch.insert + candidate.slice(patch.to);
  }
  return candidate;
}

function eolForLine(source: string, offset: number): '\r\n' | '\n' {
  const after = source.slice(offset).match(/\r\n|\n/);
  if (after) return after[0] as '\r\n' | '\n';
  const before = source.slice(0, offset).match(/(?:\r\n|\n)(?![\s\S]*(?:\r\n|\n))/);
  return (before?.[0] ?? '\n') as '\r\n' | '\n';
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

function removeStrongPlan(source: string, step: Record<string, any>, position: SourcePosition): NativePlan | null {
  if (step.stepType !== 'removeMark' || step.mark?.type !== 'strong') return null;
  const from = position(step.from, 'from');
  const to = position(step.to, 'to');
  const open = source.slice(Math.max(0, from - 2), from);
  const close = source.slice(to, to + 2);
  if (!['**', '__'].includes(open) || close !== open) throw Error('strong 定界符不是可安全局部删除的成对写法');
  const patches = [{ from: to, to: to + 2, insert: '' }, { from: from - 2, to: from, insert: '' }];
  return { patches, candidate: applyNativePatches(source, patches), kind: 'remove-strong' };
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

function splitPlan(source: string, state: EditorState, tr: Transaction, position: SourcePosition): NativePlan | null {
  if (!state.selection.empty || tr.doc.content.size <= state.doc.content.size) return null;
  const step = tr.steps[0]?.toJSON() as Record<string, any> | undefined;
  if (!step || step.stepType !== 'replace' || step.from !== step.to) return null;
  const anchor = position(state.selection.from, 'any');
  const eol = eolForLine(source, anchor);
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
): NativePlan {
  if (!tr.docChanged) throw Error('原生补丁规划器只接受文档事务');
  const supplemental = tr.steps.slice(1).map(step => step.toJSON() as Record<string, any>);
  if (supplemental.some(step => step.stepType !== 'addMark' && !(step.stepType === 'replace' && step.structure))) throw Error('该多步原生事务尚未支持；可信原文与 PM 状态保持不变');
  const step = tr.steps[0].toJSON() as Record<string, any>;

  const removeStrong = removeStrongPlan(source, step, position);
  if (removeStrong) return removeStrong;
  const attrs = attrPlan(source, state, tr, ranges);
  if (attrs) return attrs;

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
    const patches = [{ from, to, insert }];
    return { patches, candidate: applyNativePatches(source, patches), kind: ranges.length ? 'text' : 'empty-text' };
  }

  const split = splitPlan(source, state, tr, position);
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

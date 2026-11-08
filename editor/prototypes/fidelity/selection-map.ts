// PROTOTYPE (INK-PROT-006): pure bidirectional selection mapping between
// the visual ProseMirror document and the canonical raw Markdown source.
// Not imported by production entries or the prototype UI yet.
//
// Coordinates (never mixed):
// - visual: PM doc positions, UTF-16 code units (surrogate pairs count 2).
// - raw: offsets into the canonical source string, UTF-16 code units,
//   with BOM/CRLF bytes included.
// - lf: offsets into the LF-normalized draft text a textarea shows.
//
// All exported functions are pure: no DOM, no globals, no model mutation.
// Selection direction is preserved because anchor and head are mapped
// independently. Every unresolvable input returns { ok: false, reason }
// instead of guessing (no blind first-occurrence search, no reset to 0).

import type { Node as PMNode } from 'prosemirror-model';
import type { Range } from './model';

export type MapResult =
  | { ok: true; anchor: number; head: number; snapped: string[] }
  | { ok: false; reason: string };

// --- textarea LF offsets <-> canonical raw offsets ------------------------

// A logical line break is a CRLF pair, a lone CR, or a lone LF — the same
// inventory the production TextAreaEditorKernel restores on read.
function eolLength(text: string, i: number): number {
  if (text[i] === '\r') return text[i + 1] === '\n' ? 2 : 1;
  return text[i] === '\n' ? 1 : 0;
}

export function lfText(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; ) {
    const eol = eolLength(source, i);
    if (eol) { out += '\n'; i += eol; } else { out += source[i]; i++; }
  }
  return out;
}

// Raw offset -> LF offset. An offset that splits a CRLF/CR pair is treated
// as the end of that line (the pair is not counted). Out-of-range offsets
// are clamped to [0, source.length].
export function rawToLf(source: string, rawOffset: number): number {
  const limit = Math.max(0, Math.min(rawOffset, source.length));
  let lf = 0;
  for (let i = 0; i < limit; ) {
    const eol = eolLength(source, i);
    if (eol && i + eol > limit) break; // splits a pair: stay at line end
    lf++; i += eol || 1;
  }
  return lf;
}

// LF offset -> raw offset. Exact inverse of rawToLf for offsets that do not
// split a pair. Throws RangeError when lfOffset leaves the LF text.
export function lfToRaw(source: string, lfOffset: number): number {
  const total = lfText(source).length;
  if (lfOffset < 0 || lfOffset > total) throw new RangeError(`lfOffset ${lfOffset} 超出 LF 文本范围 0..${total}`);
  let lf = 0;
  for (let i = 0; i < source.length; ) {
    if (lf >= lfOffset) return i;
    lf++; i += eolLength(source, i) || 1;
  }
  return source.length;
}

// --- per-block alignment between PM text leaves and raw Markdown ----------

type Leaf = { docStart: number; text: string };
type Align = { rawStart: number; rawEnd: number }; // in normalized block text
type Block = { range: Range; leaves: Leaf[]; align: Align[]; error?: string };

// Sequential alignment: leaf k must match after leaf k-1 (forward) and
// before leaf k+1 (backward). Forward and backward results must agree, so
// genuinely ambiguous repeats are rejected instead of guessed.
function alignSequence(normalized: string, leaves: Leaf[], backward: boolean): number[] | string {
  const found = new Array<number>(leaves.length);
  let from = 0, to = normalized.length - 1;
  for (let step = 0; step < leaves.length; step++) {
    const i = backward ? leaves.length - 1 - step : step;
    const text = leaves[i].text;
    const at = backward ? normalized.lastIndexOf(text, to) : normalized.indexOf(text, from);
    if (at < 0) return `文本叶 ${JSON.stringify(text.slice(0, 24))} 未在所属块原文中找到（转义或规范化差异）`;
    found[i] = at;
    if (backward) to = at - 1; else from = at + text.length;
  }
  return found;
}

function blocksFor(source: string, doc: PMNode, ranges: Range[]): Block[] {
  return ranges.map(range => {
    const leaves: Leaf[] = [];
    doc.nodesBetween(range.pos, range.pos + range.size, (node, pos) => {
      if (node.isText && node.text) leaves.push({ docStart: pos, text: node.text });
    });
    const block: Block = { range, leaves, align: [] };
    if (!leaves.length) {
      block.error = range.kind === 'protected_block'
        ? `受保护块（原文 ${range.start}..${range.end}）内部没有可视文本锚点；请整块操作或使用源码模式`
        : `块（原文 ${range.start}..${range.end}，${range.kind}）内没有可视文本`;
      return block;
    }
    const normalized = source.slice(range.start, range.end).replace(/\r\n/g, '\n');
    const forward = alignSequence(normalized, leaves, false);
    if (typeof forward === 'string') { block.error = forward; return block; }
    const backward = alignSequence(normalized, leaves, true);
    if (typeof backward === 'string') { block.error = backward; return block; }
    for (let i = 0; i < leaves.length; i++)
      if (forward[i] !== backward[i]) {
        block.error = `块内重复文本无法唯一对齐（第 ${i + 1} 个文本叶 ${JSON.stringify(leaves[i].text.slice(0, 24))} 有多个候选原文位置）`;
        return block;
      }
    block.align = leaves.map((_, i) => ({ rawStart: forward[i], rawEnd: forward[i] + leaves[i].text.length }));
    return block;
  });
}

// --- normalized <-> raw offsets inside one block's raw text ---------------

function toRawOffset(raw: string, normalizedOffset: number): number {
  let units = 0, i = 0;
  while (units < normalizedOffset && i < raw.length) {
    if (raw[i] === '\r' && raw[i + 1] === '\n') i++;
    i++; units++;
  }
  return i;
}

// Returns [normalizedOffset, splitPair]; an offset splitting a CRLF stops
// before the pair (line end), matching rawToLf semantics.
function toNormalizedOffset(raw: string, rawOffset: number): [number, boolean] {
  let units = 0, i = 0;
  while (i < rawOffset) {
    const pair = raw[i] === '\r' && raw[i + 1] === '\n';
    if (pair && i + 2 > rawOffset) return [units, true];
    i += pair ? 2 : 1; units++;
  }
  return [units, false];
}

function fail(error: unknown): MapResult {
  return { ok: false, reason: error instanceof Error ? error.message : String(error) };
}

// --- visual (PM positions) -> raw Markdown UTF-16 offsets -----------------

export function visualToSource(source: string, doc: PMNode, ranges: Range[], anchor: number, head: number): MapResult {
  const snapped: string[] = [];
  const blocks = blocksFor(source, doc, ranges);
  const one = (end: 'anchor' | 'head', p: number): number => {
    if (!ranges.length) throw Error('文档没有可映射的内容块');
    if (p < 0 || p > doc.content.size) throw Error(`选区 ${end} 端 PM 位置 ${p} 越界（0..${doc.content.size}）`);
    // 1. Exact hit: p inside a text leaf (or at either edge). Adjacent text
    //    nodes share an edge position; the left leaf wins deterministically.
    for (const block of blocks) {
      if (block.error) continue;
      for (let i = 0; i < block.leaves.length; i++) {
        const leaf = block.leaves[i];
        if (p >= leaf.docStart && p <= leaf.docStart + leaf.text.length) {
          const raw = source.slice(block.range.start, block.range.end);
          const n = block.align[i].rawStart + (p - leaf.docStart);
          return block.range.start + toRawOffset(raw, n);
        }
      }
    }
    // 2. Snap inside the top-level block that contains p.
    const owner = ranges.find(r => p >= r.pos && p < r.pos + r.size);
    if (owner) {
      const block = blocks.find(b => b.range === owner)!;
      if (block.error) throw Error(block.error);
      const raw = source.slice(owner.start, owner.end);
      if (p < block.leaves[0].docStart) {
        snapped.push(`选区 ${end} 端位于块起始语法/边界，吸附到内容起点`);
        return owner.start + toRawOffset(raw, block.align[0].rawStart);
      }
      const last = block.leaves.length - 1;
      if (p > block.leaves[last].docStart + block.leaves[last].text.length) {
        snapped.push(`选区 ${end} 端位于块尾边界，吸附到内容末尾`);
        return owner.start + toRawOffset(raw, block.align[last].rawEnd);
      }
      const rightIndex = block.leaves.findIndex(leaf => leaf.docStart > p);
      if (rightIndex < 0) throw Error(`选区 ${end} 端（PM ${p}）无法在所属块内定位文本锚点`);
      snapped.push(`选区 ${end} 端位于行内非文本节点，吸附到右侧文本起点`);
      return owner.start + toRawOffset(raw, block.align[rightIndex].rawStart);
    }
    // 3. Outside every block (doc end): snap to the last content end.
    const candidates = blocks.filter(b => !b.error && b.range.pos + b.range.size <= p);
    if (!candidates.length) throw Error(`选区 ${end} 端（PM ${p}）位于没有可映射文本的文档区域`);
    const block = candidates[candidates.length - 1];
    const last = block.leaves.length - 1;
    snapped.push(`选区 ${end} 端位于文档末尾/块外，吸附到「${block.range.kind}」块内容末尾`);
    return block.range.start + toRawOffset(source.slice(block.range.start, block.range.end), block.align[last].rawEnd);
  };
  try {
    const a = one('anchor', anchor), h = one('head', head);
    return { ok: true, anchor: a, head: h, snapped };
  } catch (error) { return fail(error); }
}

// --- raw Markdown UTF-16 offsets -> visual (PM positions) -----------------

export function sourceToVisual(source: string, doc: PMNode, ranges: Range[], anchor: number, head: number): MapResult {
  const snapped: string[] = [];
  const blocks = blocksFor(source, doc, ranges);
  const one = (end: 'anchor' | 'head', off: number): number => {
    if (!ranges.length) throw Error('文档没有可映射的内容块');
    if (off < 0 || off > source.length) throw Error(`选区 ${end} 端原文偏移 ${off} 越界（0..${source.length}）`);
    const owner = ranges.find(r => off >= r.start && off <= r.end);
    if (owner) {
      const block = blocks.find(b => b.range === owner)!;
      if (block.error) throw Error(block.error);
      const raw = source.slice(owner.start, owner.end);
      const [n, split] = toNormalizedOffset(raw, off - owner.start);
      if (split) snapped.push(`选区 ${end} 端位于 CRLF 中间，按行尾处理`);
      for (let i = 0; i < block.leaves.length; i++) {
        const a = block.align[i];
        if (n >= a.rawStart && n <= a.rawEnd) return block.leaves[i].docStart + (n - a.rawStart);
      }
      if (n < block.align[0].rawStart) {
        snapped.push(`选区 ${end} 端位于块语法前缀（#、>、列表标记等），吸附到内容起点`);
        return block.leaves[0].docStart;
      }
      const last = block.leaves.length - 1;
      if (n > block.align[last].rawEnd) {
        snapped.push(`选区 ${end} 端位于块语法尾部，吸附到内容末尾`);
        return block.leaves[last].docStart + block.leaves[last].text.length;
      }
      for (let i = 0; i < last; i++)
        if (n > block.align[i].rawEnd && n < block.align[i + 1].rawStart) {
          snapped.push(`选区 ${end} 端位于行内定界符区间，吸附到右侧文本起点`);
          return block.leaves[i + 1].docStart;
        }
      throw Error(`选区 ${end} 端（原文 ${off}）在块内无法对齐`);
    }
    // Gap outside every block (BOM, blank lines, reference definitions,
    // trailing newline): prefer the previous content end, else next start.
    const before = blocks.filter(b => b.range.end < off && !b.error);
    if (before.length) {
      const block = before[before.length - 1];
      const last = block.leaves.length - 1;
      snapped.push(`选区 ${end} 端位于块间空白/引用定义/文件尾，吸附到前一块内容末尾`);
      return block.leaves[last].docStart + block.leaves[last].text.length;
    }
    const after = blocks.find(b => b.range.start > off && !b.error);
    if (after) {
      snapped.push(`选区 ${end} 端位于文档头部空白/BOM，吸附到后一块内容起点`);
      return after.leaves[0].docStart;
    }
    throw Error(`选区 ${end} 端偏移 ${off} 没有可映射的内容块`);
  };
  try {
    const a = one('anchor', anchor), h = one('head', head);
    return { ok: true, anchor: a, head: h, snapped };
  } catch (error) { return fail(error); }
}

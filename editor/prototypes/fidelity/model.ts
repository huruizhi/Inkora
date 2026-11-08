// PROTOTYPE: incremental source patches over the real Inkora PM document.
import MarkdownIt from 'markdown-it';
import { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { inkoraSchema as schema } from '../../src/schema';
import { parseMarkdown } from '../../src/markdown-codec';
import { parseProtectedMarkdown } from '../../src/protected-markdown';
import { analyzeMarkdownSafety } from '../../src/markdown-safety';

export type Range = { start: number; end: number; pos: number; size: number; kind: string };
export type Patch = { from: number; to: number; insert: string };
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable(['table', 'strikethrough']);
export const bytes = (s: string) => new TextEncoder().encode(s);
export function diff(a: string, b: string) {
  const x = bytes(a), y = bytes(b);
  let from = 0, xe = x.length, ye = y.length;
  while (from < xe && from < ye && x[from] === y[from]) from++;
  while (xe > from && ye > from && x[xe - 1] === y[ye - 1]) { xe--; ye--; }
  return { from, beforeEnd: xe, afterEnd: ye, removed: [...x.slice(from, xe)], added: [...y.slice(from, ye)], prefixEqual: x.slice(0, from).every((v, i) => v === y[i]), suffixEqual: x.slice(xe).every((v, i) => v === y[ye + i]) };
}
export function parse(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const refs = [...source.matchAll(/^ {0,3}\[[^\]^\n]+\]:[^\n]*(?:\n|$)/gm)].map(m => m[0]).join('\n');
  const ranges: Range[] = [], nodes: PMNode[] = [];
  let cursor = 0, pos = 0;
  const cleanGap = (s: string) => s.replace(/^ {0,3}\[[^\]^\n]+\]:[^\n]*(?:\n|$)/gm, '').trim().length === 0;
  for (const token of tokenizer.parse(source.replace(/^\uFEFF/, ' '), {})) {
    if (token.level !== 0 || !token.map || token.type.endsWith('_close')) continue;
    let start = starts[token.map[0]], end = starts[token.map[1]] ?? source.length;
    if (start < cursor) continue;
    if (start === 0 && source[0] === '\uFEFF') start++;
    if (!cleanGap(source.slice(cursor, start))) throw Error('存在无法归属的原文范围');
    if (source.slice(start, end).endsWith('\r\n')) end -= 2;
    else if (source[end - 1] === '\n') end--;
    const raw = source.slice(start, end), normalized = raw.replace(/\r\n/g, '\n');
    const risks = analyzeMarkdownSafety(normalized).risks;
    let node: PMNode;
    if (risks.some(r => r.code === 'math')) {
      if (!/^\$\$\n[\s\S]*\n\$\$$/.test(normalized)) throw Error('公式边界不明确：保留可信视图并阻断保存');
      node = schema.nodes.protected_block.create({ raw, kind: 'metadata' });
    } else if (token.type === 'fence' && token.info.trim() === 'mermaid') {
      if (!/^(`{3,}|~{3,})mermaid\n[\s\S]*\n(?:`{3,}|~{3,})$/.test(normalized)) throw Error('Mermaid 边界不明确');
      node = schema.nodes.protected_block.create({ raw, kind: 'metadata' });
    } else if (risks.some(r => r.code === 'footnote')) {
      node = schema.nodes.protected_block.create({ raw, kind: 'metadata' });
    } else {
      const protectedDoc = parseProtectedMarkdown(normalized);
      if (protectedDoc && protectedDoc.childCount === 1 && protectedDoc.firstChild?.type.name === 'protected_block') {
        node = schema.nodes.protected_block.create({ raw, kind: protectedDoc.firstChild.attrs.kind });
      } else {
        if (risks.some(r => r.code !== 'task_list')) throw Error('不支持的语法边界：' + risks.map(r => r.code).join(','));
        const parsed = parseMarkdown(normalized + '\n\n' + refs);
        if (parsed.childCount !== 1) throw Error('一个范围对应多个 PM 块');
        node = parsed.firstChild!;
        if (node.type.name === 'code_block' && !node.attrs.closed) throw Error('代码围栏未闭合');
      }
    }
    ranges.push({ start, end, pos, size: node.nodeSize, kind: node.type.name });
    nodes.push(node); pos += node.nodeSize; cursor = end;
  }
  if (!cleanGap(source.slice(cursor))) throw Error('尾部存在无法归属的原文');
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create());
  return { doc: schema.topNodeType.createChecked(null, nodes), ranges };
}
// Each text leaf must occur exactly once inside its top-level source range.
// Ambiguous/escaped/normalized leaves are deliberately unsupported.
export function sourcePosition(source: string, state: EditorState, ranges: Range[], position: number): number {
  let found: number | undefined;
  state.doc.descendants((node, pos) => {
    if (!node.isText || position < pos || position > pos + node.nodeSize) return;
    const range = ranges.find(r => pos >= r.pos && pos < r.pos + r.size);
    if (!range) return;
    const raw = source.slice(range.start, range.end), normalized = raw.replace(/\r\n/g, '\n');
    const text = node.text!;
    const index = normalized.indexOf(text);
    if (index < 0 || normalized.indexOf(text, index + 1) >= 0) return;
    const target = index + position - pos;
    let original = 0, n = 0;
    while (n < target) { if (raw.slice(original, original + 2) === '\r\n') original++; original++; n++; }
    const value = range.start + original;
    if (found !== undefined && found !== value) throw Error('选区边界有多个原文映射');
    found = value;
  });
  if (found === undefined) throw Error('选区不能安全映射到原文（空段、转义或重复文本）');
  return found;
}
export class FidelityModel {
  source: string; saved: string; state: EditorState; ranges: Range[];
  revision = 0; blocked = ''; patches: Patch[] = []; before: string;
  past: Array<{ source: string; state: EditorState }> = [];
  future: Array<{ source: string; state: EditorState }> = [];
  constructor(source: string) {
    const parsed = parse(source); this.source = this.saved = this.before = source;
    this.ranges = parsed.ranges; this.state = EditorState.create({ doc: parsed.doc });
  }
  commit(source: string, state: EditorState, patches: Patch[]) {
    const parsed = parse(source);
    if (!parsed.doc.eq(state.doc)) throw Error('补丁重解析与目标 PM 文档不一致');
    this.past.push({ source: this.source, state: this.state }); this.future = [];
    this.before = this.source; this.source = source; this.state = state;
    this.ranges = parsed.ranges; this.patches = patches; this.blocked = ''; this.revision++;
  }
  apply(patches: Patch[], tr: Transaction) {
    let candidate = this.source;
    for (const p of [...patches].sort((a, b) => b.from - a.from)) candidate = candidate.slice(0, p.from) + p.insert + candidate.slice(p.to);
    this.commit(candidate, this.state.apply(tr), patches);
  }
  transaction(tr: Transaction) {
    if (!tr.docChanged) { this.state = this.state.apply(tr); return; }
    if (tr.steps.length !== 1) throw Error('仅验证单步文本事务；多步事务已阻断');
    const step = tr.steps[0].toJSON();
    if (step.stepType !== 'replace' || step.structure || step.slice?.openStart || step.slice?.openEnd || step.slice?.content?.some((n: { type: string }) => n.type !== 'text')) throw Error('结构/marks 事务需使用专用演示操作；此次操作已阻断');
    const from = sourcePosition(this.source, this.state, this.ranges, step.from);
    const to = sourcePosition(this.source, this.state, this.ranges, step.to);
    this.apply([{ from, to, insert: (step.slice?.content ?? []).map((n: { text: string }) => n.text).join('') }], tr);
  }
  sourceEdit(source: string) {
    // Byte-identical no-op: keep bytes/dirty/revision/history untouched.
    if (source === this.source) return true;
    const parsed = parse(source);
    // Source -> visual selection mapping is conservative: only preserve exact PM docs.
    const same = parsed.doc.eq(this.state.doc);
    const state = EditorState.create({ doc: parsed.doc, selection: same ? this.state.selection : undefined });
    this.commit(source, state, [{ from: 0, to: this.source.length, insert: source }]);
    return same;
  }
  travel(redo = false) {
    const from = redo ? this.future : this.past, to = redo ? this.past : this.future;
    const entry = from.pop(); if (!entry) return;
    to.push({ source: this.source, state: this.state }); this.before = this.source;
    this.source = entry.source; this.state = entry.state; this.ranges = parse(this.source).ranges;
    this.patches = []; this.blocked = ''; this.revision++;
  }
  select(from: number, to = from) { this.state = this.state.apply(this.state.tr.setSelection(TextSelection.create(this.state.doc, from, to))); }
}

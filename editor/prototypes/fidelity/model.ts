// PROTOTYPE: incremental source patches over the real Inkora PM document.
import MarkdownIt, { type StateCore } from 'markdown-it';
import { Node as PMNode, Schema, type MarkSpec } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { MarkdownParser } from 'prosemirror-markdown';
import { inkoraNodeSpecs, inkoraMarkSpecs, type InkoraNodeName, type InkoraMarkName } from '../../src/schema';
import { inkoraMarkdownParser } from '../../src/markdown-codec';
import { parseProtectedMarkdown } from '../../src/protected-markdown';
import { analyzeMarkdownSafety } from '../../src/markdown-safety';

export type Range = { start: number; end: number; pos: number; size: number; kind: string; issue?: string };
export type Patch = { from: number; to: number; insert: string };
// A boundary issue keeps the raw fragment visible (protected projection),
// marks the problem scope and blocks structured saves. It never fails the load.
export type Issue = { code: string; start: number; end: number; message: string };
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable(['table', 'strikethrough']);
export const bytes = (s: string) => new TextEncoder().encode(s);
export function diff(a: string, b: string) {
  const x = bytes(a), y = bytes(b);
  let from = 0, xe = x.length, ye = y.length;
  while (from < xe && from < ye && x[from] === y[from]) from++;
  while (xe > from && ye > from && x[xe - 1] === y[ye - 1]) { xe--; ye--; }
  return { from, beforeEnd: xe, afterEnd: ye, removed: [...x.slice(from, xe)], added: [...y.slice(from, ye)], prefixEqual: x.slice(0, from).every((v, i) => v === y[i]), suffixEqual: x.slice(xe).every((v, i) => v === y[ye + i]) };
}
// The production schema has no image node. The prototype extends the very
// same node/mark specs with one extra mark: a reference/inline image keeps
// its alt text as real editable text carrying `image_ref` (href/title in
// attrs). No resource loading happens; the `![…][label]` bytes are only ever
// touched by source patches, exactly like every other delimiter form.
const imageRefSpec: MarkSpec = {
  attrs: { href: { default: '' }, title: { default: null } },
  inclusive: false,
  parseDOM: [{ tag: 'span[data-image-ref]' }],
  toDOM: mark => ['span', { 'data-image-ref': mark.attrs.href, class: 'image-ref', title: mark.attrs.title ?? undefined }, 0],
};
export const schema = new Schema<InkoraNodeName, InkoraMarkName | 'image_ref'>({ nodes: inkoraNodeSpecs, marks: { ...inkoraMarkSpecs, image_ref: imageRefSpec } });
// Core rulers replicated verbatim from src/markdown-codec.ts so the prototype
// tokenizer behaves exactly like the production one (fence closure metadata +
// softbreaks kept as literal "\n" text instead of spaces).
function annotateFenceClosure(state: StateCore): void {
  const env = state.env;
  const source = env && typeof env === 'object' && 'source' in env && typeof env.source === 'string' ? env.source : '';
  const lines = source.split(/\r?\n/);
  for (const token of state.tokens) {
    if (token.type !== 'fence' || !token.map || token.markup.length < 3) continue;
    const closingLine = lines[token.map[1] - 1] ?? '';
    const marker = token.markup[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const closed = new RegExp(`^ {0,3}${marker}{${token.markup.length},}[\\t ]*$`).test(closingLine);
    token.meta = { ...token.meta, inkoraClosed: closed };
  }
}
function preserveSoftBreaks(state: StateCore): void {
  for (const token of state.tokens) {
    for (const child of token.children ?? []) {
      if (child.type === 'softbreak') { child.type = 'text'; child.tag = ''; child.content = '\n'; }
    }
  }
}
const inlineTokenizer = new MarkdownIt('commonmark', { breaks: false, html: false, linkify: false }).enable('strikethrough');
inlineTokenizer.core.ruler.after('block', 'inkora_fence_closure', annotateFenceClosure);
inlineTokenizer.core.ruler.after('inline', 'inkora_soft_breaks', preserveSoftBreaks);
// Production token specs reused verbatim (inkoraMarkdownParser.tokens is the
// public copy point); the only addition is `image` → image_ref mark so image
// tokens are no longer an unsupported-token hard failure.
export const markdownParser = new MarkdownParser(schema, inlineTokenizer, {
  ...inkoraMarkdownParser.tokens,
  image: { mark: 'image_ref', noCloseToken: true, getAttrs: token => ({ href: token.attrGet('src') ?? '', title: token.attrGet('title') || null }) },
});
export function parse(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const refs = [...source.matchAll(/^ {0,3}\[[^\]^\n]+\]:[^\n]*(?:\n|$)/gm)].map(m => m[0]).join('\n');
  const ranges: Range[] = [], nodes: PMNode[] = [], issues: Issue[] = [];
  let cursor = 0, pos = 0;
  // Reference gaps also admit footnote-style labels: markdown-it consumes
  // `[^1]: def` lines as reference definitions, so they can only be gap bytes.
  const cleanGap = (s: string) => s.replace(/^ {0,3}\[[^\]\n]+\]:[^\n]*(?:\n|$)/gm, '').trim().length === 0;
  for (const token of tokenizer.parse(source.replace(/^\uFEFF/, ' '), {})) {
    if (token.level !== 0 || !token.map || token.type.endsWith('_close')) continue;
    let start = starts[token.map[0]], end = starts[token.map[1]] ?? source.length;
    if (start < cursor) continue;
    if (start === 0 && source[0] === '\uFEFF') start++;
    if (!cleanGap(source.slice(cursor, start))) throw Error('存在无法归属的原文范围');
    if (source.slice(start, end).endsWith('\r\n')) end -= 2;
    else if (source[end - 1] === '\n') end--;
    const raw = source.slice(start, end), normalized = raw.replace(/\r\n/g, '\n');
    // Comment interiors are literal: mask them (length-preserving) before any
    // math/mermaid boundary decision so `$x$` inside `<!-- -->` stays literal.
    const masked = normalized.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
    const risks = analyzeMarkdownSafety(normalized).risks;
    const maskedRisks = analyzeMarkdownSafety(masked).risks;
    const protect = () => schema.nodes.protected_block.create({ raw, kind: 'metadata' });
    let node: PMNode, issue: Issue | undefined;
    if (/^\$\$\n[\s\S]*\n\$\$$/.test(masked)) {
      node = protect(); // 稳定可识别的块级数学围栏：整段原字节保留
    } else if (token.type === 'fence' && token.info.trim() === 'mermaid' && /^(`{3,}|~{3,})mermaid\n[\s\S]*\n(?:`{3,}|~{3,})$/.test(masked)) {
      node = protect();
    } else if (maskedRisks.some(r => r.code === 'math')) {
      issue = { code: 'math', start, end, message: /^\$\$[ \t]*$/m.test(masked) ? '数学围栏未闭合或边界不明确（缺少配对 $$ 行）：已保留原文片段并阻断结构化保存' : '数学语法非围栏形态（行内 $ 定界）：边界不明确，已保留原文片段并阻断结构化保存' };
      node = protect();
    } else if (token.type === 'fence' && token.info.trim() === 'mermaid') {
      issue = { code: 'mermaid', start, end, message: 'Mermaid 围栏未闭合或边界不明确：已保留原文片段并阻断结构化保存' };
      node = protect();
    } else if (risks.some(r => r.code === 'raw_html')) {
      node = protect(); // HTML 注释/标签：整段原文保留，内部 $、[[ 等按字面量处理
    } else if (risks.some(r => r.code === 'obsidian_callout' || r.code === 'footnote')) {
      node = protect(); // callout / 脚注片段：与正文混排，原字节保留
    } else {
      const protectedDoc = parseProtectedMarkdown(normalized);
      if (protectedDoc && protectedDoc.childCount === 1 && protectedDoc.firstChild?.type.name === 'protected_block') {
        node = schema.nodes.protected_block.create({ raw, kind: protectedDoc.firstChild.attrs.kind });
      } else {
        // Bare URLs stay plain text (tokenizer linkify is off) and reference
        // links/images resolve against the appended definitions into real
        // link/image_ref marks — display text, href/title and delimiter forms
        // all stay separated. Every other risk code keeps the existing refusal.
        if (risks.some(r => !['task_list', 'gfm_autolink', 'image'].includes(r.code))) throw Error('不支持的语法边界：' + risks.map(r => r.code).join(','));
        const text = normalized + '\n\n' + refs;
        const parsed = markdownParser.parse(text, { source: text });
        if (parsed.childCount !== 1) throw Error('一个范围对应多个 PM 块');
        node = parsed.firstChild!;
        if (node.type.name === 'code_block' && !node.attrs.closed) {
          issue = { code: 'code_fence', start, end, message: '代码围栏未闭合：已保留原文片段并阻断结构化保存' };
          node = protect();
        }
      }
    }
    const range: Range = { start, end, pos, size: node.nodeSize, kind: node.type.name };
    if (issue) { range.issue = issue.message; issues.push(issue); }
    ranges.push(range);
    nodes.push(node); pos += node.nodeSize; cursor = end;
  }
  if (!cleanGap(source.slice(cursor))) throw Error('尾部存在无法归属的原文范围');
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create());
  return { doc: schema.topNodeType.createChecked(null, nodes), ranges, issues };
}
// Leaves align to their range source in document order (markdown-it emits
// inline tokens in source order): each leaf must match at/after the previous
// leaf's end, so repeated display texts map to their own occurrence instead of
// the first one. Leaves whose text is normalized away (escapes, entities)
// stay unmapped and edits touching them are refused. Wrong alignments cannot
// survive: every patch still passes the re-parse + doc.eq guard.
function leafAlignment(state: EditorState, range: Range, normalized: string): Map<number, number> {
  const order = new Map<number, number>();
  let cursor = 0;
  state.doc.descendants((node, pos) => {
    if (!node.isText || pos < range.pos || pos >= range.pos + range.size) return;
    const index = normalized.indexOf(node.text!, cursor);
    if (index < 0) return;
    order.set(pos, index);
    cursor = index + node.text!.length;
  });
  return order;
}
// Map a PM position to a source offset. `side` disambiguates leaf boundaries:
// a replace step maps its `from` with the leaf that starts there and its `to`
// with the leaf that ends there; "any" keeps the legacy inclusive behavior.
export function sourcePosition(source: string, state: EditorState, ranges: Range[], position: number, side: 'from' | 'to' | 'any' = 'any'): number {
  let found: number | undefined;
  const cache = new Map<Range, Map<number, number>>();
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const end = pos + node.nodeSize;
    const inside = side === 'from' ? pos <= position && position < end : side === 'to' ? pos < position && position <= end : pos <= position && position <= end;
    if (!inside) return;
    const range = ranges.find(r => pos >= r.pos && pos < r.pos + r.size);
    if (!range) return;
    const raw = source.slice(range.start, range.end);
    let alignment = cache.get(range);
    if (!alignment) { alignment = leafAlignment(state, range, raw.replace(/\r\n/g, '\n')); cache.set(range, alignment); }
    const index = alignment.get(pos);
    if (index === undefined) return;
    const target = index + (position - pos);
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
  source: string; saved: string; state: EditorState; ranges: Range[]; issues: Issue[] = [];
  // Last clean (re-parse safe) snapshot; repair restores it byte-exactly.
  trusted: { source: string; state: EditorState };
  revision = 0; blocked = ''; patches: Patch[] = []; before: string;
  past: Array<{ source: string; state: EditorState }> = [];
  future: Array<{ source: string; state: EditorState }> = [];
  constructor(source: string) {
    const parsed = parse(source); this.source = this.saved = this.before = source;
    this.ranges = parsed.ranges; this.issues = parsed.issues;
    this.state = EditorState.create({ doc: parsed.doc });
    this.trusted = { source, state: this.state };
  }
  get pending() { return this.issues.length > 0; }
  commitClean(source: string, state: EditorState, patches: Patch[]) {
    const parsed = parse(source);
    if (parsed.issues.length || !parsed.doc.eq(state.doc)) throw Error('补丁重解析与目标 PM 文档不一致');
    this.past.push({ source: this.source, state: this.state }); this.future = [];
    this.before = this.source; this.source = source; this.state = state;
    this.ranges = parsed.ranges; this.issues = []; this.patches = patches; this.blocked = ''; this.revision++;
    this.trusted = { source, state };
  }
  // The buffer keeps the user's ambiguous input; the view is the conservative
  // projection of that exact buffer (problem fragment marked as raw). Structured
  // saving is blocked until a fix or undo restores a clean re-parse.
  commitPending(source: string, patches: Patch[]) {
    const parsed = parse(source);
    this.past.push({ source: this.source, state: this.state }); this.future = [];
    this.before = this.source; this.source = source;
    this.state = EditorState.create({ doc: parsed.doc });
    this.ranges = parsed.ranges; this.issues = parsed.issues; this.patches = patches; this.blocked = ''; this.revision++;
  }
  apply(patches: Patch[], tr: Transaction) {
    let candidate = this.source;
    for (const p of [...patches].sort((a, b) => b.from - a.from)) candidate = candidate.slice(0, p.from) + p.insert + candidate.slice(p.to);
    const parsed = parse(candidate);
    if (parsed.issues.length) { this.commitPending(candidate, patches); return; }
    this.commitClean(candidate, this.state.apply(tr), patches);
  }
  transaction(tr: Transaction) {
    if (!tr.docChanged) { this.state = this.state.apply(tr); return; }
    if (tr.steps.length !== 1) throw Error('仅验证单步文本事务；多步事务已阻断');
    const step = tr.steps[0].toJSON();
    if (step.stepType !== 'replace' || step.structure || step.slice?.openStart || step.slice?.openEnd || step.slice?.content?.some((n: { type: string }) => n.type !== 'text')) throw Error('结构/marks 事务需使用专用演示操作；此次操作已阻断');
    const from = sourcePosition(this.source, this.state, this.ranges, step.from, 'from');
    const to = sourcePosition(this.source, this.state, this.ranges, step.to, 'to');
    if (from > to || (step.from === step.to && from !== to)) throw Error('选区边界无法唯一映射到原文（定界符之间或跨叶）；此次操作已阻断');
    const insert = (step.slice?.content ?? []).map((n: { text: string }) => n.text).join('');
    // PM drops inclusive:false marks when their entire text leaf is replaced.
    // Preserve the exact source leaf's marks for a replacement contained in
    // one text node; otherwise the source re-parse would correctly reject the
    // now-unlinked target doc. Insertions at a mark boundary remain untouched.
    if (step.from < step.to && insert) {
      let marks: readonly import('prosemirror-model').Mark[] | undefined;
      this.state.doc.descendants((node, pos) => {
        if (marks || !node.isText || step.from < pos || step.to > pos + node.nodeSize) return;
        marks = node.marks;
      });
      for (const mark of marks ?? []) tr.addMark(step.from, step.from + insert.length, mark);
    }
    this.apply([{ from, to, insert }], tr);
  }
  sourceEdit(source: string) {
    // Byte-identical no-op: keep bytes/dirty/revision/history untouched.
    if (source === this.source) return true;
    const parsed = parse(source);
    // Source -> visual selection mapping is conservative: only preserve exact PM docs.
    const same = parsed.issues.length === 0 && parsed.doc.eq(this.state.doc);
    if (parsed.issues.length) this.commitPending(source, [{ from: 0, to: this.source.length, insert: source }]);
    else this.commitClean(source, EditorState.create({ doc: parsed.doc, selection: same ? this.state.selection : undefined }), [{ from: 0, to: this.source.length, insert: source }]);
    return same;
  }
  travel(redo = false) {
    const from = redo ? this.future : this.past, to = redo ? this.past : this.future;
    const entry = from.pop(); if (!entry) return;
    to.push({ source: this.source, state: this.state }); this.before = this.source;
    this.source = entry.source; this.state = entry.state;
    const parsed = parse(this.source);
    this.ranges = parsed.ranges; this.issues = parsed.issues;
    if (!parsed.issues.length) this.trusted = { source: entry.source, state: entry.state };
    this.patches = []; this.blocked = ''; this.revision++;
  }
  select(from: number, to = from) { this.state = this.state.apply(this.state.tr.setSelection(TextSelection.create(this.state.doc, from, to))); }
}

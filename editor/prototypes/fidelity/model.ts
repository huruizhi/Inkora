// PROTOTYPE: incremental source patches over the real Inkora PM document.
import MarkdownIt, { type StateCore } from 'markdown-it';
import { Node as PMNode, Schema, type MarkSpec } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { MarkdownParser } from 'prosemirror-markdown';
import { inkoraNodeSpecs, inkoraMarkSpecs, type InkoraNodeName, type InkoraMarkName } from '../../src/schema';
import { inkoraMarkdownParser } from '../../src/markdown-codec';
import { parseProtectedMarkdown } from '../../src/protected-markdown';
import { analyzeMarkdownSafety } from '../../src/markdown-safety';
import { advanceStagedText, applyNativePatches, planNativeTransaction, type NativeAnchor, type NativePlan } from './native-transaction';
import {
  buildSourceLedger,
  visualToSource as ledgerVisualToSource,
  type LedgerMapResult,
  type MapOptions,
  type SourceLedger,
} from './source-ledger';
import { installReferenceCapture, referenceLineRanges, referenceSourceSlices } from './reference-context';

export type Range = { start: number; end: number; pos: number; size: number; kind: string; issue?: string };
export type Patch = { from: number; to: number; insert: string };
// A boundary issue keeps the raw fragment visible (protected projection),
// marks the problem scope and blocks structured saves. It never fails the load.
export type Issue = { code: string; start: number; end: number; message: string };
type StagedTransaction = {
  candidate: string;
  anchors: NativeAnchor[];
  kind: string;
};
type HistoryEntry = {
  source: string;
  state: EditorState;
  staged: StagedTransaction | null;
  trusted: { source: string; state: EditorState };
  patches: Patch[];
  before: string;
};

type CompositionHistory = {
  id: unknown;
  before: HistoryEntry;
  past: HistoryEntry[];
  future: HistoryEntry[];
};
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable(['table', 'strikethrough']);
installReferenceCapture(tokenizer);
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
  const blockEnv: Record<string, unknown> = {};
  const blockTokens = tokenizer.parse(source.replace(/^\uFEFF/, ' '), blockEnv);
  // Only definitions accepted by the CommonMark block rule may resolve body
  // references. The simple one-line subset is the prototype's existing
  // supported definition form; multiline definitions remain an explicit
  // unfinished risk rather than falling back to a whole-file regex.
  const refs = referenceSourceSlices(source, referenceLineRanges(blockEnv))
    .filter(raw => /^ {0,3}\[[^\]\n]+\]:[^\n]*(?:\r?\n)?$/.test(raw))
    .join('\n');
  const ranges: Range[] = [], nodes: PMNode[] = [], issues: Issue[] = [];
  let cursor = 0, pos = 0;
  // Reference gaps also admit footnote-style labels: markdown-it consumes
  // `[^1]: def` lines as reference definitions, so they can only be gap bytes.
  const cleanGap = (s: string) => s.replace(/^ {0,3}\[[^\]\n]+\]:[^\n]*(?:\n|$)/gm, '').trim().length === 0;
  for (const token of blockTokens) {
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
// Markdown cannot represent a trailing empty paragraph or a softbreak moved to
// the very start of a freshly split paragraph. These are the only doc.eq
// differences allowed to remain staged; every other mismatch is rejected.
function stageComparableBlock(node: PMNode): PMNode | null {
  if (node.type.name !== 'paragraph') return node;
  const children: PMNode[] = [];
  node.forEach((child, _offset, index) => {
    if (index === 0 && child.isText && child.text!.startsWith('\n')) {
      const text = child.text!.replace(/^\n+/, '');
      if (text) children.push(schema.text(text, child.marks));
    } else children.push(child);
  });
  const paragraph = node.type.create(node.attrs, children, node.marks);
  return paragraph.content.size ? paragraph : null;
}
function stageComparable(doc: PMNode): PMNode {
  const blocks: PMNode[] = [];
  doc.forEach(node => {
    const comparable = stageComparableBlock(node);
    if (comparable) blocks.push(comparable);
  });
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create());
  return schema.topNodeType.createChecked(null, blocks);
}
function stageEquivalent(parsed: PMNode, target: PMNode): boolean {
  return stageComparable(parsed).eq(stageComparable(target));
}
export class FidelityModel {
  source: string; saved: string; state: EditorState; ranges: Range[]; issues: Issue[] = [];
  // Last clean (re-parse safe) snapshot; repair restores it byte-exactly.
  trusted: { source: string; state: EditorState };
  revision = 0; blocked = ''; patches: Patch[] = []; before: string;
  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  staged: StagedTransaction | null = null;
  private compositionHistory: CompositionHistory | null = null;
  private ledgerCache: { source: string; doc: PMNode; ranges: Range[]; ledger: SourceLedger } | null = null;
  private stagedLedgerCache: { candidate: string; doc: PMNode; anchors: NativeAnchor[]; ledger: SourceLedger } | null = null;
  constructor(source: string) {
    const parsed = parse(source); this.source = this.saved = this.before = source;
    this.ranges = parsed.ranges; this.issues = parsed.issues;
    this.state = EditorState.create({ doc: parsed.doc });
    this.trusted = { source, state: this.state };
  }
  get pending() { return this.issues.length > 0; }
  get dirty() { return this.source !== this.saved || this.staged !== null; }
  sourceLedger(): SourceLedger {
    if (this.staged) return this.stagedLedger(this.staged, this.state);
    const cached = this.ledgerCache;
    if (cached && cached.source === this.source && cached.doc === this.state.doc && cached.ranges === this.ranges) return cached.ledger;
    const built = buildSourceLedger(this.source, this.state.doc, this.ranges);
    if (!built.ok) throw Error(`source ledger 构建失败：${built.reason}`);
    this.ledgerCache = { source: this.source, doc: this.state.doc, ranges: this.ranges, ledger: built.ledger };
    return built.ledger;
  }
  ledgerSource(): string { return this.staged?.candidate ?? this.source; }
  visualToSource(anchor: number, head: number, options: MapOptions = {}): LedgerMapResult {
    return ledgerVisualToSource(this.sourceLedger(), anchor, head, options);
  }
  private ledgerPosition(ledger: SourceLedger, position: number, side: 'from' | 'to' | 'any'): number {
    const collapsedAffinity = side === 'to' ? 'left' : 'right';
    const mapped = ledgerVisualToSource(ledger, position, position, { collapsedAffinity });
    if (!mapped.ok) throw Error(mapped.reason);
    return mapped.anchor;
  }
  private stagedLedger(stage: StagedTransaction, state: EditorState): SourceLedger {
    const cached = this.stagedLedgerCache;
    if (cached && cached.candidate === stage.candidate && cached.doc === state.doc && cached.anchors === stage.anchors) return cached.ledger;
    const parsed = parse(stage.candidate);
    if (parsed.issues.length) throw Error('暂存候选含边界问题，不能建立 source ledger');
    const built = buildSourceLedger(stage.candidate, parsed.doc, parsed.ranges);
    if (!built.ok) throw Error(`暂存候选 source ledger 构建失败：${built.reason}`);
    const ranges: Range[] = [];
    const visualShifts: number[] = [];
    let targetIndex = 0;
    let targetPos = 0;
    for (let sourceIndex = 0; sourceIndex < parsed.ranges.length; sourceIndex++) {
      const sourceBlock = parsed.doc.child(sourceIndex);
      const sourceComparable = stageComparableBlock(sourceBlock);
      if (!sourceComparable) throw Error(`暂存候选范围 ${sourceIndex} 意外对应空结构`);
      let matched = false;
      while (targetIndex < state.doc.childCount) {
        const targetBlock = state.doc.child(targetIndex++);
        const pos = targetPos;
        targetPos += targetBlock.nodeSize;
        const targetComparable = stageComparableBlock(targetBlock);
        if (!targetComparable) continue; // explicit staged-only empty structure
        if (!sourceComparable.eq(targetComparable)) throw Error(`暂存候选第 ${sourceIndex + 1} 块与 staged doc 投影不一致`);
        ranges.push({ ...parsed.ranges[sourceIndex], pos, size: targetBlock.nodeSize });
        const leadingNewlines = (node: PMNode) => node.type.name === 'paragraph' && node.firstChild?.isText
          ? node.firstChild.text!.match(/^\n*/)?.[0].length ?? 0 : 0;
        visualShifts.push(pos - parsed.ranges[sourceIndex].pos + leadingNewlines(targetBlock) - leadingNewlines(sourceBlock));
        matched = true;
        break;
      }
      if (!matched) throw Error(`暂存候选第 ${sourceIndex + 1} 块在 staged doc 中缺少投影`);
    }
    while (targetIndex < state.doc.childCount) {
      const targetBlock = state.doc.child(targetIndex++);
      targetPos += targetBlock.nodeSize;
      if (stageComparableBlock(targetBlock)) throw Error('staged doc 尾部仍有候选未归属的非空结构');
    }
    const translatedSpans = built.ledger.spans.map(span => {
      if (!span.visible || span.visualStart === undefined || span.visualEnd === undefined) return { ...span };
      const sourceIndex = parsed.ranges.findIndex(range => span.visualStart! >= range.pos && span.visualEnd! <= range.pos + range.size);
      if (sourceIndex < 0) throw Error(`暂存可视 span ${span.visualStart}..${span.visualEnd} 缺少块投影`);
      const shift = visualShifts[sourceIndex];
      return { ...span, visualStart: span.visualStart + shift, visualEnd: span.visualEnd + shift };
    });
    const translatedBlocks = built.ledger.blocks.map((block, sourceIndex) => ({
      ...block,
      range: ranges[sourceIndex],
      spans: block.spans.map(span => {
        const ledgerIndex = built.ledger.spans.indexOf(span);
        return ledgerIndex >= 0 ? translatedSpans[ledgerIndex] : { ...span };
      }),
    }));
    const anchors = stage.anchors.map(anchor => {
      if (anchor.pmPos < 0 || anchor.pmPos > state.doc.content.size) throw Error(`暂存 PM 锚点 ${anchor.pmPos} 越界`);
      if (anchor.sourceOffset < 0 || anchor.sourceOffset > stage.candidate.length) throw Error(`暂存 source 锚点 ${anchor.sourceOffset} 越界`);
      if (stage.candidate.startsWith('\uFEFF') && anchor.sourceOffset === 0) throw Error('BOM 前偏移不能成为暂存插入边界');
      return {
        sourceStart: anchor.sourceOffset,
        sourceEnd: anchor.sourceOffset,
        role: 'insertion-anchor' as const,
        syntax: 'staged-empty-structure',
        visible: true as const,
        text: '',
        visualStart: anchor.pmPos,
        visualEnd: anchor.pmPos,
        detail: '暂存 PM 结构尚无独立 Markdown 表示；仅此显式锚点参与映射',
      };
    });
    const ledger = { ...built.ledger, docSize: state.doc.content.size, blocks: translatedBlocks, spans: [...translatedSpans, ...anchors] };
    this.stagedLedgerCache = { candidate: stage.candidate, doc: state.doc, anchors: stage.anchors, ledger };
    return ledger;
  }
  private stagedPosition(stage: StagedTransaction, state: EditorState, position: number, side: 'from' | 'to' | 'any'): number {
    const exact = stage.anchors.filter(anchor => anchor.pmPos === position);
    if (exact.length) {
      const offsets = [...new Set(exact.map(anchor => anchor.sourceOffset))];
      if (offsets.length !== 1) throw Error('暂存选区锚点对应多个原文位置');
      return offsets[0];
    }
    return this.ledgerPosition(this.stagedLedger(stage, state), position, side);
  }
  private preserveReferenceTarget(plan: NativePlan, ledger: SourceLedger, step: { from?: number; to?: number }): NativePlan {
    if (plan.kind !== 'text' || step.from === undefined || step.to === undefined || step.from === step.to) return plan;
    const labels = ledger.spans.filter(span => span.visible
      && (span.role === 'link-label' || span.role === 'image-alt')
      && span.owner && span.visualStart !== undefined && span.visualEnd !== undefined);
    const owners = [...new Set(labels.map(span => span.owner!))].filter(owner => {
      const atoms = labels.filter(span => span.owner === owner);
      const visualStart = Math.min(...atoms.map(span => span.visualStart!));
      const visualEnd = Math.max(...atoms.map(span => span.visualEnd!));
      return step.from! >= visualStart && step.to! <= visualEnd;
    });
    if (owners.length !== 1) return plan;
    const owned = ledger.spans.filter(span => span.owner === owners[0]);
    if (owned.some(span => span.role === 'href' || span.role === 'reference-label')) return plan;
    const labelAtoms = owned.filter(span => span.visible && (span.role === 'link-label' || span.role === 'image-alt'));
    if (!labelAtoms.length) return plan;
    const labelStart = Math.min(...labelAtoms.map(span => span.sourceStart));
    const labelEnd = Math.max(...labelAtoms.map(span => span.sourceEnd));
    const referenceKey = this.source.slice(labelStart, labelEnd);
    const referenceOpen = owned.find(span => span.syntax === 'reference-open');
    const referenceClose = owned.find(span => span.syntax === 'reference-close');
    let referencePatch: Patch;
    if (referenceOpen && referenceClose) {
      referencePatch = { from: referenceOpen.sourceStart, to: referenceClose.sourceEnd, insert: `[${referenceKey}]` };
    } else {
      const labelClose = owned.find(span => span.syntax === 'link-label-close' || span.syntax === 'image-alt-close');
      if (!labelClose) return plan;
      referencePatch = { from: labelClose.sourceEnd, to: labelClose.sourceEnd, insert: `[${referenceKey}]` };
    }
    const patches = [...plan.patches, referencePatch];
    return { ...plan, patches, candidate: applyNativePatches(this.source, patches) };
  }
  private cloneStage(stage: StagedTransaction | null): StagedTransaction | null {
    return stage ? { ...stage, anchors: stage.anchors.map(anchor => ({ ...anchor })) } : null;
  }
  private snapshot(): HistoryEntry {
    return {
      source: this.source,
      state: this.state,
      staged: this.cloneStage(this.staged),
      trusted: this.trusted,
      patches: this.patches.map(patch => ({ ...patch })),
      before: this.before,
    };
  }
  private sameStagedHistory(entry: HistoryEntry): boolean {
    if (!entry.staged || !this.staged) return entry.staged === this.staged;
    return entry.staged.kind === this.staged.kind
      && entry.staged.candidate === this.staged.candidate;
  }
  private beginCompositionHistory(id: unknown) {
    if (this.compositionHistory?.id === id) return;
    this.finishCompositionHistory();
    this.compositionHistory = {
      id,
      before: this.snapshot(),
      past: this.past.slice(),
      future: this.future.slice(),
    };
  }
  private compactCompositionHistory() {
    const group = this.compositionHistory;
    if (!group) return;
    const unchanged = this.source === group.before.source
      && this.state.doc.eq(group.before.state.doc)
      && this.sameStagedHistory(group.before);
    if (unchanged) {
      // A cancelled/no-op composition is selection movement, not an edit. It
      // must neither add Undo nor discard the pre-existing Redo branch.
      this.past = group.past.slice();
      this.future = group.future.slice();
      return;
    }
    // Every PM DOM transaction carrying this composition ID belongs to one
    // user edit. Keep the exact pre-session state once, even when WebKit
    // flushes the final transaction after compositionend.
    this.past = [...group.past, group.before];
    this.future = [];
  }
  private finishCompositionHistory() {
    if (!this.compositionHistory) return;
    this.compactCompositionHistory();
    this.compositionHistory = null;
  }
  private restore(entry: HistoryEntry) {
    this.source = entry.source;
    this.state = entry.state;
    this.staged = this.cloneStage(entry.staged);
    this.trusted = entry.trusted;
    // `blocked` describes the last rejected operation, not the persisted
    // source/PM snapshot. A later successful commit clears it; history travel
    // must never resurrect that stale diagnostic on an otherwise safe state.
    this.patches = entry.patches.map(patch => ({ ...patch }));
    this.before = entry.before;
    const parsed = parse(this.source);
    this.ranges = parsed.ranges;
    this.issues = parsed.issues;
  }
  private candidatePatch(candidate: string): Patch[] {
    let from = 0;
    while (from < this.source.length && from < candidate.length && this.source[from] === candidate[from]) from++;
    let oldEnd = this.source.length, newEnd = candidate.length;
    while (oldEnd > from && newEnd > from && this.source[oldEnd - 1] === candidate[newEnd - 1]) { oldEnd--; newEnd--; }
    return [{ from, to: oldEnd, insert: candidate.slice(from, newEnd) }];
  }
  commitClean(source: string, state: EditorState, patches: Patch[], previous = this.snapshot()) {
    const parsed = parse(source);
    if (parsed.issues.length || !parsed.doc.eq(state.doc)) throw Error('补丁重解析与目标 PM 文档不一致');
    this.past.push(previous); this.future = [];
    this.before = this.source; this.source = source; this.state = state;
    this.ranges = parsed.ranges; this.issues = []; this.patches = patches; this.blocked = ''; this.revision++;
    this.trusted = { source, state }; this.staged = null;
  }
  // The buffer keeps the user's ambiguous input; the view is the conservative
  // projection of that exact buffer (problem fragment marked as raw). Structured
  // saving is blocked until a fix or undo restores a clean re-parse.
  commitPending(source: string, patches: Patch[], previous = this.snapshot()) {
    const parsed = parse(source);
    this.past.push(previous); this.future = [];
    this.before = this.source; this.source = source;
    this.state = EditorState.create({ doc: parsed.doc });
    this.ranges = parsed.ranges; this.issues = parsed.issues; this.patches = patches; this.blocked = ''; this.revision++; this.staged = null;
  }
  apply(patches: Patch[], tr: Transaction) {
    this.finishCompositionHistory();
    if (this.staged) throw Error('存在尚未落账的原生结构事务；请先继续输入或 Undo');
    let candidate = this.source;
    for (const p of [...patches].sort((a, b) => b.from - a.from)) candidate = candidate.slice(0, p.from) + p.insert + candidate.slice(p.to);
    const parsed = parse(candidate);
    if (parsed.issues.length) { this.commitPending(candidate, patches); return; }
    this.commitClean(candidate, this.state.apply(tr), patches);
  }
  transaction(tr: Transaction) {
    const compositionId = tr.getMeta('composition');
    const composing = compositionId !== undefined;
    if (composing) this.beginCompositionHistory(compositionId);
    else this.finishCompositionHistory();
    try {
      this.applyTransaction(tr);
    } finally {
      if (composing) this.compactCompositionHistory();
    }
  }
  private applyTransaction(tr: Transaction) {
    if (!tr.docChanged) {
      const next = this.state.apply(tr);
      if (this.staged && !next.selection.eq(this.state.selection)) {
        const stage = this.staged;
        const mapSelection = (position: number) => this.stagedPosition(stage, next, position, 'any');
        const anchor = mapSelection(next.selection.anchor);
        const head = mapSelection(next.selection.head);
        stage.anchors = [
          ...stage.anchors,
          { pmPos: next.selection.anchor, sourceOffset: anchor },
          { pmPos: next.selection.head, sourceOffset: head },
        ].filter((item, index, all) => all.findIndex(other => other.pmPos === item.pmPos && other.sourceOffset === item.sourceOffset) === index);
      }
      this.state = next;
      return;
    }
    if (this.staged) {
      const stage = this.staged;
      const previous = this.snapshot();
      const ledger = this.stagedLedger(stage, this.state);
      const next = advanceStagedText(
        stage.candidate,
        stage.anchors,
        this.state,
        tr,
        (position, side = 'any') => {
          const exact = stage.anchors.filter(anchor => anchor.pmPos === position);
          if (exact.length) {
            const offsets = [...new Set(exact.map(anchor => anchor.sourceOffset))];
            if (offsets.length !== 1) throw Error('暂存选区锚点对应多个原文位置');
            return offsets[0];
          }
          return this.ledgerPosition(ledger, position, side);
        },
      );
      const target = this.state.apply(tr);
      const parsed = parse(next.candidate);
      if (parsed.issues.length) {
        this.commitPending(next.candidate, this.candidatePatch(next.candidate), previous);
        return;
      }
      if (!parsed.doc.eq(target.doc)) {
        if (!stageEquivalent(parsed.doc, target.doc)) throw Error('暂存候选与目标 PM 文档存在空结构之外的差异；现态保持不变');
        this.past.push(previous); this.future = [];
        stage.candidate = next.candidate;
        stage.anchors = next.anchors;
        this.state = target;
        this.before = this.source;
        this.patches = this.candidatePatch(next.candidate);
        this.blocked = '';
        this.revision++;
        return;
      }
      this.commitClean(next.candidate, target, this.candidatePatch(next.candidate), previous);
      return;
    }
    const step = tr.steps[0]?.toJSON() as { stepType?: string; from?: number; to?: number; slice?: { content?: Array<{ text?: string }> } } | undefined;
    const insert = step?.stepType === 'replace' && !step.slice?.content?.some(n => n.text === undefined)
      ? (step.slice?.content ?? []).map(n => n.text ?? '').join('') : '';
    // Build and validate ownership before even enriching the transaction with
    // inherited marks. The cache key is the exact source/doc/ranges triple.
    const ledger = this.sourceLedger();
    // PM drops inclusive:false marks when their entire text leaf is replaced.
    // Preserve the exact source leaf's marks for a replacement contained in
    // one text node; otherwise the source re-parse would correctly reject the
    // now-unlinked target doc. Insertions at a mark boundary remain untouched.
    if (step?.from !== undefined && step.to !== undefined && step.from < step.to && insert) {
      const { from, to } = step;
      let marks: readonly import('prosemirror-model').Mark[] | undefined;
      this.state.doc.descendants((node, pos) => {
        if (marks || !node.isText || from < pos || to > pos + node.nodeSize) return;
        marks = node.marks;
      });
      for (const mark of marks ?? []) tr.addMark(from, from + insert.length, mark);
    }
    let plan = planNativeTransaction(
      this.source,
      this.state,
      this.ranges,
      tr,
      (position, side = 'any') => this.ledgerPosition(ledger, position, side),
    );
    plan = this.preserveReferenceTarget(plan, ledger, step ?? {});
    const target = this.state.apply(tr);
    const parsed = parse(plan.candidate);
    if (parsed.issues.length) {
      if (plan.kind === 'text' || plan.kind === 'empty-text') { this.commitPending(plan.candidate, plan.patches); return; }
      throw Error('原生结构/标记事务候选触发含混边界；可信原文与 PM 状态保持不变');
    }
    if (parsed.doc.eq(target.doc)) {
      this.commitClean(plan.candidate, target, plan.patches);
      return;
    }
    if (plan.mayStage && plan.sourceCaret !== undefined) {
      if (!stageEquivalent(parsed.doc, target.doc)) throw Error('原生结构候选与目标 PM 文档存在不可暂存差异；可信状态未提交');
      const previous = this.snapshot();
      this.past.push(previous); this.future = [];
      this.staged = {
        candidate: plan.candidate,
        anchors: [{ pmPos: target.selection.from, sourceOffset: plan.sourceCaret }],
        kind: plan.kind,
      };
      this.state = target;
      this.before = this.source;
      this.patches = plan.patches;
      this.blocked = '';
      this.revision++;
      return;
    }
    throw Error('补丁重解析与目标 PM 文档不一致；可信状态未提交');
  }
  sourceEdit(source: string) {
    this.finishCompositionHistory();
    if (this.staged) throw Error('存在尚未落账的原生结构事务；请先继续输入或 Undo');
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
    this.finishCompositionHistory();
    const from = redo ? this.future : this.past, to = redo ? this.past : this.future;
    const entry = from.pop(); if (!entry) return;
    to.push(this.snapshot());
    this.restore(entry);
    this.revision++;
  }
  select(from: number, to = from) { this.transaction(this.state.tr.setSelection(TextSelection.create(this.state.doc, from, to))); }
}

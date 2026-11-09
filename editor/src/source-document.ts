import MarkdownIt, { type Token } from "markdown-it";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { parseAcceptedMarkdownTokens, configureProjectionTokens } from "./markdown-codec";
import { analyzeMarkdownSafety } from "./markdown-safety";
import { parseProtectedMarkdown } from "./protected-markdown";
import { inkoraSchema as schema } from "./schema";
import { installReferenceCapture, referenceLineRanges, type ReferenceLineRange } from "./reference-context";
import { installProtectedSyntax } from "./protected-syntax";
import { installGfmAutolinks } from "./gfm-autolinks";
import { installContainerProvenance } from "./source-token-provenance";

export { schema };

export type Range = { start: number; end: number; pos: number; size: number; kind: string; issue?: string };
export type CanonicalTokenEvidence = { readonly raw: string; readonly tokens: Token[]; readonly references: readonly ReferenceLineRange[] };
export type Issue = { code: string; start: number; end: number; message: string };
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable(['table', 'strikethrough']);
installReferenceCapture(tokenizer);
installProtectedSyntax(tokenizer);
installContainerProvenance(tokenizer);
installGfmAutolinks(tokenizer);
configureProjectionTokens(tokenizer);
export function parse(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const blockEnv: Record<string, unknown> = { source: source.replace(/^\uFEFF/, '') };
  const blockTokens = tokenizer.parse(source.replace(/^\uFEFF/, ''), blockEnv);
  const ranges: Range[] = [], nodes: PMNode[] = [], issues: Issue[] = [];
  let cursor = 0, pos = 0;
  // Only accepted CommonMark reference definitions own these hidden gaps.
  // Canonical footnote definitions have already become opaque block tokens.
  const gapParts: string[] = [];
  let gapCursor = 0;
  for (const definition of referenceLineRanges(blockEnv)) {
    const from = starts[definition.startLine];
    const to = starts[definition.endLine] ?? source.length;
    gapParts.push(source.slice(gapCursor, from));
    gapParts.push(source.slice(from, to).replace(/[^\r\n]/g, ' '));
    gapCursor = to;
  }
  gapParts.push(source.slice(gapCursor));
  const gapSource = gapParts.join('');
  const cleanGap = (from: number, to: number) => gapSource.slice(from, to).trim().length === 0;
  for (const [tokenIndex, token] of blockTokens.entries()) {
    if (token.level !== 0 || !token.map || token.type.endsWith('_close')) continue;
    let start = starts[token.map[0]], end = starts[token.map[1]] ?? source.length;
    if (start < cursor) continue;
    if (start === 0 && source[0] === '\uFEFF') start++;
    if (!cleanGap(cursor, start)) throw Error('存在无法归属的原文范围');
    if (source.slice(start, end).endsWith('\r\n')) end -= 2;
    else if (source[end - 1] === '\n') end--;
    const raw = source.slice(start, end), normalized = raw.replace(/\r\n/g, '\n');
    // Comment interiors are literal: mask them (length-preserving) before any
    // math/mermaid boundary decision so `$x$` inside `<!-- -->` stays literal.
    const masked = normalized.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
    const risks = analyzeMarkdownSafety(normalized).risks.filter(risk => risk.code !== 'front_matter');
    const maskedRisks = analyzeMarkdownSafety(masked).risks;
    const protect = () => schema.nodes.protected_block.create({ raw, kind: 'metadata' });
    let node: PMNode, issue: Issue | undefined;
    if (token.type === 'inkora_protected_block') {
      node = schema.nodes.protected_block.create({ raw, kind: token.meta.inkoraOpaque });
      if (token.meta.inkoraIssue) issue = { code: token.meta.inkoraOpaque, start, end, message: token.meta.inkoraIssue };
    } else if (/^\$\$\n[\s\S]*\n\$\$$/.test(masked)) {
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
      const protectedDoc = token.type === 'table_open' ? null : parseProtectedMarkdown(normalized);
      if (protectedDoc && protectedDoc.childCount === 1 && protectedDoc.firstChild?.type.name === 'protected_block' && protectedDoc.firstChild.attrs.kind === 'wiki') {
        node = schema.nodes.protected_block.create({ raw, kind: protectedDoc.firstChild.attrs.kind });
      } else {
        // Bare URLs/email use the shared GFM rule; reference
        // links/images resolve against the accepted global reference env into
        // link marks / image atoms — alt, href/title and delimiter forms
        // all stay separated. Unknown syntax is still a bounded source-owned
        // block: keep it beside editable body text and expose one repair issue
        // instead of throwing the entire document into the legacy textarea.
        const unsupported = risks.filter(r => !['task_list', 'gfm_autolink', 'image', 'gfm_table'].includes(r.code));
        if (unsupported.length) {
          issue = {
            code: unsupported[0].code,
            start,
            end,
            message: `语法边界尚未支持（${unsupported.map(r => r.code).join(',')}）：已逐字节保留片段并阻断结构化保存`,
          };
          node = protect();
        } else {
          let tokenEnd = tokenIndex + 1;
          let depth = token.nesting;
          while (depth > 0 && tokenEnd < blockTokens.length) depth += blockTokens[tokenEnd++].nesting;
          if (depth > 0) throw Error('已接受的块 token 没有匹配闭合');
          const parsed = parseAcceptedMarkdownTokens(blockTokens.slice(tokenIndex, tokenEnd));
          if (parsed.childCount !== 1) throw Error('一个范围对应多个 PM 块');
          node = parsed.firstChild!;
          // CommonMark permits a fenced code block to end at EOF without a
          // closing fence. `closed: false` is source metadata, not an issue;
          // later edits must preserve that absence instead of inventing bytes.
        }
      }
    }
    const range: Range = { start, end, pos, size: node.nodeSize, kind: node.type.name };
    if (issue) { range.issue = issue.message; issues.push(issue); }
    ranges.push(range);
    nodes.push(node); pos += node.nodeSize; cursor = end;
  }
  if (!cleanGap(cursor, source.length)) throw Error('尾部存在无法归属的原文范围');
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create());
  return { doc: schema.topNodeType.createChecked(null, nodes), ranges, issues,
    tokenEvidence: { raw: source, tokens: blockTokens, references: referenceLineRanges(blockEnv) } satisfies CanonicalTokenEvidence };
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

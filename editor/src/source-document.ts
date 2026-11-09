import MarkdownIt, { type Token } from "markdown-it";
import type { Node as PMNode } from "prosemirror-model";
import { parseAcceptedMarkdownTokens, configureProjectionTokens } from "./markdown-codec";
import { inkoraSchema as schema } from "./schema";
import { installReferenceCapture, referenceLineRanges, type ReferenceLineRange } from "./reference-context";
import { installProtectedSyntax } from "./protected-syntax";
import { installGfmAutolinks } from "./gfm-autolinks";
import { installContainerProvenance, installInlineProvenance, bindOpaqueInlineSource, type AcceptedOpaqueInline } from "./source-token-provenance";

export { schema };

export type Range = { start: number; end: number; pos: number; size: number; kind: string; issue?: string };
export type CanonicalTokenEvidence = { readonly raw: string; readonly tokens: Token[]; readonly references: readonly ReferenceLineRange[] };
export type Issue = { code: string; start: number; end: number; message: string };
const tokenizer = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);
installReferenceCapture(tokenizer);
installProtectedSyntax(tokenizer);
installContainerProvenance(tokenizer);
installInlineProvenance(tokenizer);
installGfmAutolinks(tokenizer);
configureProjectionTokens(tokenizer);
export function parse(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const blockEnv: Record<string, unknown> = { source: source.replace(/^\uFEFF/, '') };
  const blockTokens = tokenizer.parse(source.replace(/^\uFEFF/, ''), blockEnv);
  bindOpaqueInlineSource(source, blockTokens);
  const ranges: Range[] = [], nodes: PMNode[] = [], issues: Issue[] = [];
  for (const token of blockTokens) for (const child of token.children ?? []) {
    if (child.meta?.inkoraIssue && child.meta.inkoraAccepted) {
      const accepted = child.meta.inkoraAccepted;
      issues.push({ code: child.meta.inkoraOpaque, start: accepted.sourceStart, end: accepted.sourceEnd, message: child.meta.inkoraIssue });
    }
  }
  for (const token of blockTokens) {
    const accepted = token.meta?.inkoraAccepted;
    if (token.level > 0 && token.meta?.inkoraIssue && accepted) {
      issues.push({ code: token.meta.inkoraOpaque, start: accepted.sourceStart, end: accepted.sourceEnd, message: token.meta.inkoraIssue });
    }
  }
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
    const raw = source.slice(start, end);
    let node: PMNode, issue: Issue | undefined;
    if (token.type === 'inkora_protected_block') {
      node = schema.nodes.protected_block.create({ raw, kind: token.meta.inkoraOpaque });
      if (token.meta.inkoraIssue) issue = { code: token.meta.inkoraOpaque, start, end, message: token.meta.inkoraIssue };
    } else {
      let tokenEnd = tokenIndex + 1;
      let depth = token.nesting;
      while (depth > 0 && tokenEnd < blockTokens.length) depth += blockTokens[tokenEnd++].nesting;
      if (depth > 0) throw Error('Accepted block token has no matching close');
      const parsed = parseAcceptedMarkdownTokens(blockTokens.slice(tokenIndex, tokenEnd));
      if (parsed.childCount !== 1) throw Error('Accepted source range has multiple PM blocks');
      node = parsed.firstChild!;
    }
    const range: Range = { start, end, pos, size: node.nodeSize, kind: node.type.name };
    if (issue) { range.issue = issue.message; issues.push(issue); }
    ranges.push(range);
    nodes.push(node); pos += node.nodeSize; cursor = end;
  }
  if (!cleanGap(cursor, source.length)) throw Error('尾部存在无法归属的原文范围');
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create());
  return { doc: schema.topNodeType.createChecked(null, nodes), ranges, issues,
    opaqueSpans: blockTokens.flatMap(token => [token, ...(token.children ?? [])]
      .flatMap(child => child.meta?.inkoraAccepted ? [{ ...child.meta.inkoraAccepted } as AcceptedOpaqueInline] : [])),
    tokenEvidence: { raw: source, tokens: blockTokens, references: referenceLineRanges(blockEnv) } satisfies CanonicalTokenEvidence };
}

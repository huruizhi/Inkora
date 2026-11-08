import MarkdownIt from "markdown-it";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { parseMarkdown } from "./markdown-codec";
import { analyzeMarkdownSafety } from "./markdown-safety";
import { inkoraSchema } from "./schema";

const preview = new MarkdownIt("commonmark", { html: false }).enable(["table", "strikethrough"]);

// Protected blocks are atomic: their preview never becomes the save source.
// All unprotected text still passes the existing safety gate.
export function parseProtectedMarkdown(source: string): ProseMirrorNode | null {
  const front = /^(---|\+\+\+)\n[\s\S]*?\n(?:\1|\.\.\.)(?=\n|$)/.exec(source);
  const ranges: Array<{ start: number; end: number; kind: string }> = [];
  const offset = front?.[0].length ?? 0;
  if (front) ranges.push({ start: 0, end: offset, kind: "metadata" });
  const body = source.slice(offset);
  const starts = [0];
  for (let index = 0; index < body.length; index++) {
    if (body[index] === "\n") starts.push(index + 1);
  }
  for (const token of preview.parse(body, {})) {
    if (token.level !== 0 || !token.map) continue;
    const start = offset + starts[token.map[0]];
    const end = offset + (starts[token.map[1]] ?? body.length);
    const raw = source.slice(start, end).replace(/\n$/, "");
    if (token.type === "table_open" ||
        (["paragraph_open", "bullet_list_open", "ordered_list_open", "blockquote_open", "heading_open"].includes(token.type) &&
          analyzeMarkdownSafety(raw).risks.some((risk) => risk.code === "wiki_link"))) {
      ranges.push({ start, end: start + raw.length, kind: token.type === "table_open" ? "table" : "wiki" });
    }
  }
  if (!ranges.length) return null;
  const nodes: ProseMirrorNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const gap = source.slice(cursor, range.start);
    if (!analyzeMarkdownSafety(gap).structuredSaveAllowed) return null;
    if (gap.trim()) parseMarkdown(gap).forEach((node) => nodes.push(node));
    nodes.push(inkoraSchema.nodes.protected_block.create({
      raw: source.slice(range.start, range.end), kind: range.kind,
    }));
    cursor = range.end;
  }
  const tail = source.slice(cursor);
  if (!analyzeMarkdownSafety(tail).structuredSaveAllowed) return null;
  if (tail.trim()) parseMarkdown(tail).forEach((node) => nodes.push(node));
  return inkoraSchema.topNodeType.createChecked(null, nodes);
}

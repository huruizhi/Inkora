import MarkdownIt, { type StateCore, type Token } from "markdown-it";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
  type ParseSpec,
} from "prosemirror-markdown";
import { inkoraSchema } from "./schema";

function listIsTight(tokens: readonly Token[], index: number): boolean {
  for (let current = index + 1; current < tokens.length; current += 1) {
    if (tokens[current].type !== "list_item_open") {
      return tokens[current].hidden;
    }
  }
  return false;
}

function annotateFenceClosure(state: StateCore): void {
  const source =
    typeof state.env === "object" &&
    state.env !== null &&
    typeof (state.env as { source?: unknown }).source === "string"
      ? (state.env as { source: string }).source
      : "";
  const lines = source.split(/\r?\n/);

  for (const token of state.tokens) {
    if (token.type !== "fence" || !token.map || token.markup.length < 3) continue;
    const closingLine = lines[token.map[1] - 1] ?? "";
    const marker = token.markup[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const closed = new RegExp(
      `^ {0,3}${marker}{${token.markup.length},}[\\t ]*$`,
    ).test(closingLine);
    token.meta = { ...token.meta, inkoraClosed: closed };
  }
}

function preserveSoftBreaks(state: StateCore): void {
  for (const token of state.tokens) {
    for (const child of token.children ?? []) {
      if (child.type === "softbreak") {
        child.type = "text";
        child.tag = "";
        child.content = "\n";
      }
    }
  }
}

const tokenizer = new MarkdownIt("commonmark", {
  breaks: false,
  html: false,
  linkify: false,
}).enable("strikethrough");

tokenizer.core.ruler.after("block", "inkora_fence_closure", annotateFenceClosure);
tokenizer.core.ruler.after("inline", "inkora_soft_breaks", preserveSoftBreaks);

const tokenSpecs: Record<string, ParseSpec> = {
  blockquote: { block: "blockquote" },
  paragraph: { block: "paragraph" },
  list_item: { block: "list_item" },
  bullet_list: {
    block: "bullet_list",
    getAttrs: (token, tokens, index) => ({
      bullet: token.markup || "-",
      tight: listIsTight(tokens, index),
    }),
  },
  ordered_list: {
    block: "ordered_list",
    getAttrs: (token, tokens, index) => ({
      order: Number(token.attrGet("start")) || 1,
      delimiter: token.markup === ")" ? ")" : ".",
      tight: listIsTight(tokens, index),
    }),
  },
  heading: {
    block: "heading",
    getAttrs: (token) => ({
      level: Number(token.tag.slice(1)),
      style: token.markup === "=" || token.markup === "-" ? "setext" : "atx",
    }),
  },
  code_block: {
    block: "code_block",
    attrs: {
      language: null,
      style: "indented",
      fence: "```",
      closed: true,
    },
    noCloseToken: true,
  },
  fence: {
    block: "code_block",
    getAttrs: (token) => ({
      language: token.info.trim() || null,
      style: "fenced",
      fence: token.markup,
      closed: token.meta?.inkoraClosed !== false,
    }),
    noCloseToken: true,
  },
  hr: { node: "horizontal_rule" },
  hardbreak: { node: "hard_break" },
  em: { mark: "em" },
  strong: { mark: "strong" },
  s: { mark: "strike" },
  link: {
    mark: "link",
    getAttrs: (token) => ({
      href: token.attrGet("href"),
      title: token.attrGet("title") || null,
    }),
  },
  code_inline: { mark: "code", noCloseToken: true },
};

export const inkoraMarkdownParser = new MarkdownParser(
  inkoraSchema,
  tokenizer,
  tokenSpecs,
);

function renderHeading(
  state: MarkdownSerializerState,
  node: ProseMirrorNode,
): void {
  if (node.attrs.style === "setext" && (node.attrs.level === 1 || node.attrs.level === 2)) {
    state.renderInline(node, false);
    state.ensureNewLine();
    const marker = node.attrs.level === 1 ? "=" : "-";
    state.write(state.repeat(marker, Math.max(3, node.textContent.length)));
    state.closeBlock(node);
    return;
  }

  state.write(`${state.repeat("#", node.attrs.level)} `);
  state.renderInline(node, false);
  state.closeBlock(node);
}

function safeFence(node: ProseMirrorNode): string {
  const preferred = /^(?:`{3,}|~{3,})$/.test(node.attrs.fence)
    ? node.attrs.fence
    : "```";
  const marker = preferred[0];
  const candidate = new RegExp(`^ {0,3}(${marker}{3,})[\\t ]*$`, "gm");
  let longest = 0;
  for (const match of node.textContent.matchAll(candidate)) {
    longest = Math.max(longest, match[1].length);
  }
  return marker.repeat(Math.max(3, preferred.length, longest + 1));
}

function renderCodeBlock(
  state: MarkdownSerializerState,
  node: ProseMirrorNode,
): void {
  if (node.attrs.style === "indented") {
    state.wrapBlock("    ", null, node, () => state.text(node.textContent, false));
    return;
  }

  const fence = safeFence(node);
  state.write(fence + (node.attrs.language ?? "") + "\n");
  state.text(node.textContent, false);
  if (node.attrs.closed) {
    state.write("\n");
    state.write(fence);
  }
  state.closeBlock(node);
}

export const inkoraMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    heading: renderHeading,
    code_block: renderCodeBlock,
    bullet_list(state, node) {
      state.renderList(node, "  ", () => `${node.attrs.bullet ?? "-"} `);
    },
    ordered_list(state, node) {
      const start = node.attrs.order ?? 1;
      const delimiter = node.attrs.delimiter === ")" ? ")" : ".";
      const maxWidth = String(start + node.childCount - 1).length;
      const indentation = state.repeat(" ", maxWidth + 2);
      state.renderList(node, indentation, (index) => {
        const number = String(start + index);
        return `${state.repeat(" ", maxWidth - number.length)}${number}${delimiter} `;
      });
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
);

export function parseMarkdown(markdown: string): ProseMirrorNode {
  const document = inkoraMarkdownParser.parse(markdown, { source: markdown });
  document.check();
  return document;
}

export function serializeMarkdown(document: ProseMirrorNode): string {
  if (document.type !== inkoraSchema.topNodeType) {
    throw new RangeError("Markdown serialization requires a doc root");
  }
  document.check();
  return inkoraMarkdownSerializer.serialize(document);
}

export function normalizeMarkdown(markdown: string): string {
  return serializeMarkdown(parseMarkdown(markdown));
}

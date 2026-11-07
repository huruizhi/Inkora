import { normalizeMarkdown } from "./markdown-codec";

export type MarkdownRiskCode =
  | "gfm_table"
  | "gfm_autolink"
  | "task_list"
  | "image"
  | "footnote"
  | "raw_html"
  | "custom_container"
  | "front_matter"
  | "math"
  | "wiki_link"
  | "obsidian_callout"
  | "mdx_or_jsx"
  | "template_expression";

export type MarkdownRiskLevel = "deferred" | "unsupported";

export interface MarkdownRisk {
  code: MarkdownRiskCode;
  level: MarkdownRiskLevel;
  line: number;
  column: number;
  start: number;
  end: number;
  message: string;
}

export interface MarkdownSafetyAnalysis {
  mode: "structured" | "source";
  structuredSaveAllowed: boolean;
  risks: MarkdownRisk[];
}

export type SaveMode = "structured" | "source";

export type MarkdownSaveDecision =
  | {
      allowed: true;
      strategy: "unchanged" | "structured" | "source_buffer";
      output: string;
      analysis: MarkdownSafetyAnalysis;
    }
  | {
      allowed: false;
      strategy: "blocked";
      reason: "unsafe_syntax" | "normalization_required" | "codec_error";
      actions: readonly ["switch_to_source", "cancel"];
      analysis: MarkdownSafetyAnalysis;
    };

const messages: Record<MarkdownRiskCode, string> = {
  gfm_table: "检测到尚未支持的 GFM 表格",
  gfm_autolink: "检测到尚未支持的 GFM 裸链接",
  task_list: "检测到尚未支持的任务列表",
  image: "检测到尚未支持的 Markdown 图片",
  footnote: "检测到延后支持的脚注",
  raw_html: "检测到延后支持的原始 HTML",
  custom_container: "检测到未知自定义容器或指令",
  front_matter: "检测到延后支持的 front matter",
  math: "检测到延后或未知的数学公式语法",
  wiki_link: "检测到延后支持的 Wiki 链接",
  obsidian_callout: "检测到延后支持的 Obsidian callout",
  mdx_or_jsx: "检测到不支持的 MDX、JSX 或 ESM 语法",
  template_expression: "检测到不支持的模板表达式",
};

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function location(starts: readonly number[], offset: number) {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

function isEscaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && text[index] === "\\"; index -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function protectedMask(text: string): boolean[] {
  const mask = Array<boolean>(text.length).fill(false);
  const lines = text.split(/(?<=\n)/);
  let offset = 0;
  let fence: { marker: string; length: number } | undefined;

  for (const line of lines) {
    const content = line.replace(/[\r\n]+$/, "");
    const wasInFence = fence !== undefined;
    const opening = wasInFence ? null : /^ {0,3}(`{3,}|~{3,})/.exec(content);
    if (opening) {
      fence = { marker: opening[1][0], length: opening[1].length };
    }
    const isIndented = !fence && /^(?: {4}|\t)/.test(content);
    if (fence || isIndented) {
      mask.fill(true, offset, offset + line.length);
    }
    if (fence && wasInFence) {
      const escapedMarker = fence.marker === "`" ? "`" : "~";
      if (
        new RegExp(`^ {0,3}${escapedMarker}{${fence.length},}[\\t ]*$`).test(
          content,
        )
      ) {
        fence = undefined;
      }
    }
    offset += line.length;
  }

  for (let index = 0; index < text.length; index += 1) {
    if (mask[index] || text[index] !== "`" || isEscaped(text, index)) continue;
    let run = 1;
    while (text[index + run] === "`") run += 1;
    const delimiter = "`".repeat(run);
    const close = text.indexOf(delimiter, index + run);
    if (close >= 0 && !text.slice(index, close).includes("\n")) {
      mask.fill(true, index, close + run);
      index = close + run - 1;
    }
  }

  const protectedInline =
    /<(?:(?:https?:\/\/|mailto:)[^>]+|[^ <>@]+@[^ <>@]+)>|\[[^\]\n]*\]\([^\n]*?\)/g;
  for (const match of text.matchAll(protectedInline)) {
    if (match.index !== undefined) {
      mask.fill(true, match.index, match.index + match[0].length);
    }
  }

  return mask;
}

function riskLevel(code: MarkdownRiskCode): MarkdownRiskLevel {
  return [
    "footnote",
    "raw_html",
    "front_matter",
    "wiki_link",
    "obsidian_callout",
  ].includes(code)
    ? "deferred"
    : "unsupported";
}

export function analyzeMarkdownSafety(text: string): MarkdownSafetyAnalysis {
  const starts = lineStarts(text);
  const mask = protectedMask(text);
  const risks: MarkdownRisk[] = [];
  const seen = new Set<string>();

  const add = (code: MarkdownRiskCode, start: number, end: number): void => {
    if (start < 0 || mask[start] || isEscaped(text, start)) return;
    const position = location(starts, start);
    const key = `${code}:${position.line}:${position.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    risks.push({
      code,
      level: riskLevel(code),
      ...position,
      start,
      end,
      message: messages[code],
    });
  };

  const scan = (code: MarkdownRiskCode, expression: RegExp): void => {
    for (const match of text.matchAll(expression)) {
      if (match.index !== undefined) {
        add(code, match.index, match.index + match[0].length);
      }
    }
  };

  const lines = text.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const start = starts[index];
    if (mask[start]) continue;
    const line = lines[index];
    const next = lines[index + 1] ?? "";
    if (
      line.includes("|") &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next)
    ) {
      add("gfm_table", start, start + line.length + 1 + next.length);
    }
  }

  scan("task_list", /^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s+/gm);
  scan("image", /!\[[^\]\n]*\]\([^\n]*?\)/g);
  scan("gfm_autolink", /\bhttps?:\/\/[^\s<>]+/g);
  scan("footnote", /\[\^[A-Za-z0-9_-]+\](?::)?/g);
  scan("obsidian_callout", /^> ?\[![A-Za-z0-9_-]+\][+-]?(?:[\t ]|$)/gm);
  scan("wiki_link", /!?\[\[[^\]\n]+\]\]/g);
  scan("custom_container", /^\s*(?:::{2,}|!!!)\s*\S+/gm);
  scan("mdx_or_jsx", /^\s*(?:import|export)(?:\s|\{)/gm);
  scan("mdx_or_jsx", /<\/?[A-Z][A-Za-z0-9]*(?:\s|\/?>)/g);
  scan("template_expression", /\{[^{}\n]*\}|[{}]/g);
  scan("math", /^\s*\$\$\s*$|(?<!\\)\$[^$\n]+(?<!\\)\$/gm);

  for (const match of text.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>\n]*>/g)) {
    if (match.index === undefined || mask[match.index]) continue;
    if (/^<\/?[A-Z]/.test(match[0])) continue;
    add("raw_html", match.index, match.index + match[0].length);
  }

  const firstLine = lines[0]?.replace(/^\uFEFF/, "") ?? "";
  if (firstLine === "---" || firstLine === "+++") {
    const closing = lines.findIndex(
      (line, index) => index > 0 && (line === firstLine || (firstLine === "---" && line === "...")),
    );
    if (closing > 0) add("front_matter", 0, starts[closing] + lines[closing].length);
  }

  risks.sort(
    (left, right) => left.start - right.start || left.code.localeCompare(right.code),
  );
  return {
    mode: risks.length ? "source" : "structured",
    structuredSaveAllowed: risks.length === 0,
    risks,
  };
}

export function prepareMarkdownSave(
  original: string,
  current: string,
  mode: SaveMode,
): MarkdownSaveDecision {
  const analysis = analyzeMarkdownSafety(current);
  if (current === original) {
    return { allowed: true, strategy: "unchanged", output: original, analysis };
  }
  if (mode === "source") {
    return { allowed: true, strategy: "source_buffer", output: current, analysis };
  }
  if (!analysis.structuredSaveAllowed) {
    return {
      allowed: false,
      strategy: "blocked",
      reason: "unsafe_syntax",
      actions: ["switch_to_source", "cancel"],
      analysis,
    };
  }

  try {
    const normalized = normalizeMarkdown(current);
    if (normalized !== current) {
      return {
        allowed: false,
        strategy: "blocked",
        reason: "normalization_required",
        actions: ["switch_to_source", "cancel"],
        analysis,
      };
    }
    return { allowed: true, strategy: "structured", output: normalized, analysis };
  } catch {
    return {
      allowed: false,
      strategy: "blocked",
      reason: "codec_error",
      actions: ["switch_to_source", "cancel"],
      analysis,
    };
  }
}

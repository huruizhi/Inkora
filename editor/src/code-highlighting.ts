import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import hljs from "highlight.js";

/** 代码块 token 高亮区间；from/to 为相对代码正文的 UTF-16 偏移。 */
export interface HighlightSpan {
  readonly from: number;
  readonly to: number;
  /** 来自 highlighter 输出的逐字文本，必须与原文切片一致。 */
  readonly text: string;
  readonly class: string;
}

/** 语言选择器条目：简体中文说明 + 原语言名。 */
export interface CodeLanguage {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

const preferredLabels: Record<string, string> = {
  bash: "Bash Shell", css: "CSS", go: "Go", javascript: "JavaScript", json: "JSON",
  markdown: "Markdown", python: "Python", rust: "Rust", sql: "SQL", swift: "Swift",
  typescript: "TypeScript", xml: "XML/HTML", yaml: "YAML",
};

/** Complete offline catalog from the pinned package; aliases never rewrite raw implicitly. */
export const CODE_LANGUAGES: readonly CodeLanguage[] = hljs.listLanguages().sort().map(id => ({
  id, label: `${preferredLabels[id] ?? hljs.getLanguage(id)?.name ?? id}（${id}）`,
  aliases: (hljs.getLanguage(id)?.aliases ?? []).filter(alias => hljs.getLanguage(alias) === hljs.getLanguage(id)),
}));

// highlight.js 11.12.0 语法库静态作用域清单（lib/languages 全量 grep 冻结）。
const HLJS_SCOPES: Record<string, true> = {
  addition: true, attr: true, attribute: true, brace: true, built_in: true,
  "builtin-symbol": true, bullet: true, char: true, character: true,
  class: true, code: true, comment: true, "computation-expression": true,
  deletion: true, doctag: true, emphasis: true, fn_ref: true,
  "fn_ref_params": true, function: true, keyword: true, label: true,
  link: true, literal: true, "message-name": true, meta: true, name: true,
  "named-character": true, number: true, operator: true, params: true,
  pattern: true, property: true, punctuation: true, quote: true, regex: true,
  regexp: true, rest_arg: true, section: true, "selector-attr": true,
  "selector-class": true, "selector-id": true, "selector-pseudo": true,
  "selector-tag": true, slot: true, string: true, strong: true, subst: true,
  symbol: true, tag: true, "template-tag": true, "template-variable": true,
  title: true, type: true, variable: true,
};

// tiered scope（如 title.function）在 HTML 中拆出的后半段类名。
const HLJS_SUBSCOPES: Record<string, true> = {
  class_: true, function_: true, inherited__: true, invoke__: true,
  constant_: true, language_: true, prompt_: true, escape_: true,
  dispatch_: true,
};

let aliasIndex: Map<string, string> | undefined;

/** info 首语言 token → 已注册语言 id；未注册/未知返回 null，不改写原值。 */
export function resolveHighlightLanguageId(token: string): string | null {
  if (!aliasIndex) {
    aliasIndex = new Map();
    for (const language of CODE_LANGUAGES) {
      aliasIndex.set(language.id, language.id);
      const definition = hljs.getLanguage(language.id);
      for (const alias of definition?.aliases ?? []) {
        if (hljs.getLanguage(alias) === definition) aliasIndex.set(alias, language.id);
      }
    }
  }
  return aliasIndex.get(token) ?? aliasIndex.get(token.toLowerCase()) ?? null;
}

/** 语言 attr 是整段 info.trim()；首 token 才是语言。 */
export function firstInfoToken(languageAttr: string | null): string {
  if (!languageAttr) return "";
  return languageAttr.trim().split(/\s+/)[0] ?? "";
}

/**
 * 只替换 info 首语言 token，保留其余选项与空白；attr 必须保持
 * info.trim() 语义，否则 fence-language 原文补丁会被投影校验拒绝。
 */
export function buildLanguageAttr(current: string | null, nextToken: string): string | null {
  const base = current ?? "";
  const token = firstInfoToken(base);
  const next = `${nextToken}${base.slice(token.length)}`.trim();
  return next === "" ? null : next;
}

function isAllowedClassToken(token: string): boolean {
  if (token.startsWith("hljs-")) return HLJS_SCOPES[token.slice("hljs-".length)] === true;
  if (HLJS_SUBSCOPES[token] === true) return true;
  if (token.startsWith("language-")) {
    return resolveHighlightLanguageId(token.slice("language-".length)) !== null;
  }
  return false;
}

interface CollectedSpan {
  from: number;
  to: number;
  text: string;
  class: string;
}

/**
 * HTML parser 会把文本节点中的 CRLF/CR 规范化为 LF；先构造
 * 规范化文本与原始偏移映射，再逐字比对，保证还原的
 * textContent 与 PM 原文一致（含 CRLF 原始字节位置）。
 */
function buildEolMap(code: string): { normalized: string; offsets: number[] } {
  const offsets: number[] = [0];
  let normalized = "";
  for (let index = 0; index < code.length; ) {
    if (code[index] === "\r") {
      normalized += "\n";
      offsets.push(code[index + 1] === "\n" ? index + 2 : index + 1);
      index = offsets[offsets.length - 1];
    } else {
      normalized += code[index];
      offsets.push(index + 1);
      index += 1;
    }
  }
  return { normalized, offsets };
}

/**
 * 在 inert <template> 中解析 highlighter HTML，只接受预定义类名与
 * <span> 嵌套；逐字比对保证还原 textContent 与 PM 原文一致，
 * 任一不符即放弃全部装饰，绝不把该 HTML 注入编辑 DOM。
 */
function parseHighlightHtml(html: string, code: string): readonly HighlightSpan[] | null {
  if (!html) return code.length ? null : [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const { normalized, offsets } = buildEolMap(code);
  const spans: CollectedSpan[] = [];
  let offset = 0;
  let valid = true;

  const walk = (parent: Node, classes: readonly string[]): void => {
    if (!valid) return;
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) {
        const text = child.nodeValue ?? "";
        if (text && normalized.startsWith(text, offset)) {
          if (classes.length) {
            const from = offsets[offset];
            const to = offsets[offset + text.length];
            spans.push({ from, to, text: code.slice(from, to), class: classes.join(" ") });
          }
          offset += text.length;
        } else if (text) {
          valid = false;
          return;
        }
        continue;
      }
      if (child.nodeType !== 1 || child.nodeName !== "SPAN") {
        valid = false;
        return;
      }
      const element = child as Element;
      if ([...element.attributes].some((attribute) => attribute.name !== "class")) {
        valid = false;
        return;
      }
      const tokens = element.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? [];
      if (!tokens.length || !tokens.every(isAllowedClassToken)) {
        valid = false;
        return;
      }
      walk(child, [...classes, ...tokens]);
    }
  };

  walk(template.content, []);
  if (!valid || offset !== normalized.length) return null;

  const merged: HighlightSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && last.class === span.class && last.to === span.from) {
      merged[merged.length - 1] = {
        from: last.from,
        to: span.to,
        text: last.text + span.text,
        class: last.class,
      };
    } else {
      merged.push(span);
    }
  }
  return merged;
}

/** 高亮计算计数：用于验证未变代码块命中缓存、不重复运行 highlighter。 */
export const codeHighlightMetrics = { computations: 0 };

export function resetCodeHighlightMetrics(): void {
  codeHighlightMetrics.computations = 0;
}

/**
 * 离线计算 token 高亮区间。未知语言 / plain / 空代码返回空区间，
 * 代码块按字面显示，不修改任何内容。
 */
export function highlightCodeSpans(code: string, languageAttr: string | null): readonly HighlightSpan[] {
  if (!code) return [];
  const languageId = resolveHighlightLanguageId(firstInfoToken(languageAttr));
  if (!languageId) return [];
  codeHighlightMetrics.computations += 1;
  try {
    const result = hljs.highlight(code, { language: languageId, ignoreIllegals: true });
    return parseHighlightHtml(result.value, code) ?? [];
  } catch {
    return [];
  }
}

function decorationsForSpans(spans: readonly HighlightSpan[], contentStart: number): Decoration[] {
  return spans.map((span) =>
    Decoration.inline(
      contentStart + span.from,
      contentStart + span.to,
      { class: span.class },
      { tokenClass: span.class },
    ),
  );
}

/**
 * 创建 EditorView decorations prop。按 code 节点（WeakMap）缓存高亮结果，
 * 正文其它部分变化时未变代码块不重新运行 highlighter。
 */
export function createCodeHighlightDecorations(): (state: EditorState) => DecorationSet {
  const cache = new WeakMap<PMNode, readonly HighlightSpan[]>();
  return (state: EditorState): DecorationSet => {
    const decorations: Decoration[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name !== "code_block") return;
      let spans = cache.get(node);
      if (!spans) {
        spans = highlightCodeSpans(node.textContent, node.attrs.language);
        cache.set(node, spans);
      }
      decorations.push(...decorationsForSpans(spans, pos + 1));
    });
    return DecorationSet.create(state.doc, decorations);
  };
}

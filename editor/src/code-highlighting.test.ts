import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CODE_LANGUAGES,
  buildLanguageAttr,
  codeHighlightMetrics,
  createCodeHighlightDecorations,
  firstInfoToken,
  highlightCodeSpans,
  resolveHighlightLanguageId,
  resetCodeHighlightMetrics,
} from "./code-highlighting";
import { inkoraSchema } from "./schema";
import { createInkoraProjectionState } from "./editor-session";
import { EditorState } from "prosemirror-state";
import { parseMarkdown } from "./markdown-codec";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("code highlighting language registry", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><main></main>");
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  });

  it("bundles the agreed technical-document languages", () => {
    expect(CODE_LANGUAGES.map((language) => language.id)).toEqual(expect.arrayContaining([
      "bash",
      "css",
      "go",
      "javascript",
      "json",
      "markdown",
      "python",
      "rust",
      "sql",
      "swift",
      "typescript",
      "xml",
      "yaml",
    ]));
    expect(CODE_LANGUAGES).toHaveLength(193);
    expect(new Set(CODE_LANGUAGES.map(language => language.id)).size).toBe(193);
    for (const language of CODE_LANGUAGES) {
      expect(language.label).toContain(language.id);
      expect(language.label).toMatch(/[\u4e00-\u9fff（(]/);
    }
  });

  it("resolves registered aliases and rejects unknown tokens without rewriting them", () => {
    expect(resolveHighlightLanguageId("python")).toBe("python");
    expect(resolveHighlightLanguageId("py")).toBe("python");
    expect(resolveHighlightLanguageId("ts")).toBe("typescript");
    expect(resolveHighlightLanguageId("js")).toBe("javascript");
    expect(resolveHighlightLanguageId("sh")).toBe("bash");
    expect(resolveHighlightLanguageId("html")).toBe("xml");
    expect(resolveHighlightLanguageId("yml")).toBe("yaml");
    expect(resolveHighlightLanguageId("md")).toBe("markdown");
    expect(resolveHighlightLanguageId("")).toBeNull();
    expect(resolveHighlightLanguageId("brainfart")).toBeNull();
  });

  it("splits only the first info token for language attrs", () => {
    expect(firstInfoToken(null)).toBe("");
    expect(firstInfoToken("")).toBe("");
    expect(firstInfoToken("rust")).toBe("rust");
    expect(firstInfoToken("rust title=x")).toBe("rust");
    expect(firstInfoToken("  rust  title=x  ")).toBe("rust");
  });

  it("builds the next language attr by replacing only the first token", () => {
    expect(buildLanguageAttr(null, "rust")).toBe("rust");
    expect(buildLanguageAttr("rust", "python")).toBe("python");
    expect(buildLanguageAttr("rust title=x", "python")).toBe("python title=x");
    expect(buildLanguageAttr("rust", "")).toBeNull();
    expect(buildLanguageAttr("rust title=x", "")).toBe("title=x");
    expect(buildLanguageAttr(null, "")).toBeNull();
  });
});

describe("code highlighting token spans", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><main></main>");
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  });

  it("returns frozen UTF-16 oracle spans for a python snippet", () => {
    const code = 'def f():\n    return "héllo"';
    const spans = highlightCodeSpans(code, "python");
    const byFrom = new Map(spans.map((span) => [span.from, span]));
    expect(byFrom.get(0)).toMatchObject({ to: 3, class: "hljs-keyword", text: "def" });
    expect(byFrom.get(4)).toMatchObject({ to: 5, class: "hljs-title function_", text: "f" });
    expect(byFrom.get(13)).toMatchObject({ to: 19, class: "hljs-keyword", text: "return" });
    expect(byFrom.get(20)).toMatchObject({ to: 27, class: "hljs-string", text: '"héllo"' });
  });

  it("retains all thirteen baseline language oracles and only whitelisted classes", () => {
    const samples: Record<string, string> = {
      bash: '#!/bin/bash\necho "hi"',
      css: "a { color: red; }",
      go: "package main",
      javascript: "const x = 1;",
      json: '{"a": 1}',
      markdown: "# 标题\n\n*强调* `代码`",
      python: "def f(): pass",
      rust: "fn main() {}",
      sql: "SELECT a FROM t WHERE x = 1;",
      swift: "struct S {}",
      typescript: "interface A { x?: number }",
      xml: '<p class="x">文本</p>',
      yaml: "key: value\nlist:\n  - 1",
    };
    for (const [id, sample] of Object.entries(samples)) {
      const language = CODE_LANGUAGES.find(language => language.id === id)!;
      expect(language).toBeDefined();
      const spans = highlightCodeSpans(sample, language.id);
      expect(spans.length, `${language.id} should produce at least one span`).toBeGreaterThan(0);
      let cursor = 0;
      let sawSpan = false;
      for (const span of spans) {
        expect(span.from).toBeGreaterThanOrEqual(cursor);
        expect(span.to).toBeGreaterThan(span.from);
        expect(span.class).toMatch(/^hljs-[a-z_-]+( (hljs-)?[a-z_]+)*$/);
        expect(samples[language.id].slice(span.from, span.to).length).toBe(span.to - span.from);
        cursor = span.to;
        sawSpan = true;
      }
      expect(sawSpan).toBe(true);
      expect(cursor).toBeLessThanOrEqual(samples[language.id].length);
    }
  });

  it("keeps emoji, CRLF and BOM code literal with exact offsets", () => {
    const code = '\uFEFFx = "🎉"\r\nprint(x)';
    const spans = highlightCodeSpans(code, "python");
    const text = spans.map((span) => span.text).join("");
    const plain = spans.map((span) => code.slice(span.from, span.to)).join("");
    expect(plain.length).toBeGreaterThan(0);
    expect(text.length).toBe(plain.length);
    // 🎉 counts as two UTF-16 units: the string span must end after the closing quote.
    const string = spans.find((span) => span.class.includes("hljs-string"));
    expect(string).toBeDefined();
    expect(code.slice(string!.from, string!.to)).toBe('"🎉"');
  });

  it("keeps hostile markup literal instead of injecting nodes", () => {
    const code = '<img src=x onerror="alert(1)"><script>alert(2)</script>&amp;';
    const spans = highlightCodeSpans(code, "xml");
    for (const span of spans) {
      for (const token of span.class.split(" ")) {
        expect(token).toMatch(/^(hljs-[a-z_]+|[a-z_]+|language-[a-z0-9+#-]+)$/);
      }
      expect(code.slice(span.from, span.to)).toBe(span.text);
    }
    const joined = spans.map((span) => span.text).join("");
    expect(code.startsWith(joined)).toBe(true);
  });

  it("returns no spans for unknown languages, plain text and empty code", () => {
    expect(highlightCodeSpans("def f(): pass", "brainfart")).toEqual([]);
    expect(highlightCodeSpans("def f(): pass", null)).toEqual([]);
    expect(highlightCodeSpans("", "python")).toEqual([]);
    expect(highlightCodeSpans("  \n", "python")).toEqual([]);
  });
});

describe("code highlight view decorations", () => {
  const dom = new JSDOM("<!doctype html><main></main>", { pretendToBeVisual: true });
  const decorations = createCodeHighlightDecorations();

  function stateFor(raw: string): EditorState {
    return createInkoraProjectionState(parseMarkdown(raw));
  }

  function spanCount(state: EditorState): number {
    return decorations(state).find().length;
  }

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    resetCodeHighlightMetrics();
  });

  it("decorates fenced code blocks with known languages only", () => {
    const state = stateFor("```python\ndef f(): pass\n```\n\n```brainfart\n??\n```\n");
    const spans = decorations(state).find();
    expect(spans.length).toBeGreaterThan(0);
    const classes = spans.map((decoration) => String(decoration.spec.tokenClass));
    expect(classes).toContain("hljs-keyword");
  });

  it("reuses cached highlight for untouched code blocks when other prose changes", () => {
    const code = "def f():\n    return 1\n";
    const state = stateFor(`段落\n\n\`\`\`python\n${code}\`\`\`\n\n结尾\n`);
    expect(spanCount(state)).toBeGreaterThan(0);
    const before = codeHighlightMetrics.computations;
    expect(before).toBeGreaterThan(0);
    // 编辑正文：code 节点对象保持不变，命中缓存，不重新运行 highlighter。
    const tr = state.tr.insertText("新", 2);
    const next = state.apply(tr);
    expect(spanCount(next)).toBe(spanCount(state));
    expect(codeHighlightMetrics.computations).toBe(before);
  });

  it("recomputes highlight when the code content itself changes", () => {
    const state = stateFor("```python\nx = 1\n```\n");
    decorations(state);
    const before = codeHighlightMetrics.computations;
    const doc = state.doc;
    let codeFrom = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "code_block") codeFrom = pos + 1;
    });
    const next = state.apply(state.tr.insertText("def g(): pass", codeFrom));
    const classes = decorations(next).find().map((decoration) => String(decoration.spec.tokenClass));
    expect(codeHighlightMetrics.computations).toBeGreaterThan(before);
    expect(classes).toContain("hljs-keyword");
  });

  it("does not decorate plain or unknown language fences", () => {
    expect(spanCount(stateFor("```\nplain text\n```\n"))).toBe(0);
    expect(spanCount(stateFor("```unknown-lang\n???\n```\n"))).toBe(0);
  });

  it("uses the shared inkora schema without schema changes", () => {
    expect(inkoraSchema.nodes.code_block).toBeDefined();
    expect(inkoraSchema.nodes.code_block.spec.attrs).toBeDefined();
  });
});

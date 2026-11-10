import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Node as PMNode } from "prosemirror-model";
import {
  createCodeBlockNodeViews,
  type CodeBlockViewContext,
  type CodeLanguageChangeResult,
} from "./code-block-view";
import { createInkoraProjectionState } from "./editor-session";
import { parseMarkdown } from "./markdown-codec";
import { createCodeHighlightDecorations } from "./code-highlighting";
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

let dom: JSDOM;
let parent: HTMLElement;

interface Harness {
  view: EditorView;
  isComposing: Mock;
  applyLanguageChange: Mock;
  nodeViews: NodeViewProbe[];
}

const mounted: EditorView[] = [];

function mount(raw: string, result: CodeLanguageChangeResult = { ok: true }): Harness {
  const isComposing = vi.fn(() => false);
  const applyLanguageChange = vi.fn(() => result);
  const context: CodeBlockViewContext = { isComposing, applyLanguageChange };
  const factory = createCodeBlockNodeViews(context);
  const nodeViews: NodeViewProbe[] = [];
  const state = createInkoraProjectionState(parseMarkdown(raw));
  const decorations = createCodeHighlightDecorations();
  const view = new EditorView(parent, {
    state,
    decorations,
    nodeViews: {
      code_block: (node, editorView, getPos) => {
        const nodeView = factory(node, editorView, getPos);
        nodeViews.push(nodeView);
        return nodeView;
      },
    },
  });
  mounted.push(view);
  return { view, isComposing, applyLanguageChange, nodeViews };
}

interface NodeViewProbe {
  stopEvent(event: { target: Node }): boolean;
  ignoreMutation(mutation: { target: Node }): boolean;
}

function selectOf(harness: Harness, index = 0): HTMLSelectElement {
  const selects = [...harness.view.dom.querySelectorAll<HTMLSelectElement>("select.inkora-code-language")];
  const select = selects[index];
  if (!select) throw new Error("missing language select");
  return select;
}

function optionLabels(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.textContent ?? "");
}

function fire(target: Element, type: string): Event {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("code block node view", () => {
  beforeEach(() => {
    dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    parent = dom.window.document.querySelector<HTMLElement>("#app")!;
  });

  afterEach(() => {
    for (const view of mounted) view.destroy();
    mounted.length = 0;
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });


  it("renders a visible keyboard-reachable language select with Chinese labels", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const select = selectOf(harness);
    expect(select.getAttribute("aria-label")).toBe("代码块语言");
    expect(select.disabled).toBe(false);
    const labels = optionLabels(select);
    expect(labels).toContain("纯文本（无语言）");
    expect(labels).toContain("Python（python）");
    expect(labels).toContain("Swift（swift）");
    expect(labels).toContain("YAML（yaml）");
    expect(select.value).toBe("python");
  });

  it("keeps PM owning the pre>code editing DOM and code text", () => {
    const harness = mount("```rust\nfn main() {}\n```\n");
    const block = harness.view.dom.querySelector(".inkora-code-block");
    expect(block).not.toBeNull();
    const pre = block!.querySelector("pre");
    const code = block!.querySelector("code");
    expect(pre).not.toBeNull();
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe("fn main() {}");
    expect(harness.view.dom.querySelector("pre code")).toBe(code);
  });

  it("keeps alias info literal with a dedicated preserved option", () => {
    const harness = mount("```ts\nlet x = 1;\n```\n");
    const select = selectOf(harness);
    expect(select.value).toBe("ts");
    expect(optionLabels(select)[0]).toBe("保持 ts（TypeScript 别名）");
    fire(select, "change");
    expect(harness.applyLanguageChange).not.toHaveBeenCalled();
  });

  it("keeps unknown language literal and offers plain highlight-free display", () => {
    const harness = mount("```brainfart\n???\n```\n");
    const select = selectOf(harness);
    expect(select.value).toBe("brainfart");
    expect(optionLabels(select)[0]).toBe("保持 brainfart（未知语言，按纯文本显示）");
    fire(select, "change");
    expect(harness.applyLanguageChange).not.toHaveBeenCalled();
  });

  it("requests only the first info token replacement on language change", () => {
    const harness = mount("```rust title=x\nfn t() {}\n```\n");
    const select = selectOf(harness);
    select.value = "python";
    fire(select, "change");
    expect(harness.applyLanguageChange).toHaveBeenCalledTimes(1);
    const [getPos, node, nextLanguage] = harness.applyLanguageChange.mock.calls[0];
    expect(typeof getPos).toBe("function");
    expect((node as PMNode).attrs.language).toBe("rust title=x");
    expect(nextLanguage).toBe("python title=x");
  });

  it("covers no-language to language and language to plain transitions", () => {
    const plain = mount("```\nplain\n```\n");
    const plainSelect = selectOf(plain);
    expect(plainSelect.value).toBe("");
    plainSelect.value = "swift";
    fire(plainSelect, "change");
    expect(plain.applyLanguageChange.mock.calls[0][2]).toBe("swift");
    plain.view.destroy();

    const fenced = mount("```swift\nlet x = 1\n```\n");
    const select = selectOf(fenced);
    select.value = "";
    fire(select, "change");
    expect(fenced.applyLanguageChange.mock.calls[0][2]).toBeNull();
  });

  it("treats repeated identical language selection as a no-op", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const select = selectOf(harness);
    select.value = "python";
    fire(select, "change");
    expect(harness.applyLanguageChange).not.toHaveBeenCalled();
  });

  it("shows the failure message locally and restores the selector on rejection", () => {
    const harness = mount("```python\nx = 1\n```\n", {
      ok: false,
      message: "代码围栏 info string 含未建模字节，已拒绝局部改写",
    });
    const select = selectOf(harness);
    select.value = "go";
    fire(select, "change");
    const message = harness.view.dom.querySelector(".inkora-code-message");
    expect(message?.textContent).toBe("代码围栏 info string 含未建模字节，已拒绝局部改写");
    expect(select.value).toBe("python");
  });

  it("disables language selection for indented code blocks with a reason", () => {
    const harness = mount("正文\n\n    indented code\n");
    const select = selectOf(harness);
    expect(select.disabled).toBe(true);
    const message = harness.view.dom.querySelector(".inkora-code-message");
    expect(message?.textContent).toContain("缩进代码块没有围栏语言信息");
  });

  it("guards pointerdown, click and change during composition without stealing focus", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const select = selectOf(harness);
    const toolbar = select.closest(".inkora-code-toolbar") as HTMLElement;
    harness.isComposing.mockReturnValue(true);
    const pointer = fire(select, "pointerdown");
    expect(pointer.defaultPrevented).toBe(true);
    const click = fire(select, "click");
    expect(click.defaultPrevented).toBe(true);
    select.value = "go";
    fire(select, "change");
    expect(harness.applyLanguageChange).not.toHaveBeenCalled();
    expect(select.value).toBe("python");
    const message = harness.view.dom.querySelector(".inkora-code-message");
    expect(message?.textContent).toContain("请先完成中文输入");
    harness.isComposing.mockReturnValue(false);
    select.value = "go";
    fire(select, "change");
    expect(harness.applyLanguageChange).toHaveBeenCalledTimes(1);
  });

  it("isolates toolbar events from ProseMirror while code edits stay routed", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const select = selectOf(harness);
    const toolbar = select.closest(".inkora-code-toolbar") as HTMLElement;
    const code = harness.view.dom.querySelector("code")!;
    const views = harness.nodeViews;
    expect(views.length).toBe(1);
    expect(views[0].stopEvent({ target: select })).toBe(true);
    expect(views[0].stopEvent({ target: toolbar })).toBe(true);
    expect(views[0].stopEvent({ target: code })).toBe(false);
    expect(views[0].ignoreMutation({ target: select })).toBe(true);
    expect(views[0].ignoreMutation({ target: code })).toBe(false);
  });

  it("opens an offline notice and returns focus without replacing language or document", () => {
    const h = mount("```js\nx\n```\n");
    const select = selectOf(h);
    const before = h.view.state;
    const trigger = h.view.dom.querySelector<HTMLButtonElement>("button.inkora-code-license")!;
    expect(trigger).not.toBeNull();
    expect(h.view.dom.querySelector(".inkora-code-notices pre")!.textContent).toBe("");
    trigger.click();
    const panel = h.view.dom.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector("pre")!.textContent).toBe(readFileSync(new URL("../public/RENDERER_NOTICES.txt", import.meta.url), "utf8"));
    panel.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key:"Escape", bubbles:true,cancelable:true}));
    expect(panel.hidden).toBe(true);
    expect(dom.window.document.activeElement).toBe(trigger);
    expect(selectOf(h)).toBe(select);
    expect(h.view.state).toBe(before);
  });

  it("exposes the shipped third-party notice for the bundled highlighter", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const link = harness.view.dom.querySelector<HTMLButtonElement>("button.inkora-code-license");
    expect(link).not.toBeNull();
    link!.click();
    expect(harness.view.dom.querySelector(".inkora-code-notices pre")!.textContent).toContain("Inkora production dependency licenses");
    expect(link!.getAttribute("aria-label")).toBe("第三方许可");
  });

  it("syncs the selector when the node updates externally", () => {
    const harness = mount("```python\nx = 1\n```\n");
    const select = selectOf(harness);
    expect(select.value).toBe("python");
    const doc = harness.view.state.doc;
    let pos = -1;
    doc.descendants((node, at) => {
      if (node.type.name === "code_block") pos = at;
    });
    harness.view.dispatch(harness.view.state.tr.setNodeMarkup(pos, undefined, {
      ...doc.nodeAt(pos)!.attrs,
      language: "rust title=x",
    }));
    expect(select.value).toBe("rust");
    expect(optionLabels(select)[0]).toBe("纯文本（无语言）");
  });
});

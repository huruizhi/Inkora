import { JSDOM } from "jsdom";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { splitBlock } from "prosemirror-commands";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";
import type { InkoraEditorSession } from "./editor-session";
import type { SourceAuthoritySession } from "./source-authority";
import { createPasteTransaction } from "./editor-session";
import {
  setHeading,
  setParagraph,
  setCodeBlock,
  wrapBlockquote,
  liftBlock,
  wrapBulletList,
  wrapOrderedList,
  blockKeyBindings,
} from "./block-editing";
import {
  toggleStrong,
  toggleEm,
  toggleStrike,
  toggleCode,
  setLink,
  unsetLink,
} from "./inline-formatting";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function createRuntime(raw: string): {
  dom: JSDOM;
  runtime: EditorRuntime;
  session: InkoraEditorSession;
} {
  const dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector<HTMLElement>("#app")!;
  const runtime = createEditorRuntime(parent, raw, () => {});
  const editor = parent.querySelector<HTMLElement>("#editor");
  if (!editor || editor instanceof dom.window.HTMLTextAreaElement) {
    throw new Error("Expected visual source-authoritative runtime");
  }
  const session = (runtime as unknown as { session: InkoraEditorSession }).session;
  return { dom, runtime, session };
}

describe("production source authority runtime", () => {
  it("accepts one managed image import as one raw/history/revision transaction", () => {
    const { runtime, session } = createRuntime("前后\r\n");
    const sourceSession = session as unknown as SourceAuthoritySession;
    expect(sourceSession.setRawSelection(1)).toBe(true);
    const imported = sourceSession.insertImage({
      uri: "文档.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25.png",
      alt: "架构图",
      title: "标题",
    });

    expect(imported).toBe(true);
    expect(runtime.getText()).toBe('前![架构图](文档.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25.png "标题")后\r\n');
    expect(sourceSession.status.revision).toBe(1);
    expect(sourceSession.past).toHaveLength(1);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("前后\r\n");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toContain("文档.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25.png");
    runtime.destroy();
  });

  it("refreshes image capabilities and layered placeholders without changing document state", () => {
    const raw = "![本地](./doc.assets/a.png) ![外部](https://example.test/a.png)\n";
    const { runtime, session, dom } = createRuntime(raw);
    const sourceSession = session as unknown as SourceAuthoritySession;
    const before = sourceSession.stateReport();
    expect(dom.window.document.querySelectorAll(".image-node img"), dom.window.document.body.innerHTML).toHaveLength(0);
    expect(dom.window.document.body.textContent).toContain("离线外部图片");

    (runtime as unknown as {
      applyImageDescriptors(values: Array<{
        href: string;
        status: string;
        displayURL?: string;
        message?: string;
      }>): void;
    }).applyImageDescriptors([
      {
        href: "./doc.assets/a.png",
        status: "ready",
        displayURL: "inkora-asset://resource/123e4567-e89b-12d3-a456-426614174000",
      },
    ]);

    const image = dom.window.document.querySelector<HTMLImageElement>(".image-node img");
    expect(image?.getAttribute("src")).toBe("inkora-asset://resource/123e4567-e89b-12d3-a456-426614174000");
    expect(runtime.getText()).toBe(raw);
    expect(sourceSession.stateReport()).toMatchObject({
      currentRaw: before.currentRaw,
      savedRaw: before.savedRaw,
      version: before.version,
      documentDirty: false,
    });
    runtime.destroy();
  });

  it("offers a real inline alt/title editor backed by the source transaction", () => {
    const { runtime, dom } = createRuntime('前 ![旧](./a.png "旧题") 后\n');
    const edit = dom.window.document.querySelector<HTMLButtonElement>(".image-edit-button")!;
    edit.click();
    const form = dom.window.document.querySelector<HTMLFormElement>(".image-attributes-form")!;
    const alt = form.querySelector<HTMLInputElement>('[name="alt"]')!;
    const title = form.querySelector<HTMLInputElement>('[name="title"]')!;
    alt.value = "新描述";
    title.value = "新标题";
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

    expect(runtime.getText()).toBe('前 ![新描述](./a.png "新标题") 后\n');
    expect(dom.window.document.querySelector(".image-attributes-form")).toBeNull();
    runtime.destroy();
  });

  it("rewrites only the unique draft owner as an explicit first-save history unit", () => {
    const { runtime, session } = createRuntime("已有 ![keep](old.assets/a.png)\n");
    const sourceSession = session as unknown as SourceAuthoritySession;
    expect(sourceSession.setRawSelection(sourceSession.currentRaw.length)).toBe(true);
    expect(sourceSession.insertImage({
      uri: "inkora-draft://asset/123e4567-e89b-12d3-a456-426614174000",
      alt: "新图",
      title: null,
    })).toBe(true);
    const draftRaw = runtime.getText();

    expect(sourceSession.rewriteManagedImages([{
      assetID: "123e4567-e89b-12d3-a456-426614174000",
      from: "inkora-draft://asset/123e4567-e89b-12d3-a456-426614174000",
      to: "Note.assets/%E6%96%B0%20%E5%9B%BE.png",
    }])).toBe(true);
    expect(runtime.getText()).toContain("![keep](old.assets/a.png)");
    expect(runtime.getText()).toContain("Note.assets/%E6%96%B0%20%E5%9B%BE.png");
    expect(runtime.getText()).not.toContain("inkora-draft:");
    expect(sourceSession.status.revision).toBe(2);
    expect(sourceSession.undo()).toBe(true);
    expect(runtime.getText()).toBe(draftRaw);
    expect(sourceSession.redo()).toBe(true);
    expect(runtime.getText()).not.toContain("inkora-draft:");
    runtime.destroy();
  });

  it("refuses a managed rewrite when source editing changed the draft URI into a normal link", () => {
    const draft = "inkora-draft://asset/123e4567-e89b-12d3-a456-426614174000";
    const { runtime, session } = createRuntime(`![图](${draft})\n`);
    const sourceSession = session as unknown as SourceAuthoritySession;
    expect(sourceSession.beginSource()).toBe(true);
    expect(sourceSession.updateDraft(`[不是图片](${draft})\n`)).toBe(true);
    expect(sourceSession.applySource()).toBe(true);
    const before = sourceSession.stateReport();

    expect(sourceSession.rewriteManagedImages([{
      assetID: "123e4567-e89b-12d3-a456-426614174000",
      from: draft,
      to: "Note.assets/a.png",
    }])).toBe(false);
    expect(sourceSession.stateReport()).toMatchObject({
      currentRaw: before.currentRaw,
      version: before.version,
    });
    expect(runtime.getText()).toBe(`[不是图片](${draft})\n`);
    runtime.destroy();
  });

  it("deletes and restores one image owner without rewriting adjacent marks", () => {
    const raw = '**前** [![空 alt](./图%20片.png "标题")](./target) *后*\r\n';
    const { runtime, session } = createRuntime(raw);
    let imagePosition = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePosition = pos;
    });
    expect(imagePosition).toBeGreaterThan(0);
    session.dispatch(session.state.tr.setSelection(NodeSelection.create(session.state.doc, imagePosition)));
    expect(session.dispatch(session.state.tr.deleteSelection())).toBe(true);
    expect(runtime.getText()).toBe("**前** [](./target) *后*\r\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("**前** [](./target) *后*\r\n");
    runtime.destroy();
  });

  it("edits one image alt/title as one source history unit without touching neighbours", () => {
    const raw = '**前** [![旧描述][图]](./target) *后*\r\n\r\n[图]: ./图%20片.png "旧标题"\r\n';
    const { runtime, session } = createRuntime(raw);
    let imagePosition = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePosition = pos;
    });
    expect(imagePosition).toBeGreaterThan(0);
    const image = session.state.doc.nodeAt(imagePosition)!;

    expect(session.dispatch(session.state.tr.setNodeMarkup(imagePosition, undefined, {
      ...image.attrs,
      alt: "新描述",
      title: "新标题",
    }))).toBe(true);
    expect(runtime.getText()).toBe(
      '**前** [![新描述](./%E5%9B%BE%20%E7%89%87.png "新标题")](./target) *后*\r\n\r\n[图]: ./图%20片.png "旧标题"\r\n',
    );
    expect(session.status.revision).toBe(1);
    expect(session.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(session.redo()).toBe(true);
    expect(runtime.getText()).toContain('![新描述](./%E5%9B%BE%20%E7%89%87.png "新标题")');
    runtime.destroy();
  });

  function execute(session: InkoraEditorSession, command: Command): boolean {
    return command(session.state, transaction => session.dispatch(transaction));
  }

  function typeThroughInputRules(view: EditorView, text: string): void {
    for (const character of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", handler =>
        handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
    }
  }

  it.each([
    ["heading", "## ", "heading"],
    ["blockquote", "> ", "blockquote"],
    ["bullet list", "- ", "bullet_list"],
    ["ordered list", "3. ", "ordered_list"],
    ["code fence", "```ts ", "code_block"],
    ["horizontal rule", "---", "horizontal_rule"],
  ] as const)("keeps the %s input rule on the source projection", (_name, typed, nodeType) => {
    const { runtime, session } = createRuntime("");
    const view = (runtime as unknown as { view: EditorView }).view;
    typeThroughInputRules(view, typed);
    expect(runtime.getText(), (session as unknown as { diagnostic?: string }).diagnostic).toBe(typed);
    expect(session.state.doc.firstChild?.type.name).toBe(nodeType);
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it.each([
    ["strong", "**正文**", "strong"],
    ["em", "*正文*", "em"],
    ["strike", "~~正文~~", "strike"],
    ["code", "`正文`", "code"],
    ["link", "[正文](./target)", "link"],
  ] as const)("keeps the %s inline input rule on the source projection", (_name, typed, mark) => {
    const { runtime, session } = createRuntime("");
    const view = (runtime as unknown as { view: EditorView }).view;
    typeThroughInputRules(view, typed);
    expect(runtime.getText(), (session as unknown as { diagnostic?: string }).diagnostic).toBe(typed);
    expect(session.state.doc.firstChild?.firstChild?.marks.some(value => value.type.name === mark)).toBe(true);
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it.each([
    ["strong", toggleStrong, "**正文**\n"],
    ["em", toggleEm, "*正文*\n"],
    ["strike", toggleStrike, "~~正文~~\n"],
    ["code", toggleCode, "`正文`\n"],
  ] as const)("adds and removes the %s mark through local source patches", (_name, command, marked) => {
    const added = createRuntime("正文\n");
    added.session.dispatch(added.session.state.tr.setSelection(TextSelection.create(added.session.state.doc, 1, 3)));
    expect(execute(added.session, command)).toBe(true);
    expect(added.runtime.getText()).toBe(marked);
    expect(added.runtime.snapshotText()).toEqual({ ok: true, value: marked });
    added.runtime.destroy();

    const removed = createRuntime(marked);
    removed.session.dispatch(removed.session.state.tr.setSelection(TextSelection.create(removed.session.state.doc, 1, 3)));
    expect(execute(removed.session, command)).toBe(true);
    expect(removed.runtime.getText()).toBe("正文\n");
    expect(removed.runtime.status.unresolved).toBe(false);
    removed.runtime.destroy();
  });

  it("adds and removes an inline link without serializing untouched bytes", () => {
    const added = createRuntime("前 正文 后\r\n");
    added.session.dispatch(added.session.state.tr.setSelection(TextSelection.create(added.session.state.doc, 3, 5)));
    expect(execute(added.session, setLink({ href: "./target", title: "标题" }))).toBe(true);
    expect(added.runtime.getText()).toBe('前 [正文](./target "标题") 后\r\n');
    added.runtime.destroy();

    const removed = createRuntime('前 [正文](./target "标题") 后\r\n');
    removed.session.dispatch(removed.session.state.tr.setSelection(TextSelection.create(removed.session.state.doc, 3, 5)));
    expect(execute(removed.session, unsetLink)).toBe(true);
    expect(removed.runtime.getText()).toBe("前 正文 后\r\n");
    removed.runtime.destroy();
  });

  it("removes a mark from only the selected middle and preserves both marked sides", () => {
    const { runtime, session } = createRuntime("**abc**\n");
    session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 2, 3)));
    expect(execute(session, toggleStrong)).toBe(true);
    expect(runtime.getText()).toBe("**a**b**c**\n");
    expect(session.state.doc.firstChild?.child(0).marks.some(mark => mark.type.name === "strong")).toBe(true);
    expect(session.state.doc.firstChild?.child(1).marks).toHaveLength(0);
    expect(session.state.doc.firstChild?.child(2).marks.some(mark => mark.type.name === "strong")).toBe(true);
    runtime.destroy();
  });

  it("adds and removes strong across paragraphs with independent local delimiters", () => {
    const added = createRuntime("one\n\ntwo\n");
    added.session.dispatch(added.session.state.tr.setSelection(TextSelection.create(added.session.state.doc, 1, 9)));
    expect(execute(added.session, toggleStrong)).toBe(true);
    expect(added.runtime.getText()).toBe("**one**\n\n**two**\n");
    added.runtime.destroy();

    const removed = createRuntime("**one**\n\n**two**\n");
    removed.session.dispatch(removed.session.state.tr.setSelection(TextSelection.create(removed.session.state.doc, 1, 9)));
    expect(execute(removed.session, toggleStrong)).toBe(true);
    expect(removed.runtime.getText()).toBe("one\n\ntwo\n");
    removed.runtime.destroy();
  });

  it.each([
    ["heading", setHeading(2), "## 正文\n", "heading"],
    ["blockquote", wrapBlockquote, "> 正文\n", "blockquote"],
    ["bullet list", wrapBulletList, "- 正文\n", "bullet_list"],
    ["ordered list", wrapOrderedList, "1. 正文\n", "ordered_list"],
    ["code block", setCodeBlock("ts"), "```ts\n正文\n```\n", "code_block"],
  ] as const)("applies the %s command with a bounded source patch", (_name, command, expected, nodeType) => {
    const { runtime, session } = createRuntime("正文\n");
    expect(execute(session, command)).toBe(true);
    expect(runtime.getText()).toBe(expected);
    expect(session.state.doc.firstChild?.type.name).toBe(nodeType);
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it("converts an ATX heading back to paragraph", () => {
    const { runtime, session } = createRuntime("## 正文\n");
    expect(execute(session, setParagraph)).toBe(true);
    expect(runtime.getText()).toBe("正文\n");
    expect(session.state.doc.firstChild?.type.name).toBe("paragraph");
    runtime.destroy();
  });

  it("lifts a blockquote with a local prefix patch", () => {
    const { runtime, session } = createRuntime("> 正文\n");
    expect(execute(session, liftBlock)).toBe(true);
    expect(runtime.getText()).toBe("正文\n");
    expect(session.state.doc.firstChild?.type.name).toBe("paragraph");
    runtime.destroy();
  });

  it("keeps code-block Enter and Tab exact", () => {
    const { runtime, session } = createRuntime("```ts\ncode\n```\n");
    let end = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "code") end = pos + node.nodeSize;
    });
    session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, end)));
    expect(execute(session, blockKeyBindings.Enter)).toBe(true);
    expect(execute(session, blockKeyBindings.Tab)).toBe(true);
    expect(runtime.getText()).toBe("```ts\ncode\n\t\n```\n");
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it("synthetically aggregates final-before-end, replacement and no-op composition sessions", async () => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    const changes: string[] = [];
    const runtime = createEditorRuntime(dom.window.document.querySelector("main")!, "ab\n", (_status, kind) => {
      if (kind === "document") changes.push(runtime.getText());
    });
    let view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    view.dispatch(view.state.tr.insertText("中文").setMeta("composition", 81));
    view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
    expect(await runtime.whenCompositionStable()).toBe(true);
    expect(runtime.getText()).toBe("中文\n");
    expect(changes).toEqual(["中文\n"]);

    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("ab\n");
    view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    view.dispatch(view.state.tr.insertText("x").setMeta("composition", 82));
    view.dispatch(view.state.tr.delete(2, 3).setMeta("composition", 82));
    view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
    expect(await runtime.whenCompositionStable()).toBe(true);
    expect(runtime.getText()).toBe("ab\n");
    expect(changes).toEqual(["中文\n"]);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("中文\n");
    runtime.destroy();
    dom.window.close();
  });

  it("keeps list Enter, indent and outdent on the source-authoritative history", () => {
    const split = createRuntime("- one\n");
    let oneEnd = -1;
    split.session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "one") oneEnd = pos + node.nodeSize;
    });
    split.session.dispatch(split.session.state.tr.setSelection(TextSelection.create(split.session.state.doc, oneEnd)));
    expect(execute(split.session, blockKeyBindings.Enter)).toBe(true);
    expect(split.runtime.getText()).toBe("- one\n- \n");
    split.runtime.destroy();

    const nested = createRuntime("- one\n- two\n");
    let two = -1;
    nested.session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "two") two = pos + 1;
    });
    nested.session.dispatch(nested.session.state.tr.setSelection(TextSelection.create(nested.session.state.doc, two)));
    expect(execute(nested.session, blockKeyBindings.Tab)).toBe(true);
    expect(nested.runtime.getText()).toBe("- one\n  - two\n");
    expect(execute(nested.session, blockKeyBindings["Shift-Tab"])).toBe(true);
    expect(nested.runtime.getText()).toBe("- one\n- two\n");
    nested.runtime.destroy();
  });

  it("synthetically closes one late-final composition as one document publication", async () => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    const changes: string[] = [];
    const runtime = createEditorRuntime(dom.window.document.querySelector("main")!, "a\n", (_status, kind) => {
      if (kind === "document") changes.push(runtime.getText());
    });
    const view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    view.dispatch(view.state.tr.insertText("zh").setMeta("composition", 71));
    view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 10));
    expect(runtime.composing).toBe(true);
    expect(runtime.snapshotText()).toEqual({
      ok: false,
      message: "当前输入尚未形成可安全保存的原文",
    });
    expect(changes).toEqual([]);
    view.dispatch(view.state.tr.insertText("中文", 2, 4).setMeta("composition", 71));
    expect(await runtime.whenCompositionStable()).toBe(true);
    expect(changes).toHaveLength(1);
    expect(changes).toEqual(["a中文\n"]);
    expect(runtime.getText()).toBe("a中文\n");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: "a中文\n" });
    expect(view.state.doc.textContent).toBe("a中文");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("a\n");
    runtime.destroy();
    dom.window.close();
  });

  it("seals consecutive compositions and the next ordinary edit as distinct publications", async () => {
    const dom = new JSDOM("<!doctype html><main></main>", { pretendToBeVisual: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    const changes: string[] = [];
    const runtime = createEditorRuntime(dom.window.document.querySelector("main")!, "ab\n", (_status, kind) => {
      if (kind === "document") changes.push(runtime.getText());
    });
    const view = (runtime as unknown as { view: EditorView }).view;

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    view.dispatch(view.state.tr.insertText("中文").setMeta("composition", 91));
    view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
    // 下一真实 compositionstart 是明确边界，即使前一 quiet window 尚未到达。
    view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    expect(changes).toEqual(["中文\n"]);
    view.dispatch(view.state.tr.insertText("输入").setMeta("composition", 92));
    view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
    expect(await runtime.whenCompositionStable()).toBe(true);

    view.dispatch(view.state.tr.insertText("!"));
    expect(changes).toEqual(["中文\n", "中文输入\n", "中文输入!\n"]);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("中文输入\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("中文\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("ab\n");
    runtime.destroy();
    dom.window.close();
  });

  it("rejects an unended composition drain and resolves pending drains on destroy", async () => {
    const first = createRuntime("a\n");
    const firstView = (first.runtime as unknown as { view: EditorView }).view;
    firstView.dom.dispatchEvent(new first.dom.window.Event("compositionstart", { bubbles: true }));
    expect(await first.runtime.whenCompositionStable()).toBe(false);
    expect(first.runtime.snapshotText().ok).toBe(false);
    firstView.dom.dispatchEvent(new first.dom.window.Event("compositionend", { bubbles: true }));
    expect(await first.runtime.whenCompositionStable()).toBe(true);
    expect(first.runtime.snapshotText()).toEqual({ ok: true, value: "a\n" });
    first.runtime.destroy();
    first.dom.window.close();

    const second = createRuntime("b\n");
    const secondView = (second.runtime as unknown as { view: EditorView }).view;
    secondView.dom.dispatchEvent(new second.dom.window.Event("compositionstart", { bubbles: true }));
    const pending = second.runtime.whenCompositionStable();
    second.runtime.destroy();
    expect(await pending).toBe(false);
    second.dom.window.close();
  });

  it("patches only the edited source range in a BOM CRLF document", () => {
    const raw = "\uFEFF#  标题 ##\r\n\r\n__粗体__ 与 [链接](./a  \"标题\")\r\n";
    const { runtime, session } = createRuntime(raw);
    let position = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "粗体") position = pos + 1;
    });
    expect(position).toBeGreaterThan(0);
    session.dispatch(session.state.tr.insertText("新", position));
    expect(runtime.getText()).toBe(
      "\uFEFF#  标题 ##\r\n\r\n__粗新体__ 与 [链接](./a  \"标题\")\r\n",
    );
    runtime.destroy();
  });

  it("applies or cancels a source draft and keeps one cross-mode history", () => {
    const raw = "# 标题\n\n正文\n";
    const { runtime } = createRuntime(raw);
    expect(runtime.enterSourceMode()).toBe(true);
    expect(runtime.mode).toBe("source");
    const source = document.querySelector<HTMLTextAreaElement>("textarea#editor");
    expect(source).not.toBeNull();
    source!.value = "# 标题\n\n源码修改\n";
    source!.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(runtime.status.draftDirty).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.cancelSourceDraft()).toBe(true);
    expect(runtime.mode).toBe("visual");
    expect(runtime.getText()).toBe(raw);

    expect(runtime.enterSourceMode()).toBe(true);
    const next = document.querySelector<HTMLTextAreaElement>("textarea#editor")!;
    next.value = "# 标题\n\n源码修改\n";
    next.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.mode).toBe("source");
    expect(runtime.getText()).toBe("# 标题\n\n源码修改\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("# 标题\n\n源码修改\n");
    runtime.destroy();
  });

  it("keeps the current raw dirty when an older saved snapshot is acknowledged", () => {
    const raw = "正文\n";
    const { runtime, session } = createRuntime(raw);
    session.dispatch(session.state.tr.insertText("一", 1));
    const persisted = runtime.getText();
    session.dispatch(session.state.tr.insertText("二", 2));
    runtime.markSaved(persisted);
    expect(runtime.getText()).toBe("一二正文\n");
    expect(runtime.status.dirty).toBe(true);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(persisted);
    expect(runtime.status.dirty).toBe(false);
    runtime.destroy();
  });

  it("extends an inherited strong mark at EOF without rejecting the edit", () => {
    const { runtime, session } = createRuntime("**粗体**");
    const end = session.state.doc.content.size - 1;
    session.dispatch(
      session.state.tr
        .setSelection(TextSelection.create(session.state.doc, end))
        .insertText("续"),
    );
    expect(runtime.getText()).toBe("**粗体续**");
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it("keeps plain-text paste on the source-authoritative history path", () => {
    const { runtime, session } = createRuntime("前后\n");
    session.dispatch(
      session.state.tr.setSelection(TextSelection.create(session.state.doc, 2)),
    );
    const paste = createPasteTransaction(session.state, {
      kind: "plain_text",
      text: "粘贴",
    });
    if (!paste) throw new Error("Expected paste transaction");
    expect(session.dispatch(paste) as unknown as boolean).toBe(true);
    expect(runtime.getText()).toBe("前粘贴后\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("前后\n");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("前粘贴后\n");
    runtime.destroy();
  });

  it("uses frozen byte literals for tasks, references, inline code and fence language", () => {
    const task = createRuntime("- [ ] 中文任务\r\n");
    let taskPosition = -1;
    task.session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.includes("[ ]")) taskPosition = pos + 1;
    });
    expect(task.session.dispatch(
      task.session.state.tr.insertText("x", taskPosition, taskPosition + 1),
    ) as unknown as boolean).toBe(true);
    expect(task.runtime.getText()).toBe("- [x] 中文任务\r\n");
    task.runtime.destroy();

    const reference = createRuntime("[同字][ref]\n\n[ref]: ./target \"标题\"\n");
    let referencePosition = -1;
    reference.session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "同字") referencePosition = pos + 1;
    });
    expect(reference.session.dispatch(
      reference.session.state.tr.insertText("新", referencePosition),
    ) as unknown as boolean).toBe(true);
    expect(reference.runtime.getText()).toBe(
      "[同新字][ref]\n\n[ref]: ./target \"标题\"\n",
    );
    reference.runtime.destroy();

    const code = createRuntime("正文含 `行内代码`。\n\n```python\nprint(1)\n```\n");
    let inlinePosition = -1;
    let fencePosition = -1;
    code.session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "行内代码") inlinePosition = pos + 1;
      if (node.type.name === "code_block") fencePosition = pos;
    });
    expect(code.session.dispatch(
      code.session.state.tr.insertText("`", inlinePosition),
    ) as unknown as boolean).toBe(true);
    expect(code.runtime.getText()).toContain("``行`内代码``");
    fencePosition = -1;
    code.session.state.doc.descendants((node, pos) => {
      if (node.type.name === "code_block") fencePosition = pos;
    });
    const codeNode = code.session.state.doc.nodeAt(fencePosition);
    if (!codeNode) throw new Error("Missing fenced code node");
    expect(code.session.dispatch(
      code.session.state.tr.setNodeMarkup(fencePosition, undefined, {
        ...codeNode.attrs,
        language: "swift",
      }),
    ) as unknown as boolean).toBe(true);
    expect(code.runtime.getText()).toBe(
      "正文含 ``行`内代码``。\n\n```swift\nprint(1)\n```\n",
    );
    code.runtime.destroy();
  });

  it("inherits mixed EOL locally and preserves the paragraph split history", () => {
    const mixed = createRuntime("第一行\r\n第二行\n第三行");
    let second = -1;
    mixed.session.state.doc.descendants((node, pos) => {
      const index = node.text?.indexOf("第二行") ?? -1;
      if (node.isText && index >= 0) second = pos + index + "第二行".length;
    });
    expect(mixed.session.dispatch(
      mixed.session.state.tr.insertText("\n新增", second),
    ) as unknown as boolean).toBe(true);
    expect(mixed.runtime.getText()).toBe("第一行\r\n第二行\n新增\n第三行");
    mixed.runtime.destroy();

    const split = createRuntime("第一段\r\n");
    const end = split.session.state.doc.content.size - 1;
    split.session.dispatch(
      split.session.state.tr.setSelection(TextSelection.create(split.session.state.doc, end)),
    );
    expect(splitBlock(
      split.session.state,
      (transaction) => split.session.dispatch(transaction),
    )).toBe(true);
    expect(split.runtime.getText()).toBe("第一段\r\n\r\n\r\n");
    split.session.dispatch(split.session.state.tr.insertText("新段"));
    expect(split.runtime.getText()).toBe("第一段\r\n\r\n新段\r\n");
    expect(split.runtime.undo()).toBe(true);
    expect(split.runtime.getText()).toBe("第一段\r\n\r\n\r\n");
    expect(split.runtime.undo()).toBe(true);
    expect(split.runtime.getText()).toBe("第一段\r\n");
    split.runtime.destroy();
  });

  it("keeps a local edit exact in a long document with adversarial delimiters", () => {
    const sections = Array.from({ length: 800 }, (_, index) => {
      const fence = "`".repeat(index % 6 + 1);
      const interior = "`".repeat(index % 6);
      return `## 章节 ${index}\n\n正文 ${index} ${fence}代码${interior}值${fence} **强调** [链接](./${index})\n`;
    });
    const raw = sections.join("\n");
    const { runtime, session } = createRuntime(raw);
    let position = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "章节 799") position = pos + node.nodeSize;
    });
    expect(position).toBeGreaterThan(0);
    expect(session.dispatch(
      session.state.tr.insertText("补", position),
    ) as unknown as boolean).toBe(true);
    const expected = raw.replace("## 章节 799\n", "## 章节 799补\n");
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });
});

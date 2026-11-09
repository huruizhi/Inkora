import { JSDOM } from "jsdom";
import { TextSelection } from "prosemirror-state";
import { splitBlock } from "prosemirror-commands";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";
import type { InkoraEditorSession } from "./editor-session";
import { createPasteTransaction } from "./editor-session";

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

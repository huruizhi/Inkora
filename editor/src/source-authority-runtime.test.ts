import { JSDOM } from "jsdom";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { splitBlock } from "prosemirror-commands";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEditorRuntime,
  type EditorRuntime,
  type EditorRuntimeOptions,
  type LinkEditBinding,
} from "./editor-runtime";
import type { InkoraEditorSession } from "./editor-session";
import { SourceAuthoritySession } from "./source-authority";
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

function createRuntime(raw: string, options: EditorRuntimeOptions = {}): {
  dom: JSDOM;
  runtime: EditorRuntime;
  session: InkoraEditorSession;
} {
  const dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector<HTMLElement>("#app")!;
  const runtime = createEditorRuntime(parent, raw, () => {}, options);
  const editor = parent.querySelector<HTMLElement>("#editor");
  if (!editor || editor instanceof dom.window.HTMLTextAreaElement) {
    throw new Error("Expected visual source-authoritative runtime");
  }
  const session = (runtime as unknown as { session: InkoraEditorSession }).session;
  return { dom, runtime, session };
}

describe("production source authority runtime", () => {
  it("rebuilds auditable projections after source, history, reopen, and image owner changes", () => {
    const original = '[one](./old) tail\r\n';
    const changed = '[one](./new) tail\r\n';
    const session = new SourceAuthoritySession(original);
    expect(session.saveEligible).toBe(true);
    expect(session.setRawSelection(2)).toBe(true);
    expect(session.linkOwnerAtSelection()?.href).toBe("./old");

    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft(changed)).toBe(true);
    expect(session.cancelSource()).toBe(true);
    expect(session.currentRaw).toBe(original);
    expect(session.linkOwnerAtSelection()?.href).toBe("./old");
    expect(session.stateReport()).toMatchObject({
      saveEligible: true,
      documentDirty: false,
      version: 0,
      undo: 0,
      redo: 0,
    });

    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft(changed)).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.currentRaw).toBe(changed);
    expect(session.linkOwnerAtSelection()?.href).toBe("./new");
    expect(session.saveEligible).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(original);
    expect(session.linkOwnerAtSelection()?.href).toBe("./old");
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(changed);
    expect(session.linkOwnerAtSelection()?.href).toBe("./new");

    expect(session.reopen(original, { anchor: 2, head: 2, affinity: "right" })).toBe(true);
    expect(session.linkOwnerAtSelection()?.href).toBe("./old");
    expect(session.stateReport()).toMatchObject({
      currentRaw: original,
      savedRaw: original,
      saveEligible: true,
      documentDirty: false,
      version: 0,
      undo: 0,
      redo: 0,
    });

    const graphemes = "a👩‍💻e\u0301z\n";
    expect(session.reopen(graphemes)).toBe(true);
    expect(session.setRawSelection(graphemes.indexOf("‍"))).toBe(false);
    expect(session.setRawSelection(graphemes.indexOf("e"))).toBe(true);
    expect(session.reopen("a\r\nb\n")).toBe(true);
    expect(session.setRawSelection(2)).toBe(false);
    expect(session.setRawSelection(3)).toBe(true);

    expect(session.reopen("tail\n", { anchor: 0, head: 0, affinity: "right" })).toBe(true);
    expect(session.insertImage({
      assetID: "asset-1",
      uri: "inkora-draft://asset/1",
      alt: "图",
      title: null,
    })).toBe(true);
    const draftImage = "![图](inkora-draft://asset/1)tail\n";
    expect(session.currentRaw).toBe(draftImage);
    expect(session.rewriteManagedImages([{
      assetID: "asset-1",
      from: "inkora-draft://asset/1",
      to: "doc.assets/final.png",
    }])).toBe(true);
    const finalImage = "![图](doc.assets/final.png)tail\n";
    expect(session.currentRaw).toBe(finalImage);
    expect(session.saveEligible).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(draftImage);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(finalImage);
    expect(session.stateReport()).toMatchObject({
      saveEligible: true,
      documentDirty: true,
      unresolvedIntent: null,
    });
  });

  it("types in the unchanged code caret after a language attribute change", () => {
    const { dom, runtime } = createRuntime("```python\nabc\n```\n");
    const view = (runtime as unknown as { view: EditorView }).view;
    const caret = view.state.selection.toJSON();
    const selector = dom.window.document.querySelector<HTMLSelectElement>(".inkora-code-language")!;
    selector.value = "javascript";
    selector.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(view.state.selection.toJSON()).toEqual(caret);
    expect(runtime.getText()).toBe("```javascript\nabc\n```\n");
    view.dispatch(view.state.tr.insertText("X"));
    expect(runtime.getText()).toBe("```javascript\nXabc\n```\n");
    expect(runtime.status.saveEligible).toBe(true);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("```javascript\nabc\n```\n");
    runtime.destroy();
  });
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
      assetID: "123e4567-e89b-12d3-a456-426614174000",
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

  it("retries a published first-save owner without undo or a phantom history step", () => {
    const assetID = "123e4567-e89b-12d3-a456-426614174000";
    const draft = `inkora-draft://asset/${assetID}`;
    const { runtime, session } = createRuntime("");
    const sourceSession = session as unknown as SourceAuthoritySession;
    expect(sourceSession.insertImage({ assetID, uri: draft, alt: "图", title: null })).toBe(true);
    expect(sourceSession.rewriteManagedImages([{
      assetID, from: draft, to: "Note.assets/a.png",
    }])).toBe(true);
    const afterFirst = sourceSession.stateReport();
    const revisionAfterFirst = sourceSession.status.revision;
    const historyAfterFirst = sourceSession.past.length;

    expect(sourceSession.rewriteManagedImages([{
      assetID, from: draft, to: "Note.assets/a.png",
    }])).toBe(true);
    expect(sourceSession.stateReport()).toMatchObject({
      currentRaw: afterFirst.currentRaw,
      version: afterFirst.version,
    });
    expect(sourceSession.status.revision).toBe(revisionAfterFirst);
    expect(sourceSession.past).toHaveLength(historyAfterFirst);
    expect(sourceSession.rewriteManagedImages([{
      assetID, from: draft, to: "Renamed.assets/a.png",
    }])).toBe(true);
    expect(runtime.getText()).toBe("![图](Renamed.assets/a.png)");
    expect(sourceSession.undo()).toBe(true);
    expect(runtime.getText()).toBe("![图](Note.assets/a.png)");
    runtime.destroy();
  });

  it("does not retarget a managed asset after source editing removed its real image owner", () => {
    const assetID = "123e4567-e89b-12d3-a456-426614174001";
    const draft = `inkora-draft://asset/${assetID}`;
    const { runtime, session } = createRuntime("");
    const sourceSession = session as unknown as SourceAuthoritySession;
    expect(sourceSession.insertImage({ assetID, uri: draft, alt: "图", title: null })).toBe(true);
    expect(sourceSession.rewriteManagedImages([{
      assetID, from: draft, to: "Note.assets/a.png",
    }])).toBe(true);
    expect(sourceSession.beginSource()).toBe(true);
    expect(sourceSession.updateDraft("[普通链接](Note.assets/a.png)")).toBe(true);
    expect(sourceSession.applySource()).toBe(true);
    const before = sourceSession.stateReport();

    expect(sourceSession.rewriteManagedImages([{
      assetID, from: draft, to: "Other.assets/a.png",
    }])).toBe(false);
    expect(sourceSession.stateReport()).toMatchObject({
      currentRaw: before.currentRaw,
      version: before.version,
    });
    expect(runtime.getText()).toBe("[普通链接](Note.assets/a.png)");
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
    expect(session.dispatch(session.state.tr.deleteSelection()),
      (session as unknown as SourceAuthoritySession).diagnostic).toBe(true);
    expect(runtime.getText()).toBe("**前** [](./target) *后*\r\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("**前** [](./target) *后*\r\n");
    runtime.destroy();
  });

  it("edits a linked image in a BOM CRLF table without touching its outer link", () => {
    const raw = '\uFEFF| [![旧](./pic.png)](./target) |\r\n| --- |\r\n| value |\r\n';
    const { runtime, session } = createRuntime(raw);
    let imagePosition = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePosition = pos;
    });
    expect(imagePosition).toBeGreaterThan(0);
    const image = session.state.doc.nodeAt(imagePosition)!;
    expect(session.dispatch(session.state.tr.setNodeMarkup(imagePosition, undefined, {
      ...image.attrs, alt: "新描述",
    })), (session as unknown as SourceAuthoritySession).diagnostic).toBe(true);
    const expected = '\uFEFF| [![新描述](./pic.png)](./target) |\r\n| --- |\r\n| value |\r\n';
    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
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
    })), (session as unknown as SourceAuthoritySession).diagnostic).toBe(true);
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

  function requestLinkAt(
    raw: string,
    selection: { anchor: number; head?: number },
  ): ReturnType<typeof createRuntime> & { binding: LinkEditBinding } {
    let binding: LinkEditBinding | undefined;
    const created = createRuntime(raw, { onLinkRequest: value => { binding = value; } });
    const view = (created.runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc,
      selection.anchor,
      selection.head ?? selection.anchor,
    )));
    const shortcut = new created.dom.window.KeyboardEvent("keydown", {
      key: "k", metaKey: true, bubbles: true, cancelable: true,
    });
    expect(view.dom.dispatchEvent(shortcut)).toBe(false);
    if (!binding) throw new Error("Expected a link edit binding");
    return { ...created, binding };
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

  it("edits only the source-ledger owner under a collapsed caret", () => {
    const first = requestLinkAt("[one](./same)[two](./same)\n", { anchor: 2 });
    expect(first.binding.attrs).toEqual({ href: "./same", title: null });
    expect(first.runtime.applyLinkEdit(first.binding, { href: "./first", title: null })).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(first.runtime.getText()).toBe("[one](./first)[two](./same)\n");
    expect(first.session.state.selection.anchor).toBe(2);
    expect(first.runtime.status).toMatchObject({ canUndo: true, canRedo: false });
    first.runtime.destroy();

    const secondBlock = requestLinkAt("[one](./same)\n\n[two](./same)\n", { anchor: 7 });
    expect(secondBlock.runtime.applyLinkEdit(secondBlock.binding, {
      href: "./second",
      title: null,
    })).toEqual({ ok: true, value: { changed: true } });
    expect(secondBlock.runtime.getText()).toBe("[one](./same)\n\n[two](./second)\n");
    secondBlock.runtime.destroy();

    const marked = requestLinkAt("[**one** two](./old)\n", { anchor: 2 });
    expect(marked.runtime.applyLinkEdit(marked.binding, { href: "./new", title: "标题" })).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(marked.runtime.getText()).toBe('[**one** two](./new "标题")\n');
    marked.runtime.destroy();

    const removed = requestLinkAt("[one](./same)[two](./same)\n", { anchor: 2 });
    expect(removed.runtime.applyLinkEdit(removed.binding, null)).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(removed.runtime.getText()).toBe("one[two](./same)\n");
    expect(removed.session.state.selection.anchor).toBe(2);
    expect(removed.runtime.undo()).toBe(true);
    expect(removed.runtime.getText()).toBe("[one](./same)[two](./same)\n");
    expect(removed.runtime.redo()).toBe(true);
    expect(removed.runtime.getText()).toBe("one[two](./same)\n");
    removed.runtime.destroy();
  });

  it("edits the existing link owner in a top-level table header", () => {
    const raw = "| [one](./old) |\n| --- |\n| two |\n";
    const created = requestLinkAt(raw, { anchor: 5 });
    expect(created.binding.target?.href).toBe("./old");
    expect(created.runtime.applyLinkEdit(created.binding, { href: "./new", title: null }))
      .toEqual({ ok: true, value: { changed: true } });
    const expected = "| [one](./new) |\n| --- |\n| two |\n";
    expect(created.runtime.getText()).toBe(expected);
    expect(created.runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(created.runtime.undo()).toBe(true);
    expect(created.runtime.getText()).toBe(raw);
    expect(created.runtime.redo()).toBe(true);
    expect(created.runtime.getText()).toBe(expected);
    created.runtime.destroy();
  });

  it("counts reference uses inside tables when editing an outside shared link", () => {
    const raw = "[outside][ref]\n\n| [inside][ref] |\n| --- |\n| value |\n\n[ref]: ./old\n";
    const created = requestLinkAt(raw, { anchor: 2 });
    expect(created.binding.target?.referenceUsageCount).toBe(2);
    expect(created.runtime.applyLinkEdit(created.binding, { href: "./new", title: null }))
      .toEqual({ ok: true, value: { changed: true } });
    const expected = "[outside](./new)\n\n| [inside][ref] |\n| --- |\n| value |\n\n[ref]: ./old\n";
    expect(created.runtime.getText()).toBe(expected);
    expect(created.runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(created.runtime.undo()).toBe(true);
    expect(created.runtime.getText()).toBe(raw);
    created.runtime.destroy();
  });

  it("isolates one indexed owner without changing neighboring links or history contracts", () => {
    const raw = '[zero](./same) [one](./same) [two][ref] [target][ref] [![nested](./img.png)](./outer)\r\n\r\n[ref]: ./shared "title"\r\n';
    const created = requestLinkAt(raw, { anchor: 20, head: 14 });
    const sourceSession = created.session as unknown as SourceAuthoritySession;
    expect(created.binding.target).toMatchObject({
      kind: "reference",
      href: "./shared",
      title: "title",
      referenceUsageCount: 2,
    });

    expect(created.runtime.applyLinkEdit(created.binding, { href: "./new", title: "新" }))
      .toEqual({ ok: true, value: { changed: true } });
    const expected = '[zero](./same) [one](./same) [two][ref] [target](./new "新") [![nested](./img.png)](./outer)\r\n\r\n[ref]: ./shared "title"\r\n';
    expect(created.runtime.getText()).toBe(expected);
    expect(created.runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect([created.session.state.selection.anchor, created.session.state.selection.head]).toEqual([20, 14]);
    expect(sourceSession.status).toMatchObject({ revision: 1, dirty: true, canUndo: true, canRedo: false });
    expect(created.runtime.status).toMatchObject({ saveEligible: true, unresolved: false });

    expect(created.runtime.undo()).toBe(true);
    expect(created.runtime.getText()).toBe(raw);
    expect(created.runtime.redo()).toBe(true);
    expect(created.runtime.getText()).toBe(expected);
    expect(created.runtime.status).toMatchObject({ dirty: true, saveEligible: true, canUndo: true, canRedo: false });
    created.runtime.destroy();
  });

  it("preserves backward selection and a unique reference link spelling", () => {
    const selected = requestLinkAt("[one](./old) tail\n", { anchor: 4, head: 1 });
    expect(selected.runtime.applyLinkEdit(selected.binding, { href: "./new", title: null })).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(selected.runtime.getText()).toBe("[one](./new) tail\n");
    expect([selected.session.state.selection.anchor, selected.session.state.selection.head]).toEqual([4, 1]);
    expect(selected.runtime.undo()).toBe(true);
    expect(selected.runtime.getText()).toBe("[one](./old) tail\n");
    expect(selected.runtime.redo()).toBe(true);
    expect(selected.runtime.getText()).toBe("[one](./new) tail\n");
    selected.runtime.destroy();

    const reference = requestLinkAt("[one][ref]\n\n[ref]: <./old> '旧标题'\n", { anchor: 2 });
    expect(reference.runtime.applyLinkEdit(reference.binding, { href: "./new", title: "新标题" })).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(reference.runtime.getText()).toBe("[one][ref]\n\n[ref]: <./new> '新标题'\n");
    reference.runtime.destroy();
  });

  it("preserves inline spacing and isolates one use of a shared reference", () => {
    const spaced = requestLinkAt("[one](  <./old>   '旧标题'  )\n", { anchor: 2 });
    expect(spaced.runtime.applyLinkEdit(spaced.binding, {
      href: "./new",
      title: "新标题",
    })).toEqual({ ok: true, value: { changed: true } });
    expect(spaced.runtime.getText()).toBe("[one](  <./new>   '新标题'  )\n");
    spaced.runtime.destroy();

    const shared = requestLinkAt(
      "[one][ref] [two][ref]\n\n[ref]: ./old \"旧标题\"\n",
      { anchor: 2 },
    );
    expect(shared.runtime.applyLinkEdit(shared.binding, {
      href: "./new",
      title: "新标题",
    })).toEqual({ ok: true, value: { changed: true } });
    expect(shared.runtime.getText()).toBe(
      '[one](./new "新标题") [two][ref]\n\n[ref]: ./old "旧标题"\n',
    );
    shared.runtime.destroy();
  });

  it("rolls back source and history when the accepted link cannot restore its owner", () => {
    const raw = "[one](./old) tail\n";
    const rejected = requestLinkAt(raw, { anchor: 2 });
    const selection = rejected.session.state.selection;
    const result = rejected.runtime.applyLinkEdit(rejected.binding, {
      href: "./new",
      title: "候选\n\n# 未闭合",
    });
    expect(result.ok).toBe(false);
    expect(rejected.runtime.getText()).toBe(raw);
    expect(rejected.session.state.selection.eq(selection)).toBe(true);
    expect(rejected.runtime.status).toMatchObject({
      dirty: false,
      canUndo: false,
      canRedo: false,
    });
    rejected.runtime.destroy();
  });

  it("removes an inline link through the real Mod-Shift-K keymap", () => {
    const { dom, runtime, session } = createRuntime("[正文](./target)\n");
    const view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    const editor = dom.window.document.querySelector<HTMLElement>("#editor")!;
    expect(editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "k", metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }))).toBe(false);
    expect(runtime.getText(), (session as unknown as { diagnostic?: string }).diagnostic).toBe("正文\n");
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("[正文](./target)\n");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("正文\n");
    runtime.destroy();
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

  it("converts only the active paragraph to a code block in a multi-block document", () => {
    const { dom, runtime, session } = createRuntime("one\n\ntwo\n");
    const view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    const editor = dom.window.document.querySelector<HTMLElement>("#editor")!;
    expect(editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "c",
      metaKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }))).toBe(false);
    expect(runtime.getText()).toBe("```\none\n```\n\ntwo\n");
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("one\n\ntwo\n");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("```\none\n```\n\ntwo\n");
    runtime.destroy();
  });

  it("keeps a requested code language when converting one block among siblings", () => {
    const { runtime, session } = createRuntime("one\n\ntwo\n");
    session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 2)));
    expect(execute(session, setCodeBlock("ts"))).toBe(true);
    expect(runtime.getText()).toBe("```ts\none\n```\n\ntwo\n");
    expect(runtime.status.unresolved).toBe(false);
    runtime.destroy();
  });

  it("preserves BOM, CRLF, neighbours, selection and missing final newline on conversion", () => {
    const raw = "\uFEFFone\r\n\r\ntwo";
    const { runtime, session } = createRuntime(raw);
    let two = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "two") two = pos + 1;
    });
    session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, two)));
    expect(execute(session, setCodeBlock("ts"))).toBe(true);
    expect(runtime.getText()).toBe("\uFEFFone\r\n\r\n```ts\r\ntwo\r\n```");
    session.dispatch(session.state.tr.insertText("X"));
    expect(runtime.getText()).toBe("\uFEFFone\r\n\r\n```ts\r\ntXwo\r\n```");
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("\uFEFFone\r\n\r\n```ts\r\ntwo\r\n```");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    runtime.destroy();
  });

  it("exits a fenced code block through the real Mod-Enter keymap", () => {
    const { dom, runtime, session } = createRuntime("```ts\none\n```\n\ntwo\n");
    let end = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "one") end = pos + node.nodeSize;
    });
    const view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    const editor = dom.window.document.querySelector<HTMLElement>("#editor")!;
    const event = new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(editor.dispatchEvent(event)).toBe(false);
    expect(runtime.getText()).toBe("```ts\none\n```\n\n\ntwo\n");
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("```ts\none\n```\n\ntwo\n");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("```ts\none\n```\n\n\ntwo\n");
    runtime.destroy();
  });

  it("exits a CRLF fenced block without changing BOM, fence or trailing neighbour", () => {
    const raw = "\uFEFF```ts\r\none\r\n```\r\n\r\ntwo";
    const { dom, runtime, session } = createRuntime(raw);
    let end = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "one") end = pos + node.nodeSize;
    });
    const view = (runtime as unknown as { view: EditorView }).view;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    const editor = dom.window.document.querySelector<HTMLElement>("#editor")!;
    expect(editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "Enter", metaKey: true, bubbles: true, cancelable: true,
    }))).toBe(false);
    expect(runtime.getText()).toBe("\uFEFF```ts\r\none\r\n```\r\n\r\n\r\ntwo");
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("\uFEFF```ts\r\none\r\n```\r\n\r\n\r\ntwo");
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
      if (node.type.name === "list_item" && node.attrs.task) {
        taskPosition = pos;
      }
    });
    const taskNode = task.session.state.doc.nodeAt(taskPosition);
    if (!taskNode) throw new Error("Missing task list item");
    expect(task.session.dispatch(
      task.session.state.tr.setNodeMarkup(taskPosition, undefined, {
        ...taskNode.attrs,
        checked: true,
        stateChar: "x",
      }).setMeta("inkoraTaskToggle", { pos: taskPosition, checked: true }),
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

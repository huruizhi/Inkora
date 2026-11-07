import { JSDOM } from "jsdom";
import { TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
  createPasteTransaction,
  InkoraEditorSession,
} from "./editor-session";
import { parseMarkdown } from "./markdown-codec";

function sessionFrom(markdown: string): InkoraEditorSession {
  return new InkoraEditorSession(parseMarkdown(markdown));
}

function moveCursorToEnd(session: InkoraEditorSession): void {
  const end = session.state.doc.content.size - 1;
  session.dispatch(
    session.state.tr.setSelection(TextSelection.create(session.state.doc, end)),
  );
}

describe("editor history and saved state", () => {
  it("returns to dirty=false when undo reaches the saved document", () => {
    const session = sessionFrom("saved");
    moveCursorToEnd(session);
    session.dispatch(session.state.tr.insertText(" edit"));

    expect(session.status).toMatchObject({
      dirty: true,
      canUndo: true,
      canRedo: false,
    });
    expect(session.undo()).toBe(true);
    expect(session.state.doc.textContent).toBe("saved");
    expect(session.status).toMatchObject({
      dirty: false,
      canUndo: false,
      canRedo: true,
    });
  });

  it("restores dirty and history state after redo", () => {
    const session = sessionFrom("saved");
    moveCursorToEnd(session);
    session.dispatch(session.state.tr.insertText(" edit"));
    session.undo();

    expect(session.redo()).toBe(true);
    expect(session.state.doc.textContent).toBe("saved edit");
    expect(session.status).toMatchObject({
      dirty: true,
      canUndo: true,
      canRedo: false,
    });
  });

  it("cuts history grouping at a newly saved document", () => {
    const session = sessionFrom("one");
    moveCursorToEnd(session);
    session.dispatch(session.state.tr.insertText(" two"));
    session.markSaved();
    session.dispatch(session.state.tr.insertText(" three"));

    expect(session.status.dirty).toBe(true);
    session.undo();
    expect(session.state.doc.textContent).toBe("one two");
    expect(session.status.dirty).toBe(false);
  });

  it("uses the persisted historical snapshot as the dirty baseline", () => {
    const session = sessionFrom("one");
    moveCursorToEnd(session);
    session.dispatch(session.state.tr.insertText(" two"));
    const persisted = session.state.doc;
    session.dispatch(session.state.tr.insertText(" three"));

    session.markSaved(persisted);

    expect(session.state.doc.textContent).toBe("one two three");
    expect(session.status.dirty).toBe(true);
    expect(session.status.revision).toBe(2);
  });

  it("does not mark selection-only transactions as document changes", () => {
    const session = sessionFrom("text");
    const changes: number[] = [];
    session.onStateChange((snapshot) => changes.push(snapshot.revision));

    moveCursorToEnd(session);

    expect(session.status.revision).toBe(0);
    expect(session.status.dirty).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe("IME composition", () => {
  it("publishes one logical change for a multi-transaction composition", () => {
    const session = sessionFrom("");
    const changes: string[] = [];
    session.onStateChange((snapshot) =>
      changes.push(snapshot.state.doc.textContent),
    );

    session.beginComposition();
    session.dispatch(session.state.tr.insertText("n"));
    session.dispatch(session.state.tr.insertText("i"));
    session.dispatch(session.state.tr.insertText("你", 1, 3));
    expect(changes).toEqual([]);
    expect(session.status.composing).toBe(true);

    session.endComposition();
    session.endComposition();
    expect(changes).toEqual(["你"]);
    expect(session.status).toMatchObject({ revision: 1, dirty: true, composing: false });
  });

  it("undoes one completed composition as one history event", () => {
    const session = sessionFrom("");
    session.beginComposition();
    session.dispatch(session.state.tr.insertText("z"));
    session.dispatch(session.state.tr.insertText("中", 1, 2));
    session.endComposition();

    expect(session.undo()).toBe(true);
    expect(session.state.doc.textContent).toBe("");
    expect(session.status.dirty).toBe(false);
  });
});

describe("paste semantics", () => {
  it("does not create a transaction for empty clipboard data", () => {
    const session = sessionFrom("keep");

    expect(
      createPasteTransaction(session.state, { kind: "plain_text", text: "" }),
    ).toBeNull();
    expect(session.state.doc.textContent).toBe("keep");
  });

  it("turns plain-text lines into legal paragraphs", () => {
    const session = sessionFrom("");
    const transaction = createPasteTransaction(session.state, {
      kind: "plain_text",
      text: "第一行\r\nsecond\n\nlast",
    });
    expect(transaction).not.toBeNull();
    session.dispatch(transaction!);

    expect(session.state.doc.toJSON()).toMatchObject({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "第一行" }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "last" }] },
      ],
    });
    expect(() => session.state.doc.check()).not.toThrow();
  });

  it("parses explicit Markdown clipboard data through the codec", () => {
    const session = sessionFrom("");
    const transaction = createPasteTransaction(session.state, {
      kind: "markdown",
      text: "- **one**\n- two",
    });
    session.dispatch(transaction!);

    expect(session.state.doc.child(0).type.name).toBe("bullet_list");
    expect(session.state.doc.child(0).childCount).toBe(2);
    expect(
      session.state.doc.child(0).child(0).child(0).child(0).marks[0]?.type.name,
    ).toBe("strong");
    expect(() => session.state.doc.check()).not.toThrow();
  });

  it("sanitizes rich HTML into schema-supported nodes and marks", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const session = sessionFrom("");
    const transaction = createPasteTransaction(session.state, {
      kind: "rich_html",
      html: "<h2>Title</h2><p><strong>bold</strong><span data-x='1'> safe</span></p><script>bad()</script>",
      document: dom.window.document,
    });
    session.dispatch(transaction!);

    expect(session.state.doc.child(0).type.name).toBe("heading");
    expect(session.state.doc.child(0).attrs.level).toBe(2);
    expect(session.state.doc.child(1).textContent).toBe("bold safe");
    expect(session.state.doc.child(1).child(0).marks[0]?.type.name).toBe("strong");
    expect(session.state.doc.textContent).not.toContain("bad");
    expect(() => session.state.doc.check()).not.toThrow();
  });
});

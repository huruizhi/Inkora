import { JSDOM } from "jsdom";
import { DOMParser as ProseMirrorDOMParser, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection, type Command, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import {
  blockKeyBindings,
  createBlockInputRules,
  insertHorizontalRule,
  liftBlock,
  setCodeBlock,
  setHeading,
  setParagraph,
  wrapBlockquote,
  wrapBulletList,
  wrapOrderedList,
} from "./block-editing";
import { undoInputRule } from "./inline-formatting";
import { documentFromJSON, inkoraSchema } from "./schema";

function paragraph(text = "") {
  return inkoraSchema.node("paragraph", null, text ? [inkoraSchema.text(text)] : []);
}

function documentWith(...children: ProseMirrorNode[]) {
  return inkoraSchema.node("doc", null, children);
}

function cursorInText(document: ProseMirrorNode, text: string, offset = 0): TextSelection {
  let position: number | undefined;
  document.descendants((node, nodePosition) => {
    if (position === undefined && node.isText && node.text === text) {
      position = nodePosition + offset;
    }
  });
  if (position === undefined) throw new Error(`Missing text: ${text}`);
  return TextSelection.create(document, position);
}

function applyCommand(state: EditorState, command: Command): EditorState {
  let nextState: EditorState | undefined;
  expect(
    command(state, (transaction) => {
      nextState = state.apply(transaction);
    }),
  ).toBe(true);
  expect(nextState).toBeDefined();
  return nextState!;
}

describe("block schema", () => {
  it("accepts nested lists, blockquotes, and unmarked code", () => {
    const nested = inkoraSchema.node("bullet_list", null, [
      inkoraSchema.node("list_item", null, [
        paragraph("parent"),
        inkoraSchema.node("ordered_list", { order: 3 }, [
          inkoraSchema.node("list_item", null, [paragraph("child")]),
        ]),
      ]),
    ]);
    const document = documentWith(
      inkoraSchema.node("blockquote", null, [paragraph("quote")]),
      nested,
      inkoraSchema.node("code_block", { language: "swift" }, [
        inkoraSchema.text("let value = 1"),
      ]),
      inkoraSchema.node("horizontal_rule"),
    );

    expect(() => document.check()).not.toThrow();
    expect(document.child(1).child(0).child(1).attrs.order).toBe(3);
    expect(document.child(2).child(0).marks).toHaveLength(0);
  });

  it("rejects malformed list structure and invalid ordered starts", () => {
    expect(() =>
      documentFromJSON({
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toThrow(/Invalid content/);
    expect(() =>
      documentFromJSON({
        type: "doc",
        content: [
          {
            type: "ordered_list",
            attrs: { order: 0 },
            content: [
              { type: "list_item", content: [{ type: "paragraph" }] },
            ],
          },
        ],
      }),
    ).toThrow(/positive integer/);
  });
});

describe("block commands and keys", () => {
  it("converts paragraphs and all heading levels", () => {
    let document = documentWith(paragraph("Title"));
    let state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "Title", 2),
    });

    for (const level of [1, 2, 3, 4, 5, 6]) {
      state = applyCommand(state, setHeading(level));
      expect(state.doc.child(0).type.name).toBe("heading");
      expect(state.doc.child(0).attrs.level).toBe(level);
    }
    state = applyCommand(state, setParagraph);
    expect(state.doc.child(0).type.name).toBe("paragraph");
  });

  it("wraps and exits a blockquote", () => {
    const document = documentWith(paragraph("quote"));
    let state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "quote", 2),
    });

    state = applyCommand(state, wrapBlockquote);
    expect(state.doc.child(0).type.name).toBe("blockquote");
    state = applyCommand(state, liftBlock);
    expect(state.doc.child(0).type.name).toBe("paragraph");
  });

  it("wraps ordered and bullet lists", () => {
    const document = documentWith(paragraph("one"), paragraph("two"));
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 1, 9),
    });

    const bullets = applyCommand(state, wrapBulletList);
    expect(bullets.doc.child(0).type.name).toBe("bullet_list");
    expect(bullets.doc.child(0).childCount).toBe(2);

    const ordered = applyCommand(state, wrapOrderedList);
    expect(ordered.doc.child(0).type.name).toBe("ordered_list");
    expect(ordered.doc.child(0).attrs.order).toBe(1);
  });

  it("indents and outdents list items with Tab and Shift-Tab", () => {
    const list = inkoraSchema.node("bullet_list", null, [
      inkoraSchema.node("list_item", null, [paragraph("one")]),
      inkoraSchema.node("list_item", null, [paragraph("two")]),
    ]);
    const document = documentWith(list);
    let state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "two", 1),
    });

    state = applyCommand(state, blockKeyBindings.Tab);
    expect(state.doc.child(0).childCount).toBe(1);
    expect(state.doc.child(0).child(0).child(1).type.name).toBe("bullet_list");

    state = applyCommand(state, blockKeyBindings["Shift-Tab"]);
    expect(state.doc.child(0).childCount).toBe(2);
  });

  it("continues a list on Enter and exits from an empty item", () => {
    const list = inkoraSchema.node("bullet_list", null, [
      inkoraSchema.node("list_item", null, [paragraph("one")]),
    ]);
    const document = documentWith(list);
    let state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "one", 3),
    });

    state = applyCommand(state, blockKeyBindings.Enter);
    expect(state.doc.child(0).childCount).toBe(2);
    state = applyCommand(state, blockKeyBindings.Enter);
    expect(state.doc.child(0).type.name).toBe("bullet_list");
    expect(state.doc.child(1).type.name).toBe("paragraph");
  });

  it("handles code newline, Tab, and explicit exit", () => {
    const document = documentWith(paragraph("code"));
    let state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "code", 4),
    });

    state = applyCommand(state, setCodeBlock("swift"));
    expect(state.doc.child(0).attrs.language).toBe("swift");
    state = applyCommand(state, blockKeyBindings.Enter);
    state = applyCommand(state, blockKeyBindings.Tab);
    expect(state.doc.child(0).textContent).toBe("code\n\t");

    state = applyCommand(state, blockKeyBindings["Mod-Enter"]);
    expect(state.doc.child(1).type.name).toBe("paragraph");
  });

  it("joins adjacent paragraphs on Backspace at the second start", () => {
    const document = documentWith(paragraph("one"), paragraph("two"));
    const state = EditorState.create({
      doc: document,
      selection: cursorInText(document, "two"),
    });

    const joined = applyCommand(state, blockKeyBindings.Backspace);
    expect(joined.doc.childCount).toBe(1);
    expect(joined.doc.textContent).toBe("onetwo");
  });

  it("inserts a horizontal rule at an empty paragraph", () => {
    const document = documentWith(paragraph());
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 1),
    });

    const inserted = applyCommand(state, insertHorizontalRule);
    expect(inserted.doc.child(0).type.name).toBe("horizontal_rule");
  });
});

function runFinalTextInput(source: string) {
  const plugin = createBlockInputRules();
  const existing = source.slice(0, -1);
  const document = documentWith(paragraph(existing));
  let state = EditorState.create({
    doc: document,
    selection: TextSelection.create(document, existing.length + 1),
    plugins: [plugin],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
    },
  } as unknown as EditorView;
  const handler = plugin.props.handleTextInput;
  if (!handler) throw new Error("Block input rules plugin has no text handler");
  const position = state.selection.from;
  const handled =
    handler.call(
      plugin,
      view,
      position,
      position,
      source.slice(-1),
      () => state.tr.insertText(source.slice(-1), position),
    ) === true;
  return { state, handled };
}

describe("block input rules", () => {
  it.each([
    ["### ", "heading", { level: 3 }],
    ["> ", "blockquote", {}],
    ["4. ", "ordered_list", { order: 4 }],
    ["- ", "bullet_list", {}],
    ["```swift ", "code_block", { language: "swift" }],
    ["---", "horizontal_rule", {}],
  ])("converts %s to a %s block", (source, nodeName, attrs) => {
    const result = runFinalTextInput(source);
    expect(result.handled).toBe(true);
    expect(result.state.doc.child(0).type.name).toBe(nodeName);
    expect(result.state.doc.child(0).attrs).toMatchObject(attrs);
  });

  it("undoes a block input rule back to its source text", () => {
    let { state } = runFinalTextInput("### ");
    expect(state.doc.child(0).type.name).toBe("heading");

    let undone: EditorState | undefined;
    expect(
      undoInputRule(state, (transaction) => {
        undone = state.apply(transaction);
      }),
    ).toBe(true);
    state = undone!;
    expect(state.doc.child(0).type.name).toBe("paragraph");
    expect(state.doc.textContent).toBe("### ");
  });
});

describe("block rich-text paste semantics", () => {
  it("parses lists, quotes, code, and rules into legal nodes", () => {
    const dom = new JSDOM(
      "<body><blockquote><p>quote</p></blockquote><ol start='3'><li><p>item</p></li></ol><pre><code data-language='swift'>let x = 1</code></pre><hr></body>",
    );
    const parsed = ProseMirrorDOMParser.fromSchema(inkoraSchema).parse(
      dom.window.document.body,
    );

    expect(parsed.child(0).type.name).toBe("blockquote");
    expect(parsed.child(1).type.name).toBe("ordered_list");
    expect(parsed.child(1).attrs.order).toBe(3);
    expect(parsed.child(2).type.name).toBe("code_block");
    expect(parsed.child(2).attrs.language).toBe("swift");
    expect(parsed.child(3).type.name).toBe("horizontal_rule");
    expect(() => parsed.check()).not.toThrow();
  });
});

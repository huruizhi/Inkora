import { JSDOM } from "jsdom";
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import {
  createInlineInputRules,
  inlineKeyBindings,
  isMarkActive,
  setLink,
  toggleCode,
  toggleEm,
  toggleStrong,
  undoInputRule,
  unsetLink,
} from "./inline-formatting";
import { documentFromJSON, inkoraSchema } from "./schema";

function paragraph(text: string) {
  return inkoraSchema.node("paragraph", null, text ? [inkoraSchema.text(text)] : []);
}

function documentWith(...paragraphs: string[]) {
  return inkoraSchema.node("doc", null, paragraphs.map(paragraph));
}

function applyCommand(state: EditorState, command: (typeof toggleStrong)): EditorState {
  let nextState: EditorState | undefined;
  expect(
    command(state, (transaction: Transaction) => {
      nextState = state.apply(transaction);
    }),
  ).toBe(true);
  expect(nextState).toBeDefined();
  return nextState!;
}

function markedText(state: EditorState, paragraphIndex = 0) {
  return state.doc.child(paragraphIndex).child(0);
}

describe("inline formatting commands", () => {
  it("toggles a mark across textblock boundaries", () => {
    const document = documentWith("one", "two");
    const selection = TextSelection.create(document, 1, 9);
    const state = EditorState.create({ doc: document, selection });

    const marked = applyCommand(state, toggleStrong);
    expect(markedText(marked, 0).marks.map((mark) => mark.type.name)).toEqual([
      "strong",
    ]);
    expect(markedText(marked, 1).marks.map((mark) => mark.type.name)).toEqual([
      "strong",
    ]);

    const unmarked = applyCommand(marked, toggleStrong);
    expect(markedText(unmarked, 0).marks).toHaveLength(0);
    expect(markedText(unmarked, 1).marks).toHaveLength(0);
  });

  it("uses stored marks for an empty selection", () => {
    const document = documentWith("text");
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 2),
    });

    const marked = applyCommand(state, toggleEm);
    expect(marked.storedMarks?.map((mark) => mark.type.name)).toEqual(["em"]);
    expect(isMarkActive(marked, inkoraSchema.marks.em)).toBe(true);
  });

  it("makes inline code exclusive with other marks", () => {
    const document = documentWith("code");
    const selected = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 1, 5),
    });

    const strong = applyCommand(selected, toggleStrong);
    const code = applyCommand(strong, toggleCode);
    expect(markedText(code).marks.map((mark) => mark.type.name)).toEqual(["code"]);
  });

  it("sets, replaces, and removes link attributes on a selection", () => {
    const document = documentWith("Inkora");
    const selected = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 1, 7),
    });

    const linked = applyCommand(
      selected,
      setLink({ href: "./readme.md", title: "Read me" }),
    );
    expect(markedText(linked).marks[0]?.attrs).toEqual({
      href: "./readme.md",
      title: "Read me",
    });

    const replaced = applyCommand(linked, setLink({ href: "#inkora" }));
    expect(markedText(replaced).marks[0]?.attrs).toEqual({
      href: "#inkora",
      title: null,
    });

    const unlinked = applyCommand(replaced, unsetLink);
    expect(markedText(unlinked).marks).toHaveLength(0);
  });

  it("stores a link at a cursor without rewriting existing text", () => {
    const document = documentWith("Inkora");
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 3),
    });

    const linked = applyCommand(state, setLink({ href: "https://example.test" }));
    expect(linked.doc.eq(document)).toBe(true);
    expect(linked.storedMarks?.[0]?.attrs.href).toBe("https://example.test");

    const cleared = applyCommand(linked, unsetLink);
    expect(cleared.storedMarks).toEqual([]);
  });

  it("exposes macOS-friendly shortcuts and injects link acquisition", () => {
    const document = documentWith("Inkora");
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 1, 7),
    });
    const keys = inlineKeyBindings(() => ({ href: "./linked.md" }));

    expect(Object.keys(keys)).toEqual([
      "Mod-b",
      "Mod-i",
      "Mod-Shift-x",
      "Mod-e",
      "Mod-k",
      "Mod-Shift-k",
      "Backspace",
    ]);
    const linked = applyCommand(state, keys["Mod-k"]);
    expect(markedText(linked).marks[0]?.attrs.href).toBe("./linked.md");
  });
});

interface InputResult {
  state: EditorState;
  handled: boolean;
}

function runFinalTextInput(source: string, composing = false): InputResult {
  const plugin = createInlineInputRules();
  const existing = source.slice(0, -1);
  const document = documentWith(existing);
  let state = EditorState.create({
    doc: document,
    selection: TextSelection.create(document, existing.length + 1),
    plugins: [plugin],
  });
  const view = {
    get state() {
      return state;
    },
    composing,
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
    },
  } as unknown as EditorView;
  const handler = plugin.props.handleTextInput;
  if (!handler) throw new Error("Input rules plugin has no text handler");
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

describe("inline input rules", () => {
  it.each([
    ["**粗体**", "粗体", "strong", undefined],
    ["_italic_", "italic", "em", undefined],
    ["~~deleted~~", "deleted", "strike", undefined],
    ["`code`", "code", "code", undefined],
    [
      "[Inkora](./note.md \"Note\")",
      "Inkora",
      "link",
      { href: "./note.md", title: "Note" },
    ],
  ])("converts %s into semantic marked text", (source, text, markName, attrs) => {
    const result = runFinalTextInput(source);
    expect(result.handled).toBe(true);
    expect(result.state.doc.textContent).toBe(text);
    expect(markedText(result.state).marks[0]?.type.name).toBe(markName);
    if (attrs) expect(markedText(result.state).marks[0]?.attrs).toEqual(attrs);
  });

  it("does not fire during IME composition", () => {
    const result = runFinalTextInput("**组合**", true);
    expect(result.handled).toBe(false);
    expect(result.state.doc.textContent).toBe("**组合*");
  });

  it("undoes only the most recent input-rule transformation", () => {
    let { state } = runFinalTextInput("**bold**");
    expect(state.doc.textContent).toBe("bold");

    let undone: EditorState | undefined;
    expect(
      undoInputRule(state, (transaction) => {
        undone = state.apply(transaction);
      }),
    ).toBe(true);
    state = undone!;
    expect(state.doc.textContent).toBe("**bold**");
    expect(markedText(state).marks).toHaveLength(0);
  });
});

describe("inline rich-text paste semantics", () => {
  it("parses supported HTML tags into schema marks", () => {
    const dom = new JSDOM(
      "<body><p><strong>bold</strong> <i>italic</i> <del>gone</del> <code>code</code> <a href='./note.md' title='Note'>link</a></p></body>",
    );
    const parsed = ProseMirrorDOMParser.fromSchema(inkoraSchema).parse(
      dom.window.document.body,
    );

    const marks: string[] = [];
    parsed.descendants((node) => {
      if (node.isText) marks.push(...node.marks.map((mark) => mark.type.name));
    });
    expect(marks).toEqual(["strong", "em", "strike", "code", "link"]);
    expect(parsed.textContent).toBe("bold italic gone code link");
    expect(() => parsed.check()).not.toThrow();
  });

  it("keeps unsupported inline HTML content as unmarked text", () => {
    const dom = new JSDOM("<body><p><span data-plugin='x'>safe</span></p></body>");
    const parsed = ProseMirrorDOMParser.fromSchema(inkoraSchema).parse(
      dom.window.document.body,
    );

    expect(parsed.textContent).toBe("safe");
    expect(parsed.child(0).child(0).marks).toHaveLength(0);
  });

  it("rejects invalid link attributes when loading JSON", () => {
    expect(() =>
      documentFromJSON({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bad",
                marks: [{ type: "link", attrs: { href: 42, title: null } }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/Link href/);
  });

  it("round-trips a CommonMark empty destination through document JSON", () => {
    const link = inkoraSchema.marks.link.create({ href: "", title: null });
    const original = inkoraSchema.node("doc", null, [
      inkoraSchema.node("paragraph", null, [inkoraSchema.text("empty", [link])]),
    ]);
    expect(documentFromJSON(original.toJSON()).eq(original)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";
import { splitBlock } from "prosemirror-commands";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, test } from "vitest";

import { parseMarkdown } from "../../src/markdown-codec";

const fixturePath = fileURLToPath(
  new URL("./cases/11-mixed-eol-insert/input.md", import.meta.url),
);
const input = readFileSync(fixturePath, "utf8");
const markdown = new MarkdownIt("commonmark");

type Evidence = {
  label: string;
  document: unknown;
  selection: { anchor: number; head: number };
};

function cursorAfter(document: ProseMirrorNode, text: string): TextSelection {
  let position: number | undefined;
  document.descendants((node, offset) => {
    if (position !== undefined || !node.isText) return;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) position = offset + index + text.length;
  });
  if (position === undefined) throw new Error(`找不到内容锚点：${text}`);
  return TextSelection.create(document, position);
}

function createState(source: string, anchor: string): EditorState {
  const document = parseMarkdown(source);
  return EditorState.create({
    doc: document,
    selection: cursorAfter(document, anchor),
  });
}

function enter(state: EditorState): EditorState {
  let next: EditorState | undefined;
  const handled = splitBlock(state, (transaction) => {
    next = state.apply(transaction);
  });
  if (!handled || !next) throw new Error("splitBlock 未执行");
  return next;
}

function type(state: EditorState, text: string): EditorState {
  return state.apply(state.tr.insertText(text));
}

function deleteForwardCharacter(state: EditorState, expected: string): EditorState {
  const { from } = state.selection;
  expect(state.doc.textBetween(from, from + 1, "\n")).toBe(expected);
  return state.apply(state.tr.delete(from, from + 1));
}

function replaceOnce(source: string, find: string, replacement: string): string {
  expect(source.split(find)).toHaveLength(2);
  return source.replace(find, replacement);
}

function topLevelParagraphs(source: string): number {
  return markdown.parse(source, {}).filter(
    (token) => token.type === "paragraph_open" && token.level === 0,
  ).length;
}

function eolRanges(source: string) {
  const bytes = Buffer.from(source);
  const ranges: Array<{ start: number; end: number; style: "LF" | "CRLF" }> = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    const crlf = index > 0 && bytes[index - 1] === 0x0d;
    ranges.push({
      start: crlf ? index - 1 : index,
      end: index + 1,
      style: crlf ? "CRLF" : "LF",
    });
  }
  return ranges;
}

function evidence(label: string, state: EditorState): Evidence {
  return {
    label,
    document: state.doc.toJSON(),
    selection: {
      anchor: state.selection.anchor,
      head: state.selection.head,
    },
  };
}

describe("INK-PROT-016 case 11 visual action semantics", () => {
  test("one Enter plus typing keeps the original softbreak in the second paragraph", () => {
    let state = createState(input, "第二行使用 CRLF 结尾。");
    state = enter(state);
    state = type(state, "插入为独立段落。");

    const source = replaceOnce(
      input,
      "第二行使用 CRLF 结尾。\r\n第三行回到 LF。",
      "第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n第三行回到 LF。",
    );

    expect(state.doc.child(0).textContent).toBe(
      "混合换行文档第一行 LF 结尾。\n第二行使用 CRLF 结尾。",
    );
    expect(state.doc.child(1).textContent).toBe(
      "插入为独立段落。\n第三行回到 LF。",
    );
    expect(state.doc.childCount).toBe(4);
    expect(parseMarkdown(source).toJSON()).toEqual(state.doc.toJSON());
    expect(topLevelParagraphs(source)).toBe(3);

    console.log(JSON.stringify({
      command: evidence("single-enter-step-1", state),
      commonmarkTopLevelParagraphs: topLevelParagraphs(source),
      eolRanges: eolRanges(source),
    }, null, 2));
  });

  test("two Enters plus one forward deletion reach the frozen three-paragraph target", () => {
    let state = createState(input, "第二行使用 CRLF 结尾。");
    state = enter(state);
    state = type(state, "插入为独立段落。");
    state = enter(state);
    state = deleteForwardCharacter(state, "\n");

    const source = replaceOnce(
      input,
      "第二行使用 CRLF 结尾。\r\n第三行回到 LF。",
      "第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n\r\n第三行回到 LF。",
    );

    expect(state.doc.child(0).textContent).toContain("第二行使用 CRLF 结尾。");
    expect(state.doc.child(1).textContent).toBe("插入为独立段落。");
    expect(state.doc.child(2).textContent).toBe("第三行回到 LF。");
    expect(state.doc.childCount).toBe(5);
    expect(parseMarkdown(source).toJSON()).toEqual(state.doc.toJSON());
    expect(topLevelParagraphs(source)).toBe(4);

    console.log(JSON.stringify({
      command: evidence("visual-split-compound-step-1", state),
      commonmarkTopLevelParagraphs: topLevelParagraphs(source),
      originalEolRanges: eolRanges(input),
      derivedEolRanges: eolRanges(source),
    }, null, 2));
  });

  test("tail step is independently reproducible after either first-step variant", () => {
    const firstStepSources = [
      {
        label: "single-enter-step-2",
        source: replaceOnce(
        input,
        "第二行使用 CRLF 结尾。\r\n第三行回到 LF。",
        "第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n第三行回到 LF。",
        ),
      },
      {
        label: "visual-split-compound-step-2",
        source: replaceOnce(
        input,
        "第二行使用 CRLF 结尾。\r\n第三行回到 LF。",
        "第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n\r\n第三行回到 LF。",
        ),
      },
    ];

    for (const { label, source: firstStepSource } of firstStepSources) {
      let state = createState(firstStepSource, "尾段 LF 结尾。");
      state = enter(state);
      state = type(state, "新尾段 LF。");
      const source = replaceOnce(
        firstStepSource,
        "尾段 LF 结尾。\n",
        "尾段 LF 结尾。\n\n新尾段 LF。\n",
      );
      expect(parseMarkdown(source).toJSON()).toEqual(state.doc.toJSON());
      expect(state.doc.lastChild?.textContent).toBe("新尾段 LF。");
      console.log(JSON.stringify({
        command: evidence(label, state),
        commonmarkTopLevelParagraphs: topLevelParagraphs(source),
        eolRanges: eolRanges(source),
      }, null, 2));
    }
  });
});

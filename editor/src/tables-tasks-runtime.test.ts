import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";
import { createPasteTransaction } from "./editor-session";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function fixture(id: string, name: "input" | "expected"): string {
  return readFileSync(
    new URL(`../../docs/acceptance/tables-tasks/cases/${id}/${name}.md`, import.meta.url),
    "utf8",
  );
}

function runtimeFor(raw: string): {
  dom: JSDOM;
  parent: HTMLElement;
  runtime: EditorRuntime;
  view: EditorView;
} {
  const dom = new JSDOM("<!doctype html><main id='app'></main>");
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector<HTMLElement>("#app")!;
  const runtime = createEditorRuntime(parent, raw, () => {});
  const view = (runtime as unknown as { view?: EditorView }).view;
  if (!view) throw new Error("Expected production EditorView");
  return { dom, parent, runtime, view };
}

function textPositionIn(
  view: EditorView,
  type: string,
  predicate: (node: ProseMirrorNode) => boolean,
): number {
  let result = -1;
  view.state.doc.descendants((node, pos) => {
    if (result < 0 && node.type.name === type && predicate(node)) result = pos + 1;
  });
  if (result < 0) throw new Error(`Missing ${type}`);
  return result;
}

function clickTableCommand(dom: JSDOM, parent: HTMLElement, command: string): void {
  const button = parent.querySelector<HTMLButtonElement>(`[data-table-command="${command}"]`);
  if (!button) throw new Error(`Missing table command ${command}`);
  if (button.getAttribute("role") === "menuitem") {
    parent.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")!.click();
  }
  button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("tables and tasks production runtime", () => {
  it.each([
    {
      name: "LF after header",
      command: "add_row_after",
      raw: "| Header |\n| --- |\n| first |\n| second |\n",
      expected: "| Header |\n| --- |\n|  |\n| first |\n| second |\n",
      rows: ["", "first", "second"],
    },
    {
      name: "BOM CRLF before header",
      command: "add_row_before",
      raw: "\uFEFF| Header |\r\n| --- |\r\n| first |\r\n| second |",
      expected: "\uFEFF| Header |\r\n| --- |\r\n|  |\r\n| first |\r\n| second |",
      rows: ["", "first", "second"],
    },
    {
      name: "header-only without trailing newline",
      command: "add_row_after",
      raw: "| Header |\n| --- |",
      expected: "| Header |\n| --- |\n|  |",
      rows: [""],
    },
  ])("inserts a data row adjacent to the selected header: $name", ({ raw, expected, rows, command }) => {
    const { dom, parent, runtime, view } = runtimeFor(raw);
    const selected = textPositionIn(view, "table_header", (node) => node.textContent === "Header");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected)));

    clickTableCommand(dom, parent, command);

    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(Array.from(parent.querySelectorAll("tbody tr"), (row) => row.textContent)).toEqual(rows);
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true, saveEligible: true });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });

  it("edits a CRLF table cell through the real EditorView and preserves source history", () => {
    const input = fixture("01-cell-crlf", "input");
    const expected = fixture("01-cell-crlf", "expected");
    const { parent, runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "旧值");

    view.dispatch(view.state.tr.insertText("新值", from, from + "旧值".length));

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("table tr")).toHaveLength(2);
    expect(parent.querySelectorAll("td")[1]?.textContent).toBe("新值");
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true, saveEligible: true });
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();

    const reopened = runtimeFor(expected);
    expect(reopened.parent.querySelectorAll("td")[1]?.textContent).toBe("新值");
    expect(reopened.runtime.getText()).toBe(expected);
    reopened.runtime.destroy();
  });

  it("escapes a visible pipe only inside the edited table cell", () => {
    const input = fixture("02-cell-pipe", "input");
    const expected = fixture("02-cell-pipe", "expected");
    const { parent, runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "占位");

    view.dispatch(view.state.tr.insertText("A|B", from, from + "占位".length));

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("td")[1]?.textContent).toBe("A|B");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("adds an empty row through the production table toolbar as one undo unit", () => {
    const input = fixture("03-add-row", "input");
    const expected = fixture("03-add-row", "expected");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected + "ready".length)));

    clickTableCommand(dom, parent, "add_row_after");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true, saveEligible: true });
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });

  it("adds a column without reformatting existing table bytes", () => {
    const input = fixture("04-add-column", "input");
    const expected = fixture("04-add-column", "expected");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "好");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected + 1)));

    clickTableCommand(dom, parent, "add_column_after");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("thead th")).toHaveLength(3);
    expect(parent.querySelectorAll("tbody td")).toHaveLength(3);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("deletes one column while preserving the remaining marks and alignment", () => {
    const input = fixture("05-delete-column", "input");
    const expected = fixture("05-delete-column", "expected");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected)));

    clickTableCommand(dom, parent, "delete_column");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("thead th")).toHaveLength(1);
    expect(parent.querySelector("tbody td strong")?.textContent).toBe("api");
    expect(parent.querySelector<HTMLButtonElement>('[data-table-command="delete_column"]')?.disabled).toBe(true);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("changes alignment by editing only the delimiter cell", () => {
    const input = fixture("06-align", "input");
    const expected = fixture("06-align", "expected");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "api");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected)));

    clickTableCommand(dom, parent, "align_center");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelector("thead th")?.getAttribute("style")).toContain("center");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("preserves a hidden extra source cell when editing a visible cell", () => {
    const input = fixture("07-hidden-extra-cell", "input");
    const expected = fixture("07-hidden-extra-cell", "expected");
    const { runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "api");

    view.dispatch(view.state.tr.insertText("app", from, from + 3));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.getText()).toContain("| 隐藏保留 |");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("does not construct a table when header and delimiter columns mismatch", () => {
    const input = fixture("08-not-table", "input");
    const expected = fixture("08-not-table", "expected");
    const { parent, runtime, view } = runtimeFor(input);
    expect(parent.querySelector("table")).toBeNull();
    let from = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.includes("说明。")) from = pos + node.text.indexOf("说明。");
    });
    expect(from).toBeGreaterThanOrEqual(0);

    view.dispatch(view.state.tr.insertText("说明！", from, from + "说明。".length));

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelector("table")).toBeNull();
    runtime.destroy();
  });

  it("toggles a real task checkbox by changing only its source state character", () => {
    const input = fixture("09-task-toggle", "input");
    const expected = fixture("09-task-toggle", "expected");
    const { dom, parent, runtime } = runtimeFor(input);
    const checkboxes = parent.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect([...checkboxes].map((checkbox) => checkbox.checked)).toEqual([false, true]);
    expect(checkboxes[0].tabIndex).toBe(0);
    expect(checkboxes[0].getAttribute("aria-label")).toContain("中文");

    checkboxes[0].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.getText()).toContain("[X]");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });

  it("creates an unchecked sibling task on Enter through the production keymap", () => {
    const input = fixture("10-task-enter", "input");
    const expected = fixture("10-task-enter", "expected");
    const { dom, parent, runtime, view } = runtimeFor(input);
    let end = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "已完成") end = pos + node.nodeSize;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));

    view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(parent.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].checked).toBe(false);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });

  it("toggles a nested ordered task without changing indentation or numbering", () => {
    const input = fixture("11-nested-task", "input");
    const expected = fixture("11-nested-task", "expected");
    const { dom, parent, runtime } = runtimeFor(input);
    const checkbox = [...parent.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .find((candidate) => candidate.getAttribute("aria-label")?.includes("子项"));
    expect(checkbox).toBeDefined();

    checkbox!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("renders no fake checkbox for code or ordinary task-like text", () => {
    const input = fixture("12-task-not-code", "input");
    const expected = fixture("12-task-not-code", "expected");
    const { dom, parent, runtime } = runtimeFor(input);
    const checkboxes = parent.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(1);
    expect(parent.querySelector("code")?.textContent).toContain("- [ ] 代码示例");

    checkboxes[0].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.getText()).toContain("- [ ] 代码示例");
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("uses Tab for no-history cell navigation and adds one row at the final cell", () => {
    const input = fixture("03-add-row", "input");
    const expected = fixture("03-add-row", "expected");
    const { dom, runtime, view } = runtimeFor(input);
    const first = textPositionIn(view, "table_cell", (node) => node.textContent === "api");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, first)));
    const navigate = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

    view.dom.dispatchEvent(navigate);

    expect(navigate.defaultPrevented).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.status).toMatchObject({ dirty: false, canUndo: false });
    const last = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, last + "ready".length)));

    view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true });
    expect(view.state.selection.$from.parent.type.name).toBe("table_cell");
    expect(view.state.selection.$from.parent.textContent).toBe("");
    runtime.destroy();
  });

  it("materializes only the necessary pipe when first editing a missing data cell", () => {
    const input = "| A | B |\n| --- | --- |\n| only |\n";
    const expected = "| A | B |\n| --- | --- |\n| only | new |\n";
    const { runtime, view } = runtimeFor(input);
    const cells: Array<{ pos: number; text: string }> = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === "table_cell") cells.push({ pos: pos + 1, text: node.textContent });
    });
    expect(cells.map((cell) => cell.text)).toEqual(["only", ""]);

    view.dispatch(view.state.tr.insertText("new", cells[1].pos));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("edits a table without outer pipes and preserves inline code, links and escapes", () => {
    const input = "名称 | 说明\n--- | ---\n`a\\|b` | [旧值](./x) 与 A\\|B\n";
    const expected = "名称 | 说明\n--- | ---\n`a\\|b` | [新值](./x) 与 A\\|B\n";
    const { parent, runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent.includes("旧值"));

    view.dispatch(view.state.tr.insertText("新", from, from + 1));
    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelector("td code")?.textContent).toBe("a|b");
    expect(parent.querySelector("td a")?.getAttribute("href")).toBe("./x");
    expect(parent.querySelectorAll("td")[1]?.textContent).toContain("A|B");
    runtime.destroy();
  });

  it("exits a list when Enter is pressed on an empty task", () => {
    const input = "- [ ] ";
    const { dom, parent, runtime, view } = runtimeFor(input);
    let caret = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.content.size === 0) caret = pos + 1;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));

    view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));

    expect(runtime.getText()).toBe("");
    expect(parent.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    runtime.destroy();
  });

  it("toggles a focused task checkbox with Space and rejects it during composition", () => {
    const input = "- [ ] 中文\n";
    const { dom, parent, runtime, view } = runtimeFor(input);
    let checkbox = parent.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.focus();

    checkbox.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: " ", bubbles: true, cancelable: true,
    }));

    expect(runtime.getText()).toBe("- [x] 中文\n");
    checkbox = parent.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    view.dom.dispatchEvent(new dom.window.CompositionEvent("compositionstart", { bubbles: true }));
    checkbox.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: " ", bubbles: true, cancelable: true,
    }));
    expect(runtime.getText()).toBe("- [x] 中文\n");
    expect(checkbox.checked).toBe(true);
    view.dom.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true }));
    runtime.destroy();
  });

  it("does not consume table Tab or toolbar commands during composition", () => {
    const input = fixture("03-add-row", "input");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const last = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, last)));
    view.dom.focus();
    view.dom.dispatchEvent(new dom.window.CompositionEvent("compositionstart", { bubbles: true }));
    const tab = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

    view.dom.dispatchEvent(tab);
    const button = parent.querySelector<HTMLButtonElement>('[data-table-command="add_row_after"]')!;
    const pointer = new dom.window.Event("pointerdown", { bubbles: true, cancelable: true });
    button.dispatchEvent(pointer);
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(tab.defaultPrevented).toBe(false);
    expect(pointer.defaultPrevented).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.status.canUndo).toBe(false);
    view.dom.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true }));
    runtime.destroy();
  });

  it("deletes the final data row while keeping a valid header-only table", () => {
    const input = "| A | B |\n| --- | --- |\n| x | y |\n";
    const expected = "| A | B |\n| --- | --- |\n";
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "x");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected)));

    clickTableCommand(dom, parent, "delete_row");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("thead tr")).toHaveLength(1);
    expect(parent.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("inserts a reachable default two-column table into an empty document", () => {
    const expected = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";
    const { parent, runtime } = runtimeFor("");

    expect(runtime.insertTable()).toBe(true);

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("th")).toHaveLength(2);
    expect(parent.querySelectorAll("td")).toHaveLength(2);
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true, saveEligible: true });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("");
    runtime.destroy();
  });

  it("inserts a new table after the current block with inherited CRLF", () => {
    const input = "第一段\r\n\r\n第二段\r\n";
    const table = "| 列 1 | 列 2 |\r\n| --- | --- |\r\n|  |  |";
    const expected = `第一段\r\n\r\n${table}\r\n\r\n第二段\r\n`;
    const { runtime, view } = runtimeFor(input);
    let caret = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "第一段") caret = pos + 1;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)));

    expect(runtime.insertTable()).toBe(true);

    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    runtime.destroy();
  });

  it("deletes a table explicitly instead of allowing a zero-column table", () => {
    const input = "| A |\n| --- |";
    const { dom, parent, runtime } = runtimeFor(input);
    expect(parent.querySelector<HTMLButtonElement>('[data-table-command="delete_column"]')?.disabled).toBe(true);

    clickTableCommand(dom, parent, "delete_table");

    expect(runtime.getText()).toBe("");
    expect(parent.querySelector("table")).toBeNull();
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    runtime.destroy();
  });

  it("edits task label marks and links without rebuilding the task marker", () => {
    const input = "- [ ] **旧值** 与 [链接](./target)\n";
    const expected = "- [ ] **新值** 与 [链接](./target)\n";
    const { parent, runtime, view } = runtimeFor(input);
    let from = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "旧值") from = pos;
    });

    view.dispatch(view.state.tr.insertText("新值", from, from + 2));

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelector("li strong")?.textContent).toBe("新值");
    expect(parent.querySelector("li a")?.getAttribute("href")).toBe("./target");
    expect(parent.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    runtime.destroy();
  });

  it("edits a table inside a blockquote without changing container prefixes", () => {
    const input = "> | A | B |\n> | --- | --- |\n> | x | y |\n";
    const expected = "> | A | B |\n> | --- | --- |\n> | x | z |\n";
    const { runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "y");

    view.dispatch(view.state.tr.insertText("z", from, from + 1));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("edits a table inside a list item without changing indentation", () => {
    const input = "- 表格：\n\n  | A | B |\n  | --- | --- |\n  | x | y |\n";
    const expected = input.replace("| x | y |", "| x | z |");
    const { runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "y");

    view.dispatch(view.state.tr.insertText("z", from, from + 1));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  it("adds a row inside a blockquote with the inherited container prefix", () => {
    const input = "> | A | B |\n> | --- | --- |\n> | x | y |\n";
    const expected = input.replace("> | x | y |", "> | x | y |\n> |  |  |");
    const { dom, parent, runtime, view } = runtimeFor(input);
    const selected = textPositionIn(view, "table_cell", (node) => node.textContent === "y");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected)));

    clickTableCommand(dom, parent, "add_row_after");

    expect(runtime.getText()).toBe(expected);
    expect(parent.querySelectorAll("tbody tr")).toHaveLength(2);
    runtime.destroy();
  });

  it("pastes basic visible text into one cell without losing a pipe", () => {
    const input = "| A | B |\n| --- | --- |\n| x | y |\n";
    const expected = "| A | B |\n| --- | --- |\n| x | A\\|B |\n";
    const { runtime, view } = runtimeFor(input);
    const from = textPositionIn(view, "table_cell", (node) => node.textContent === "y");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 1)));
    const transaction = createPasteTransaction(view.state, { kind: "plain_text", text: "A|B" });
    if (!transaction) throw new Error("Expected table paste transaction");

    view.dispatch(transaction);

    expect(runtime.getText()).toBe(expected);
    expect(view.state.selection.$from.parent.textContent).toBe("A|B");
    runtime.destroy();
  });

  it("keeps a backward cross-cell selection and edits whole Unicode graphemes", () => {
    const input = "| A | B |\r\n| --- | --- |\r\n| e\u0301 | 😀 |\r\n";
    const expected = input.replace("😀", "👩‍💻");
    const { runtime, view } = runtimeFor(input);
    const first = textPositionIn(view, "table_cell", (node) => node.textContent === "e\u0301");
    const second = textPositionIn(view, "table_cell", (node) => node.textContent === "😀");

    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc,
      second + "😀".length,
      first,
    )));
    expect(view.state.selection.anchor).toBeGreaterThan(view.state.selection.head);
    expect(runtime.getText()).toBe(input);
    expect(runtime.status).toMatchObject({ dirty: false, canUndo: false });

    view.dispatch(view.state.tr.insertText("👩‍💻", second, second + "😀".length));

    expect(runtime.getText()).toBe(expected);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });

  const frozenDrivers: Record<string, (context: ReturnType<typeof runtimeFor>) => void> = {
    "01-cell-crlf": ({ view }) => {
      const from = textPositionIn(view, "table_cell", (node) => node.textContent === "旧值");
      view.dispatch(view.state.tr.insertText("新值", from, from + 2));
    },
    "02-cell-pipe": ({ view }) => {
      const from = textPositionIn(view, "table_cell", (node) => node.textContent === "占位");
      view.dispatch(view.state.tr.insertText("A|B", from, from + 2));
    },
    "03-add-row": ({ dom, parent, view }) => {
      const pos = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      clickTableCommand(dom, parent, "add_row_after");
    },
    "04-add-column": ({ dom, parent, view }) => {
      const pos = textPositionIn(view, "table_cell", (node) => node.textContent === "好");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      clickTableCommand(dom, parent, "add_column_after");
    },
    "05-delete-column": ({ dom, parent, view }) => {
      const pos = textPositionIn(view, "table_cell", (node) => node.textContent === "ready");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      clickTableCommand(dom, parent, "delete_column");
    },
    "06-align": ({ dom, parent, view }) => {
      const pos = textPositionIn(view, "table_cell", (node) => node.textContent === "api");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      clickTableCommand(dom, parent, "align_center");
    },
    "07-hidden-extra-cell": ({ view }) => {
      const from = textPositionIn(view, "table_cell", (node) => node.textContent === "api");
      view.dispatch(view.state.tr.insertText("app", from, from + 3));
    },
    "08-not-table": ({ view }) => {
      let from = -1;
      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text?.includes("说明。")) from = pos + node.text.indexOf("说明。");
      });
      view.dispatch(view.state.tr.insertText("说明！", from, from + 3));
    },
    "09-task-toggle": ({ dom, parent }) => {
      parent.querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    "10-task-enter": ({ dom, view }) => {
      let end = -1;
      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === "已完成") end = pos + node.nodeSize;
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
      view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    },
    "11-nested-task": ({ dom, parent }) => {
      const checkbox = [...parent.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .find((candidate) => candidate.getAttribute("aria-label")?.includes("子项"))!;
      checkbox.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    "12-task-not-code": ({ dom, parent }) => {
      parent.querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
  };

  it.each(Object.keys(frozenDrivers))(
    "completes frozen %s through snapshot, source no-op, history and reopen",
    (id) => {
      const input = fixture(id, "input");
      const expected = fixture(id, "expected");
      const context = runtimeFor(input);
      frozenDrivers[id](context);
      const { parent, runtime } = context;
      expect(runtime.getText()).toBe(expected);
      expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
      const statusBeforeSource = runtime.status;
      expect(runtime.enterSourceMode()).toBe(true);
      expect(parent.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(expected.replace(/\r\n/g, "\n"));
      expect(runtime.cancelSourceDraft()).toBe(true);
      expect(runtime.getText()).toBe(expected);
      expect(runtime.status).toEqual(statusBeforeSource);
      runtime.markSaved(expected);
      expect(runtime.status.dirty).toBe(false);
      expect(runtime.undo()).toBe(true);
      expect(runtime.getText()).toBe(input);
      expect(runtime.status.dirty).toBe(true);
      expect(runtime.redo()).toBe(true);
      expect(runtime.getText()).toBe(expected);
      expect(runtime.status.dirty).toBe(false);
      runtime.destroy();

      const reopened = runtimeFor(expected);
      expect(reopened.runtime.getText()).toBe(expected);
      expect(reopened.runtime.snapshotText()).toEqual({ ok: true, value: expected });
      expect(reopened.runtime.status).toMatchObject({ dirty: false, canUndo: false, canRedo: false });
      reopened.runtime.destroy();
    },
  );

  it("rebuilds table and task nodes after an explicit source edit on the same raw document", () => {
    const input = "| A | B |\r\n| --- | --- |\r\n| old | y |\r\n\r\n- [ ] 任务\r\n";
    const expected = input.replace("old", "new").replace("[ ]", "[x]");
    const { dom, parent, runtime } = runtimeFor(input);
    expect(runtime.enterSourceMode()).toBe(true);
    const area = parent.querySelector<HTMLTextAreaElement>("textarea")!;
    area.value = area.value.replace("old", "new").replace("[ ]", "[x]");
    area.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    expect(runtime.cancelSourceDraft()).toBe(true);
    expect(parent.querySelectorAll("td")[0]?.textContent).toBe("new");
    expect(parent.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(input);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
    runtime.destroy();
  });

  it("rejects an outdated table-cell transaction without partially changing current raw", () => {
    const input = "| A | B |\n| --- | --- |\n| x | y |\n";
    const { runtime, view } = runtimeFor(input);
    const x = textPositionIn(view, "table_cell", (node) => node.textContent === "x");
    const y = textPositionIn(view, "table_cell", (node) => node.textContent === "y");
    const stale = view.state.tr.insertText("old", x, x + 1);
    view.dispatch(view.state.tr.insertText("new", y, y + 1));
    const current = input.replace("| x | y |", "| x | new |");
    const session = (runtime as unknown as { session: { dispatch(transaction: typeof stale): boolean; diagnostic: string } }).session;

    expect(session.dispatch(stale)).toBe(false);

    expect(runtime.getText()).toBe(current);
    expect(session.diagnostic).toContain("过期事务");
    expect(runtime.status.unresolved).toBe(true);
    runtime.destroy();
  });
});

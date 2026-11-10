import type { Node as PMNode } from "prosemirror-model";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { bindContextToolbar } from "./context-tools";

export type TableAlignment = "none" | "left" | "center" | "right";
export type TableCommandType =
  | "add_row_before"
  | "add_row_after"
  | "delete_row"
  | "add_column_before"
  | "add_column_after"
  | "delete_column"
  | "align_none"
  | "align_left"
  | "align_center"
  | "align_right"
  | "delete_table";

export type TableCommandMeta = {
  type: TableCommandType;
  tablePos: number;
  rowIndex: number;
  columnIndex: number;
  alignment?: TableAlignment;
};

type TableContext = {
  table: PMNode;
  tablePos: number;
  rows: PMNode[];
  rowIndex: number;
  columnIndex: number;
};

function tableRows(table: PMNode): PMNode[] {
  const rows: PMNode[] = [];
  table.forEach((section) => section.forEach((row) => rows.push(row)));
  return rows;
}

function contextFor(state: EditorState, tablePos: number): TableContext | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  const rows = tableRows(table);
  let selectedRow: PMNode | undefined;
  let selectedCell: PMNode | undefined;
  const resolved = state.selection.$from;
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (!selectedCell && (node.type.name === "table_cell" || node.type.name === "table_header")) selectedCell = node;
    if (!selectedRow && node.type.name === "table_row") selectedRow = node;
  }
  const rowIndex = Math.max(0, selectedRow ? rows.indexOf(selectedRow) : Math.min(1, rows.length - 1));
  const row = rows[rowIndex];
  let columnIndex = 0;
  if (selectedCell && row) {
    for (let index = 0; index < row.childCount; index++) {
      if (row.child(index) === selectedCell) columnIndex = index;
    }
  }
  return { table, tablePos, rows, rowIndex, columnIndex };
}

function rebuildTable(context: TableContext, command: TableCommandType): PMNode | null {
  const { table, rows, rowIndex, columnIndex } = context;
  const schema = table.type.schema;
  const head = rows[0];
  if (!head) return null;
  const bodyRows = rows.slice(1);
  const columnCount = head.childCount;
  const makeDataRow = (): PMNode => schema.nodes.table_row.createChecked(
    null,
    Array.from({ length: columnCount }, (_unused, index) =>
      schema.nodes.table_cell.create({ alignment: head.child(index).attrs.alignment })),
  );
  let nextHead = head;
  let nextBody = [...bodyRows];
  if (command === "add_row_before" || command === "add_row_after") {
    // The header is outside bodyRows; either adjacent data-row insertion
    // starts at the first body slot rather than after its existing row.
    const bodyIndex = rowIndex === 0 ? 0 : rowIndex - 1 + (command === "add_row_after" ? 1 : 0);
    nextBody.splice(Math.min(bodyIndex, nextBody.length), 0, makeDataRow());
  } else if (command === "delete_row") {
    if (rowIndex === 0) return null;
    nextBody.splice(rowIndex - 1, 1);
  } else if (command === "add_column_before" || command === "add_column_after") {
    const at = columnIndex + (command === "add_column_after" ? 1 : 0);
    const insert = (row: PMNode, header: boolean): PMNode => {
      const cells: PMNode[] = [];
      row.forEach((cell) => cells.push(cell));
      cells.splice(at, 0, schema.nodes[header ? "table_header" : "table_cell"].create());
      return schema.nodes.table_row.createChecked(null, cells);
    };
    nextHead = insert(nextHead, true);
    nextBody = nextBody.map((row) => insert(row, false));
  } else if (command === "delete_column") {
    if (columnCount <= 1) return null;
    const remove = (row: PMNode): PMNode => {
      const cells: PMNode[] = [];
      row.forEach((cell, _offset, index) => { if (index !== columnIndex) cells.push(cell); });
      return schema.nodes.table_row.createChecked(null, cells);
    };
    nextHead = remove(nextHead);
    nextBody = nextBody.map(remove);
  } else if (command.startsWith("align_")) {
    const alignment = command.slice("align_".length) as TableAlignment;
    const align = (row: PMNode): PMNode => {
      const cells: PMNode[] = [];
      row.forEach((cell, _offset, index) => cells.push(index === columnIndex
        ? cell.type.create({ ...cell.attrs, alignment }, cell.content, cell.marks)
        : cell));
      return schema.nodes.table_row.createChecked(null, cells);
    };
    nextHead = align(nextHead);
    nextBody = nextBody.map(align);
  }
  const headSection = schema.nodes.table_head.createChecked(null, nextHead);
  const sections = [headSection];
  if (nextBody.length) sections.push(schema.nodes.table_body.createChecked(null, nextBody));
  return schema.nodes.table.createChecked(table.attrs, sections);
}

export function applyTableCommand(view: EditorView, tablePos: number, type: TableCommandType): boolean {
  if (view.composing) return false;
  const context = contextFor(view.state, tablePos);
  if (!context) return false;
  const meta: TableCommandMeta = {
    type,
    tablePos,
    rowIndex: context.rowIndex,
    columnIndex: context.columnIndex,
    alignment: type.startsWith("align_") ? type.slice(6) as TableAlignment : undefined,
  };
  if (type === "delete_table") {
    const paragraph = view.state.schema.nodes.paragraph.create();
    view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + context.table.nodeSize, paragraph)
      .setMeta("inkoraTableCommand", meta));
    return true;
  }
  const next = rebuildTable(context, type);
  if (!next) return false;
  view.dispatch(view.state.tr.replaceWith(tablePos, tablePos + context.table.nodeSize, next)
    .setMeta("inkoraTableCommand", meta));
  return true;
}

export const defaultTableMarkdown = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";

export function insertDefaultTable(view: EditorView): boolean {
  if (view.composing) return false;
  const document = view.state.doc;
  const schema = view.state.schema;
  const header = schema.nodes.table_row.createChecked(null, [
    schema.nodes.table_header.create(null, schema.text("列 1")),
    schema.nodes.table_header.create(null, schema.text("列 2")),
  ]);
  const data = schema.nodes.table_row.createChecked(null, [
    schema.nodes.table_cell.create(),
    schema.nodes.table_cell.create(),
  ]);
  const table = schema.nodes.table.createChecked(null, [
    schema.nodes.table_head.createChecked(null, header),
    schema.nodes.table_body.createChecked(null, data),
  ]);
  const empty = document.childCount === 1 && document.firstChild?.type.name === "paragraph" &&
    document.firstChild.content.size === 0;
  if (empty) {
    view.dispatch(view.state.tr.replaceWith(0, document.content.size, table)
      .setMeta("inkoraInsertTable", { raw: defaultTableMarkdown, anchorPos: 0 }));
    return true;
  }
  const resolved = view.state.selection.$from;
  if (resolved.depth < 1) return false;
  const topPos = resolved.before(1);
  const top = resolved.node(1);
  const anchorPos = topPos + top.nodeSize;
  view.dispatch(view.state.tr.insert(anchorPos, table)
    .setMeta("inkoraInsertTable", { raw: defaultTableMarkdown, anchorPos }));
  return true;
}

type TableNodeViewOptions = {
  isComposing: () => boolean;
};

function commandButton(label: string, command: TableCommandType): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.tableCommand = command;
  button.setAttribute("aria-label", label);
  return button;
}

export function createTableNodeViews(options: TableNodeViewOptions) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    const dom = document.createElement("div");
    dom.className = "inkora-table-shell";
    const toolbar = document.createElement("div");
    toolbar.className = "inkora-table-toolbar";
    toolbar.contentEditable = "false";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "表格操作");
    bindContextToolbar(toolbar, view, options.isComposing);
    const commands: Array<[string, TableCommandType]> = [
      ["前插行", "add_row_before"], ["后插行", "add_row_after"], ["删除行", "delete_row"],
      ["前插列", "add_column_before"], ["后插列", "add_column_after"], ["删除列", "delete_column"],
      ["左对齐", "align_left"], ["居中", "align_center"], ["右对齐", "align_right"],
      ["无对齐", "align_none"], ["删除表格", "delete_table"],
    ];
    let deleteColumnButton: HTMLButtonElement | undefined;
    for (const [label, command] of commands) {
      const button = commandButton(label, command);
      if (command === "delete_column") deleteColumnButton = button;
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (options.isComposing()) return;
        const pos = getPos();
        if (pos !== undefined) applyTableCommand(view, pos, command);
      });
      toolbar.append(button);
    }
    const updateAvailability = (current: PMNode): void => {
      deleteColumnButton!.disabled = (current.firstChild?.firstChild?.childCount ?? 0) <= 1;
    };
    updateAvailability(node);
    const contentDOM = document.createElement("table");
    contentDOM.className = "inkora-table";
    const scroll = document.createElement("div");
    scroll.className = "inkora-table-scroll";
    scroll.append(contentDOM);
    dom.append(toolbar, scroll);
    return {
      dom,
      contentDOM,
      update(updated) {
        if (updated.type !== node.type) return false;
        updateAvailability(updated);
        return true;
      },
      stopEvent(event) { return toolbar.contains(event.target as Node); },
    };
  };
}

export function handleTableTab(view: EditorView, shiftKey: boolean): boolean {
  if (view.composing) return false;
  const resolved = view.state.selection.$from;
  let tablePos = -1;
  let table: PMNode | undefined;
  let cell: PMNode | undefined;
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (!cell && ["table_header", "table_cell"].includes(node.type.name)) cell = node;
    if (node.type.name === "table") {
      table = node;
      tablePos = resolved.before(depth);
      break;
    }
  }
  if (!table || !cell || tablePos < 0) return false;
  const cells: Array<{ node: PMNode; pos: number }> = [];
  view.state.doc.nodesBetween(tablePos, tablePos + table.nodeSize, (node, pos) => {
    if (["table_header", "table_cell"].includes(node.type.name)) cells.push({ node, pos });
  });
  const index = cells.findIndex(item => item.node === cell);
  if (index < 0) return false;
  let target = index + (shiftKey ? -1 : 1);
  if (target >= cells.length) {
    if (!applyTableCommand(view, tablePos, "add_row_after")) return false;
    const updated = view.state.doc.nodeAt(tablePos);
    if (updated?.type.name === "table") {
      const nextCells: number[] = [];
      view.state.doc.nodesBetween(tablePos, tablePos + updated.nodeSize, (node, pos) => {
        if (["table_header", "table_cell"].includes(node.type.name)) nextCells.push(pos);
      });
      const firstNewCell = nextCells[cells.length];
      if (firstNewCell !== undefined) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, firstNewCell + 1))
          .setMeta("addToHistory", false));
      }
    }
    return true;
  }
  if (target < 0) target = 0;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cells[target].pos + 1))
    .setMeta("addToHistory", false));
  return true;
}

import { bindTableInteractions } from "./table-interactions";
import "./table-menu.css";
import type { Node as PMNode } from "prosemirror-model";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { bindContextToolbar } from "./context-tools";

import { validTableSize, type TableAlignment, type TableCommandType, type TableCommandMeta, type TableSize } from './table-commands';
export { TABLE_LIMITS, validTableSize } from './table-commands';
export type { TableAlignment, TableCommandType, TableCommandMeta, TableSize } from './table-commands';

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

function rebuildTable(context: TableContext, command: TableCommandType, details: Partial<TableCommandMeta>): PMNode | null {
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
  } else if (command === "move_row") {
    const target = details.targetIndex;
    if (!Number.isInteger(target) || target! < 1 || target! >= rows.length || rowIndex < 1 || rowIndex === target) return null;
    nextBody.splice(target! - 1, 0, nextBody.splice(rowIndex - 1, 1)[0]);
  } else if (command === "move_column") {
    const target = details.targetIndex;
    if (!Number.isInteger(target) || target! < 0 || target! >= columnCount || columnIndex === target) return null;
    const move = (row: PMNode) => {
      const cells: PMNode[] = [];
      row.forEach(cell => cells.push(cell));
      cells.splice(target!, 0, cells.splice(columnIndex, 1)[0]);
      return row.copy(schema.nodes.table_row.create(null, cells).content);
    };
    nextHead = move(head);
    nextBody = nextBody.map(move);
  } else if (command === "resize") {
    const size = { columns: details.columns!, rows: details.rows! };
    if (!validTableSize(size) || size.columns === columnCount && size.rows === rows.length ||
        (size.columns < columnCount || size.rows < rows.length) && !details.confirmShrink) return null;
    const resize = (row: PMNode, header: boolean) => {
      const cells: PMNode[] = [];
      for (let index = 0; index < size.columns; index++) cells.push(index < row.childCount ? row.child(index) :
        schema.nodes[header ? "table_header" : "table_cell"].create({ alignment: "none" }));
      return row.copy(schema.nodes.table_row.create(null, cells).content);
    };
    nextHead = resize(head, true);
    nextBody = Array.from({ length: size.rows - 1 }, (_, index) => index < bodyRows.length ?
      resize(bodyRows[index], false) : schema.nodes.table_row.createChecked(null,
        Array.from({ length: size.columns }, (_unused, column) =>
          schema.nodes.table_cell.create({ alignment: nextHead.child(column).attrs.alignment }))));
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

export function applyTableCommand(view: EditorView, tablePos: number, type: TableCommandType, details: Partial<Omit<TableCommandMeta, "type" | "tablePos">> = {}): boolean {
  if (view.composing || !view.editable || view.isDestroyed) return false;
  const context = contextFor(view.state, tablePos);
  if (!context) return false;
  if (details.rowIndex !== undefined) context.rowIndex = details.rowIndex;
  if (details.columnIndex !== undefined) context.columnIndex = details.columnIndex;
  if (!Number.isInteger(context.rowIndex) || context.rowIndex < 0 || context.rowIndex >= context.rows.length ||
      !Number.isInteger(context.columnIndex) || context.columnIndex < 0 || context.columnIndex >= context.rows[0].childCount) return false;
  const meta: TableCommandMeta = {
    ...details,
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
  const next = rebuildTable(context, type, details);
  if (!next) return false;
  let tr = view.state.tr.replaceWith(tablePos, tablePos + context.table.nodeSize, next);
  const targetRow = Math.min(type === "move_row" ? details.targetIndex! : context.rowIndex, tableRows(next).length - 1);
  const targetColumn = Math.min(type === "move_column" ? details.targetIndex! : context.columnIndex, tableRows(next)[0].childCount - 1);
  const positions: number[][] = [];
  next.descendants((child, offset) => {
    if (child.type.name === "table_row") positions.push([]);
    if (["table_cell", "table_header"].includes(child.type.name)) positions.at(-1)!.push(tablePos + offset + 2);
  });
  const caret = positions[targetRow][targetColumn];
  tr = tr.setSelection(TextSelection.create(tr.doc, caret));
  view.dispatch(tr.setMeta("inkoraTableCommand", meta));
  return view.state.doc.eq(tr.doc);
}

export const defaultTableMarkdown = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";

export function insertDefaultTable(view: EditorView, size: TableSize = { columns: 2, rows: 2 }): boolean {
  if (view.composing || !view.editable || !validTableSize(size)) return false;
  const document = view.state.doc;
  const schema = view.state.schema;
  const header = schema.nodes.table_row.createChecked(null, Array.from({ length: size.columns }, (_, index) =>
    schema.nodes.table_header.create(null, schema.text(`列 ${index + 1}`))));
  const sections = [schema.nodes.table_head.createChecked(null, header)];
  if (size.rows > 1) sections.push(schema.nodes.table_body.createChecked(null,
    Array.from({ length: size.rows - 1 }, () => schema.nodes.table_row.createChecked(null,
      Array.from({ length: size.columns }, () => schema.nodes.table_cell.create())))));
  const table = schema.nodes.table.createChecked(null, sections);
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const raw = [row(Array.from({ length: size.columns }, (_, index) => `列 ${index + 1}`)),
    row(Array(size.columns).fill("---")), ...Array.from({ length: size.rows - 1 }, () => row(Array(size.columns).fill("")))].join("\n");
  const empty = document.childCount === 1 && document.firstChild?.type.name === "paragraph" &&
    document.firstChild.content.size === 0;
  let anchorPos = 0;
  let tr = view.state.tr;
  if (empty) tr = tr.replaceWith(0, document.content.size, table);
  else {
    const resolved = view.state.selection.$from;
    if (resolved.depth < 1) return false;
    anchorPos = resolved.before(1) + resolved.node(1).nodeSize;
    tr = tr.insert(anchorPos, table);
  }
  tr.setSelection(TextSelection.create(tr.doc, anchorPos + 4));
  view.dispatch(tr.setMeta("inkoraInsertTable", { raw, anchorPos }));
  view.focus();
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
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "更多";
    more.setAttribute("aria-label", "更多表格操作");
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "inkora-table-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "更多表格操作");
    menu.hidden = true;
    let binding: EditorState | null = null;
    let alive = true;
    const close = () => {
      binding = null;
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      view.dom.removeEventListener("compositionstart", invalidate, true);
      view.dom.ownerDocument.defaultView!.removeEventListener("resize", invalidate);
      document.removeEventListener("scroll", scrolled, true);
      menu.hidden = true;
      more.setAttribute("aria-expanded", "false");
    };
    const valid = () => alive && dom.isConnected && !view.isDestroyed &&
      !options.isComposing() && !view.composing && view.editable;
    const focusItem = (item: HTMLButtonElement | undefined) => {
      if (!item) return;
      item.focus({ preventScroll: true });
      const bounds = menu.getBoundingClientRect();
      const target = item.getBoundingClientRect();
      const top = bounds.top + menu.clientTop + 4;
      const bottom = bounds.top + menu.clientTop + menu.clientHeight - 4;
      if (target.top < top) menu.scrollTop += target.top - top;
      else if (target.bottom > bottom) menu.scrollTop += target.bottom - bottom;
    };
    const open = () => {
      if (!valid()) return;
      binding = view.state;
      menu.hidden = false;
      more.setAttribute("aria-expanded", "true");
      const ownerWindow = view.dom.ownerDocument.defaultView!;
      let bottom = ownerWindow.innerHeight;
      // The editor can be nested in other clipping surfaces. Keep the menu
      // below its toolbar and scroll it locally rather than moving the page.
      for (let ancestor: HTMLElement | null = toolbar.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ownerWindow.getComputedStyle(ancestor).overflowY !== "visible") {
          const rect = ancestor.getBoundingClientRect();
          bottom = Math.min(bottom, rect.top + ancestor.clientTop + ancestor.clientHeight);
        }
      }
      const available = Math.max(0, bottom - menu.getBoundingClientRect().top - 4);
      menu.style.maxHeight = `${Math.min(320, available)}px`;
      observer.observe(view.dom, { subtree: true, childList: true, attributes: true });
      document.addEventListener("pointerdown", outside, true);
      view.dom.addEventListener("compositionstart", invalidate, true);
      ownerWindow.addEventListener("resize", invalidate);
      document.addEventListener("scroll", scrolled, true);
      focusItem(menu.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? undefined);
    };
    more.addEventListener("pointerdown", event => event.preventDefault());
    more.addEventListener("click", () => menu.hidden ? open() : close());
    more.addEventListener("keydown", event => {
      if (event.isComposing || options.isComposing()) return;
      if (event.key === "ArrowDown") { event.preventDefault(); open(); }
    });
    menu.addEventListener("keydown", event => {
      if (event.isComposing || options.isComposing()) return;
      if (event.key === "Escape") { close(); return; }
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const key = event.key;
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
        event.preventDefault();
        focusItem(items[key === "Home" ? 0 : key === "End" ? items.length - 1 :
          (index + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length]);
      }
      if (key === "Tab") close();
    });
    const outside = (event: Event) => {
      if (!toolbar.contains(event.target as Node)) close();
    };
    toolbar.addEventListener("focusout", event => {
      if (!toolbar.contains(event.relatedTarget as Node | null)) close();
    });
    const invalidate = () => close();
    const scrolled = (event: Event) => {
      if (event.target !== menu && !menu.contains(event.target as Node)) close();
    };
    // Any accepted selection/content transition invalidates the captured intent,
    // including a move away and back before the next click.
    const observer = new view.dom.ownerDocument.defaultView!.MutationObserver(() => {
      if (binding && (binding !== view.state || !valid())) close();
    });
    let deleteColumnButton: HTMLButtonElement | undefined;
    for (const [label, command] of commands) {
      const button = commandButton(label, command);
      const primary = command === "add_row_after" || command === "add_column_after";
      if (command === "delete_column") deleteColumnButton = button;
      if (!primary) button.setAttribute("role", "menuitem");
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => {
        event.preventDefault();
        if (!valid() || (!primary && (!binding || binding !== view.state || menu.hidden))) {
          close(); return;
        }
        const pos = getPos();
        close();
        if (pos !== undefined) applyTableCommand(view, pos, command);
      });
      (primary ? toolbar : menu).append(button);
    }
    toolbar.append(more, menu);
    const updateAvailability = (current: PMNode): void => {
      close();
      deleteColumnButton!.disabled = (current.firstChild?.firstChild?.childCount ?? 0) <= 1;
    };
    updateAvailability(node);
    const contentDOM = document.createElement("table");
    contentDOM.className = "inkora-table";
    const scroll = document.createElement("div");
    scroll.className = "inkora-table-scroll";
    scroll.append(contentDOM);
    dom.append(toolbar, scroll);
    const interactions = bindTableInteractions({ view, shell: dom, toolbar, scroll, table: contentDOM,
      execute: (type, details) => { const pos = getPos(); return pos !== undefined && applyTableCommand(view, pos, type, details); },
      isComposing: options.isComposing });
    interactions.update(node);
    return {
      dom,
      contentDOM,
      update(updated) {
        if (updated.type !== node.type) return false;
        updateAvailability(updated);
        interactions.update(updated);
        return true;
      },
      destroy() {
        alive = false;
        interactions.destroy();
        close();
      },
      ignoreMutation(mutation) {
        return mutation.type !== "selection" && !contentDOM.contains(mutation.target);
      },
      stopEvent(event) { return toolbar.contains(event.target as Node) || interactions.contains(event.target as Node); },
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

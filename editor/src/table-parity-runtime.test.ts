import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime } from './editor-runtime';

const original = { document: globalThis.document, window: globalThis.window };
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  Object.defineProperty(globalThis, 'document', { configurable: true, value: original.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: original.window });
});
function setup(raw: string) {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  const host = document.querySelector('main')!;
  const changes: string[] = [];
  const runtime = createEditorRuntime(host, raw, (_status, kind) => { if (kind === 'document') changes.push(runtime.getText()); });
  const view = (runtime as unknown as { view: EditorView }).view;
  cleanups.push(() => { runtime.destroy(); dom.window.close(); });
  return { dom, host, runtime, view, changes };
}
it('creates a 3-column 4-total-row table with first-cell caret and one undo', () => {
  const { runtime, host, view } = setup('');
  expect(runtime.insertTable({ columns: 3, rows: 4 })).toBe(true);
  const expected = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |';
  expect(runtime.getText()).toBe(expected);
  expect(host.querySelectorAll('tr')).toHaveLength(4);
  expect(view.state.selection.$from.parent.type.name).toBe('table_header');
  expect(view.state.selection.$from.parentOffset).toBe(0);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('');
  expect(runtime.undo()).toBe(false);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it('moves a column with alignment and raw cell formatting, keeping hidden tail cells', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '\uFEFF前\r\n\r\n> | A | C | B |\r\n> | :--- | ---: | :---: |\r\n> | **a** | c\\|x | `b` | hidden |\r\n> | only |\r\n\r\n尾\r\n';
  const { runtime, view, host } = setup(raw);
  let tablePos = -1;
  view.state.doc.descendants((node, pos) => { if (node.type.name === 'table') tablePos = pos; });
  expect(applyTableCommand(view, tablePos, 'move_column', { columnIndex: 2, targetIndex: 1 })).toBe(true);
  const expected = '\uFEFF前\r\n\r\n> | A | B | C |\r\n> | :--- | :---: | ---: |\r\n> | **a** | `b` | c\\|x | hidden |\r\n> | only |  |  |\r\n\r\n尾\r\n';
  expect(runtime.getText()).toBe(expected);
  expect([...host.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(['A', 'B', 'C']);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it('moves whole data rows and resizes only after explicit shrink confirmation', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '| A | B |\r\n| :--- | ---: |\r\n| 1 | x | hidden1 |\r\n| 2 | y | hidden2 |\r\n| 3 | z |';
  const { runtime, view, host } = setup(raw);
  expect(applyTableCommand(view, 0, 'move_row', { rowIndex: 2, targetIndex: 1 })).toBe(true);
  const moved = raw.replace('| 1 | x | hidden1 |\r\n| 2 | y | hidden2 |', '| 2 | y | hidden2 |\r\n| 1 | x | hidden1 |');
  expect(runtime.getText()).toBe(moved);
  expect(view.state.selection.$from.parent.textContent).toBe('2');
  expect(applyTableCommand(view, 0, 'resize', { columns: 3, rows: 5 })).toBe(true);
  expect(runtime.getText()).toContain('| 2 | y |  | hidden2 |');
  expect(host.querySelectorAll('tr')).toHaveLength(5);
  expect(host.querySelectorAll('th')).toHaveLength(3);
  const expanded = runtime.getText();
  const before = runtime.status;
  expect(applyTableCommand(view, 0, 'resize', { columns: 1, rows: 2 })).toBe(false);
  expect(runtime.getText()).toBe(expanded);
  expect(runtime.status).toEqual(before);
  expect(applyTableCommand(view, 0, 'resize', { columns: 1, rows: 2, confirmShrink: true })).toBe(true);
  expect(runtime.getText()).toBe('| A |\r\n| :--- |\r\n| 2 | hidden2 |');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(expanded);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(moved);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});

it('opens a size dialog without editing and rejects stale confirmation', () => {
  const { runtime, view, host, dom } = setup('正文\r\n');
  expect(runtime.requestTableInsertion()).toBe(true);
  const dialog = host.querySelector('dialog')!;
  expect(runtime.getText()).toBe('正文\r\n');
  (dialog.querySelector('[name=columns]') as HTMLInputElement).value = '3';
  (dialog.querySelector('[name=rows]') as HTMLInputElement).value = '4';
  dialog.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  expect(host.querySelectorAll('tr')).toHaveLength(4);
  expect(runtime.getText()).toContain('\r\n| 列 1 | 列 2 | 列 3 |\r\n');
  expect(host.querySelector('dialog')).toBeNull();
  expect(runtime.undo()).toBe(true);
  expect(runtime.requestTableInsertion()).toBe(true);
  const stale = host.querySelector('form')!;
  const currentView = (runtime as unknown as { view: EditorView }).view;
  currentView.dispatch(currentView.state.tr.insertText('新', 1));
  const raw = runtime.getText();
  stale.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe(raw);
  expect(host.querySelector('table')).toBeNull();
});

it('supports keyboard row/column movement and refuses detached handles', () => {
  const raw = '| A | C | B |\n| --- | --- | --- |\n| 1 | c | b |\n| 2 | d | e |';
  const { dom, host, runtime } = setup(raw);
  const col = host.querySelector<HTMLButtonElement>('[data-table-axis=column][data-table-index="2"]')!;
  col.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 | b | c |\n| 2 | e | d |');
  const moved = runtime.getText();
  col.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe(moved);
  const row = host.querySelector<HTMLButtonElement>('[data-table-axis=row][data-table-index="2"]')!;
  row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe('| A | B | C |\n| --- | --- | --- |\n| 2 | e | d |\n| 1 | b | c |');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(moved);
});

it('previews drag without a content change and commits one drop or cancels with Escape', () => {
  const raw = '| A | C | B |\n| --- | --- | --- |\n| 1 | c | b |';
  const { dom, host, runtime } = setup(raw);
  const headers = [...host.querySelectorAll('th')];
  // Geometry is supplied at the DOM seam; actual coordinates are checked separately in WK.
  headers.forEach((cell, index) => { cell.getBoundingClientRect = () => ({ left: index * 100, top: 20, width: 100,
    height: 30, right: (index + 1) * 100, bottom: 50, x: index * 100, y: 20, toJSON() {} }); });
  const pointer = (target: EventTarget, type: string, x: number) => {
    const event = new dom.window.MouseEvent(type, { clientX: x, clientY: 30, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 9 }); target.dispatchEvent(event);
  };
  let handle = host.querySelector<HTMLButtonElement>('[data-table-axis=column][data-table-index="2"]')!;
  const before = runtime.status;
  pointer(handle, 'pointerdown', 250); pointer(document, 'pointermove', 150);
  expect(host.querySelector<HTMLElement>('.table-drop-indicator')!.dataset.targetIndex).toBe('1');
  expect(host.querySelector<HTMLElement>('.table-drag-shade')!.hidden).toBe(false);
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  pointer(document, 'pointerup', 150);
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before);
  pointer(handle, 'pointerdown', 250); pointer(document, 'pointermove', 150); pointer(document, 'pointerup', 150);
  expect(runtime.getText()).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 | b | c |');
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
  expect(runtime.undo()).toBe(false);
});

it('grid previews are UI-only, shrinking requires confirmation and cancel preserves history', () => {
  const raw = '| A | B |\n| --- | --- |\n| one | two |';
  const { dom, host, runtime } = setup(raw);
  const open = () => host.querySelector<HTMLButtonElement>('[aria-label="调整表格规模"]')!.click();
  open();
  const before = runtime.status;
  host.querySelector('[role=gridcell][data-column="4"][data-row="6"]')!
    .dispatchEvent(new dom.window.Event('pointerenter'));
  expect(host.querySelector('output')!.textContent).toBe('4 列 × 6 行（含表头）');
  expect(host.querySelectorAll('[role=gridcell][aria-selected=true]')).toHaveLength(24);
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before);
  host.querySelector('dialog')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(host.querySelector('dialog')).toBeNull(); expect(runtime.status).toEqual(before);
  open();
  host.querySelector<HTMLButtonElement>('[role=gridcell][data-column="1"][data-row="1"]')!.click();
  expect(host.querySelector('dialog')).not.toBeNull();
  expect(runtime.getText()).toBe(raw);
  const confirm = host.querySelector<HTMLInputElement>('[name=confirmShrink]')!;
  confirm.checked = true; confirm.dispatchEvent(new dom.window.Event('change'));
  host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe('| A |\n| --- |');
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
});

it.each([{columns: 0, rows: 2}, {columns: 21, rows: 2}, {columns: 2, rows: 101},
  {columns: 2, rows: 0}, {columns: 1.5, rows: 2}, {columns: NaN, rows: 1}])('rejects invalid insertion atomically: %j', size => {
  const { runtime } = setup('正文\n'); const before = runtime.status;
  expect(runtime.insertTable(size)).toBe(false); expect(runtime.getText()).toBe('正文\n'); expect(runtime.status).toEqual(before);
});

it('keeps optional outer pipes and nested container prefixes during column reordering', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '- 事项\n\n  A | C | B\n  :--- | ---: | :---:\n  a | c | b\n\n尾';
  const { runtime, view } = setup(raw);
  let pos = -1; view.state.doc.descendants((node, at) => { if (node.type.name === 'table') pos = at; });
  expect(applyTableCommand(view, pos, 'move_column', { columnIndex: 2, targetIndex: 1 })).toBe(true);
  expect(runtime.getText()).toBe('- 事项\n\n  A | B| C \n  :--- | :---:| ---: \n  a | b| c \n\n尾');
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
});

it('pins the header and rejects no-op/invalid moves without history or source changes', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  const { runtime, view } = setup(raw); const before = runtime.status;
  expect(applyTableCommand(view, 0, 'move_row', { rowIndex: 0, targetIndex: 1 })).toBe(false);
  expect(applyTableCommand(view, 0, 'move_row', { rowIndex: 1, targetIndex: 0 })).toBe(false);
  expect(applyTableCommand(view, 0, 'move_column', { columnIndex: 0, targetIndex: 0 })).toBe(false);
  expect(applyTableCommand(view, 0, 'move_column', { columnIndex: -1, targetIndex: 1 })).toBe(false);
  expect(applyTableCommand(view, 0, 'resize', { columns: 2, rows: 2 })).toBe(false);
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before);
});

it('blocks active interactions during composition and rejects an intent after selection changes', () => {
  const raw = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  const { runtime, view, dom, host } = setup(raw);
  const handle = host.querySelector<HTMLButtonElement>('[data-table-axis=column]')!;
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  handle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(runtime.requestTableInsertion()).toBe(false);
  host.querySelector<HTMLButtonElement>('[aria-label="调整表格规模"]')!.click();
  expect(host.querySelector('dialog')).toBeNull(); expect(runtime.getText()).toBe(raw);
});

it('reorders a table beginning on the list marker line without moving that marker', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '- | A | C | B |\r\n  | --- | --- | --- |\r\n  | a | c | b |';
  const { runtime, view } = setup(raw);
  let tablePos = -1; view.state.doc.descendants((node, pos) => { if (node.type.name === 'table') tablePos = pos; });
  expect(tablePos).toBeGreaterThan(0);
  expect(applyTableCommand(view, tablePos, 'move_column', { columnIndex: 2, targetIndex: 1 })).toBe(true);
  expect(runtime.getText()).toBe('- | A | B | C |\r\n  | --- | --- | --- |\r\n  | a | b | c |');
});

it('resizes valid pipe-less data rows and materializes missing edge cells only when necessary', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const { runtime, view } = setup('| A |\n| --- |\none\ntwo');
  expect(applyTableCommand(view, 0, 'resize', { columns: 1, rows: 4 })).toBe(true);
  expect(runtime.getText()).toBe('| A |\n| --- |\none\ntwo\n|  |');
  expect(runtime.undo()).toBe(true);
  const current = (runtime as unknown as { view: EditorView }).view;
  expect(applyTableCommand(current, 0, 'resize', { columns: 3, rows: 3 })).toBe(true);
  expect(runtime.getText()).toBe('| A |  |  |\n| --- | --- | --- |\none|  |  |\ntwo|  |  |');
});

it('keeps destination container prefixes and EOLs when moving row payloads', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '> | A | B |\r\n> | --- | --- |\n> | one | 1 |\r\n>  | two | 2 |';
  const { runtime, view } = setup(raw);
  let pos = -1; view.state.doc.descendants((node, at) => { if (node.type.name === 'table') pos = at; });
  expect(applyTableCommand(view, pos, 'move_row', { rowIndex: 2, targetIndex: 1 })).toBe(true);
  expect(runtime.getText()).toBe('> | A | B |\r\n> | --- | --- |\n> | two | 2 |\r\n>  | one | 1 |');
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
});

it('preserves the surviving last row CRLF instead of borrowing a removed row LF when shrinking', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '| A | B |\n| --- | --- |\n| one | 1 |\r\n| two | 2 |\n\n尾';
  const { runtime, view } = setup(raw);
  expect(applyTableCommand(view, 0, 'resize', { columns: 2, rows: 2, confirmShrink: true })).toBe(true);
  expect(runtime.getText()).toBe('| A | B |\n| --- | --- |\n| one | 1 |\r\n\n尾');
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
});

it('retains the scale input instance, value and focus during its own composition', async () => {
  const { dom, host, runtime } = setup('| A |\n| --- |\n| one |');
  host.querySelector<HTMLButtonElement>('[aria-label="调整表格规模"]')!.click();
  const field = host.querySelector<HTMLInputElement>('dialog [name=columns]')!;
  field.focus(); field.value = '3';
  field.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  await Promise.resolve();
  expect(field.isConnected).toBe(true); expect(document.activeElement).toBe(field);
  const dialog = host.querySelector('dialog')!;
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  dialog.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  expect(field.isConnected).toBe(true); expect(field.value).toBe('3');
  expect(runtime.getText()).toBe('| A |\n| --- |\n| one |');
  field.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(field.isConnected).toBe(false);
});

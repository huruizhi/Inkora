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

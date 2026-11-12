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

it('spec: resizes a valid single-column table with pipe-less body row', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '| A |\n| --- |\none\ntwo';
  const { runtime, view, host } = setup(raw);
  expect(host.querySelectorAll('tr')).toHaveLength(3);
  expect(applyTableCommand(view, 0, 'resize', { columns: 1, rows: 4 })).toBe(true);
  expect(runtime.getText()).toBe('| A |\n| --- |\none\ntwo\n|  |');
});

it('spec: keeps destination container prefixes when moving row payload', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '> | A | B |\r\n> | --- | --- |\r\n> | one | 1 |\r\n>  | two | 2 |';
  const { runtime, view } = setup(raw);
  let pos = -1; view.state.doc.descendants((node, at) => { if (node.type.name === 'table') pos = at; });
  expect(applyTableCommand(view, pos, 'move_row', { rowIndex: 2, targetIndex: 1 })).toBe(true);
  expect(runtime.getText()).toBe('> | A | B |\r\n> | --- | --- |\r\n> | two | 2 |\r\n>  | one | 1 |');
});

it('spec: reorders a table starting on the list marker line', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '- | A | C | B |\r\n  | --- | --- | --- |\r\n  | a | c | b |';
  const { runtime, view } = setup(raw);
  let pos = -1; view.state.doc.descendants((node, at) => { if (node.type.name === 'table') pos = at; });
  expect(pos).toBeGreaterThan(-1);
  expect(applyTableCommand(view, pos, 'move_column', { columnIndex: 2, targetIndex: 1 })).toBe(true);
  expect(runtime.getText()).toBe('- | A | B | C |\r\n  | --- | --- | --- |\r\n  | a | b | c |');
});

it('spec: keeps the surviving row EOL on a confirmed shrink', async () => {
  const { applyTableCommand } = await import('./table-editing');
  const raw = '| A | B |\n| --- | --- |\n| one | 1 |\r\n| two | 2 |\n\n尾';
  const { runtime, view } = setup(raw);
  expect(applyTableCommand(view, 0, 'resize', { columns: 2, rows: 2, confirmShrink: true })).toBe(true);
  expect(runtime.getText()).toBe('| A | B |\n| --- | --- |\n| one | 1 |\r\n\n尾');
});

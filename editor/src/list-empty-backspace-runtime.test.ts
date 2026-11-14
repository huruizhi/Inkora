import { JSDOM } from 'jsdom';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, expect, it } from 'vitest';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';

const previous = { document: globalThis.document, window: globalThis.window };
const live: EditorRuntime[] = [];
afterEach(() => {
  live.splice(0).forEach(runtime => runtime.destroy());
  Object.defineProperty(globalThis, 'document', { configurable: true, value: previous.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
});

function setup(raw: string) {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector('main')!;
  const runtime = createEditorRuntime(parent, raw, () => {});
  live.push(runtime);
  const press = (key: 'Enter' | 'Backspace') => {
    const event = new dom.window.KeyboardEvent('keydown', {
      key, keyCode: key === 'Enter' ? 13 : 8, bubbles: true, cancelable: true,
    });
    parent.querySelector('.ProseMirror')!.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const type = (text: string) => {
    for (const char of text) {
      const view = (runtime as unknown as { view: EditorView }).view;
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', handler =>
        handler(view, from, to, char, () => view.state.tr.insertText(char)));
      if (!handled) view.dispatch(view.state.tr.insertText(char));
    }
  };
  return { runtime, parent, press, type, currentView: () => (runtime as unknown as { view: EditorView }).view };
}

it.each([false, true])('deletes each empty line after an empty list, then its marker (typed=%s)', typed => {
  const { runtime, parent, press, type } = setup(typed ? '' : '- ');
  if (typed) type('- ');
  press('Enter');
  press('Enter');
  press('Enter');
  expect(runtime.getText()).toBe('- \n\n\n\n');
  for (const expected of ['- \n\n', '- ', '']) {
    expect(press('Backspace')).toBe(true);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
    expect(runtime.status.unresolved).toBe(false);
    expect(runtime.status.saveEligible).toBe(true);
  }
  expect(parent.querySelector('li')).toBeNull();
  for (let index = 0; index < 3; index++) expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('- \n\n\n\n');
  for (let index = 0; index < 3; index++) expect(runtime.redo()).toBe(true);
  type('继续');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '继续' });
  runtime.markSaved('继续');
  expect(runtime.status.dirty).toBe(false);
});

it('preserves the original BOM and CRLF suffix while deleting newly created blank lines', () => {
  const source = '\uFEFF- \r\n';
  const { runtime, press } = setup(source);
  press('Enter'); press('Enter'); press('Enter');
  expect(runtime.getText()).toBe('\uFEFF- ' + '\r\n'.repeat(5));
  for (const count of [3, 1]) {
    press('Backspace');
    expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF- ' + '\r\n'.repeat(count) });
  }
  expect(runtime.undo()).toBe(true);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('\uFEFF- ' + '\r\n'.repeat(5));
});

it.each(['+ ', '* ', '1. ', '1) '])('continues repeated blank-line deletion for %j', marker => {
  const { runtime, press } = setup(marker);
  for (let count = 0; count < 5; count++) press('Enter');
  expect(runtime.getText()).toBe(marker + '\n'.repeat(8));
  for (const count of [6, 4, 2, 0]) {
    press('Backspace');
    expect(runtime.snapshotText()).toEqual({ ok: true, value: marker + '\n'.repeat(count) });
  }
});

it('preserves previous content and accepts input at the surviving blank caret', () => {
  const source = '**保留**\r\n\r\n- ';
  const { runtime, press, type, currentView } = setup(source);
  const view = currentView();
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  press('Enter'); press('Enter'); press('Enter'); press('Backspace');
  type('X');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: source + '\r\n\r\nX' });
  expect(runtime.undo()).toBe(true); expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(source + '\r\n'.repeat(4));
  expect(runtime.redo()).toBe(true); expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(source + '\r\n\r\nX');
});

it.each(['selection', 'text'])('rejects a foreign %s attached to blank deletion and accepts the next correct edit', mutation => {
  const { runtime, press, currentView } = setup('- ');
  press('Enter'); press('Enter'); press('Enter');
  const raw = runtime.getText(), selection = { ...runtime.directedSelection };
  const view = currentView(), transaction = view.state.tr.delete(6, 8);
  if (mutation === 'selection') transaction.setSelection(TextSelection.create(transaction.doc, 3));
  else transaction.insertText('X', 3);
  view.dispatch(transaction);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.directedSelection).toEqual(selection);
  expect(runtime.status.unresolved).toBe(true);
  expect(runtime.snapshotText().ok).toBe(false);
  press('Backspace');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '- \n\n' });
});

it('rejects moving the caret to an earlier item while deleting the final blank paragraph', () => {
  const { runtime, press, currentView } = setup('- a\n- ');
  let view = currentView();
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  press('Enter'); press('Enter');
  const raw = runtime.getText();
  view = currentView();
  const caret = view.state.selection.$from;
  const transaction = view.state.tr.delete(caret.before(), caret.after());
  transaction.setSelection(TextSelection.create(transaction.doc, 3));
  view.dispatch(transaction);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status.unresolved).toBe(true);
  expect(runtime.snapshotText().ok).toBe(false);
  press('Backspace');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '- a\n- ' });
});

it.each(['', '正文', '**正文**', '# 标题'])('deletes newly-created EOF blank paragraphs after %j', source => {
  const { runtime, press, currentView } = setup(source);
  const view = currentView();
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  press('Enter'); press('Enter');
  expect(runtime.getText()).toBe(source + '\n'.repeat(4));
  press('Backspace');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: source + '\n\n' });
  press('Backspace');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: source });
});

it.each([
  ['正文\n   \n', 3, 3],
  ['\uFEFF\r\n   \r\n', 3, 3],
  ['- \n   \n', 3, 2],
  ['**正文**\r\n \t\r\n', 3, 3],
  ['# 标题\r\n \t\r\n', 3, 3],
] as const)('retains original blank-line whitespace through EOF edits: %j', (source, enters, backs) => {
  const { runtime, press, currentView } = setup(source);
  const view = currentView();
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  for (let count = 0; count < enters; count++) press('Enter');
  for (let count = 0; count < backs; count++) {
    press('Backspace');
    expect(runtime.snapshotText()).toEqual({ ok: true, value: runtime.getText() });
  }
  expect(runtime.getText()).toBe(source);
  expect(runtime.status.saveEligible).toBe(true);
});

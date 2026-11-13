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
  const runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  live.push(runtime);
  const view = (runtime as unknown as { view: EditorView }).view;
  function press(key: 'Enter' | 'Backspace') {
    const event = new dom.window.KeyboardEvent('keydown', {
      key, keyCode: key === 'Enter' ? 13 : 8, bubbles: true, cancelable: true,
    });
    view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  function startHeading() {
    let start = -1;
    view.state.doc.descendants((node, pos) => { if (start < 0 && node.type.name === 'heading') start = pos + 1; });
    expect(start).toBeGreaterThan(0);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
  }
  function evidence() {
    return JSON.stringify({ raw: runtime.getText(), status: runtime.status,
      selection: view.state.selection.toJSON(), doc: view.state.doc.toJSON(),
      diagnostic: (runtime as unknown as { session: { diagnostic: unknown } }).session.diagnostic });
  }
  return { runtime, view, dom, press, startHeading, evidence };
}

it.each([
  ['# 地方', '地方'],
  ['###### **地方** ###', '**地方**'],
  ['\n\n# 地方', '\n\n地方'],
  ['\uFEFF## 地方\r\n', '\uFEFF地方\r\n'],
  ['地方\r\n===\r\n', '地方\r\n'],
])('Backspace at the first heading start removes format without deleting its text: %j', (raw, expected) => {
  const { runtime, view, press, startHeading, evidence } = setup(raw);
  startHeading();
  expect(press('Backspace'), evidence()).toBe(true);
  expect(runtime.snapshotText(), evidence()).toEqual({ ok: true, value: expected });
  expect(view.state.doc.firstChild!.type.name).toBe('paragraph');
  expect(view.state.selection.head).toBe(1);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it.each([1, 3])('Backspace removes one empty line above a heading after %i start-Enter actions', count => {
  const raw = '\uFEFF# 地方\r\n\r\n- 后文\r\n';
  const { runtime, view, press, startHeading, evidence } = setup(raw);
  startHeading();
  for (let index = 0; index < count; index++) expect(press('Enter'), evidence()).toBe(true);
  const before = runtime.getText();
  expect(press('Backspace'), evidence()).toBe(true);
  const expected = '\uFEFF' + '\r\n\r\n'.repeat(count - 1) + raw.slice(1);
  expect(runtime.snapshotText(), evidence()).toEqual({ ok: true, value: expected });
  expect(view.state.selection.$from.parent.type.name).toBe('heading');
  expect(view.state.selection.$from.parentOffset).toBe(0);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(before);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it.each([
  ['上一行\r\n\r\n# 地方\r\n\r\n后文\r\n', '上一行地方\r\n\r\n后文\r\n'],
  ['**上一行**\n\n## 地方 ###\n', '**上一行**地方\n'],
  ['# 上一行 ##\n\n## 地方\n', '# 上一行地方 ##\n'],
  ['上一行\r\n===\r\n\r\n地方\r\n---\r\n', '上一行地方\r\n===\r\n'],
])('Backspace joins a heading start to the previous text block: %j', (raw, expected) => {
  const { runtime, view, press, startHeading, evidence } = setup(raw);
  let last = -1;
  view.state.doc.descendants((node, pos) => { if (node.type.name === 'heading') last = pos + 1; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, last)));
  expect(press('Backspace'), evidence()).toBe(true);
  expect(runtime.snapshotText(), evidence()).toEqual({ ok: true, value: expected });
  expect(view.state.selection.head).toBe(4);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});

it('keeps composition and selected-text deletion separate from heading boundary commands', async () => {
  const { runtime, view, dom, press, startHeading } = setup('# 地方');
  startHeading();
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  press('Backspace');
  expect(runtime.getText()).toBe('# 地方');
  expect(view.state.doc.firstChild!.type.name).toBe('heading');
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime.whenCompositionStable()).toBe(true);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 2)));
  press('Backspace');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '# 方' });
  expect(view.state.doc.firstChild!.type.name).toBe('heading');
});

it('rejects an unrelated text mutation bundled with heading format removal', () => {
  const raw = '# 地方\n\n后文';
  const { runtime, view, startHeading } = setup(raw);
  startHeading();
  const before = view.state.doc;
  const tr = view.state.tr.setNodeMarkup(0, view.state.schema.nodes.paragraph);
  tr.insertText('X', tr.doc.content.size - 1);
  view.dispatch(tr);
  expect(runtime.getText()).toBe(raw);
  expect(view.state.doc.eq(before)).toBe(true);
  expect(runtime.status.unresolved).toBe(true);
});

it('can repeatedly remove inserted blank lines, clear the heading and continue typing', () => {
  const raw = '\uFEFF# 地方\r\n\r\n- 后文\r\n';
  const { runtime, view, press, startHeading, evidence } = setup(raw);
  startHeading();
  for (let count = 0; count < 3; count++) press('Enter');
  const before = runtime.getText();
  for (let remaining = 2; remaining >= 0; remaining--) {
    press('Backspace');
    expect(runtime.snapshotText(), evidence()).toEqual({ ok: true,
      value: '\uFEFF' + '\r\n\r\n'.repeat(remaining) + raw.slice(1) });
  }
  press('Backspace');
  expect(runtime.snapshotText(), evidence()).toEqual({ ok: true, value: '\uFEFF地方\r\n\r\n- 后文\r\n' });
  view.dispatch(view.state.tr.insertText('新'));
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF新地方\r\n\r\n- 后文\r\n' });
  for (let count = 0; count < 5; count++) expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(before);
  for (let count = 0; count < 5; count++) expect(runtime.redo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF新地方\r\n\r\n- 后文\r\n' });
});

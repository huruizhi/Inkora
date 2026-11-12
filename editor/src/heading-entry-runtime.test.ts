import { afterEach, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';

let dom: JSDOM;
let runtime: EditorRuntime;
const previous = { window: globalThis.window, document: globalThis.document };
function boot(raw = '') {
  dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
}
function view(): EditorView { return (runtime as unknown as { view: EditorView }).view; }
function type(text: string) {
  for (const character of text) {
    const v = view(), { from, to } = v.state.selection;
    const tr = v.state.tr.insertText(character, from, to);
    if (!v.someProp('handleTextInput', handler => handler(v, from, to, character, () => tr))) v.dispatch(tr);
    expect(runtime.status.unresolved).toBe(false);
  }
}
function enter() {
  view().dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
}
afterEach(() => {
  runtime?.destroy(); dom?.window.close(); Object.assign(globalThis, previous);
});
it.each([1, 2, 3, 4, 5, 6])('shows a gray level %i marker until Enter, without changing source/history', level => {
  boot();
  const prefix = '#'.repeat(level) + ' ';
  type(prefix);
  const heading = view().dom.querySelector(`h${level}`)!;
  expect(heading?.classList.contains('inkora-heading-entry')).toBe(true);
  expect(heading?.getAttribute('data-heading-entry-marker')).toBe(prefix);
  expect(heading?.classList.contains('inkora-heading-entry-ready')).toBe(true);
  type('标题');
  expect(view().dom.querySelector(`h${level}`)).toBe(heading);
  expect(heading.textContent).toBe('标题');
  expect(runtime.getText()).toBe(prefix + '标题');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: prefix + '标题' });
  enter();
  expect(view().dom.querySelector('.inkora-heading-entry')).toBeNull();
  expect(view().dom.querySelector(`h${level}`)?.textContent).toBe('标题');
  expect(runtime.getText()).toBe(prefix + '标题\n');
  type('正文');
  expect(runtime.getText()).toBe(prefix + '标题\n正文');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(prefix + '标题\n正');
});
it('keeps a bare hash at entry size and returns unspaced text to a literal paragraph', () => {
  boot(); type('#');
  const heading = view().dom.querySelector('h1')!;
  expect(heading?.classList.contains('inkora-heading-entry')).toBe(true);
  expect(heading?.getAttribute('data-heading-entry-marker')).toBe('#');
  expect(heading?.classList.contains('inkora-heading-entry-ready')).toBe(false);
  type('文字');
  expect(view().dom.querySelector('h1')).toBeNull();
  expect(view().dom.querySelector('p')?.textContent).toBe('#文字');
  expect(runtime.getText()).toBe('#文字');
});
it('renders existing headings immediately', () => {
  boot('# 已有标题');
  expect(view().dom.querySelector('h1')?.textContent).toBe('已有标题');
  expect(view().dom.querySelector('.inkora-heading-entry')).toBeNull();
});

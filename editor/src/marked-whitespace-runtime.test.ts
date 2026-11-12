import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
import type { SourceAuthoritySession } from './source-authority';
const previous = { document: globalThis.document, window: globalThis.window };
let runtime: EditorRuntime | undefined;
afterEach(() => {
  runtime?.destroy();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: previous.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
});
it.each([
  ['> a', ''], ['**a** **a**', ''], ['> **a** **a**', ''], ['**bold**', ''], ['# **bold**', ''], ['*a*', ''], ['~~a~~', ''], ['***a***', ''],
  ['[a](./url \"title\")', ''], ['[**a**](./url)', ''], ['**[a](./url)**', ''],
  ['> **a**', ''], ['- **a**', ''], ['\uFEFF# **a**', ' ##\r\n\r\nkeep\r\n'],
  ['**a**', '\r\n===\r\n'], ['> [a](./url)', '\r\n'],
])('retains formatting and visible trailing spaces for %j + %j', (before, after) => {
  const raw = before + after;
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  let end = 0, label = '';
  let original: import('prosemirror-model').Fragment;
  view.state.doc.descendants((node, pos) => { if (!end && node.isTextblock) { end = pos + 1 + node.content.size; label = node.textContent; original = node.content; } });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
  for (let count = 1; count <= 3; count++) {
    view.dispatch(view.state.tr.insertText(' '));
    expect(runtime.getText(), session.diagnostic).toBe(before + ' '.repeat(count) + after);
    expect(view.dom.querySelector('h1,p')!.textContent).toBe(label + ' '.repeat(count));
    expect(runtime.status.unresolved).toBe(false);
    let block: import('prosemirror-model').Node | undefined;
    view.state.doc.descendants(node => { if (!block && node.isTextblock) block = node; });
    expect(block!.content.cut(0, original!.size).eq(original!)).toBe(true);
    expect(block!.lastChild!.marks).toEqual([]);
    expect(session.rawSelection.head).toBe(before.length + count);
    expect(view.state.selection.head).toBe(end + count);
  }
  expect(runtime.snapshotText()).toEqual({ ok: true, value: before + '   ' + after });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end + 2, end + 1)));
  expect(session.rawSelection.anchor).toBe(before.length + 2);
  expect(session.rawSelection.head).toBe(before.length + 1);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end + 3)));
  for (let remaining = 2; remaining >= 0; remaining--) {
    view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
    expect(runtime.getText(), session.diagnostic).toBe(before + ' '.repeat(remaining) + after);
    expect(view.dom.querySelector('h1,p')!.textContent).toBe(label + ' '.repeat(remaining));
  }
  for (let count = 0; count < 6; count++) expect(runtime.undo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
  for (let count = 0; count < 6; count++) expect(runtime.redo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
});
it.each(['> a', '**a**', '# **a**', '[a](./url "title")'])('continues with plain text after visible trailing spaces in %j', raw => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  let end = 0;
  view.state.doc.descendants((node, pos) => { if (node.isTextblock) end = pos + 1 + node.content.size; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
  for (const char of '   b') view.dispatch(view.state.tr.insertText(char));
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw + '   b' });
  let block: import('prosemirror-model').Node | undefined;
  view.state.doc.descendants(node => { if (!block && node.isTextblock) block = node; });
  expect(block!.textContent).toBe('a   b');
  expect(block!.lastChild!.marks).toEqual([]);
  for (let remaining = 3; remaining >= 0; remaining--) {
    view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
    expect(runtime.getText(), session.diagnostic).toBe(raw + ' '.repeat(remaining));
  }
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
});

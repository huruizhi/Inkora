import { TextSelection } from 'prosemirror-state';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { blockKeyBindings, clearEmptyHeading } from './block-editing';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
import type { SourceAuthoritySession } from './source-authority';
const previous = { document: globalThis.document, window: globalThis.window };
let runtime: EditorRuntime | undefined;
afterEach(() => {
  runtime?.destroy();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: previous.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
});
it.each(['#', '#a', '# a', 'a  b', ' a', '  ', '  a', '#  a'])('accepts uninterrupted input-rule API sequence %j', text => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, '', () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  const evidence: unknown[] = [];
  for (const character of text) {
    const { from, to } = view.state.selection;
    const tr = view.state.tr.insertText(character, from, to);
    const handled = view.someProp('handleTextInput', handler => handler(view, from, to, character, () => tr));
    if (!handled) view.dispatch(tr);
    evidence.push({ character, steps: tr.steps.map(step => step.toJSON()), selection: view.state.selection.toJSON(), raw: runtime.getText(), status: runtime.status, diagnostic: session.diagnostic, doc: view.state.doc.toJSON() });
  }
  expect(runtime.getText(), JSON.stringify(evidence)).toBe(text);
  expect(runtime.status.unresolved, JSON.stringify(evidence)).toBe(false);
});

it.each(['#'])('removes heading format through Backspace after %j', text => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, '', () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  for (const character of text) view.dispatch(view.state.tr.insertText(character));
  let steps: unknown;
  blockKeyBindings.Backspace(view.state, tr => { steps = tr.steps.map(step => step.toJSON()); view.dispatch(tr); }, view);
  expect(runtime.getText(), JSON.stringify({ steps, selection: view.state.selection.toJSON(), diagnostic: session.diagnostic, status: runtime.status })).toBe('');
});
it('deletes accepted visible spaces through a text ReplaceStep', () => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, '', () => {});
  const { view } = runtime as unknown as { view: EditorView };
  for (const character of '  ') view.dispatch(view.state.tr.insertText(character));
  for (let index = 0; index < 2; index++) view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
  expect(runtime.getText()).toBe('');
  expect(runtime.status.unresolved).toBe(false);
});
it.each(['', '\uFEFF\r\n', '\uFEFF\r\n\r\n', '之前\r\n\r\n正文\r\n'])('keeps visible consecutive spaces with byte-preserving history for %j', raw => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  const initial = session.rawSelection.head;
  const inserted = raw ? '   字' : 'a   b';
  let typed = '';
  for (const character of inserted) {
    view.dispatch(view.state.tr.insertText(character));
    typed += character;
    expect(view.state.doc.firstChild!.textContent).toBe(typed + (raw.startsWith('之前') ? '之前' : ''));
    expect(view.dom.firstElementChild!.textContent).toBe(view.state.doc.firstChild!.textContent);
    expect(session.rawSelection).toEqual({ anchor: initial + typed.length, head: initial + typed.length, affinity: 'right' });
  }
  const expected = raw.slice(0, initial) + inserted + raw.slice(initial);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
  expect(runtime.status.saveEligible).toBe(true);
  for (const _ of inserted) expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  for (const _ of inserted) expect(runtime.redo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
  // A directed selection inside the retained spaces must map to their exact source bytes.
  const activeView = (runtime as unknown as { view: EditorView }).view;
  activeView.dispatch(activeView.state.tr.setSelection(TextSelection.create(activeView.state.doc, 3, 2)));
  expect(session.rawSelection.anchor).toBe(initial + 2);
  expect(session.rawSelection.head).toBe(initial + 1);
});
it('clears the empty heading and continues typing with undo and redo', () => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, '\uFEFF\r\n', () => {});
  const { view } = runtime as unknown as { view: EditorView };
  view.dispatch(view.state.tr.insertText('#'));
  expect(blockKeyBindings.Backspace(view.state, view.dispatch, view)).toBe(true);
  view.dispatch(view.state.tr.insertText('正文'));
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF正文\r\n' });
  expect(runtime.undo()).toBe(true);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('\uFEFF#\r\n');
  expect(runtime.redo()).toBe(true);
  expect(runtime.redo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF正文\r\n' });
});

it('does not clear a composing or nonempty heading', () => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, '#', () => {});
  const { view } = runtime as unknown as { view: EditorView };
  expect(clearEmptyHeading(view.state, view.dispatch, { composing: true } as EditorView)).toBe(false);
  view.dispatch(view.state.tr.insertText('字'));
  expect(clearEmptyHeading(view.state, view.dispatch, view)).toBe(false);
  expect(runtime.getText()).toBe('#字');
});
it.each(['a  \nb', '    code', '**marked**', '# title'])('keeps canonical structure intact for %j', raw => {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  const { view } = runtime as unknown as { view: EditorView };
  const before = view.state.doc.toJSON();
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
  expect(view.state.doc.toJSON()).toEqual(before);
  if (raw.startsWith('a')) expect(view.state.doc.firstChild!.child(1).type.name).toBe('hard_break');
  if (raw.startsWith('    ')) expect(view.state.doc.firstChild!.type.name).toBe('code_block');
  if (raw.startsWith('**')) expect(view.state.doc.firstChild!.firstChild!.marks[0].type.name).toBe('strong');
});

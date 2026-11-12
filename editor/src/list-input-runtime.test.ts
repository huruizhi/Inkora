import { JSDOM } from 'jsdom';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, expect, it } from 'vitest';
import { buildSourceLedger, visualToSource } from './source-ledger';
import { listBoundaryBackspace } from './block-editing';
import { parse } from './source-document';
import { planNativeTransaction } from './source-transaction';
import { createInkoraProjectionState } from './editor-session';
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
  const view = (runtime as unknown as { view: EditorView }).view;
  return { runtime, view, parent, dom };
}
function type(view: EditorView, text: string) {
  for (const char of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', handler => handler(view, from, to, char, () => view.state.tr.insertText(char)));
    if (!handled) view.dispatch(view.state.tr.insertText(char));
  }
}
function evidence(runtime: EditorRuntime, view: EditorView) {
  return JSON.stringify({ raw: runtime.getText(), selection: view.state.selection.toJSON(), status: runtime.status, diagnostic: (runtime as unknown as { session: { diagnostic: string } }).session.diagnostic, doc: view.state.doc.toJSON() });
}
it.each(['- a', '上\n\n- a', '- a\n- b'])('Backspace removes first-character list indentation for %j', raw => {
  const { runtime, view, dom } = setup(raw);
  let pos = 0;
  view.state.doc.descendants((node, at) => { if (node.isText) pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText(), evidence(runtime, view)).not.toBe(raw);
});
it('creates a checkbox while typing a standard task item', () => {
  const { runtime, view, parent } = setup('');
  type(view, '- [ ] ');
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(parent.querySelector('input[type=checkbox]'), evidence(runtime, view)).not.toBeNull();
});

it.each(['- [ ]', '- [ ] ', '- [ ] a'])('types and toggles standard task %j', typed => {
  const { runtime, view, parent, dom } = setup('');
  type(view, typed);
  const input = parent.querySelector<HTMLInputElement>('input[type=checkbox]');
  expect(input, evidence(runtime, view)).not.toBeNull();
  expect(runtime.getText()).toBe(typed);
  input!.click();
  expect(runtime.getText(), evidence(runtime, view)).toBe(typed.replace('[ ]', '[x]'));
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(typed);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText(), evidence(runtime, view)).toBe(typed.replace('[ ]', '[x]'));
  parent.querySelector('input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe(typed);
  expect(runtime.status.unresolved).toBe(false);
});
it.each(['Enter', 'Backspace'])('exits a newly-created empty list item with %s then merges backward', key => {
  const { runtime, view, dom } = setup('上\n\n- a');
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)));
  const press = (value: string) => view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, keyCode: value === 'Enter' ? 13 : 8, bubbles: true, cancelable: true }));
  press('Enter');
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText(), evidence(runtime, view)).toBe('上\n\n- a\n- ');
  press(key);
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
  expect(view.state.selection.$from.depth).toBe(1);
  press('Backspace');
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
});
it.each(['- a', '上\n\n- a', '- a\n- b', '\uFEFF上\r\n\r\n- a\r\n'])('keeps list boundary deletion reversible: %j', raw => {
  const { runtime, view, dom } = setup(raw);
  let pos = 0;
  view.state.doc.descendants((node, at) => { if (node.isText) pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  const result = runtime.getText();
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(result).not.toBe(raw);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect((runtime as unknown as { view: EditorView }).view.state.selection.anchor).toBe(pos);
  expect((runtime as unknown as { view: EditorView }).view.state.selection.head).toBe(pos);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(result);
});
it.each(['\uFEFF- [ ]\r\n', '- [X]', '- [ ]\n- [ ]'])('toggles the owned empty task without rewriting other bytes: %j', raw => {
  const { runtime, parent, dom } = setup(raw);
  const inputs = parent.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
  const input = inputs[inputs.length - 1];
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  const offset = raw.lastIndexOf('[') + 1;
  const expected = raw.slice(0, offset) + (raw[offset] === ' ' ? 'x' : ' ') + raw.slice(offset + 1);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});
it('does not accept unrelated text under task toggle metadata', () => {
  const { runtime, view } = setup('- [ ] a\n\n后');
  const tr = view.state.tr.setNodeMarkup(1, undefined, { task: true, checked: true, stateChar: 'x' });
  tr.insertText('X', tr.doc.content.size - 1).setMeta('inkoraTaskToggle', { pos: 1, checked: true });
  view.dispatch(tr);
  expect(runtime.getText()).toBe('- [ ] a\n\n后');
  expect(runtime.status).toMatchObject({ unresolved: true, canUndo: false });
});
it('does not accept empty-paragraph metadata that deletes a nonempty paragraph', () => {
  const { runtime, view } = setup('- a\n\n后');
  const tr = view.state.tr.delete(7, view.state.doc.content.size).setMeta('inkoraEmptyParagraphAfterList', true);
  view.dispatch(tr);
  expect(runtime.getText()).toBe('- a\n\n后');
  expect(runtime.status).toMatchObject({ unresolved: true, canUndo: false });
});
it('does not reinterpret bare checkbox syntax or code as tasks', () => {
  const { parent } = setup('[ ]\n\n`- [ ]`');
  expect(parent.querySelector('input')).toBeNull();
});
it.each([
  { raw: '- [ ]  ', label: ' ', marked: false },
  { raw: '- [ ] ', label: ' ', marked: true },
  { raw: '- [ ] \n\n后', label: ' ', marked: false },
])('rejects unsupported empty-task projection differences: %j', ({ raw, label, marked }) => {
  const canonical = parse(raw).doc;
  let state = createInkoraProjectionState(canonical);
  const text = state.schema.text(label, marked ? [state.schema.marks.strong.create()] : []);
  state = createInkoraProjectionState(state.tr.replaceWith(3, 3, text).doc);
  const tr = state.tr.setNodeMarkup(1, undefined, { task: true, checked: true, stateChar: 'x' })
    .setMeta('inkoraTaskToggle', { pos: 1, checked: true });
  expect(() => planNativeTransaction(raw, state, [], tr, () => 5)).toThrow();
});
it('continues Backspace from a lifted list item into the previous paragraph', () => {
  const { runtime, view, dom } = setup('上\n\n- a');
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));
  for (let count = 0; count < 2; count++) {
    view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  }
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '上a' });
  expect(view.state.selection.head).toBe(2);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('上\n\na');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('上\n\n- a');
});
it('removes a task marker on Backspace without leaving checkbox chrome', () => {
  const { runtime, view, parent, dom } = setup('- [ ] a');
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.snapshotText()).toEqual({ ok: true, value: 'a' });
  expect(parent.querySelector('input')).toBeNull();
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('- [ ] a');
  expect(parent.querySelector('input')).not.toBeNull();
});
it.each([
  ['1. a\n2. b', 'b'],
  ['- a\n  - b', 'b'],
  ['- a\n- b\n- c', 'b'],
])('lifts list boundaries in %j at %j', (raw, text) => {
  const { runtime, view, dom } = setup(raw);
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === text) pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText()).not.toBe(raw);
});
it.each(['- a\n- \n', '\uFEFF- a\r\n- \r\n', '- a\n- [ ]\n'])('exits the final empty item while preserving EOL bytes: %j', raw => {
  const { runtime, view, dom } = setup(raw);
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.type.name === 'paragraph' && node.content.size === 0) pos = at + 1; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText()).not.toBe(raw);
});

it.each(['- a\n- ', '\uFEFF- a\r\n\r\n  * \r\n', '- \n- [ ]'])('maps empty list owners after other items: %j', raw => {
  const parsed = parse(raw);
  const result = buildSourceLedger(raw, parsed.doc, parsed.ranges, parsed.tokenEvidence);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return;
  const empty: number[] = [];
  parsed.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size === 0) empty.push(pos + 1); });
  for (const pos of empty) {
    const mapped = visualToSource(result.ledger, pos, pos);
    expect(mapped.ok, JSON.stringify(mapped)).toBe(true);
  }
});
it('rejects list owner count mismatches in accepted evidence', () => {
  const raw = '- a\n- ';
  const parsed = parse(raw);
  const evidence = { ...parsed.tokenEvidence, tokens: parsed.tokenEvidence.tokens.filter(token => token.type !== 'list_item_open') };
  expect(buildSourceLedger(raw, parsed.doc, parsed.ranges, evidence).ok).toBe(false);
});

it('does not invent an insertion anchor for a schema-only paragraph before setext', () => {
  const raw = '- a\n  - \n';
  const parsed = parse(raw);
  const result = buildSourceLedger(raw, parsed.doc, parsed.ranges, parsed.tokenEvidence);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) expect(visualToSource(result.ledger, 3, 3).ok).toBe(false);
});
it('deletes the final list character without a semantic mismatch', () => {
  const { runtime, view } = setup('上一段\n\n- 项\n');
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === '项') pos = at; });
  view.dispatch(view.state.tr.delete(pos, pos + 1));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '上一段\n\n- \n' });
});

it.each([
  ['- \n', true],
  ['1. \n', true],
  ['- [ ]\n', true],
  ['- \n- a', true],
  ['- \n\n- a', false],
  ['- a\n\n- b', false],
  ['- a\n  - nested\n\n  - next', true],
  ['- \n\nplain', true],
])('derives tightness from only the current list paragraphs: %j', (raw, expected) => {
  expect(parse(raw).doc.firstChild!.attrs.tight).toBe(expected);
});
it('deletes all list text, lifts, and merges into the previous paragraph', () => {
  const { runtime, view, dom } = setup('上一段\n\n- 项\n');
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === '项') pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
  view.dispatch(view.state.tr.delete(pos, pos + 1));
  for (let count = 0; count < 2; count++) {
    view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
    expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  }
  expect(view.state.doc.childCount).toBe(1);
  expect(view.state.selection.head).toBe(4);
  view.dispatch(view.state.tr.delete(3, 4));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(view.state.doc.textContent).toBe('上一');
});
it.each(['- a\n\n- b', '> - b', '> - a\n>\n> - b'])('lifts loose and quoted list boundaries: %j', raw => {
  const { runtime, view, dom } = setup(raw);
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText) pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText()).not.toBe(raw);
});
it.each([
  ['- a\n\n- b', '- a\n\nb'],
  ['> - b', '> b'],
  ['> - a\n>\n> - b', '> - a\n>\n> b'],
  ['\uFEFF> > - b\r\n', '\uFEFF> > b\r\n'],
  ['- a\n\n- b\n\n- c', '- a\n\nb\n\n- c'],
])('preserves surrounding bytes and source history on lift: %j', (raw, expected) => {
  const { runtime, view, dom } = setup(raw);
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === 'b') pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.snapshotText(), evidence(runtime, view)).toEqual({ ok: true, value: expected });
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});
it('continues backward from a quoted list through the quote boundary', () => {
  const { runtime, view, dom } = setup('> - b');
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
  for (let count = 0; count < 2; count++) view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.snapshotText(), evidence(runtime, view)).toEqual({ ok: true, value: 'b' });
});
it.each(['> - [ ]', '> - [ ] ', '> - [ ] label'])('toggles quoted task with exact owner: %j', raw => {
  const { runtime, parent } = setup(raw);
  parent.querySelector<HTMLInputElement>('input')!.click();
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw.replace('[ ]', '[x]') });
});
it('continues from a lifted quoted list into its previous quoted paragraph', () => {
  const { runtime, view, dom } = setup('> a\n>\n> - b');
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === 'b') pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  for (let count = 0; count < 2; count++) {
    view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  }
  expect(runtime.snapshotText(), evidence(runtime, view)).toEqual({ ok: true, value: '> ab' });
});

it('rejects mixed text under list lift metadata', () => {
  const raw = '- a\n\n- b';
  const { runtime, view } = setup(raw);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)));
  expect(listBoundaryBackspace(view.state, tr => {
    view.dispatch(tr.insertText('X', tr.doc.content.size - 1));
  }, view)).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toMatchObject({ unresolved: true, canUndo: false });
});
it('joins adjacent quoted paragraphs without rewriting BOM or CRLF', () => {
  const raw = '\uFEFF> > a\r\n> >\r\n> > - b\r\n';
  const { runtime, view, dom } = setup(raw);
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.isText && node.text === 'b') pos = at; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  for (let count = 0; count < 2; count++) view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.snapshotText()).toEqual({ ok: true, value: '\uFEFF> > ab\r\n' });
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw.replace('- b', 'b'));
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});
it('lifts an empty final task inside a quote after a previous paragraph', () => {
  const { runtime, view, dom } = setup('> a\n>\n> - [ ]\n');
  let pos = -1;
  view.state.doc.descendants((node, at) => { if (node.type.name === 'paragraph' && node.content.size === 0) pos = at + 1; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
});
it('continues from a lifted loose item into the previous list paragraph', () => {
  const { runtime, view, dom } = setup('- a\n\n- b');
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)));
  for (let count = 0; count < 2; count++) view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
  expect(runtime.snapshotText(), evidence(runtime, view)).toEqual({ ok: true, value: '- ab' });
  expect(view.state.selection.head).toBe(4);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('- a\n\nb');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe('- a\n\n- b');
});
it.each(['- a\n\n  more\n\nb', '- a\n\n---\n\nb'])('declines list paragraph join outside its owner shape: %j', raw => {
  const { runtime, view } = setup(raw);
  const pos = view.state.doc.content.size - 2;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  expect(listBoundaryBackspace(view.state, view.dispatch, view)).toBe(false);
  expect(runtime.getText()).toBe(raw);
});
it('rejects mixed edits under paragraph-after-list metadata', () => {
  const raw = '- a\n\nb';
  const { runtime, view } = setup(raw);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)));
  expect(listBoundaryBackspace(view.state, tr => view.dispatch(tr.insertText('X', 3)), view)).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status.unresolved).toBe(true);
});

it('keeps a typed bare bullet literal until space, then continues and exits the list', () => {
  const { runtime, view, dom, parent } = setup('');
  type(view, '-');
  expect(parent.querySelector('ul')).toBeNull();
  expect(view.state.doc.firstChild!.type.name).toBe('paragraph');
  expect(runtime.getText()).toBe('-');
  type(view, ' ');
  expect(parent.querySelector('ul')).not.toBeNull();
  expect(view.state.doc.firstChild!.firstChild!.firstChild!.content.size).toBe(0);
  type(view, '读书');
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText()).toBe('- 读书\n- ');
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'Backspace',keyCode:8,bubbles:true,cancelable:true}));
  expect(runtime.status.unresolved, evidence(runtime, view)).toBe(false);
  expect(runtime.getText()).toBe('- 读书\n\n');
  type(view, '正文');
  expect(runtime.getText()).toBe('- 读书\n\n正文');
});

it.each(['-', '+', '*'])('activates a typed %j only after space and preserves literal continuations', marker => {
  const {runtime,view,parent}=setup('');
  type(view,marker);
  expect(parent.querySelector('ul')).toBeNull();
  expect(runtime.snapshotText()).toEqual({ok:true,value:marker});
  type(view,' ');
  expect(parent.querySelector('ul')).not.toBeNull();
  expect(runtime.status.unresolved).toBe(false);
  type(view,'a');
  expect(runtime.snapshotText()).toEqual({ok:true,value:marker+' a'});
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(marker+' ');
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(marker);
  expect(parent.querySelector('ul')).toBeNull();
});
it.each(['-', '+', '*'])('keeps existing file syntax canonical for %j', marker => {
  const {runtime,parent}=setup(marker);
  expect(parent.querySelector('ul')).not.toBeNull();
  expect(runtime.snapshotText()).toEqual({ok:true,value:marker});
});
it.each(['-a','+a','*a','**a**'])('keeps a non-list literal typed as %j', text => {
  const {runtime,view,parent}=setup('');type(view,text);
  expect(parent.querySelector('ul')).toBeNull();
  expect(runtime.snapshotText()).toEqual({ok:true,value:text});
});

it.each(['-', '+', '*'])('allows Enter after an uncompleted %j without activating a list', marker => {
  const {runtime,view,parent,dom}=setup('');type(view,marker);
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  expect(runtime.status.unresolved,evidence(runtime,view)).toBe(false);
  expect(runtime.snapshotText()).toEqual({ok:true,value:marker+'\n\n'});
  expect(parent.querySelector('ul')).toBeNull();
  type(view,'after');
  expect(runtime.snapshotText()).toEqual({ok:true,value:marker+'\n\nafter'});
});

it.each(['- ', '# 水电费\n\n- 水电费\n- 第三方\n- '])('creates an empty item on first Enter then exits on consecutive Enter in %j', raw => {
  const {runtime,view,dom}=setup(raw);
  let at=-1;view.state.doc.descendants((node,pos)=>{if(node.type.name==='paragraph' && node.content.size===0)at=pos+1;});
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));
  const before=view.dom.querySelectorAll('li').length;
  const enter=()=>view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  enter();
  expect(runtime.status.unresolved,evidence(runtime,view)).toBe(false);
  expect(view.dom.querySelectorAll('li').length).toBe(before+1);
  expect(runtime.getText()).toBe(raw+'\n- ');
  enter();
  expect(runtime.status.unresolved,evidence(runtime,view)).toBe(false);
  expect(view.dom.querySelectorAll('li').length).toBe(before);
  expect(view.state.selection.$from.depth).toBe(1);
  expect(runtime.getText()).toBe(raw+'\n\n');
  type(view,'正文');
  expect(runtime.snapshotText()).toEqual({ok:true,value:raw+'\n\n正文'});
});
it.each([
  ['- ','- \n- ','- \n\n'],
  ['\uFEFF- \r\n','\uFEFF- \r\n- \r\n','\uFEFF- \r\n\r\n\r\n'],
  ['1. ','1. \n1. ','1. \n\n'],
])('retains exact source bytes across two Enters: %j', (raw,first,second)=>{
  const {runtime,view,dom}=setup(raw);let at=-1;
  view.state.doc.descendants((node,pos)=>{if(node.type.name==='paragraph'&&node.content.size===0)at=pos+1;});
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));
  const enter=()=>view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  enter();expect(runtime.snapshotText(),evidence(runtime,view)).toEqual({ok:true,value:first});
  enter();expect(runtime.snapshotText(),evidence(runtime,view)).toEqual({ok:true,value:second});
  expect(runtime.undo()).toBe(true);expect(runtime.getText()).toBe(first);
  expect(runtime.undo()).toBe(true);expect(runtime.getText()).toBe(raw);
});
it.each(['selection','pointer','arrow','composition','edit'] as const)('resets the Enter sequence on %s',action=>{
  const {runtime,view,dom}=setup('- ');
  const enter=()=>view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  enter();
  if(action==='selection'){
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,3)));
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  }else if(action==='pointer')view.dom.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));
  else if(action==='arrow')view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  else if(action==='composition'){
    // The public UI event resets only the gesture; native composition itself
    // has dedicated WK coverage and must not be fabricated as text here.
    view.someProp('handleDOMEvents',handlers=>{handlers.compositionstart?.(view,new dom.window.CompositionEvent('compositionstart'));return false;});
  }else{type(view,'x');view.dispatch(view.state.tr.delete(view.state.selection.head-1,view.state.selection.head));}
  enter();expect(runtime.status.unresolved,evidence(runtime,view)).toBe(false);
  expect(view.dom.querySelectorAll('li').length).toBe(3);
});
it('does not restore a consecutive Enter gesture through Undo and a rebuilt view',()=>{
  const {runtime,view,dom}=setup('- ');
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  type(view,'x');expect(runtime.undo()).toBe(true);
  const current=(runtime as unknown as {view:EditorView}).view;
  current.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  expect(runtime.status.unresolved,evidence(runtime,current)).toBe(false);
  expect(current.dom.querySelectorAll('li').length).toBe(3);
});

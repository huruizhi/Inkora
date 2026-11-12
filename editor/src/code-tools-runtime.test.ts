import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
import { CODE_LANGUAGES, highlightCodeSpans, resolveHighlightLanguageId } from './code-highlighting';
import type { EditorView } from 'prosemirror-view';
const original = { document: globalThis.document, window: globalThis.window };
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  Object.defineProperty(globalThis, 'document', { configurable: true, value: original.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: original.window });
});
function open(raw: string, storage = true) {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true, ...(storage ? { url: 'https://inkora.test/' } : {}) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  const host = document.querySelector('main')!;
  const runtime: EditorRuntime = createEditorRuntime(host, raw, () => {});
  const view = (runtime as unknown as { view: EditorView }).view;
  cleanup.push(() => { runtime.destroy(); dom.window.close(); });
  return { dom, host, runtime, view };
}
it('ships a concrete offline language catalog and representative newly supported grammars', () => {
  open('');
  expect(CODE_LANGUAGES).toHaveLength(193);
  for (const [id, code] of [['java', 'public class Demo {}'], ['cpp', 'int main() { return 0; }'],
    ['vbnet', 'Dim answer As Integer = 42'], ['vhdl', 'entity demo is end demo;'], ['kotlin', 'fun main() = println("hi")']]) {
    expect(resolveHighlightLanguageId(id)).toBe(id);
    expect(highlightCodeSpans(code, id).length).toBeGreaterThan(0);
  }
  expect(resolveHighlightLanguageId('vb')).toBe('vbnet');
  expect(resolveHighlightLanguageId('made-up-language')).toBeNull();
});

it('filters language prefixes without edits and confirms one exact fence-token change', () => {
  const raw = '\uFEFF前\r\n\r\n~~~js\t title=demo\r\nconst x = 1;\r\n~~~\r\n';
  const { dom, host, runtime } = open(raw);
  const before = runtime.status;
  const input = host.querySelector<HTMLInputElement>('[role=combobox][aria-label="搜索代码语言"]')!;
  expect(input).not.toBeNull(); input.focus(); input.value = 'v';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const choices = [...document.querySelectorAll<HTMLElement>('[role=option]')];
  expect(choices.map(choice => choice.dataset.language)).toEqual(expect.arrayContaining(['vbnet', 'vbscript', 'verilog', 'vhdl']));
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before);
  choices.find(choice => choice.dataset.language === 'vhdl')!.click();
  const expected = raw.replace('~~~js', '~~~vhdl');
  expect(runtime.getText()).toBe(expected); expect(runtime.status.saveEligible).toBe(true);
  expect(runtime.undo()).toBe(true); expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true); expect(runtime.getText()).toBe(expected);
});

it('toggles line numbers as a shared display preference without changing directed selection or history', () => {
  const raw = '\uFEFF```js\r\none\r\ntwo\r\n```\r\n\r\n```unknown\r\nx\r\n```';
  const { host, runtime } = open(raw);
  const before = runtime.status; const selection = runtime.directedSelection;
  const button = host.querySelector<HTMLButtonElement>('[aria-label="显示代码行号"]')!;
  expect(button).not.toBeNull(); button.click();
  expect([...host.querySelectorAll<HTMLElement>('.code-line-numbers')].map(gutter => gutter.textContent)).toEqual(['1\n2', '1']);
  expect(runtime.getText()).toBe(raw); expect(runtime.status).toEqual(before); expect(runtime.directedSelection).toEqual(selection);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  button.click();
  expect([...host.querySelectorAll<HTMLElement>('.code-line-numbers')].every(gutter => gutter.hidden)).toBe(true);
  expect(runtime.status).toEqual(before);
});

it('uses keyboard completion, cancels without edits and rejects detached or stale candidates', () => {
  const raw = '```js\nconst x = 1;\n```';
  const { host, runtime, dom, view } = open(raw);
  const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
  input.focus(); input.value = 'py'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(document.querySelector<HTMLElement>('[role=listbox]')!.hidden).toBe(true); expect(runtime.getText()).toBe(raw);
  input.focus(); input.value = 'py'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const stale = document.querySelector<HTMLButtonElement>('[data-language=python]')!;
  let pos = 0; view.state.doc.descendants((node, at) => { if (node.type.name === 'code_block') pos = at + 1; });
  view.dispatch(view.state.tr.insertText('new ', pos));
  const edited = runtime.getText(); stale.click(); expect(runtime.getText()).toBe(edited);
  input.focus(); input.value = 'py'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe(edited.replace('```js', '```python'));
  const selected = runtime.getText(); runtime.destroy(); stale.click(); expect(runtime.getText()).toBe(selected);
});

it('keeps query text outside source while blocking commands until composition settles', async () => {
  const raw = '```js\nx\n```';
  const { host, runtime, dom } = open(raw);
  const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
  input.focus(); input.value = 'py';
  input.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(document.activeElement).toBe(input); expect(input.value).toBe('py'); expect(runtime.getText()).toBe(raw);
  expect(runtime.composing).toBe(true);
  input.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(runtime.getText()).toBe(raw);
  await new Promise(resolve => setTimeout(resolve, 130));
  expect(runtime.composing).toBe(false);
  document.querySelector<HTMLButtonElement>('[data-language=python]')!.click();
  expect(runtime.getText()).toBe('```python\nx\n```');
});

it('keeps line numbers current through real code edits and history while preserving the code DOM', () => {
  const { host, runtime, view } = open('```js\none\n```');
  const code = host.querySelector('pre code')!;
  host.querySelector<HTMLButtonElement>('[aria-label="显示代码行号"]')!.click();
  let pos = 0; view.state.doc.descendants((node, at) => { if (node.type.name === 'code_block') pos = at + 1; });
  view.dispatch(view.state.tr.insertText('\ntwo\n', pos + 3));
  expect(host.querySelector('pre code')).toBe(code);
  expect(host.querySelector('.code-line-numbers')!.textContent).toBe('1\n2\n3');
  expect(runtime.getText()).toBe('```js\none\ntwo\n\n```');
  expect(runtime.undo()).toBe(true);
  expect(host.querySelector('.code-line-numbers')!.textContent).toBe('1');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="显示代码行号"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(runtime.redo()).toBe(true);
  expect(host.querySelector('.code-line-numbers')!.textContent).toBe('1\n2\n3');
});

it('does not toggle line layout during document composition or from a detached control', () => {
  const { host, runtime, dom, view } = open('```js\nx\n```');
  const button = host.querySelector<HTMLButtonElement>('[aria-label="显示代码行号"]')!;
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  button.click(); expect(button.getAttribute('aria-pressed')).toBe('false');
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  runtime.destroy(); button.click(); expect(button.getAttribute('aria-pressed')).toBe('false');
});

it('keeps an in-memory display preference when storage is unavailable and a new runtime is created', () => {
  const raw = '```\n\n```';
  const { host, runtime } = open(raw, false);
  const toggle = host.querySelector<HTMLButtonElement>('[aria-label="显示代码行号"]')!;
  toggle.click(); expect(host.querySelector('.code-line-numbers')!.textContent).toBe('1');
  runtime.destroy();
  const next = createEditorRuntime(host, raw, () => {});
  expect(host.querySelector<HTMLElement>('.code-line-numbers')!.hidden).toBe(false);
  expect(next.getText()).toBe(raw); expect(next.status.dirty).toBe(false); next.destroy();
});

it('offers exact aliases before longer prefix matches and caps the empty result list', () => {
  const { host, dom } = open('```\nx\n```');
  const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
  input.focus(); expect(document.querySelectorAll('[role=option]')).toHaveLength(30);
  input.value = 'xht'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  expect(document.querySelector<HTMLButtonElement>('[data-language=xml]')).not.toBeNull();
  input.value = 'py'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  expect(document.querySelector<HTMLElement>('[role=option][aria-selected=true]')!.dataset.language).toBe('python');
});

it('retains the existing Mermaid choice in language search as well as the native select', () => {
  const { host, dom, runtime } = open('```js\ngraph TD; A-->B\n```');
  const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
  input.focus(); input.value = 'merm'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const choice = document.querySelector<HTMLButtonElement>('[role=option][data-language=mermaid]');
  expect(choice).not.toBeNull(); choice!.click();
  expect(runtime.getText()).toBe('```mermaid\ngraph TD; A-->B\n```');
});

it('does not revive a removed candidate with the binding of a newer query', () => {
  const { host, runtime, dom } = open('```js\nx\n```');
  const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
  input.focus(); input.value = 'py'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const old = document.querySelector<HTMLButtonElement>('[data-language=python]')!;
  input.value = 'rust'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  expect(old.isConnected).toBe(false); const before = runtime.status;
  old.click(); expect(runtime.getText()).toBe('```js\nx\n```'); expect(runtime.status).toEqual(before);
  expect(document.querySelector<HTMLElement>('[role=listbox]')!.hidden).toBe(false);
});

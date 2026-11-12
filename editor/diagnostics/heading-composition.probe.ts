import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime, type EditorRuntime } from '../src/editor-runtime';
import type { SourceAuthoritySession } from '../src/source-authority';
const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
let runtime: EditorRuntime | undefined;
let dom: JSDOM | undefined;
afterEach(() => {
  runtime?.destroy();
  dom?.window.close();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: previous.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: previous.getComputedStyle });
});
it.each(['', '#', '# '])('diagnoses DOM composition candidate lifetime after %j', async raw => {
  dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  // jsdom has no layout; geometry shims support PM's selection scrolling only.
  dom.window.Range.prototype.getClientRects = () => [new dom!.window.DOMRect()] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom!.window.DOMRect();
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  const { view, session } = runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
  // One initial focus. Subsequent selection changes model native insertion, never refocus/rebuild.
  view.dom.style.whiteSpace = 'pre-wrap';
  view.focus();
  const evidence: unknown[] = [];
  const record = (phase: string, candidate?: Text) => evidence.push({ phase, candidateConnected: candidate?.isConnected,
    dom: view.dom.innerHTML, projection: view.state.doc.toJSON(), raw: runtime!.getText(),
    rawSelection: session.rawSelection, selection: view.state.selection.toJSON(),
    domSelection: { node: dom!.window.getSelection()?.anchorNode?.nodeName, offset: dom!.window.getSelection()?.anchorOffset },
    status: runtime!.status, diagnostic: session.diagnostic, composing: runtime!.composing, viewComposing: view.composing });
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  const block = view.dom.querySelector('h1,p')!;
  block.querySelector('br')?.remove();
  const candidate = dom.window.document.createTextNode('zh');
  block.appendChild(candidate);
  dom.window.getSelection()!.collapse(candidate, 2);
  view.dom.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'zh', isComposing: true }));
  await new Promise(resolve => dom!.window.setTimeout(resolve, 20));
  record('candidate', candidate);
  candidate.replaceData(0, candidate.length, '中');
  if (candidate.isConnected) dom.window.getSelection()!.collapse(candidate, 1);
  view.dom.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '中', isComposing: true }));
  await new Promise(resolve => dom!.window.setTimeout(resolve, 20));
  record('confirmed-before-end', candidate);
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '中' }));
  await runtime.whenCompositionStable();
  record('settled', candidate);
  console.log(JSON.stringify({ raw, evidence }));
  expect((evidence[0] as { candidateConnected: boolean }).candidateConnected, JSON.stringify(evidence)).toBe(true);
  expect((evidence[1] as { candidateConnected: boolean }).candidateConnected, JSON.stringify(evidence)).toBe(true);
  expect(runtime.getText(), JSON.stringify(evidence)).toBe(raw + '中');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw + '中' });
});

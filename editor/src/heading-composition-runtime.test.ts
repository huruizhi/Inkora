import { TextSelection } from 'prosemirror-state';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
import type { SourceAuthoritySession } from './source-authority';
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
it.each(['', '#', '# '].flatMap(raw => (raw === '#' ? [false, true] : [false]).map(late => ({ raw, late }))))('keeps the DOM candidate owner through composition %j', async ({ raw, late }) => {
  dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  // jsdom has no layout; geometry shims support PM's selection scrolling only.
  dom.window.Range.prototype.getClientRects = () => [new dom!.window.DOMRect()] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom!.window.DOMRect();
  const changes: string[] = [];
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, (_status, kind) => {
    if (kind === 'document') changes.push(runtime!.getText());
  });
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
  if (late) {
    view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '中' }));
    await new Promise(resolve => dom!.window.setTimeout(resolve, 5));
    expect(candidate.isConnected).toBe(true);
    expect(runtime.snapshotText().ok).toBe(false);
    expect(session.status.revision).toBe(0);
  }
  candidate.replaceData(0, candidate.length, '中');
  if (candidate.isConnected) dom.window.getSelection()!.collapse(candidate, 1);
  view.dom.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '中', isComposing: true }));
  await new Promise(resolve => dom!.window.setTimeout(resolve, 20));
  record('confirmed-before-end', candidate);
  expect(changes).toEqual([]);
  expect(runtime.status.saveEligible).toBe(false);
  if (!late) view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '中' }));
  expect(await runtime.whenCompositionStable()).toBe(true);
  record('settled', candidate);
  expect((evidence[0] as { candidateConnected: boolean }).candidateConnected, JSON.stringify(evidence)).toBe(true);
  // After compositionend PM may perform its own final Text cleanup; canonical stays deferred.
  if (!late) expect((evidence[1] as { candidateConnected: boolean }).candidateConnected, JSON.stringify(evidence)).toBe(true);
  expect(runtime.getText(), JSON.stringify(evidence)).toBe(raw + '中');
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw + '中' });
  expect(changes).toEqual([raw + '中']);
  expect(session.status.revision).toBe(1);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw + '中' });
});

function bootBoundary(raw = '#') {
  dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  dom.window.Range.prototype.getClientRects = () => [new dom!.window.DOMRect()] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom!.window.DOMRect();
  runtime = createEditorRuntime(dom.window.document.querySelector('main')!, raw, () => {});
  (runtime as unknown as { view: EditorView }).view.dom.style.whiteSpace = 'pre-wrap';
  return runtime as unknown as { view: EditorView; session: SourceAuthoritySession };
}
it('cancels a temporary candidate and keeps a no-op composition out of history', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('zh').setMeta('composition', 11));
  view.dispatch(view.state.tr.delete(1, 3).setMeta('composition', 11));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(runtime!.snapshotText()).toEqual({ ok: true, value: '#' });
  expect(session.status.revision).toBe(0);
  expect(runtime!.undo()).toBe(false);
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(session.status.revision).toBe(0);
});
it('preserves directed selection when canonicalizing and rejects a stale pre-settle transaction', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('zh').setMeta('composition', 12));
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 1)));
  const stale = view.state.tr.insertText('old');
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(session.rawSelection).toEqual({ anchor: 3, head: 1, affinity: 'right' });
  expect(session.state.selection.anchor).toBe(4);
  expect(session.state.selection.head).toBe(2);
  expect(session.dispatch(stale)).toBe(false);
  expect(session.currentRaw).toBe('#zh');
  expect(session.diagnostic).toContain('过期事务');
});
it('does not lend a live owner to another block or a reopened document', async () => {
  const { view, session } = bootBoundary('#\n\nother');
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('zh').setMeta('composition', 13));
  expect(session.reopen('#')).toBe(false);
  const stale = session.state.tr.insertText('late');
  const second = session.state.doc.firstChild!.nodeSize + 1;
  expect(session.dispatch(session.state.tr.insertText('X', second).setMeta('composition', 13))).toBe(false);
  expect(session.currentRaw).toBe('#zh\n\nother');
  expect(session.state.doc.firstChild!.type.name).toBe('heading');
  // A valid same-owner confirmation can resolve the rejected intent without borrowing its authority.
  view.dispatch(view.state.tr.insertText('中', 1, 3).setMeta('composition', 13));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(session.reopen('#')).toBe(true);
  expect(session.dispatch(stale)).toBe(false);
  expect(session.currentRaw).toBe('#');
});

it('keeps a failed stable transition atomic and retries through the public drain', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('中').setMeta('composition', 14));
  const candidate = view.dom.querySelector('h1')!.firstChild;
  const before = session.state;
  // Fault injection into the public session position: normal setters reject this boundary.
  session.rawSelection = { anchor: 999, head: 999, affinity: 'right' };
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(false);
  expect(session.state).toBe(before);
  expect(session.currentRaw).toBe('#中');
  expect(candidate!.isConnected).toBe(true);
  expect(runtime!.snapshotText().ok).toBe(false);
  expect(session.status.revision).toBe(0);
  expect(session.diagnostic).toContain('再次保存可重试');
  expect(session.setRawSelection(2)).toBe(true);
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(runtime!.snapshotText()).toEqual({ ok: true, value: '#中' });
  expect(session.status.revision).toBe(1);
  expect(runtime!.undo()).toBe(true);
  expect(runtime!.getText()).toBe('#');
  expect(runtime!.redo()).toBe(true);
  expect(runtime!.snapshotText()).toEqual({ ok: true, value: '#中' });
});
it.each(['api', 'dom'] as const)('keeps ordinary same-owner %s input after compositionend as the next edit', async path => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('中').setMeta('composition', 15));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  if (path === 'api') view.dispatch(view.state.tr.insertText('a'));
  else {
    const text = view.dom.querySelector('h1')!.firstChild as Text;
    text.appendData('a');
    view.dom.dispatchEvent(new dom!.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'a', isComposing: false }));
    await new Promise(resolve => dom!.window.setTimeout(resolve, 30));
  }
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(runtime!.getText()).toBe('#中a');
  expect(session.status.revision).toBe(2);
  expect(runtime!.undo()).toBe(true);
  expect(runtime!.getText()).toBe('#中');
  expect(runtime!.undo()).toBe(true);
  expect(runtime!.getText()).toBe('#');
});
it('deletes the confirmed character and bare hash through ordinary DOM Backspace', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('中').setMeta('composition', 16));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  view.focus();
  for (const expected of ['#', '']) {
    const event = new dom!.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    if (!event.defaultPrevented) {
      const node = view.dom.querySelector('p,h1')!.firstChild as Text;
      node.deleteData(node.length - 1, 1);
      dom!.window.getSelection()!.collapse(node, node.length);
      view.dom.dispatchEvent(new dom!.window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', isComposing: false }));
    }
    await new Promise(resolve => dom!.window.setTimeout(resolve, 20));
    expect(runtime!.getText(), session.diagnostic).toBe(expected);
  }
  expect(runtime!.snapshotText()).toEqual({ ok: true, value: '' });
});
it.each([
  { raw: '##a', from: 2, to: 4 },
  { raw: '#**a**', from: 2, to: 3 },
])('does not lend the complete plain-body deletion proof to %j', ({ raw, from, to }) => {
  const { session } = bootBoundary(raw);
  const before = session.state;
  expect(session.dispatch(session.state.tr.delete(from, to))).toBe(false);
  expect(session.state).toBe(before);
  expect(session.currentRaw).toBe(raw);
});
it('does not lend the deletion proof to a mixed transaction or partial marker body', () => {
  const { session } = bootBoundary('#a\n\nother');
  const next = session.state.doc.firstChild!.nodeSize;
  const mixed = session.state.tr.delete(2, 3).setNodeMarkup(next - 1, session.state.schema.nodes.heading, { level: 2 });
  expect(session.dispatch(mixed)).toBe(false);
  expect(session.currentRaw).toBe('#a\n\nother');
  runtime!.destroy();
  const partial = bootBoundary('#abc').session;
  expect(partial.dispatch(partial.state.tr.delete(4, 5))).toBe(true);
  expect(partial.currentRaw).toBe('#ab');
  expect(partial.state.doc.firstChild!.type.name).toBe('paragraph');
});

it('keeps ordinary block deletion and protected ownership on their existing paths', () => {
  const { session } = bootBoundary('a\n\n#');
  expect(session.dispatch(session.state.tr.delete(1, 2))).toBe(true);
  expect(session.currentRaw).toBe('\n\n#');
  expect(session.state.doc.firstChild!.type.name).toBe('paragraph');
  expect(session.state.doc.lastChild!.type.name).toBe('heading');
  runtime!.destroy();
  const protectedSession = bootBoundary('#<custom>a</custom>').session;
  let protectedPos = -1, size = 0;
  protectedSession.state.doc.descendants((node, pos) => {
    if (node.type.name.startsWith('protected_')) { protectedPos = pos; size = node.nodeSize; }
  });
  expect(protectedPos).toBeGreaterThanOrEqual(0);
  expect(protectedSession.dispatch(protectedSession.state.tr.delete(protectedPos, protectedPos + size))).toBe(false);
  expect(protectedSession.currentRaw).toBe('#<custom>a</custom>');
});
it('does not clear an unrelated unresolved intent when settlement is retried', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('中').setMeta('composition', 17));
  const unrelated = { description: 'unrelated rejected edit', raw: '#other' };
  session.unresolvedIntent = unrelated;
  session.rawSelection = { anchor: 999, head: 999, affinity: 'right' };
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  expect(await runtime!.whenCompositionStable()).toBe(false);
  expect(session.unresolvedIntent).toBe(unrelated);
  expect(session.setRawSelection(2)).toBe(true);
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(session.unresolvedIntent).toBe(unrelated);
  expect(runtime!.snapshotText().ok).toBe(false);
  expect(session.currentRaw).toBe('#中');
});
it('accepts an explicitly composing late cancellation as a no-op session', async () => {
  const { view, session } = bootBoundary();
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionstart', { bubbles: true }));
  view.dispatch(view.state.tr.insertText('zh').setMeta('composition', 18));
  view.dom.dispatchEvent(new dom!.window.CompositionEvent('compositionend', { bubbles: true }));
  const text = view.dom.querySelector('h1')!.firstChild as Text;
  text.deleteData(0, text.length);
  view.dom.dispatchEvent(new dom!.window.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '', isComposing: true }));
  expect(await runtime!.whenCompositionStable()).toBe(true);
  expect(runtime!.snapshotText()).toEqual({ ok: true, value: '#' });
  expect(session.status.revision).toBe(0);
  expect(runtime!.undo()).toBe(false);
});

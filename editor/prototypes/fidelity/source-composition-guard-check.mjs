// INK-PROT-024 synthetic-signal-guard checks. Dispatched composition events
// only exercise the operation guard; they are not evidence of a real IME.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = new URL('.', import.meta.url);
const html = await readFile(new URL('PROTOTYPE.html', here), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function boot(source = 'a\n') {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(String(error)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) { window.TextEncoder = TextEncoder; },
  });
  const prototype = dom.window.fidelityPrototype;
  assert.ok(prototype?.model && prototype?.view && prototype?.actions);
  prototype.model.sourceEdit(source);
  prototype.model.past.length = 0;
  prototype.model.future.length = 0;
  prototype.model.saved = source;
  prototype.model.before = source;
  prototype.model.revision = 0;
  prototype.model.blocked = '';
  prototype.model.patches = [];
  prototype.run(() => {});
  return { dom, prototype, errors };
}

function snapshot(prototype, textarea) {
  return plain({
    sourceMode: prototype.sourceMode,
    draft: textarea.value,
    draftSelection: [textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection],
    source: prototype.model.source,
    selection: prototype.model.state.selection.toJSON(),
    doc: prototype.model.state.doc.toJSON(),
    dirty: prototype.model.dirty,
    revision: prototype.model.revision,
    past: prototype.model.past,
    future: prototype.model.future,
  });
}

function sourceComposition(dom, textarea, value) {
  textarea.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {
    bubbles: true,
    data: 'zhong',
  }));
  textarea.value = value;
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

// 1/4: every destructive/source-mode action is refused from an independent
// initial state. The diagnostic refresh must not update EditorView, reset the
// textarea, move its selection, leave source mode, or touch model/history.
for (const action of ['apply', 'cancel', 'undo', 'redo', 'reset', 'source', 'text']) {
  const { dom, prototype: p, errors } = boot();
  p.run(p.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  let updateCount = 0;
  const updateState = p.view.updateState.bind(p.view);
  p.view.updateState = state => { updateCount += 1; return updateState(state); };
  sourceComposition(dom, textarea, 'a中\n');
  textarea.setSelectionRange(2, 2, 'forward');
  const before = snapshot(p, textarea);
  p.run(p.actions[action]);
  assert.equal(p.sourceComposing, true, action);
  assert.equal(p.composing, true, action);
  assert.deepEqual(snapshot(p, textarea), before, action);
  assert.equal(updateCount, 0, `${action}: rejected path updated EditorView`);
  assert.match(dom.window.document.getElementById('state').textContent, /composition: source/);
  assert.ok([...dom.window.document.querySelectorAll('button')].every(button => button.disabled), action);
  assert.deepEqual(errors, [], action);
  dom.window.close();
}

// 2/4: compositionend lets the production textarea kernel account for the
// typed change, after which normal apply/Undo/Redo resumes and BOM/CRLF stay.
{
  const { dom, prototype: p, errors } = boot('\uFEFFa\r\n');
  p.run(p.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  sourceComposition(dom, textarea, '\uFEFFa中\n');
  p.run(p.actions.apply);
  assert.equal(p.sourceMode, true);
  assert.equal(p.model.source, '\uFEFFa\r\n');
  textarea.dispatchEvent(new dom.window.CompositionEvent('compositionend', {
    bubbles: true,
    data: '中',
  }));
  assert.equal(p.sourceComposing, false);
  assert.equal(p.composing, false);
  p.run(p.actions.apply);
  assert.equal(p.model.source, '\uFEFFa中\r\n');
  assert.equal(p.sourceMode, false);
  p.run(p.actions.undo);
  assert.equal(p.model.source, '\uFEFFa\r\n');
  p.run(p.actions.redo);
  assert.equal(p.model.source, '\uFEFFa中\r\n');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// 3/4: ordinary typed source drafts and byte-identical no-op submissions keep
// their existing behavior when no composition signal is active.
{
  const { dom, prototype: p, errors } = boot('typed\r\n');
  p.run(p.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  textarea.value = 'typed draft\n';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  p.run(p.actions.apply);
  assert.equal(p.model.source, 'typed draft\r\n');
  const revision = p.model.revision;
  const history = p.model.past.length;
  p.run(p.actions.source);
  p.run(p.actions.apply);
  assert.equal(p.model.source, 'typed draft\r\n');
  assert.equal(p.model.revision, revision);
  assert.equal(p.model.past.length, history);
  assert.equal(p.sourceMode, false);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// 4/4: the pre-existing ProseMirror composition guard remains active and the
// new source getter stays false; a normal visual action resumes after end.
{
  const { dom, prototype: p, errors } = boot(pickVisualSource());
  const before = p.model.source;
  p.view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {
    bubbles: true,
    data: 'zhong',
  }));
  assert.equal(p.view.composing, true);
  assert.equal(p.sourceComposing, false);
  assert.equal(p.composing, true);
  p.run(p.actions.text);
  assert.equal(p.model.source, before);
  p.view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', {
    bubbles: true,
    data: '中',
  }));
  assert.equal(p.composing, false);
  p.run(p.actions.text);
  assert.notEqual(p.model.source, before);
  assert.deepEqual(errors, []);
  dom.window.close();
}

function pickVisualSource() {
  return '# 标题\n\n中文正文。\n';
}

console.log('source composition synthetic-signal-guard: 4/4 PASS (not real IME)');

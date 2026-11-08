// INK-PROT-023: non-UI regression checks for the read-only host observer.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextSelection } from 'prosemirror-state';

const here = new URL('.', import.meta.url);
const prototypeURL = new URL('../PROTOTYPE.html', here);
const observerURL = new URL('Resources/runtime-observer.js', here);
const [html, observer] = await Promise.all([
  readFile(prototypeURL, 'utf8'),
  readFile(observerURL, 'utf8'),
]);

function state(model) {
  return {
    source: model.source,
    doc: model.state.doc.toJSON(),
    selection: model.state.selection.toJSON(),
    past: model.past.length,
    future: model.future.length,
  };
}

function key(window, target, name) {
  const event = new window.KeyboardEvent('keydown', {
    key: name,
    code: name,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
}

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(String(error)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) { window.TextEncoder = TextEncoder; },
});
dom.window.eval(observer);
const prototype = dom.window.fidelityPrototype;
const model = prototype.model;
const snapshot = () => dom.window.__inkoraRuntimeObserver.snapshot();

model.sourceEdit('ab\n');
model.past.length = 0;
model.future.length = 0;
model.saved = 'ab\n';
model.before = 'ab\n';
model.revision = 0;
model.blocked = '';
model.patches = [];
prototype.run(() => {});

assert.equal(snapshot().dirty, false);
assert.equal(snapshot().staged, false);
model.select(3);
prototype.view.dispatch(model.state.tr.setSelection(
  TextSelection.create(model.state.doc, 3),
));
key(dom.window, prototype.view.dom, 'Enter');

const entered = snapshot();
assert.equal(model.source, model.saved);
assert.equal(model.dirty, true);
assert.equal(entered.dirty, true);
assert.equal(entered.staged, true);
assert.equal(entered.stagedKind, 'paragraph-split');

prototype.run(prototype.actions.undo);
assert.equal(snapshot().dirty, false);
assert.equal(snapshot().staged, false);
prototype.run(prototype.actions.redo);
assert.equal(snapshot().dirty, true);
assert.equal(snapshot().staged, true);

const beforeSnapshots = state(model);
snapshot();
snapshot();
assert.deepEqual(state(model), beforeSnapshots);
assert.deepEqual(errors, []);
dom.window.close();

// Legacy models have no dirty getter; staged state must still be reported.
const legacy = new JSDOM('<textarea id="source-draft"></textarea>', {
  runScripts: 'outside-only',
});
legacy.window.fidelityPrototype = {
  model: {
    source: 'same',
    saved: 'same',
    staged: { kind: 'legacy-stage' },
    state: { selection: { from: 1, to: 1, anchor: 1, head: 1 } },
    past: [],
    future: [],
  },
  view: { composing: true },
};
legacy.window.eval(observer);
const legacySnapshot = legacy.window.__inkoraRuntimeObserver.snapshot();
assert.equal(legacySnapshot.dirty, true);
assert.equal(legacySnapshot.staged, true);
assert.equal(legacySnapshot.stagedKind, 'legacy-stage');
assert.equal(legacySnapshot.sourceComposing, null);
assert.equal(legacySnapshot.composing, true);

// New optional prototype getters override the legacy view-only fallback.
legacy.window.fidelityPrototype = {
  model: legacy.window.fidelityPrototype.model,
  view: { composing: false },
  get sourceComposing() { return true; },
  get composing() { return true; },
};
const getterSnapshot = legacy.window.__inkoraRuntimeObserver.snapshot();
assert.equal(getterSnapshot.sourceComposing, true);
assert.equal(getterSnapshot.composing, true);
legacy.window.close();

console.log('observer-check: passed');

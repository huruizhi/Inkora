// INK-PROT-026 deterministic history/save-readiness regression.
//
// This boots the real bundled EditorView and drives EditorView.dispatch plus
// the public Undo/Redo actions. It checks model semantics only; it is not a
// replacement for physical-keyboard WKWebView/Sogou verification.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextSelection } from 'prosemirror-state';

const here = new URL('.', import.meta.url);
const html = await readFile(new URL('PROTOTYPE.html', here), 'utf8');
const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on('jsdomError', error => errors.push(String(error)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) { window.TextEncoder = TextEncoder; },
});
const p = dom.window.fidelityPrototype;
assert.ok(p?.model && p?.view && p?.actions);

function findText(text, offset = 0) {
  let found = -1;
  p.model.state.doc.descendants((node, position) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = position + index + offset;
  });
  assert.ok(found >= 0, `text not found: ${text}`);
  return found;
}

function compositionEvent(type, data) {
  p.view.dom.dispatchEvent(new dom.window.CompositionEvent(type, { bubbles: true, data }));
}

function compositionReplace(from, to, insert, id) {
  p.view.dispatch(p.model.state.tr.insertText(insert, from, to).setMeta('composition', id));
  assert.equal(p.model.blocked, '');
  return { from, to: from + insert.length };
}

// Ordinary trailing spaces are a supported short-lived draft after
// INK-PROT-027, so they can no longer stand in for an unsafe operation. This
// real EditorView transaction types a block marker at the start of an existing
// paragraph: the target PM node remains a paragraph while Markdown re-parse
// produces a heading. Until structural input rules translate that operation,
// the doc.eq guard must reject it without mutating document history.
function dispatchUnsafeBlockSyntax() {
  const at = findText('保护块之后的中文。');
  p.view.dispatch(model.state.tr.insertText('# ', at));
}

function logicalState() {
  return {
    source: model.source,
    doc: model.state.doc.toJSON(),
    selection: model.state.selection.toJSON(),
    staged: model.staged ? JSON.parse(JSON.stringify(model.staged)) : null,
    trusted: {
      source: model.trusted.source,
      doc: model.trusted.state.doc.toJSON(),
      selection: model.trusted.state.selection.toJSON(),
    },
    blocked: model.blocked,
    pending: model.pending,
    dirty: model.dirty,
    saved: model.saved,
    before: model.before,
    patches: JSON.parse(JSON.stringify(model.patches)),
    ranges: JSON.parse(JSON.stringify(model.ranges)),
    issues: JSON.parse(JSON.stringify(model.issues)),
    revision: model.revision,
    past: model.past.length,
    future: model.future.length,
    saveDisabled: dom.window.document.getElementById('save').disabled,
  };
}

function assertSafeEquivalent(label) {
  const parsed = p.parse(p.model.source);
  assert.equal(parsed.issues.length, 0, `${label}: unexpected pending issues`);
  assert.ok(parsed.doc.eq(p.model.state.doc), `${label}: source/PM mismatch`);
  assert.equal(p.model.trusted.source, p.model.source, `${label}: trusted source mismatch`);
  assert.ok(p.model.trusted.state.doc.eq(p.model.state.doc), `${label}: trusted PM mismatch`);
  assert.equal(p.model.ledgerSource(), p.model.source, `${label}: ledger source mismatch`);
  assert.equal(p.model.sourceLedger().docSize, p.model.state.doc.content.size, `${label}: ledger PM size mismatch`);
  assert.equal(p.model.pending, false, `${label}: unexpected pending state`);
  assert.equal(p.model.staged, null, `${label}: unexpected staged state`);
}

const model = p.model;
model.past.length = 0;
model.future.length = 0;
model.saved = model.source;
model.before = model.source;
model.revision = 0;
model.blocked = '';
model.patches = [];
p.run(() => {});

// Recreate the safe Chinese history point that preceded the captured space
// refusal. This is synthetic transaction replay, not a real IME claim.
const baseline = { source: model.source, doc: model.state.doc, selection: model.state.selection.toJSON() };
const compositionAt = findText('保护块之后的中文。', '保护块之后的中文。'.length);
model.select(compositionAt);
p.run(() => {});
compositionEvent('compositionstart', '');
let compositionRange = compositionReplace(compositionAt, compositionAt, "zhong'wen", 2601);
compositionRange = compositionReplace(compositionRange.from, compositionRange.to, '', 2601);
compositionReplace(compositionRange.from, compositionRange.to, '中文', 2601);
compositionEvent('compositionend', '中文');
assert.equal(model.past.length, 1, 'composition must add exactly one history unit');
assertSafeEquivalent('composition commit');
assert.equal(model.dirty, true);

// A rejected transaction is an operation diagnostic, not a persistent
// document state. The failure trigger is intentionally independent from the
// now-supported trailing-whitespace input path.
const beforeRefusal = {
  source: model.source,
  doc: model.state.doc,
  selection: model.state.selection.toJSON(),
  past: model.past.length,
  future: model.future.length,
};
dispatchUnsafeBlockSyntax();
assert.match(model.blocked, /可信状态未提交/);
assert.equal(model.source, beforeRefusal.source);
assert.ok(model.state.doc.eq(beforeRefusal.doc));
assert.deepEqual(model.state.selection.toJSON(), beforeRefusal.selection);
assert.equal(model.past.length, beforeRefusal.past);
assert.equal(model.future.length, beforeRefusal.future);
assertSafeEquivalent('rejected operation');
assert.equal(dom.window.document.getElementById('save').disabled, true, 'actual equivalence failure must remain save-blocked');

// The rejection did not create a document state. A direct Undo that really
// restores the preceding safe history point invalidates that operation-only
// diagnostic without needing an intervening successful edit.
p.run(p.actions.undo);
assert.equal(model.source, baseline.source);
assert.ok(model.state.doc.eq(baseline.doc));
assert.equal(model.state.selection.anchor, compositionAt);
assert.equal(model.state.selection.head, compositionAt);
assertSafeEquivalent('direct undo after refusal');
assert.equal(model.blocked, '', 'direct Undo to a safe history point retained the current rejection');
assert.equal(dom.window.document.getElementById('save').disabled, false);

// With the composition kept in future, another refused transaction must not
// prevent a direct Redo from restoring that independently safe future point.
dispatchUnsafeBlockSyntax();
assert.match(model.blocked, /可信状态未提交/);
assert.equal(model.future.length, 1);
p.run(p.actions.redo);
assert.equal(model.source, beforeRefusal.source);
assert.ok(model.state.doc.eq(beforeRefusal.doc));
assert.deepEqual(model.state.selection.toJSON(), beforeRefusal.selection);
assertSafeEquivalent('direct redo after refusal');
assert.equal(model.blocked, '', 'direct Redo to a safe history point retained the current rejection');
assert.equal(dom.window.document.getElementById('save').disabled, false);

// A later valid edit commits normally and clears the transient diagnostic.
const editAt = findText('中文正文');
p.view.dispatch(model.state.tr.insertText('有效正文', editAt, editAt + '中文正文'.length));
assert.equal(model.blocked, '');
assert.equal(model.past.length, 2);
assert.equal('blocked' in model.past[1], false, 'operation diagnostics must not enter document history');
assertSafeEquivalent('valid edit');
assert.equal(model.dirty, true);
assert.equal(dom.window.document.getElementById('save').disabled, false);
const edited = { source: model.source, doc: model.state.doc, selection: model.state.selection.toJSON() };

// Undo restores an independently proven safe snapshot. A transient rejection
// must not make this valid history point unsaveable.
p.run(p.actions.undo);
assert.equal(model.source, beforeRefusal.source);
assert.ok(model.state.doc.eq(beforeRefusal.doc));
assert.deepEqual(model.state.selection.toJSON(), beforeRefusal.selection);
assertSafeEquivalent('undo restore');
assert.equal(model.dirty, true);
assert.equal(model.blocked, '', 'valid Undo restore retained a rejected-operation diagnostic');
assert.equal(dom.window.document.getElementById('save').disabled, false);

// The preceding composition remains one history unit and is independently
// restorable without exposing marked phonetic text or a stale diagnostic.
p.run(p.actions.undo);
assert.equal(model.source, baseline.source);
assert.ok(model.state.doc.eq(baseline.doc));
assert.equal(model.dirty, false);
assert.equal(model.blocked, '');
assert.equal(dom.window.document.getElementById('save').disabled, false);
p.run(p.actions.redo);
assert.equal(model.source, beforeRefusal.source);
assertSafeEquivalent('composition redo');
assert.equal(model.dirty, true);
assert.equal(model.blocked, '');

p.run(p.actions.redo);
assert.equal(model.source, edited.source);
assert.ok(model.state.doc.eq(edited.doc));
assert.deepEqual(model.state.selection.toJSON(), edited.selection);
assertSafeEquivalent('redo restore');
assert.equal(model.blocked, '', 'valid Redo restore retained a rejected-operation diagnostic');
assert.equal(dom.window.document.getElementById('save').disabled, false);

// Restoring an actually pending snapshot invalidates an operation diagnostic,
// but pending itself must continue to block save.
model.sourceEdit(p.samples.malformed);
p.run(() => {});
assert.equal(model.pending, true);
const pending = { source: model.source, doc: model.state.doc };
p.run(p.actions.undo);
assert.equal(model.pending, false);
dispatchUnsafeBlockSyntax();
assert.match(model.blocked, /可信状态未提交/);
p.run(p.actions.redo);
assert.equal(model.source, pending.source);
assert.ok(model.state.doc.eq(pending.doc));
assert.equal(model.pending, true);
assert.equal(model.blocked, '');
assert.equal(dom.window.document.getElementById('save').disabled, true, 'restored pending state must remain save-blocked');

// A staged empty structure is likewise blocked by staged state after a real
// restoration, independently of operation diagnostics.
model.sourceEdit('ab\n');
model.past.length = 0;
model.future.length = 0;
model.saved = model.source;
model.before = model.source;
model.blocked = '';
p.run(() => {});
p.view.dispatch(model.state.tr.setSelection(TextSelection.create(model.state.doc, 3)));
p.view.dispatch(model.state.tr.split(3));
assert.ok(model.staged);
const staged = logicalState();
p.run(p.actions.undo);
assert.equal(model.staged, null);
p.run(p.actions.redo);
assert.deepEqual(logicalState().staged, staged.staged);
assert.equal(model.blocked, '');
assert.equal(dom.window.document.getElementById('save').disabled, true, 'restored staged state must remain save-blocked');

// Empty-history Undo/Redo are true no-ops: they cannot manufacture a
// successful restoration or clear a real rejection.
model.past.length = 0;
model.future.length = 0;
p.run(() => {});
p.view.dispatch(model.state.tr.split(2));
assert.match(model.blocked, /暂存结构之后的非文字事务尚未支持/);
const beforeNoopTravel = logicalState();
p.run(p.actions.undo);
assert.deepEqual(logicalState(), beforeNoopTravel, 'empty-history Undo changed state or cleared the rejection');
p.run(p.actions.redo);
assert.deepEqual(logicalState(), beforeNoopTravel, 'empty-history Redo changed state or cleared the rejection');
assert.deepEqual(errors, []);

dom.window.close();
console.log('history save readiness: 5/5 PASS (real IME retest required)');

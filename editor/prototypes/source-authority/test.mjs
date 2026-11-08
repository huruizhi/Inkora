import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { withScratch } from './scratch-adapter.mjs';

const here = new URL('.', import.meta.url);
const oracleUrl = new URL('../../../docs/prototypes/source-authority/ORACLES.json', here);
const hashUrl = new URL('../../../docs/prototypes/source-authority/ORACLES.sha256', here);
const oracleBytes = await readFile(oracleUrl);
const oracle = JSON.parse(oracleBytes.toString('utf8'));
const expectedHash = (await readFile(hashUrl, 'utf8')).trim().split(/\s+/)[0];
const actualHash = createHash('sha256').update(oracleBytes).digest('hex');
assert.equal(actualHash, expectedHash, 'frozen oracle SHA-256');

const virtualErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => virtualErrors.push(String(error)));
const dom = new JSDOM(await readFile(new URL('PROTOTYPE.html', here), 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
  },
});
const prototype = dom.window.sourceAuthorityPrototype;
assert.ok(prototype?.controller && prototype?.view, 'offline bundle boots with a real EditorView');
const controller = () => prototype.controller;
const hex = raw => Buffer.from(raw, 'utf8').toString('hex');
const rawSelection = () => ({ anchor: controller().rawSelection.anchor, head: controller().rawSelection.head });
const clone = value => JSON.parse(JSON.stringify(value));
const results = [];

function assertViewSynced(label) {
  assert.ok(prototype.view.state === controller().state, `${label}: EditorView owns current controller state`);
}

function reopen(raw, caret = 0, affinity = 'right') {
  assert.equal(prototype.reopen(raw, { anchor: caret, head: caret, affinity }), true, `reopen ${JSON.stringify(raw)}`);
  assertViewSynced('reopen');
}

function type(text, compositionId) {
  assert.equal(prototype.nativeType(text, compositionId), true, `type ${JSON.stringify(text)}: ${controller().diagnostic}`);
  assertViewSynced('type');
}

function dispatchKey(key) {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  prototype.view.dom.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, `${key}: real EditorView key path handled`);
  assertViewSynced(key);
}

function assertPrimaryStep(expected, label) {
  const model = controller();
  assert.equal(model.currentRaw, expected.raw, `${label}: raw`);
  assert.equal(model.savedRaw, expected.saved, `${label}: saved`);
  assert.deepEqual(rawSelection(), expected.selection, `${label}: raw selection`);
  assert.equal(model.past.length, expected.undo, `${label}: undo count`);
  assert.equal(model.future.length, expected.redo, `${label}: redo count`);
  assert.equal(model.version, expected.version, `${label}: version`);
  assert.equal(model.documentDirty, expected.dirty, `${label}: dirty`);
  assert.equal(hex(model.currentRaw), expected.expectedUtf8Hex, `${label}: UTF-8 bytes`);
  assert.equal(model.currentRaw.length, expected.rawUtf16Length, `${label}: UTF-16 length`);
  if ('saveEligible' in expected) assert.equal(model.saveEligible, expected.saveEligible, `${label}: save eligibility`);
  if ('sourceAccessible' in expected) assert.equal(model.sourceAccessible, expected.sourceAccessible, `${label}: source accessibility`);
}

// Frozen primary chain: every visual edit goes through the real bundle's EditorView dispatch.
const [p0, p1, p2, p3, p4, p5, p6, p7] = oracle.primary;
reopen(p0.raw, p0.selection.head);
assertPrimaryStep(p0, 'P0');
type(p1.text);
assertPrimaryStep(p1, 'P1');
const beforeSave = {
  raw: controller().currentRaw,
  projection: clone(controller().projection),
  visualSelection: controller().state.selection.toJSON(),
  rawSelection: clone(controller().rawSelection),
  version: controller().version,
  undo: controller().past.length,
  redo: controller().future.length,
};
assert.equal(controller().saveMemory(), true, 'P2 save succeeds');
assert.deepEqual({
  raw: controller().currentRaw,
  projection: clone(controller().projection),
  visualSelection: controller().state.selection.toJSON(),
  rawSelection: clone(controller().rawSelection),
  version: controller().version,
  undo: controller().past.length,
  redo: controller().future.length,
}, beforeSave, 'Save preserves raw/projection/selections/version/history');
assertPrimaryStep(p2, 'P2');
const beforeNoop = clone(controller().stateReport());
assert.equal(controller().beginSource(), true);
assert.equal(controller().applySource(), true);
assert.deepEqual(clone(controller().stateReport()), beforeNoop, 'P3 source no-op preserves complete public state');
assertPrimaryStep(p3, 'P3');
await withScratch(controller().currentRaw, async scratch => {
  assert.equal(scratch.raw, p4.raw, 'scratch UTF-8 readback raw');
  assert.equal(scratch.bytes.toString('hex'), p4.expectedUtf8Hex, 'scratch UTF-8 readback bytes');
  assert.match(scratch.path, /INK-PROT-030-PROTOTYPE-scratch\.md$/);
  assert.equal(prototype.reopen(scratch.raw, { anchor: p4.selection.head, head: p4.selection.head, affinity: 'right' }), true);
});
assertPrimaryStep(p4, 'P4');
assert.equal(controller().state.selection.anchor, controller().state.selection.head, 'P4 maps raw caret into a real view selection');
type(p5.text);
assertPrimaryStep(p5, 'P5');
assert.equal(prototype.run('undo'), true); assertPrimaryStep(p6, 'P6');
assert.equal(prototype.run('redo'), true); assertPrimaryStep(p7, 'P7');
results.push('PRIMARY 8/8 + scratch UTF-8 write/read');
console.log('PASS: PRIMARY 8/8 + scratch UTF-8 write/read');

// Same legal bytes reached by typing or loading share the same safety predicate.
reopen('a\n', 1); type(' ');
const typedEligibility = controller().saveEligible;
reopen('a \n', 2);
assert.equal(controller().saveEligible, typedEligibility, 'same bytes have identical save eligibility across entry paths');

// Thirteen frozen repeat vectors: save, source no-op, scratch new epoch, and continue.
for (const vector of oracle.repeatPrimaryVectors) {
  console.log(`RUN: repeat ${vector.id}`);
  assert.equal(hex(vector.initial), vector.initialUtf8Hex, `${vector.id}: initial oracle bytes self-consistent`);
  assert.equal(hex(vector.afterSpace), vector.afterSpaceUtf8Hex, `${vector.id}: space oracle bytes self-consistent`);
  assert.equal(hex(vector.afterContinue), vector.afterContinueUtf8Hex, `${vector.id}: continue oracle bytes self-consistent`);
  reopen(vector.initial, vector.caret, vector.affinity ?? 'right');
  type(' ');
  assert.equal(controller().currentRaw, vector.afterSpace, `${vector.id}: after Space`);
  assert.equal(controller().saveEligible, true, `${vector.id}: can save while stopped at Space`);
  assert.equal(controller().saveMemory(), true, `${vector.id}: save`);
  assert.equal(controller().beginSource(), true); assert.equal(controller().applySource(), true);
  await withScratch(controller().currentRaw, async scratch => {
    assert.equal(scratch.bytes.toString('hex'), vector.afterSpaceUtf8Hex, `${vector.id}: scratch bytes`);
    const selection = {
      anchor: vector.caret + 1,
      head: vector.caret + 1,
      affinity: vector.affinity ?? 'right',
    };
    assert.equal(prototype.reopen(scratch.raw, selection), true, `${vector.id}: raw→visual map after reopen`);
  });
  type('b');
  assert.equal(controller().currentRaw, vector.afterContinue, `${vector.id}: continue after hidden syntax/space`);
  assert.equal(controller().rawSelection.head, vector.continueCaret, `${vector.id}: continue caret`);
  if (vector.preserve) assert.ok(controller().currentRaw.includes(vector.preserve), `${vector.id}: preserved syntax`);
}
results.push('repeatPrimaryVectors 13/13');
console.log('PASS: repeatPrimaryVectors 13/13');

// Enter and Space→Enter are real EditorView key paths with a new scratch epoch.
for (const vector of oracle.paragraphCases) {
  console.log(`RUN: paragraph ${vector.id}`);
  reopen(vector.initial, vector.caret);
  if (vector.id === 'SPACE_ENTER') type(' ');
  dispatchKey('Enter');
  assert.equal(controller().currentRaw, vector.afterEnter, `${vector.id}: raw after Enter`);
  assert.equal(controller().rawSelection.head, vector.enterCaret, `${vector.id}: caret after Enter`);
  assert.equal(controller().saveEligible, true, `${vector.id}: save eligible while stopped on empty line`);
  assert.equal(controller().saveMemory(), true);
  await withScratch(controller().currentRaw, async scratch => {
    assert.equal(prototype.reopen(scratch.raw, { anchor: vector.enterCaret, head: vector.enterCaret, affinity: 'right' }), true);
  });
  type('b');
  assert.equal(controller().currentRaw, vector.afterReopenAndContinue, `${vector.id}: continue after reopen`);
  assert.equal(controller().rawSelection.head, vector.continueCaret, `${vector.id}: continue caret`);
}
results.push('paragraphCases 3/3 via EditorView Enter');

const breakCase = oracle.lineBreakCase;
reopen(breakCase.initial, breakCase.caret);
type(' ');
assert.equal(controller().currentRaw, breakCase.afterSingleSpace);
assert.equal(controller().semanticBreak(), breakCase.singleSemanticBreak);
assert.ok(controller().currentRaw.endsWith(breakCase.preserveUnaffectedSuffix));
type(' ');
assert.equal(controller().currentRaw, breakCase.afterDoubleSpace);
assert.equal(controller().semanticBreak(), breakCase.doubleSemanticBreak);
assert.equal(controller().rawSelection.head, breakCase.doubleCaret);
assert.match(controller().projection.provenance[0], /second trailing space activates one hardbreak/);
results.push('softbreak/hardbreak semantic projection');

// Reopened hidden-space Backspace uses the actual EditorView key handler.
const backspace = oracle.reopenedHiddenBackspace;
reopen(backspace.initial, backspace.caret);
assert.equal(controller().savedRaw, backspace.saved);
dispatchKey('Backspace');
assert.equal(controller().currentRaw, backspace.afterBackspace);
assert.equal(controller().rawSelection.head, backspace.afterCaret);
assert.equal(controller().documentDirty, backspace.dirty);
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, backspace.afterUndo);
assert.equal(controller().rawSelection.head, backspace.undoCaret);
assert.equal(controller().documentDirty, backspace.undoDirty);
results.push('reopened hidden-space real Backspace');

// Save point and history are independent.
reopen(oracle.saveHistory.initial, 1); type(' ');
const historyBeforeSave = controller().past.length;
assert.equal(controller().saveMemory(), true);
assert.equal(controller().past.length, historyBeforeSave, 'same-epoch Save adds no history');
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, oracle.saveHistory.afterUndo);
assert.equal(controller().documentDirty, oracle.saveHistory.undoDirty);
assert.equal(prototype.run('redo'), true);
assert.equal(controller().currentRaw, oracle.saveHistory.afterRedo);
assert.equal(controller().documentDirty, oracle.saveHistory.redoDirty);

// Backward selection replacement and exact historical direction.
const backward = oracle.backwardSelection;
reopen(backward.initial);
assert.equal(controller().setRawSelection(backward.selection.anchor, backward.selection.head, 'right'), true);
prototype.view.updateState(controller().state);
type(backward.replace);
assert.equal(controller().currentRaw, backward.after);
assert.deepEqual(rawSelection(), backward.afterSelection);
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, backward.initial);
assert.deepEqual(rawSelection(), backward.selection);
assert.ok(controller().state.selection.anchor > controller().state.selection.head, 'Undo restores backward real view selection');

// Semantic equality does not make a source format change a no-op.
const format = oracle.sourceFormat;
reopen(format.initial, format.initial.length - 1);
assert.equal(controller().beginSource(), true);
assert.equal(controller().updateDraft(format.draft, { anchor: format.draftCaret, head: format.draftCaret, affinity: 'right' }), true);
assert.equal(controller().applySource(), true);
assert.equal(controller().currentRaw, format.afterApply);
assert.equal(controller().documentDirty, format.dirty);
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, format.undoRaw);
assert.equal(prototype.run('redo'), true); assert.equal(controller().currentRaw, format.redoRaw);

// Source draft dirtiness is not document dirtiness; cancel is a true no-op.
const draft = oracle.sourceDraft;
reopen(draft.initial, draft.caret);
const cancelHistory = controller().past.length;
assert.equal(controller().beginSource(), true);
assert.equal(controller().updateDraft(draft.modifiedDraft, { anchor: 3, head: 3, affinity: 'right' }), true);
assert.equal(controller().currentRaw, draft.beforeApplyDocument);
assert.equal(controller().documentDirty, draft.beforeApplyDocumentDirty);
assert.equal(controller().draftDirty, draft.draftDirty);
assert.equal(controller().saveEligible, draft.saveEligibleBeforeApply);
assert.equal(controller().cancelSource(), true);
assert.equal(controller().currentRaw, draft.cancelRaw);
assert.equal(controller().past.length, cancelHistory);
assert.equal(controller().beginSource(), true);
controller().updateDraft(draft.modifiedDraft, { anchor: 3, head: 3, affinity: 'right' });
assert.equal(controller().applySource(), true);
assert.equal(controller().currentRaw, draft.applyRaw);
assert.equal(controller().past.length, cancelHistory + draft.applyHistoryDelta);
results.push('save/history, backward selection, source format/draft');

// Pending protected projection remains local and source repair stays reachable.
const pending = oracle.negatives.find(item => item.id === 'PENDING_MATH');
reopen(pending.initial);
assert.equal(controller().saveEligible, pending.saveEligible);
assert.equal(controller().sourceAccessible, pending.sourceAccessible);
assert.ok(controller().issues.length > 0, 'unclosed math has a pending issue');
assert.equal(controller().beginSource(), true);
const repaired = pending.initial + pending.repairAppend;
controller().updateDraft(repaired, { anchor: repaired.length, head: repaired.length, affinity: 'right' });
assert.equal(controller().applySource(), true);
assert.equal(controller().currentRaw, pending.afterRepair);
assert.equal(controller().issues.length, 0);
assert.ok(controller().state.doc.childCount > 1, 'repair does not turn whole document into source fallback');
assert.equal(controller().state.doc.lastChild.type.name, 'protected_block');

// Unmapped protected edit is an actual PM transaction, rejected atomically.
reopen('a\n\n$$\nx\n$$\n');
let protectedHit;
controller().state.doc.descendants((node, pos) => { if (node.type.name === 'protected_block') protectedHit = { node, pos }; });
assert.ok(protectedHit);
const protectedBefore = clone(controller().stateReport());
const protectedTransaction = controller().state.tr.insertText('z', protectedHit.pos, protectedHit.pos + protectedHit.node.nodeSize);
assert.equal(controller().dispatch(protectedTransaction), false);
assert.equal(controller().currentRaw, protectedBefore.currentRaw);
assert.equal(controller().version, protectedBefore.version);
assert.equal(controller().past.length, protectedBefore.undo);
assert.ok(controller().unresolvedIntent);

// A transaction built before an accepted edit cannot overwrite the new source.
reopen('a\n', 1);
const stale = controller().state.tr.insertText('x');
type('b');
const staleSnapshot = clone(controller().stateReport());
assert.equal(controller().dispatch(stale), false);
assert.equal(controller().currentRaw, staleSnapshot.currentRaw);
assert.equal(controller().savedRaw, staleSnapshot.savedRaw);
assert.equal(controller().version, staleSnapshot.version);
assert.equal(controller().past.length, staleSnapshot.undo);
assert.match(controller().diagnostic, /过期事务/);

// Invalid BOM, surrogate/grapheme, and CRLF interior positions preserve state.
const unicode = oracle.repeatPrimaryVectors.find(item => item.id === 'UNICODE_RAW');
reopen(unicode.initial, unicode.caret);
for (const offset of unicode.invalidInitialOffsets) {
  const before = clone(controller().stateReport());
  assert.equal(controller().setRawSelection(offset), false, `invalid Unicode/raw offset ${offset}`);
  assert.equal(controller().currentRaw, before.currentRaw);
  assert.deepEqual(rawSelection(), { anchor: before.rawSelection.anchor, head: before.rawSelection.head });
  assert.equal(controller().version, before.version);
}

// Composition command guard: no content/draft/selection/history/version/view reset.
reopen('a \n', 2);
assert.equal(controller().beginSource(), true);
controller().updateDraft('a draft\n', { anchor: 7, head: 7, affinity: 'right' });
const viewIdentity = prototype.view;
controller().startComposition();
const guardSnapshot = {
  raw: controller().currentRaw,
  saved: controller().savedRaw,
  draft: clone(controller().draft),
  selection: clone(controller().rawSelection),
  visual: controller().state.selection.toJSON(),
  past: controller().past.length,
  future: controller().future.length,
  version: controller().version,
};
for (const command of oracle.negatives.find(item => item.id === 'COMPOSITION_GUARD').commands) {
  const outcome = command === 'save' ? controller().saveMemory()
    : command === 'source_enter' ? controller().beginSource()
      : command === 'source_apply' ? controller().applySource()
        : command === 'source_cancel' ? controller().cancelSource()
          : command === 'reset' ? controller().reopen('reset\n')
            : command === 'undo' ? controller().undo() : controller().redo();
  assert.equal(outcome, false, `composition guard ${command}`);
  assert.deepEqual({
    raw: controller().currentRaw,
    saved: controller().savedRaw,
    draft: clone(controller().draft),
    selection: clone(controller().rawSelection),
    visual: controller().state.selection.toJSON(),
    past: controller().past.length,
    future: controller().future.length,
    version: controller().version,
  }, guardSnapshot, `${command}: logical state preserved`);
  assert.equal(prototype.view, viewIdentity, `${command}: no EditorView reinitialization`);
}
controller().endComposition(); controller().cancelSource();

// Empty history travel never clears the last rejection or invents success.
reopen('a\n');
controller().unresolvedIntent = { description: 'kept diagnostic' };
controller().diagnostic = 'kept diagnostic';
const emptyBefore = clone(controller().stateReport());
assert.equal(controller().undo(), false);
assert.equal(controller().redo(), false);
assert.equal(controller().diagnostic, emptyBefore.diagnostic);
assert.deepEqual(controller().unresolvedIntent, emptyBefore.unresolvedIntent);
assert.equal(controller().version, emptyBefore.version);
results.push('negative boundaries: pending/protected/stale/unicode/composition/empty-history');

// Two synthetic composition sessions are two complete history units.
reopen(oracle.composition.initial, oracle.composition.caret);
function compositionEvent(type) {
  prototype.view.dom.dispatchEvent(new dom.window.CompositionEvent(type, { bubbles: true }));
}
function compositionReplace(marked, committed, id) {
  compositionEvent('compositionstart');
  const start = controller().state.selection.head;
  assert.equal(prototype.nativeType(marked, id), true, controller().diagnostic);
  const end = controller().state.selection.head;
  assert.equal(prototype.nativeReplace(end - marked.length, end, committed, id), true, controller().diagnostic);
  compositionEvent('compositionend');
  assertViewSynced(`composition ${id}`);
}
compositionReplace('zhongwen', '中文', 101);
assert.equal(controller().currentRaw, oracle.composition.committed);
assert.equal(controller().past.length, oracle.composition.historyDelta);
compositionReplace('ceshi', '测试', 102);
assert.equal(controller().currentRaw, 'a 中文测试\n');
assert.equal(controller().past.length, 2, 'two composition sessions are two history entries');
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, oracle.composition.committed);
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, oracle.composition.initial);
assert.equal(prototype.run('redo'), true); assert.equal(controller().currentRaw, oracle.composition.committed);
assert.equal(prototype.run('redo'), true); assert.equal(controller().currentRaw, 'a 中文测试\n');

// Cancelled/no-op composition keeps an existing future branch.
assert.equal(prototype.run('undo'), true);
const noOpRaw = controller().currentRaw;
const noOpPast = controller().past.length;
const noOpFuture = controller().future.length;
compositionEvent('compositionstart');
type('x', 103);
let end = controller().state.selection.head;
assert.equal(prototype.nativeReplace(end - 1, end, '', 103), true);
compositionEvent('compositionend');
assert.equal(controller().currentRaw, noOpRaw);
assert.equal(controller().past.length, noOpPast);
assert.equal(controller().future.length, noOpFuture);
results.push('composition replay: two units + cancel/no-op future');

// WebKit may deliver the final transaction carrying the same composition ID
// after DOM compositionend, including on a later microtask. The DOM lifecycle
// and transaction ID together define one history session; the next unrelated
// edit is the explicit boundary that seals it.
reopen('a \n', 2);
compositionEvent('compositionstart');
type('zhongwen', 201);
let lateEnd = controller().state.selection.head;
compositionEvent('compositionend');
await Promise.resolve();
assert.equal(prototype.nativeReplace(lateEnd - 'zhongwen'.length, lateEnd, '中文', 201), true);
assert.equal(controller().currentRaw, 'a 中文\n');
assert.equal(controller().past.length, 1, 'late final transaction remains one visible history unit');
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, 'a \n', 'late final transaction Undo returns to the pre-session raw');
assert.equal(prototype.run('redo'), true);
assert.equal(controller().currentRaw, 'a 中文\n');

// A following ordinary edit must not merge into the ended composition.
type('!');
assert.equal(controller().past.length, 2);
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, 'a 中文\n');
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, 'a \n');

// Consecutive sessions remain independent when one final transaction arrives
// before compositionend and the other arrives after it.
reopen('a \n', 2);
compositionReplace('yi', '一', 202);
compositionEvent('compositionstart');
type('er', 203);
lateEnd = controller().state.selection.head;
compositionEvent('compositionend');
assert.equal(prototype.nativeReplace(lateEnd - 2, lateEnd, '二', 203), true);
assert.equal(controller().currentRaw, 'a 一二\n');
assert.equal(controller().past.length, 2);
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, 'a 一\n');
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, 'a \n');

// Selection replacement uses the real view selection and the same late-final
// ordering; Undo restores both the original bytes and selected range.
reopen('old\n', 3);
prototype.view.dispatch(prototype.view.state.tr.setSelection(
  prototype.view.state.selection.constructor.create(prototype.view.state.doc, 1, 4),
));
compositionEvent('compositionstart');
type('jiu', 204);
lateEnd = controller().state.selection.head;
compositionEvent('compositionend');
assert.equal(prototype.nativeReplace(lateEnd - 3, lateEnd, '旧', 204), true);
assert.equal(controller().currentRaw, '旧\n');
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, 'old\n');
assert.deepEqual(clone(controller().state.selection.toJSON()), { type: 'text', anchor: 1, head: 4 });

// A cancelled late-final session is a no-op and keeps the existing future;
// a later committed branch clears that future, while Save and source no-op do
// not alter its raw/history/dirty state.
reopen('a\n', 1);
type('b'); type('c');
assert.equal(prototype.run('undo'), true);
const lateNoOpPast = controller().past.length;
const lateNoOpFuture = controller().future.length;
compositionEvent('compositionstart');
type('x', 205);
lateEnd = controller().state.selection.head;
compositionEvent('compositionend');
assert.equal(prototype.nativeReplace(lateEnd - 1, lateEnd, '', 205), true);
assert.equal(controller().currentRaw, 'ab\n');
assert.equal(controller().past.length, lateNoOpPast);
assert.equal(controller().future.length, lateNoOpFuture);
assert.equal(prototype.run('redo'), true); assert.equal(controller().currentRaw, 'abc\n');
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, 'ab\n');
compositionEvent('compositionstart');
type('han', 206);
lateEnd = controller().state.selection.head;
compositionEvent('compositionend');
assert.equal(prototype.nativeReplace(lateEnd - 3, lateEnd, '汉', 206), true);
assert.equal(controller().future.length, 0, 'committed composition creates a new branch');
const beforeCompositionSave = clone(controller().stateReport());
assert.equal(prototype.run('save'), true);
assert.equal(controller().documentDirty, false);
assert.equal(controller().past.length, beforeCompositionSave.undo);
const beforeSourceNoOp = clone(controller().stateReport());
assert.equal(prototype.run('source'), true);
assert.equal(prototype.run('apply'), true);
assert.deepEqual(clone(controller().stateReport()), beforeSourceNoOp);
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, 'ab\n');
type('Z');
assert.equal(controller().future.length, 0, 'ordinary input after Undo starts a new branch');
assert.equal(prototype.run('undo'), true); assert.equal(controller().currentRaw, 'ab\n');
results.push('composition lifecycle: before/late final + boundaries + selection + future');

// Scope declaration: the naturally supported '# ' case proves bytes,
// semantic projection, selection, and history; it is not a universal input-rule promise.
reopen('\n', 0);
type('#');
const beforeHashSpace = controller().currentRaw;
assert.match(controller().projection.provenance[0], /ATX heading activation on an empty raw line/);
type(' ');
assert.equal(controller().currentRaw, '# \n');
assert.equal(controller().state.doc.firstChild.type.name, 'heading');
assert.equal(controller().rawSelection.head, 2);
assert.equal(controller().past.length, 2);
assert.equal(prototype.run('undo'), true);
assert.equal(controller().currentRaw, beforeHashSpace);
assert.equal(controller().rawSelection.head, 1);
assert.equal(prototype.run('redo'), true);
assert.equal(controller().currentRaw, '# \n');
results.push('# input rule bounded positive proof');

assert.deepEqual(virtualErrors, [], `jsdom runtime errors: ${virtualErrors.join('\n')}`);
console.log(`source-authority: ${results.length} groups PASS`);
for (const result of results) console.log(`PASS: ${result}`);
console.log(`oracle sha256: ${actualHash}`);
console.log('evidence: jsdom real EditorView + Node scratch UTF-8; not WK/physical IME/NSDocument');
dom.window.close();

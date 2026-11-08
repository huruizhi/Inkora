import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = new URL('.', import.meta.url);
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
const controller = () => prototype.controller;
const textarea = dom.window.document.querySelector('textarea');
const clone = value => JSON.parse(JSON.stringify(value));

function click(command) {
  const button = dom.window.document.querySelector(`button[data-command="${command}"]`);
  assert.ok(button, `button ${command}`);
  button.click();
}

function reopen(raw, selection) {
  assert.equal(prototype.reopen(raw, selection), true);
  assert.ok(prototype.view.state === controller().state, 'view is synchronized after reopen');
}

function viewType(text, compositionId) {
  let transaction = prototype.view.state.tr.insertText(text);
  if (compositionId !== undefined) transaction = transaction.setMeta('composition', compositionId);
  prototype.view.dispatch(transaction);
  assert.ok(prototype.view.state === controller().state, 'visual edit used and synchronized the real EditorView');
}

function sourceInput(value, start = value.length, end = start, direction = 'none') {
  textarea.value = value;
  textarea.setSelectionRange(start, end, direction);
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function travelSnapshot() {
  return {
    currentRaw: controller().currentRaw,
    savedRaw: controller().savedRaw,
    draft: clone(controller().draft),
    rawSelection: clone(controller().rawSelection),
    visualSelection: controller().state.selection.toJSON(),
    undo: controller().past.length,
    redo: controller().future.length,
    version: controller().version,
    sourceMode: prototype.sourceMode,
    textarea: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    selectionDirection: textarea.selectionDirection,
  };
}

const failures = [];
function check(name, action) {
  try {
    action();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL: ${name}\n${error instanceof Error ? error.stack : String(error)}`);
  }
}

check('textarea CRLF/BOM no-op is a complete no-op through DOM buttons', () => {
  reopen('\uFEFFa\r\nb\r\n', { anchor: 2, head: 2, affinity: 'right' });
  const before = clone(controller().stateReport());
  click('source');
  assert.equal(textarea.value, '\uFEFFa\nb\n', 'browser exposes normalized LF');
  click('apply');
  assert.equal(prototype.sourceMode, false);
  assert.deepEqual(clone(controller().stateReport()), before);
});

check('textarea local edit preserves mixed EOL and maps LF selection to raw offsets', () => {
  reopen('a\r\nb\nc\r\n', { anchor: 3, head: 3, affinity: 'right' });
  click('source');
  sourceInput('a\nB\nc\n', 3);
  assert.equal(controller().draft.raw, 'a\r\nB\nc\r\n');
  assert.deepEqual(clone(controller().draft.selection), { anchor: 4, head: 4, affinity: 'right' });
  click('apply');
  assert.equal(controller().currentRaw, 'a\r\nB\nc\r\n');
  assert.deepEqual(clone(controller().rawSelection), { anchor: 4, head: 4, affinity: 'right' });
});

check('textarea backward LF selection is preserved and cancel resets the draft', () => {
  reopen('a\r\nb\nc\r\n', { anchor: 3, head: 3, affinity: 'right' });
  click('source');
  sourceInput('a\nB\nc\n', 2, 4, 'backward');
  assert.deepEqual(clone(controller().draft.selection), { anchor: 5, head: 3, affinity: 'right' });
  click('cancel');
  assert.equal(prototype.sourceMode, false);
  assert.equal(controller().draft, null);
  assert.equal(controller().currentRaw, 'a\r\nb\nc\r\n');
  assert.equal(textarea.value, 'a\nb\nc\n');
});

check('textarea composition commits through the production kernel before travel', () => {
  reopen('a\r\n', { anchor: 1, head: 1, affinity: 'right' });
  click('source');
  textarea.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  textarea.value = 'a中\n';
  textarea.setSelectionRange(2, 2);
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(controller().composing, true);
  textarea.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  assert.equal(controller().composing, false);
  assert.equal(controller().draft.raw, 'a中\r\n');
  const before = travelSnapshot();
  click('undo');
  assert.deepEqual(travelSnapshot(), before);
  assert.match(controller().diagnostic, /源码草稿尚未提交，拒绝 Undo/);
});

check('dirty source draft rejects Undo with past and preserves all travel state', () => {
  reopen('a\n', { anchor: 1, head: 1, affinity: 'right' });
  viewType('b');
  click('source');
  sourceInput('ab DRAFT\n', 8);
  const before = travelSnapshot();
  click('undo');
  assert.deepEqual(travelSnapshot(), before);
  assert.match(controller().diagnostic, /源码草稿尚未提交，拒绝 Undo/);
});

check('dirty source draft rejects Redo with future and preserves all travel state', () => {
  click('cancel');
  click('undo');
  assert.equal(controller().future.length, 1);
  click('source');
  sourceInput('a DRAFT\n', 7);
  const before = travelSnapshot();
  click('redo');
  assert.deepEqual(travelSnapshot(), before);
  assert.match(controller().diagnostic, /源码草稿尚未提交，拒绝 Redo/);
});

check('dirty source draft rejects empty Undo/Redo without inventing travel', () => {
  reopen('a\n', { anchor: 1, head: 1, affinity: 'right' });
  click('source');
  sourceInput('a DRAFT\n', 7);
  const before = travelSnapshot();
  click('undo');
  assert.deepEqual(travelSnapshot(), before);
  assert.match(controller().diagnostic, /源码草稿尚未提交，拒绝 Undo/);
  click('redo');
  assert.deepEqual(travelSnapshot(), before);
  assert.match(controller().diagnostic, /源码草稿尚未提交，拒绝 Redo/);
});

check('clean source session can travel and exits source mode explicitly', () => {
  reopen('a\n', { anchor: 1, head: 1, affinity: 'right' });
  viewType('b');
  click('source');
  assert.equal(controller().draftDirty, false);
  click('undo');
  assert.equal(controller().currentRaw, 'a\n');
  assert.equal(controller().draft, null);
  assert.equal(prototype.sourceMode, false);
  assert.equal(textarea.value, 'a\n');
});

check('all projection anchors map across repeated real EditorView edits', () => {
  reopen('abc\n', { anchor: 3, head: 3, affinity: 'right' });
  assert.equal(prototype.setRawSelection(1), true);
  viewType('X');
  prototype.view.dispatch(prototype.view.state.tr.setSelection(
    prototype.view.state.selection.constructor.create(prototype.view.state.doc, 4),
  ));
  viewType('Y');
  assert.equal(controller().currentRaw, 'aXbYc\n');
  assert.deepEqual(clone(controller().rawSelection), { anchor: 4, head: 4, affinity: 'right' });
});

check('anchor mapping covers backward replacement, repeats, and marked hidden space', () => {
  reopen('abcdef\n', { anchor: 6, head: 6, affinity: 'right' });
  prototype.view.dispatch(prototype.view.state.tr.setSelection(
    prototype.view.state.selection.constructor.create(prototype.view.state.doc, 6, 3),
  ));
  viewType('X');
  assert.equal(controller().currentRaw, 'abXf\n');
  prototype.view.dispatch(prototype.view.state.tr.setSelection(
    prototype.view.state.selection.constructor.create(prototype.view.state.doc, 2),
  ));
  viewType('Y');
  assert.equal(controller().currentRaw, 'aYbXf\n');

  reopen('aa aa aa\n', { anchor: 8, head: 8, affinity: 'right' });
  assert.equal(prototype.setRawSelection(3), true);
  viewType('X');
  prototype.view.dispatch(prototype.view.state.tr.setSelection(
    prototype.view.state.selection.constructor.create(prototype.view.state.doc, 8),
  ));
  viewType('Y');
  assert.equal(controller().currentRaw, 'aa Xaa Yaa\n');

  reopen('**a** \n', { anchor: 6, head: 6, affinity: 'right' });
  viewType('b');
  assert.equal(controller().currentRaw, '**a** b\n');
  assert.match(controller().projection.provenance[0], /hidden trailing space/);
  viewType('c');
  assert.equal(controller().currentRaw, '**a** bc\n');

  reopen('**a**\n', { anchor: 3, head: 3, affinity: 'right' });
  const strong = controller().state.doc.firstChild.firstChild.marks[0];
  prototype.view.dispatch(prototype.view.state.tr.removeMark(1, 2, strong));
  assert.equal(controller().currentRaw, 'a\n');
  viewType('b');
  assert.equal(controller().currentRaw, 'ab\n');
});

check('unproven semantic reprojection is rejected atomically with intent', () => {
  reopen('*a\n', { anchor: 2, head: 2, affinity: 'right' });
  const before = clone(controller().stateReport());
  viewType('*');
  assert.equal(controller().currentRaw, before.currentRaw);
  assert.equal(controller().version, before.version);
  assert.equal(controller().past.length, before.undo);
  assert.equal(controller().future.length, before.redo);
  assert.deepEqual(clone(controller().rawSelection), before.rawSelection);
  assert.ok(controller().unresolvedIntent);
  assert.equal(controller().unresolvedIntent.raw, '*a*\n');
});

assert.deepEqual(virtualErrors, [], `jsdom runtime errors: ${virtualErrors.join('\n')}`);
dom.window.close();
if (failures.length) {
  console.error(`source-authority regression: ${failures.length} FAIL`);
  process.exitCode = 1;
} else {
  console.log('source-authority regression: 11 PASS');
}

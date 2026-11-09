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
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = raw => Buffer.from(raw, 'utf8').toString('hex');
const textarea = dom.window.document.querySelector('textarea');

function click(command) {
  const button = dom.window.document.querySelector(`button[data-command="${command}"]`);
  assert.ok(button, `button ${command}`);
  button.click();
}

function reopen(raw, caret = raw.length) {
  assert.equal(prototype.reopen(raw, { anchor: caret, head: caret, affinity: 'right' }), true);
  assert.ok(prototype.view.state === controller().state, 'view is synchronized after reopen');
}

function viewType(text, compositionId) {
  let transaction = prototype.view.state.tr.insertText(text);
  if (compositionId !== undefined) transaction = transaction.setMeta('composition', compositionId);
  prototype.view.dispatch(transaction);
  assert.ok(prototype.view.state === controller().state, 'input used the real EditorView dispatch path');
}

function assertEofContinuation(initial, insert, expected, expectedCaret) {
  reopen(initial);
  const acceptedAnchor = clone(controller().projection.anchors).find(anchor => anchor.raw === initial.length);
  assert.ok(acceptedAnchor, `accepted raw EOF anchor for ${JSON.stringify(initial)}`);
  const beforeBytes = bytes(controller().currentRaw);
  viewType(insert);
  assert.equal(controller().currentRaw, expected);
  assert.equal(bytes(controller().currentRaw), bytes(expected));
  assert.equal(controller().currentRaw.slice(0, initial.length), initial, 'accepted original bytes stay in place');
  assert.equal(beforeBytes, bytes(initial));
  assert.deepEqual(clone(controller().rawSelection), { anchor: expectedCaret, head: expectedCaret, affinity: 'right' });
  assert.equal(controller().unresolvedIntent, null);
  assert.equal(controller().saveEligible, true, 'the shared projection remains auditable');
  assert.match(controller().projection.provenance[0], /accepted raw EOF anchor reveals/);
  assert.equal(controller().projection.kind, 'exact', 'internal EOL is projected with its real semantics');
  const acceptedDocument = controller().state.doc;
  const reloaded = new (controller().constructor)(expected);
  assert.ok(reloaded.state.doc.eq(acceptedDocument), 'same bytes must have the same semantic document after reopening');
}

try {
  // The manager's minimal counterexample plus byte/anchor provenance.
  assertEofContinuation('a\n', 'X', 'a\nX', 3);

  // EOL/BOM controls and the no-trailing-EOL exact control.
  assertEofContinuation('a\r\n', 'X', 'a\r\nX', 4);
  assertEofContinuation('\uFEFFa\n', '中', '\uFEFFa\n中', 4);
  reopen('a');
  viewType('X');
  assert.equal(controller().currentRaw, 'aX');
  assert.equal(controller().projection.kind, 'exact');

  // Repeated text and adjacent marks use the same raw-anchor proof, then keep editing.
  assertEofContinuation('aa aa\n', 'X', 'aa aa\nX', 7);
  viewType('Y');
  assert.equal(controller().currentRaw, 'aa aa\nXY');
  assertEofContinuation('[a](u)\n', 'X', '[a](u)\nX', 8);
  viewType('Y');
  assert.equal(controller().currentRaw, '[a](u)\nXY');

  // Undo/Redo restore exact bytes and the accepted EOF raw selection.
  reopen('a\n');
  viewType('X');
  assert.equal(prototype.run('undo'), true);
  assert.equal(bytes(controller().currentRaw), '610a');
  assert.deepEqual(clone(controller().rawSelection), { anchor: 2, head: 2, affinity: 'right' });
  assert.equal(prototype.run('redo'), true);
  assert.equal(bytes(controller().currentRaw), '610a58');
  assert.deepEqual(clone(controller().rawSelection), { anchor: 3, head: 3, affinity: 'right' });

  // Save and a source no-op do not consume an existing future branch.
  assert.equal(prototype.run('undo'), true);
  assert.equal(controller().future.length, 1);
  assert.equal(controller().saveMemory(), true);
  assert.equal(controller().future.length, 1);
  const beforeNoop = clone(controller().stateReport());
  assert.equal(controller().beginSource(), true);
  assert.equal(controller().applySource(), true);
  assert.deepEqual(clone(controller().stateReport()), beforeNoop);
  assert.equal(prototype.run('redo'), true);
  assert.equal(controller().currentRaw, 'a\nX');

  // A real DOM source commit carries its EOF draft caret into visual dispatch.
  reopen('a', 1);
  click('source');
  textarea.value = 'a\n';
  textarea.setSelectionRange(2, 2);
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  click('apply');
  assert.equal(controller().currentRaw, 'a\n');
  assert.deepEqual(clone(controller().rawSelection), { anchor: 2, head: 2, affinity: 'right' });
  viewType('X');
  assert.equal(controller().currentRaw, 'a\nX');

  // Synthetic composition at the same boundary is one history unit and never exposes pinyin after commit.
  reopen('a\n');
  prototype.view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
  viewType('zhongwen', 73);
  const compositionHead = prototype.view.state.selection.head;
  const finalTransaction = prototype.view.state.tr.insertText('中文', compositionHead - 'zhongwen'.length, compositionHead).setMeta('composition', 73);
  prototype.view.dispatch(finalTransaction);
  prototype.view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
  assert.equal(controller().currentRaw, 'a\n中文');
  assert.doesNotMatch(controller().currentRaw, /zhongwen/);
  assert.equal(controller().past.length, 1);
  assert.equal(prototype.run('undo'), true);
  assert.equal(controller().currentRaw, 'a\n');
  assert.equal(prototype.run('redo'), true);
  assert.equal(controller().currentRaw, 'a\n中文');

  assert.deepEqual(virtualErrors, [], `jsdom runtime errors: ${virtualErrors.join('\n')}`);
  console.log('source-authority EOF regression: 7 domains PASS (synthetic composition; not physical IME)');
} finally {
  dom.window.close();
}

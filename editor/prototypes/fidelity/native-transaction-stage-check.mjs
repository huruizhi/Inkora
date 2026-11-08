// INK-PROT-018 regression: real EditorView/keydown coverage for native
// transactions whose temporary empty block is not yet representable in Markdown.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextSelection } from 'prosemirror-state';

const here = new URL('.', import.meta.url);
const results = [];

function boot() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(String(error)));
  return readFile(new URL('PROTOTYPE.html', here), 'utf8').then(html => {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) { window.TextEncoder = TextEncoder; },
    });
    const prototype = dom.window.fidelityPrototype;
    assert.ok(prototype?.model && prototype?.view && prototype?.actions);
    return { dom, prototype, errors };
  });
}

function load(prototype, source = 'ab\n') {
  prototype.model.sourceEdit(source);
  prototype.model.past.length = 0;
  prototype.model.future.length = 0;
  prototype.model.saved = source;
  prototype.model.before = source;
  prototype.model.revision = 0;
  prototype.model.blocked = '';
  prototype.model.patches = [];
  prototype.run(() => {});
}

function select(prototype, position) {
  prototype.view.dispatch(prototype.model.state.tr.setSelection(
    TextSelection.create(prototype.model.state.doc, position),
  ));
}

function key(dom, prototype, name) {
  const event = new dom.window.KeyboardEvent('keydown', {
    key: name,
    code: name,
    bubbles: true,
    cancelable: true,
  });
  prototype.view.dom.dispatchEvent(event);
  return event;
}

function snapshot(prototype) {
  const model = prototype.model;
  const plain = value => JSON.parse(JSON.stringify(value));
  return {
    source: model.source,
    doc: plain(model.state.doc.toJSON()),
    selection: plain(model.state.selection.toJSON()),
    stage: model.staged ? {
      candidate: model.staged.candidate,
      anchors: plain(model.staged.anchors?.map(anchor => ({ ...anchor })) ?? []),
      kind: model.staged.kind,
    } : null,
    dirty: model.dirty,
    revision: model.revision,
    saveDisabled: prototype.view.dom.ownerDocument.getElementById('save').disabled,
    past: model.past.length,
    future: model.future.length,
  };
}

function assertSameLogicalState(actual, expected) {
  assert.equal(actual.source, expected.source);
  assert.deepEqual(actual.doc, expected.doc);
  assert.deepEqual(actual.selection, expected.selection);
  assert.deepEqual(actual.stage, expected.stage);
  assert.equal(actual.dirty, expected.dirty);
  assert.equal(actual.saveDisabled, expected.saveDisabled);
}

// Enter is independently undoable/redoable even before the empty paragraph
// can be committed to Markdown; typing after Redo must still complete it.
{
  const { dom, prototype: p, errors } = await boot();
  load(p);
  select(p, 3);
  key(dom, p, 'Enter');
  const entered = snapshot(p);
  assert.equal(entered.source, 'ab\n');
  assert.deepEqual(entered.doc.content.map(node => node.content?.[0]?.text ?? ''), ['ab', '']);
  assert.deepEqual(entered.selection, { type: 'text', anchor: 5, head: 5 });
  assert.equal(entered.stage.candidate, 'ab\n\n\n');
  assert.equal(entered.dirty, true);
  assert.equal(entered.revision, 1);
  assert.equal(entered.saveDisabled, true);
  assert.equal(entered.past, 1);

  p.run(p.actions.undo);
  const undone = snapshot(p);
  assert.equal(undone.stage, null);
  assert.equal(undone.source, 'ab\n');
  assert.deepEqual(undone.doc.content.map(node => node.content?.[0]?.text ?? ''), ['ab']);
  assert.equal(undone.dirty, false);
  assert.equal(undone.revision, 2);
  assert.equal(undone.future, 1);

  p.run(p.actions.redo);
  const redone = snapshot(p);
  assertSameLogicalState(redone, entered);
  assert.equal(redone.revision, 3);
  assert.equal(redone.future, 0);

  p.view.dispatch(p.model.state.tr.insertText('Z'));
  const committed = snapshot(p);
  assert.equal(committed.source, 'ab\n\nZ\n');
  assert.equal(committed.stage, null);
  assert.equal(committed.revision, 4);
  assert.deepEqual(committed.doc.content.map(node => node.content?.[0]?.text ?? ''), ['ab', 'Z']);
  p.run(p.actions.undo);
  const undoCommitted = snapshot(p);
  assertSameLogicalState(undoCommitted, entered);
  p.run(p.actions.redo);
  const redoCommitted = snapshot(p);
  assertSameLogicalState(redoCommitted, committed);
  results.push({ id: 'enter-undo-redo-type', entered, undone, redone, committed, undoCommitted, redoCommitted });
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Moving into the first paragraph while an empty second paragraph is staged
// must map input to the moved caret, keep it recoverable, and allow later input
// in the empty paragraph to make the candidate representable.
{
  const { dom, prototype: p, errors } = await boot();
  load(p);
  select(p, 3);
  key(dom, p, 'Enter');
  select(p, 2);
  p.view.dispatch(p.model.state.tr.insertText('X'));
  const movedEdit = snapshot(p);
  assert.equal(movedEdit.source, 'ab\n');
  assert.equal(movedEdit.stage.candidate, 'aXb\n\n\n');
  assert.deepEqual(movedEdit.doc.content.map(node => node.content?.[0]?.text ?? ''), ['aXb', '']);
  assert.deepEqual(movedEdit.selection, { type: 'text', anchor: 3, head: 3 });
  assert.equal(movedEdit.dirty, true);
  assert.equal(movedEdit.revision, 2);
  assert.equal(movedEdit.saveDisabled, true);

  p.run(p.actions.undo);
  const beforeMovedEdit = snapshot(p);
  assert.equal(beforeMovedEdit.stage.candidate, 'ab\n\n\n');
  assert.deepEqual(beforeMovedEdit.selection, { type: 'text', anchor: 2, head: 2 });
  assert.equal(beforeMovedEdit.future, 1);
  p.run(p.actions.redo);
  assertSameLogicalState(snapshot(p), movedEdit);

  select(p, 6);
  p.view.dispatch(p.model.state.tr.insertText('Y'));
  const completed = snapshot(p);
  assert.equal(completed.source, 'aXb\n\nY\n');
  assert.equal(completed.stage, null);
  assert.deepEqual(completed.doc.content.map(node => node.content?.[0]?.text ?? ''), ['aXb', 'Y']);
  p.run(p.actions.undo);
  const undoCompleted = snapshot(p);
  assert.equal(undoCompleted.stage.candidate, 'aXb\n\n\n');
  p.run(p.actions.redo);
  const redoCompleted = snapshot(p);
  assertSameLogicalState(redoCompleted, completed);
  results.push({ id: 'move-caret-edit-complete', movedEdit, beforeMovedEdit, completed, undoCompleted, redoCompleted });
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A new staged document edit after Undo creates a real history branch and
// invalidates the old future; a later non-staged edit invalidates staged Redo.
{
  const { dom, prototype: p, errors } = await boot();
  load(p);
  p.view.dispatch(p.model.state.tr.insertText('Q', 2));
  p.run(p.actions.undo);
  assert.equal(p.model.future.length, 1);
  select(p, 3);
  key(dom, p, 'Enter');
  assert.equal(p.model.future.length, 0);
  p.run(p.actions.undo);
  assert.equal(p.model.future.length, 1);
  select(p, 2);
  p.view.dispatch(p.model.state.tr.insertText('N'));
  assert.equal(p.model.source, 'aNb\n');
  assert.equal(p.model.future.length, 0);
  const branch = snapshot(p);
  p.run(p.actions.redo);
  assertSameLogicalState(snapshot(p), branch);
  results.push({ id: 'history-branch-invalidation', branch, futureAfterBranch: p.model.future.length });
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Unknown staged transactions are refused before model mutation. The blocked
// reason is new UI feedback; source/candidate/doc/selection/history stay exact.
{
  const { dom, prototype: p, errors } = await boot();
  load(p);
  select(p, 3);
  key(dom, p, 'Enter');
  select(p, 2);
  const before = snapshot(p);
  p.view.dispatch(p.model.state.tr.split(2));
  const after = snapshot(p);
  assertSameLogicalState(after, before);
  assert.equal(after.past, before.past);
  assert.equal(after.future, before.future);
  assert.match(p.model.blocked, /暂存结构之后的非文字事务尚未支持/);
  results.push({ id: 'unknown-staged-transaction-refusal', before, after, blocked: p.model.blocked });
  assert.deepEqual(errors, []);
  dom.window.close();
}

await writeFile(new URL('native-transaction-stage-results.json', here), `${JSON.stringify({
  task: 'INK-PROT-018',
  status: 'PASS',
  checks: results,
}, null, 2)}\n`);
console.log('PASS: 4 staged native transaction regressions');

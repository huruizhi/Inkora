// INK-PROT-025 deterministic synthetic/replay regression.
//
// This boots the real bundled EditorView and drives its public dispatch path.
// Synthetic composition events and replayed PM transactions are not evidence
// of a real WebKit/Sogou IME fix; physical-keyboard verification remains HITL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = new URL('.', import.meta.url);
const html = await readFile(new URL('PROTOTYPE.html', here), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function boot(source) {
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

function compositionEvent(dom, target, type, data) {
  target.dispatchEvent(new dom.window.CompositionEvent(type, {
    bubbles: true,
    data,
  }));
}

function replaceRange(prototype, from, to, insert, compositionId) {
  const transaction = prototype.model.state.tr
    .insertText(insert, from, to)
    .setMeta('composition', compositionId);
  prototype.view.dispatch(transaction);
  assert.equal(prototype.model.blocked, '');
  return { from, to: from + insert.length };
}

function replaySession(dom, prototype, { compositionId, from, to = from, markedValues, committed, endBeforeFinal = false }) {
  let range = { from, to };
  compositionEvent(dom, prototype.view.dom, 'compositionstart', '');
  for (const marked of markedValues) {
    range = replaceRange(prototype, range.from, range.to, marked, compositionId);
  }
  range = replaceRange(prototype, range.from, range.to, '', compositionId);
  if (endBeforeFinal) compositionEvent(dom, prototype.view.dom, 'compositionend', committed);
  range = replaceRange(prototype, range.from, range.to, committed, compositionId);
  if (!endBeforeFinal) compositionEvent(dom, prototype.view.dom, 'compositionend', committed);
  return range.to;
}

function findText(prototype, text, offset = text.length) {
  let found = -1;
  prototype.model.state.doc.descendants((node, position) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = position + index + offset;
  });
  assert.ok(found >= 0, `text not found: ${text}`);
  return found;
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

function select(prototype, from, to = from) {
  prototype.model.select(from, to);
  prototype.run(() => {});
}

// Minimal replay of the captured consecutive sessions (runtime seq24-74):
// marked text grows through phonetic values, WebKit removes it, and committed
// text is dispatched on both sides of compositionend. Every replacement uses
// EditorView.dispatch -> dispatchTransaction -> FidelityModel.
{
  const before = '组合前。\n';
  const final = '组合前。中文测试\n';
  const { dom, prototype: p, errors } = boot(before);
  select(p, 5);
  const afterFirst = replaySession(dom, p, {
    compositionId: 101,
    from: 5,
    markedValues: ['z', 'zh', 'zhong', "zhong'wen"],
    committed: '中文',
  });
  const firstSelection = p.model.state.selection.toJSON();
  replaySession(dom, p, {
    compositionId: 102,
    from: afterFirst,
    markedValues: ['c', 'ce', "ce's", "ce'sh", "ce'shi"],
    committed: '测试',
    // ProseMirror may flush the final DOMObserver transaction after end.
    endBeforeFinal: true,
  });
  const finalSelection = p.model.state.selection.toJSON();

  assert.equal(p.model.source, final);
  p.run(p.actions.undo);
  assert.equal(p.model.source, '组合前。中文\n');
  assert.deepEqual(p.model.state.selection.toJSON(), firstSelection);
  p.run(p.actions.undo);
  assert.equal(
    p.model.source,
    before,
    `Undo exposed an intermediate composition snapshot: ${JSON.stringify(p.model.source)}`,
  );
  assert.deepEqual(plain(p.model.state.selection.toJSON()), { type: 'text', anchor: 5, head: 5 });
  p.run(p.actions.redo);
  assert.equal(p.model.source, '组合前。中文\n');
  p.run(p.actions.redo);
  assert.equal(p.model.source, final);
  assert.deepEqual(p.model.state.selection.toJSON(), finalSelection);

  // A non-composition edit remains a separate step and branching after Undo
  // invalidates only the old future.
  const ordinaryAt = findText(p, '测试');
  p.view.dispatch(p.model.state.tr.insertText('!', ordinaryAt));
  assert.equal(p.model.source, '组合前。中文测试!\n');
  p.run(p.actions.undo);
  assert.equal(p.model.source, final);
  assert.equal(p.model.future.length, 1);
  p.view.dispatch(p.model.state.tr.insertText('新', ordinaryAt));
  assert.equal(p.model.source, '组合前。中文测试新\n');
  assert.equal(p.model.future.length, 0);
  const branch = p.model.source;
  p.run(p.actions.redo);
  assert.equal(p.model.source, branch);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Replacing a real selection is one composition unit. Undo restores both the
// selected bytes and its range; Redo restores the committed text and caret.
{
  const before = '左旧文右\n';
  const { dom, prototype: p, errors } = boot(before);
  const from = findText(p, '旧文', 0);
  const to = from + 2;
  select(p, from, to);
  replaySession(dom, p, {
    compositionId: 201,
    from,
    to,
    markedValues: ['x', 'xin'],
    committed: '新文',
  });
  const committedSelection = p.model.state.selection.toJSON();
  assert.equal(p.model.source, '左新文右\n');
  p.run(p.actions.undo);
  assert.equal(p.model.source, before);
  assert.deepEqual(plain(p.model.state.selection.toJSON()), { type: 'text', anchor: from, head: to });
  p.run(p.actions.redo);
  assert.equal(p.model.source, '左新文右\n');
  assert.deepEqual(p.model.state.selection.toJSON(), committedSelection);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A cancelled/no-op session must not create an Undo entry or destroy a future
// branch that existed before composition began.
{
  const before = '保留\n';
  const { dom, prototype: p, errors } = boot(before);
  const at = findText(p, '保留');
  p.view.dispatch(p.model.state.tr.insertText('旧', at));
  p.run(p.actions.undo);
  const history = { past: p.model.past.length, future: p.model.future.length };
  compositionEvent(dom, p.view.dom, 'compositionstart', '');
  let range = replaceRange(p, at, at, 'qu', 301);
  replaceRange(p, range.from, range.to, '', 301);
  compositionEvent(dom, p.view.dom, 'compositionend', '');
  assert.equal(p.model.source, before);
  assert.equal(p.model.past.length, history.past);
  assert.equal(p.model.future.length, history.future);
  p.run(p.actions.redo);
  assert.equal(p.model.source, '保留旧\n');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A composition can complete a pre-existing staged empty paragraph. Undo must
// restore the exact staged state rather than skipping or flattening it.
{
  const { dom, prototype: p, errors } = boot('ab\n');
  select(p, 3);
  key(dom, p, 'Enter');
  assert.ok(p.model.staged);
  const stagedCandidate = p.model.staged.candidate;
  const stagedSelection = p.model.state.selection.toJSON();
  compositionEvent(dom, p.view.dom, 'compositionstart', '');
  const stagedCommit = p.model.state.tr.insertText('中').setMeta('composition', 401);
  p.view.dispatch(stagedCommit);
  compositionEvent(dom, p.view.dom, 'compositionend', '中');
  assert.equal(p.model.blocked, '');
  assert.equal(p.model.source, 'ab\n\n中\n');
  assert.equal(p.model.staged, null);
  p.run(p.actions.undo);
  assert.equal(p.model.source, 'ab\n');
  assert.equal(p.model.staged.candidate, stagedCandidate);
  assert.deepEqual(p.model.state.selection.toJSON(), stagedSelection);
  p.run(p.actions.redo);
  assert.equal(p.model.source, 'ab\n\n中\n');
  assert.equal(p.model.staged, null);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Pending input remains byte-preserving and save-blocked across a composition
// unit; Undo/Redo crosses the unit without exposing its marked text.
{
  const pending = '正常\n\n$$\n未闭合\n';
  const { dom, prototype: p, errors } = boot(pending);
  assert.ok(p.model.pending);
  const at = findText(p, '正常');
  select(p, at);
  compositionEvent(dom, p.view.dom, 'compositionstart', '');
  p.view.dispatch(p.model.state.tr.insertText('中', at, at).setMeta('composition', 501));
  compositionEvent(dom, p.view.dom, 'compositionend', '中');
  assert.equal(p.model.blocked, '');
  assert.ok(p.model.pending);
  assert.equal(p.model.source, '正常中\n\n$$\n未闭合\n');
  p.run(p.actions.undo);
  assert.equal(p.model.source, pending);
  assert.ok(p.model.pending);
  p.run(p.actions.redo);
  assert.equal(p.model.source, '正常中\n\n$$\n未闭合\n');
  assert.ok(p.model.pending);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Source-mode history and the in-memory savepoint continue to share the same
// snapshots after a visual composition commit.
{
  const { dom, prototype: p, errors } = boot('正文\n');
  const at = findText(p, '正文');
  select(p, at);
  replaySession(dom, p, {
    compositionId: 601,
    from: at,
    markedValues: ['z', 'zhong'],
    committed: '中',
  });
  assert.equal(p.model.source, '正文中\n');
  p.run(p.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  textarea.value = '正文中 源码\n';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  textarea.setSelectionRange('正文中 源码'.length, '正文中 源码'.length, 'forward');
  p.run(p.actions.apply);
  assert.equal(p.model.source, '正文中 源码\n');
  p.run(p.actions.save);
  assert.equal(p.model.dirty, false);
  p.run(p.actions.undo);
  assert.equal(p.model.source, '正文中\n');
  assert.equal(p.model.dirty, true);
  p.run(p.actions.redo);
  assert.equal(p.model.source, '正文中 源码\n');
  assert.equal(p.model.dirty, false);
  assert.deepEqual(errors, []);
  dom.window.close();
}

console.log('visual IME history synthetic/replay: 6/6 PASS (real IME retest required)');

// PROTOTYPE non-UI walkthrough evidence. jsdom is not WKWebView/IME acceptance.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const here = new URL('.', import.meta.url);
const errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e)));
const dom = new JSDOM(await readFile(new URL('PROTOTYPE.html', here), 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.TextEncoder = TextEncoder; } });
const p = dom.window.fidelityPrototype;
assert.ok(p, 'real PM bundle boots');
const results = [];
const initial = p.model.source;
const step = id => { p.run(p.actions[id]); assert.equal(p.model.blocked, '', id); assert.ok(p.parse(p.model.source).doc.eq(p.model.state.doc)); };
for (const id of ['text', 'strong', 'heading', 'task', 'split', 'join']) {
  const before = p.model.source;
  step(id);
  const patches = [...p.model.patches].sort((a,b) => a.from-b.from);
  let expected = '', cursor = 0;
  for (const patch of patches) { assert.ok(patch.from >= cursor); expected += before.slice(cursor, patch.from) + patch.insert; cursor = patch.to; }
  expected += before.slice(cursor);
  assert.equal(p.model.source, expected);
  // Every untouched interval is copied byte-for-byte by the actual patch operation.
  assert.ok(p.model.source.includes('😀 e\u0301'));
  assert.ok(p.model.source.includes('$$\nx^2 + y^2\n$$'));
  assert.ok(p.model.source.includes('[ref]: <https://example.invalid> "标题"'));
  results.push({ action: id, patches, byteDiff: p.diff(before,p.model.source), pmEquivalent: true });
}
const edited = p.model.source, selection = p.model.state.selection.toJSON();
step('format'); assert.ok(p.model.source.includes('[ref]:   '));
assert.deepEqual(p.model.state.selection.toJSON(), selection);
const formatted = p.model.source;
step('undo'); assert.equal(p.model.source, edited);
step('redo'); assert.equal(p.model.source, formatted);
results.push({ action: 'source format / cross-mode undo-redo', passed: true, selectionPreserved: true });
step('save'); assert.equal(p.model.saved, formatted);
const trusted = p.model.source, trustedDoc = p.model.state.doc;
const corrupt = trusted.replace('\n$$\n\n|', '\n$\n\n|');
p.run(p.actions.malformed);
assert.equal(p.model.blocked, '');
assert.ok(p.model.pending && p.model.issues.length === 1 && p.model.issues[0].code === 'math');
assert.equal(p.model.source, corrupt); // 用户含混输入保留在缓冲，不被丢弃
assert.ok(p.parse(p.model.source).doc.eq(p.model.state.doc)); // 当前视图即缓冲的保守投影
assert.ok(!p.model.state.doc.eq(trustedDoc));
assert.ok(dom.window.document.getElementById('save').disabled);
assert.ok(p.view.dom.querySelector('section.protected-block.protected-issue'));
results.push({ action: 'malformed → pending', issues: p.model.issues, bufferKept: true, dirty: p.model.source !== p.model.saved, saveBlocked: true });
// Undo 恢复一致性：字节与 PM 文档回到可信状态，pending 清除。
p.run(p.actions.undo);
assert.equal(p.model.source, trusted); assert.ok(!p.model.pending);
assert.ok(p.model.state.doc.eq(trustedDoc));
// 主动修复路径同样恢复最近一次可信快照。
p.run(p.actions.malformed);
p.run(p.actions.repair);
  assert.equal(p.model.source, trusted); assert.ok(!p.model.pending); assert.equal(p.model.blocked, '');
  // Undo after the repair restores the ambiguous buffer byte-exactly (typed
  // input lives in the shared history, never dropped) with its mapped
  // selection; redo returns to the repaired trusted bytes.
  p.run(p.actions.undo);
  assert.equal(p.model.source, corrupt); assert.ok(p.model.pending && p.model.issues[0].code === 'math');
  assert.equal(p.model.state.doc.textBetween(p.model.state.selection.head - 1, p.model.state.selection.head), '。');
  p.run(p.actions.redo);
  assert.equal(p.model.source, trusted); assert.ok(!p.model.pending);
  results.push({ action: 'undo / repair restore consistency', byteExact: true, pendingCleared: true, undoKeepsAmbiguousInput: true });
step('reset'); assert.equal(p.model.source,initial);
// Native PM text transaction path, including a UTF-16 surrogate pair.
let at;
p.model.state.doc.descendants((n,pos) => { if(n.isText && n.text.includes('😀')) at=pos+n.text.indexOf('😀'); });
p.view.dispatch(p.model.state.tr.insertText('🦊',at,at+2));
assert.equal(p.model.blocked,''); assert.ok(p.model.source.includes('🦊 e\u0301'));
results.push({ action: 'native PM replace emoji', byteDiff: p.diff(initial,p.model.source), pmEquivalent: true });
// BOM input stays byte-exact through a body edit.
p.model.sourceEdit('\uFEFF' + initial);
step('text'); assert.ok(p.model.source.startsWith('\uFEFF')); assert.ok(p.model.source.includes('\r\n'));
results.push({ action: 'BOM / mixed EOL body edit', passed: true });
// Unsupported structural transaction is rejected, never silently serialized.
step('reset'); const old = p.model.source;
p.model.state.doc.descendants((n,pos) => { if(n.isText && n.text.includes('中文正文')) at=pos+2; });
p.view.dispatch(p.model.state.tr.split(at)); assert.ok(p.model.blocked); assert.equal(p.model.source,old);
results.push({ action: 'unsupported native split', blocked: p.model.blocked, trustedBytesPreserved:true });
// Source draft no-op via the production TextAreaEditorKernel round trip.
step('reset');
{
  const m = p.model, snap = { source: m.source, saved: m.saved, revision: m.revision, past: m.past.length, future: m.future.length };
  const selSnap = m.state.selection.toJSON();
  step('source'); step('apply');
  assert.equal(m.source, snap.source); assert.equal(m.saved, snap.saved);
  assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past); assert.equal(m.future.length, snap.future);
  assert.deepEqual(m.state.selection.toJSON(), selSnap); // no-op keeps the selection too
  results.push({ action: 'source draft no-op round trip', bytesDirtyRevisionHistoryUnchanged: true, selectionUnchanged: true });
}
// Draft with one format change keeps every other CRLF/LF byte.
{
  const crlf = (p.model.source.match(/\r\n/g) || []).length;
  step('format'); assert.ok(p.model.source.includes('[ref]:   '));
  assert.equal((p.model.source.match(/\r\n/g) || []).length, crlf);
  assert.ok(p.model.source.includes('😀 e\u0301')); assert.ok(p.model.source.includes('\r\n\r\n中文'));
  results.push({ action: 'draft format-only edit', crlfCountPreserved: true });
}
// A newline inserted in a CRLF line inherits CRLF; undo restores exact bytes.
{
  const before = p.model.source;
  const src = dom.window.document.getElementById('source-draft');
  p.run(p.actions.source);
  src.value = src.value.replace('# 原型标题\n', '# 原型\n标题\n'); src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.apply);
  assert.ok(p.model.source.includes('# 原型\r\n标题'));
  p.run(p.actions.undo);
  assert.equal(p.model.source, before);
  results.push({ action: 'draft newline inherits CRLF', inherited: '\r\n', undoByteExact: true });
}
// Canceling a modified draft leaves trusted content and the textarea untouched.
{
  const m = p.model, snap = { source: m.source, revision: m.revision, past: m.past.length };
  const src = dom.window.document.getElementById('source-draft');
  p.run(p.actions.source);
  src.value = src.value.replace('中文正文', '草稿改动'); src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.cancel);
  assert.equal(m.source, snap.source); assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past);
  assert.equal(src.value, m.source.replace(/\r\n/g, '\n'));
  results.push({ action: 'draft cancel', trustedUnchanged: true, textareaReset: true });
}
// --- INK-PROT-010: source-mode selection wiring (real UI actions + kernel) ---
// Entering source mode maps the PM anchor/head onto the textarea LF selection;
// on a CRLF file the UTF-16 raw offset and the LF offset differ by exactly the
// CRLF pairs before the caret (never a scalar-offset guess through the emoji).
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  let at; m.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('😀')) at = pos + n.text.indexOf('😀') + 2; });
  m.select(at);
  p.run(p.actions.source);
  assert.ok(p.lastSelectionMap.ok && p.lastSelectionMap.stage === 'enter-source' && p.lastSelectionMap.snapped.length === 0);
  const s0 = src.selectionStart;
  assert.ok(src.value.slice(s0 - 2, s0) === '😀' && src.value[s0] === ' ');
  const crlfBefore = (m.source.slice(0, p.lastSelectionMap.anchor).match(/\r\n/g) || []).length;
  assert.equal(p.lastSelectionMap.anchor - s0, crlfBefore);
  // Type through the real input path; apply maps the textarea caret back onto
  // the NEW document at a content anchor derived from the text, not a number.
  src.value = src.value.slice(0, s0) + '锚点' + src.value.slice(s0);
  src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(s0 + 2, s0 + 2, 'forward');
  p.run(p.actions.apply);
  assert.equal(m.blocked, ''); assert.ok(p.lastSelectionMap.ok && p.lastSelectionMap.stage === 'apply-source' && p.lastSelectionMap.snapped.length === 0);
  assert.ok(m.source.includes('😀锚点'));
  assert.ok(m.state.selection.anchor === m.state.selection.head);
  assert.equal(m.state.doc.textBetween(m.state.selection.head - 2, m.state.selection.head), '锚点');
  assert.equal(m.state.doc.textBetween(m.state.selection.head - 4, m.state.selection.head - 2), '😀');
  p.run(p.actions.undo); // cross-mode undo restores bytes AND the pre-edit selection
  assert.ok(!m.source.includes('😀锚点'));
  assert.equal(m.state.selection.anchor, at); assert.equal(m.state.selection.head, at);
  results.push({ action: 'source selection round trip (CRLF + emoji)', enterMapped: true, rawLfDelta: crlfBefore, applyMappedToContentAnchor: true, undoRestoresSelection: true });
}
// Backward selection keeps its direction through the whole loop; cancel keeps
// the original visual selection untouched.
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  let h; m.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('特殊')) h = pos + n.text.indexOf('特殊'); });
  m.select(h + 2, h); // backward: anchor after 特殊, head before it
  assert.ok(m.state.selection.anchor > m.state.selection.head);
  p.run(p.actions.source);
  assert.equal(src.selectionDirection, 'backward');
  assert.ok(src.value.slice(src.selectionStart, src.selectionStart + 2) === '特殊');
  assert.ok(src.value.slice(src.selectionEnd - 2, src.selectionEnd) === '特殊');
  p.run(p.actions.cancel); // unedited draft: cancel keeps the visual selection
  assert.ok(m.state.selection.anchor === h + 2 && m.state.selection.head === h);
  assert.equal(src.value, m.source.replace(/\r\n/g, '\n'));
  p.run(p.actions.source);
  const s0 = src.selectionStart, e0 = src.selectionEnd;
  src.value = src.value.slice(0, s0) + '特别' + src.value.slice(e0);
  src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(s0, s0 + 2, 'backward');
  p.run(p.actions.apply);
  assert.ok(m.state.selection.anchor > m.state.selection.head);
  assert.equal(m.state.doc.textBetween(m.state.selection.head, m.state.selection.anchor), '特别');
  assert.ok(m.source.includes('特别\t空白'));
  results.push({ action: 'backward selection direction kept', textareaDirection: 'backward', pmDirectionAfterApply: 'backward', cancelKeepsSelection: true });
}
// Mapping failure never resets silently: the draft, the trusted bytes, the
// history and the original selection all stay; a safe anchor retries.
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  const snap = { source: m.source, revision: m.revision, past: m.past.length, sel: m.state.selection.toJSON() };
  p.run(p.actions.source);
  const fence = src.value.indexOf('x^2') + 1;
  src.value = src.value.replace('# 原型标题', '# 原型题目'); src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(fence, fence, 'forward'); // caret inside the protected math fence
  p.run(p.actions.apply);
  assert.equal(p.sourceMode, true); // commit refused, draft kept
  assert.equal(m.source, snap.source); assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past);
  assert.deepEqual(m.state.selection.toJSON(), snap.sel); // original selection kept
  assert.ok(src.value.includes('# 原型题目')); // draft preserved
  assert.ok(!p.lastSelectionMap.ok && p.lastSelectionMap.reason.includes('受保护块'));
  src.setSelectionRange(src.value.indexOf('题目') + 2, src.value.indexOf('题目') + 2, 'forward');
  p.run(p.actions.apply); // retry from a safe anchor: repair stays reachable
  assert.equal(p.sourceMode, false); assert.equal(m.blocked, '');
  assert.ok(m.source.includes('# 原型题目'));
  assert.equal(m.state.doc.textBetween(m.state.selection.head - 2, m.state.selection.head), '题目');
  results.push({ action: 'mapping failure keeps draft and selection', reason: '受保护块', retryFromSafeAnchor: true });
}
// A buffer with no text anchor at all (only protected blocks) still commits
// with the reason stated — mapping never disables the repair entry.
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  // Two protected blocks: the source caret sits inside the SECOND fence, so
  // the fallback NodeSelection must anchor that owner block, not block 0 and
  // not a reset text cursor.
  m.sourceEdit('$$\na = 1\n$$\n\n$$\nb = 2\n$$\n'); m.past.length = 0; m.future.length = 0; m.saved = m.source;
  const revised = m.source.replace('b = 2', 'b = 3');
  p.run(p.actions.source);
  assert.ok(!p.lastSelectionMap.ok && p.lastSelectionMap.stage === 'enter-source'); // entry not blocked
  const caret = src.value.indexOf('b = 2') + 1;
  src.value = revised; src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(caret, caret, 'forward');
  p.run(p.actions.apply);
  assert.equal(p.sourceMode, false); assert.equal(m.source, revised);
  const sel = m.state.selection;
  assert.equal(sel.toJSON().type, 'node'); // NodeSelection, never a silent text-cursor reset
  assert.equal(sel.node.type.name, 'protected_block');
  assert.equal(sel.from, m.ranges[1].pos); // owner = block containing the source caret
  assert.equal(m.past.length, 1); assert.ok(m.source !== m.saved); assert.ok(!m.pending);
  assert.ok(!p.lastSelectionMap.ok && p.lastSelectionMap.noTextAnchor === true && p.lastSelectionMap.fallback === `node-selection@${m.ranges[1].pos}`);
  results.push({ action: 'textless buffer: owner-range NodeSelection fallback', committed: true, selectionType: 'node', ownerBlock: 2, dirty: true, mappingVerdict: 'unsupported (recorded, not passed)' });
}
// Manager counterexample (fixed): deleting the whole buffer must return to a
// legal empty-paragraph document with the unique insertion point selected —
// previously this half-committed (revision+1, past+1, source emptied) and then
// crashed on owner.pos with the model stuck in source mode.
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  const whole = p.samples.default;
  let anchor; m.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('中文正文')) anchor = pos + n.text.indexOf('中文正文') + 2; });
  m.select(anchor); // concrete pre-edit caret for the undo assertion
  const r0 = m.revision, past0 = m.past.length;
  p.run(p.actions.source);
  src.value = ''; src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(0, 0, 'forward');
  p.run(p.actions.apply);
  assert.equal(p.sourceMode, false); assert.equal(m.blocked, '');
  assert.equal(m.source, ''); assert.notEqual(m.source, m.saved); // empty buffer committed, dirty
  assert.equal(m.revision, r0 + 1); assert.equal(m.past.length, past0 + 1); // exactly one clean commit
  const sel = m.state.selection;
  assert.equal(sel.toJSON().type, 'text'); // NOT a NodeSelection, NOT a reset
  assert.ok(sel.anchor === 1 && sel.head === 1); // unique insertion point of the empty paragraph
  assert.equal(p.lastSelectionMap.fallback, 'empty-paragraph-text@1');
  // Undo restores the original bytes AND the pre-edit anchor; redo returns to empty.
  p.run(p.actions.undo);
  assert.equal(m.source, whole); assert.equal(m.source, m.saved);
  assert.equal(m.state.selection.anchor, anchor); assert.equal(m.state.selection.head, anchor);
  p.run(p.actions.redo);
  assert.equal(m.source, ''); assert.ok(m.state.selection.anchor === 1 && m.state.selection.head === 1);
  // Empty document in source mode: entry mapping is unavailable (reason shown)
  // but the repair entry stays open; no-op commit keeps everything; a modified
  // draft cancels back to the same empty view and selection.
  const snap = { revision: m.revision, past: m.past.length, future: m.future.length, sel: m.state.selection.toJSON() };
  p.run(p.actions.source);
  assert.ok(!p.lastSelectionMap.ok && p.lastSelectionMap.stage === 'enter-source');
  p.run(p.actions.apply); // draft untouched → no-op
  assert.equal(p.sourceMode, false);
  assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past); assert.equal(m.future.length, snap.future);
  assert.deepEqual(m.state.selection.toJSON(), snap.sel);
  p.run(p.actions.source);
  src.value = '残稿'; src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.cancel);
  assert.equal(p.sourceMode, false); assert.equal(m.source, ''); assert.equal(m.revision, snap.revision);
  assert.deepEqual(m.state.selection.toJSON(), snap.sel);
  assert.equal(src.value, ''); // textarea reset by the trusted (empty) source
  results.push({ action: 'delete-all → empty-paragraph insertion point (manager counterexample)', fixed: true, previously: 'half-commit + TypeError owner.pos', selectionType: 'text@1', undoRestoresAnchor: true, noopAndCancelOnEmpty: true });
}
// An uncommitted draft is never discarded by history actions: Undo/Redo are
// refused while the draft differs (even with an empty history, where travel
// would be a no-op but the mode switch would still clobber the textarea).
step('reset');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  const snap = { source: m.source, revision: m.revision, past: m.past.length };
  p.run(p.actions.source);
  src.value = src.value.replace('中文正文', '草稿改动'); src.dispatchEvent(new dom.window.Event('input'));
  const draft = src.value;
  assert.notEqual(draft, m.source.replace(/\r\n/g, '\n')); // draft really differs
  p.run(p.actions.undo);
  assert.equal(p.sourceMode, true); assert.equal(src.value, draft); // DOM textarea keeps the input
  assert.equal(m.source, snap.source); assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past);
  p.run(p.actions.redo);
  assert.equal(p.sourceMode, true); assert.equal(src.value, draft);
  p.run(p.actions.cancel); // explicit exit still available
  assert.equal(p.sourceMode, false); assert.equal(m.source, snap.source);
  results.push({ action: 'draft kept across refused Undo/Redo (empty history)', textareaValueKept: true, explicitCancelExit: true });
}
// Same refusal after a mapping failure, now with committed history present:
// the draft survives and the history stacks are untouched.
step('reset');
p.run(p.actions.text); // create a committed history entry first
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  const snap = { source: m.source, revision: m.revision, past: m.past.length };
  p.run(p.actions.source);
  const fence = src.value.indexOf('x^2') + 1;
  src.value = src.value.replace('# 原型标题', '# 原型题目'); src.dispatchEvent(new dom.window.Event('input'));
  src.setSelectionRange(fence, fence, 'forward');
  p.run(p.actions.apply); // fails: caret inside the protected fence
  assert.equal(p.sourceMode, true);
  const draft = src.value;
  p.run(p.actions.undo); // refused, not a mode switch
  assert.equal(p.sourceMode, true); assert.equal(src.value, draft);
  assert.equal(m.source, snap.source); assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past);
  p.run(p.actions.redo);
  assert.equal(p.sourceMode, true); assert.equal(src.value, draft);
  p.run(p.actions.cancel);
  assert.equal(p.sourceMode, false); assert.equal(m.source, snap.source);
  results.push({ action: 'mapping-failure draft kept across refused Undo/Redo', textareaValueKept: true, historyUntouched: true });
}
// BOM buffer: caret maps exactly and the BOM byte stays visible in the draft.
step('openMixed');
{
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  let at; m.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('逐字节保留')) at = pos + n.text.indexOf('逐字节保留') + 5; });
  m.select(at);
  p.run(p.actions.source);
  assert.equal(src.value[0], '\uFEFF');
  assert.ok(src.value.slice(src.selectionStart - 1, src.selectionStart) === '留' && src.value[src.selectionStart] === '。');
  assert.ok(p.lastSelectionMap.ok && p.lastSelectionMap.snapped.length === 0);
  p.run(p.actions.cancel);
  results.push({ action: 'BOM buffer selection mapping', bomPreservedInDraft: true, anchorExact: true });
}
// Mixed protected-fragment sample (BOM + math fence + HTML comment with literal $x$
// + footnote reference + callout): opens clean, byte-identical, fragments intact.
step('openMixed');
{
  const kinds = []; p.model.state.doc.forEach(n => kinds.push(n.type.name));
  assert.deepEqual(kinds, ['heading', 'paragraph', 'protected_block', 'protected_block', 'protected_block', 'paragraph']);
  assert.equal(p.model.issues.length, 0);
  const fragments = () => p.model.ranges.filter(r => r.kind === 'protected_block').map(r => p.model.source.slice(r.start, r.end));
  const opened = fragments();
  assert.equal(opened[0], '$$\nE = mc^2\n$$');
  assert.equal(opened[1], '<!-- 注释内部含 [[bad 与 $x$，均为字面量 -->\n脚注引用在这里[^1]，行尾两个空格  ');
  assert.equal(opened[2], '> [!note] 标题存在\n> 引用正文样式保持。');
  assert.equal(Buffer.from(p.model.source, 'utf8').length, 359); // 与独立样稿 case02 输入同字节
  p.run(p.actions.save); assert.equal(p.model.saved, p.model.source);
  results.push({ action: 'mixed sample open (BOM/comment/callout/footnote)', pendingIssues: 0, bytes: 359, saveAllowed: true });
  let at; p.model.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('逐字节保留')) at = pos + n.text.indexOf('逐字节保留'); });
  p.view.dispatch(p.model.state.tr.insertText('逐字节不变', at, at + 5));
  assert.equal(p.model.blocked, ''); assert.ok(!p.model.pending);
  assert.deepEqual(fragments(), opened);
  let at2; p.model.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('收尾段落包含')) at2 = pos + n.text.indexOf('收尾段落包含'); });
  p.view.dispatch(p.model.state.tr.insertText('结束段落包含', at2, at2 + 6));
  assert.equal(p.model.blocked, ''); assert.ok(!p.model.pending);
  assert.deepEqual(fragments(), opened);
  assert.ok(p.model.source.startsWith('\uFEFF'));
  results.push({ action: 'mixed body edits keep fragment bytes', fragmentsByteExact: true, bomPreserved: true });
}
// Editing an ambiguity into the buffer: pending keeps the typed input, blocks saves,
// keeps the conservative projection editable, and undo restores consistency.
step('openMixed');
{
  const whole = '收尾段落包含一个制表符→\t←结束。';
  let at3; p.model.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes(whole)) at3 = pos + n.text.indexOf(whole); });
  p.view.dispatch(p.model.state.tr.insertText('$$\n' + whole, at3, at3 + whole.length));
  assert.equal(p.model.blocked, '');
  assert.ok(p.model.pending && p.model.issues.length === 1 && p.model.issues[0].code === 'math');
  assert.ok(p.model.source.includes('$$\n收尾段落包含'));
  assert.ok(dom.window.document.getElementById('save').disabled);
  assert.ok(p.model.source !== p.model.saved);
  let at4; p.model.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('逐字节保留')) at4 = pos + n.text.indexOf('逐字节保留'); });
  p.view.dispatch(p.model.state.tr.insertText('逐字节不变', at4, at4 + 5));
  assert.equal(p.model.blocked, ''); assert.ok(p.model.pending);
  assert.ok(p.model.source.includes('逐字节不变'));
  p.run(p.actions.undo); p.run(p.actions.undo);
  assert.equal(p.model.source, p.samples.mixed); assert.ok(!p.model.pending);
  assert.equal(p.model.source, p.model.saved);
  results.push({ action: 'visual ambiguity → pending/undo', bufferKept: true, saveBlocked: true, bodyEditableWhilePending: true, undoConsistent: true });
}
// Malformed open path: trusted view kept, problem marked, no dirty, save rejected.
step('openMalformed');
{
  assert.ok(p.model.pending && p.model.issues.length === 1);
  assert.equal(p.model.source, p.samples.malformed);
  assert.equal(p.model.source, p.model.saved); // 打开本身不置 dirty
  assert.ok(dom.window.document.getElementById('save').disabled);
  assert.ok(p.view.dom.querySelector('h1') && p.view.dom.querySelector('p'));
  assert.ok(p.view.dom.querySelector('section.protected-block.protected-issue'));
  assert.ok(!p.sourceMode); // 未整篇切换源码模式
  p.run(p.actions.save);
  assert.ok(p.model.blocked.includes('保存阻断'));
  assert.equal(p.model.saved, p.samples.malformed);
  results.push({ action: 'malformed open', issues: p.model.issues.map(i => i.code), dirty: false, saveBlocked: true, mode: 'visual' });
  // 主动源码修复 → 围栏闭合 → 保存 → 以内存基线重开。
  const src = dom.window.document.getElementById('source-draft');
  p.run(p.actions.source);
  src.value = src.value.replace('\\int_0^1 x\\,dx', () => '\\int_0^1 x\\,dx\n$$');
  src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.apply);
  assert.ok(!p.model.pending); assert.equal(p.model.blocked, '');
  p.run(p.actions.save);
  const fixed = p.model.source;
  const reopened = new p.FidelityModel(fixed);
  assert.equal(reopened.issues.length, 0);
  const kinds = []; reopened.state.doc.forEach(n => kinds.push(n.type.name));
  assert.deepEqual(kinds, ['heading', 'paragraph', 'protected_block']);
  assert.equal(reopened.state.doc.child(2).attrs.raw, '$$\n\\int_0^1 x\\,dx\n$$');
  results.push({ action: 'malformed source fix + save + reopen', pendingCleared: true, savedBytes: Buffer.from(fixed, 'utf8').length, reopenedClean: true, mathFragmentRawExact: true });
}
// Reference links / images / bare URLs (INK-PROT-009): real PM link marks,
// image-only placeholders and mixed block structures. Distinct sample strings
// keep this independent from the frozen case03 fixture.
{
  const refDoc = ['\uFEFF# [参考与媒体][home]', '', '前 **粗体** [入口页][home] *强调* `代码`，折叠 [home][]、快捷 [home] 共存，裸 https://example.org/plain 不改写。', '', '图片前 **保留粗体** ![标识图][mark] 与 [旁链][home] 图片后。', '', '- 列表 [项目链接][home]', '', '> 引用 [引用链接][home]', '', '[home]: https://example.org/start "定义题名"', '[mark]: /static/mark.svg "图片题名"', ''].join('\n');
  p.model.sourceEdit(refDoc);
  p.run(() => {}); // render through the real UI path
  assert.ok(!p.model.pending && !p.model.blocked);
  assert.ok(!p.view.dom.querySelector('section.protected-block')); // 不是 raw 保护块
  const anchors = [...p.view.dom.querySelectorAll('a[href]')];
  assert.equal(anchors.length, 7); // 标题、完整/折叠/快捷、同段旁链、列表、引用
  assert.deepEqual(anchors.map(a => a.textContent), ['参考与媒体', '入口页', 'home', 'home', '旁链', '项目链接', '引用链接']);
  assert.ok(anchors.every(a => a.getAttribute('href') === 'https://example.org/start' && a.getAttribute('title') === '定义题名'));
  assert.equal(p.view.dom.querySelector('h1').textContent, '参考与媒体'); // 不显示 # 或引用定界符
  assert.equal(p.view.dom.querySelector('strong').textContent, '粗体');
  assert.equal(p.view.dom.querySelector('em').textContent, '强调');
  assert.equal(p.view.dom.querySelector('code').textContent, '代码');
  assert.equal(p.view.dom.querySelector('ul a').textContent, '项目链接');
  assert.equal(p.view.dom.querySelector('blockquote a').textContent, '引用链接');
  const image = p.view.dom.querySelector('span.image-ref[data-image-ref]');
  assert.equal(image.textContent, '标识图');
  assert.equal(image.getAttribute('data-image-ref'), '/static/mark.svg');
  assert.equal(image.getAttribute('data-image-source'), '![标识图][mark]');
  assert.equal(image.getAttribute('data-image-title'), '图片题名');
  assert.ok(image.getAttribute('title').includes('![标识图][mark]'));
  assert.equal(image.parentElement.textContent, '图片前 保留粗体 标识图 与 旁链 图片后。'); // 图片占位不吞同段正文/marks/link
  assert.equal([...p.view.dom.querySelectorAll('a')].filter(a => a.textContent.includes('https://example.org/plain')).length, 0); // bare URL 为普通文本
  assert.equal(p.model.source, refDoc); // 打开不改任何字节
  const defs = refDoc.split('\n').filter(l => /^\[[^\]]+\]: /.test(l)).join('\n');
  const at = needle => { let hit = -1; p.model.state.doc.descendants((n, pos) => { if (hit < 0 && n.isText && n.text.includes(needle)) hit = pos + n.text.indexOf(needle); }); assert.ok(hit >= 0, needle); return hit; };
  const edit = (find, replace) => p.view.dispatch(p.model.state.tr.insertText(replace, at(find), at(find) + find.length));
  edit('入口页', '门户页'); // 引用式链接显示文字
  edit('标识图', '标志图'); // 图片替代文字
  edit('https://example.org/plain', 'https://example.org/plain2'); // 裸地址区域
  assert.equal(p.model.blocked, '');
  const expected = refDoc.replace('入口页', '门户页').replace('标识图', '标志图').replace('https://example.org/plain', 'https://example.org/plain2');
  assert.equal(p.model.source, expected); // 仅三处目标字节变化
  assert.equal(p.model.source.split('\n').filter(l => /^\[[^\]]+\]: /.test(l)).join('\n'), defs); // 引用定义逐字节不变
  assert.ok(p.parse(p.model.source).doc.eq(p.model.state.doc)); // 重解析等价
  p.run(p.actions.save);
  assert.equal(p.model.saved, expected);
  p.run(p.actions.undo); p.run(p.actions.undo); p.run(p.actions.undo); assert.equal(p.model.source, refDoc); // 每事务一个快照，三次回到打开态
  results.push({ action: 'reference links / image placeholder / bare URL semantic projection', loadClean: true, realLinkMarks: true, mixedMarksKept: true, listAndQuoteEditable: true, imageScoped: true, editsByteExact: true, defsKept: true, undoByteExact: true });
  // 同 URL 两条定义 + 同段落重复显示文字：按 PM 位置编辑第二处，非首现盲取。
  const dupDoc = ['重复 [镜像][a] 与 [镜像][a] 两处。', '', '[a]: https://example.org/dup', '[b]: https://example.org/dup', ''].join('\n');
  p.model.sourceEdit(dupDoc);
  const hits = [];
  p.model.state.doc.descendants((n, pos) => { if (n.isText) { let i = n.text.indexOf('镜像'); while (i >= 0) { hits.push(pos + i); i = n.text.indexOf('镜像', i + 1); } } });
  assert.equal(hits.length, 2);
  p.view.dispatch(p.model.state.tr.insertText('映像', hits[1], hits[1] + 2));
  assert.equal(p.model.source, '重复 [镜像][a] 与 [映像][a] 两处。\n\n[a]: https://example.org/dup\n[b]: https://example.org/dup\n');
  results.push({ action: 'duplicate display text / same-URL definitions', secondOccurrenceEdited: true, firstUntouched: true, sameUrlDefsKept: true });
  // 定义缺失：未解析引用不阻断载入，正文仍可编辑。
  p.model.sourceEdit('幽灵 [ghost][nope] 待续。\n');
  assert.ok(!p.model.pending);
  p.view.dispatch(p.model.state.tr.insertText('待定义', at('待续'), at('待续') + 2));
  assert.equal(p.model.source, '幽灵 [ghost][nope] 待定义。\n');
  results.push({ action: 'missing reference definition', loadsClean: true, editable: true });
  // 定义前后空白（空行 + ≤3 空格缩进定义）：间隙干净、字节保留。
  const wsDoc = '正文一 [x][l]。\n\n   [l]: https://e.org/x "题"\n\n\n正文二 [l]。\n';
  p.model.sourceEdit(wsDoc);
  assert.ok(!p.model.pending);
  p.view.dispatch(p.model.state.tr.insertText('正文三', at('正文二'), at('正文二') + 3));
  assert.equal(p.model.source, '正文一 [x][l]。\n\n   [l]: https://e.org/x "题"\n\n\n正文三 [l]。\n');
  results.push({ action: 'whitespace around definitions', gapsClean: true, bytesKept: true });
  // BOM + CRLF 引用文档：字面叶经 CRLF 偏移映射，Undo 字节级还原。
  const crlfDoc = '\uFEFF# 链接 CRLF\r\n\r\n显示 [文字][d] 保持。\r\n\r\n[d]: https://e.org/crlf\r\n';
  p.model.sourceEdit(crlfDoc);
  assert.ok(!p.model.pending && p.model.source.startsWith('\uFEFF'));
  p.view.dispatch(p.model.state.tr.insertText('文案', at('文字'), at('文字') + 2));
  assert.equal(p.model.source, '\uFEFF# 链接 CRLF\r\n\r\n显示 [文案][d] 保持。\r\n\r\n[d]: https://e.org/crlf\r\n');
  p.run(p.actions.undo);
  assert.equal(p.model.source, crlfDoc);
  results.push({ action: 'BOM + CRLF reference doc', bomKept: true, crlfKept: true, undoByteExact: true });
  // 列表/引用内链接可载入且显示文字可按精确 PM 位置修改。
  const nestedDoc = '- 项 [链一][l]\n\n> 引 [链二][l]\n\n[l]: https://e.org/l "题"\n';
  p.model.sourceEdit(nestedDoc); p.run(() => {});
  assert.equal(p.view.dom.querySelector('ul a').textContent, '链一');
  assert.equal(p.view.dom.querySelector('blockquote a').textContent, '链二');
  edit('链一', '列表链'); edit('链二', '引用链');
  assert.equal(p.model.source, '- 项 [列表链][l]\n\n> 引 [引用链][l]\n\n[l]: https://e.org/l "题"\n');
  results.push({ action: 'links inside list and blockquote', loadClean: true, displayEditable: true, definitionKept: true });
  // The sequential inline ledger is deliberately not claimed as universal:
  // syntax markers that equal display text and escaped display text remain
  // unmappable. The re-parse guard keeps source/state trusted and blocks save.
  const destinationCollisionDoc = '[a](later)later\n';
  p.model.sourceEdit(destinationCollisionDoc); p.run(() => {});
  edit('later', 'after');
  assert.equal(p.model.source, destinationCollisionDoc);
  assert.ok(p.model.blocked.includes('补丁重解析与目标 PM 文档不一致'));
  assert.ok(dom.window.document.getElementById('save').disabled);
  const escapedDoc = '[A \\* B][r]\n\n[r]: https://e.org/r\n';
  p.model.sourceEdit(escapedDoc); p.run(() => {});
  edit('*', '星');
  assert.equal(p.model.source, escapedDoc);
  assert.ok(p.model.blocked.includes('选区不能安全映射到原文'));
  assert.ok(dom.window.document.getElementById('save').disabled);
  results.push({ action: 'inline ledger counterexamples', destinationTextCollisionBlocked: true, escapedDisplayBlocked: true, trustedSourceKept: true, saveBlocked: true });

  // INK-PROT-015 integration cross-scenario: link/image/adjacent marks travel
  // through the actual source-mode selection wiring and shared history. This
  // is intentionally one combined path rather than adding the independent 009
  // and 010 counts together.
  const crossDoc = ['# 组合文档', '', '前 **粗体** [链接][r] *强调* ![图片][img] `代码` 后。', '', '[r]: https://example.org/r "链接题名"', '[img]: /assets/local.png "图片题名"', ''].join('\n');
  p.model.sourceEdit(crossDoc); p.run(() => {});
  const m = p.model, src = dom.window.document.getElementById('source-draft');
  const linkStart = at('链接'), imageEnd = at('图片') + 2;
  m.select(imageEnd, linkStart); // backward PM selection across distinct marked leaves
  const beforeSelection = m.state.selection.toJSON();
  p.run(p.actions.source);
  assert.equal(src.selectionDirection, 'backward');
  assert.ok(p.lastSelectionMap.ok && p.lastSelectionMap.snapped.length === 0);
  assert.ok(src.value.slice(src.selectionStart, src.selectionEnd).includes('[链接][r]'));
  assert.ok(src.value.slice(src.selectionStart, src.selectionEnd).includes('![图片'));

  src.value = src.value.replace('[链接][r]', '[入口][r]').replace('![图片][img]', '![图示][img]');
  src.dispatchEvent(new dom.window.Event('input'));
  const draftLink = src.value.indexOf('入口');
  const draftImageEnd = src.value.indexOf('图示') + 2;
  src.setSelectionRange(draftLink, draftImageEnd, 'backward');
  p.run(p.actions.apply);
  assert.equal(m.blocked, ''); assert.equal(p.sourceMode, false);
  assert.ok(m.state.selection.anchor > m.state.selection.head);
  assert.equal(p.view.dom.querySelector('a[href="https://example.org/r"]').textContent, '入口');
  const crossImage = p.view.dom.querySelector('span.image-ref[data-image-ref="/assets/local.png"]');
  assert.equal(crossImage.textContent, '图示');
  assert.equal(crossImage.getAttribute('data-image-source'), '![图示][img]');
  assert.equal(p.view.dom.querySelector('strong').textContent, '粗体');
  assert.equal(p.view.dom.querySelector('em').textContent, '强调');
  assert.equal(p.view.dom.querySelector('code').textContent, '代码');
  assert.equal(p.view.dom.querySelectorAll('img').length, 0);
  const changedCrossDoc = crossDoc.replace('[链接][r]', '[入口][r]').replace('![图片][img]', '![图示][img]');
  assert.equal(m.source, changedCrossDoc);

  p.run(p.actions.undo);
  assert.equal(m.source, crossDoc);
  assert.deepEqual(m.state.selection.toJSON(), beforeSelection);
  p.run(p.actions.redo);
  assert.equal(m.source, changedCrossDoc);
  assert.ok(m.state.selection.anchor > m.state.selection.head);
  const redoSelection = m.state.selection.toJSON();
  const redoRevision = m.revision, redoPast = m.past.length, redoFuture = m.future.length;
  p.run(p.actions.source); p.run(p.actions.apply); // byte-identical no-op
  assert.equal(m.source, changedCrossDoc); assert.deepEqual(m.state.selection.toJSON(), redoSelection);
  assert.equal(m.revision, redoRevision); assert.equal(m.past.length, redoPast); assert.equal(m.future.length, redoFuture);

  p.run(p.actions.source);
  src.value = src.value.replace('粗体', '未提交'); src.dispatchEvent(new dom.window.Event('input'));
  const cancelDraft = src.value;
  p.run(p.actions.cancel);
  assert.notEqual(cancelDraft, changedCrossDoc); assert.equal(m.source, changedCrossDoc);
  assert.deepEqual(m.state.selection.toJSON(), redoSelection);
  assert.equal(src.value, changedCrossDoc);
  assert.equal(p.view.dom.querySelectorAll('img').length, 0);
  results.push({ action: 'link/image source selection integration', sourceEditsByteExact: true, backwardSelectionKept: true, adjacentMarksKept: true, imagePlaceholderScoped: true, noResourceElement: true, undoRedoByteAndSelectionExact: true, noopPreservesHistory: true, cancelKeepsTrustedState: true });
  p.run(p.actions.reset);
}
assert.deepEqual(errors, []);
const report = { environment: 'Node + jsdom (non-UI only)', baseline: '57aeaac18e41c7191b1be851b284aae8c1b1bbae', results, unexecuted: ['WKWebView', 'system Chinese IME', 'native save/reopen', 'HITL', 'independent OMP fixtures'] };
await writeFile(new URL('evidence.json',here), JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${results.length} reproducible checks; evidence.json written. Not UI/IME acceptance.`);
dom.window.close();

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
assert.deepEqual(errors, []);
const report = { environment: 'Node + jsdom (non-UI only)', baseline: '57aeaac18e41c7191b1be851b284aae8c1b1bbae', results, unexecuted: ['WKWebView', 'system Chinese IME', 'native save/reopen', 'HITL', 'independent OMP fixtures'] };
await writeFile(new URL('evidence.json',here), JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${results.length} reproducible checks; evidence.json written. Not UI/IME acceptance.`);
dom.window.close();

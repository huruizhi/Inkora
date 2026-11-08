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
p.run(p.actions.malformed); assert.ok(p.model.blocked); assert.equal(p.model.source,trusted); assert.ok(p.model.state.doc.eq(trustedDoc));
assert.ok(dom.window.document.getElementById('save').disabled);
results.push({ action: 'malformed', blocked: p.model.blocked, trustedBytesPreserved: true });
step('repair'); assert.equal(p.model.source, trusted);
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
  step('source'); step('apply');
  assert.equal(m.source, snap.source); assert.equal(m.saved, snap.saved);
  assert.equal(m.revision, snap.revision); assert.equal(m.past.length, snap.past); assert.equal(m.future.length, snap.future);
  results.push({ action: 'source draft no-op round trip', bytesDirtyRevisionHistoryUnchanged: true });
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
assert.deepEqual(errors, []);
const report = { environment: 'Node + jsdom (non-UI only)', baseline: '57aeaac18e41c7191b1be851b284aae8c1b1bbae', results, unexecuted: ['WKWebView', 'system Chinese IME', 'native save/reopen', 'HITL', 'independent OMP fixtures'] };
await writeFile(new URL('evidence.json',here), JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${results.length} reproducible checks; evidence.json written. Not UI/IME acceptance.`);
dom.window.close();

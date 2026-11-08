// INK-PROT-027: continuous native-transaction input regression.
// Real bundled EditorView/dispatch; not physical keyboard or real IME.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextSelection } from 'prosemirror-state';

const html = await readFile(new URL('PROTOTYPE.html', import.meta.url), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e)));
const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true,
  virtualConsole:vc, beforeParse(w) { w.TextEncoder = TextEncoder; }});
const p = dom.window.fidelityPrototype;
assert.ok(p?.view && p?.model);
const before = p.model.source;
assert.ok(before.endsWith('\n'));
let tail = -1;
p.model.state.doc.descendants((node, pos) => { if (node.isText) tail = pos + node.nodeSize; });
assert.ok(tail > 0);
p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, tail)));
p.view.dispatch(p.model.state.tr.insertText('alpha'));
assert.equal(p.model.blocked, '');
const afterWord = p.model.source;
assert.equal(p.model.state.selection.head, tail + 'alpha'.length);
p.view.dispatch(p.model.state.tr.insertText(' '));
const afterSpace = {source:p.model.source, blocked:p.model.blocked,
  selection:p.model.state.selection.toJSON(), past:p.model.past.length};
p.view.dispatch(p.model.state.tr.insertText('beta'));
const expected = before.slice(0, -1) + 'alpha beta\n';
const actual = p.model.source;
console.log(JSON.stringify({afterWord, afterSpace, actual, expected, errors}));
dom.window.close();
assert.equal(actual, expected, 'continuous typing lost the separating space');
assert.deepEqual(errors, []);
console.log('trailing whitespace continuous input PASS (not real IME)');

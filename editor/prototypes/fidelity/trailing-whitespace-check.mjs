// INK-PROT-027: continuous native-transaction input regression.
// Real bundled EditorView/dispatch; not physical keyboard or real IME.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextSelection } from 'prosemirror-state';

const html = await readFile(new URL('PROTOTYPE.html', import.meta.url), 'utf8');

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
  const p = dom.window.fidelityPrototype;
  assert.ok(p?.view && p?.model && p?.actions);
  p.run(() => p.model.sourceEdit(source));
  p.model.past.length = 0;
  p.model.future.length = 0;
  p.model.saved = p.model.source;
  p.model.before = p.model.source;
  p.model.revision = 0;
  p.model.blocked = '';
  p.run(() => {});
  return { dom, p, errors };
}

function textPosition(model, text, offset = text.length) {
  let found = -1;
  model.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = pos + index + offset;
  });
  assert.ok(found >= 0, `text not found: ${text}`);
  return found;
}

function dispatchText(p, text, label = text) {
  p.view.dispatch(p.model.state.tr.insertText(text));
  assert.equal(p.model.blocked, '', label);
}

function assertClean(p, label) {
  const parsed = p.parse(p.model.source);
  assert.equal(parsed.issues.length, 0, `${label}: pending issues`);
  assert.ok(parsed.doc.eq(p.model.state.doc), `${label}: source/PM mismatch`);
  assert.equal(p.model.trusted.source, p.model.source, `${label}: trusted source mismatch`);
  assert.ok(p.model.trusted.state.doc.eq(p.model.state.doc), `${label}: trusted PM mismatch`);
  assert.equal(p.model.ledgerSource(), p.model.source, `${label}: ledger source mismatch`);
  assert.equal(p.model.staged, null, `${label}: unexpected staged state`);
}

function insertAt(source, offset, insert) {
  return source.slice(0, offset) + insert + source.slice(offset);
}

function sourceOffsetFor(p, position) {
  const mapped = p.model.visualToSource(position, position, { collapsedAffinity: 'right' });
  assert.ok(mapped.ok, mapped.reason);
  return mapped.anchor;
}

function runContinuousCase({ id, source, marker, first = 'alpha', spaces = 1, second = 'beta' }) {
  const { dom, p, errors } = boot(source);
  const start = textPosition(p.model, marker);
  const rawStart = sourceOffsetFor(p, start);
  p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, start)));
  dispatchText(p, first);
  const afterWord = insertAt(source, rawStart, first);
  assert.equal(p.model.source, afterWord, `${id}: first word source`);
  const whitespaceStart = p.model.state.selection.head;

  for (let count = 1; count <= spaces; count++) {
    dispatchText(p, ' ', `${id}: whitespace ${count}`);
    const candidate = insertAt(afterWord, rawStart + first.length, ' '.repeat(count));
    assert.equal(p.model.staged?.kind, 'trailing-whitespace', `${id}: staged kind`);
    assert.equal(p.model.staged?.candidate, candidate, `${id}: candidate bytes`);
    assert.equal(p.model.ledgerSource(), candidate, `${id}: ledger candidate`);
    assert.equal(p.model.source, afterWord, `${id}: trusted source changed during stage`);
    assert.equal(p.model.state.selection.head, whitespaceStart + count, `${id}: staged caret`);
    assert.equal(dom.window.document.getElementById('save').disabled, true, `${id}: staged save eligibility`);
    assert.throws(() => p.actions.save(), /尾随空格候选已完整保留/);
  }

  for (let count = 0; count <= spaces; count++) {
    const position = whitespaceStart + count;
    p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, position)));
    assert.equal(p.model.state.selection.head, position, `${id}: staged caret movement ${count}`);
  }
  p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, whitespaceStart + spaces)));
  dispatchText(p, second);

  const expected = insertAt(source, rawStart, first + ' '.repeat(spaces) + second);
  assert.equal(p.model.source, expected, `${id}: continuous typing lost whitespace`);
  assert.equal(p.model.state.selection.head, whitespaceStart + spaces + second.length, `${id}: final caret`);
  assert.equal(dom.window.document.getElementById('save').disabled, false, `${id}: clean save eligibility`);
  assertClean(p, `${id} final`);

  p.run(p.actions.undo);
  assert.equal(p.model.staged?.kind, 'trailing-whitespace', `${id}: undo staged kind`);
  assert.equal(p.model.staged?.candidate, insertAt(afterWord, rawStart + first.length, ' '.repeat(spaces)), `${id}: undo candidate`);
  assert.equal(dom.window.document.getElementById('save').disabled, true, `${id}: undo staged save`);
  p.run(p.actions.redo);
  assert.equal(p.model.source, expected, `${id}: redo source`);
  assertClean(p, `${id} redo`);

  p.actions.save();
  assert.equal(p.model.saved, expected, `${id}: memory savepoint`);
  const reopened = new p.FidelityModel(expected);
  assert.equal(reopened.source, expected, `${id}: reopen bytes`);
  assert.ok(reopened.state.doc.eq(p.model.state.doc), `${id}: reopen projection`);
  p.run(p.actions.source);
  p.run(p.actions.apply);
  assert.equal(p.model.source, expected, `${id}: source round trip`);
  assertClean(p, `${id} source round trip`);
  assert.deepEqual(errors, [], `${id}: jsdom errors`);
  dom.window.close();
  return expected;
}

const sampleBoot = boot('');
const defaultSource = sampleBoot.p.samples.default;
sampleBoot.dom.window.close();
const cases = [
  { id: 'original-protected-tail', source: defaultSource, marker: '保护块之后的中文。' },
  { id: 'paragraph-lf', source: '中文 paragraph\n', marker: '中文 paragraph', spaces: 2 },
  { id: 'heading', source: '# 标题\n', marker: '标题' },
  { id: 'list', source: '- 列表项\n', marker: '列表项', spaces: 2 },
  { id: 'blockquote', source: '> 引用\n', marker: '引用' },
  { id: 'bom-crlf', source: '\uFEFF中文\r\n', marker: '中文', spaces: 2 },
  { id: 'no-final-eol', source: '无尾换行', marker: '无尾换行' },
  { id: 'before-definition-gap', source: '正文\n\n[ref]: <https://example.invalid> "title"\n', marker: '正文' },
  { id: 'before-protected-block', source: '正文\n\n$$\nx^2\n$$\n', marker: '正文', spaces: 2 },
];

const results = cases.map(runContinuousCase);

// At the end of a supported mark, ordinary letters continue the mark while a
// separating space exits after the closing delimiter. The staged candidate is
// therefore valid Markdown instead of `**bold **`, whose delimiter would turn
// literal under CommonMark.
for (const item of [
  { id: 'strong', source: '**bold**\n', marker: 'bold', afterWord: '**boldalpha**\n', candidate: '**boldalpha** \n', expected: '**boldalpha** beta\n' },
  { id: 'em', source: '*em*\n', marker: 'em', afterWord: '*emalpha*\n', candidate: '*emalpha* \n', expected: '*emalpha* beta\n' },
  { id: 'strike', source: '~~strike~~\n', marker: 'strike', afterWord: '~~strikealpha~~\n', candidate: '~~strikealpha~~ \n', expected: '~~strikealpha~~ beta\n' },
  { id: 'link', source: '[link](/dest)\n', marker: 'link', afterWord: '[link](/dest)alpha\n', candidate: '[link](/dest)alpha \n', expected: '[link](/dest)alpha beta\n' },
]) {
  const { dom, p, errors } = boot(item.source);
  const at = textPosition(p.model, item.marker);
  p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, at)));
  dispatchText(p, 'alpha', `${item.id} word`);
  assert.equal(p.model.source, item.afterWord);
  dispatchText(p, ' ', `${item.id} boundary space`);
  assert.equal(p.model.staged?.kind, 'trailing-whitespace');
  assert.equal(p.model.staged?.candidate, item.candidate);
  dispatchText(p, 'beta', `${item.id} boundary continuation`);
  assert.equal(p.model.source, item.expected);
  assertClean(p, `${item.id} boundary`);
  assert.deepEqual(errors, []);
  dom.window.close();
}

for (const [id, prefix] of [['softbreak', 'line\nnext'], ['hardbreak', 'line  \nnext']]) {
  const source = `${prefix}\n\n尾段\n`;
  const expected = runContinuousCase({ id, source, marker: '尾段', spaces: 2 });
  assert.ok(expected.startsWith(prefix), `${id}: line-break bytes changed`);
}

{
  const source = '```text\ncode\n```\n';
  const { dom, p, errors } = boot(source);
  const at = textPosition(p.model, 'code');
  p.view.dispatch(p.model.state.tr.setSelection(TextSelection.create(p.model.state.doc, at)));
  dispatchText(p, 'alpha');
  dispatchText(p, ' ');
  assert.equal(p.model.staged, null, 'code whitespace incorrectly staged');
  dispatchText(p, 'beta');
  assert.equal(p.model.source, '```text\ncodealpha beta\n```\n');
  assertClean(p, 'code whitespace');
  assert.deepEqual(errors, []);
  dom.window.close();
}

{
  const source = '\uFEFFtail  \r\n';
  const { dom, p, errors } = boot(source);
  assert.equal(p.model.source, source);
  assert.equal(p.model.staged, null);
  const ledger = p.model.sourceLedger();
  assert.ok(ledger.spans.some(span => span.syntax === 'block-suffix' && source.slice(span.sourceStart, span.sourceEnd) === '  '));
  assert.equal(dom.window.document.getElementById('save').disabled, false);
  p.run(p.actions.source);
  p.run(p.actions.apply);
  assert.equal(p.model.source, source);
  p.actions.save();
  assert.equal(p.model.saved, source);
  assertClean(p, 'pre-existing trailing spaces');
  assert.deepEqual(errors, []);
  dom.window.close();
}

console.log(JSON.stringify({ cases: results.length + 5, contexts: [...cases.map(item => item.id), 'mark-boundary'] }));
console.log('trailing whitespace continuous input: 14/14 PASS (real WK/Sogou retest required)');

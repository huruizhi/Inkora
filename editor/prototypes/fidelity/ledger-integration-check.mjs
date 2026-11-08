// INK-PROT-022: real EditorView integration checks for lexical ownership.
// Expected Markdown is independent literal data; ledger output is never used
// to derive a patch or an expected value.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = new URL('.', import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));

async function boot(source) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(String(error)));
  const html = await readFile(new URL('PROTOTYPE.html', here), 'utf8');
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

function textOccurrence(prototype, text, occurrence = 0) {
  const positions = [];
  prototype.model.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (let index = node.text.indexOf(text); index >= 0; index = node.text.indexOf(text, index + text.length)) {
      positions.push(pos + index);
    }
  });
  assert.ok(positions[occurrence] !== undefined, `missing PM text occurrence ${occurrence}: ${JSON.stringify(text)}`);
  return positions[occurrence];
}

function select(prototype, anchor, head = anchor) {
  const Selection = prototype.model.state.selection.constructor;
  prototype.view.dispatch(prototype.model.state.tr.setSelection(Selection.create(prototype.model.state.doc, anchor, head)));
}

function key(dom, prototype, name) {
  const event = new dom.window.KeyboardEvent('keydown', {
    key: name, code: name, bubbles: true, cancelable: true,
  });
  prototype.view.dom.dispatchEvent(event);
  return event;
}

// The destination, title and trailing body deliberately contain the same
// spelling. A visual edit of the body must own only the final raw span.
{
  const source = '[a](later "later")later\n';
  const expected = '[a](later "later")FINAL\n';
  const { dom, prototype, errors } = await boot(source);
  const from = textOccurrence(prototype, 'later');
  prototype.view.dispatch(prototype.model.state.tr.insertText('FINAL', from, from + 'later'.length));
  assert.equal(prototype.model.source, expected, prototype.model.blocked);
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Escape/entity atoms are indivisible raw spans. Replacing the visible
// character removes only that spelling and preserves every unrelated byte.
{
  const source = 'escape \\* entity &amp; tail\r\n';
  const afterEscape = 'escape X entity &amp; tail\r\n';
  const expected = 'escape X entity Y tail\r\n';
  const { dom, prototype, errors } = await boot(source);
  const escaped = textOccurrence(prototype, '*');
  prototype.view.dispatch(prototype.model.state.tr.insertText('X', escaped, escaped + 1));
  assert.equal(prototype.model.source, afterEscape);
  const entity = textOccurrence(prototype, '&');
  prototype.view.dispatch(prototype.model.state.tr.insertText('Y', entity, entity + 1));
  assert.equal(prototype.model.source, expected, prototype.model.blocked);
  assert.deepEqual(plain(prototype.model.patches), [{ from: 16, to: 21, insert: 'Y' }]);
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Source mode must use the same ledger rather than re-searching PM leaf text.
// The selected visible '*' owns the two raw bytes "\\*" in the textarea.
{
  const source = 'x \\* y\r\n';
  const { dom, prototype, errors } = await boot(source);
  const from = textOccurrence(prototype, '*');
  prototype.model.select(from, from + 1);
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  assert.equal(prototype.sourceMode, true);
  assert.deepEqual(plain(prototype.lastSelectionMap), {
    stage: 'enter-source', ok: true, anchor: 2, head: 4, snapped: [],
  });
  assert.equal(textarea.selectionStart, 2);
  assert.equal(textarea.selectionEnd, 4);
  assert.equal(textarea.selectionDirection, 'forward');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Staging may add an empty PM block that the candidate Markdown cannot yet
// represent. Existing link/escape ownership still comes from a candidate/doc
// ledger; only the empty block uses its explicit staged anchor.
{
  const source = '[a](dest "title") \\*\n';
  const expected = '[a](dest "title") X\n\nY\n';
  const { dom, prototype, errors } = await boot(source);
  select(prototype, prototype.model.state.doc.content.size - 1);
  assert.equal(key(dom, prototype, 'Enter').defaultPrevented, true);
  assert.equal(prototype.model.staged?.kind, 'paragraph-split');
  const escaped = textOccurrence(prototype, '*');
  prototype.view.dispatch(prototype.model.state.tr.insertText('X', escaped, escaped + 1));
  assert.equal(prototype.model.staged?.candidate, '[a](dest "title") X\n\n\n');
  const emptyAnchor = prototype.model.staged.anchors.find(item => item.pmPos > prototype.model.state.doc.firstChild.nodeSize)?.pmPos;
  assert.ok(emptyAnchor !== undefined);
  assert.equal(new Set(prototype.model.staged.anchors.filter(item => item.pmPos === emptyAnchor).map(item => item.sourceOffset)).size, 1,
    JSON.stringify({ escaped, firstSize: prototype.model.state.doc.firstChild.nodeSize, selection: prototype.model.state.selection.toJSON(), anchors: plain(prototype.model.staged.anchors) }));
  select(prototype, emptyAnchor);
  prototype.view.dispatch(prototype.model.state.tr.insertText('Y'));
  assert.equal(prototype.model.source, expected, prototype.model.blocked);
  assert.equal(prototype.model.staged, null);
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Editing reference-link display text must keep the resolved destination.
// Collapsed/shortcut forms are expanded locally to an explicit reference key.
for (const item of [
  { source: '[old][ref]\n\n[ref]: /dest "title"\n', expected: '[NEW][ref]\n\n[ref]: /dest "title"\n' },
  { source: '[ref][]\n\n[ref]: /dest "title"\n', expected: '[NEW][ref]\n\n[ref]: /dest "title"\n' },
  { source: '[ref]\n\n[ref]: /dest "title"\n', expected: '[NEW][ref]\n\n[ref]: /dest "title"\n' },
]) {
  const { dom, prototype, errors } = await boot(item.source);
  const from = textOccurrence(prototype, item.source.startsWith('[old]') ? 'old' : 'ref');
  prototype.view.dispatch(prototype.model.state.tr.insertText('NEW', from, from + 3));
  assert.equal(prototype.model.source, item.expected, prototype.model.blocked);
  assert.equal(prototype.model.blocked, '');
  assert.equal(prototype.view.dom.querySelector('a')?.getAttribute('href'), '/dest');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Repeated visible text in one paragraph stays owned across adjacent marks.
{
  const source = '[same](dest "same") same *same* `same`\n';
  const { dom, prototype, errors } = await boot(source);
  let from = textOccurrence(prototype, 'same', 1);
  prototype.view.dispatch(prototype.model.state.tr.insertText('BODY', from, from + 4));
  from = textOccurrence(prototype, 'same', 1);
  prototype.view.dispatch(prototype.model.state.tr.insertText('EMPH', from, from + 4));
  assert.equal(prototype.model.source, '[same](dest "same") BODY *EMPH* `same`\n', prototype.model.blocked);
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// The task's literal &quot; spelling is plain CommonMark text, but its final
// repeated body occurrence must still be edited without touching earlier bytes.
{
  const source = '[a](later &quot;later&quot;)later\n';
  const { dom, prototype, errors } = await boot(source);
  const from = textOccurrence(prototype, 'later', 2);
  prototype.view.dispatch(prototype.model.state.tr.insertText('FINAL', from, from + 5));
  assert.equal(prototype.model.source, '[a](later &quot;later&quot;)FINAL\n', prototype.model.blocked);
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Backward selection round-trips through LF textarea offsets while lexical
// atoms retain their complete raw spans. An entity-interior caret is rejected
// before model mutation and the draft stays open.
{
  const source = 'pre \\* mid &amp; post\r\n';
  const { dom, prototype, errors } = await boot(source);
  const star = textOccurrence(prototype, '*');
  const entity = textOccurrence(prototype, '&');
  select(prototype, entity + 1, star);
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  const rawStart = source.indexOf('\\*');
  const rawEnd = source.indexOf('&amp;') + '&amp;'.length;
  assert.equal(textarea.selectionStart, rawStart);
  assert.equal(textarea.selectionEnd, rawEnd);
  assert.equal(textarea.selectionDirection, 'backward');
  textarea.value = textarea.value.replace('pre', 'PRE');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  textarea.setSelectionRange(rawStart, rawEnd, 'backward');
  prototype.run(prototype.actions.apply);
  assert.equal(prototype.model.source, 'PRE \\* mid &amp; post\r\n');
  assert.ok(prototype.model.state.selection.anchor > prototype.model.state.selection.head);

  prototype.run(prototype.actions.source);
  textarea.value = textarea.value.replace('PRE', 'Pre');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const entityInterior = textarea.value.indexOf('&amp;') + 2;
  textarea.setSelectionRange(entityInterior, entityInterior, 'forward');
  prototype.run(prototype.actions.apply);
  assert.equal(prototype.sourceMode, true);
  assert.equal(prototype.model.source, 'PRE \\* mid &amp; post\r\n');
  assert.match(prototype.lastSelectionMap.reason, /entity.*不可分割 span/);
  assert.ok(textarea.value.startsWith('Pre'));
  prototype.run(prototype.actions.cancel);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Source offset zero is the BOM byte, never a visual insertion boundary.
{
  const source = '\uFEFFbody\n';
  const { dom, prototype, errors } = await boot(source);
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  textarea.value = textarea.value.replace('body', 'BODY');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  textarea.setSelectionRange(0, 0, 'forward');
  prototype.run(prototype.actions.apply);
  assert.equal(prototype.sourceMode, true);
  assert.equal(prototype.model.source, source);
  assert.match(prototype.lastSelectionMap.reason, /原文 0 没有可审计文本锚点/);
  prototype.run(prototype.actions.cancel);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A valid source edit may leave the textarea caret in a trailing definition
// gap. The UI explicitly requests adjacent-gap projection and records it.
{
  const source = 'body [r][ref]\n\n[ref]: /dest "title"\n';
  const expected = 'body [r][ref]\n\n[ref]: /next "title"\n';
  const { dom, prototype, errors } = await boot(source);
  const originalSelection = plain(prototype.model.state.selection.toJSON());
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  textarea.value = textarea.value.replace('/dest', '/next');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(textarea.selectionStart, textarea.value.length); // real value write keeps EOF caret
  prototype.run(prototype.actions.apply);
  assert.equal(prototype.sourceMode, false);
  assert.equal(prototype.model.source, expected);
  assert.equal(prototype.view.dom.querySelector('a')?.getAttribute('href'), '/next');
  assert.equal(prototype.lastSelectionMap.ok, true);
  assert.match(prototype.lastSelectionMap.reason, /没有可审计文本锚点/);
  assert.match(prototype.lastSelectionMap.snapped.join('\n'), /显式 adjacent-gap/);
  const projectedSelection = plain(prototype.model.state.selection.toJSON());
  prototype.run(prototype.actions.undo);
  assert.equal(prototype.model.source, source);
  assert.deepEqual(plain(prototype.model.state.selection.toJSON()), originalSelection);
  prototype.run(prototype.actions.redo);
  assert.equal(prototype.model.source, expected);
  assert.deepEqual(plain(prototype.model.state.selection.toJSON()), projectedSelection);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Cache reuse is allowed only for the exact source/doc/ranges triple.
// A visual trailing-space draft owns the exact candidate byte and both PM
// boundaries. Continuing with a visible character promotes it to a normal,
// re-parse-equivalent source state.
{
  const source = 'tail\r\n';
  const { dom, prototype, errors } = await boot(source);
  const tail = textOccurrence(prototype, 'tail') + 'tail'.length;
  select(prototype, tail);
  prototype.view.dispatch(prototype.model.state.tr.insertText(' '));
  assert.equal(prototype.model.staged?.kind, 'trailing-whitespace');
  assert.equal(prototype.model.staged?.candidate, 'tail \r\n');
  const ledger = prototype.model.sourceLedger();
  assert.equal(ledger.docSize, prototype.model.state.doc.content.size);
  assert.ok(ledger.spans.some(span => span.syntax === 'block-suffix'
    && prototype.model.ledgerSource().slice(span.sourceStart, span.sourceEnd) === ' '));
  const before = prototype.model.visualToSource(tail, tail, { collapsedAffinity: 'right' });
  const after = prototype.model.visualToSource(tail + 1, tail + 1, { collapsedAffinity: 'right' });
  assert.ok(before.ok && after.ok);
  assert.equal(before.anchor, 4);
  assert.equal(after.anchor, 5);
  prototype.view.dispatch(prototype.model.state.tr.insertText('x'));
  assert.equal(prototype.model.source, 'tail x\r\n');
  assert.equal(prototype.model.staged, null);
  assert.ok(prototype.parse(prototype.model.source).doc.eq(prototype.model.state.doc));
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Cache reuse is allowed only for the exact source/doc/ranges triple.
{
  const { dom, prototype, errors } = await boot('cache text\n');
  const first = prototype.model.sourceLedger();
  prototype.model.select(2);
  assert.equal(prototype.model.sourceLedger(), first); // selection-only state shares doc/ranges
  prototype.view.dispatch(prototype.model.state.tr.insertText('X', 2));
  const edited = prototype.model.sourceLedger();
  assert.notEqual(edited, first);
  assert.equal(prototype.model.source, 'cXache text\n');
  prototype.run(prototype.actions.undo);
  const restored = prototype.model.sourceLedger();
  assert.notEqual(restored, edited);
  assert.equal(prototype.model.source, 'cache text\n');
  assert.equal(prototype.model.blocked, '');
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A reference-looking line in fenced code is literal and cannot shadow the
// real CommonMark definition outside that block. Both visual and source-mode
// edits must leave the code and definition bytes untouched.
{
  const source = 'outside [x][ref]\n\n```markdown\n[ref]: /wrong\n```\n\n[ref]: /right\n';
  const afterVisual = 'outside [X][ref]\n\n```markdown\n[ref]: /wrong\n```\n\n[ref]: /right\n';
  const expected = 'Outside [X][ref]\n\n```markdown\n[ref]: /wrong\n```\n\n[ref]: /right\n';
  const { dom, prototype, errors } = await boot(source);
  assert.equal(prototype.view.dom.querySelector('a')?.getAttribute('href'), '/right');
  const from = textOccurrence(prototype, 'x');
  prototype.view.dispatch(prototype.model.state.tr.insertText('X', from, from + 1));
  assert.equal(prototype.model.source, afterVisual);
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  textarea.value = textarea.value.replace('outside', 'Outside');
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const caret = textarea.value.indexOf('Outside') + 'Outside'.length;
  textarea.setSelectionRange(caret, caret, 'forward');
  prototype.run(prototype.actions.apply);
  assert.equal(prototype.model.source, expected);
  assert.equal(prototype.view.dom.querySelector('a')?.getAttribute('href'), '/right');
  assert.ok(prototype.model.source.includes('```markdown\n[ref]: /wrong\n```'));
  assert.ok(prototype.model.source.endsWith('[ref]: /right\n'));
  assert.deepEqual(errors, []);
  dom.window.close();
}

// A definition that exists only inside code is not a definition. The visible
// source spelling remains literal and no link mark appears.
{
  const source = 'outside [x][ref]\n\n```markdown\n[ref]: /wrong\n```\n';
  const { dom, prototype, errors } = await boot(source);
  assert.equal(prototype.view.dom.querySelector('a'), null);
  assert.ok(prototype.model.state.doc.textContent.includes('[x][ref]'));
  assert.equal(prototype.model.source, source);
  assert.deepEqual(errors, []);
  dom.window.close();
}

// Legitimate duplicate definitions retain CommonMark's first-wins rule while
// both original definition lines stay byte-exact.
{
  const source = 'outside [x][ref]\n\n[ref]: /first\n[ref]: /second\n';
  const { dom, prototype, errors } = await boot(source);
  assert.equal(prototype.view.dom.querySelector('a')?.getAttribute('href'), '/first');
  assert.equal(prototype.model.source, source);
  assert.deepEqual(errors, []);
  dom.window.close();
}

console.log('PASS: 17 real EditorView ledger integration regressions');

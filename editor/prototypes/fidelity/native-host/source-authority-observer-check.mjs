// INK-PROT-031: read-only observer checks against the fixed source-authority bundle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = new URL('.', import.meta.url);
const errors = [];
const events = [];
const console = new VirtualConsole();
console.on('jsdomError', error => errors.push(String(error)));
const dom = new JSDOM(await readFile(new URL('../../source-authority/PROTOTYPE.html', here), 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.webkit = { messageHandlers: { runtimeObserver: { postMessage: event => events.push(event) } } };
  },
});
dom.window.eval(await readFile(new URL('Resources/runtime-observer.js', here), 'utf8'));
const prototype = dom.window.sourceAuthorityPrototype;
const controller = prototype.controller;
const snapshot = () => dom.window.__inkoraRuntimeObserver.snapshot();
prototype.reopen('\uFEFFa \r\n', { anchor: 3, head: 3, affinity: 'right' });
prototype.run('source');
const textarea = dom.window.document.querySelector('textarea#source');
textarea.focus();
const before = JSON.stringify(controller.stateReport());
const beforeDOM = [textarea.value, textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection];
const report = snapshot();
snapshot();
assert.equal(report.sourceAuthority.currentRaw, '\uFEFFa \r\n');
assert.equal(report.sourceAuthority.savedRaw, controller.savedRaw);
assert.equal(report.sourceAuthority.draftDirty, false);
assert.equal(report.sourceAuthority.saveEligible, false, 'source draft session blocks Save');
assert.equal(report.textarea.readOnly, false);
assert.equal(report.activeElement, 'source-draft');
assert.equal(report.sourceAuthority.rawSelection.head, 3);
assert.equal(JSON.stringify(controller.stateReport()), before, 'snapshot leaves controller unchanged');
assert.deepEqual([textarea.value, textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection], beforeDOM);
textarea.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true, data: '' }));
assert.equal(snapshot().sourceComposing, true);
assert.ok(events.some(event => event.type === 'compositionstart' && event.target === 'source-draft'));
textarea.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '' }));
assert.equal(snapshot().sourceComposing, false);
assert.equal(JSON.stringify(controller.stateReport()), before, 'empty synthetic lifecycle leaves model unchanged');
assert.deepEqual(errors, []);
dom.window.close();
process.stdout.write('source-authority-observer-check: PASS (read-only; synthetic events only)\n');

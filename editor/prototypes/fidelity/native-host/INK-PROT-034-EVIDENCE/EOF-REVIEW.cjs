const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('/Users/rayhu/Documents/projects/Inkora/editor/node_modules/jsdom');
const html = path.resolve(__dirname, '../../../source-authority/PROTOTYPE.html');
const dom = new JSDOM(fs.readFileSync(html, 'utf8'), {runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:new VirtualConsole(), beforeParse(w){w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;}});
const p=dom.window.sourceAuthorityPrototype;
try {
  assert.equal(p.reopen('a\n', {anchor:2,head:2,affinity:'right'}),true);
  const c=p.controller;
  const before=c.stateReport();
  p.view.dispatch(p.view.state.tr.insertText('X'));
  const actual={before,after:c.stateReport()};
  console.log(JSON.stringify(actual,null,2));
  assert.equal(c.currentRaw,'a\nX','an accepted EOF raw caret must insert at that exact raw boundary');
  assert.equal(c.unresolvedIntent,null,'normal EOF input must not be refused after accepting that raw caret');
} finally {dom.window.close();}

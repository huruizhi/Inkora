const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('/Users/rayhu/Documents/projects/Inkora/editor/node_modules/jsdom');
const dom=new JSDOM(fs.readFileSync('editor/prototypes/source-authority/PROTOTYPE.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),beforeParse(w){w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;}});
const p=dom.window.sourceAuthorityPrototype;
try {
 assert.equal(p.reopen('a\nX',{anchor:3,head:3,affinity:'right'}),true);
 const expected=p.controller.state.doc;
 assert.equal(p.reopen('a\n',{anchor:2,head:2,affinity:'right'}),true);
 p.view.dispatch(p.view.state.tr.insertText('X'));
 console.log(JSON.stringify({raw:p.controller.currentRaw,openedText:expected.textContent,typedText:p.controller.state.doc.textContent,typedProjection:p.controller.projection},null,2));
 assert.equal(p.controller.currentRaw,'a\nX');
 assert.ok(p.controller.state.doc.eq(expected),'EOF continuation must preserve the real internal softbreak semantics shown when the same bytes are opened');
} finally {dom.window.close();}

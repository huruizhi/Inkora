const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {JSDOM,VirtualConsole}=require('/Users/rayhu/Documents/projects/Inkora/editor/node_modules/jsdom');
const dom=new JSDOM(fs.readFileSync('editor/prototypes/source-authority/PROTOTYPE.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),beforeParse(w){w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;}});
const p=dom.window.sourceAuthorityPrototype;const root='editor/prototypes/fidelity-cases/cases';
function find(predicate){const list=[];p.view.state.doc.descendants((n,pos)=>{if(predicate(n))list.push({n,pos});});assert.equal(list.length,1);return list[0];}
function expected(id,step){assert.equal(p.controller.currentRaw,fs.readFileSync(path.join(root,id,`after-step-${step}.md`),'utf8'));assert.equal(p.controller.unresolvedIntent,null);console.log('PASS',id,step);}
try{
 const id='05-marks-attrs';p.reopen(fs.readFileSync(path.join(root,id,'input.md'),'utf8'));
 let t=find(n=>n.isText&&n.text==='加粗');p.view.dispatch(p.view.state.tr.removeMark(t.pos,t.pos+t.n.nodeSize,p.view.state.schema.marks.strong));expected(id,1);
 t=find(n=>n.type.name==='heading'&&n.textContent==='标题与标记');p.view.dispatch(p.view.state.tr.setNodeMarkup(t.pos,undefined,{...t.n.attrs,level:3}));expected(id,2);
 t=find(n=>n.isText&&n.text==='行内代码');p.view.dispatch(p.view.state.tr.insertText('`',t.pos+1));expected(id,3);
 t=find(n=>n.type.name==='code_block');p.view.dispatch(p.view.state.tr.setNodeMarkup(t.pos,undefined,{...t.n.attrs,language:'swift'}));expected(id,4);
 assert.equal(p.controller.saveMemory(),true);assert.equal(p.run('undo'),true);expected(id,3);assert.equal(p.run('redo'),true);expected(id,4);
 console.log('PASS new authority native marks/attrs frozen cumulative bytes');
 const taskID='04-task-toggle-crlf';p.reopen(fs.readFileSync(path.join(root,taskID,'input.md'),'utf8'));
 t=find(n=>n.isText&&n.text.includes('[ ] 中文样稿就绪'));let local=t.n.text.indexOf('[ ] 中文样稿就绪');p.view.dispatch(p.view.state.tr.insertText('x',t.pos+local+1,t.pos+local+2));expected(taskID,1);
 t=find(n=>n.isText&&n.text.includes('[X] 大写'));local=t.n.text.indexOf('[X] 大写');p.view.dispatch(p.view.state.tr.insertText(' ',t.pos+local+1,t.pos+local+2));expected(taskID,2);
 console.log('PASS new authority task state exact single-byte changes');
}finally{dom.window.close();}

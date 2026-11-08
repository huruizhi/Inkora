// INK-PROT-003 交叉核验驱动脚本（一次性，可复现）。
// 在 jsdom 中加载真实 PROTOTYPE.html bundle，通过原型真实入口驱动独立样稿：
//  - visual 文本编辑：p.view.dispatch（真实 PM 事务）
//  - 结构编辑：p.model.apply(patch, 真实 tr)（与原型 split/join/heading 按钮相同入口）
//  - 源码编辑：真实 UI 路径 actions.source → textarea 赋值 + input 事件 → actions.apply
//  - 历史/保存：actions.undo / actions.redo / actions.save（内存保存点）
// 样稿预期字节只在事后读取比对，绝不喂入模型。
// 用法：node crossval.mjs [样稿目录] [PROTOTYPE.html]
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const CASES = process.argv[2] ?? '/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-002-fidelity-cases/editor/prototypes/fidelity-cases';
const PROTO = process.argv[3] ?? new URL('./PROTOTYPE.html', import.meta.url).pathname;
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const fileSha = async f => createHash('sha256').update(await readFile(f)).digest('hex');

const html = await readFile(PROTO, 'utf8');
async function boot() {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { w.TextEncoder = TextEncoder; } });
  return { dom, p: dom.window.fidelityPrototype, errors };
}

function loadCase(p, text) {
  p.model.sourceEdit(text); // 真实 parse+commit 入口；随后仅清空历史以建立干净基线
  const m = p.model;
  m.past.length = 0; m.future.length = 0; m.saved = text; m.before = text; m.revision = 0; m.blocked = '';
}

function findText(p, needle) {
  let at = -1;
  p.model.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.includes(needle)) at = pos + n.text.indexOf(needle); });
  if (at < 0) throw Error('PM doc 无该文本叶: ' + needle);
  return at;
}
function visualReplace(p, find, replace) {
  const at = findText(p, find);
  p.view.dispatch(p.model.state.tr.insertText(replace, at, at + find.length));
  if (p.model.blocked) throw Error('visual blocked: ' + p.model.blocked);
}
function sourceReplace(p, dom, find, replace) {
  const src = dom.window.document.getElementById('source-draft');
  p.run(p.actions.source);
  if (src.value.split(find).length !== 2) throw Error('源码 find 不唯一/不存在: ' + find);
  src.value = src.value.replace(find, replace);
  src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.apply);
  if (p.model.blocked) throw Error('source apply blocked: ' + p.model.blocked);
}
function srcPos(p, docPos) { return p.sourcePosition(p.model.source, p.model.state, p.model.ranges, docPos); }

const results = [];
async function runCase(id, variant, file, steps) {
  const r = { case: id, variant, steps: [] };
  results.push(r);
  let ctx;
  try { ctx = await boot(); } catch (e) { r.load = 'boot error: ' + e.message; return; }
  const { dom, p } = ctx;
  try {
    const input = await readFile(`${CASES}/cases/${id}/${file}`, 'utf8');
    try { loadCase(p, input); r.load = 'ok'; }
    catch (e) { r.load = 'blocked: ' + e.message; dom.window.close(); return; }
    for (const st of steps) {
      const rec = { n: st.n, how: st.how, outcome: '', sha: sha(p.model.source), dirty: p.model.source !== p.model.saved };
      r.steps.push(rec);
      try {
        if (st.how === 'visual') visualReplace(p, st.find, st.replace);
        else if (st.how === 'source') sourceReplace(p, dom, st.find, st.replace);
        else if (st.how === 'undo') p.run(p.actions.undo);
        else if (st.how === 'redo') p.run(p.actions.redo);
        else if (st.how === 'save') p.run(p.actions.save);
        else if (st.how === 'noop') { p.run(p.actions.source); p.run(p.actions.apply); }
        else if (st.how === 'heading') {
          const range = p.model.ranges.find(x => x.kind === 'heading');
          p.model.apply([{ from: range.start, to: range.start, insert: '#' }], p.model.state.tr.setNodeMarkup(range.pos, undefined, { ...p.model.state.doc.nodeAt(range.pos).attrs, level: st.level }));
        }
        else if (st.how === 'split') {
          const at = findText(p, st.anchor) + st.anchor.length;
          p.model.select(at);
          const from = srcPos(p, at);
          const eol = p.model.source.slice(0, from).match(/\r\n|\n/g)?.pop() ?? '\n';
          p.model.apply([{ from, to: from, insert: st.insert ?? eol + eol }], p.model.state.tr.split(at));
        }
        else if (st.how === 'observe') {}
        rec.blocked = p.model.blocked || '';
        rec.sha = sha(p.model.source); rec.dirty = p.model.source !== p.model.saved;
        if (st.expect) {
          rec.expectSha = await fileSha(`${CASES}/cases/${id}/${st.expect}`);
          rec.outcome = (!rec.blocked && rec.sha === rec.expectSha) ? 'PASS' : 'FAIL';
          if (rec.outcome === 'FAIL') rec.actualBytes = Buffer.from(p.model.source, 'utf8').length;
        } else rec.outcome = rec.blocked ? 'BLOCKED' : 'OBSERVED';
      } catch (e) { rec.outcome = 'ERROR'; rec.error = e.message; rec.sha = sha(p.model.source); rec.blocked = p.model.blocked || ''; }
    }
  } finally { try { dom.window.close(); } catch {} }
}

const S = (n, how, expect, extra = {}) => ({ n, how, expect, ...extra });

await runCase('01-zh-emoji-replace', 'main', 'input.md', [
  S(1, 'visual', 'after-step-1.md', { find: '原文字节', replace: '原始字节' }),
  S(2, 'visual', 'after-step-2.md', { find: '👨‍👩‍👧‍👦', replace: '🧑‍🤝‍🧑' }),
  S(3, 'visual', 'after-step-3.md', { find: '🇨🇳', replace: '🇯🇵' }),
  S(4, 'observe', null, {}),
]);
await runCase('02-protected-whitespace', 'main', 'input.md', [
  S(1, 'save', 'input.md', {}),
  S(2, 'visual', 'after-step-2.md', { find: '逐字节保留', replace: '逐字节不变' }),
  S(3, 'visual', 'after-step-3.md', { find: '收尾段落包含', replace: '结束段落包含' }),
]);
await runCase('03-reference-links', 'main', 'input.md', [
  S(1, 'visual', 'after-step-1.md', { find: 'Inkora 文档', replace: 'Inkora 手册' }),
]);
await runCase('04-task-toggle-crlf', 'main', 'input.md', [
  S(1, 'visual', 'after-step-1.md', { find: '[ ] 中文样稿就绪', replace: '[x] 中文样稿就绪' }),
  S(2, 'visual', 'after-step-2.md', { find: '[X] 大写', replace: '[ ] 大写' }),
]);
await runCase('05-marks-attrs', 'main', 'input.md', [
  S(2, 'heading', 'after-step-2.md', { level: 3 }),
  S(3, 'visual', 'after-step-3.md', { find: '行内代码', replace: '行`内代码' }),
]);
await runCase('06-split-join', 'main', 'input.md', [
  S(1, 'split', 'after-step-1.md', { anchor: '拆分点', insert: '\r\n' }),
  S(3, 'split', 'after-step-3.md', { anchor: '衔接点', insert: '\r\n- ' }),
]);
await runCase('07-undo-redo', 'main', 'input.md', [
  S(1, 'visual', 'after-step-1.md', { find: '第一段原文', replace: '首段原文' }),
  S(2, 'visual', 'after-step-2.md', { find: '[ ] 待办一项', replace: '[x] 待办一项' }),
  S(3, 'undo', 'after-step-1.md', {}),
  S(4, 'undo', 'input.md', {}),
  S(5, 'redo', 'after-step-1.md', {}),
  S(6, 'redo', 'after-step-2.md', {}),
]);
await runCase('08-source-format-dirty', 'main', 'input.md', [
  S(1, 'noop', 'input.md', {}),
  S(2, 'source', 'after-step-2.md', { find: '*星号强调*', replace: '_星号强调_' }),
  S(3, 'undo', 'input.md', {}),
]);
await runCase('09-source-roundtrip-selection', 'main', 'input.md', [
  S(2, 'source', 'after-step-2.md', { find: '🎯。', replace: '🎯锚点。' }),
  S(4, 'undo', 'input.md', {}),
  S(5, 'redo', 'after-step-2.md', {}),
]);
await runCase('10-malformed-boundary', 'open-malformed', 'malformed-input.md', [S(1, 'observe', null, {})]);
await runCase('10-malformed-boundary', 'create-ambiguity', 'valid-input.md', [
  S(1, 'visual', 'valid-after-step-1.md', { find: '正常正文一段', replace: '正常正文已修改' }),
  S(2, 'visual', 'valid-buffer-after-step-2.md', { find: '修复前的尾段正文。', replace: '$$\n修复前的尾段正文。' }),
]);
await runCase('11-mixed-eol-insert', 'main', 'input.md', [
  S(1, 'split', 'after-step-1.md', { anchor: '第二行使用 CRLF 结尾。', insert: '\r\n插入行继承 CRLF。' }),
  S(2, 'split', 'after-step-2.md', { anchor: '尾段 LF 结尾。', insert: '\n新尾行 LF。' }),
]);

console.log(JSON.stringify(results, null, 1));

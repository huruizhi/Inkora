// INK-PROT-005 交叉核验驱动脚本（一次性，可复现）。
// 在 jsdom 中加载真实 PROTOTYPE.html bundle，通过原型真实入口驱动独立样稿：
//  - 打开：actions.openMixed / actions.openMalformed（真实按钮路径，内嵌样稿须与样稿文件逐字节一致）
//  - visual 文本编辑：p.view.dispatch（真实 PM 事务）；含混提交后记录 pending/保存资格
//  - 结构编辑：p.model.apply(patch, 真实 tr)（与原型 split/join/heading 按钮相同入口）
//  - 源码编辑：真实 UI 路径 actions.source → textarea 赋值 + input 事件（生产 TextAreaEditorKernel 还原 CRLF/LF）→ actions.apply
//  - 历史/保存：actions.undo / redo / save（内存保存点，无文件系统；case10 的 to_disk 仅以内存基线模拟）
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
  p.run(() => {}); // 只刷新真实 EditorView；不读取或应用任何预期文件
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
  src.value = src.value.replace(find, () => replace); // 函数替换避免 $$ 被 replace 特殊模式吞掉
  src.dispatchEvent(new dom.window.Event('input'));
  p.run(p.actions.apply);
  if (p.model.blocked) throw Error('source apply blocked: ' + p.model.blocked);
}
function srcPos(p, docPos) { return p.sourcePosition(p.model.source, p.model.state, p.model.ranges, docPos); }

const results = [];
const docTypes = m => { const k = []; m.state.doc.forEach(n => k.push(n.type.name)); return k; };
const fragments = m => m.ranges.filter(r => r.kind === 'protected_block').map(r => m.source.slice(r.start, r.end));
const defsOf = m => m.source.match(/^[^\S\n]{0,3}\[[^\]\n]+\]:[^\n]*/gm)?.join('\n') ?? '';

async function runCase(id, variant, file, steps, opts = {}) {
  const r = { case: id, variant, steps: [] };
  results.push(r);
  let ctx;
  try { ctx = await boot(); } catch (e) { r.load = 'boot error: ' + e.message; return; }
  const { dom, p } = ctx;
  let initialFrags = null;
  try {
    const input = await readFile(`${CASES}/cases/${id}/${file}`, 'utf8');
    if (opts.open) {
      // 真实打开按钮路径；内嵌样稿必须与样稿文件逐字节一致，否则记 mismatch。
      p.run(p.actions[opts.open]);
      const equal = p.model.source === input;
      r.load = equal ? `ok (real open: ${opts.open}; embedded bytes == case file)` : 'mismatch: embedded sample differs from case file';
      if (!equal) { dom.window.close(); return; }
    } else {
      try { loadCase(p, input); r.load = 'ok'; }
      catch (e) { r.load = 'blocked: ' + e.message; dom.window.close(); return; }
    }
    initialFrags = fragments(p.model);
    const initialDefs = opts.defs ? defsOf(p.model) : null;
    if (opts.references) {
      const anchors = [...p.view.dom.querySelectorAll('a[href]')];
      const links = [];
      p.model.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        const mark = n.marks.find(x => x.type.name === 'link');
        if (mark) links.push({ pos, text: n.text, href: mark.attrs.href, title: mark.attrs.title });
      });
      const image = p.view.dom.querySelector('span.image-ref[data-image-ref]');
      r.semanticProjection = {
        links,
        domLinks: anchors.map(a => ({ text: a.textContent, href: a.getAttribute('href'), title: a.getAttribute('title') })),
        heading: p.view.dom.querySelector('h1')?.textContent ?? null,
        bareUrlIsText: !anchors.some(a => a.textContent === 'https://example.com/auto'),
        image: image ? { text: image.textContent, source: image.getAttribute('data-image-source'), href: image.getAttribute('data-image-ref'), tag: image.tagName } : null,
        imageLoadsResource: !!p.view.dom.querySelector('img'),
      };
      const expectedDisplays = ['Inkora 官网', 'Inkora 文档', 'inkora-doc', 'inkora-doc', 'https://example.com/bracket'];
      if (r.semanticProjection.heading !== '链接保真' || r.semanticProjection.image?.source !== '![图标][inkora-icon]' || r.semanticProjection.imageLoadsResource || !r.semanticProjection.bareUrlIsText || expectedDisplays.some(text => !anchors.some(a => a.textContent === text)) || anchors.some(a => /[\[\]#]/.test(a.textContent ?? ''))) {
        r.load = 'blocked: reference semantic projection mismatch'; dom.window.close(); return;
      }
    }
    for (const st of steps) {
      const rec = { n: st.n, how: st.how, outcome: '', sha: sha(p.model.source), dirty: p.model.source !== p.model.saved };
      r.steps.push(rec);
      try {
        if (st.how === 'visual') visualReplace(p, st.find, st.replace);
        else if (st.how === 'linkTarget') {
          const at = findText(p, st.find);
          p.model.select(at, at + st.find.length);
          dom.window.document.getElementById('link-target').value = st.target;
          p.run(p.actions.linkTarget);
          rec.linkHref = p.view.dom.querySelector(`a[href="${st.target}"]`)?.getAttribute('href') ?? null;
        }
        else if (st.how === 'visualPending') {
          visualReplace(p, st.find, st.replace);
          rec.pending = p.model.pending; rec.issues = p.model.issues.map(i => i.code);
          rec.saveDisabled = dom.window.document.getElementById('save').disabled;
          rec.docTypes = docTypes(p.model);
        }
        else if (st.how === 'source') sourceReplace(p, dom, st.find, st.replace);
        else if (st.how === 'sourceSave') {
          sourceReplace(p, dom, st.find, st.replace);
          rec.pendingAfterFix = p.model.pending;
          p.run(p.actions.save);
          rec.savedEqBuffer = p.model.saved === p.model.source;
        }
        else if (st.how === 'undo') p.run(p.actions.undo);
        else if (st.how === 'redo') p.run(p.actions.redo);
        else if (st.how === 'save') { p.run(p.actions.save); rec.savedSha = sha(p.model.saved); }
        else if (st.how === 'noop') { p.run(p.actions.source); p.run(p.actions.apply); }
        else if (st.how === 'openObserve') {
          rec.issues = p.model.issues.map(i => ({ code: i.code, line: p.model.source.slice(0, i.start).split('\n').length, utf16: [i.start, i.end] }));
          rec.docTypes = docTypes(p.model);
          rec.saveDisabled = dom.window.document.getElementById('save').disabled;
          rec.sourceMode = p.sourceMode;
          rec.rendered = { heading: !!p.view.dom.querySelector('h1'), paragraph: !!p.view.dom.querySelector('p'), issueMarked: !!p.view.dom.querySelector('section.protected-block.protected-issue') };
        }
        else if (st.how === 'saveBlocked') {
          p.run(p.actions.save);
          rec.blockedBySave = p.model.blocked;
          rec.savedSha = sha(p.model.saved);
        }
        else if (st.how === 'reopen') {
          const reopened = new p.FidelityModel(p.model.saved);
          rec.reopenedIssues = reopened.issues.length;
          rec.reopenedDocTypes = docTypes(reopened);
          let raw = null;
          reopened.state.doc.descendants(n => { if (raw === null && n.type.name === 'protected_block') raw = n.attrs.raw; });
          rec.mathFragmentRaw = raw;
        }
        else if (st.how === 'classify') {
          visualReplace(p, st.find, st.replace);
          rec.pendingAfterInsert = p.model.pending;
          sourceReplace(p, dom, st.appendFind, st.appendReplace);
          rec.pendingAfterAppend = p.model.pending;
          rec.projection = p.model.ranges.map(x => x.kind + (x.issue ? '(含混标注)' : ''));
          rec.docTypes = docTypes(p.model);
          rec.saveDisabled = dom.window.document.getElementById('save').disabled;
        }
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
        const nowFrags = fragments(p.model);
        rec.fragsKept = initialFrags !== null && nowFrags.length === initialFrags.length && nowFrags.every((f, i) => f === initialFrags[i]);
        if (initialDefs !== null) rec.refsKept = defsOf(p.model) === initialDefs;
        if (st.expect) {
          rec.expectSha = await fileSha(`${CASES}/cases/${id}/${st.expect}`);
          const base = !rec.blocked && rec.sha === rec.expectSha && (initialDefs === null || rec.refsKept);
          if (st.how === 'visualPending') rec.outcome = base && rec.pending && rec.saveDisabled && rec.docTypes.includes('heading') && rec.docTypes.includes('paragraph') ? 'PASS' : 'FAIL';
          else if (st.how === 'saveBlocked') rec.outcome = rec.blockedBySave.includes('保存阻断') && rec.sha === rec.expectSha && rec.savedSha === rec.expectSha ? 'PASS (blocked path; nothing written)' : 'FAIL';
          else if (st.how === 'sourceSave') rec.outcome = base && !rec.pendingAfterFix && rec.savedEqBuffer ? 'PASS' : 'FAIL';
          else rec.outcome = base ? 'PASS' : 'FAIL';
          if (rec.outcome === 'FAIL') rec.actualBytes = Buffer.from(p.model.source, 'utf8').length;
        } else if (st.how === 'openObserve') {
          rec.outcome = rec.issues.length && rec.rendered.heading && rec.rendered.paragraph && rec.rendered.issueMarked && !rec.dirty && rec.saveDisabled && !rec.sourceMode ? 'PASS (口径观察项)' : 'FAIL';
        } else if (st.how === 'reopen') {
          rec.outcome = rec.reopenedIssues === 0 && rec.reopenedDocTypes.includes('heading') && rec.reopenedDocTypes.includes('paragraph') && rec.reopenedDocTypes.includes('protected_block') ? 'PASS' : 'FAIL';
        } else if (st.how === 'classify') {
          rec.outcome = 'OBSERVED';
        } else rec.outcome = rec.blocked ? 'BLOCKED' : (initialDefs !== null && rec.refsKept === false ? 'FAIL (引用定义被改动)' : 'OBSERVED');
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
], { open: 'openMixed' });
await runCase('03-reference-links', 'main', 'input.md', [
  S(1, 'visual', 'after-step-1.md', { find: 'Inkora 文档', replace: 'Inkora 手册' }),
  S(2, 'visual', 'after-step-2.md', { find: '图标', replace: '图示' }),
  S(3, 'linkTarget', 'after-step-3.md', { find: 'Inkora 官网', target: 'https://example.com/inkora-v2' }),
  S(4, 'save', 'after-step-3.md'),
], { defs: true, references: true });
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
await runCase('10-malformed-boundary', 'open-malformed', 'malformed-input.md', [
  S(1, 'openObserve', null, {}),
  S(2, 'saveBlocked', 'malformed-input.md', {}),
  S(3, 'sourceSave', 'malformed-after-step-3.md', { find: '\\int_0^1 x\\,dx', replace: '\\int_0^1 x\\,dx\n$$' }),
  S(3, 'reopen', null, {}),
], { open: 'openMalformed' });
await runCase('10-malformed-boundary', 'create-ambiguity', 'valid-input.md', [
  S(1, 'visual', 'valid-after-step-1.md', { find: '正常正文一段', replace: '正常正文已修改' }),
  S(2, 'visualPending', 'valid-buffer-after-step-2.md', { find: '修复前的尾段正文。', replace: '$$\n修复前的尾段正文。' }),
  S(3, 'sourceSave', 'valid-after-step-3.md', { find: '\n$$\n修复前的尾段正文。', replace: '\n修复前的尾段正文。' }),
  S(4, 'classify', null, { find: '修复前的尾段正文。', replace: '$$\n修复前的尾段正文。', appendFind: '修复前的尾段正文。\n', appendReplace: '修复前的尾段正文。\n$$\n' }),
]);
await runCase('11-mixed-eol-insert', 'main', 'input.md', [
  S(1, 'split', 'after-step-1.md', { anchor: '第二行使用 CRLF 结尾。', insert: '\r\n插入行继承 CRLF。' }),
  S(2, 'split', 'after-step-2.md', { anchor: '尾段 LF 结尾。', insert: '\n新尾行 LF。' }),
]);

console.log(JSON.stringify(results, null, 1));

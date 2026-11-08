// PROTOTYPE UI; no production entry point imports this file.
import { EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { keydownHandler } from 'prosemirror-keymap';
import { TextAreaEditorKernel } from '../../src/editor-kernel';
import { FidelityModel, sourcePosition, diff, bytes, parse } from './model';
import { inkoraSchema as schema } from '../../src/schema';

export const sample = '# 原型标题\r\n\r\n中文正文  特殊\t空白 😀 e\u0301 保持。\r\n\r\n参考 [文档][ref] 与正文。\n\n[ref]: <https://example.invalid> "标题"\n\n- [ ] 任务一\r\n\r\n$$\nx^2 + y^2\n$$\n\n| 表头 | 值 |\n| --- | --- |\n| 原文 | 保留 |\n\n保护块之后的中文。\n';
const $ = (id: string) => document.getElementById(id)!;
let model = new FidelityModel(sample), view: EditorView;
const sourceKernel = new TextAreaEditorKernel($('source-draft') as HTMLTextAreaElement);
let note = '真实 ProseMirror 已加载。所有状态只在内存。', sourceMode = false;
const esc = (s: unknown) => JSON.stringify(s);
function render() {
  view.updateState(model.state);
  const source = $('source-draft') as HTMLTextAreaElement;
  if (!sourceMode) sourceKernel.setText(model.source);
  source.readOnly = !sourceMode;
  const sel = model.state.selection;
  let mapped = '未验证';
  try { mapped = `${sourcePosition(model.source, model.state, model.ranges, sel.from)}..${sourcePosition(model.source, model.state, model.ranges, sel.to)} (UTF-16)`; } catch { mapped = '无可靠映射'; }
  $('state').textContent = `revision: ${model.revision} | dirty: ${model.source !== model.saved} | Undo: ${model.past.length} | Redo: ${model.future.length}\nPM selection: ${sel.from}..${sel.to} | 原文: ${mapped}\n模式: ${sourceMode ? '主动源码草稿' : '可视'} | composition: ${view.composing}\n保存: ${model.blocked || sourceMode ? '阻断' : '允许建立内存快照'}\n${model.blocked || note}`;
  $('ranges').textContent = JSON.stringify({ blocks: model.ranges.map(r => ({ ...r, byteStart: bytes(model.source.slice(0, r.start)).length, byteEnd: bytes(model.source.slice(0, r.end)).length })), coverage: coverage(), patches: model.patches }, null, 2);
  $('diff').textContent = JSON.stringify(diff(model.before, model.source), null, 2);
  $('before').textContent = esc(model.before); $('after').textContent = esc(model.source);
  $('save').toggleAttribute('disabled', !!model.blocked || sourceMode || view.composing);
}
function coverage() {
  let cursor = 0; const all: Array<{ start: number; end: number; owner: string }> = [];
  for (const r of model.ranges) { if (cursor < r.start) all.push({ start: cursor, end: r.start, owner: '原文间隙/引用定义' }); all.push({ start: r.start, end: r.end, owner: r.kind }); cursor = r.end; }
  if (cursor < model.source.length) all.push({ start: cursor, end: model.source.length, owner: '原文尾部' });
  return all;
}
function run(action: () => void) {
  if (view.composing) { note = 'composition 中禁止演示按钮与保存；真实 IME 尚待验收'; render(); return; }
  try { action(); } catch (error) { model.blocked = String(error); note = '操作被拒绝，可信原文与 PM 文档未变；可主动进入源码修复。'; }
  render();
}
view = new EditorView($('visual'), {
  state: model.state,
  dispatchTransaction(tr) {
    try { if (sourceMode && tr.docChanged) throw Error('请先提交或取消源码草稿'); model.transaction(tr); }
    catch (error) { model.blocked = String(error); }
    render();
  },
  handleDOMEvents: { compositionend() { setTimeout(render, 0); return false; }, compositionstart() { setTimeout(render, 0); return false; } },
});
view.setProps({ handleKeyDown: (v, event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); run(() => model.travel(event.shiftKey)); return true; }
  return keydownHandler(baseKeymap)(v, event);
} });
function pick(text: string) {
  let position = -1;
  model.state.doc.descendants((node, pos) => { if (position < 0 && node.isText && node.text!.includes(text)) position = pos + node.text!.indexOf(text); });
  if (position < 0) throw Error('当前样稿找不到：' + text);
  model.select(position, position + text.length); return position;
}
function patchSelection(insert: string) {
  const { from, to } = model.state.selection;
  model.apply([{ from: sourcePosition(model.source, model.state, model.ranges, from), to: sourcePosition(model.source, model.state, model.ranges, to), insert }], model.state.tr.insertText(insert, from, to));
}
// Programmatic draft edits go through the real input path so the kernel
// tracks line endings and user-change state exactly like typed input.
const setDraft = (value: string) => { const source = $('source-draft') as HTMLTextAreaElement; source.value = value; source.dispatchEvent(new Event('input')); };

const actions: Record<string, () => void> = {
  reset() { model = new FidelityModel(sample); sourceMode = false; note = '重新加载隔离样稿（混合 LF/CRLF）'; },
  text() { pick('中文正文'); patchSelection('中文改写'); note = '正文通过真实 PM 文本事务与局部补丁更新'; },
  strong() {
    pick('特殊'); const { from, to } = model.state.selection;
    const a = sourcePosition(model.source, model.state, model.ranges, from), b = sourcePosition(model.source, model.state, model.ranges, to);
    model.apply([{ from: b, to: b, insert: '**' }, { from: a, to: a, insert: '**' }], model.state.tr.addMark(from, to, schema.marks.strong.create()));
    note = '真实 AddMark 事务；仅插入两对定界符';
  },
  heading() {
    const r = model.ranges.find(r => r.kind === 'heading'); if (!r) throw Error('没有标题');
    const node = model.state.doc.nodeAt(r.pos)!;
    if (node.attrs.style !== 'atx' || !model.source.slice(r.start).startsWith('# ')) throw Error('仅验证一级 ATX 标题改二级');
    model.apply([{ from: r.start, to: r.start, insert: '#' }], model.state.tr.setNodeMarkup(r.pos, undefined, { ...node.attrs, level: 2 })); note = '真实标题 attrs 事务；只插入一个 #';
  },
  task() { const p = pick('[ ]'); model.select(p + 1, p + 2); patchSelection('x'); note = '任务通过列表内文字 [ ] → [x] 单字符补丁；尚无 task schema/checkbox 控件'; },
  split() {
    const p = pick('保护块之后'); model.select(p + 3);
    const at = sourcePosition(model.source, model.state, model.ranges, p + 3);
    const eol = model.source.slice(0, at).match(/\r\n|\n/)?.[0] ?? '\n';
    model.apply([{ from: at, to: at, insert: eol + eol }], model.state.tr.split(p + 3)); note = '真实 PM split；只插入空行';
  },
  join() {
    const index = model.ranges.findIndex(r => model.source.slice(r.start, r.end) === '保护块');
    const a = model.ranges[index], b = model.ranges[index + 1];
    if (!a || !b || a.kind !== 'paragraph' || b.kind !== 'paragraph') throw Error('请先执行 split');
    model.apply([{ from: a.end, to: b.start, insert: '' }], model.state.tr.join(b.pos)); note = '真实 PM join；只删除两段之间空行';
  },
  undo() { model.travel(); sourceMode = false; note = '共享快照历史 Undo：原文与真实 PM EditorState 一起恢复'; },
  redo() { model.travel(true); sourceMode = false; note = '共享快照历史 Redo'; },
  source() { sourceMode = true; sourceKernel.setText(model.source); note = '主动编辑源码草稿（复用生产 TextAreaEditorKernel，保真 CRLF/LF/BOM）；可信视图保留且禁止保存'; },
  apply() {
    if (!sourceMode) throw Error('请先主动进入源码');
    const text = sourceKernel.getText();
    if (text === model.source) { sourceMode = false; model.blocked = ''; note = '草稿与可信原文逐字节一致：no-op 提交，不改字节/dirty/revision/history'; return; }
    const same = model.sourceEdit(text);
    sourceMode = false; note = same ? '源码修改完成；语义相同，保留 PM selection，仍计入 dirty/history' : '源码修改完成；结构变化的 selection 尚不支持映射，明确重置到首个可选位置';
  },
  cancel() { sourceMode = false; note = '取消草稿；textarea 由可信原文重置，可信内容不变；错误仍需有效源码提交或 Undo 才能解除'; },
  format() { actions.source(); setDraft(($('source-draft') as HTMLTextAreaElement).value.replace('[ref]: ', '[ref]:   ')); actions.apply(); },
  malformed() { actions.source(); setDraft(($('source-draft') as HTMLTextAreaElement).value.replace('\n$$\n\n|', '\n$\n\n|')); actions.apply(); },
  repair() { if (!sourceMode) actions.source(); setDraft(model.source); actions.apply(); note = '主动提交可信原文修复草稿；字节一致时为 no-op 并解除阻断'; },
  save() { if (model.blocked || sourceMode) throw Error('保存阻断'); model.saved = model.source; note = '仅记录内存保存点；未访问文件系统，未验证原生保存'; },
};
for (const [id, action] of Object.entries(actions)) $(id).addEventListener('click', () => run(action));
// Keep the visual selection when toolbar buttons are pressed.
for (const button of document.querySelectorAll('button')) button.addEventListener('mousedown', event => event.preventDefault());
const scenarios = [
  { title: '正文/标记/属性', description: '观察非规范空白、引用定义和保护块保持字节。每一步均是真实 PM 事务。', steps: ['text', 'strong', 'heading', 'task', 'undo', 'redo'] },
  { title: '拆分与合并', description: '尾段中间拆分，再合并。观察补丁仅包含空行。', steps: ['split', 'join', 'undo', 'redo'] },
  { title: '源码与历史', description: '仅改引用定义格式；PM 语义与选区不变，原文和 dirty 仍变化。然后跨模式撤销。', steps: ['text', 'format', 'undo', 'undo', 'redo', 'redo'] },
  { title: '畸形与修复', description: '删除公式闭合边界；阻断保存并保留可信视图/原文，坏草稿仍可查看。主动修复。', steps: ['malformed', 'repair'] },
];
scenarios.forEach(s => { const b = document.createElement('button'); b.textContent = s.title; b.onclick = () => run(() => {
  actions.reset(); $('guide').replaceChildren(); const p = document.createElement('p'); p.textContent = s.description; $('guide').append(p);
  s.steps.forEach((id, i) => { const step = document.createElement('button'); step.textContent = `${i + 1}. ${$(id).textContent}`; step.onclick = () => run(actions[id]); $('guide').append(step); });
}); $('tabs').append(b); });
// Read-only diagnostics for reproducible non-UI checks; no claimed IME coverage.
Object.assign(window, { fidelityPrototype: { get model() { return model; }, actions, run, parse, diff, view, sourcePosition } });
render();

// INK-PROT-006 证据脚本：纯函数双向选区映射 × 真实 PM 文档/parser。
// 通过锁定 Vite 将 selection-map.ts + model.ts 打包为临时 ESM bundle 后在
// Node 中直接运行（复用仓库既有依赖；结束自动删除临时产物）。
// 样稿只读使用，预期字节仅在计算完成后比对，从不喂入模型或模块。
// 用法：node selection-check.mjs [fidelity-cases 目录]
import { build } from 'vite';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const here = new URL('.', import.meta.url);
const CASES = process.argv[2] ?? fileURLToPath(new URL('../fidelity-cases', here));
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const scalar = s => [...s].length; // Unicode scalar count, distinct from UTF-16 units

// --- build & import the real module + model, then remove temp artifacts ---
const tmpEntry = new URL('.tmp-selection-entry.ts', here);
const outDir = new URL('.tmp-selection-build/', here);
await rm(outDir, { recursive: true, force: true });
await rm(tmpEntry, { force: true });
await writeFile(tmpEntry, "export * from './selection-map';\nexport { FidelityModel, parse, sourcePosition } from './model';\n", 'utf8');
let api;
try {
  await build({
    configFile: false, logLevel: 'warn',
    build: { write: true, minify: false, outDir: outDir.pathname, lib: { entry: tmpEntry.pathname, formats: ['es'], fileName: () => 'bundle.mjs' } },
  });
  api = await import(pathToFileURL(outDir.pathname + 'bundle.mjs').href);
} finally {
  await rm(outDir, { recursive: true, force: true });
  await rm(tmpEntry, { force: true });
}
const { FidelityModel, visualToSource, sourceToVisual, lfText, rawToLf, lfToRaw, sourcePosition } = api;

const results = [];
let failures = 0;
function record(name, ok, detail) {
  if (!ok) { failures++; console.error(`FAIL ${name}: ${JSON.stringify(detail)}`); }
  results.push({ name, ok: !!ok, ...detail });
}
// Locate a doc position: after `needle`'s first occurrence inside a leaf.
function posAfter(doc, needle) {
  let at;
  doc.descendants((n, pos) => {
    if (at === undefined && n.isText && n.text.includes(needle)) at = pos + n.text.indexOf(needle) + needle.length; // UTF-16 units, not scalar count
  });
  if (at === undefined) throw Error(`leaf not found: ${needle}`);
  return at;
}
function posBefore(doc, needle) { // one UTF-16 unit before posAfter
  let at;
  doc.descendants((n, pos) => {
    if (at === undefined && n.isText && n.text.includes(needle)) at = pos + n.text.indexOf(needle);
  });
  if (at === undefined) throw Error(`leaf not found: ${needle}`);
  return at;
}

// ============ 样稿 09 步1：visual→source，🎯 内容锚点 ==================
const input09 = await readFile(`${CASES}/cases/09-source-roundtrip-selection/input.md`, 'utf8');
const expect2 = await readFile(`${CASES}/cases/09-source-roundtrip-selection/after-step-2.md`, 'utf8');
const m09 = new FidelityModel(input09);
const posAfterTarget = posAfter(m09.state.doc, '🎯'); // PM pos after the surrogate pair
const step1 = visualToSource(m09.source, m09.state.doc, m09.ranges, posAfterTarget, posAfterTarget);
const off1 = step1.ok ? step1.anchor : -1;
record('09-step1 visual→source 🎯 锚点', step1.ok && step1.snapped.length === 0
  && m09.source.slice(off1 - 2, off1) === '🎯' && m09.source[off1] === '。'
  && m09.source.indexOf('🎯') === off1 - 2,
  { pmPos: posAfterTarget, utf16Offset: off1, scalarOffset: scalar(m09.source.slice(0, off1)), prev: m09.source.slice(off1 - 2, off1), next: m09.source[off1], snapped: step1.snapped ?? null, reason: step1.reason ?? null });

// 前后向选区与方向保持：anchor 在后（。之后），head 在 🎯 之后。
const posAfterDot = posAfter(m09.state.doc, '🎯。');
const dirFwd = visualToSource(m09.source, m09.state.doc, m09.ranges, posAfterTarget, posAfterDot);
const dirBack = visualToSource(m09.source, m09.state.doc, m09.ranges, posAfterDot, posAfterTarget);
const dirBackRaw = sourceToVisual(m09.source, m09.state.doc, m09.ranges, dirBack.anchor, dirBack.head);
record('09 方向保持（前向/后向选区折返）', dirFwd.ok && dirBack.ok && dirFwd.anchor < dirFwd.head && dirBack.anchor > dirBack.head
  && dirBackRaw.ok && dirBackRaw.anchor === posAfterDot && dirBackRaw.head === posAfterTarget && dirBackRaw.snapped.length === 0,
  { forward: dirFwd.ok ? `${dirFwd.anchor}<${dirFwd.head}` : dirFwd.reason, backward: dirBack.ok ? `${dirBack.anchor}>${dirBack.head}` : dirBack.reason, roundTrip: dirBackRaw.ok ? `${dirBackRaw.anchor},${dirBackRaw.head}` : dirBackRaw.reason });

// 引用块与任务列表叶同样精确折返。
const posQuote = posAfter(m09.state.doc, '引用内');
const posTask = posBefore(m09.state.doc, '勾选');
const quote = visualToSource(m09.source, m09.state.doc, m09.ranges, posQuote, posTask);
const quoteBack = quote.ok ? sourceToVisual(m09.source, m09.state.doc, m09.ranges, quote.anchor, quote.head) : null;
record('09 引用块+任务列表折返', quote.ok && quoteBack.ok && quoteBack.anchor === posQuote && quoteBack.head === posTask
  && m09.source.slice(quote.anchor - 3, quote.anchor) === '引用内' && m09.source.slice(quote.head, quote.head + 2) === '勾选',
  { quote: quote.ok ? quote.anchor : quote.reason, task: quote.ok ? quote.head : quote.reason });
m09.select(posAfterTarget, posAfterTarget); // 真实用户流程：可视模式先落光标，再进源码
// ============ 样稿 09 步2：源码插入「锚点」导致长度/语义变化 ============
const S2 = m09.source.slice(0, off1) + '锚点' + m09.source.slice(off1);
const sameSemantics = m09.sourceEdit(S2); // 真实模型路径：语义变化 → 返回 false
const caretRaw = off1 + '锚点'.length;
const modelDefault = { from: m09.state.selection.from, to: m09.state.selection.to }; // 现状：重置
record('09-step2 源码编辑字节与模型现状', sha(m09.source) === sha(expect2) && sameSemantics === false,
  { bufferShaEqualsFixture: sha(m09.source) === sha(expect2), sourceEditReturned: sameSemantics, modelSelectionAfterEdit: modelDefault, rawLen: m09.source.length, utf16Delta: m09.source.length - input09.length });

// ============ 样稿 09 步3：source→visual，新文档内容锚点 =================
const step3 = sourceToVisual(m09.source, m09.state.doc, m09.ranges, caretRaw, caretRaw);
const posExpect = posAfter(m09.state.doc, '🎯锚点'); // 独立定位：插入文本之后
record('09-step3 source→visual 锚点', step3.ok && step3.snapped.length === 0 && step3.anchor === posExpect && step3.head === posExpect
  && m09.state.doc.textBetween(step3.anchor, step3.anchor + 1) === '。' && m09.state.doc.textBetween(step3.anchor - 2, step3.anchor) === '锚点',
  { caretRaw, mapped: step3.ok ? step3.anchor : step3.reason, independentlyLocated: posExpect, modelDefault, gapClosed: step3.ok && step3.anchor !== modelDefault.from });

// ============ 样稿 09 步4/5：跨模式 Undo/Redo 选区约束 ===================
m09.select(step3.anchor); // 模拟集成：应用映射后的可视选区
m09.travel(false); // undo → input.md
const afterUndo = { from: m09.state.selection.from, to: m09.state.selection.to, sha: sha(m09.source), dirty: m09.source !== m09.saved };
record('09-step4 跨模式 Undo 选区', m09.source === input09 && afterUndo.sha === sha(input09) && afterUndo.from === posAfterTarget && afterUndo.to === posAfterTarget && afterUndo.dirty === false,
  { bytes: afterUndo.sha === sha(input09), selection: `${afterUndo.from},${afterUndo.to}`, expectAfterTarget: posAfterTarget, dirty: afterUndo.dirty });
m09.travel(true); // redo → after-step-2.md
const afterRedo = { from: m09.state.selection.from, to: m09.state.selection.to, sha: sha(m09.source), dirty: m09.source !== m09.saved };
record('09-step5 跨模式 Redo 选区', afterRedo.sha === sha(expect2) && afterRedo.from === step3.anchor && afterRedo.dirty === true,
  { bytes: afterRedo.sha === sha(expect2), selection: `${afterRedo.from},${afterRedo.to}`, expect: step3.anchor, dirty: afterRedo.dirty });

// ============ BOM/CRLF/emoji/组合字符：折返 + textarea 坐标转换 ===========
const sample3 = '\uFEFF# 标题 😀\r\n\r\n段落一 e\u0301 与 🎯。\r\n\r\n> 引用文字。\n\n正文 *强调* 段落。\n';
const m3 = new FidelityModel(sample3);
const pTarget = posAfter(m3.state.doc, '🎯'), pEm = posAfter(m3.state.doc, '强调'.slice(0, 1)), pQuote = posAfter(m3.state.doc, '引用');
const fwdSel = visualToSource(m3.source, m3.state.doc, m3.ranges, pEm, pTarget); // 前向
const backSel = visualToSource(m3.source, m3.state.doc, m3.ranges, pTarget, pQuote); // 后向 anchor>head
const fwdBack = fwdSel.ok ? sourceToVisual(m3.source, m3.state.doc, m3.ranges, fwdSel.anchor, fwdSel.head) : null;
const backBack = backSel.ok ? sourceToVisual(m3.source, m3.state.doc, m3.ranges, backSel.anchor, backSel.head) : null;
record('BOM/CRLF/emoji 折返（含后向选区）', fwdSel.ok && backSel.ok && fwdSel.snapped.length === 0 && backSel.snapped.length === 0
  && fwdBack.ok && fwdBack.anchor === pEm && fwdBack.head === pTarget
  && backBack.ok && backBack.anchor === pTarget && backBack.head === pQuote
  && m3.source.slice(fwdSel.head - 2, fwdSel.head) === '🎯',
  { forward: fwdSel.ok ? [fwdSel.anchor, fwdSel.head] : fwdSel.reason, backward: backSel.ok ? [backSel.anchor, backSel.head] : backSel.reason, roundTripFwd: fwdBack.ok ? [fwdBack.anchor, fwdBack.head] : fwdBack.reason, roundTripBack: backBack.ok ? [backBack.anchor, backBack.head] : backBack.reason });

// textarea LF ↔ canonical raw：全偏移折返 + CRLF 中间偏移按行尾
const crAt = sample3.indexOf('\r'); // first CRLF pair at crAt..crAt+1
const offsets = [];
for (let x = 0; x <= sample3.length; x++) {
  const lf = rawToLf(sample3, x);
  const back = lfToRaw(sample3, lf);
  const midPair = sample3[x - 1] === '\r' && sample3[x] === '\n';
  offsets.push(back === x || (midPair && back === x - 1));
}
const midPairLf = rawToLf(sample3, crAt + 1);
record('LF↔raw 偏移转换', offsets.every(Boolean) && midPairLf === rawToLf(sample3, crAt)
  && lfToRaw(sample3, midPairLf) === crAt && sample3.length - lfText(sample3).length === 4,
  { allOffsetsRoundTrip: offsets.every(Boolean), total: offsets.length, crlfPairsCollapsed: sample3.length - lfText(sample3).length, midPair: { raw: crAt + 1, lf: midPairLf, snappedTo: lfToRaw(sample3, midPairLf) } });

// ============ 源码编辑导致长度变化：CRLF 多行插入后映射 ==================
const source4 = '前句。\r\n\r\n尾段。\n';
const m4 = new FidelityModel(source4);
const off4 = visualToSource(m4.source, m4.state.doc, m4.ranges, posAfter(m4.state.doc, '尾段'), posAfter(m4.state.doc, '尾段'));
const insert = '新行\r\n插入';
const S4 = m4.source.slice(0, off4.anchor) + insert + m4.source.slice(off4.anchor);
m4.sourceEdit(S4);
const caret4 = off4.anchor + insert.length;
const map4 = sourceToVisual(S4, m4.state.doc, m4.ranges, caret4, caret4);
const lfCaret4 = rawToLf(S4, caret4);
record('长度变化+CRLF 插入后映射', S4.includes('尾段新行\r\n插入。') && map4.ok && map4.snapped.length === 0
  && m4.state.doc.textBetween(map4.anchor - 2, map4.anchor) === '插入' && m4.state.doc.textBetween(map4.anchor, map4.anchor + 1) === '。'
  && lfToRaw(S4, lfCaret4) === caret4 && S4.length - source4.length === insert.length,
  { inserted: JSON.stringify(insert), rawDelta: S4.length - source4.length, lfDelta: lfText(S4).length - lfText(source4).length, mapped: map4.ok ? map4.anchor : map4.reason, textAround: map4.ok ? m4.state.doc.textBetween(map4.anchor - 5, map4.anchor + 1) : null });

// ============ 重复文本：跨块同名 + 块内重复叶的正确映射 ==================
const source5a = '同文。\n\n> 同文。\n';
const m5a = new FidelityModel(source5a);
const dupHits = [];
m5a.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('同文。')) dupHits.push({ pos, index: n.text.indexOf('同文。') }); });
const pPara = dupHits[0].pos + dupHits[0].index;             // 段落叶起点
const pQuo = dupHits[1].pos + dupHits[1].index + 3;          // 块引用叶「同文。」之后
const dup = visualToSource(m5a.source, m5a.state.doc, m5a.ranges, pPara, pQuo);
const dupBack = dup.ok ? sourceToVisual(m5a.source, m5a.state.doc, m5a.ranges, dup.anchor, dup.head) : null;
record('重复文本：跨块区分', dup.ok && dup.snapped.length === 0 && dupBack.ok && dupBack.anchor === pPara && dupBack.head === pQuo
  && m5a.source.slice(dup.anchor, dup.anchor + 3) === '同文。' && m5a.source.slice(dup.head - 3, dup.head) === '同文。' && dup.head > 6,
  { paraOff: dup.ok ? dup.anchor : dup.reason, quoteOff: dup.ok ? dup.head : dup.reason });

const source5b = '[锚点](https://example.invalid) 与 *锚点* 尾\n';
const m5b = new FidelityModel(source5b);
// 块内重复叶：同一个「锚点」在链接与强调中各出现一次。009 已把
// model.sourcePosition 升级为顺序叶对齐；006 模块与 model 映射都应落在
// 第二处真实原文，而不能盲取第一处。
const anchorHits = [];
m5b.state.doc.descendants((n, pos) => { if (n.isText && n.text.includes('锚点')) anchorHits.push({ pos, index: n.text.indexOf('锚点') }); });
const pSecond = anchorHits[1].pos + anchorHits[1].index + 1; // strictly inside the second (emphasized) leaf
const dupIn = visualToSource(m5b.source, m5b.state.doc, m5b.ranges, pSecond, pSecond);
const dupInBack = dupIn.ok ? sourceToVisual(m5b.source, m5b.state.doc, m5b.ranges, dupIn.anchor, dupIn.head) : null;
let modelSecond, modelSecondError = '';
try { modelSecond = sourcePosition(m5b.source, m5b.state, m5b.ranges, pSecond, 'from'); } catch (e) { modelSecondError = e.message; }
const secondRaw = source5b.indexOf('锚点', source5b.indexOf('锚点') + 1); // second raw occurrence
// 相邻 marks 文本叶共享边界位置：模块确定性地取左叶末尾（紧邻定界符）。
const boundaryPos = posAfter(m5b.state.doc, ' 与 ');
const boundary = visualToSource(m5b.source, m5b.state.doc, m5b.ranges, boundaryPos, boundaryPos);
let baselineBoundary = '';
try { sourcePosition(m5b.source, m5b.state, m5b.ranges, boundaryPos); } catch (e) { baselineBoundary = e.message; }
record('重复文本：块内重复叶 + marks 边界', dupIn.ok && dupIn.snapped.length === 0 && dupIn.anchor === secondRaw + 1
  && dupInBack.ok && dupInBack.anchor === pSecond && modelSecond === secondRaw + 1
  && boundary.ok && boundary.anchor === source5b.indexOf('*锚点*'),
  { pSecond, secondRaw: dupIn.ok ? dupIn.anchor : dupIn.reason, roundTrip: dupInBack.ok ? dupInBack.anchor : dupInBack.reason, modelSecond: modelSecond ?? modelSecondError, moduleBoundary: boundary.ok ? boundary.anchor : boundary.reason, modelBoundary: baselineBoundary || '(mapped)', delimiterAfterBoundary: boundary.ok ? source5b[boundary.anchor] : null });

// ============ 转义文本：拒绝并给出理由 ====================================
const source6 = '3 \\* 4 与 \\* 5\n';
const m6 = new FidelityModel(source6);
const p6 = posAfter(m6.state.doc, '3 ');
const esc1 = visualToSource(m6.source, m6.state.doc, m6.ranges, p6, p6);
const esc2 = sourceToVisual(m6.source, m6.state.doc, m6.ranges, 4, 4);
record('转义文本拒绝', !esc1.ok && !esc2.ok && esc1.reason.includes('转义') && esc2.reason.includes('转义'),
  { visualToSource: esc1.reason, sourceToVisual: esc2.reason });

// ============ 保护块 / 块间空白 / 语法前缀 / BOM / 文件尾 ==================
const source7 = '序。\n\n$$\nx = 1\n$$\n\n尾段。\n';
const m7 = new FidelityModel(source7);
const mathRange = m7.ranges.find(r => r.kind === 'protected_block');
const prot = sourceToVisual(m7.source, m7.state.doc, m7.ranges, mathRange.start + 4, mathRange.start + 4);
const gap3 = sourceToVisual(m7.source, m7.state.doc, m7.ranges, 3, 3); // 块间空行
const eof = sourceToVisual(m7.source, m7.state.doc, m7.ranges, m7.source.length, m7.source.length);
const contentEnd7 = posAfter(m7.state.doc, '序。'); // 前一块内容末尾 doc 位置
const contentEndLast = posAfter(m7.state.doc, '尾段。'); // 末块内容末尾
const gapConsistency = visualToSource(m7.source, m7.state.doc, m7.ranges, gap3.anchor, gap3.anchor);
record('保护块拒绝 + 空白/文件尾吸附', !prot.ok && prot.reason.includes('受保护块')
  && gap3.ok && gap3.snapped.length >= 1 && gap3.anchor === contentEnd7
  && eof.ok && eof.anchor === contentEndLast
  // 反向映射内容末尾是精确命中（无吸附）：与块间吸附落在同一内容锚点。
  && gapConsistency.ok && gapConsistency.anchor === 2 && gapConsistency.snapped.length === 0,
  { protectedReason: prot.reason, gapSnapped: gap3.ok ? { to: gap3.anchor, note: gap3.snapped[0] } : gap3.reason, eofSnapped: eof.ok ? eof.anchor : eof.reason, reverseMap: gapConsistency.ok ? gapConsistency.anchor : gapConsistency.reason });

const bom0 = sourceToVisual(m3.source, m3.state.doc, m3.ranges, 0, 0); // BOM 之前
const prefix = sourceToVisual(m3.source, m3.state.doc, m3.ranges, 2, 2); // '#' 之后空格处
const headStart = posBefore(m3.state.doc, '标题');
record('BOM/语法前缀吸附', bom0.ok && bom0.anchor === headStart && bom0.snapped[0].includes('BOM')
  && prefix.ok && prefix.anchor === headStart && prefix.snapped[0].includes('语法前缀'),
  { bom0: bom0.ok ? { to: bom0.anchor, note: bom0.snapped[0] } : bom0.reason, hashPrefix: prefix.ok ? { to: prefix.anchor, note: prefix.snapped[0] } : prefix.reason });

console.log(JSON.stringify(results, null, 1));
if (failures) { console.error(`\n${failures} 项失败`); process.exit(1); }
console.log(`\nPASS: ${results.length} 项可复现校验通过；临时打包产物已清除。不构成 WKWebView/IME/UI 验收。`);

// INK-PROT-018: audited replay of the semantic edge cases corrected by
// fidelity-cases/SEMANTIC-AUDIT.md. Expected files are read only after an
// action has run; manifest `ops` are deliberately never used as input.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = resolve(process.argv[2] ?? resolve(here, '../fidelity-cases'));
const prototypePath = resolve(process.argv[3] ?? resolve(here, 'PROTOTYPE.html'));
const outputPath = resolve(process.argv[4] ?? resolve(here, 'audited-crossval-results.json'));
const baseline = '30b73530af2e8dac37399a0dc9df64f8a9689eb3';
const focusIds = new Set(['05-marks-attrs', '06-split-join', '11-mixed-eol-insert']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const utf8 = value => Buffer.from(value, 'utf8');

const manifestBytes = await readFile(resolve(casesDir, 'cases.json'));
const prototypeBytes = await readFile(prototypePath);
const manifest = JSON.parse(manifestBytes);
const focusCases = manifest.cases.filter(item => focusIds.has(item.id));
if (focusCases.length !== focusIds.size) throw new Error('focused cases are missing from cases.json');

const report = {
  schemaVersion: 2,
  task: 'INK-PROT-018',
  baseline,
  invocation: { casesDir, prototypePath, outputPath },
  artifacts: {
    manifest: { path: resolve(casesDir, 'cases.json'), sha256: sha256(manifestBytes) },
    prototype: { path: prototypePath, sha256: sha256(prototypeBytes) },
    inputs: {},
  },
  cases: [],
  isolatedProbes: [],
  probes: [],
  oracleEvidence: [],
  runnerErrors: [],
};

for (const item of focusCases) {
  const inputPath = resolve(casesDir, 'cases', item.id, 'input.md');
  const bytes = await readFile(inputPath);
  report.artifacts.inputs[item.id] = {
    path: inputPath,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function boot() {
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => jsdomErrors.push(String(error)));
  const dom = new JSDOM(prototypeBytes, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) { window.TextEncoder = TextEncoder; },
  });
  const prototype = dom.window.fidelityPrototype;
  if (!prototype?.model || !prototype?.view || !prototype?.actions) {
    dom.window.close();
    throw new Error('PROTOTYPE.html did not expose fidelityPrototype');
  }
  return { dom, prototype, jsdomErrors };
}

function loadCase(prototype, source) {
  prototype.model.sourceEdit(source);
  prototype.model.past.length = 0;
  prototype.model.future.length = 0;
  prototype.model.saved = source;
  prototype.model.before = source;
  prototype.model.revision = 0;
  prototype.model.blocked = '';
  prototype.model.patches = [];
  prototype.run(() => {}); // synchronize EditorView with the loaded model
}

function findDocText(prototype, needle, offset = 0) {
  let position = -1;
  prototype.model.state.doc.descendants((node, pos) => {
    if (position >= 0 || !node.isText) return;
    const index = node.text.indexOf(needle);
    if (index >= 0) position = pos + index + offset;
  });
  if (position < 0) throw new Error(`document anchor not found: ${JSON.stringify(needle)}`);
  return position;
}

function stateSnapshot(prototype) {
  const source = prototype.model.source;
  return {
    sha256: sha256(utf8(source)),
    bytes: Buffer.byteLength(source),
    mode: prototype.sourceMode ? 'source' : 'visual',
    dirty: prototype.model.dirty,
    revision: prototype.model.revision,
    history: { past: prototype.model.past.length, future: prototype.model.future.length },
    selection: prototype.model.state.selection.toJSON(),
    blocked: prototype.model.blocked || '',
    pending: prototype.model.pending,
    staged: prototype.model.staged ? { kind: prototype.model.staged.kind } : null,
    patches: prototype.model.patches.map(patch => ({ ...patch })),
  };
}

function byteDiff(actual, expected) {
  const a = utf8(actual);
  const b = Buffer.isBuffer(expected) ? expected : utf8(expected);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > prefix && bEnd > prefix && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
  }
  return {
    equal: a.equals(b),
    firstDifferentByte: prefix,
    actualRange: [prefix, aEnd],
    expectedRange: [prefix, bEnd],
    actualHex: a.subarray(prefix, Math.min(aEnd, prefix + 48)).toString('hex'),
    expectedHex: b.subarray(prefix, Math.min(bEnd, prefix + 48)).toString('hex'),
  };
}

async function compareExpected(caseId, step, actual) {
  const expectedPath = resolve(casesDir, 'cases', caseId, step.expect.file);
  const expected = await readFile(expectedPath); // post-action oracle read
  const actualBytes = utf8(actual);
  return {
    path: expectedPath,
    declaredSha256: step.expect.sha256,
    declaredBytes: step.expect.bytes ?? null,
    actualSha256: sha256(actualBytes),
    actualBytes: actualBytes.length,
    expectedSha256: sha256(expected),
    expectedBytes: expected.length,
    manifestMatchesFile: step.expect.sha256 === sha256(expected)
      && (step.expect.bytes === undefined || step.expect.bytes === expected.length),
    diff: byteDiff(actual, expected),
  };
}

function dispatchKey(dom, prototype, key) {
  const before = stateSnapshot(prototype);
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
  });
  const dispatched = prototype.view.dom.dispatchEvent(event);
  const after = stateSnapshot(prototype);
  return { key, defaultPrevented: event.defaultPrevented, dispatched, before, after };
}

function setVisualCaret(prototype, needle, offset = needle.length) {
  const position = findDocText(prototype, needle, offset);
  prototype.model.select(position);
  prototype.run(() => {});
  return position;
}

function editSource(dom, prototype, edit) {
  prototype.run(prototype.actions.source);
  const textarea = dom.window.document.getElementById('source-draft');
  if (!prototype.sourceMode || !textarea) throw new Error('source textarea did not open');
  const before = textarea.value;
  const change = edit(before);
  if (!change || typeof change.value !== 'string' || !Number.isInteger(change.caret)) {
    throw new Error('source edit did not return value/caret');
  }
  textarea.value = change.value;
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  textarea.setSelectionRange(change.caret, change.caret, 'forward');
  prototype.run(prototype.actions.apply);
  return {
    textareaBeforeSha256: sha256(utf8(before)),
    textareaAfterSha256: sha256(utf8(change.value)),
    caret: change.caret,
    sourceModeAfterApply: prototype.sourceMode,
  };
}

function insertAfterUnique(text, anchor, insert) {
  const first = text.indexOf(anchor);
  if (first < 0 || text.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`source anchor is absent or ambiguous: ${JSON.stringify(anchor)}`);
  }
  const caret = first + anchor.length;
  return { value: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
}

function replaceUnique(text, fragment, replacement) {
  const first = text.indexOf(fragment);
  if (first < 0 || text.indexOf(fragment, first + fragment.length) >= 0) {
    throw new Error(`source fragment is absent or ambiguous: ${JSON.stringify(fragment)}`);
  }
  const caret = first + replacement.length;
  return {
    value: text.slice(0, first) + replacement + text.slice(first + fragment.length),
    caret,
  };
}

function dispatchNative(prototype, transaction) {
  prototype.view.dispatch(transaction);
  prototype.run(() => {});
}

function runCase05Step(prototype, stepNumber) {
  const model = prototype.model;
  if (stepNumber === 1) {
    const from = findDocText(prototype, '加粗');
    const to = from + '加粗'.length;
    const strong = model.state.schema.marks.strong;
    dispatchNative(prototype, model.state.tr.removeMark(from, to, strong));
    return { command: 'EditorView.dispatch(Transaction.removeMark(strong))', sourceInput: 'current source metadata' };
  }
  if (stepNumber === 2) {
    const range = model.ranges.find(item => item.kind === 'heading');
    if (!range) throw new Error('heading range not found');
    const node = model.state.doc.nodeAt(range.pos);
    dispatchNative(prototype, model.state.tr.setNodeMarkup(range.pos, undefined, { ...node.attrs, level: 3 }));
    return { command: 'EditorView.dispatch(Transaction.setNodeMarkup(heading level=3))', sourceInput: 'current heading attrs/source marker' };
  }
  if (stepNumber === 3) {
    const from = findDocText(prototype, '行内代码');
    const insertAt = from + '行'.length;
    dispatchNative(prototype, model.state.tr.insertText('`', insertAt));
    return { command: 'EditorView.dispatch(Transaction.insertText inside code mark)', sourceInput: 'current code leaf/delimiter metadata' };
  }
  if (stepNumber === 4) {
    let codeBlock = null;
    model.state.doc.descendants((node, pos) => {
      if (!codeBlock && node.type.name === 'code_block') codeBlock = { node, pos };
    });
    if (!codeBlock) throw new Error('fenced code block not found');
    dispatchNative(prototype, model.state.tr.setNodeMarkup(codeBlock.pos, undefined, {
      ...codeBlock.node.attrs,
      language: 'swift',
    }));
    return { command: 'EditorView.dispatch(Transaction.setNodeMarkup(code_block language=swift))', sourceInput: 'current fence attrs/source info' };
  }
  throw new Error(`unknown case 05 step: ${stepNumber}`);
}

function runCase06VisualStep(dom, prototype, stepNumber) {
  const specifications = {
    1: { anchor: '拆分点', offset: '拆分点'.length, key: 'Enter' },
    2: { anchor: '在句中', offset: 0, key: 'Backspace' },
    3: { anchor: '衔接点', offset: '衔接点'.length, key: 'Enter' },
    4: { anchor: '在末尾', offset: 0, key: 'Backspace' },
  };
  const specification = specifications[stepNumber];
  setVisualCaret(prototype, specification.anchor, specification.offset);
  return dispatchKey(dom, prototype, specification.key);
}

function runSourceStep(dom, prototype, caseId, variantId, stepNumber) {
  if (caseId === '06-split-join' && variantId === 'softbreak' && stepNumber === 1) {
    return editSource(dom, prototype, text => insertAfterUnique(text, '拆分点', '\n'));
  }
  if (caseId === '06-split-join' && variantId === 'softbreak' && stepNumber === 2) {
    return editSource(dom, prototype, text => replaceUnique(text, '拆分点\n在句中', '拆分点在句中'));
  }
  if (caseId === '11-mixed-eol-insert' && variantId === 'main' && stepNumber === 1) {
    return editSource(dom, prototype, text => insertAfterUnique(text, '第二行使用 CRLF 结尾。', '\n插入行继承 CRLF。'));
  }
  if (caseId === '11-mixed-eol-insert' && variantId === 'main' && stepNumber === 2) {
    return editSource(dom, prototype, text => insertAfterUnique(text, '尾段 LF 结尾。', '\n新尾行 LF。'));
  }
  throw new Error(`unknown source step: ${caseId}/${variantId}/${stepNumber}`);
}

function runVisual11Step(dom, prototype, variantId, stepNumber) {
  const specification = stepNumber === 1
    ? { anchor: '第二行使用 CRLF 结尾。', text: '插入为独立段落。' }
    : { anchor: '尾段 LF 结尾。', text: '新尾段 LF。' };
  setVisualCaret(prototype, specification.anchor);
  const enter = dispatchKey(dom, prototype, 'Enter');
  if (prototype.model.blocked) return { enter, typed: false, reason: prototype.model.blocked };
  prototype.view.dispatch(prototype.model.state.tr.insertText(specification.text));
  if (prototype.model.blocked) return { enter, typed: true, reason: prototype.model.blocked };
  if (variantId === 'visual-split' && stepNumber === 1) {
    const secondEnter = dispatchKey(dom, prototype, 'Enter');
    if (prototype.model.blocked) return { enter, typed: true, secondEnter, reason: prototype.model.blocked };
    const forwardDelete = dispatchKey(dom, prototype, 'Delete');
    return { enter, typed: true, secondEnter, forwardDelete, text: specification.text };
  }
  return { enter, typed: true, text: specification.text };
}

function targetStatus(before, after, execution) {
  if (after.blocked) return 'FAIL';
  if (before.sha256 === after.sha256 && execution !== 'SOURCE_INPUT_KERNEL') return 'UNSUPPORTED';
  return 'EXECUTED';
}

async function replayVariant(caseItem, variant) {
  const record = { id: caseItem.id, variant: variant.id, steps: [], jsdomErrors: [] };
  report.cases.push(record);
  let context;
  try {
    context = boot();
    const input = await readFile(resolve(casesDir, 'cases', caseItem.id, 'input.md'), 'utf8');
    loadCase(context.prototype, input);
    record.load = { status: 'OK', state: stateSnapshot(context.prototype) };
  } catch (error) {
    record.load = { status: 'RUNNER_ERROR', error: String(error.stack || error) };
    report.runnerErrors.push(`${caseItem.id}/${variant.id}: ${error.message}`);
    context?.dom.window.close();
    return;
  }

  const { dom, prototype, jsdomErrors } = context;
  let chainBlocked = false;
  try {
    for (const step of variant.steps) {
      const row = {
        n: step.n,
        action: step.action,
        declaredMode: step.mode,
        actuallyExecuted: false,
        executionLayer: null,
        status: null,
        before: stateSnapshot(prototype),
      };
      record.steps.push(row);
      if (chainBlocked) {
        row.executionLayer = 'NOT_EXECUTED';
        row.status = 'BLOCKED_BY_PREVIOUS';
        row.after = stateSnapshot(prototype);
        row.expected = await compareExpected(caseItem.id, step, prototype.model.source);
        continue;
      }
      try {
        if (caseItem.id === '05-marks-attrs') {
          row.executionLayer = 'EDITORVIEW_DISPATCH_PM_TRANSACTION';
          row.execution = runCase05Step(prototype, step.n);
        } else if (caseItem.id === '06-split-join' && variant.id === 'main') {
          row.executionLayer = 'VISUAL_KEYDOWN';
          row.execution = runCase06VisualStep(dom, prototype, step.n);
        } else if (caseItem.id === '11-mixed-eol-insert' && (variant.id === 'visual-split' || variant.id === 'single-enter')) {
          row.executionLayer = 'VISUAL_KEYDOWN_AND_VIEW_DISPATCH';
          row.execution = runVisual11Step(dom, prototype, variant.id, step.n);
        } else {
          row.executionLayer = 'SOURCE_INPUT_KERNEL';
          row.execution = runSourceStep(dom, prototype, caseItem.id, variant.id, step.n);
        }
        row.actuallyExecuted = true;
        row.after = stateSnapshot(prototype);
        row.status = targetStatus(row.before, row.after, row.executionLayer);
      } catch (error) {
        row.actuallyExecuted = true;
        row.after = stateSnapshot(prototype);
        row.status = 'RUNNER_ERROR';
        row.error = String(error.stack || error);
        report.runnerErrors.push(`${caseItem.id}/${variant.id}/${step.n}: ${error.message}`);
      }

      try {
        row.expected = await compareExpected(caseItem.id, step, prototype.model.source);
        if (!row.expected.diff.equal && row.status === 'EXECUTED') row.status = 'FAIL';
        if (row.expected.diff.equal && row.status === 'EXECUTED') row.status = 'PASS';
      } catch (error) {
        row.status = 'RUNNER_ERROR';
        row.error = `expected comparison failed: ${String(error.stack || error)}`;
        report.runnerErrors.push(`${caseItem.id}/${variant.id}/${step.n} oracle: ${error.message}`);
      }

      if (['FAIL', 'UNSUPPORTED', 'RUNNER_ERROR'].includes(row.status)) chainBlocked = true;
    }
  } finally {
    record.jsdomErrors = jsdomErrors;
    dom.window.close();
  }
}

for (const caseItem of focusCases) {
  for (const variant of caseItem.variants) await replayVariant(caseItem, variant);
}

async function isolatedVisualProbe(caseId, stepNumber, preconditionFile, expectedFile) {
  const probe = {
    case: caseId,
    step: stepNumber,
    scope: 'isolated-precondition-branch',
    preconditionFile,
    expectedFile,
    status: null,
  };
  report.isolatedProbes.push(probe);
  let context;
  try {
    context = boot();
    const precondition = await readFile(resolve(casesDir, 'cases', caseId, preconditionFile), 'utf8');
    loadCase(context.prototype, precondition);
    probe.before = stateSnapshot(context.prototype);
    probe.execution = runCase06VisualStep(context.dom, context.prototype, stepNumber);
    probe.after = stateSnapshot(context.prototype);
    probe.actuallyExecuted = true;
    const expected = await readFile(resolve(casesDir, 'cases', caseId, expectedFile));
    probe.expected = {
      sha256: sha256(expected),
      bytes: expected.length,
      diff: byteDiff(context.prototype.model.source, expected),
    };
    probe.status = probe.after.blocked ? 'FAIL'
      : probe.expected.diff.equal ? 'PASS_ISOLATED' : 'FAIL';
  } catch (error) {
    probe.status = 'RUNNER_ERROR';
    probe.error = String(error.stack || error);
    report.runnerErrors.push(`isolated ${caseId}/${stepNumber}: ${error.message}`);
  } finally {
    context?.dom.window.close();
  }
}

await isolatedVisualProbe('06-split-join', 2, 'after-step-1.md', 'after-step-2.md');
await isolatedVisualProbe('06-split-join', 3, 'input.md', 'after-step-3.md');
await isolatedVisualProbe('06-split-join', 4, 'after-step-3.md', 'after-step-4.md');

// Empty-document visual typing is intentionally a target probe, not a repair.
{
  const probe = { id: 'empty-document-visual-input', executionLayer: 'VIEW_DISPATCH', status: null };
  report.probes.push(probe);
  let context;
  try {
    context = boot();
    loadCase(context.prototype, '');
    probe.before = stateSnapshot(context.prototype);
    context.prototype.view.dispatch(context.prototype.model.state.tr.insertText('中文😀', 1));
    probe.afterInsert = stateSnapshot(context.prototype);
    context.prototype.run(context.prototype.actions.undo);
    probe.afterUndo = stateSnapshot(context.prototype);
    context.prototype.run(context.prototype.actions.redo);
    probe.afterRedo = stateSnapshot(context.prototype);
    probe.after = probe.afterRedo;
    probe.actuallyExecuted = true;
    probe.expectedText = '中文😀';
    probe.status = context.prototype.model.source === '中文😀'
      && probe.afterInsert.selection.anchor === 5
      && probe.afterInsert.dirty
      && probe.afterUndo.sha256 === probe.before.sha256
      && !probe.afterUndo.dirty
      && probe.afterRedo.sha256 === probe.afterInsert.sha256
      && probe.afterRedo.selection.anchor === 5
      && !probe.after.blocked ? 'PASS' : 'FAIL';
  } catch (error) {
    probe.status = 'RUNNER_ERROR';
    probe.error = String(error.stack || error);
    report.runnerErrors.push(`empty-document-visual-input: ${error.message}`);
  } finally {
    context?.dom.window.close();
  }
}

// The existing sequential inline map deliberately refuses destination/text
// collisions. A native transaction must keep both trusted source and PM doc.
{
  const probe = { id: 'native-inline-collision-refusal', executionLayer: 'VIEW_DISPATCH', status: null };
  report.probes.push(probe);
  let context;
  try {
    context = boot();
    loadCase(context.prototype, '[a](later)later\n');
    const from = findDocText(context.prototype, 'later');
    probe.before = stateSnapshot(context.prototype);
    const beforeDoc = context.prototype.model.state.doc.toJSON();
    context.prototype.view.dispatch(context.prototype.model.state.tr.insertText('after', from, from + 5));
    probe.after = stateSnapshot(context.prototype);
    probe.sourceKept = context.prototype.model.source === '[a](later)later\n';
    probe.docKept = JSON.stringify(context.prototype.model.state.doc.toJSON()) === JSON.stringify(beforeDoc);
    probe.status = probe.sourceKept && probe.docKept
      && probe.after.blocked.includes('补丁重解析与目标 PM 文档不一致') ? 'PASS' : 'FAIL';
  } catch (error) {
    probe.status = 'RUNNER_ERROR';
    probe.error = String(error.stack || error);
    report.runnerErrors.push(`native-inline-collision-refusal: ${error.message}`);
  } finally {
    context?.dom.window.close();
  }
}

// Record the actual local patch payloads, rather than inferring EOL behavior
// only from whole-file hashes.
{
  const findRow = (caseId, variantId, step) => report.cases
    .find(item => item.id === caseId && item.variant === variantId)?.steps.find(item => item.n === step);
  const paragraph = findRow('06-split-join', 'main', 1);
  const list = findRow('06-split-join', 'main', 3);
  const mixedCrLf = findRow('11-mixed-eol-insert', 'single-enter', 1);
  const mixedLf = findRow('11-mixed-eol-insert', 'single-enter', 2);
  const probe = {
    id: 'native-local-eol-patch-ranges',
    executionLayer: 'RECORDED_NATIVE_PATCHES',
    patches: {
      paragraph: paragraph?.after?.patches ?? [],
      list: list?.after?.patches ?? [],
      mixedCrLf: mixedCrLf?.after?.patches ?? [],
      mixedLf: mixedLf?.after?.patches ?? [],
    },
  };
  const inserts = Object.fromEntries(Object.entries(probe.patches).map(([key, patches]) => [key, patches.map(patch => patch.insert).join('')]));
  probe.insertEscapes = Object.fromEntries(Object.entries(inserts).map(([key, value]) => [key, JSON.stringify(value)]));
  probe.status = inserts.paragraph === '\r\n\r\n'
    && inserts.list === '\r\n- '
    && inserts.mixedCrLf === '\r\n插入为独立段落。\r\n'
    && inserts.mixedLf === '\n新尾段 LF。\n' ? 'PASS' : 'FAIL';
  report.probes.push(probe);
}

const allRows = report.cases.flatMap(item => item.steps);
const nativeRows = allRows;
const targetFailures = [
  ...nativeRows.filter(row => ['FAIL', 'UNSUPPORTED', 'BLOCKED_BY_PREVIOUS'].includes(row.status)),
  ...report.isolatedProbes.filter(item => item.status === 'FAIL'),
  ...report.probes.filter(item => item.status === 'FAIL'),
];
report.summary = {
  status: report.runnerErrors.length ? 'RUNNER_ERROR'
    : targetFailures.length ? 'NOT_PASS'
      : nativeRows.every(row => row.status === 'PASS') ? 'PASS' : 'NOT_PASS',
  counts: {
    pass: allRows.filter(row => row.status === 'PASS').length,
    explicitPatchDemo: 0,
    fail: allRows.filter(row => row.status === 'FAIL').length,
    unsupported: allRows.filter(row => row.status === 'UNSUPPORTED').length,
    blockedByPrevious: allRows.filter(row => row.status === 'BLOCKED_BY_PREVIOUS').length,
    runnerError: report.runnerErrors.length,
    isolatedPass: report.isolatedProbes.filter(item => item.status === 'PASS_ISOLATED').length,
    isolatedFail: report.isolatedProbes.filter(item => item.status === 'FAIL').length,
    probePass: report.probes.filter(item => item.status === 'PASS').length,
    probeFail: report.probes.filter(item => item.status === 'FAIL').length,
    oracleActionAmbiguity: 0,
    targetGapTotal: targetFailures.length,
  },
  toDisk: 'Prototype save points are in memory only; this driver performs no user-file save.',
  realEnvironmentNotCovered: ['desktop app', 'WKWebView', 'IME', 'user files'],
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
process.exitCode = report.summary.status === 'PASS' ? 0
  : report.summary.status === 'RUNNER_ERROR' ? 2 : 1;

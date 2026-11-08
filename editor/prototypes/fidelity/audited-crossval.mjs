// INK-PROT-012: audited replay of the semantic edge cases corrected by
// fidelity-cases/SEMANTIC-AUDIT.md. Expected files are read only after an
// action has run; manifest `ops` are deliberately never used as input.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import MarkdownIt from 'markdown-it';
import { splitBlock } from 'prosemirror-commands';
import { EditorState, TextSelection } from 'prosemirror-state';

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = resolve(process.argv[2] ?? resolve(here, '../fidelity-cases'));
const prototypePath = resolve(process.argv[3] ?? resolve(here, 'PROTOTYPE.html'));
const outputPath = resolve(process.argv[4] ?? resolve(here, 'audited-crossval-results.json'));
const baseline = '698dbdb9fa10a7d246a1ff36259e5beec17f69ec';
const focusIds = new Set(['05-marks-attrs', '06-split-join', '11-mixed-eol-insert']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const utf8 = value => Buffer.from(value, 'utf8');

const manifestBytes = await readFile(resolve(casesDir, 'cases.json'));
const prototypeBytes = await readFile(prototypePath);
const manifest = JSON.parse(manifestBytes);
const focusCases = manifest.cases.filter(item => focusIds.has(item.id));
if (focusCases.length !== focusIds.size) throw new Error('focused cases are missing from cases.json');

const report = {
  schemaVersion: 1,
  task: 'INK-PROT-012',
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
    dirty: source !== prototype.model.saved,
    revision: prototype.model.revision,
    history: { past: prototype.model.past.length, future: prototype.model.future.length },
    selection: prototype.model.state.selection.toJSON(),
    blocked: prototype.model.blocked || '',
    pending: prototype.model.pending,
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

function applyExplicitDemo(prototype, patches, transaction) {
  prototype.model.apply(patches, transaction);
  prototype.run(() => {});
}

function runCase05Step(prototype, stepNumber) {
  const model = prototype.model;
  if (stepNumber === 1) {
    const from = findDocText(prototype, '加粗');
    const to = from + '加粗'.length;
    const token = '**加粗**';
    const sourceAt = model.source.indexOf(token);
    if (sourceAt < 0) throw new Error('strong delimiter anchor not found');
    const strong = model.state.schema.marks.strong;
    applyExplicitDemo(prototype, [
      { from: sourceAt + token.length - 2, to: sourceAt + token.length, insert: '' },
      { from: sourceAt, to: sourceAt + 2, insert: '' },
    ], model.state.tr.removeMark(from, to, strong));
    return { command: 'Transaction.removeMark(strong)', patches: 'remove surrounding **' };
  }
  if (stepNumber === 2) {
    const range = model.ranges.find(item => item.kind === 'heading');
    if (!range) throw new Error('heading range not found');
    const node = model.state.doc.nodeAt(range.pos);
    applyExplicitDemo(prototype, [
      { from: range.start, to: range.start, insert: '#' },
    ], model.state.tr.setNodeMarkup(range.pos, undefined, { ...node.attrs, level: 3 }));
    return { command: 'Transaction.setNodeMarkup(heading level=3)', patches: 'insert one #' };
  }
  if (stepNumber === 3) {
    const from = findDocText(prototype, '行内代码');
    const insertAt = from + '行'.length;
    const token = '`行内代码`';
    const sourceAt = model.source.indexOf(token);
    if (sourceAt < 0) throw new Error('inline-code delimiter anchor not found');
    applyExplicitDemo(prototype, [
      { from: sourceAt, to: sourceAt + token.length, insert: '``行`内代码``' },
    ], model.state.tr.insertText('`', insertAt));
    return { command: 'Transaction.insertText inside code mark', patches: 'grow code delimiters to ``' };
  }
  if (stepNumber === 4) {
    let codeBlock = null;
    model.state.doc.descendants((node, pos) => {
      if (!codeBlock && node.type.name === 'code_block') codeBlock = { node, pos };
    });
    if (!codeBlock) throw new Error('fenced code block not found');
    const token = '```python';
    const sourceAt = model.source.indexOf(token);
    if (sourceAt < 0) throw new Error('fence info string not found');
    applyExplicitDemo(prototype, [
      { from: sourceAt + 3, to: sourceAt + token.length, insert: 'swift' },
    ], model.state.tr.setNodeMarkup(codeBlock.pos, undefined, {
      ...codeBlock.node.attrs,
      language: 'swift',
    }));
    return { command: 'Transaction.setNodeMarkup(code_block language=swift)', patches: 'replace info string only' };
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

function runVisual11Step(dom, prototype, stepNumber) {
  const specification = stepNumber === 1
    ? { anchor: '第二行使用 CRLF 结尾。', text: '插入为独立段落。' }
    : { anchor: '尾段 LF 结尾。', text: '新尾段 LF。' };
  setVisualCaret(prototype, specification.anchor);
  const enter = dispatchKey(dom, prototype, 'Enter');
  if (prototype.model.blocked || enter.before.sha256 === enter.after.sha256) {
    return { enter, typed: false, reason: prototype.model.blocked || 'Enter made no source change' };
  }
  prototype.view.dispatch(prototype.model.state.tr.insertText(specification.text));
  return { enter, typed: true, text: specification.text };
}

function targetStatus(before, after, execution) {
  if (after.blocked) return 'FAIL';
  if (before.sha256 === after.sha256 && execution !== 'SOURCE_INPUT_KERNEL') return 'UNSUPPORTED';
  return execution === 'EXPLICIT_PATCH_DEMO' ? 'DEMO_EXECUTED' : 'EXECUTED';
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
          row.executionLayer = 'EXPLICIT_PATCH_DEMO';
          row.execution = runCase05Step(prototype, step.n);
        } else if (caseItem.id === '06-split-join' && variant.id === 'main') {
          row.executionLayer = 'VISUAL_KEYDOWN';
          row.execution = runCase06VisualStep(dom, prototype, step.n);
        } else if (caseItem.id === '11-mixed-eol-insert' && variant.id === 'visual-split') {
          row.executionLayer = 'VISUAL_KEYDOWN_AND_VIEW_DISPATCH';
          row.execution = runVisual11Step(dom, prototype, step.n);
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
        if (!row.expected.diff.equal && ['EXECUTED', 'DEMO_EXECUTED'].includes(row.status)) row.status = 'FAIL';
        if (row.expected.diff.equal && row.status === 'EXECUTED') row.status = 'PASS';
        if (row.expected.diff.equal && row.status === 'DEMO_EXECUTED') row.status = 'EXPLICIT_PATCH_DEMO';
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
    context.prototype.view.dispatch(context.prototype.model.state.tr.insertText('普通输入', 1));
    probe.after = stateSnapshot(context.prototype);
    probe.actuallyExecuted = true;
    probe.expectedText = '普通输入';
    probe.status = context.prototype.model.source === '普通输入' && !probe.after.blocked ? 'PASS' : 'FAIL';
  } catch (error) {
    probe.status = 'RUNNER_ERROR';
    probe.error = String(error.stack || error);
    report.runnerErrors.push(`empty-document-visual-input: ${error.message}`);
  } finally {
    context?.dom.window.close();
  }
}

// Independent counterexample for case 11 step 1. A real PM splitBlock plus
// typing creates two paragraphs in the affected region; the frozen oracle has
// three. This records ambiguity without changing or feeding the oracle.
{
  const evidence = {
    case: '11-mixed-eol-insert',
    variant: 'visual-split',
    step: 1,
    status: 'ORACLE_ACTION_AMBIGUITY',
    actionModel: 'one Enter (splitBlock) followed by one text insertion',
  };
  report.oracleEvidence.push(evidence);
  let context;
  try {
    context = boot();
    const input = await readFile(resolve(casesDir, 'cases', evidence.case, 'input.md'), 'utf8');
    loadCase(context.prototype, input);
    const doc = context.prototype.model.state.doc;
    const cursor = findDocText(context.prototype, '第二行使用 CRLF 结尾。', '第二行使用 CRLF 结尾。'.length);
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, cursor) });
    let splitTransaction = null;
    evidence.splitCommandHandled = splitBlock(state, transaction => { splitTransaction = transaction; });
    if (!splitTransaction) throw new Error('splitBlock did not produce a transaction');
    state = state.apply(splitTransaction);
    state = state.apply(state.tr.insertText('插入为独立段落。'));
    evidence.pm = {
      topLevelTypes: state.doc.content.content.map(node => node.type.name),
      topLevelParagraphs: state.doc.content.content.filter(node => node.type.name === 'paragraph').length,
      affectedBlocks: state.doc.content.content.slice(0, 2).map(node => node.toJSON()),
      selection: state.selection.toJSON(),
    };

    const candidate = input.replace(
      '第二行使用 CRLF 结尾。\r\n第三行回到 LF。',
      '第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n第三行回到 LF。',
    );
    if (candidate === input) throw new Error('counterexample source anchor not found');
    const oracle = await readFile(resolve(casesDir, 'cases', evidence.case, 'visual-after-step-1.md'));
    const markdown = new MarkdownIt('commonmark');
    const paragraphCount = source => markdown.parse(source, {})
      .filter(token => token.level === 0 && token.type === 'paragraph_open').length;
    evidence.commonMark = {
      candidateParagraphs: paragraphCount(candidate),
      oracleParagraphs: paragraphCount(oracle.toString('utf8')),
    };
    evidence.bytes = {
      candidate: { bytes: utf8(candidate).length, sha256: sha256(utf8(candidate)) },
      oracle: { bytes: oracle.length, sha256: sha256(oracle) },
      diff: byteDiff(candidate, oracle),
    };
    evidence.conclusion = 'One Enter plus typing leaves the original third line in the new second paragraph; the oracle requires another paragraph boundary, so the frozen action text under-specifies the required operation.';
  } catch (error) {
    evidence.status = 'RUNNER_ERROR';
    evidence.error = String(error.stack || error);
    report.runnerErrors.push(`case 11 ambiguity evidence: ${error.message}`);
  } finally {
    context?.dom.window.close();
  }
}

const allRows = report.cases.flatMap(item => item.steps);
const nativeRows = allRows.filter(row => row.executionLayer !== 'EXPLICIT_PATCH_DEMO');
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
    explicitPatchDemo: allRows.filter(row => row.status === 'EXPLICIT_PATCH_DEMO').length,
    fail: allRows.filter(row => row.status === 'FAIL').length,
    unsupported: allRows.filter(row => row.status === 'UNSUPPORTED').length,
    blockedByPrevious: allRows.filter(row => row.status === 'BLOCKED_BY_PREVIOUS').length,
    runnerError: report.runnerErrors.length,
    isolatedPass: report.isolatedProbes.filter(item => item.status === 'PASS_ISOLATED').length,
    isolatedFail: report.isolatedProbes.filter(item => item.status === 'FAIL').length,
    probePass: report.probes.filter(item => item.status === 'PASS').length,
    probeFail: report.probes.filter(item => item.status === 'FAIL').length,
    oracleActionAmbiguity: report.oracleEvidence
      .filter(item => item.status === 'ORACLE_ACTION_AMBIGUITY').length,
    targetGapTotal: targetFailures.length,
  },
  toDisk: 'Prototype save points are in memory only; this driver performs no user-file save.',
  realEnvironmentNotCovered: ['desktop app', 'WKWebView', 'IME', 'user files'],
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
process.exitCode = report.summary.status === 'PASS' ? 0
  : report.summary.status === 'RUNNER_ERROR' ? 2 : 1;

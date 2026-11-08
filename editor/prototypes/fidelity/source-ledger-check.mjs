// INK-PROT-019 reproducible evidence: strict TS bundle + real model.parse().
// Expected raw offsets are created while assembling each fixture, independently
// from the ledger and from legacy sourcePosition/selection-map.
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const here = new URL('.', import.meta.url);
const entry = new URL('source-ledger.tmp-entry.ts', here);
const outDir = new URL('source-ledger.tmp-build/', here);
await rm(outDir, { recursive: true, force: true });
await rm(entry, { force: true });
await writeFile(entry, "export * from './source-ledger';\nexport { parse } from './model';\n", 'utf8');

let api;
try {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      write: true,
      minify: false,
      outDir: outDir.pathname,
      lib: { entry: entry.pathname, formats: ['es'], fileName: () => 'bundle.mjs' },
    },
  });
  api = await import(pathToFileURL(`${outDir.pathname}bundle.mjs`).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
  await rm(entry, { force: true });
}

const { parse, buildSourceLedger, visualToSource, sourceToVisual, debugSourceLedger } = api;
const results = [];

function fixture(...parts) {
  let source = '';
  const marks = {};
  for (const part of parts) {
    if (typeof part === 'string') source += part;
    else {
      const [name, text] = part;
      marks[name] = { start: source.length, end: source.length + text.length, text };
      source += text;
    }
  }
  return { source, marks };
}

function ledgerFor(source) {
  const parsed = parse(source);
  const result = buildSourceLedger(source, parsed.doc, parsed.ranges);
  assert.equal(result.ok, true, result.reason);
  return { parsed, ledger: result.ledger };
}

function leafPosition(doc, text, offset = 0, predicate = () => true) {
  let found;
  doc.descendants((node, pos) => {
    if (found !== undefined || !node.isText || !predicate(node)) return;
    const at = node.text.indexOf(text);
    if (at >= 0) found = pos + at + offset;
  });
  assert.notEqual(found, undefined, `PM leaf not found: ${JSON.stringify(text)}`);
  return found;
}

function markNamed(name) {
  return node => node.marks.some(mark => mark.type.name === name);
}

function noMarkNamed(name) {
  return node => node.marks.every(mark => mark.type.name !== name);
}

function visibleSpan(ledger, mark, role) {
  return ledger.spans.find(span => span.visible && span.role === role && span.sourceStart === mark.start && span.sourceEnd === mark.end);
}

function visibleCoverage(ledger, mark, role) {
  const spans = ledger.spans.filter(span => span.visible && span.role === role && span.sourceStart >= mark.start && span.sourceEnd <= mark.end);
  return spans.length > 0 && spans[0].sourceStart === mark.start && spans[spans.length - 1].sourceEnd === mark.end;
}

function record(name, details) {
  results.push({ name, ok: true, ...details });
  console.log(`PASS ${name}`);
}

// 1. The historical collision: href "later" is never a display candidate.
{
  const f = fixture('[', ['labelA', 'a'], '](', ['hrefLater', 'later'], ' "', ['inlineTitle', 'later'], '")', ['bodyLater', 'later'], '\n');
  const { parsed, ledger } = ledgerFor(f.source);
  const bodyPos = leafPosition(parsed.doc, 'later', 2, noMarkNamed('link'));
  const mapped = visualToSource(ledger, bodyPos, bodyPos);
  assert.deepEqual(mapped, { ok: true, anchor: f.marks.bodyLater.start + 2, head: f.marks.bodyLater.start + 2, snapped: [] });
  const href = sourceToVisual(ledger, f.marks.hrefLater.start + 2, f.marks.hrefLater.start + 2);
  assert.equal(href.ok, false);
  assert.match(href.reason, /href|非可视/);
  const title = sourceToVisual(ledger, f.marks.inlineTitle.start + 2, f.marks.inlineTitle.start + 2);
  assert.equal(title.ok, false);
  assert.match(title.reason, /title|非可视/);
  assert.ok(visibleSpan(ledger, f.marks.labelA, 'link-label'));
  assert.ok(visibleCoverage(ledger, f.marks.bodyLater, 'text'));
  record('href/title/body 重名归属', { bodyRaw: mapped.anchor, hrefRejected: href.reason, titleRejected: title.reason });
}

// 2. Escape/entity atoms own their exact raw spans. Emoji and combining
// graphemes expose endpoints only; illegal UTF-16/grapheme interiors fail.
{
  const f = fixture('3 ', ['escapedStar', '\\*'], ' 4 ', ['entity', '&amp;'], 'amp; ', ['emoji', '😀'], ' ', ['combined', 'e\u0301'], '\n');
  const { parsed, ledger } = ledgerFor(f.source);
  const visual = parsed.doc.textContent;
  assert.equal(visual, '3 * 4 &amp; 😀 e\u0301');
  const starStart = leafPosition(parsed.doc, visual, visual.indexOf('*'));
  const starA = visualToSource(ledger, starStart, starStart, { collapsedAffinity: 'right' });
  const starB = visualToSource(ledger, starStart + 1, starStart + 1, { collapsedAffinity: 'left' });
  assert.equal(starA.ok && starA.anchor, f.marks.escapedStar.start);
  assert.equal(starB.ok && starB.anchor, f.marks.escapedStar.end);
  const ampPos = leafPosition(parsed.doc, visual, visual.indexOf('&'));
  const ampA = visualToSource(ledger, ampPos, ampPos, { collapsedAffinity: 'right' });
  const ampB = visualToSource(ledger, ampPos + 1, ampPos + 1, { collapsedAffinity: 'left' });
  assert.equal(ampA.ok && ampA.anchor, f.marks.entity.start);
  assert.equal(ampB.ok && ampB.anchor, f.marks.entity.end);
  const entityInside = sourceToVisual(ledger, f.marks.entity.start + 2, f.marks.entity.start + 2);
  assert.equal(entityInside.ok, false);
  const emojiPos = leafPosition(parsed.doc, '😀', 0);
  const emojiInside = visualToSource(ledger, emojiPos + 1, emojiPos + 1);
  assert.equal(emojiInside.ok, false);
  const combinedPos = leafPosition(parsed.doc, 'e\u0301', 0);
  const combinedInside = visualToSource(ledger, combinedPos + 1, combinedPos + 1);
  assert.equal(combinedInside.ok, false);
  record('转义/实体/Unicode 合法端点', { escape: [starA.anchor, starB.anchor], entity: [ampA.anchor, ampB.anchor] });
}

// 3. Full/collapsed/shortcut references and image_ref keep display, reference
// labels, definitions and image alt in distinct source roles.
{
  const f = fixture(
    '[', ['fullText', 'Full'], '][', ['fullRef', 'Ref'], '] ',
    '[', ['foldText', 'Fold'], '][] ',
    '[', ['shortText', 'Short'], '] ',
    '![', ['altText', 'Alt'], '][', ['imageRef', 'Img'], '] ',
    '![', ['inlineAlt', 'Inline'], '](/inline.png "Inline")\n\n',
    ['refDefinition', '[Ref]: /same "same"\n'],
    ['foldDefinition', '[Fold]: /fold\n'],
    ['shortDefinition', '[Short]: /short\n'],
    ['imageDefinition', '[Img]: /img.png "Alt"\n'],
  );
  const { parsed, ledger } = ledgerFor(f.source);
  for (const [name, role] of [['fullText', 'link-label'], ['foldText', 'link-label'], ['shortText', 'link-label'], ['altText', 'image-alt'], ['inlineAlt', 'image-alt']]) {
    assert.ok(visibleCoverage(ledger, f.marks[name], role), `${name} missing ${role}`);
  }
  const refOffset = f.marks.fullRef.start + 1;
  const refMap = sourceToVisual(ledger, refOffset, refOffset);
  assert.equal(refMap.ok, false);
  assert.match(refMap.reason, /reference-label|非可视/);
  const definitionMap = sourceToVisual(ledger, f.marks.refDefinition.start + 2, f.marks.refDefinition.start + 2);
  assert.equal(definitionMap.ok, false);
  const altPos = leafPosition(parsed.doc, 'Alt', 1, markNamed('image_ref'));
  const altMap = visualToSource(ledger, altPos, altPos);
  assert.equal(altMap.ok && altMap.anchor, f.marks.altText.start + 1);
  record('引用上下文与 image_ref 占位', { referenceRejected: refMap.reason, altRaw: altMap.anchor });
}

// 4. Block prefixes and adjacent marks are lexical non-display spans. A
// directed selection across strong/link/em/strike/code preserves direction.
{
  const f = fixture(
    '\uFEFF# **', ['heading', 'Head'], '** [', ['headLink', 'Link'], '](/u) <', ['auto', 'https://example.test'], '>\r\n\r\n',
    '- *', ['item', 'item'], '* [', ['listLink', 'List'], '][Ref] ~~', ['strike', 'strike'], '~~ `', ['code', 'code'], '`\r\n\r\n',
    '> before [', ['quoteLink', 'Quote'], '](/q) **', ['quoteStrong', 'strong'], '** after\n\n',
    '[Ref]: /list "List"\n',
  );
  const { parsed, ledger } = ledgerFor(f.source);
  const from = leafPosition(parsed.doc, 'Head', 1);
  const to = leafPosition(parsed.doc, 'code', 3);
  const forward = visualToSource(ledger, from, to);
  const backward = visualToSource(ledger, to, from);
  assert.equal(forward.ok, true);
  assert.equal(backward.ok, true);
  assert.ok(forward.anchor < forward.head);
  assert.ok(backward.anchor > backward.head);
  assert.equal(forward.anchor, f.marks.heading.start + 1);
  assert.equal(forward.head, f.marks.code.start + 3);
  assert.equal(backward.anchor, forward.head);
  assert.equal(backward.head, forward.anchor);
  assert.ok(visibleCoverage(ledger, f.marks.auto, 'autolink-text'));
  assert.ok(visibleCoverage(ledger, f.marks.listLink, 'link-label'));
  assert.ok(visibleCoverage(ledger, f.marks.quoteLink, 'link-label'));
  assert.ok(ledger.spans.some(span => span.role === 'block-prefix' && f.source.slice(span.sourceStart, span.sourceEnd).includes('#')));
  assert.ok(ledger.spans.some(span => span.role === 'block-prefix' && f.source.slice(span.sourceStart, span.sourceEnd).includes('>')));
  record('heading/list/blockquote + 跨 marks 有向选区', { forward: [forward.anchor, forward.head], backward: [backward.anchor, backward.head] });
}

// 5. CRLF softbreak and code normalization have explicit source ownership.
{
  const f = fixture(['left', 'left'], '\r\n', ['right', 'right'], ' and `` ', ['codeRaw', 'a\r\nb'], ' ``\n');
  const { parsed, ledger } = ledgerFor(f.source);
  assert.equal(parsed.doc.textContent, 'left\nright and a b');
  const softbreak = ledger.spans.find(span => span.visible && span.syntax === 'softbreak');
  assert.deepEqual([softbreak.sourceStart, softbreak.sourceEnd, softbreak.text], [f.marks.left.end, f.marks.left.end + 2, '\n']);
  const codeNewline = ledger.spans.find(span => span.visible && span.syntax === 'code-newline');
  const codeCr = f.marks.codeRaw.start + 1;
  assert.deepEqual([codeNewline.sourceStart, codeNewline.sourceEnd, codeNewline.text], [codeCr, codeCr + 2, ' ']);
  assert.equal(sourceToVisual(ledger, codeCr + 1, codeCr + 1).ok, false);
  assert.equal(f.source.charCodeAt(0), 'l'.charCodeAt(0));
  record('CRLF softbreak 与 inline-code 规范化', { softbreak: [softbreak.sourceStart, softbreak.sourceEnd], codeNewline: [codeNewline.sourceStart, codeNewline.sourceEnd] });
}

// 6. Missing definitions remain literal. Protected blocks never forge anchors.
{
  const missing = fixture('[', ['missingLabel', 'Missing'], '][nope] text\n');
  const missingBuilt = ledgerFor(missing.source);
  assert.equal(missingBuilt.parsed.doc.textContent, '[Missing][nope] text');
  assert.ok(visibleCoverage(missingBuilt.ledger, missing.marks.missingLabel, 'text'));

  const protectedSource = 'before\n\n$$\nx = 1\n$$\n\nafter\n';
  const protectedBuilt = ledgerFor(protectedSource);
  const protectedRange = protectedBuilt.parsed.ranges.find(range => range.kind === 'protected_block');
  assert.ok(protectedRange);
  const protectedMap = sourceToVisual(protectedBuilt.ledger, protectedRange.start + 4, protectedRange.start + 4);
  assert.equal(protectedMap.ok, false);
  assert.match(protectedMap.reason, /protected|受保护|非可视/);
  record('缺失定义保持字面量 + 保护块拒绝', { protectedReason: protectedMap.reason });
}

// 7. Delimiter boundaries are auditable: collapsed positions between marked
// leaves must state affinity; non-collapsed endpoints choose inward edges.
{
  const f = fixture('[', ['em', 'x'], '](/u)**', ['strongTail', 'y'], '**');
  const { parsed, ledger } = ledgerFor(f.source);
  const boundary = leafPosition(parsed.doc, 'x', 1);
  const ambiguous = visualToSource(ledger, boundary, boundary);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.reason, /affinity/);
  const left = visualToSource(ledger, boundary, boundary, { collapsedAffinity: 'left' });
  const right = visualToSource(ledger, boundary, boundary, { collapsedAffinity: 'right' });
  assert.equal(left.ok && left.anchor, f.marks.em.end);
  assert.equal(right.ok && right.anchor, f.marks.strongTail.start);
  record('共享 PM 边界显式 affinity', { candidates: ambiguous.candidates, left: left.anchor, right: right.anchor });
}

// Debug output is itself evidence: it includes source role and PM ownership,
// not merely a round-trip success bit.
{
  const f = fixture('[', ['label', 'audit'], '](', ['href', '/audit'], ') tail\n');
  const { ledger } = ledgerFor(f.source);
  const dump = debugSourceLedger(ledger);
  assert.match(dump, /link-label\/literal -> PM/);
  assert.match(dump, /href\/inline-href/);
  record('可审计 ledger 调试输出', { lines: dump.split('\n').length, sample: dump.split('\n').slice(0, 5) });
}

console.log(`\nPASS: ${results.length} 组独立来源断言；真实 model.parse/PM 文档路径；临时 bundle 已清理。`);
console.log(JSON.stringify(results, null, 2));

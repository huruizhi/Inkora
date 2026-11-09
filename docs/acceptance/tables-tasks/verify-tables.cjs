// Independent grammar cross-check with the project's locked Markdown-it.
// This does not import editor code and does not drive the product.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const editorPackage = process.argv[2];
if (!editorPackage) throw Error('usage: node verify-tables.cjs /path/to/locked/editor/package.json');
const lockedRequire = createRequire(path.resolve(editorPackage));
const MarkdownIt = lockedRequire('markdown-it');
const parser = new MarkdownIt('commonmark', { html: false }).enable('table');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')).cases;
let count = 0;
for (const item of cases) {
  if (item.expected_semantics.tables === undefined) continue;
  const raw = fs.readFileSync(path.join(__dirname, item.expected), 'utf8');
  const tokens = parser.parse(raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), {});
  const tables = [];
  let table, row, header = false;
  for (const token of tokens) {
    if (token.type === 'table_open') { table = { header: [], rows: [], aligns: [] }; tables.push(table); }
    else if (token.type === 'table_close') table = undefined;
    else if (table && token.type === 'thead_open') header = true;
    else if (table && token.type === 'thead_close') header = false;
    else if (table && token.type === 'tr_open') row = [];
    else if (table && token.type === 'th_open') table.aligns.push(token.attrGet('style'));
    else if (table && token.type === 'inline') row.push((token.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join(''));
    else if (table && token.type === 'tr_close') { if (header) table.header = row; else table.rows.push(row); }
  }
  const expected = item.expected_semantics;
  assert.equal(tables.length, expected.tables, item.id);
  if (expected.tables) {
    assert.equal(tables[0].header.length, expected.columns, item.id);
    assert.equal(tables[0].rows.length, expected.body_rows, item.id);
    assert.deepEqual(tables[0].rows.at(-1), expected.last_row, item.id);
    if (expected.first_alignment) assert.equal(tables[0].aligns[0], 'text-align:' + expected.first_alignment, item.id);
  }
  count++;
}
console.log(`PASS: ${count} frozen table semantic cross-checks; locked Markdown-it table rule, product NOT EXECUTED`);

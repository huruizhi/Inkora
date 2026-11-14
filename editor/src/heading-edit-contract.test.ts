import { expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { SourceAuthoritySession } from './source-authority';
import { blockKeyBindings } from './block-editing';

it('rejects a heading join with a foreign selection and keeps subsequent input at the original target', () => {
  const source = '上文\n\n# 地方\n\n后文';
  const session = new SourceAuthoritySession(source);
  expect(session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 5)))).toBe(true);
  const beforeDoc = session.state.doc, beforeSelection = session.state.selection;
  const beforeRawSelection = { ...session.rawSelection };
  const tr = session.state.tr.join(4);
  tr.setSelection(TextSelection.create(tr.doc, 8));
  expect(session.dispatch(tr)).toBe(false);
  expect(session.currentRaw).toBe(source);
  expect(session.state.doc.eq(beforeDoc)).toBe(true);
  expect(session.state.selection.eq(beforeSelection)).toBe(true);
  expect(session.rawSelection).toEqual(beforeRawSelection);
  expect(session.status.canUndo).toBe(false);
  expect(session.unresolvedIntent).not.toBeNull();
  expect(session.saveMemory()).toBe(false);
  expect(session.dispatch(session.state.tr.insertText('X'))).toBe(true);
  expect(session.currentRaw).toBe('上文\n\n# X地方\n\n后文');
  expect(session.rawSelection).toEqual({ anchor: 7, head: 7, affinity: 'right' });
  expect(session.unresolvedIntent).toBeNull();
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(source);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe('上文\n\n# X地方\n\n后文');
});

it('keeps bytes, directed selection, history and save eligibility through one heading-start journey', () => {
  const source = '\uFEFF# 地方\r\n\r\n- 后文\r\n';
  const session = new SourceAuthoritySession(source);
  const trace: unknown[] = [];
  const record = (step: string) => trace.push({ step, raw: session.currentRaw,
    storedMarks: session.state.storedMarks?.map(mark => mark.toJSON()) ?? null,
    doc: session.state.doc.toJSON(), selection: session.state.selection.toJSON(),
    rawSelection: { ...session.rawSelection }, status: session.status,
    saveEligible: session.saveEligible, unresolved: session.unresolvedIntent !== null });
  expect(session.setRawSelection(3)).toBe(true);
  record('start');
  for (const [key, expected] of [
    ['Enter', '\uFEFF\r\n\r\n# 地方\r\n\r\n- 后文\r\n'],
    ['Enter', '\uFEFF\r\n\r\n\r\n\r\n# 地方\r\n\r\n- 后文\r\n'],
    ['Backspace', '\uFEFF\r\n\r\n# 地方\r\n\r\n- 后文\r\n'],
    ['Backspace', source],
    ['Backspace', '\uFEFF地方\r\n\r\n- 后文\r\n'],
  ] as const) {
    expect(blockKeyBindings[key](session.state, tr => expect(session.dispatch(tr)).toBe(true))).toBe(true);
    expect(session.currentRaw).toBe(expected);
    expect(session.state.selection.$from.parentOffset).toBe(0);
    expect(session.saveEligible).toBe(true);
    expect(session.unresolvedIntent).toBeNull();
    record(key);
  }
  expect(session.dispatch(session.state.tr.insertText('新'))).toBe(true);
  const edited = '\uFEFF新地方\r\n\r\n- 后文\r\n';
  expect(session.currentRaw).toBe(edited);
  expect(session.setRawSelection(4, 2, 'left')).toBe(true);
  expect(session.state.selection.toJSON()).toEqual({ type: 'text', anchor: 4, head: 2 });
  record('backward-selection');
  expect(session.saveMemory()).toBe(true);
  expect(session.status.dirty).toBe(false);
  record('saved');
  for (let index = 0; index < 6; index++) {
    expect(session.undo()).toBe(true);
    expect(session.saveEligible).toBe(true);
    record('undo');
  }
  expect(session.currentRaw).toBe(source);
  expect(session.rawSelection).toEqual({ anchor: 3, head: 3, affinity: 'right' });
  expect(session.undo()).toBe(false);
  for (let index = 0; index < 6; index++) {
    expect(session.redo()).toBe(true);
    expect(session.saveEligible).toBe(true);
    record('redo');
  }
  expect(session.currentRaw).toBe(edited);
  expect(session.state.selection.toJSON()).toEqual({ type: 'text', anchor: 4, head: 2 });
  expect(session.rawSelection).toEqual({ anchor: 4, head: 2, affinity: 'left' });
  expect(session.status.dirty).toBe(false);
  expect(session.redo()).toBe(false);
  if (process.env.INKORA_CONTRACT_TRACE) console.log('INKORA_HEADING_TRACE ' + JSON.stringify(trace));
});

it('accepts the native Enter destination before the heading without borrowing its text caret', () => {
  const source = '# **地方**\n\n后文';
  const session = new SourceAuthoritySession(source);
  expect(session.setRawSelection(4)).toBe(true);
  const before = session.state.selection;
  const tr = session.state.tr.insert(0, session.state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, 1));
  expect(session.dispatch(tr)).toBe(true);
  expect(session.currentRaw).toBe('\n\n# **地方**\n\n后文');
  expect(session.rawSelection).toEqual({ anchor: 0, head: 0, affinity: 'right' });
  expect(session.dispatch(session.state.tr.insertText('正文'))).toBe(true);
  expect(session.currentRaw).toBe('正文\n\n# **地方**\n\n后文');
  expect(session.state.doc.child(1).firstChild!.marks[0].type.name).toBe('strong');
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(source);
  expect(session.state.selection.eq(before)).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe('正文\n\n# **地方**\n\n后文');
});

it('keeps both inserted blank paragraphs editable after a visual selection', () => {
  const source = '\uFEFF# **地方** ##\r\n\r\n后文\r\n';
  const session = new SourceAuthoritySession(source);
  expect(session.setRawSelection(5)).toBe(true);
  for (let count = 0; count < 2; count++) {
    expect(blockKeyBindings.Enter(session.state, tr => expect(session.dispatch(tr)).toBe(true))).toBe(true);
  }
  const before = session.currentRaw;
  expect(session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 1)))).toBe(true);
  const inserted = session.dispatch(session.state.tr.insertText('X'));
  expect(inserted, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('\uFEFFX\r\n\r\n\r\n\r\n# **地方** ##\r\n\r\n后文\r\n');
  expect(session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 4)))).toBe(true);
  expect(session.dispatch(session.state.tr.insertText('Y')), session.diagnostic).toBe(true);
  const expected = '\uFEFFX\r\n\r\nY\r\n\r\n# **地方** ##\r\n\r\n后文\r\n';
  expect(session.currentRaw).toBe(expected);
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(before);
  expect(session.rawSelection).toEqual({ anchor: 1, head: 1, affinity: 'right' });
  expect(session.redo()).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe(expected);
  expect(session.saveMemory()).toBe(true);
});

it('unformats a heading without losing already accepted spaces in its editable projection', () => {
  for (const source of ['# a', '\uFEFF# 稳定化验收\r\n\r\n- [ ] sdf']) {
    const session = new SourceAuthoritySession(source);
    expect(session.setRawSelection(source.length)).toBe(true);
    expect(session.dispatch(session.state.tr.insertText(' ')), session.diagnostic).toBe(true);
    const before = source + ' ';
    expect(session.setRawSelection(source.startsWith('\uFEFF') ? 3 : 2)).toBe(true);
    expect(blockKeyBindings.Backspace(session.state, tr =>
      expect(session.dispatch(tr), session.diagnostic).toBe(true))).toBe(true);
    const expected = source.startsWith('\uFEFF')
      ? '\uFEFF稳定化验收\r\n\r\n- [ ] sdf '
      : 'a ';
    expect(session.currentRaw).toBe(expected);
    expect(session.state.doc.textContent.endsWith(' ')).toBe(true);
    expect(session.saveEligible).toBe(true);
    expect(session.unresolvedIntent).toBeNull();
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(before);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(expected);
    expect(session.saveMemory(), session.diagnostic).toBe(true);
  }
});

it('keeps an unformat intent unresolved when the source would become a list or merge blocks', () => {
  for (const source of ['# - item', '# 标题\n后文']) {
    const session = new SourceAuthoritySession(source);
    expect(session.setRawSelection(2)).toBe(true);
    const beforeDoc = session.state.doc, beforeSelection = session.state.selection;
    let accepted: boolean | undefined;
    expect(blockKeyBindings.Backspace(session.state, tr => { accepted = session.dispatch(tr); })).toBe(true);
    expect(accepted).toBe(false);
    expect(session.currentRaw).toBe(source);
    expect(session.state.doc.eq(beforeDoc)).toBe(true);
    expect(session.state.selection.eq(beforeSelection)).toBe(true);
    expect(session.unresolvedIntent).not.toBeNull();
    expect(session.saveMemory()).toBe(false);
  }
});

it('preserves visible spaces even when they lie inside heading delimiter ranges', () => {
  for (const row of [
    { source: '# a #', at: 3, expected: 'a ', text: 'a ' },
    { source: '# a #', at: 5, expected: 'a ', text: 'a ' },
    { source: '# **a** z ##', at: 9, expected: '**a** z ', text: 'a z ' },
    { source: '# a', at: 2, expected: 'a', text: 'a' },
  ]) {
    const session = new SourceAuthoritySession(row.source);
    expect(session.setRawSelection(row.at)).toBe(true);
    expect(session.dispatch(session.state.tr.insertText(' ')), session.diagnostic).toBe(true);
    expect(session.state.doc.textContent).toBe(row.text);
    const before = session.currentRaw;
    expect(session.dispatch(session.state.tr.setSelection(TextSelection.create(session.state.doc, 1)))).toBe(true);
    expect(blockKeyBindings.Backspace(session.state, tr =>
      expect(session.dispatch(tr), session.diagnostic).toBe(true))).toBe(true);
    expect(session.currentRaw).toBe(row.expected);
    expect(session.state.doc.textContent).toBe(row.text);
    expect(session.saveMemory()).toBe(true);
    expect(new SourceAuthoritySession(session.currentRaw).currentRaw).toBe(row.expected);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(before);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(row.expected);
  }
});

import { expect, it } from 'vitest';
import { SourceAuthoritySession } from './source-authority';

it('rejects transactions captured before a same-raw reopen epoch', () => {
  const raw = 'Body.\n';
  const session = new SourceAuthoritySession(raw);
  const stale = session.state.tr.insertText('Old ', 1);
  expect(session.reopen(raw)).toBe(true);
  const before = session.state;
  expect(session.dispatch(stale)).toBe(false);
  expect(session.currentRaw).toBe(raw);
  expect(session.state.doc.eq(before.doc)).toBe(true);
  expect(session.state.selection.eq(before.selection)).toBe(true);
  expect(session.past).toHaveLength(0);
  expect(session.documentDirty).toBe(false);
  expect(session.unresolvedIntent).not.toBeNull();
});

it('keeps a closed Mermaid fence directly editable under SYN-S005', () => {
  const raw = '```mermaid\nflowchart TD\n```\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.firstChild?.type.name).toBe('code_block');
  expect(session.saveEligible).toBe(true);
  expect(session.setRawSelection(11)).toBe(true);
  expect(session.nativeType('New '), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('```mermaid\nNew flowchart TD\n```\n');
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it('keeps an EOF metadata opener unsafe until explicit source confirmation', () => {
  const session = new SourceAuthoritySession('---');
  expect(session.saveEligible).toBe(false);
  expect(session.issues).not.toHaveLength(0);
  expect(session.currentRaw).toBe('---');
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveMemory()).toBe(true);
  expect(session.savedRaw).toBe('---');
});

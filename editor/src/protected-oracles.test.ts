import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SourceAuthoritySession } from './source-authority';

interface Oracle {
  id: string;
  raw: string;
  blockRaw?: string[];
  inlineRaw?: string[];
  saveEligible: boolean;
  edit?: { at: number; insert: string; expectedRaw: string };
  repairRaw?: string;
  repairedSaveEligible?: boolean;
  repairedBlockRaw?: string[];
  repairedInlineRaw?: string[];
  visualDeleteOpaque?: { sourceFrom: number; sourceTo: number; accepted: boolean; expectedRaw: string; historyDelta: number; retainIntent: boolean };
  explicitSourceCommit?: { raw: string; saveEligible: boolean; retainDiagnostics: boolean; historyDelta: number };
}
const oracles = JSON.parse(readFileSync(new URL('../../docs/fixtures/protected-syntax-v2/oracles.json', import.meta.url), 'utf8')) as { cases: Oracle[] };

function opaque(session: SourceAuthoritySession, type: string): string[] {
  const raw: string[] = [];
  session.state.doc.descendants(node => { if (node.type.name === type) raw.push(node.attrs.raw); });
  return raw;
}

it.each(oracles.cases)('$id frozen production source/opaque/edit oracle', oracle => {
  const session = new SourceAuthoritySession(oracle.raw);
  expect(session.currentRaw).toBe(oracle.raw);
  if (oracle.blockRaw) expect(opaque(session, 'protected_block')).toEqual(oracle.blockRaw);
  if (oracle.inlineRaw) expect(opaque(session, 'protected_inline')).toEqual(oracle.inlineRaw);
  expect(session.saveEligible, session.diagnostic).toBe(oracle.saveEligible);
  if (oracle.edit) {
    expect(session.setRawSelection(oracle.edit.at), session.diagnostic).toBe(true);
    expect(session.nativeType(oracle.edit.insert), session.diagnostic).toBe(true);
    expect(session.currentRaw).toBe(oracle.edit.expectedRaw);
    expect(session.past).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(oracle.raw);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(oracle.edit.expectedRaw);
    expect(session.saveMemory(), session.diagnostic).toBe(true);
    const reopened = new SourceAuthoritySession(session.savedRaw);
    expect(reopened.currentRaw).toBe(oracle.edit.expectedRaw);
    expect(reopened.state.doc.eq(session.state.doc)).toBe(true);
  }
  if (oracle.repairRaw) {
    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft(oracle.repairRaw, { anchor: 0, head: 0, affinity: 'right' })).toBe(true);
    expect(session.applySource(), session.diagnostic).toBe(true);
    expect(session.currentRaw).toBe(oracle.repairRaw);
    expect(session.saveEligible, session.diagnostic).toBe(oracle.repairedSaveEligible);
    if (oracle.repairedBlockRaw) expect(opaque(session, 'protected_block')).toEqual(oracle.repairedBlockRaw);
    if (oracle.repairedInlineRaw) expect(opaque(session, 'protected_inline')).toEqual(oracle.repairedInlineRaw);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(oracle.raw);
    expect(session.saveEligible).toBe(oracle.saveEligible);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(oracle.repairRaw);
  }
  if (oracle.visualDeleteOpaque) {
    const deletion = oracle.visualDeleteOpaque;
    expect(session.setRawSelection(deletion.sourceFrom, deletion.sourceTo)).toBe(true);
    const before = session.state;
    const length = session.past.length;
    expect(session.dispatch(session.state.tr.deleteSelection())).toBe(deletion.accepted);
    expect(session.currentRaw).toBe(deletion.expectedRaw);
    expect(session.past.length - length).toBe(deletion.historyDelta);
    expect(session.unresolvedIntent !== null).toBe(deletion.retainIntent);
    expect(session.state.doc.eq(before.doc)).toBe(true);
    expect(session.state.selection.eq(before.selection)).toBe(true);
  }
  if (oracle.explicitSourceCommit) {
    const commit = oracle.explicitSourceCommit;
    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft(commit.raw, { anchor: 0, head: 0, affinity: 'right' })).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.currentRaw).toBe(commit.raw);
    expect(session.saveEligible).toBe(commit.saveEligible);
    expect(session.issues.length > 0).toBe(commit.retainDiagnostics);
    expect(session.past).toHaveLength(commit.historyDelta);
    expect(session.saveMemory()).toBe(true);
    expect(session.savedRaw).toBe(commit.raw);
  }
});

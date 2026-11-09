import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

it.each([
  { raw: "AeZ\r\n", at: 2, insert: "\u0301", expected: "Ae\u0301Z\r\n", caret: 3 },
  { raw: "A🇨Z\n", at: 3, insert: "🇳", expected: "A🇨🇳Z\n", caret: 5 },
  { raw: "A👍Z", at: 3, insert: "🏽", expected: "A👍🏽Z", caret: 5 },
  { raw: "A❤Z\n", at: 2, insert: "\uFE0F", expected: "A❤️Z\n", caret: 3 },
  { raw: "\uFEFFAᄀZ\r\n", at: 3, insert: "ᅡ", expected: "\uFEFFA가Z\r\n", caret: 4 },
])("accepts grapheme extension with history and savepoint: $raw + $insert", ({ raw, at, insert, expected, caret }) => {
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(at)).toBe(true);
  expect(session.nativeType(insert), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(expected);
  expect(session.rawSelection.head).toBe(caret);
  expect(session.saveMemory()).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.rawSelection.head).toBe(caret);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe(expected);
  expect(session.savedRaw).toBe(expected);
  expect(session.documentDirty).toBe(false);
});

it("accepts a combining accent after an existing letter without retaining an interior anchor", () => {
  const session = new SourceAuthoritySession("AeZ\r\n");
  expect(session.setRawSelection(2)).toBe(true);
  const accepted = session.nativeType("\u0301");
  expect(accepted, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("Ae\u0301Z\r\n");
  expect(session.rawSelection.head).toBe(3);
  expect(session.setRawSelection(2)).toBe(false);
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe("AeZ\r\n");
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("Ae\u0301Z\r\n");
});

it("keeps two combining composition updates in one history unit without normalization", () => {
  const session = new SourceAuthoritySession("AeZ\n");
  expect(session.setRawSelection(2)).toBe(true);
  session.startComposition();
  expect(session.nativeType("\u0301", 71)).toBe(true);
  expect(session.nativeType("\u0323", 71)).toBe(true);
  session.endComposition();
  expect(session.currentRaw).toBe("Ae\u0301\u0323Z\n");
  expect(session.status.revision).toBe(1);
  expect(session.past).toHaveLength(1);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe("AeZ\n");
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("Ae\u0301\u0323Z\n");
  expect(session.saveEligible).toBe(true);
});

it("preserves a rejected candidate when the new caret itself would split a joined emoji", () => {
  const raw = "A👩💻Z\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(3)).toBe(true);
  const before = { selection: { ...session.rawSelection }, doc: session.state.doc.toJSON() };
  expect(session.nativeType("\u200D")).toBe(false);
  expect(session.currentRaw).toBe(raw);
  expect(session.rawSelection).toEqual(before.selection);
  expect(session.state.doc.toJSON()).toEqual(before.doc);
  expect(session.past).toHaveLength(0);
  expect(session.unresolvedIntent?.raw).toBe("A👩‍💻Z\n");
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("A👩‍💻Z\n", { anchor: 6, head: 6, affinity: "right" })).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe("A👩‍💻Z\n");
  expect(session.saveEligible).toBe(true);
});

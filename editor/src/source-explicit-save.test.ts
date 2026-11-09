import { it, expect } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

it("allows exact UTF-8 source after explicit author editing and commit of an unknown dialect", () => {
  const session = new SourceAuthoritySession("Before $x$ after.\n");
  expect(session.saveEligible).toBe(false);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("Before $y$ after.\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe("Before $y$ after.\n");
  expect(session.saveMemory(), session.diagnostic).toBe(true);
});

it("restores source save authority with history and expires it after a visual edit or reload", () => {
  const before = "\uFEFF$x$\r\n\r\nBody.\r\n";
  const after = "\uFEFF$y$\r\n\r\nBody.\r\n";
  const session = new SourceAuthoritySession(before);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft(after, { anchor: 3, head: 2, affinity: "left" })).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.issues).not.toHaveLength(0);
  expect(session.saveMemory(), session.diagnostic).toBe(true);
  expect(session.rawSelection).toMatchObject({ anchor: 3, head: 2 });
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(before);
  expect(session.saveEligible).toBe(false);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe(after);
  expect(session.documentDirty).toBe(false);
  expect(session.saveEligible).toBe(true);
  expect(session.rawSelection).toMatchObject({ anchor: 3, head: 2 });
  expect(session.setRawSelection(after.indexOf("Body") + 1)).toBe(true);
  expect(session.nativeType("X"), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("\uFEFF$y$\r\n\r\nBXody.\r\n");
  expect(session.saveEligible).toBe(false);
  expect(session.undo()).toBe(true);
  expect(session.saveEligible).toBe(true);
  expect(session.reopen(after)).toBe(true);
  expect(session.saveEligible).toBe(false);
  expect(session.past).toHaveLength(0);
});

it("requires a stable submitted source and retains no-op history and redo", () => {
  const session = new SourceAuthoritySession("$x$\n");
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("$y$\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.undo()).toBe(true);
  const revision = session.status.revision;
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveEligible).toBe(true);
  expect(session.past).toHaveLength(0);
  expect(session.future).toHaveLength(1);
  expect(session.status.revision).toBe(revision);
  session.startComposition();
  expect(session.saveEligible).toBe(false);
  expect(session.saveMemory()).toBe(false);
  session.endComposition();
  expect(session.saveEligible).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("$draft$\n")).toBe(true);
  expect(session.saveEligible).toBe(false);
  expect(session.cancelSource()).toBe(true);
  expect(session.currentRaw).toBe("$x$\n");
  expect(session.saveEligible).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("$y$\n");
  expect(session.saveEligible).toBe(true);
});

it("keeps malformed Unicode and bare CR source drafts uncommitted", () => {
  for (const draft of ["$y$\uD800\n", "$y$\rnext\n"]) {
    const session = new SourceAuthoritySession("$x$\n");
    expect(session.beginSource()).toBe(true);
    expect(session.updateDraft(draft)).toBe(true);
    expect(session.applySource()).toBe(false);
    expect(session.currentRaw).toBe("$x$\n");
    expect(session.draft?.raw).toBe(draft);
    expect(session.saveEligible).toBe(false);
    expect(session.past).toHaveLength(0);
  }
});

it("does not let a source receipt authorize an unresolved stale visual transaction", () => {
  const session = new SourceAuthoritySession("Body.\n");
  const stale = session.state.tr.insertText("old", 1);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("$x$\n\nBody.\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveEligible).toBe(true);
  expect(session.dispatch(stale)).toBe(false);
  expect(session.currentRaw).toBe("$x$\n\nBody.\n");
  expect(session.unresolvedIntent).not.toBeNull();
  expect(session.saveEligible).toBe(false);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.unresolvedIntent).not.toBeNull();
  expect(session.saveEligible).toBe(false);
  expect(session.undo()).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.saveEligible).toBe(true);
});

import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

it("retains a canonical footnote definition as visible opaque source", () => {
  const raw = "Before.\n\n[^note]: definition\n    continuation\n\nAfter.\n";
  const session = new SourceAuthoritySession(raw);
  const protectedRaw: string[] = [];
  session.state.doc.descendants(node => {
    if (node.type.name === "protected_block") protectedRaw.push(node.attrs.raw);
  });
  expect(protectedRaw).toContain("[^note]: definition\n    continuation");
  expect(session.currentRaw).toBe(raw);
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("blocks an unclosed opening front matter candidate and permits source repair", () => {
  const raw = "---\ntitle: bad\n\nBody.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.currentRaw).toBe(raw);
  expect(session.saveEligible).toBe(false);
  expect(session.sourceAccessible).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("---\ntitle: bad\n---\n\nBody.\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("ends a callout before a non-quote lazy continuation line", () => {
  const raw = "> [!NOTE]\n> opaque\nlazy continuation\n\nAfter.\n";
  const session = new SourceAuthoritySession(raw);
  const protectedRaw: string[] = [];
  session.state.doc.descendants(node => {
    if (node.type.name === "protected_block") protectedRaw.push(node.attrs.raw);
  });
  expect(protectedRaw).toEqual(["> [!NOTE]\n> opaque"]);
  expect(session.state.doc.textContent).toContain("lazy continuation");
  expect(session.currentRaw).toBe(raw);
});

it("keeps ordinary text beside an opaque wiki fragment directly editable", () => {
  const raw = "Before [[target]] after.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(0)).toBe(true);
  expect(session.nativeType("New "), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("New Before [[target]] after.\n");
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

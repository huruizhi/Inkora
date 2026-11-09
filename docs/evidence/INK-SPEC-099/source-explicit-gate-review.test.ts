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

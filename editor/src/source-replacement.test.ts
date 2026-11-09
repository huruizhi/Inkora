import { describe, expect, it } from "vitest";
import type { SourceReplacementPlan } from "./source-search";
import { validateSourceReplacementPlan } from "./source-replacement";

function plan(overrides: Partial<SourceReplacementPlan> = {}): SourceReplacementPlan {
  return {
    source: { raw: "a a", revision: 3 }, resultRaw: "b b",
    patches: [
      { from: 2, to: 3, expected: "a", insert: "b" },
      { from: 0, to: 1, expected: "a", insert: "b" },
    ],
    applyOrder: "descending", replacedCount: 2, changed: true,
    selection: { anchor: 3, head: 3 }, ...overrides,
  };
}

describe("validateSourceReplacementPlan", () => {
  it("accepts a complete descending plan without normalizing BOM or mixed EOL", () => {
    const raw = "\uFEFF中\r\n中\nend";
    const valid = plan({
      source: { raw, revision: 8 }, resultRaw: "\uFEFF👩‍💻\r\n👩‍💻\nend",
      patches: [
        { from: 4, to: 5, expected: "中", insert: "👩‍💻" },
        { from: 1, to: 2, expected: "中", insert: "👩‍💻" },
      ],
      selection: { anchor: 13, head: 13 },
    });
    expect(validateSourceReplacementPlan(valid, raw, raw.replace(/\r\n?/g, "\n"))).toEqual({ ok: true });
  });

  it.each([
    ["projection", plan(), "a a", "different"],
    ["source", plan(), "stale", "stale"],
    ["expected", plan({ patches: [{ from: 2, to: 3, expected: "x", insert: "b" }], replacedCount: 1 }), "a a", "a a"],
    ["order", plan({ patches: [{ from: 0, to: 1, expected: "a", insert: "b" }, { from: 2, to: 3, expected: "a", insert: "b" }] }), "a a", "a a"],
    ["overlap", plan({ patches: [{ from: 1, to: 3, expected: " a", insert: "b" }, { from: 0, to: 2, expected: "a ", insert: "b" }] }), "a a", "a a"],
    ["result", plan({ resultRaw: "forged" }), "a a", "a a"],
    ["unicode", plan({ patches: [{ from: 2, to: 3, expected: "a", insert: "\uD800" }], replacedCount: 1 }), "a a", "a a"],
    ["caret", plan({ resultRaw: "👩‍💻 a", patches: [{ from: 0, to: 1, expected: "a", insert: "👩‍💻" }], replacedCount: 1, selection: { anchor: 1, head: 1 } }), "a a", "a a"],
    ["terminal high surrogate result", plan({
      source: { raw: "a", revision: 3 }, resultRaw: "\uD800",
      patches: [{ from: 0, to: 1, expected: "a", insert: "\uD800" }], replacedCount: 1,
      selection: { anchor: 1, head: 1 },
    }), "a", "a"],
    ["terminal high surrogate expected", plan({
      source: { raw: "\uD800", revision: 3 }, resultRaw: "b",
      patches: [{ from: 0, to: 1, expected: "\uD800", insert: "b" }], replacedCount: 1,
      selection: { anchor: 1, head: 1 },
    }), "\uD800", "\uD800"],
    ["terminal high surrogate insert", plan({
      resultRaw: "a \uD800",
      patches: [{ from: 2, to: 3, expected: "a", insert: "\uD800" }], replacedCount: 1,
    }), "a a", "a a"],
    ["bare CR result", plan({
      resultRaw: "a\ra",
      patches: [{ from: 1, to: 2, expected: " ", insert: "\r" }], replacedCount: 1,
    }), "a a", "a a"],
    ["forged byte-identical change", plan({
      source: { raw: "a", revision: 3 }, resultRaw: "a",
      patches: [{ from: 0, to: 1, expected: "a", insert: "a" }], replacedCount: 1,
      selection: { anchor: 1, head: 1 },
    }), "a", "a"],
  ])("rejects invalid %s before mutation", (_name, candidate, raw, projection) => {
    expect(validateSourceReplacementPlan(candidate, raw, projection).ok).toBe(false);
  });
});

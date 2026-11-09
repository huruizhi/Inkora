import { describe, expect, it } from "vitest";
import {
  findSourceMatch,
  planSourceReplaceAll,
  planSourceReplacement,
  searchSource,
  SourceSearchError,
  type SourcePatch,
} from "./source-search";

function applyDescending(raw: string, patches: readonly SourcePatch[]): string {
  let result = raw;
  for (const patch of patches) {
    expect(result.slice(patch.from, patch.to)).toBe(patch.expected);
    result = result.slice(0, patch.from) + patch.insert + result.slice(patch.to);
  }
  return result;
}

describe("searchSource", () => {
  it("finds literal non-overlapping matches as UTF-16 half-open ranges", () => {
    const snapshot = { raw: "中文 a.a a.a", revision: 7 } as const;
    const result = searchSource(snapshot, "a.a");

    expect(result).toEqual({
      source: snapshot,
      query: "a.a",
      caseSensitive: true,
      maxResults: 10_000,
      matches: [
        { from: 3, to: 6, text: "a.a" },
        { from: 7, to: 10, text: "a.a" },
      ],
      rejected: [],
      truncated: false,
    });
    expect(snapshot).toEqual({ raw: "中文 a.a a.a", revision: 7 });
  });

  it("does not return overlapping matches", () => {
    expect(searchSource({ raw: "aaaa", revision: 1 }, "aa").matches).toEqual([
      { from: 0, to: 2, text: "aa" },
      { from: 2, to: 4, text: "aa" },
    ]);
  });

  it("uses Unicode simple case matching without normalization or full folding", () => {
    const snapshot = { raw: "K K k ss ß 𐐀𐐨 e\u0301 é", revision: 2 };

    expect(searchSource(snapshot, "k", { caseSensitive: false }).matches).toEqual([
      { from: 0, to: 1, text: "K" },
      { from: 2, to: 3, text: "K" },
      { from: 4, to: 5, text: "k" },
    ]);
    expect(searchSource(snapshot, "𐐀", { caseSensitive: false }).matches).toEqual([
      { from: 11, to: 13, text: "𐐀" },
      { from: 13, to: 15, text: "𐐨" },
    ]);
    expect(searchSource(snapshot, "ss", { caseSensitive: false }).matches).toEqual([
      { from: 6, to: 8, text: "ss" },
    ]);
    expect(searchSource(snapshot, "é", { caseSensitive: false }).matches).toEqual([
      { from: 19, to: 20, text: "é" },
    ]);
  });

  it("searches source syntax and code literally", () => {
    const raw = "> `needle`\r\n```ts\r\nconst needle = /x/\r\n```";
    const result = searchSource({ raw, revision: 3 }, "needle");
    expect(result.matches.map(({ from, to }) => raw.slice(from, to))).toEqual([
      "needle",
      "needle",
    ]);
  });

  it("returns a finite empty result for an empty query", () => {
    const result = searchSource({ raw: "abc", revision: 1 }, "");
    expect(result.matches).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("rejects matches that split a grapheme, CRLF, or leading BOM", () => {
    const zwj = searchSource({ raw: "👩‍💻", revision: 1 }, "💻");
    const combining = searchSource({ raw: "e\u0301", revision: 1 }, "\u0301");
    const crlf = searchSource({ raw: "a\r\nb", revision: 1 }, "\n");
    const bom = searchSource({ raw: "\uFEFFtitle", revision: 1 }, "\uFEFF");

    expect(zwj.matches).toEqual([]);
    expect(zwj.rejected[0]).toMatchObject({
      range: { from: 3, to: 5 },
      reason: "grapheme-boundary",
    });
    expect(combining.rejected[0]?.reason).toBe("grapheme-boundary");
    expect(crlf.rejected[0]?.reason).toBe("crlf-boundary");
    expect(bom.rejected[0]?.reason).toBe("leading-bom");
  });

  it("reports truncation and validates an explicitly smaller positive limit", () => {
    const result = searchSource({ raw: "aaaa", revision: 1 }, "a", {
      maxResults: 2,
    });

    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(() => searchSource({ raw: "a", revision: 1 }, "a", { maxResults: 0 })).toThrow(RangeError);
    expect(() => searchSource({ raw: "a", revision: 1 }, "a", { maxResults: 10_000 })).toThrow(RangeError);
    expect(() => searchSource({ raw: "a", revision: 1 }, "a", { maxResults: 10_001 })).toThrow(RangeError);
    expect(() => searchSource({ raw: "a", revision: 1 }, "a", { maxResults: 1.5 })).toThrow(RangeError);
  });

  it("bounds a larger source sample at the default result limit", () => {
    const result = searchSource({ raw: "a".repeat(12_000), revision: 1 }, "a");
    expect(result.matches).toHaveLength(10_000);
    expect(result.matches.at(-1)).toEqual({ from: 9_999, to: 10_000, text: "a" });
    expect(result.truncated).toBe(true);
  });
});

describe("findSourceMatch", () => {
  const search = searchSource({ raw: "one one one", revision: 4 }, "one");

  it("moves in either direction without repeating the selected match", () => {
    expect(findSourceMatch(search, { anchor: 0, head: 3 }, "forward")).toEqual({
      matchIndex: 1,
      match: { from: 4, to: 7, text: "one" },
      selection: { anchor: 4, head: 7 },
      wrapped: false,
    });
    expect(findSourceMatch(search, { anchor: 7, head: 4 }, "forward")).toEqual({
      matchIndex: 2,
      match: { from: 8, to: 11, text: "one" },
      selection: { anchor: 11, head: 8 },
      wrapped: false,
    });
    expect(findSourceMatch(search, { anchor: 4, head: 7 }, "backward")).toEqual({
      matchIndex: 0,
      match: { from: 0, to: 3, text: "one" },
      selection: { anchor: 0, head: 3 },
      wrapped: false,
    });
  });

  it("wraps explicitly and can stop at the edge", () => {
    expect(findSourceMatch(search, { anchor: 8, head: 11 }, "forward")).toMatchObject({ matchIndex: 0, wrapped: true });
    expect(findSourceMatch(search, { anchor: 8, head: 11 }, "forward", false)).toBeNull();
    expect(findSourceMatch(search, { anchor: 0, head: 3 }, "backward")).toMatchObject({ matchIndex: 2, wrapped: true });
  });

  it("starts at a collapsed caret and rejects malicious selection boundaries", () => {
    expect(findSourceMatch(search, { anchor: 0, head: 0 }, "forward")).toMatchObject({ matchIndex: 0 });

    const unicode = searchSource({ raw: "👩‍💻 ok", revision: 1 }, "ok");
    expect(() => findSourceMatch(unicode, { anchor: 3, head: 3 }, "forward")).toThrowError(SourceSearchError);
    try {
      findSourceMatch(unicode, { anchor: 3, head: 3 }, "forward");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid-selection" });
    }
  });
});

describe("replacement plans", () => {
  it("plans one literal replacement and preserves dollar sequences", () => {
    const source = { raw: "a needle z", revision: 8 } as const;
    const search = searchSource(source, "needle");
    const result = planSourceReplacement(search, source, 0, "$&-$1");

    expect(result).toEqual({
      ok: true,
      plan: {
        source,
        resultRaw: "a $&-$1 z",
        patches: [{ from: 2, to: 8, expected: "needle", insert: "$&-$1" }],
        applyOrder: "descending",
        replacedCount: 1,
        changed: true,
        selection: { anchor: 7, head: 7 },
      },
    });
  });

  it("plans replace-all patches in descending application order", () => {
    const source = { raw: "x\r\nx x", revision: 9 } as const;
    const search = searchSource(source, "x");
    const result = planSourceReplaceAll(search, source, "YY");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.patches).toEqual([
      { from: 5, to: 6, expected: "x", insert: "YY" },
      { from: 3, to: 4, expected: "x", insert: "YY" },
      { from: 0, to: 1, expected: "x", insert: "YY" },
    ]);
    expect(applyDescending(source.raw, result.plan.patches)).toBe("YY\r\nYY YY");
    expect(result.plan.resultRaw).toBe("YY\r\nYY YY");
    expect(result.plan.selection).toEqual({ anchor: 9, head: 9 });
    expect(source).toEqual({ raw: "x\r\nx x", revision: 9 });
  });

  it("does not manufacture edits for no-match or no-op replacements", () => {
    const source = { raw: "same", revision: 1 };
    const noMatch = planSourceReplaceAll(searchSource(source, "missing"), source, "x", { anchor: 4, head: 1 });
    const noOp = planSourceReplacement(searchSource(source, "same"), source, 0, "same");

    expect(noMatch).toEqual({
      ok: true,
      plan: {
        source,
        resultRaw: "same",
        patches: [],
        applyOrder: "descending",
        replacedCount: 0,
        changed: false,
        selection: { anchor: 4, head: 1 },
      },
    });
    expect(noOp).toMatchObject({
      ok: true,
      plan: { resultRaw: "same", patches: [], replacedCount: 0, changed: false },
    });
  });

  it("rejects stale revision and same-revision changed source without partial output", () => {
    const source = { raw: "a a", revision: 2 };
    const search = searchSource(source, "a");
    const staleRevision = planSourceReplaceAll(search, { raw: "a a", revision: 3 }, "b");
    const staleRaw = planSourceReplacement(search, { raw: "A a", revision: 2 }, 0, "b");

    expect(staleRevision).toMatchObject({
      ok: false,
      failure: { reason: "revision-mismatch", intent: { kind: "replace-all", replacement: "b" } },
    });
    expect(staleRaw).toMatchObject({
      ok: false,
      failure: { reason: "source-mismatch", intent: { kind: "replace-one", matchIndex: 0, replacement: "b" } },
    });
    if (!staleRaw.ok) expect(staleRaw.failure.current.raw).toBe("A a");
  });

  it("forbids replace-all from a truncated search", () => {
    const source = { raw: "aaa", revision: 1 };
    const search = searchSource(source, "a", { maxResults: 2 });
    expect(planSourceReplaceAll(search, source, "b")).toMatchObject({
      ok: false,
      failure: { reason: "truncated-search", intent: { kind: "replace-all" } },
    });
  });

  it("rejects invalid Unicode replacement text", () => {
    const source = { raw: "a", revision: 1 };
    const result = planSourceReplacement(searchSource(source, "a"), source, 0, "\uD800");
    expect(result).toMatchObject({ ok: false, failure: { reason: "invalid-replacement-unicode" } });
  });

  it("rejects a suggested caret inside a merged grapheme or CRLF", () => {
    const emojiSource = { raw: "x💻", revision: 1 };
    const crlfSource = { raw: "x\n", revision: 1 };

    expect(planSourceReplacement(searchSource(emojiSource, "x"), emojiSource, 0, "👩‍")).toMatchObject({
      ok: false,
      failure: { reason: "invalid-result-caret" },
    });
    expect(planSourceReplacement(searchSource(crlfSource, "x"), crlfSource, 0, "\r")).toMatchObject({
      ok: false,
      failure: { reason: "invalid-result-caret" },
    });
  });

  it("preserves a leading BOM and mixed line endings around valid edits", () => {
    const source = { raw: "\uFEFFa\r\na\nb", revision: 5 };
    const result = planSourceReplaceAll(searchSource(source, "a"), source, "中");
    expect(result).toMatchObject({ ok: true, plan: { resultRaw: "\uFEFF中\r\n中\nb", replacedCount: 2 } });
  });
});

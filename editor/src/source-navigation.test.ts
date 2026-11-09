import { describe, expect, it } from "vitest";
import {
  mapRawRangeToTextarea,
  rawOffsetToTextareaOffset,
  readRawSelection,
  textareaOffsetToRawOffset,
  textareaProjection,
} from "./source-navigation";

describe("source navigation coordinates", () => {
  it.each([
    "\uFEFFalpha\nbeta",
    "\uFEFFalpha\r\nbeta",
    "alpha\rbeta",
    "alpha\r\nbeta\rgamma\n",
    "alpha\r\nbeta",
  ])("round-trips every safe raw boundary for %j", (raw) => {
    for (let rawOffset = 0; rawOffset <= raw.length; rawOffset += 1) {
      const textareaOffset = rawOffsetToTextareaOffset(raw, rawOffset);
      if (textareaOffset === undefined) continue;
      expect(textareaOffsetToRawOffset(raw, textareaOffset)).toBe(rawOffset);
    }
  });

  it("rejects CRLF interiors, surrogate interiors, grapheme interiors and bounds", () => {
    const raw = "a\r\n👩‍💻e\u0301z";
    expect(rawOffsetToTextareaOffset(raw, 2)).toBeUndefined();
    expect(rawOffsetToTextareaOffset(raw, raw.indexOf("👩") + 1)).toBeUndefined();
    expect(rawOffsetToTextareaOffset(raw, raw.indexOf("‍"))).toBeUndefined();
    expect(rawOffsetToTextareaOffset(raw, raw.indexOf("\u0301"))).toBeUndefined();
    expect(rawOffsetToTextareaOffset(raw, -1)).toBeUndefined();
    expect(textareaOffsetToRawOffset(raw, textareaProjection(raw).length + 1)).toBeUndefined();
  });

  it("reads and maps a backward selection without guessing by text occurrence", () => {
    const raw = "same\r\nsame\rsame";
    const value = textareaProjection(raw);
    const read = readRawSelection(raw, value, 5, 9, "backward");
    expect(read).toEqual({ ok: true, value: { anchor: 10, head: 6 } });
    expect(mapRawRangeToTextarea(raw, value, { from: 11, to: 15 })).toEqual({
      ok: true,
      value: { start: 10, end: 14 },
    });
  });

  it("rejects inconsistent textarea projections atomically", () => {
    expect(readRawSelection("a\r\nb", "aXXb", 0, 1, "forward").ok).toBe(false);
    expect(mapRawRangeToTextarea("a\r\nb", "aXXb", { from: 0, to: 1 }).ok).toBe(false);
  });
});

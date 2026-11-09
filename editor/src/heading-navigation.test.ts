import { describe, expect, it } from "vitest";
import { rawOffsetToTextareaOffset, textareaProjection } from "./heading-navigation";

describe("heading navigation source mapping", () => {
  it("maps BOM, CRLF, mixed EOL and emoji as UTF-16 boundaries", () => {
    const raw = "\uFEFF# 一 👩‍💻\r\n\n## 二\r末";
    const second = raw.indexOf("## 二");
    expect(textareaProjection(raw)).toBe("\uFEFF# 一 👩‍💻\n\n## 二\n末");
    expect(rawOffsetToTextareaOffset(raw, second)).toBe(
      textareaProjection(raw.slice(0, second)).length,
    );
    expect(rawOffsetToTextareaOffset(raw, raw.length)).toBe(textareaProjection(raw).length);
  });

  it("rejects non-boundary and out-of-range offsets", () => {
    expect(rawOffsetToTextareaOffset("abc", -1)).toBeUndefined();
    expect(rawOffsetToTextareaOffset("abc", 4)).toBeUndefined();
    expect(rawOffsetToTextareaOffset("abc", 1.5)).toBeUndefined();
  });

  it("rejects boundaries inside CRLF pairs and surrogate pairs", () => {
    const crlf = "a\r\nb";
    expect(rawOffsetToTextareaOffset(crlf, 2)).toBeUndefined();
    expect(rawOffsetToTextareaOffset(crlf, 1)).toBe(1);
    expect(rawOffsetToTextareaOffset(crlf, 3)).toBe(2);
    const emoji = "a👩b";
    expect(rawOffsetToTextareaOffset(emoji, 2)).toBeUndefined();
    expect(rawOffsetToTextareaOffset(emoji, 3)).toBe(3);
  });
});

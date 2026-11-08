import { describe, expect, it } from "vitest";
import { parseProtectedMarkdown } from "./protected-markdown";
import { serializeMarkdown } from "./markdown-codec";

describe("protected Markdown", () => {
  it("keeps unsupported syntax outside protected blocks behind the safety gate", () => {
    expect(parseProtectedMarkdown('---\ntitle: x\n---\n\n<x>unsafe</x>')).toBeNull();
    expect(parseProtectedMarkdown('| A | B |\n| --- | --- |\n| x | y |\n\n![image](file.png)')).toBeNull();
  });

  it("does not treat fenced examples as extension nodes", () => {
    expect(parseProtectedMarkdown('```\n[[example]]\n| A | B |\n| --- | --- |\n```')).toBeNull();
  });

  it("retains front matter values containing syntax from other extensions", () => {
    const raw = '---\ntitle: "{x} $y$ <html>"\n---';
    const doc = parseProtectedMarkdown(raw + '\n\n正文');
    expect(doc).not.toBeNull();
    expect(serializeMarkdown(doc!)).toBe(raw + '\n\n正文');
  });
});

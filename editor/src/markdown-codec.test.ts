import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeMarkdown, parseMarkdown, serializeMarkdown } from "./markdown-codec";
import { inkoraSchema } from "./schema";

const fixtureRoot = new URL("../test/fixtures/markdown/", import.meta.url);

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, fixtureRoot)), "utf8");
}

function golden(name: string): string {
  return fixture(`${name}.expected.md`).replace(/\n$/, "");
}

describe("Markdown golden fixtures", () => {
  it.each(["basic", "nested", "code", "unclosed"])("normalizes %s deterministically", (name) => {
    const input = fixture(`${name}.input.md`);
    const document = parseMarkdown(input);
    const output = serializeMarkdown(document);

    expect(output).toBe(golden(name));
    expect(parseMarkdown(output).eq(document)).toBe(true);
    expect(normalizeMarkdown(output)).toBe(output);
  });

  it("preserves Unicode code points, soft breaks, and hard breaks", () => {
    const input = fixture("basic.input.md");
    const output = normalizeMarkdown(input);
    const document = parseMarkdown(output);

    expect(output).toContain("中文 é 👩‍💻");
    expect(output).toContain("soft\nline\\\nhard");
    expect(document.textContent).toContain("é");
    expect(document.textContent).not.toContain("é");
  });

  it("keeps code style, language, content, and unclosed-fence state", () => {
    const code = parseMarkdown(fixture("code.input.md"));
    expect(code.child(0).attrs).toMatchObject({
      language: "swift",
      style: "fenced",
      fence: "~~~",
      closed: true,
    });
    expect(code.child(0).textContent).toBe('let ticks = "```"');
    expect(code.child(1).attrs.style).toBe("indented");

    const unclosed = parseMarkdown(fixture("unclosed.input.md"));
    expect(unclosed.child(0).attrs.closed).toBe(false);
    expect(serializeMarkdown(unclosed)).not.toMatch(/\n```$/);
  });

  it("grows a fence only when code contains a closing-fence candidate", () => {
    const code = inkoraSchema.node("code_block", {
      language: "",
      style: "fenced",
      fence: "```",
      closed: true,
    }, [inkoraSchema.text("```\nnot ``` trailing")]);
    const document = inkoraSchema.node("doc", null, [code]);
    const output = serializeMarkdown(document);

    expect(output).toBe("````\n```\nnot ``` trailing\n````");
    expect(parseMarkdown(output).textContent).toBe(document.textContent);
  });

  it("preserves inline-code boundaries and link destinations structurally", () => {
    const input = '`` a`b `` and [目标](./a\\(b\\).md "标题")';
    const document = parseMarkdown(input);
    const output = serializeMarkdown(document);
    const restored = parseMarkdown(output);
    const paragraph = restored.child(0);
    const code = paragraph.child(0);
    const linked = paragraph.child(paragraph.childCount - 1);

    expect(restored.eq(document)).toBe(true);
    expect(code.text).toBe("a`b");
    expect(code.marks[0]?.type.name).toBe("code");
    expect(linked.marks[0]?.attrs).toEqual({
      href: "./a(b).md",
      title: "标题",
    });
  });

  it("serializes an empty input as a stable empty document", () => {
    const document = parseMarkdown("");
    expect(document.toJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(serializeMarkdown(document)).toBe("");
  });
});

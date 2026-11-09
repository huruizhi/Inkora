import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  documentFromJSON,
  inkoraNodeSpecs,
  inkoraSchema,
  loadDocumentJSON,
} from "./schema";

describe("Inkora ProseMirror schema", () => {
  it("defines the supported nodes and protected extension block", () => {
    expect(Object.keys(inkoraSchema.nodes)).toEqual([
      "doc",
      "paragraph",
      "heading",
      "text",
      "hard_break",
      "horizontal_rule",
      "blockquote",
      "code_block",
      "table",
      "table_head",
      "table_body",
      "table_row",
      "table_header",
      "table_cell",
      "ordered_list",
      "bullet_list",
      "list_item",
      "image",
      "protected_block",
    ]);
    expect(Object.keys(inkoraSchema.marks)).toEqual([
      "strong",
      "em",
      "strike",
      "code",
      "link",
    ]);
  });

  it("models Markdown images as selectable inline atoms instead of text marks", () => {
    const image = inkoraSchema.nodes.image.create({
      alt: "架构图",
      href: "./文档.assets/架构%20图.png",
      title: "标题",
    });

    expect(image.isInline).toBe(true);
    expect(image.isAtom).toBe(true);
    expect(image.isLeaf).toBe(true);
    expect(image.attrs).toMatchObject({
      alt: "架构图",
      href: "./文档.assets/架构%20图.png",
      title: "标题",
    });
  });

  it("accepts the supported base block and inline structures", () => {
    const document = inkoraSchema.node("doc", null, [
      inkoraSchema.node("heading", { level: 1 }, [
        inkoraSchema.text("Inkora"),
      ]),
      inkoraSchema.node("paragraph", null, [
        inkoraSchema.text("第一行"),
        inkoraSchema.node("hard_break"),
        inkoraSchema.text("第二行 👩🏽‍💻"),
      ]),
      inkoraSchema.node("horizontal_rule"),
      inkoraSchema.node("heading", { level: 6 }, [
        inkoraSchema.text("边界"),
      ]),
    ]);

    expect(() => document.check()).not.toThrow();
    expect(document.childCount).toBe(4);
  });

  it("creates a valid paragraph-backed empty document", () => {
    const document = createEmptyDocument();

    expect(document.toJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(() => document.check()).not.toThrow();
  });

  it("rejects illegal nesting and invalid heading levels", () => {
    expect(() =>
      documentFromJSON({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toThrow(/Invalid content/);

    expect(() =>
      documentFromJSON({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 7 } }],
      }),
    ).toThrow(/Heading level/);
  });

  it("recovers empty and invalid input to a valid empty document", () => {
    const empty = loadDocumentJSON(null);
    const invalid = loadDocumentJSON({
      type: "doc",
      content: [{ type: "unsupported" }],
    });

    expect(empty.recovered).toBe(true);
    expect(empty.reason).toBe("empty_input");
    expect(invalid.recovered).toBe(true);
    expect(invalid.reason).toBe("invalid_document");
    expect(invalid.document.eq(createEmptyDocument())).toBe(true);
  });

  it("round-trips valid JSON without changing structure or Unicode", () => {
    const original = inkoraSchema.node("doc", null, [
      inkoraSchema.node("heading", { level: 2 }, [
        inkoraSchema.text("中文 e\u0301 🌈"),
      ]),
      inkoraSchema.node("paragraph", null, [
        inkoraSchema.text("alpha"),
        inkoraSchema.node("hard_break"),
        inkoraSchema.text("omega"),
      ]),
    ]);

    const restored = documentFromJSON(original.toJSON());
    expect(restored.eq(original)).toBe(true);
    expect(restored.toJSON()).toEqual(original.toJSON());
  });

  it("declares deterministic DOM parsing and rendering rules", () => {
    expect(inkoraNodeSpecs.paragraph.parseDOM).toEqual([{ tag: "p" }]);
    expect(inkoraNodeSpecs.hard_break.parseDOM).toEqual([{ tag: "br" }]);
    expect(inkoraNodeSpecs.horizontal_rule.parseDOM).toEqual([{ tag: "hr" }]);
    expect(inkoraNodeSpecs.heading.parseDOM).toEqual(
      [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        attrs: { level, style: "atx" },
      })),
    );

    const heading = inkoraSchema.node("heading", { level: 3 });
    expect(inkoraNodeSpecs.paragraph.toDOM?.(inkoraSchema.node("paragraph"))).toEqual([
      "p",
      0,
    ]);
    expect(inkoraNodeSpecs.heading.toDOM?.(heading)).toEqual(["h3", 0]);
    expect(inkoraNodeSpecs.hard_break.toDOM?.(inkoraSchema.node("hard_break"))).toEqual([
      "br",
    ]);
    expect(
      inkoraNodeSpecs.horizontal_rule.toDOM?.(
        inkoraSchema.node("horizontal_rule"),
      ),
    ).toEqual(["hr"]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeMarkdownSafety, prepareMarkdownSave } from "./markdown-safety";

const fixtureRoot = new URL("../test/fixtures/unsafe/", import.meta.url);

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, fixtureRoot)), "utf8");
}

describe("unknown Markdown detection", () => {
  it.each([
    ["gfm-table.md", "gfm_table"],
    ["task-list.md", "task_list"],
    ["footnote.md", "footnote"],
    ["raw-html.md", "raw_html"],
    ["custom-container.md", "custom_container"],
  ])("detects %s as %s", (name, expectedCode) => {
    const analysis = analyzeMarkdownSafety(fixture(name));
    expect(analysis.mode).toBe("source");
    expect(analysis.structuredSaveAllowed).toBe(false);
    expect(analysis.risks.map((risk) => risk.code)).toContain(expectedCode);
    expect(analysis.risks.every((risk) => risk.line > 0 && risk.column > 0)).toBe(true);
  });

  it("classifies deferred syntax without losing locations", () => {
    const analysis = analyzeMarkdownSafety(fixture("deferred.md"));
    expect(analysis.risks.map((risk) => risk.code)).toEqual([
      "front_matter",
      "obsidian_callout",
      "wiki_link",
      "math",
    ]);
    expect(analysis.risks.slice(0, 3).every((risk) => risk.level === "deferred")).toBe(
      true,
    );
  });

  it("ignores extension-shaped text inside code and link targets", () => {
    const analysis = analyzeMarkdownSafety(fixture("code-literals-safe.md"));
    expect(analysis).toEqual({
      mode: "structured",
      structuredSaveAllowed: true,
      risks: [],
    });
  });

  it("detects JSX, templates, images, and bare GFM autolinks", () => {
    const analysis = analyzeMarkdownSafety(
      "<Component />\n\n{value}\n\n![alt](./image.png)\n\nhttps://example.test/path",
    );
    expect(analysis.risks.map((risk) => risk.code)).toEqual([
      "mdx_or_jsx",
      "template_expression",
      "image",
      "gfm_autolink",
    ]);
  });
});

describe("Markdown save gate", () => {
  it("returns an unchanged risky document exactly", () => {
    const original = fixture("gfm-table.md");
    const decision = prepareMarkdownSave(original, original, "structured");
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("Expected unchanged save");
    expect(decision.strategy).toBe("unchanged");
    expect(decision.output).toBe(original);
  });

  it("blocks structured overwrite when unknown syntax remains", () => {
    const original = fixture("task-list.md");
    const current = original.replace("pending", "still pending");
    const decision = prepareMarkdownSave(original, current, "structured");
    expect(decision).toMatchObject({
      allowed: false,
      strategy: "blocked",
      reason: "unsafe_syntax",
      actions: ["switch_to_source", "cancel"],
    });
  });

  it("allows source mode to save the complete edited buffer", () => {
    const original = fixture("footnote.md");
    const current = `${original}\nEdited in source mode.`;
    const decision = prepareMarkdownSave(original, current, "source");
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("Expected source save");
    expect(decision.strategy).toBe("source_buffer");
    expect(decision.output).toBe(current);
  });

  it("allows already-normalized supported structured content", () => {
    const decision = prepareMarkdownSave("# Old", "# New", "structured");
    expect(decision).toMatchObject({
      allowed: true,
      strategy: "structured",
      output: "# New",
    });
  });

  it("blocks implicit normalization and offers source mode", () => {
    const decision = prepareMarkdownSave("# Old", "# New\n", "structured");
    expect(decision).toMatchObject({
      allowed: false,
      reason: "normalization_required",
      actions: ["switch_to_source", "cancel"],
    });
  });
});

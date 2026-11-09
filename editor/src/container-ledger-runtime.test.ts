import { describe, expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

describe("container source ownership", () => {
  it("does not append reference definitions or synthetic blank lines to an EOF code fence", () => {
    const session = new SourceAuthoritySession("[ref]: real.png\n\n- ~~~md\n  value");
    expect(session.state.doc.textContent).toBe("value");
    expect(session.saveEligible).toBe(true);
  });
  it("edits quoted fenced code without treating its image literal as an atom", () => {
    const raw = "> ~~~md\n> ![example](Old.assets/missing-quote.png)\n> ~~~\n";
    const session = new SourceAuthoritySession(raw);
    expect(session.saveEligible, JSON.stringify(session.stateReport())).toBe(true);
    expect(session.setRawSelection(raw.indexOf("example"))).toBe(true);
    expect(session.nativeType("X")).toBe(true);
    expect(session.currentRaw).toBe(raw.replace("example", "Xexample"));
    expect(session.saveEligible, JSON.stringify(session.stateReport())).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(raw);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(raw.replace("example", "Xexample"));
  });

  it.each([
    { raw: "- item\n\n    ![real](Old.assets/real.png)\n", needle: "item", images: ["Old.assets/real.png"] },
    { raw: "- item\n\n    ![real](Old.assets/real.png)\n", needle: "![real]", images: ["Old.assets/real.png"] },
    { raw: "> ~~~md\n> ![example](Old.assets/missing.png)\n> ~~~\n", needle: "example", images: [] },
    { raw: "- ```ts\n  let value = 1\n  ```\n", needle: "value", images: [] },
    { raw: ">     let value = 1\n", needle: "value", images: [] },
    { raw: "- item\n\n      let value = 1\n", needle: "value", images: [] },
    { raw: "\uFEFF> > ~~~md\r\n> > value 中文👩‍💻\r\n> > ~~~\r\n", needle: "value", images: [] },
    { raw: "- ~~~md\r\n  value", needle: "value", images: [] },
  ])("keeps raw ownership through edit, save, source no-op and history: $raw at $needle", ({ raw, needle, images }) => {
    const session = new SourceAuthoritySession(raw);
    expect(session.saveEligible, JSON.stringify(session.stateReport())).toBe(true);
    const actual: string[] = [];
    session.state.doc.descendants(node => {
      if (node.type.name === "image") actual.push(node.attrs.href);
    });
    expect(actual).toEqual(images);
    const caret = raw.indexOf(needle);
    expect(session.setRawSelection(caret)).toBe(true);
    expect(session.nativeType("中"), session.diagnostic ?? "").toBe(true);
    const edited = raw.slice(0, caret) + "中" + raw.slice(caret);
    expect(session.currentRaw).toBe(edited);
    expect(session.saveEligible, session.diagnostic ?? "").toBe(true);
    expect(session.saveMemory()).toBe(true);
    expect(session.beginSource()).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.currentRaw).toBe(edited);
    expect(session.rawSelection.head).toBe(caret + 1);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(raw);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(edited);
    expect(new SourceAuthoritySession(edited).saveEligible).toBe(true);
  });
});

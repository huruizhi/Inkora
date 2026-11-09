import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

it("opens and edits a link whose reference destination and title occupy later lines", () => {
  const raw = '[go][ref]\r\n\r\n[ref]:\r\n  <docs/a(b).md>\r\n  "中文 &amp; title"\r\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.state.doc.textContent).toBe("go");
  expect(session.state.doc.firstChild?.firstChild?.marks.map(mark => mark.toJSON())).toEqual([
    { type: "link", attrs: { href: "docs/a(b).md", title: "中文 & title" } },
  ]);
  expect(session.setRawSelection(2)).toBe(true);
  expect(session.nativeType("中")).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("[go]", "[g中o]"));
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("[go]", "[g中o]"));
});

it("resolves a multiline escaped-bracket image label to its canonical definition", () => {
  const raw = String.raw`![line][A\]
  B]

[a\] b]: Old.assets/line.png
`;
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.captureImageOwnership()).toEqual({ raw, imageURIs: ["Old.assets/line.png"] });
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveMemory()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("edits a destination in a quoted multiline definition while preserving its title source", () => {
  const raw = '[go][ref]\n\n> [ref]:\n>   <docs/old.md>\n>   "line one\n>   line &amp; two"\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.setRawSelection(2)).toBe(true);
  const owner = session.linkOwnerAtSelection();
  expect(owner).toMatchObject({ href: "docs/old.md", title: "line one\nline & two" });
  expect(session.applyLinkOwnerEdit(owner!, { href: "docs/new.md", title: owner!.title })).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("docs/old.md", "docs/new.md"));
  expect(session.saveEligible).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("docs/old.md", "docs/new.md"));
});

it("keeps the first canonical definition and the other definition bytes", () => {
  const raw = '[go][Ref]\n\n[ref]:\n  /one "first"\n[REF]: /two "second"\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.setRawSelection(2)).toBe(true);
  expect(session.linkOwnerAtSelection()).toMatchObject({ href: "/one", title: "first" });
  expect(session.nativeType("中")).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("[go]", "[g中o]"));
  expect(session.saveEligible).toBe(true);
});

it("round-trips a BOM/CRLF document containing only a multiline definition", () => {
  const raw = '\uFEFF[ref]:\r\n  /one\r\n  \'title\'\r\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.captureImageOwnership()).toEqual({ raw, imageURIs: [] });
  expect(session.saveMemory()).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("does not use a definition-looking code block instead of a real multiline definition", () => {
  const raw = '[go][ref]\n\n~~~md\n[ref]:\n  /wrong\n~~~\n\n[ref]:\n  /right "title"\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.setRawSelection(2)).toBe(true);
  expect(session.linkOwnerAtSelection()).toMatchObject({ href: "/right", title: "title" });
  expect(session.nativeType("中")).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("[go]", "[g中o]"));
});

it("preserves unedited destination escapes and title entities during local attribute edits", () => {
  const raw = '[go](./a\\(b\\).md "A&amp;B")\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(2)).toBe(true);
  const owner = session.linkOwnerAtSelection()!;
  expect(owner).toMatchObject({ href: "./a(b).md", title: "A&B" });
  expect(session.applyLinkOwnerEdit(owner, { href: owner.href, title: owner.title })).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.version).toBe(0);
  expect(session.past).toHaveLength(0);
  expect(session.applyLinkOwnerEdit(owner, { href: owner.href, title: "Changed" })).toBe(true);
  expect(session.currentRaw).toBe(raw.replace("A&amp;B", "Changed"));
});

it("keeps an empty image destination as an atom with no local resource URI", () => {
  const raw = '![alt][ref]\n\n[ref]: <> ""\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(true);
  expect(session.state.doc.firstChild?.firstChild?.type.name).toBe("image");
  expect(session.state.doc.firstChild?.firstChild?.attrs.href).toBe("");
  expect(session.captureImageOwnership()).toEqual({ raw, imageURIs: [] });
  expect(session.saveMemory()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("adds and removes a reference title after the existing angle destination", () => {
  const raw = '[go][ref]\r\n\r\n[ref]:\r\n  <docs/a\\(b\\).md>\r\n';
  const titled = '[go][ref]\r\n\r\n[ref]:\r\n  <docs/a\\(b\\).md> "New"\r\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(2)).toBe(true);
  const owner = session.linkOwnerAtSelection()!;
  expect(session.applyLinkOwnerEdit(owner, { href: owner.href, title: "New" })).toBe(true);
  expect(session.currentRaw).toBe(titled);
  const changed = session.linkOwnerAtSelection()!;
  expect(session.applyLinkOwnerEdit(changed, { href: changed.href, title: null })).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.saveEligible).toBe(true);
});

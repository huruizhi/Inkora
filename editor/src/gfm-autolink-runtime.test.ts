import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";

it("requires a GFM start boundary for email and protocol-email autolinks", () => {
  const raw = "]foo@bar.baz ]mailto:foo@bar.baz ]xmpp:foo@bar.baz\n";
  const session = new SourceAuthoritySession(raw);
  const links: string[] = [];
  session.state.doc.descendants(node => {
    const link = node.marks.find(mark => mark.type.name === "link");
    if (link) links.push(link.attrs.href);
  });
  expect(links).toEqual([]);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("retains email recognition at valid GFM delimiters and line starts", () => {
  const cases = [
    ["foo@bar.baz\n", "mailto:foo@bar.baz"],
    [" foo@bar.baz\n", "mailto:foo@bar.baz"],
    ["*foo@bar.baz\n", "mailto:foo@bar.baz"],
    ["~foo@bar.baz\n", "mailto:foo@bar.baz"],
    ["(foo@bar.baz\n", "mailto:foo@bar.baz"],
    ["_foo@bar.baz\n", "mailto:_foo@bar.baz"],
    ["_mailto:foo@bar.baz\n", "mailto:foo@bar.baz"],
    ["*xmpp:foo@bar.baz/resource\n", "xmpp:foo@bar.baz/resource"],
    ["before\nmailto:foo@bar.baz\n", "mailto:foo@bar.baz"],
  ];
  for (const [raw, href] of cases) {
    const session = new SourceAuthoritySession(raw);
    const links: string[] = [];
    session.state.doc.descendants(node => {
      const link = node.marks.find(mark => mark.type.name === "link");
      if (link) links.push(link.attrs.href);
    });
    expect(links, raw).toEqual([href]);
    expect(session.saveEligible, session.diagnostic).toBe(true);
    expect(session.currentRaw).toBe(raw);
  }
});

it("recognizes bare HTTP URLs and email addresses without changing their source", () => {
  const raw = "Visit https://example.com/a(b) and writer@example.org.\n";
  const session = new SourceAuthoritySession(raw);
  const links: Array<{ text: string; href: string }> = [];
  session.state.doc.descendants(node => {
    const link = node.marks.find(mark => mark.type.name === "link");
    if (node.isText && link) links.push({ text: node.text!, href: link.attrs.href });
  });
  expect(links).toEqual([
    { text: "https://example.com/a(b)", href: "https://example.com/a(b)" },
    { text: "writer@example.org", href: "mailto:writer@example.org" },
  ]);
  expect(session.setRawSelection(raw.indexOf("example.com") + 2)).toBe(true);
  expect(session.linkOwnerAtSelection()).toMatchObject({
    kind: "autolink", href: "https://example.com/a(b)",
  });
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.saveMemory()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("replaces an email label while retaining its mailto destination and one undo unit", () => {
  const raw = "Reach writer@example.org.\r\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.replaceVisualText(raw, [{ from: 7, to: 25, expected: "writer@example.org", insert: "author" }])).toMatchObject({ ok: true });
  expect(session.currentRaw).toBe("Reach [author](<mailto:writer@example.org>).\r\n");
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.past).toHaveLength(1);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("Reach [author](<mailto:writer@example.org>).\r\n");
});

it("removes a bare link with a source escape and restores its ownership on Undo", () => {
  const raw = "www.example.org\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(6)).toBe(true);
  const owner = session.linkOwnerAtSelection()!;
  expect(session.applyLinkOwnerEdit(owner, null), session.diagnostic).toBe(true);
  expect(session.state.doc.textContent).toBe("www.example.org");
  expect(session.linkOwnerAtSelection()).toBeNull();
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(new SourceAuthoritySession(session.currentRaw).state.doc.eq(session.state.doc)).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.linkOwnerAtSelection()?.href).toBe("http://www.example.org");
});

it("updates an implicit URL destination after a native selected-text edit", () => {
  const raw = "https://example.org/old\r\n";
  const session = new SourceAuthoritySession(raw);
  const start = raw.indexOf("old");
  expect(session.setRawSelection(start, start + 3)).toBe(true);
  expect(session.nativeType("new"), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("https://example.org/new\r\n");
  expect(session.linkOwnerAtSelection()?.href).toBe("https://example.org/new");
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("https://example.org/new\r\n");
});

it("keeps Markdown, explicit links, code and escaped URL punctuation distinct", () => {
  const raw = '**www.example.org/a*b*c**\n\n[www.example.org](./target) `writer@example.org`\n\nwww\\.example.org ftp://example.org example.org javascript:alert(1)\n';
  const session = new SourceAuthoritySession(raw);
  const links: Array<{ text: string; href: string; marks: string[] }> = [];
  session.state.doc.descendants(node => {
    const link = node.marks.find(mark => mark.type.name === 'link');
    if (link) links.push({ text: node.text!, href: link.attrs.href, marks: node.marks.map(mark => mark.type.name) });
  });
  expect(links).toEqual([
    { text: 'www.example.org/a*b*c', href: 'http://www.example.org/a*b*c', marks: ['strong', 'link'] },
    { text: 'www.example.org', href: './target', marks: ['link'] },
  ]);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("keeps extension-shaped characters inside an accepted URL literal", () => {
  const raw = "See www.example.org/[[bad]]/{x}/$a$.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.state.doc.firstChild?.type.name).toBe('paragraph');
  expect(session.state.doc.textContent).toBe('See www.example.org/[[bad]]/{x}/$a$.');
  expect(session.setRawSelection(9)).toBe(true);
  expect(session.linkOwnerAtSelection()?.href).toBe('http://www.example.org/%5B%5Bbad%5D%5D/%7Bx%7D/$a$');
  expect(session.currentRaw).toBe(raw);
});

it("deactivates a generated email link after deleting its at sign", () => {
  const raw = "writer@example.org\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(6, 7)).toBe(true);
  expect(session.nativeType(''), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('writerexample.org\n');
  expect(session.linkOwnerAtSelection()).toBeNull();
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.linkOwnerAtSelection()?.href).toBe('mailto:writer@example.org');
});

it("edits a table email owner while preserving BOM, CRLF and the task link", () => {
  const raw = '\uFEFF| link | mail |\r\n| --- | --- |\r\n| www.example.org | writer@example.org |\r\n\r\n- [ ] https://example.org/task\r\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.setRawSelection(raw.indexOf('writer') + 2)).toBe(true);
  const owner = session.linkOwnerAtSelection()!;
  expect(owner.href).toBe('mailto:writer@example.org');
  expect(session.applyLinkOwnerEdit(owner, { href: 'https://docs.example.org', title: null }), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw.replace('writer@example.org', '[writer@example.org](https://docs.example.org)'));
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveMemory()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.future).toHaveLength(1);
});

it("keeps an unbroken ordinary word as source-owned text", () => {
  const raw = 'a'.repeat(20_000) + '\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.state.doc.firstChild?.firstChild?.marks).toEqual([]);
  expect(session.saveMemory()).toBe(true);
});

it("groups synthetic composition changes inside a generated URL into one history unit", () => {
  const raw = 'https://example.org/old\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(raw.indexOf('old'), raw.indexOf('old') + 3)).toBe(true);
  session.beginComposition();
  expect(session.nativeType('中', 71), session.diagnostic).toBe(true);
  expect(session.nativeType('文', 71), session.diagnostic).toBe(true);
  session.endComposition();
  expect(session.currentRaw).toBe('https://example.org/中文\n');
  expect(session.past).toHaveLength(1);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe('https://example.org/中文\n');
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("keeps a backward selection during a bare-link attribute edit and source no-op", () => {
  const raw = 'www.example.org tail\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(8, 4, 'left')).toBe(true);
  const visual = { anchor: session.state.selection.anchor, head: session.state.selection.head };
  const owner = session.linkOwnerAtSelection()!;
  expect(session.applyLinkOwnerEdit(owner, { href: './doc', title: null }), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('[www.example.org](./doc) tail\n');
  expect(session.rawSelection).toEqual({ anchor: 9, head: 5, affinity: 'left' });
  expect({ anchor: session.state.selection.anchor, head: session.state.selection.head }).toEqual(visual);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.rawSelection).toEqual({ anchor: 9, head: 5, affinity: 'left' });
  expect(session.past).toHaveLength(1);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.rawSelection).toEqual({ anchor: 8, head: 4, affinity: 'left' });
});

it("keeps an explicit link owner when its label contains a bare URL after text", () => {
  const raw = '[See https://example.org/path](./owner)\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.textContent).toBe('See https://example.org/path');
  expect(session.setRawSelection(3)).toBe(true);
  expect(session.linkOwnerAtSelection()?.href).toBe('./owner');
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

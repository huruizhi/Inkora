import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";
import { parse } from "./source-document";
import { buildSourceLedger } from "./source-ledger";
import { JSDOM } from "jsdom";
import { createEditorRuntime } from "./editor-runtime";
import { NodeSelection } from "prosemirror-state";
import { deleteSelection } from "prosemirror-commands";
import { indexVisualText } from "./visual-search";

it("renders accepted footnote and callout source in a read-only EditorView atom", () => {
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  try {
    for (const opaque of ["[^n]: /definition", "> [!NOTE]\n> raw"]) {
      const host = dom.window.document.querySelector("main")!;
      const raw = opaque + "\n\nAfter.\n";
      const runtime = createEditorRuntime(host, raw, () => {});
      try {
        expect(runtime.mode).toBe("visual");
        expect(host.querySelector(".protected-block pre")?.textContent).toBe(opaque);
        expect((host.querySelector(".protected-block") as HTMLElement).contentEditable).toBe("false");
        expect(runtime.getText()).toBe(raw);
      } finally { runtime.destroy(); host.replaceChildren(); }
    }
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    dom.window.close();
  }
});

it("assigns footnote bytes only to their accepted opaque block", () => {
  const raw = "[^note]: /definition\n\n[body][real]\n\n[real]: /first\n[REAL]: /second\n";
  const parsed = parse(raw);
  const result = buildSourceLedger(raw, parsed.doc, parsed.ranges);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  const footnoteSpans = result.ledger.spans.filter(span =>
    span.sourceStart < 20 && span.sourceEnd > 0 && span.sourceEnd > span.sourceStart);
  expect(footnoteSpans.map(span => span.role)).toEqual(["protected"]);
  expect(result.ledger.links.map(owner => owner.href)).toEqual(["/first"]);
});

it("requires a matching TOML closing fence and treats its contents as opaque", () => {
  const raw = "+++\nx = 1\n...\n\nAfter.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.saveEligible).toBe(false);
  expect(session.currentRaw).toBe(raw);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("+++\nx = 1\n+++\n\nAfter.\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.issues).toEqual([]);
  expect(session.saveEligible).toBe(true);
});

it("keeps malformed callout and footnote definitions behind the unsafe gate", () => {
  for (const raw of ["> [!BAD TYPE]\n> raw\n\nAfter.\n", "[^bad label]: /target\n\nAfter.\n", "[^]: /target\n"]) {
    const session = new SourceAuthoritySession(raw);
    expect(session.saveEligible, raw).toBe(false);
    expect(session.issues, raw).not.toHaveLength(0);
    expect(session.currentRaw).toBe(raw);
    expect(session.sourceAccessible).toBe(true);
  }
});

it("keeps supported horizontal-rule source saveable through the canonical ledger", () => {
  const raw = "***\r\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.firstChild?.type.name).toBe("horizontal_rule");
  expect(session.issues).toEqual([]);
  expect(session.saveMemory(), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("maps a horizontal-rule selection and deletion as one source history unit", () => {
  const session = new SourceAuthoritySession("***");
  expect(session.saveMemory()).toBe(true);
  expect(session.dispatch(session.state.tr.setSelection(NodeSelection.create(session.state.doc, 0)))).toBe(true);
  let accepted = false;
  expect(deleteSelection(session.state, tr => { accepted = session.dispatch(tr); })).toBe(true);
  expect(accepted, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("");
  expect(session.documentDirty).toBe(true);
  expect(session.saveEligible).toBe(true);
  expect(session.past).toHaveLength(1);
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe("***");
  expect(session.documentDirty).toBe(false);
  expect(session.saveEligible).toBe(true);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("");
});

it("retains a canonical footnote definition as visible opaque source", () => {
  const raw = "Before.\n\n[^note]: definition\n    continuation\n\nAfter.\n";
  const session = new SourceAuthoritySession(raw);
  const protectedRaw: string[] = [];
  session.state.doc.descendants(node => {
    if (node.type.name === "protected_block") protectedRaw.push(node.attrs.raw);
  });
  expect(protectedRaw).toContain("[^note]: definition\n    continuation");
  expect(session.currentRaw).toBe(raw);
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("blocks an unclosed opening front matter candidate and permits source repair", () => {
  const raw = "---\ntitle: bad\n\nBody.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.currentRaw).toBe(raw);
  expect(session.saveEligible).toBe(false);
  expect(session.sourceAccessible).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("---\ntitle: bad\n---\n\nBody.\n")).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("ends a callout before a non-quote lazy continuation line", () => {
  const raw = "> [!NOTE]\n> opaque\nlazy continuation\n\nAfter.\n";
  const session = new SourceAuthoritySession(raw);
  const protectedRaw: string[] = [];
  session.state.doc.descendants(node => {
    if (node.type.name === "protected_block") protectedRaw.push(node.attrs.raw);
  });
  expect(protectedRaw).toEqual(["> [!NOTE]\n> opaque"]);
  expect(session.state.doc.textContent).toContain("lazy continuation");
  expect(session.currentRaw).toBe(raw);
});

it("keeps ordinary text beside an opaque wiki fragment directly editable", () => {
  const raw = "Before [[target]] after.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(0)).toBe(true);
  expect(session.nativeType("New "), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("New Before [[target]] after.\n");
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("rejects full visual deletion of a read-only inline atom and retains the intent", () => {
  const raw = "Before [[target]] after.\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.setRawSelection(7, 17)).toBe(true);
  const before = session.state;
  expect(session.dispatch(before.tr.deleteSelection())).toBe(false);
  expect(session.currentRaw).toBe(raw);
  expect(session.state.doc.eq(before.doc)).toBe(true);
  expect(session.state.selection.eq(before.selection)).toBe(true);
  expect(session.past).toHaveLength(0);
  expect(session.unresolvedIntent).not.toBeNull();
  expect(session.saveEligible).toBe(false);
  expect(session.beginSource()).toBe(true);
  expect(session.updateDraft("Before  after.\n", { anchor: 7, head: 7, affinity: 'right' })).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe("Before  after.\n");
  expect(session.saveEligible).toBe(true);
});

it("keeps emphasis outside a wiki atom independent of its opaque delimiters", () => {
  const raw = "*alpha [[target*]] omega*\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.firstChild?.firstChild?.marks.map(mark => mark.type.name)).toEqual(['em']);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.setRawSelection(1)).toBe(true);
  expect(session.nativeType('New '), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe("*New alpha [[target*]] omega*\n");
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
  expect(session.redo()).toBe(true);
  expect(session.currentRaw).toBe("*New alpha [[target*]] omega*\n");
});

it("preserves exact repeated and container wiki atoms through adjacent edits and history", () => {
  const vectors = [
    { raw: '\uFEFFBefore [[目标]] after.\r\n\r\nTail.\n', at: 1, after: '\uFEFFNew Before [[目标]] after.\r\n\r\nTail.\n', atoms: ['[[目标]]'] },
    { raw: '[[same]] text [[same]] end.\n', at: 9, after: '[[same]] New text [[same]] end.\n', atoms: ['[[same]]', '[[same]]'] },
    { raw: '> Before [[目标]] after.\r\n', at: 2, after: '> New Before [[目标]] after.\r\n', atoms: ['[[目标]]'] },
    { raw: '- [ ] Before ![[目标]] after.\r\n', at: 6, after: '- [ ] New Before ![[目标]] after.\r\n', atoms: ['![[目标]]'] },
    { raw: '| Before [[a\\|b]] | Tail |\r\n| --- | --- |\r\n', at: 2, after: '| New Before [[a\\|b]] | Tail |\r\n| --- | --- |\r\n', atoms: ['[[a\\|b]]'] },
  ];
  for (const vector of vectors) {
    const session = new SourceAuthoritySession(vector.raw);
    const atoms: string[] = [];
    session.state.doc.descendants(node => { if (node.type.name === 'protected_inline') atoms.push(node.attrs.raw); });
    expect(atoms, vector.raw).toEqual(vector.atoms);
    expect(session.saveEligible, vector.raw + session.diagnostic).toBe(true);
    expect(session.setRawSelection(vector.at), vector.raw + session.diagnostic).toBe(true);
    expect(session.nativeType('New '), vector.raw + session.diagnostic).toBe(true);
    expect(session.currentRaw).toBe(vector.after);
    expect(session.past).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(session.currentRaw).toBe(vector.raw);
    expect(session.redo()).toBe(true);
    expect(session.currentRaw).toBe(vector.after);
    expect(session.saveMemory()).toBe(true);
    const reopened = new SourceAuthoritySession(session.savedRaw);
    expect(reopened.saveEligible).toBe(true);
    expect(reopened.state.doc.eq(session.state.doc)).toBe(true);
  }
});

it("indexes editable text on each side without searching through opaque preview text", () => {
  const session = new SourceAuthoritySession('Before [[secret]] after.\n');
  expect(indexVisualText(session.state.doc).text).toBe('Before \n after.');
});

it("lets earlier complete links own their labels while footnotes win reference collisions", () => {
  const raw = '[label [^note]](/target) outside [^note].\n\n[^note]: /definition\n';
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.firstChild?.type.name).toBe('paragraph');
  const atoms: string[] = [];
  const links: Array<{text: string; href: string}> = [];
  session.state.doc.descendants(node => {
    if (node.type.name === 'protected_inline') atoms.push(node.attrs.raw);
    const link = node.marks.find(mark => mark.type.name === 'link');
    if (node.isText && link) links.push({text: node.text!, href: link.attrs.href});
  });
  expect(atoms).toEqual(['[^note]']);
  expect(links).toEqual([{text: 'label [^note]', href: '/target'}]);
  expect(session.saveEligible, session.diagnostic).toBe(true);
});

it("owns physical quote prefixes inside a multiline opaque comment exactly once", () => {
  const raw = '> Before <!-- first\r\n> [[literal]] --> after.\r\n';
  const session = new SourceAuthoritySession(raw);
  const atoms: string[] = [];
  session.state.doc.descendants(node => { if (node.type.name === 'protected_inline') atoms.push(node.attrs.raw); });
  expect(atoms).toEqual(['<!-- first\r\n> [[literal]] -->']);
  const parsed = parse(raw);
  const ledger = buildSourceLedger(raw, parsed.doc, parsed.ranges, parsed.tokenEvidence);
  expect(ledger.ok).toBe(true);
  if (!ledger.ok) throw Error(ledger.reason);
  expect(ledger.ledger.spans.filter(span => span.sourceStart < 38 && span.sourceEnd > 9 && span.sourceEnd > span.sourceStart)
    .map(span => span.role)).toEqual(['protected']);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.setRawSelection(2)).toBe(true);
  expect(session.nativeType('New '), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('> New Before <!-- first\r\n> [[literal]] --> after.\r\n');
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("keeps a parser-owned HTML block inside a quote beside editable paragraphs", () => {
  const raw = '> Before.\r\n>\r\n> <div>\r\n> # hidden\r\n> </div>\r\n\r\nAfter.\r\n';
  const session = new SourceAuthoritySession(raw);
  const opaque: string[] = [];
  session.state.doc.descendants(node => { if (node.type.name === 'protected_block') opaque.push(node.attrs.raw); });
  expect(opaque).toEqual(['> <div>\r\n> # hidden\r\n> </div>']);
  expect(session.state.doc.firstChild?.type.name).toBe('blockquote');
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.setRawSelection(2)).toBe(true);
  expect(session.nativeType('New '), session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe('> New Before.\r\n>\r\n> <div>\r\n> # hidden\r\n> </div>\r\n\r\nAfter.\r\n');
  expect(session.undo()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

it("retains canonical U005 candidates with diagnostics and an explicit source-save path", () => {
  for (const raw of ['Before ^up^ after.\n', 'Before ~down~ after.\n', 'Before ==marked== after.\n', 'Term\n: definition\n', '{"title":"value"}\n\nBody.\n']) {
    const session = new SourceAuthoritySession(raw);
    expect(session.saveEligible, raw).toBe(false);
    expect(session.issues, raw).not.toHaveLength(0);
    expect(session.currentRaw).toBe(raw);
    expect(session.beginSource()).toBe(true);
    expect(session.applySource()).toBe(true);
    expect(session.saveMemory(), session.diagnostic).toBe(true);
    expect(session.savedRaw).toBe(raw);
  }
});

it("never pairs a low-priority U marker through a complete higher-priority owner", () => {
  for (const raw of ['^before `literal^` after\n', '^before [literal^](/target) after\n', '$before https://example.org/$x after\n']) {
    const session = new SourceAuthoritySession(raw);
    expect(session.issues, raw).toEqual([]);
    expect(session.saveEligible, raw + session.diagnostic).toBe(true);
    expect(session.saveMemory()).toBe(true);
    expect(session.currentRaw).toBe(raw);
  }
});

it("does not confuse raw HTML anchor state with a complete Markdown link label", () => {
  const raw = 'Before <a>[[target]]</a> after.\n';
  const session = new SourceAuthoritySession(raw);
  const atoms: string[] = [];
  session.state.doc.descendants(node => { if (node.type.name === 'protected_inline') atoms.push(node.attrs.raw); });
  expect(atoms).toEqual(['<a>', '[[target]]', '</a>']);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.setRawSelection(0)).toBe(true);
  expect(session.nativeType('New ')).toBe(true);
  expect(session.currentRaw).toBe('New Before <a>[[target]]</a> after.\n');
});

it("locks BOM-prefixed metadata on normalized parser input while keeping exact raw offsets", () => {
  for (const raw of ['\uFEFF---\r\ntitle: value\r\n---\r\n\r\nBody.\r\n', '\uFEFF+++\r\nx = 1\r\n+++\r\n\r\nBody.\r\n']) {
    const session = new SourceAuthoritySession(raw);
    expect(session.state.doc.firstChild?.type.name).toBe('protected_block');
    expect(session.state.doc.firstChild?.attrs.kind).toBe('front_matter');
    expect(session.state.doc.firstChild?.attrs.raw).toBe(raw.slice(1, raw.indexOf('\r\n\r\n')));
    expect(parse(raw).opaqueSpans[0].sourceStart).toBe(1);
    expect(session.currentRaw).toBe(raw);
    expect(session.saveMemory(), session.diagnostic).toBe(true);
  }
});

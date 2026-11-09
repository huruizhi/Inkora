import { expect, it } from "vitest";
import { SourceAuthoritySession } from "./source-authority";
import { parse } from "./source-document";
import { buildSourceLedger } from "./source-ledger";
import { JSDOM } from "jsdom";
import { createEditorRuntime } from "./editor-runtime";
import { NodeSelection } from "prosemirror-state";
import { deleteSelection } from "prosemirror-commands";

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
  const session = new SourceAuthoritySession("---");
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
  expect(session.currentRaw).toBe("---");
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

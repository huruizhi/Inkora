import { JSDOM } from "jsdom";
import { DOMSerializer } from "prosemirror-model";
import { expect, it } from "vitest";
import examples from "../test/fixtures/commonmark-reference-definitions.json";
import { SourceAuthoritySession } from "./source-authority";
import { schema } from "./source-document";

function semanticTree(node: Node, expectedHTML: boolean): unknown[] {
  const result: unknown[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const value = child.textContent ?? "";
      if (!value.trim() && ["BODY", "DIV", "BLOCKQUOTE", "UL", "OL", "LI"].includes(node.nodeName)) continue;
      result.push(value);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const children = element.tagName === "CODE" && element.parentElement?.tagName === "PRE" && expectedHTML
      ? [element.textContent!.replace(/\n$/, "")]
      : semanticTree(element, expectedHTML);
    // PM containers require a block even when their only reference definition
    // emits no semantic node. Only the sole empty child is a placeholder.
    if (element.tagName === "P" && children.length === 0 &&
        ["BLOCKQUOTE", "LI"].includes(node.nodeName) &&
        (node as Element).children.length === 1) continue;
    result.push({
      tag: element.tagName,
      attrs: Object.fromEntries(["href", "title", "src", "alt"].filter(name => element.hasAttribute(name))
        .map(name => [name, element.getAttribute(name)])),
      children,
    });
  }
  return result;
}

// Example 201 contains raw inline HTML. Inkora's SYN-D004 deliberately keeps
// that span opaque, so test that policy separately from rendered HTML parity.
const renderedExamples = examples.examples.filter(example => example.example !== 201)
  .flatMap(example => [
    { ...example, format: "LF" },
    { ...example, format: "BOM+CRLF", markdown: "\uFEFF" + example.markdown.replace(/\n/g, "\r\n") },
  ]);
it.each(renderedExamples)("matches CommonMark reference definition example $example ($format) without rewriting raw", ({ markdown, html }) => {
  const session = new SourceAuthoritySession(markdown);
  const dom = new JSDOM("<!doctype html><body></body>");
  const expected = new JSDOM(html);
  const actual = dom.window.document.createElement("div");
  actual.append(DOMSerializer.fromSchema(schema).serializeFragment(session.state.doc.content, {
    document: dom.window.document,
  }));
  const expectedTree = semanticTree(expected.window.document.body as unknown as Node, true);
  const actualTree = semanticTree(actual as unknown as Node, false);
  if (expectedTree.length === 0) {
    expect(actualTree).toEqual([{ tag: "P", attrs: {}, children: [] }]);
  } else expect(actualTree).toEqual(expectedTree);
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.currentRaw).toBe(markdown);
  expect(session.saveMemory()).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe(markdown);
});

it("keeps raw HTML in an invalid reference definition opaque under SYN-D004", () => {
  const raw = "[foo]: <bar>(baz)\n\n[foo]\n";
  const session = new SourceAuthoritySession(raw);
  expect(session.state.doc.firstChild?.type.name).toBe("protected_block");
  expect(session.state.doc.firstChild?.attrs.raw).toBe("[foo]: <bar>(baz)");
  expect(session.state.doc.lastChild?.textContent).toBe("[foo]");
  expect(session.state.doc.lastChild?.firstChild?.marks).toEqual([]);
  expect(session.saveEligible).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe(raw);
});

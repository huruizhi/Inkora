import { JSDOM } from "jsdom";
import { DOMSerializer } from "prosemirror-model";
import { expect, it } from "vitest";
import examples from "../test/fixtures/gfm-autolinks.json";
import { SourceAuthoritySession } from "./source-authority";
import { schema } from "./source-document";

it.each(examples.examples)("matches GFM autolink example $example and preserves raw", ({ markdown, html }) => {
  const session = new SourceAuthoritySession(markdown);
  const dom = new JSDOM("<!doctype html><body></body>");
  const expected = new JSDOM(html).window.document.body;
  const actual = dom.window.document.createElement("div");
  actual.append(DOMSerializer.fromSchema(schema).serializeFragment(session.state.doc.content, {
    document: dom.window.document,
  }));
  expect([...actual.children].map(element => element.outerHTML)).toEqual(
    [...expected.children].map(element => element.outerHTML));
  expect(session.saveEligible, session.diagnostic).toBe(true);
  expect(session.saveMemory()).toBe(true);
  expect(session.beginSource()).toBe(true);
  expect(session.applySource()).toBe(true);
  expect(session.currentRaw).toBe(markdown);
});

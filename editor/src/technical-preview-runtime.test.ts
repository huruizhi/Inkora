import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const opened: Array<{ dom: JSDOM; runtime: EditorRuntime }> = [];
afterEach(() => {
  for (const { dom, runtime } of opened.splice(0)) { runtime.destroy(); dom.window.close(); }
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});
function open(raw: string) {
  const dom = new JSDOM("<!doctype html><main></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = document.querySelector("main")!;
  let changes = 0;
  const runtime = createEditorRuntime(parent, raw, () => { changes++; });
  opened.push({ dom, runtime });
  return { dom, parent, runtime, changes: () => changes };
}

describe("production technical previews", () => {
  it("renders math and footnotes while preserving exact raw and a source no-op roundtrip", () => {
    const raw = "\uFEFF# 文档\r\n\r\n正文[^note]。\r\n\r\n$$\r\nE = mc^2\r\n$$\r\n\r\n[^note]: **脚注**内容。\r\n";
    const h = open(raw);
    expect(h.parent.querySelector(".math-preview math msup")).not.toBeNull();
    expect(h.parent.querySelector(".footnote-reference button")?.textContent).toBe("note");
    expect(h.parent.querySelector(".footnote-definition strong")?.textContent).toBe("脚注");
    const status = h.runtime.status;
    expect(status).toMatchObject({ dirty: false, canUndo: false, saveEligible: true });
    expect(h.runtime.snapshotText()).toEqual({ ok: true, value: raw });
    expect(h.changes()).toBe(0);
    expect(h.runtime.enterSourceMode()).toBe(true);
    expect(h.runtime.applySourceDraft()).toBe(true);
    expect(h.runtime.status).toEqual(status);
    expect(h.runtime.snapshotText()).toEqual({ ok: true, value: raw });
  });

  it("keeps invalid TeX and hostile footnote text inert without blocking an accepted document", () => {
    const raw = "正文[^n]\n\n$$\n\\unknownCommand{\n$$\n\n[^n]: <img src=x onerror=alert(1)> [bad](javascript:alert(1))\n";
    const h = open(raw);
    expect(h.parent.querySelector(".technical-preview-error")?.textContent).toContain("原文已保留");
    expect(h.parent.querySelector(".math-preview pre")?.textContent).toBe("$$\n\\unknownCommand{\n$$");
    expect(h.parent.querySelectorAll("img, script, iframe, [onerror], a[href^='javascript:']")).toHaveLength(0);
    expect(h.runtime.status.saveEligible).toBe(true);
    expect(h.runtime.snapshotText()).toEqual({ ok: true, value: raw });
  });

  it("footnote navigation only scrolls the matching preview and waits for composition", async () => {
    const raw = "正文[^n]\n\n[^n]: 内容\n";
    const h = open(raw);
    let scrolled = false;
    const definition = h.parent.querySelector<HTMLElement>(".footnote-definition")!;
    definition.scrollIntoView = () => { scrolled = true; };
    const before = h.runtime.directedSelection;
    const editor = h.parent.querySelector("#editor")!;
    editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
    h.parent.querySelector<HTMLButtonElement>(".footnote-reference button")!.click();
    expect(scrolled).toBe(false);
    editor.dispatchEvent(new h.dom.window.Event("compositionend", { bubbles: true }));
    expect(await h.runtime.whenCompositionStable()).toBe(true);
    h.parent.querySelector<HTMLButtonElement>(".footnote-reference button")!.click();
    expect(scrolled).toBe(true);
    expect(h.runtime.directedSelection).toEqual(before);
    expect(h.runtime.snapshotText()).toEqual({ ok: true, value: raw });
    expect(h.changes()).toBe(0);
  });

  it("rejects Mermaid configuration previews without loading a script or changing raw", async () => {
    const raw = "```mermaid\n%%{init: {securityLevel: 'loose'}}%%\nflowchart LR\nA --> B\n```\n";
    const h = open(raw);
    h.parent.querySelector<HTMLButtonElement>(".mermaid-preview button")!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.parent.querySelector<HTMLElement>(".mermaid-preview")?.dataset.state).toBe("error");
    expect(document.head.querySelector("script")).toBeNull();
    expect(h.runtime.snapshotText()).toEqual({ ok: true, value: raw });
    expect(h.changes()).toBe(0);
  });

  it("cancels queued Mermaid work when the runtime is destroyed", async () => {
    const h = open("```mermaid\nflowchart LR\nA --> B\n```\n");
    h.parent.querySelector<HTMLButtonElement>(".mermaid-preview button")!.click();
    h.runtime.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.head.querySelector("script")).toBeNull();
    expect(h.changes()).toBe(0);
  });
});

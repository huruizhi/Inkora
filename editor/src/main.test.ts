import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeDocument } from "./document-analysis";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

interface SentMessage {
  protocolVersion: number;
  type: string;
  requestID?: string;
  state?: {
    documentID: string;
    revision: number;
    dirty: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
  };
  [key: string]: unknown;
}

interface Harness {
  dom: JSDOM;
  sent: SentMessage[];
  receive(message: Record<string, unknown>): void;
  stateMessages(): SentMessage[];
  lastRevision(): number;
  panel(): HTMLElement;
  panelHeadings(): string[];
  panelStat(term: string): string;
  toggle(): HTMLButtonElement;
  editorHost(): HTMLElement;
  headingButtons(): HTMLButtonElement[];
  findBar(): HTMLElement;
  searchButton(): HTMLButtonElement;
  searchBody(): HTMLElement;
  searchQuery(): HTMLInputElement;
  searchCase(): HTMLInputElement;
  searchClose(): HTMLButtonElement;
  searchResultsText(): string;
  searchMatches(): HTMLElement[];
  typeSearchQuery(value: string): void;
  replacement(): HTMLInputElement;
  replaceSelected(): HTMLButtonElement;
  replaceAll(): HTMLButtonElement;
  sourceMode(): HTMLButtonElement;
  visualMode(): HTMLButtonElement;
  sourceApply(): HTMLButtonElement;
  sourceCancel(): HTMLButtonElement;
  insertTable(): HTMLButtonElement;
  linkEditor(): HTMLFormElement | null;
 }

// prosemirror-view 在 jsdom 下还需要这些全局（MutationObserver、raf、
// getComputedStyle 等）；只设 document/window 会让视图创建静默降级到 source 模式。
const domGlobals = [
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "MutationObserver", "ResizeObserver", "getSelection", "matchMedia",
  "Node", "Element", "HTMLElement", "Text", "DOMParser", "KeyboardEvent",
  "InputEvent", "MouseEvent", "CustomEvent", "FocusEvent", "DragEvent",
  "ClipboardEvent", "DataTransfer",
] as const;
let savedGlobals = new Map<string, unknown>();
const openedDoms: JSDOM[] = [];
const jsdomErrors: unknown[] = [];

async function bootMain(): Promise<Harness> {
  const dom = new JSDOM("<!doctype html><main id='app'></main>", {
    pretendToBeVisual: true,
    url: "https://editor.local/",
  });
  openedDoms.push(dom);
  dom.virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error));
  // jsdom 无布局几何。提供中性矩形让真实 PM 事务走完；这不是滚动验收。
  const rectangle = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  Object.defineProperty(dom.window.Range.prototype, "getClientRects", {
    configurable: true, value: () => [rectangle],
  });
  Object.defineProperty(dom.window.Range.prototype, "getBoundingClientRect", {
    configurable: true, value: () => rectangle,
  });
  dom.window.scrollBy = () => {};
  savedGlobals = new Map();
  for (const key of domGlobals) {
    const value = (dom.window as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    savedGlobals.set(key, (globalThis as unknown as Record<string, unknown>)[key]);
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const sent: SentMessage[] = [];
  (dom.window as unknown as { webkit: unknown }).webkit = {
    messageHandlers: {
      inkora: { postMessage: (serialized: string): void => void sent.push(JSON.parse(serialized)) },
    },
  };
  // 动态导入例外：main.ts 有模块级副作用（查询 #app、注册 window.inkora、
  // 发 ready），每个用例需经 resetModules 取全新实例，静态导入无法满足。
   vi.resetModules();
  await import("./main");
  const receive = (message: Record<string, unknown>): void => {
    dom.window.inkora.receive(JSON.stringify({ protocolVersion: 1, ...message }));
  };
  const stateMessages = (): SentMessage[] => sent.filter((m) => m.type === "stateChanged");
  return {
    dom,
    sent,
    receive,
    stateMessages,
    lastRevision: () => (stateMessages().at(-1)?.state?.revision ?? 0) as number,
    panel: () => {
      const panel = dom.window.document.querySelector<HTMLElement>(".analysis-panel");
      if (!panel) throw new Error("Missing analysis panel");
      return panel;
    },
    panelHeadings: () =>
      Array.from(dom.window.document.querySelectorAll(".analysis-panel-heading")).map(
        (item) => item.textContent,
      ),
    panelStat: (term: string): string => {
      const terms = Array.from(dom.window.document.querySelectorAll(".analysis-panel-stats dt"));
      const index = terms.findIndex((node) => node.textContent === term);
      const values = dom.window.document.querySelectorAll(".analysis-panel-stats dd");
      return values[index]?.textContent ?? "";
    },
    toggle: () => {
      const button = dom.window.document.querySelector<HTMLButtonElement>(
        ".analysis-panel-toggle",
      );
      if (!button) throw new Error("Missing toggle button");
      return button;
    },
    editorHost: () => {
      const host = dom.window.document.querySelector<HTMLElement>(".editor-host");
      if (!host) throw new Error("Missing editor host");
      return host;
    },
    headingButtons: () => Array.from(
      dom.window.document.querySelectorAll<HTMLButtonElement>(".analysis-panel-heading"),
    ),
    findBar: () => {
      const bar = dom.window.document.querySelector<HTMLElement>(".find-bar");
      if (!bar) throw new Error("Missing find bar");
      return bar;
    },
    searchButton: () => {
      const button = dom.window.document.querySelector<HTMLButtonElement>(".search-toggle");
      if (!button) throw new Error("Missing search toggle");
      return button;
    },
    searchBody: () => {
      const body = dom.window.document.querySelector<HTMLElement>("#search-panel-body");
      if (!body) throw new Error("Missing search panel body");
      return body;
    },
    searchQuery: () =>
      dom.window.document.querySelector<HTMLInputElement>(".search-panel-query")!,
    searchCase: () =>
      dom.window.document.querySelector<HTMLInputElement>(".search-panel-case input")!,
    searchClose: () =>
      dom.window.document.querySelector<HTMLButtonElement>(".search-panel-close")!,
    searchResultsText: () =>
      dom.window.document.querySelector(".search-panel-results")?.textContent ?? "",
    searchMatches: () =>
      Array.from(dom.window.document.querySelectorAll<HTMLElement>(".search-panel-match")),
    typeSearchQuery: (value: string) => {
      const input = dom.window.document.querySelector<HTMLInputElement>(".search-panel-query");
      if (!input) throw new Error("Missing search query input");
      input.value = value;
      input.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));
    },
    replacement: () => dom.window.document.querySelector<HTMLInputElement>(".search-panel-replacement")!,
    replaceSelected: () => dom.window.document.querySelector<HTMLButtonElement>(".search-panel-replace-selected")!,
    replaceAll: () => dom.window.document.querySelector<HTMLButtonElement>(".search-panel-replace-all")!,
    sourceMode: () => dom.window.document.querySelector<HTMLButtonElement>(".editor-mode-source")!,
    visualMode: () => dom.window.document.querySelector<HTMLButtonElement>(".editor-mode-visual")!,
    sourceApply: () => dom.window.document.querySelector<HTMLButtonElement>(".source-draft-apply")!,
    sourceCancel: () => dom.window.document.querySelector<HTMLButtonElement>(".source-draft-cancel")!,
    insertTable: () => dom.window.document.querySelector<HTMLButtonElement>(".insert-table")!,
    linkEditor: () => dom.window.document.querySelector<HTMLFormElement>(".link-editor"),
  };
}

// 真实计时器例外：面板调度（jsdom window 上的 setTimeout 0）与 ProseMirror
// DOMObserver 的 requestAnimationFrame 都挂在 jsdom window 上，vi 假计时器
// 无法驱动；集成测试用有界真实等待。Promise.withResolvers 需 es2024 lib
// （仓库 tsconfig 较低且不在本任务允许修改范围），沿用 executor 形式。
const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const frozenVisualSearch = JSON.parse(readFileSync(
  new URL("../../docs/acceptance/visual-search/cases.json", import.meta.url),
  "utf8",
)) as {
  cases: Array<{
    id: number;
    name: string;
    kind: "replace-all" | "no-op" | "reject-partial-grapheme" | "reject-stale-epoch";
    query: string;
    replacement: string;
    safeVisibleMatches: number;
    input: string;
    expected: string;
  }>;
};

function frozenCaseText(path: string): string {
  return readFileSync(new URL(`../../docs/acceptance/visual-search/${path}`, import.meta.url), "utf8");
}

it("可视查找仅计可编辑内容，不计链接目标、标题和代码语言", async () => {
  const h = await bootMain();
  const raw = '[alpha](alpha "alpha") alpha\n\n```alpha\nalpha\n```\n';
  h.receive({
    type: "loadDocument", requestID: "visible-content", documentID: "visible-content",
    revision: 0, text: raw,
  });
  h.searchButton().click();
  const before = h.stateMessages().length;
  h.typeSearchQuery("alpha");
  await settle();
  expect(h.searchMatches()).toHaveLength(3);
  expect(Array.from(h.dom.window.document.querySelectorAll(".search-panel-match mark"), item => item.textContent))
    .toEqual(["alpha", "alpha", "alpha"]);
  expect(h.searchResultsText()).toContain("可编辑内容");
  expect(h.stateMessages()).toHaveLength(before);
  expect(h.editorHost().querySelector(".ProseMirror")).not.toBeNull();
  h.sourceMode().click();
  await settle();
  expect(h.searchMatches()).toHaveLength(6);
  h.visualMode().click();
  await settle();
  expect(h.searchMatches()).toHaveLength(3);
  expect(h.stateMessages()).toHaveLength(before);
});

it("可视查找按位置定位第二个同文结果，保留查询焦点与正文历史", async () => {
  const h = await bootMain();
  const raw = "[alpha](target) alpha\n";
  h.receive({ type: "loadDocument", requestID: "visible-navigation", documentID: "visible-nav", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  h.searchQuery().focus();
  const messages = h.sent.length;
  const buttons = h.dom.window.document.querySelectorAll<HTMLButtonElement>(".search-panel-match-button");
  expect(buttons).toHaveLength(2);
  const pointer = new h.dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  buttons[1].dispatchEvent(pointer);
  expect(pointer.defaultPrevented).toBe(true);
  buttons[1].click();
  expect(h.dom.window.document.activeElement).toBe(h.searchQuery());
  expect(h.sent).toHaveLength(messages);
  h.sourceMode().click();
  const source = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
  expect(source.selectionStart).toBe(raw.lastIndexOf("alpha"));
  expect(source.selectionEnd).toBe(raw.lastIndexOf("alpha") + 5);
  expect(h.sent).toHaveLength(messages);
});

it("可视全部替换超过显示上限仍完整提交且只需一次Undo", async () => {
  const h = await bootMain();
  const raw = "\uFEFF" + Array.from({length:140}, () => "alpha").join(" ") + "\r\n";
  const expected = "\uFEFF" + Array.from({length:140}, () => "beta").join(" ") + "\r\n";
  h.receive({type:"loadDocument",requestID:"visible-all-load",documentID:"visible-all",revision:0,text:raw});
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  expect(h.searchMatches()).toHaveLength(100);
  const replacement = h.replacement();
  expect(replacement).not.toBeNull();
  replacement.value = "beta";
  replacement.dispatchEvent(new h.dom.window.Event("input", {bubbles:true}));
  const before = h.stateMessages().length;
  expect(h.replaceAll().disabled).toBe(false);
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before+1);
  h.receive({type:"createSnapshot",requestID:"visible-all-snapshot",documentID:"visible-all",revision:h.lastRevision()});
  expect(h.sent.at(-1)).toMatchObject({type:"snapshotReady",text:expected});
  // Document history is intentionally isolated while query/replacement has focus.
  h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
  h.receive({type:"executeCommand",requestID:"visible-all-undo",documentID:"visible-all",revision:h.lastRevision(),command:"undo"});
  h.receive({type:"createSnapshot",requestID:"visible-all-after-undo",documentID:"visible-all",revision:h.lastRevision()});
  expect(h.sent.at(-1)).toMatchObject({type:"snapshotReady",text:raw});
  h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
  h.receive({type:"executeCommand",requestID:"visible-all-redo",documentID:"visible-all",revision:h.lastRevision(),command:"redo"});
  h.receive({type:"createSnapshot",requestID:"visible-all-after-redo",documentID:"visible-all",revision:h.lastRevision()});
  expect(h.sent.at(-1)).toMatchObject({type:"snapshotReady",text:expected});
});

it("源码全部替换超过显示上限时重新完整搜索并一次提交", async () => {
  const h = await bootMain();
  const raw = `<x>${Array.from({ length: 140 }, () => "alpha").join(" ")}</x>\r\n`;
  const expected = `<x>${Array.from({ length: 140 }, () => "beta").join(" ")}</x>\r\n`;
  h.receive({ type: "loadDocument", requestID: "source-all-load", documentID: "source-all", revision: 0, text: raw });
  h.sourceMode().click();
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  expect(h.searchMatches()).toHaveLength(100);
  expect(h.searchResultsText()).toContain("重新校验完整结果");
  h.replacement().value = "beta";
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  expect(h.replaceAll().disabled).toBe(false);
  const before = h.stateMessages().length;
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before + 1);
  h.receive({ type: "createSnapshot", requestID: "source-all-snapshot", documentID: "source-all", revision: 1 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: expected });
  h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!.focus();
  h.receive({ type: "executeCommand", requestID: "source-all-undo", documentID: "source-all", revision: 1, command: "undo" });
  h.receive({ type: "createSnapshot", requestID: "source-all-undo-snapshot", documentID: "source-all", revision: 2 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw });
});

it("源码完整搜索达到硬上限时整批拒绝并保留替换意图", async () => {
  const h = await bootMain();
  const raw = `<x>${Array.from({ length: 10_001 }, () => "alpha").join(" ")}</x>\n`;
  h.receive({ type: "loadDocument", requestID: "source-cap-load", documentID: "source-cap", revision: 0, text: raw });
  h.sourceMode().click();
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  h.replacement().value = "beta";
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  const before = h.stateMessages().length;
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before);
  expect(h.dom.window.document.querySelector(".search-panel-status")?.textContent).toContain("安全上限");
  expect(h.searchQuery().value).toBe("alpha");
  expect(h.replacement().value).toBe("beta");
  h.receive({ type: "createSnapshot", requestID: "source-cap-snapshot", documentID: "source-cap", revision: 0 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw });
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 0, dirty: false, canUndo: false });
});

it("可视单个替换经结果选择只改目标并把源码 caret 放在插入末尾", async () => {
  const h = await bootMain();
  const raw = "alpha alpha\n";
  h.receive({ type: "loadDocument", requestID: "visual-one-load", documentID: "visual-one", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  h.dom.window.document.querySelectorAll<HTMLButtonElement>(".search-panel-match-button")[1]!.click();
  h.replacement().value = "beta";
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  h.replacement().focus();
  const before = h.stateMessages().length;
  h.replaceSelected().click();
  expect(h.stateMessages()).toHaveLength(before + 1);
  expect(h.lastRevision()).toBe(1);
  expect(h.dom.window.document.activeElement).toBe(h.replacement());
  h.sourceMode().click();
  const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
  expect(area.value).toBe("alpha beta\n");
  expect([area.selectionStart, area.selectionEnd]).toEqual([10, 10]);
});

it("可视替换在 replacement/body composition 期间保留候选且不消费 Enter/Esc", async () => {
  const h = await bootMain();
  const raw = "alpha alpha\n";
  h.receive({ type: "loadDocument", requestID: "visual-ime-load", documentID: "visual-ime", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery("alpha");
  await settle();
  const replacement = h.replacement();
  replacement.focus();
  replacement.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart", { bubbles: true }));
  replacement.value = "zhong";
  replacement.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
  const before = h.stateMessages().length;
  const enter = new h.dom.window.KeyboardEvent("keydown", {
    key: "Enter", bubbles: true, cancelable: true, isComposing: true,
  });
  const escape = new h.dom.window.KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true, isComposing: true,
  });
  replacement.dispatchEvent(enter);
  replacement.dispatchEvent(escape);
  h.replaceAll().click();
  expect(enter.defaultPrevented).toBe(false);
  expect(escape.defaultPrevented).toBe(false);
  expect(replacement.value).toBe("zhong");
  expect(h.stateMessages()).toHaveLength(before);

  replacement.value = "beta";
  replacement.dispatchEvent(new h.dom.window.CompositionEvent("compositionend", { bubbles: true }));
  const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  editor.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart", { bubbles: true }));
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before);
  editor.dispatchEvent(new h.dom.window.CompositionEvent("compositionend", { bubbles: true }));
  await settle();
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before + 1);
  h.receive({ type: "createSnapshot", requestID: "visual-ime-snapshot", documentID: "visual-ime", revision: 1 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: "beta beta\n" });
});

it.each(frozenVisualSearch.cases.filter(item => item.kind === "replace-all"))(
  "冻结可视替换 $id: $name 经真实面板一次发布并可 Undo/Redo",
  async fixture => {
    const h = await bootMain();
    const raw = frozenCaseText(fixture.input);
    const expected = frozenCaseText(fixture.expected);
    const documentID = `frozen-${fixture.id}`;
    h.receive({ type: "loadDocument", requestID: `load-${fixture.id}`, documentID, revision: 0, text: raw });
    h.searchButton().click();
    h.typeSearchQuery(fixture.query);
    await settle();

    expect(h.searchMatches()).toHaveLength(Math.min(fixture.safeVisibleMatches, 100));
    expect(h.searchResultsText()).toContain("可编辑内容");
    h.replacement().value = fixture.replacement;
    h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
    h.replacement().focus();
    const before = h.stateMessages().length;
    expect(h.replaceAll().disabled).toBe(false);
    h.replaceAll().click();
    expect(h.stateMessages()).toHaveLength(before + 1);
    expect(h.lastRevision()).toBe(1);
    expect(h.dom.window.document.activeElement).toBe(h.replacement());

    h.receive({
      type: "createSnapshot", requestID: `snapshot-${fixture.id}`,
      documentID, revision: h.lastRevision(),
    });
    expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: expected });
    expect(h.stateMessages().at(-1)?.state).toMatchObject({ dirty: true, canUndo: true, canRedo: false });

    h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
    h.receive({
      type: "executeCommand", requestID: `undo-${fixture.id}`,
      documentID, revision: h.lastRevision(), command: "undo",
    });
    h.receive({
      type: "createSnapshot", requestID: `undo-snapshot-${fixture.id}`,
      documentID, revision: h.lastRevision(),
    });
    expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw });

    h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
    h.receive({
      type: "executeCommand", requestID: `redo-${fixture.id}`,
      documentID, revision: h.lastRevision(), command: "redo",
    });
    h.receive({
      type: "createSnapshot", requestID: `redo-snapshot-${fixture.id}`,
      documentID, revision: h.lastRevision(),
    });
    expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: expected });
  },
);

it("冻结可视替换 12: no-op 保留 future、保存点和替换意图", async () => {
  const fixture = frozenVisualSearch.cases.find(item => item.id === 12)!;
  const h = await bootMain();
  const raw = frozenCaseText(fixture.input);
  h.receive({ type: "loadDocument", requestID: "noop-load", documentID: "noop", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery(fixture.query);
  await settle();
  h.replacement().value = "beta";
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  h.replaceAll().click();
  await settle();
  h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
  h.receive({ type: "executeCommand", requestID: "noop-undo", documentID: "noop", revision: 1, command: "undo" });
  await settle();
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 2, dirty: false, canRedo: true });

  h.replacement().value = fixture.replacement;
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  h.replacement().focus();
  const before = h.stateMessages().length;
  h.replaceAll().click();
  expect(h.stateMessages()).toHaveLength(before);
  expect(h.lastRevision()).toBe(2);
  expect(h.dom.window.document.querySelector(".search-panel-status")?.textContent).toContain("未产生更改");
  expect(h.replacement().value).toBe(fixture.replacement);
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ dirty: false, canRedo: true });

  h.editorHost().querySelector<HTMLElement>("#editor")!.focus();
  h.receive({ type: "executeCommand", requestID: "noop-redo", documentID: "noop", revision: 2, command: "redo" });
  h.receive({ type: "createSnapshot", requestID: "noop-snapshot", documentID: "noop", revision: 3 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw.replace("alpha", "beta") });
});

it("冻结可视替换 13: 部分 ZWJ 查询在真实面板不可替换", async () => {
  const fixture = frozenVisualSearch.cases.find(item => item.id === 13)!;
  const h = await bootMain();
  const raw = frozenCaseText(fixture.input);
  h.receive({ type: "loadDocument", requestID: "zwj-load", documentID: "zwj", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery(fixture.query);
  await settle();
  expect(h.searchMatches()).toHaveLength(0);
  expect(h.replaceAll().disabled).toBe(true);
  expect(h.searchResultsText()).toContain("0 处匹配");
  h.receive({ type: "createSnapshot", requestID: "zwj-snapshot", documentID: "zwj", revision: 0 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw });
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 0, dirty: false, canUndo: false });
});

it("冻结可视替换 14: 同身份新 load 后旧结果按钮按 epoch 拒绝", async () => {
  const fixture = frozenVisualSearch.cases.find(item => item.id === 14)!;
  const h = await bootMain();
  const raw = frozenCaseText(fixture.input);
  h.receive({ type: "loadDocument", requestID: "epoch-load-1", documentID: "epoch", revision: 0, text: raw });
  h.searchButton().click();
  h.typeSearchQuery(fixture.query);
  await settle();
  h.replacement().value = fixture.replacement;
  h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
  const staleResult = h.dom.window.document.querySelector<HTMLButtonElement>(".search-panel-match-button")!;
  const staleReplace = h.replaceAll();

  h.receive({ type: "loadDocument", requestID: "epoch-load-2", documentID: "epoch", revision: 0, text: raw });
  await settle();
  const before = h.stateMessages().length;
  staleReplace.click();
  expect(h.dom.window.document.querySelector(".search-panel-status")?.textContent).toContain("尚未就绪");
  staleResult.click();
  expect(h.stateMessages()).toHaveLength(before);
  expect(h.searchResultsText()).toContain("输入查询");
  expect(h.dom.window.document.querySelector(".search-panel-replacement")).toBeNull();
  h.receive({ type: "createSnapshot", requestID: "epoch-snapshot", documentID: "epoch", revision: 0 });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: raw });
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 0, dirty: false, canUndo: false });
});

function openLinkEditorAtCaret(h: Harness, offset = 1): HTMLFormElement {
  const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  const label = editor.querySelector("a")!.firstChild!;
  const range = h.dom.window.document.createRange();
  range.setStart(label, offset);
  range.collapse(true);
  h.dom.window.getSelection()!.removeAllRanges();
  h.dom.window.getSelection()!.addRange(range);
  h.dom.window.document.dispatchEvent(new h.dom.window.Event("selectionchange"));
  editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }));
  const form = h.linkEditor();
  if (!form) throw new Error("Expected link editor");
  return form;
}

async function rootLinkHarness(
  withHistory = false,
  text = "[alpha](./old)\n\nbody\n",
): Promise<Harness> {
  const h = await bootMain();
  h.receive({ type: "loadDocument", requestID: "root-link-load", documentID: "root-link", revision: 0,
    text });
  if (withHistory) {
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    area.value = text.replace(/\n$/, "!\n");
    area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    h.sourceApply().click();
    h.visualMode().click();
  }
  await settle();
  openLinkEditorAtCaret(h);
  return h;
}

it("root062: link action pointerdown keeps an active candidate field focused", async () => {
  const h = await rootLinkHarness();
  const form = h.linkEditor()!;
  const href = form.querySelector<HTMLInputElement>(".link-editor-href")!;
  href.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart", {bubbles:true}));
  href.value = "zhong";
  const cancel = form.querySelector<HTMLButtonElement>(".link-editor-cancel")!;
  const pointer = new h.dom.window.MouseEvent("pointerdown", {bubbles:true,cancelable:true});
  cancel.dispatchEvent(pointer);
  expect(pointer.defaultPrevented).toBe(true);
  expect(form.isConnected).toBe(true);
  expect(h.dom.window.document.activeElement).toBe(href);
  expect(href.value).toBe("zhong");
});

it("root062: link submit blocks form navigation without consuming an IME Enter key", async () => {
  const h = await rootLinkHarness();
  const form = h.linkEditor()!;
  const href = form.querySelector<HTMLInputElement>(".link-editor-href")!;
  href.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart", {bubbles:true}));
  const before = h.sent.length;
  const enter = new h.dom.window.KeyboardEvent("keydown", {key:"Enter",isComposing:true,bubbles:true,cancelable:true});
  href.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  const submit = new h.dom.window.Event("submit", {bubbles:true,cancelable:true});
  form.dispatchEvent(submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(form.isConnected).toBe(true);
  expect(h.sent).toHaveLength(before);
});

it("root061: caret inside a link edits its existing target", async () => {
  const h = await rootLinkHarness();
  const form = h.linkEditor()!;
  const href = form.querySelector<HTMLInputElement>(".link-editor-href")!;
  expect(href.value).toBe("./old");
  href.value = "./new";
  form.dispatchEvent(new h.dom.window.Event("submit", {bubbles:true,cancelable:true}));
  h.receive({type:"createSnapshot",requestID:"root-link-snapshot",documentID:"root-link",revision:h.lastRevision()});
  expect(h.sent.at(-1)).toMatchObject({type:"snapshotReady",text:"[alpha](./new)\n\nbody\n"});
});

it("root061: link input composition keeps the form and candidate on Cancel", async () => {
  const h = await rootLinkHarness();
  const form = h.linkEditor()!;
  const href = form.querySelector<HTMLInputElement>(".link-editor-href")!;
  href.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart",{bubbles:true}));
  href.value = "zhong";
  href.dispatchEvent(new h.dom.window.InputEvent("input",{bubbles:true,isComposing:true}));
  const before = h.sent.length;
  form.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();
  expect(form.isConnected).toBe(true);
  expect(h.dom.window.document.activeElement).toBe(href);
  expect(href.value).toBe("zhong");
  expect(h.sent).toHaveLength(before);
});

it("链接输入 composition 守卫表单动作、外部导航与跨 load 候选", async () => {
  const h = await rootLinkHarness(false, "# [alpha](./old)\n\nbody\n");
  const form = h.linkEditor()!;
  const title = form.querySelector<HTMLInputElement>(".link-editor-title")!;
  title.focus();
  title.dispatchEvent(new h.dom.window.CompositionEvent("compositionstart", { bubbles: true }));
  title.value = "zhong";
  title.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
  const revision = h.lastRevision();
  const messages = h.stateMessages().length;

  // submit 取消的是表单导航；下方键盘 Esc 的输入法默认行为仍保留。
  expect(form.dispatchEvent(new h.dom.window.Event("submit", {
    bubbles: true, cancelable: true,
  }))).toBe(false);
  form.querySelector<HTMLButtonElement>(".link-editor-remove")!.click();
  form.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();
  expect(form.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "Escape", isComposing: true, bubbles: true, cancelable: true,
  }))).toBe(true);
  h.sourceMode().click();
  h.searchButton().click();
  h.headingButtons()[0]!.click();

  expect(form.isConnected).toBe(true);
  expect(h.dom.window.document.activeElement).toBe(title);
  expect(title.value).toBe("zhong");
  expect(h.editorHost().querySelector(".ProseMirror")).not.toBeNull();
  expect(h.findBar().classList.contains("is-open")).toBe(false);
  expect(h.stateMessages()).toHaveLength(messages);
  expect(h.lastRevision()).toBe(revision);

  h.receive({
    type: "loadDocument", requestID: "root-link-next", documentID: "root-link-next", revision: 0,
    text: "next\n",
  });
  expect(form.isConnected).toBe(true);
  expect(h.dom.window.document.activeElement).toBe(title);
  expect(title.value).toBe("zhong");
  title.dispatchEvent(new h.dom.window.CompositionEvent("compositionend", { bubbles: true }));
  expect(form.isConnected).toBe(false);
  form.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(form.querySelector(".link-editor-status")?.textContent).toContain("过期");
  h.receive({
    type: "createSnapshot", requestID: "root-link-next-snapshot",
    documentID: "root-link-next", revision: 0,
  });
  expect(h.sent.at(-1)).toMatchObject({ type: "snapshotReady", text: "next\n" });
});

it("root061: Native document Undo is refused while a link field holds focus", async () => {
  const h = await rootLinkHarness(true);
  const revision = h.lastRevision();
  const messages = h.stateMessages().length;
  h.receive({type:"executeCommand",requestID:"root-link-undo",documentID:"root-link",revision,command:"undo"});
  expect(h.sent.at(-1)).toMatchObject({type:"editorError",code:"command_rejected"});
  expect(h.stateMessages()).toHaveLength(messages);
  expect(h.lastRevision()).toBe(revision);
});

it("链接取消和 no-op 不清除 future，回正文后 Native Redo 仍可用", async () => {
  const h = await rootLinkHarness(true);
  h.linkEditor()!.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();
  h.receive({
    type: "executeCommand", requestID: "root-link-future-undo", documentID: "root-link",
    revision: h.lastRevision(), command: "undo",
  });
  expect(h.stateMessages().at(-1)?.state?.canRedo).toBe(true);

  let form = openLinkEditorAtCaret(h);
  const afterUndoMessages = h.stateMessages().length;
  form.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();
  expect(h.stateMessages()).toHaveLength(afterUndoMessages);
  expect(h.stateMessages().at(-1)?.state?.canRedo).toBe(true);

  form = openLinkEditorAtCaret(h);
  form.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(h.stateMessages()).toHaveLength(afterUndoMessages);
  expect(h.stateMessages().at(-1)?.state?.canRedo).toBe(true);
  h.receive({
    type: "executeCommand", requestID: "root-link-future-redo", documentID: "root-link",
    revision: h.lastRevision(), command: "redo",
  });
  expect(h.sent.at(-1)).toMatchObject({ type: "stateChanged", state: { canRedo: false } });
});

it("root061: flag-only composing document Cmd-Z does not consume the key", async () => {
  const h = await rootLinkHarness(true);
  h.linkEditor()!.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();
  const revision = h.lastRevision();
  const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  const event = new h.dom.window.KeyboardEvent("keydown",{key:"z",metaKey:true,isComposing:true,bubbles:true,cancelable:true});
  editor.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(h.lastRevision()).toBe(revision);
});

it("提供键盘可达的可视/源码切换和草稿提交取消入口", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-mode", documentID: "doc-mode", revision: 0,
    text: "# 标题\n\n正文\n",
  });
  await settle();
  expect(h.sourceMode().type).toBe("button");
  expect(h.sourceMode().getAttribute("aria-pressed")).toBe("false");
  h.sourceMode().click();
  expect(h.editorHost().querySelector("textarea#editor")).not.toBeNull();
  expect(h.sourceMode().getAttribute("aria-pressed")).toBe("true");
  expect(h.sourceApply().disabled).toBe(true);
  const draft = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
  draft.value = "# 标题\n\n源码修改\n";
  draft.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
  expect(h.sourceApply().disabled).toBe(false);
  h.sourceCancel().click();
  expect(h.editorHost().querySelector(".ProseMirror")).not.toBeNull();
  expect(h.visualMode().getAttribute("aria-pressed")).toBe("true");
  expect(h.stateMessages()).toHaveLength(1);
});

it("生产 main 工具栏新建两列表格并通过正式 Bridge 快照", async () => {
  const h = await bootMain();
  const expected = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";
  h.receive({
    type: "loadDocument", requestID: "load-table", documentID: "doc-table", revision: 0,
    text: "",
  });
  expect(h.insertTable().type).toBe("button");

  h.insertTable().click();

  expect(h.editorHost().querySelectorAll("table th")).toHaveLength(2);
  expect(h.editorHost().querySelectorAll("table td")).toHaveLength(2);
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 1, dirty: true });
  h.receive({
    type: "createSnapshot", requestID: "snapshot-table", documentID: "doc-table", revision: 1,
  });
  expect(h.sent.find((message) => message.type === "snapshotReady" &&
    message.requestID === "snapshot-table")).toMatchObject({ text: expected, revision: 1 });
});

it("生产 main 任务 checkbox 通过 Bridge 发布单字符切换与历史", async () => {
  const h = await bootMain();
  const input = "- [ ] 中文任务\r\n- [X] 保持\r\n";
  const expected = input.replace("[ ] 中文", "[x] 中文");
  h.receive({
    type: "loadDocument", requestID: "load-task", documentID: "doc-task", revision: 0,
    text: input,
  });
  const checkbox = h.editorHost().querySelector<HTMLInputElement>('input[type="checkbox"]')!;

  checkbox.click();

  expect(h.stateMessages().at(-1)?.state).toMatchObject({ revision: 1, dirty: true });
  h.receive({
    type: "createSnapshot", requestID: "snapshot-task", documentID: "doc-task", revision: 1,
  });
  expect(h.sent.find((message) => message.type === "snapshotReady" &&
    message.requestID === "snapshot-task")).toMatchObject({ text: expected });
  h.receive({
    type: "executeCommand", requestID: "undo-task", documentID: "doc-task",
    revision: 1, command: "undo",
  });
  h.receive({
    type: "createSnapshot", requestID: "snapshot-task-undo", documentID: "doc-task", revision: 2,
  });
  expect(h.sent.find((message) => message.type === "snapshotReady" &&
    message.requestID === "snapshot-task-undo")).toMatchObject({ text: input });
});

it("Mod-K 通过生产 DOM 入口创建链接，取消不改变文档", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-link", documentID: "doc-link", revision: 0,
    text: "正文\n",
  });
  await settle();
  const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  const paragraphText = editor.querySelector("p")!.firstChild!;
  const range = h.dom.window.document.createRange();
  range.setStart(paragraphText, 0);
  range.setEnd(paragraphText, 2);
  const selection = h.dom.window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  h.dom.window.document.dispatchEvent(new h.dom.window.Event("selectionchange"));

  const shortcut = new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  });
  expect(editor.dispatchEvent(shortcut)).toBe(false);
  const form = h.linkEditor();
  expect(form).not.toBeNull();
  const href = form!.querySelector<HTMLInputElement>(".link-editor-href")!;
  expect(h.dom.window.document.activeElement).toBe(href);
  expect(form!.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true,
  }))).toBe(false);
  expect(h.linkEditor()).toBeNull();
  expect(h.lastRevision()).toBe(0);

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const createForm = h.linkEditor()!;
  createForm.querySelector<HTMLInputElement>(".link-editor-href")!.value = "./target";
  createForm.querySelector<HTMLInputElement>(".link-editor-title")!.value = "标题";
  createForm.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  h.receive({
    type: "createSnapshot", requestID: "snapshot-link", documentID: "doc-link", revision: 1,
  });
  expect(h.sent.at(-1)).toMatchObject({
    type: "snapshotReady", requestID: "snapshot-link", text: '[正文](./target "标题")\n',
  });

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const noOpForm = h.linkEditor()!;
  expect(noOpForm.querySelector<HTMLInputElement>(".link-editor-href")!.value).toBe("./target");
  expect(noOpForm.querySelector<HTMLInputElement>(".link-editor-title")!.value).toBe("标题");
  noOpForm.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(h.lastRevision()).toBe(1);

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const editForm = h.linkEditor()!;
  editForm.querySelector<HTMLInputElement>(".link-editor-href")!.value = "./edited";
  editForm.querySelector<HTMLInputElement>(".link-editor-title")!.value = "";
  editForm.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(editForm.querySelector(".link-editor-status")?.textContent).toBe("");
  expect(h.linkEditor()).toBeNull();
  expect(h.lastRevision()).toBe(2);

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const removeForm = h.linkEditor()!;
  removeForm.querySelector<HTMLButtonElement>(".link-editor-remove")!.click();
  expect(h.lastRevision()).toBe(3);
  h.receive({
    type: "createSnapshot", requestID: "snapshot-unlinked", documentID: "doc-link", revision: 3,
  });
  expect(h.sent.at(-1)).toMatchObject({
    type: "snapshotReady", requestID: "snapshot-unlinked", text: "正文\n",
  });

  let activeEditor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  expect(activeEditor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "z", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  expect(h.lastRevision()).toBe(4);
  h.receive({
    type: "createSnapshot", requestID: "snapshot-link-undo", documentID: "doc-link", revision: 4,
  });
  expect(h.sent.at(-1)).toMatchObject({
    type: "snapshotReady", requestID: "snapshot-link-undo", text: "[正文](./edited)\n",
  });
  activeEditor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  expect(activeEditor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "z", metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  expect(h.lastRevision()).toBe(5);
  h.receive({
    type: "createSnapshot", requestID: "snapshot-link-redo", documentID: "doc-link", revision: 5,
  });
  expect(h.sent.at(-1)).toMatchObject({
    type: "snapshotReady", requestID: "snapshot-link-redo", text: "正文\n",
  });
});

it("链接表单拒绝 composition、危险 href 与跨 load 的旧快照", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-link-a", documentID: "link-a", revision: 0,
    text: "alpha\n",
  });
  await settle();
  const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
  editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(true);
  expect(h.linkEditor()).toBeNull();
  editor.dispatchEvent(new h.dom.window.Event("compositionend", { bubbles: true }));
  await settle();

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const unsafe = h.linkEditor()!;
  unsafe.querySelector<HTMLInputElement>(".link-editor-href")!.value = "bad target";
  unsafe.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(unsafe.querySelector(".link-editor-status")?.textContent).toContain("safe Markdown");
  expect(h.lastRevision()).toBe(0);
  expect(h.stateMessages().at(-1)?.state).toMatchObject({ dirty: false, canUndo: false });
  unsafe.querySelector<HTMLButtonElement>(".link-editor-cancel")!.click();

  expect(editor.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
    key: "k", metaKey: true, bubbles: true, cancelable: true,
  }))).toBe(false);
  const stale = h.linkEditor()!;
  stale.querySelector<HTMLInputElement>(".link-editor-href")!.value = "./stale";
  h.receive({
    type: "loadDocument", requestID: "load-link-b", documentID: "link-b", revision: 0,
    text: "bravo\n",
  });
  await settle();
  expect(h.linkEditor()).toBeNull();
  stale.dispatchEvent(new h.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(stale.querySelector(".link-editor-status")?.textContent).toContain("过期");
  h.receive({
    type: "createSnapshot", requestID: "snapshot-link-b", documentID: "link-b", revision: 0,
  });
  expect(h.sent.at(-1)).toMatchObject({
    type: "snapshotReady", requestID: "snapshot-link-b", text: "bravo\n",
  });
});

it("拒绝错误文档的保存回执且不污染 dirty 保存基线", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-receipt", documentID: "doc-receipt",
    revision: 0, text: "a\n",
  });
  h.sourceMode().click();
  const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
  area.value = "ab\n";
  area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
  h.sourceApply().click();
  expect(h.stateMessages().at(-1)?.state?.dirty).toBe(true);

  h.receive({
    type: "markSaved", requestID: "wrong-receipt", documentID: "wrong-document",
    revision: h.lastRevision(), text: "ab\n",
  });
  expect(h.sent.at(-1)?.type).toBe("editorError");
  expect(h.sent.at(-1)?.code).toBe("stale_revision");

  area.focus();
  h.receive({
    type: "executeCommand", requestID: "undo-after-wrong", documentID: "doc-receipt",
    revision: h.lastRevision(), command: "undo",
  });
  h.receive({
    type: "executeCommand", requestID: "redo-after-wrong", documentID: "doc-receipt",
    revision: h.lastRevision(), command: "redo",
  });
  expect(h.stateMessages().at(-1)?.state?.dirty).toBe(true);
});

it("未知容器与正文混排时保留可视投影并阻断快照", () => {
  const hPromise = bootMain();
  return hPromise.then((h) => {
    h.receive({
      type: "loadDocument", requestID: "load-container", documentID: "doc-container",
      revision: 0, text: "正文\n\n::: note\n未知内容\n:::\n\n尾段\n",
    });
    expect(h.editorHost().querySelector(".ProseMirror")).not.toBeNull();
    expect(h.editorHost().querySelector("textarea#editor")).toBeNull();
    expect(h.editorHost().textContent).toContain("正文");
    expect(h.editorHost().textContent).toContain("尾段");
    h.receive({
      type: "createSnapshot", requestID: "snapshot-container", documentID: "doc-container",
      revision: 0,
    });
    expect(h.sent.at(-1)?.type).toBe("editorError");
    expect(h.sent.at(-1)?.code).toBe("editor_not_ready");
  });
});

it("synthetic PM composition 只发布一次 Bridge revision 且快照读取最终原文", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-ime", documentID: "doc-ime",
    revision: 0, text: "a\n",
  });
  const editor = h.editorHost().querySelector<HTMLElement>(".ProseMirror")!;
  const paragraph = editor.querySelector("p")!;
  const text = paragraph.firstChild as Text;
  editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
  text.data = "a中文";
  editor.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
  editor.dispatchEvent(new h.dom.window.Event("compositionend", { bubbles: true }));
  await settle(150);

  expect(h.stateMessages().filter(message => message.requestID === undefined)).toHaveLength(1);
  expect(h.lastRevision()).toBe(1);
  h.receive({
    type: "createSnapshot", requestID: "snapshot-ime", documentID: "doc-ime",
    revision: 1,
  });
  expect(h.sent.find(message => message.type === "snapshotReady" &&
    message.requestID === "snapshot-ime")).toMatchObject({
      revision: 1,
      text: "a中文\n",
    });
});

it("compositionend 后排空 PM final 再唯一发布、快照与面板", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-late-ime", documentID: "doc-late-ime",
    revision: 0, text: "a\n",
  });
  h.searchButton().click();
  h.typeSearchQuery("中文");
  await settle();
  expect(h.searchResultsText()).toContain("0 处匹配");

  const editor = h.editorHost().querySelector<HTMLElement>(".ProseMirror")!;
  const text = editor.querySelector("p")!.firstChild as Text;
  editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
  text.data = "azh";
  editor.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
  // 最终候选先落 DOM，但交给 prosemirror-view 在 compositionend 后的
  // observer 排空；此时发起 snapshot，不能同步读到中间拼音。
  text.data = "a中文";
  editor.dispatchEvent(new h.dom.window.Event("compositionend", { bubbles: true }));
  h.receive({
    type: "createSnapshot", requestID: "snapshot-late-ime", documentID: "doc-late-ime",
    revision: 0,
  });
  expect(h.sent.some(message => message.type === "snapshotReady" &&
    message.requestID === "snapshot-late-ime")).toBe(false);

  await settle(120);
  expect(h.stateMessages().filter(message => message.requestID === undefined)).toHaveLength(1);
  expect(h.lastRevision()).toBe(1);
  expect(h.sent.find(message => message.type === "snapshotReady" &&
    message.requestID === "snapshot-late-ime")).toMatchObject({
      revision: 1,
      text: "a中文\n",
    });
  expect(h.panelStat("字数")).toBe(expectedStats("a中文\n").writingUnits);
  expect(h.searchResultsText()).toContain("1 处匹配");

  h.receive({
    type: "markSaved", requestID: "old-ime-receipt", documentID: "doc-late-ime",
    revision: 0, text: "a\n",
  });
  expect(h.stateMessages().at(-1)?.state?.dirty).toBe(true);
  h.receive({
    type: "createSnapshot", requestID: "snapshot-after-old-receipt",
    documentID: "doc-late-ime", revision: 1,
  });
  expect(h.sent.find(message => message.type === "snapshotReady" &&
    message.requestID === "snapshot-after-old-receipt")).toMatchObject({
      revision: 1,
      text: "a中文\n",
    });
});

it("composition drain 跨 load 作废旧快照且不覆盖新文档", async () => {
  const h = await bootMain();
  h.receive({
    type: "loadDocument", requestID: "load-drain-a", documentID: "drain-a",
    revision: 0, text: "A\n",
  });
  const editor = h.editorHost().querySelector<HTMLElement>(".ProseMirror")!;
  editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
  h.receive({
    type: "createSnapshot", requestID: "snapshot-drain-a", documentID: "drain-a",
    revision: 0,
  });
  h.receive({
    type: "loadDocument", requestID: "load-drain-b", documentID: "drain-b",
    revision: 0, text: "B\n",
  });
  await settle();

  expect(h.sent.some(message => message.type === "snapshotReady" &&
    message.requestID === "snapshot-drain-a")).toBe(false);
  expect(h.sent.find(message => message.type === "editorError" &&
    message.requestID === "snapshot-drain-a")).toMatchObject({
      code: "editor_not_ready",
      action: "retry",
    });
  expect(h.stateMessages().at(-1)?.state?.documentID).toBe("drain-b");
  expect(h.editorHost().textContent).toContain("B");
  expect(h.editorHost().textContent).not.toContain("A");
});

function expectedStats(raw: string): { characters: string; writingUnits: string } {
  const analysis = analyzeDocument({ raw, revision: 0 });
  return {
    characters: String(analysis.content.characters),
    writingUnits: String(analysis.content.writingUnits),
  };
}

afterEach(() => {
  for (const dom of openedDoms.splice(0)) dom.window.close();
  for (const [key, value] of savedGlobals) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  vi.resetModules();
  const errors = jsdomErrors.splice(0);
  expect(errors).toEqual([]);
});

describe("main：真实 main/Bridge/runtime 面板集成", () => {
  it("草稿与含混原文拒绝快照，取消或源码修复后可恢复保存", async () => {
    const h = await bootMain();
    const original = "# 标题\n\n正文\n";
    h.receive({
      type: "loadDocument", requestID: "load-draft", documentID: "draft", revision: 0,
      text: original,
    });
    await settle();
    h.sourceMode().click();
    const draft = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    draft.value = "# 标题\n\n未提交草稿\n";
    draft.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    h.receive({
      type: "createSnapshot", requestID: "snapshot-draft", documentID: "draft", revision: 0,
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "editorError", requestID: "snapshot-draft", code: "editor_not_ready",
    });
    h.sourceCancel().click();
    h.receive({
      type: "createSnapshot", requestID: "snapshot-after-cancel", documentID: "draft", revision: 0,
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "snapshotReady", requestID: "snapshot-after-cancel", text: original,
    });

    const malformed = "正文\n\n$$\n未闭合\n";
    h.receive({
      type: "loadDocument", requestID: "load-malformed", documentID: "malformed", revision: 0,
      text: malformed,
    });
    await settle();
    expect(h.editorHost().querySelector(".ProseMirror")).not.toBeNull();
    h.receive({
      type: "createSnapshot", requestID: "snapshot-malformed", documentID: "malformed", revision: 0,
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "editorError", requestID: "snapshot-malformed", code: "editor_not_ready",
    });
    h.sourceMode().click();
    const repair = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    const repaired = `${malformed}$$\n`;
    repair.value = repaired;
    repair.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    h.sourceApply().click();
    expect(h.lastRevision()).toBe(1);
    h.receive({
      type: "createSnapshot", requestID: "snapshot-repaired", documentID: "malformed", revision: 1,
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "snapshotReady", requestID: "snapshot-repaired", revision: 1, text: repaired,
    });
  });

  it("源码模式只替换正文精确选中匹配，单次 revision 且 Undo/Redo 精确", async () => {
    const h = await bootMain();
    const raw = "<x>one one</x>\r\n";
    h.receive({ type: "loadDocument", requestID: "load", documentID: "doc", revision: 4, text: raw });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    h.searchMatches()[1]!.querySelector<HTMLButtonElement>("button")!.click();
    h.replacement().value = "$&-$1";
    h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
    h.replacement().focus();
    const before = h.stateMessages().length;
    h.replaceSelected().click();
    await settle();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    expect(area.value).toBe("<x>one $&-$1</x>\n");
    expect(h.lastRevision()).toBe(5);
    expect(h.stateMessages()).toHaveLength(before + 1);
    expect(h.dom.window.document.activeElement).toBe(h.replacement());
    h.searchClose().click();
    h.receive({ type: "executeCommand", requestID: "undo", documentID: "doc", revision: 5, command: "undo" });
    await settle();
    expect(area.value).toBe(raw.replace("\r\n", "\n"));
    h.receive({ type: "executeCommand", requestID: "redo", documentID: "doc", revision: 6, command: "redo" });
    await settle();
    expect(area.value).toBe("<x>one $&-$1</x>\n");
  });

  it("全部替换为一个原子变更；PM 与 bare-CR 不开放替换", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "load", documentID: "source", revision: 0, text: "<x>中 中</x>\n" });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("中");
    await settle();
    h.replacement().value = "👩‍💻";
    h.replacement().dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
    h.replaceAll().click();
    await settle();
    expect(h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("<x>👩‍💻 👩‍💻</x>\n");
    expect(h.lastRevision()).toBe(1);

    h.receive({ type: "loadDocument", requestID: "pm", documentID: "pm", revision: 0, text: "# Safe\n" });
    await settle();
    expect(h.dom.window.document.querySelector(".search-panel-replacement")).toBeNull();
    h.receive({ type: "loadDocument", requestID: "cr", documentID: "cr", revision: 0, text: "a\rb" });
    await settle();
    expect(h.dom.window.document.querySelector(".search-panel-replacement")).toBeNull();
  });
  it("点击第二个重复标题经真实 DOM/runtime 精确定位且不发 Bridge 消息", async () => {
    const h = await bootMain();
    const raw = "# 同名\n\n正文\n\n# 同名\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 3, text: raw });
    await settle();
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    const headings = editor.querySelectorAll("h1");
    expect(headings).toHaveLength(2);
    const before = h.sent.length;
    h.headingButtons()[1].click();
    expect(h.sent).toHaveLength(before);
    expect(h.dom.window.document.activeElement).toBe(editor);
    const selection = h.dom.window.getSelection();
    expect(headings[1].contains(selection?.anchorNode ?? null)).toBe(true);
    expect(h.stateMessages().at(-1)?.state).toMatchObject({
      documentID: "doc-a", revision: 3, dirty: false,
    });
  });

  it("source 模式按 BOM/混合 EOL 原文范围定位，不改变文本或消息", async () => {
    const h = await bootMain();
    const raw = "\uFEFF# 第一\r\n\n## 第二 👩‍💻\r\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 1, text: raw });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    const target = analyzeDocument({ raw, revision: 1 }).headings[1];
    const before = h.sent.length;
    h.headingButtons()[1].click();
    expect(area.selectionStart).toBe(raw.slice(0, target.start).replace(/\r\n?/g, "\n").length);
    expect(area.value).toBe(raw.replace(/\r\n?/g, "\n"));
    expect(h.sent).toHaveLength(before);
  });

  it("composition 中 pointerdown/click 拒绝导航并保留焦点选区内容与消息", async () => {
    const h = await bootMain();
    const raw = "<x>正文</x>\n\n# 标题\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: raw });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.focus();
    area.setSelectionRange(2, 4);
    area.dispatchEvent(new h.dom.window.Event("compositionstart"));
    const before = { value: area.value, start: area.selectionStart, end: area.selectionEnd, messages: h.sent.length };
    const button = h.headingButtons()[0];
    const pointer = new h.dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    expect(button.dispatchEvent(pointer)).toBe(false);
    button.click();
    expect(h.dom.window.document.activeElement).toBe(area);
    expect({ value: area.value, start: area.selectionStart, end: area.selectionEnd, messages: h.sent.length }).toEqual(before);
    expect(h.panel().querySelector(".analysis-panel-navigation-status")?.textContent).toContain("完成中文输入");
  });

  it("跨文档旧按钮请求被拒绝，不改变新文档焦点选区或 Bridge 消息", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 4, text: "# A\n" });
    await settle();
    const oldButton = h.headingButtons()[0];
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-b", revision: 4, text: "# B\n" });
    await settle();
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    editor.focus();
    const selection = h.dom.window.getSelection()?.getRangeAt(0).cloneRange();
    const before = h.sent.length;
    oldButton.click();
    expect(h.sent).toHaveLength(before);
    expect(h.dom.window.document.activeElement).toBe(editor);
    const after = h.dom.window.getSelection()?.getRangeAt(0);
    expect(after?.startContainer).toBe(selection?.startContainer);
    expect(after?.startOffset).toBe(selection?.startOffset);
  });

  it("同身份合法重复 load 后旧按钮请求被拒绝，新按钮仍可导航", async () => {
    const h = await bootMain();
    const raw = "# First\n\nBody.\n\n# Second\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 4, text: raw });
    await settle();
    const oldButton = h.headingButtons()[1];
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc", revision: 4, text: raw });
    await settle();
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    const first = editor.querySelector("h1")!;
    const before = h.dom.window.getSelection()?.getRangeAt(0).cloneRange();
    expect(first.contains(before?.startContainer ?? null)).toBe(true);
    const messages = h.sent.length;
    oldButton.click();
    const after = h.dom.window.getSelection()?.getRangeAt(0);
    expect(after?.startContainer).toBe(before?.startContainer);
    expect(after?.startOffset).toBe(before?.startOffset);
    expect(h.sent).toHaveLength(messages);
    // 新 epoch 的按钮在同一文档上仍可正常定位。
    const headings = editor.querySelectorAll("h1");
    h.headingButtons()[1].click();
    const moved = h.dom.window.getSelection();
    expect(headings[1].contains(moved?.anchorNode ?? null)).toBe(true);
    expect(h.sent).toHaveLength(messages);
  });

  it("被拒 load 不失效当前 epoch 的有效导航请求", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 5, text: "# Original\n\n# Tail\n" });
    await settle();
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc", revision: 4, text: "# Stale\n" });
    await settle();
    expect(h.sent.at(-1)?.code).toBe("stale_revision");
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    const headings = editor.querySelectorAll("h1");
    const messages = h.sent.length;
    h.headingButtons()[1].click();
    expect(headings[1].contains(h.dom.window.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(h.sent).toHaveLength(messages);
  });
  it("启动即 ready，加载文档后显示真实大纲与统计，编辑器位于稳定子宿主", async () => {
    const h = await bootMain();
    expect(h.sent[0]?.type).toBe("ready");
    const raw = "# 甲\n\n## 乙\n\nhello 世界123。\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 5, text: raw });
    await settle();

    expect(h.stateMessages()).toHaveLength(1);
    expect(h.stateMessages()[0]?.requestID).toBe("r1");
    expect(h.panelHeadings()).toEqual(["甲", "乙"]);
    const expected = expectedStats(raw);
    expect(h.panelStat("字符数")).toBe(expected.characters);
    expect(h.panelStat("字数")).toBe(expected.writingUnits);

    const host = h.editorHost();
    expect(host.querySelector("#editor")).not.toBeNull();
    // 稳定工作区在面板之前：find-bar 与 editorHost 隔离，活编辑器不因
    // 分析/查找更新被重建/移动。
    const appChildren = Array.from(h.dom.window.document.querySelector("#app")!.children);
    expect(appChildren[0]).toBe(host.parentElement);
    expect(host.parentElement?.contains(h.findBar())).toBe(true);
    expect(appChildren[1]).toBe(h.panel());
    expect(host.querySelector("#editor")?.isConnected).toBe(true);

    // 面板刷新后焦点仍在编辑器上。
    h.receive({ type: "queryState", requestID: "q1" });
    await settle();
    expect(h.dom.window.document.activeElement?.id).toBe("editor");
  });

  it("结构化文档：真实 DOM 编辑经 runtime → stateChanged → 面板刷新", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 0,
      text: "# 标题\n\n正文段落。\n",
    });
    await settle();
    expect(h.panelStat("字数")).toBe(expectedStats("# 标题\n\n正文段落。\n").writingUnits);

    const editor = h.editorHost().querySelector<HTMLElement>("#editor");
    if (!editor) throw new Error("Missing structured editor");
    const paragraph = editor.querySelector("p");
    if (!paragraph) throw new Error("Missing paragraph");
    // 通过真实 DOM 变更 + input 走 ProseMirror DOMObserver → session → runtime 监听 → Bridge。
    const textNode = paragraph.firstChild as Text; // PM 段落内唯一 #text 子节点
    textNode.appendData("追加的中文内容");
    editor.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    await settle(150);

    expect(h.stateMessages().length).toBeGreaterThan(1);
    const newText = "# 标题\n\n正文段落。追加的中文内容\n";
    expect(h.panelStat("字数")).toBe(expectedStats(newText).writingUnits);
    expect(h.lastRevision()).toBeGreaterThan(0);
  });

  it("source 模式：真实 input 编辑、Undo/Redo 命令后面板同步且无重复 Bridge 消息", async () => {
    const h = await bootMain();
    const original = "<custom-element>原文</custom-element>\r\n";
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 2, text: original,
    });
    await settle();
    h.sourceMode().click();
    expect(h.panelStat("字符数")).toBe(expectedStats(original).characters);

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected source mode textarea");

    // 真实编辑：input 事件 → kernel → runtime → recordChange → stateChanged。
    area.value = "<custom-element>改后中文</custom-element>\r\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
    h.sourceApply().click();
    await settle();
    const afterEdit = h.stateMessages().length;
    expect(afterEdit).toBe(2); // load + edit，各一条
    expect(h.panelStat("字数")).toBe(expectedStats("<custom-element>改后中文</custom-element>\r\n").writingUnits);

    // 原生 Undo：executingCommand 期间 runtime 回调被抑制，仅显式响应一条 stateChanged。
    const revisionBeforeUndo = h.lastRevision();
    h.receive({
      type: "executeCommand", requestID: "r2", documentID: "doc-src",
      revision: revisionBeforeUndo, command: "undo",
    });
    await settle();
    h.sourceMode().click();
    expect(h.stateMessages()).toHaveLength(afterEdit + 1);
    expect(h.panelStat("字数")).toBe(expectedStats(original).writingUnits);
    expect(h.lastRevision()).toBe(revisionBeforeUndo + 1);

    // Redo 后同样刷新。
    h.receive({
      type: "executeCommand", requestID: "r3", documentID: "doc-src",
      revision: h.lastRevision(), command: "redo",
    });
    await settle();
    expect(h.stateMessages()).toHaveLength(afterEdit + 2);
    expect(h.panelStat("字数")).toBe(expectedStats("<custom-element>改后中文</custom-element>\r\n").writingUnits);
  });

  it("markSaved 返回后面板刷新且只发一条 stateChanged；保存基线不改编辑内容", async () => {
    const h = await bootMain();
    const original = "<custom-element>原文</custom-element>\r\n";
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 1,
      text: original,
    });
    await settle();
    h.sourceMode().click();

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected source mode textarea");
    // 真实编辑 → native 持久化该文本 → markSaved 回流。
    const edited = "<custom-element>已编辑中文</custom-element>\r\n";
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input"));
    h.sourceApply().click();
    await settle();
    expect(h.panelStat("字数")).toBe(expectedStats(edited).writingUnits);

    h.receive({
      type: "markSaved", requestID: "r2", documentID: "doc-src",
      revision: h.lastRevision(), text: edited,
    });
    await settle();
    h.sourceMode().click();
    // load + edit + markSaved 各一条：executingCommand 抑制了 runtime 回调重复上报。
    expect(h.stateMessages()).toHaveLength(3);
    expect(h.stateMessages().at(-1)?.state?.dirty).toBe(false);
    // 面板仍显示当前（已保存）文本统计。
    expect(h.panelStat("字数")).toBe(expectedStats(edited).writingUnits);
    expect(area.value.replace(/\r\n/g, "\n")).toBe(edited.replace(/\r\n/g, "\n"));
  });


  it("composition 期间保留旧稳定统计，compositionend 后按真实文本刷新", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0,
      text: "<x>正文</x>\n",
    });
    await settle();
    h.sourceMode().click();
    const stable = expectedStats("<x>正文</x>\n");
    expect(h.panelStat("字数")).toBe(stable.writingUnits);

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected source mode textarea");
    area.focus();
    area.setSelectionRange(1, 1);

    area.dispatchEvent(new h.dom.window.Event("compositionstart"));
    area.value = "<x>正文nihongo</x>\n"; // 拼音中间态
    area.setSelectionRange(4, 4); // 组合期间面板不得触碰选区
    area.dispatchEvent(new h.dom.window.Event("input"));
    await settle();
    // 组合期间：面板保持旧统计，焦点/选区不被面板触碰。
    expect(h.panelStat("字数")).toBe(stable.writingUnits);
    expect(h.dom.window.document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(4);

    area.dispatchEvent(new h.dom.window.Event("compositionend"));
    h.sourceApply().click();
    await settle();
    expect(h.panelStat("字数")).toBe(expectedStats("<x>正文nihongo</x>\n").writingUnits);
    expect(h.dom.window.document.activeElement).toBe(area);
  });

  it("快速跨文档与同 revision 异 documentID：旧任务作废，旧结果不覆盖新文档", async () => {
    const h = await bootMain();
    const docA = "# 文档A\n\n苹果香蕉梨。\n";
    const docB = "# 文档B\n\napple banana。\n";
    // 同步连续 load：A 的分析计时器尚未触发即被 B 取消。
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 7, text: docA });
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-b", revision: 7, text: docB });
    await settle();

    expect(h.panelHeadings()).toEqual(["文档B"]);
    const expected = expectedStats(docB);
    expect(h.panelStat("字符数")).toBe(expected.characters);
    const bodyText = h.panel().textContent ?? "";
    expect(bodyText).not.toContain("文档A");
    expect(bodyText).not.toContain("苹果");
    expect(h.stateMessages().at(-1)?.state?.documentID).toBe("doc-b");
  });


  it("恶意标题不显示 HTML 标签，不执行 HTML", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-x", revision: 0,
      text: '# <img src=x onerror="alert(1)">\n',
    });
    await settle();
    // HTML token 不执行也不显示：纯标签标题的显示文本为空。
    expect(h.panelHeadings()).toEqual([""]);
    expect(h.panel().querySelectorAll("img, script, iframe")).toHaveLength(0);
  });

  it("只读裸 CR 文档同样显示真实统计", async () => {
    const h = await bootMain();
    const raw = "# 标\r题\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-cr", revision: 0, text: raw });
    await settle();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected read-only runtime");
    expect(area.readOnly).toBe(true);
    expect(h.panelStat("字符数")).toBe(expectedStats(raw).characters);
  });


  it("收起/展开不发协议消息、不动焦点", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 0,
      text: "# 甲\n",
    });
    await settle();
    const before = h.sent.length;
    h.toggle().click();
    expect(h.toggle().getAttribute("aria-expanded")).toBe("false");
    expect(h.sent).toHaveLength(before);
    expect(h.dom.window.document.activeElement?.id).toBe("editor");
    h.toggle().click();
    expect(h.toggle().getAttribute("aria-expanded")).toBe("true");
    expect(h.sent).toHaveLength(before);
    expect(h.panelHeadings()).toEqual(["甲"]);
  });


  it("被拒的过期 revision load 保留当前有效大纲与统计", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 5, text: "# Original\n" });
    await settle();
    expect(h.panelHeadings()).toEqual(["Original"]);
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc", revision: 4, text: "# Stale\n" });
    await settle();
    expect(h.sent.at(-1)?.type).toBe("editorError");
    expect(h.sent.at(-1)?.code).toBe("stale_revision");
    expect(h.panelHeadings()).toEqual(["Original"]);
    expect(h.panelStat("字符数")).toBe(expectedStats("# Original\n").characters);
  });

  it("被拒的重复 requestID load 保留当前有效大纲与统计", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 5, text: "# Original\n" });
    await settle();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "other", revision: 0, text: "# Rejected\n" });
    await settle();
    expect(h.sent.at(-1)?.type).toBe("editorError");
    expect(h.sent.at(-1)?.code).toBe("request_conflict");
    expect(h.panelHeadings()).toEqual(["Original"]);
    expect(h.panelStat("字数")).toBe(expectedStats("# Original\n").writingUnits);
  });

  it("有效 load 的待执行分析不被紧随其后的拒绝请求取消", async () => {
    const h = await bootMain();
    // 同步连续两条：第一条已接受（分析计时器未触发），第二条被拒。
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 5, text: "# Original\n" });
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc", revision: 4, text: "# Stale\n" });
    await settle();
    expect(h.sent.at(-1)?.code).toBe("stale_revision");
    expect(h.panelHeadings()).toEqual(["Original"]);
    expect(h.panelStat("字符数")).toBe(expectedStats("# Original\n").characters);
    expect(h.editorHost().textContent).toContain("Original");
  });

  it("查找面板：查询/大小写/空查询/计数，零 Bridge 副作用", async () => {
    const h = await bootMain();
    const raw = "<x>foo Foo FOO bar</x>\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: raw });
    await settle();
    h.sourceMode().click();

    expect(h.searchBody().hidden).toBe(true);
    h.searchButton().click();
    expect(h.searchBody().hidden).toBe(false);
    expect(h.dom.window.document.activeElement).toBe(h.searchQuery());

    // 空查询：清楚空态。
    expect(h.searchResultsText()).toContain("输入查询");

    h.typeSearchQuery("foo");
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");
    expect(h.searchMatches()).toHaveLength(1);

    // 清空查询必须立即进入 idle，不能残留上次稳定结果。
    h.typeSearchQuery("");
    await settle();
    expect(h.searchMatches()).toHaveLength(0);
    expect(h.searchResultsText()).toContain("输入查询");

    h.typeSearchQuery("foo");
    await settle();

    // 大小写不敏感。
    h.searchCase().checked = false;
    h.searchCase().dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
    await settle();
    expect(h.searchResultsText()).toContain("3 处匹配");

    // 面板打开/查询/开关全程不产生任何协议消息。
    expect(h.sent.filter((m) => m.type !== "stateChanged")).toHaveLength(1); // ready
    expect(h.stateMessages()).toHaveLength(1); // 仅 load
  });

  it("查找面板：超过 100 处显式 truncated，不冒充精确总数", async () => {
    const h = await bootMain();
    const raw = `<x>${"ha ".repeat(150)}</x>\n`;
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: raw });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("ha");
    await settle(120);
    expect(h.searchResultsText()).toContain("匹配至少 100 处，仅显示前 100 处");
    expect(h.searchMatches()).toHaveLength(100);
    expect(h.searchResultsText()).toContain("结果基于 Markdown 原文");
    expect(h.searchResultsText()).toContain("未显示部分不参与循环");
  });

  it("源码查找支持 Enter/Shift-Enter、回绕与条目选择并保持查询焦点", async () => {
    const h = await bootMain();
    const raw = "<x>one one one</x>\r\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "source", revision: 4, text: raw });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    const input = h.searchQuery();
    const stateCount = h.stateMessages().length;

    const press = (shiftKey = false): void => {
      input.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
        key: "Enter", shiftKey, bubbles: true, cancelable: true,
      }));
    };
    press();
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe("one");
    expect(area.selectionStart).toBe(area.value.indexOf("one"));
    expect(h.dom.window.document.activeElement).toBe(input);
    press();
    expect(area.selectionStart).toBe(area.value.indexOf("one", area.value.indexOf("one") + 1));
    press();
    press();
    expect(h.dom.window.document.querySelector(".search-panel-status")?.textContent).toContain("已回绕");
    press(true);
    expect(area.selectionStart).toBe(area.value.lastIndexOf("one"));

    const buttons = h.dom.window.document.querySelectorAll<HTMLButtonElement>(".search-panel-match-button");
    buttons[1]!.focus();
    buttons[1]!.click();
    expect(area.selectionStart).toBe(area.value.indexOf("one", area.value.indexOf("one") + 1));
    expect(h.dom.window.document.activeElement).toBe(buttons[1]);
    expect(h.stateMessages()).toHaveLength(stateCount);
    expect(h.lastRevision()).toBe(4);
  });

  it("bare-CR 保留原文定位，结构化模式提供可编辑内容定位", async () => {
    const readOnly = await bootMain();
    readOnly.receive({ type: "loadDocument", requestID: "r1", documentID: "ro", revision: 0, text: "one\rone" });
    await settle();
    readOnly.searchButton().click();
    readOnly.typeSearchQuery("one");
    await settle();
    readOnly.searchQuery().dispatchEvent(new readOnly.dom.window.KeyboardEvent("keydown", {
      key: "Enter", bubbles: true, cancelable: true,
    }));
    const area = readOnly.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    expect(area.readOnly).toBe(true);
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, 3]);

    const structured = await bootMain();
    structured.receive({ type: "loadDocument", requestID: "r2", documentID: "pm", revision: 0, text: "one one\n" });
    await settle();
    structured.searchButton().click();
    structured.typeSearchQuery("one");
    await settle();
    expect(structured.searchResultsText()).toContain("2 处匹配");
    expect(structured.searchResultsText()).toContain("可编辑内容");
    expect(structured.dom.window.document.querySelectorAll(".search-panel-match-button")).toHaveLength(2);
    expect(structured.dom.window.document.querySelector(".search-panel-navigation")).not.toBeNull();
  });

  it("旧结果按钮与 composition 导航请求均拒绝且不改变正文选区", async () => {
    const h = await bootMain();
    const raw = "<x>one one</x>\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "source", revision: 0, text: raw });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    const oldButton = h.dom.window.document.querySelector<HTMLButtonElement>(".search-panel-match-button")!;
    area.setSelectionRange(1, 2);
    area.value = "<x>two two</x>\n";
    const staleSelection = [area.selectionStart, area.selectionEnd];
    oldButton.click();
    expect([area.selectionStart, area.selectionEnd]).toEqual(staleSelection);

    area.value = raw;
    area.setSelectionRange(2, 3);
    area.dispatchEvent(new h.dom.window.Event("compositionstart"));
    h.searchQuery().focus();
    const event = new h.dom.window.KeyboardEvent("keydown", {
      key: "Enter", bubbles: true, cancelable: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });
    h.searchQuery().dispatchEvent(event);
    expect([area.selectionStart, area.selectionEnd]).toEqual([2, 3]);
    expect(h.dom.window.document.activeElement).toBe(h.searchQuery());
  });

  it("重复 load 更新 epoch 后旧上一/下一按钮失效", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "same", revision: 2, text: "<x>one one</x>\n" });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    const oldNext = h.dom.window.document.querySelector<HTMLButtonElement>(".search-panel-next")!;

    h.receive({ type: "loadDocument", requestID: "r2", documentID: "same", revision: 2, text: "<x>one one</x>\n" });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    area.setSelectionRange(1, 3);
    oldNext.click();
    expect([area.selectionStart, area.selectionEnd]).toEqual([1, 3]);
    expect(h.dom.window.document.querySelector(".search-panel-status")?.textContent).toContain("过期");
  });

  it("导航不清除正文 past/future，关闭查找后 Undo/Redo 仍正常", async () => {
    const h = await bootMain();
    const original = "<x>one original</x>\n";
    const edited = "<x>one edited</x>\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "history", revision: 0, text: original });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    h.sourceApply().click();
    await settle();
    area.focus();
    h.receive({
      type: "executeCommand", requestID: "undo", documentID: "history",
      revision: h.lastRevision(), command: "undo",
    });
    await settle();
    expect(area.value).toBe(original);

    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    h.searchQuery().dispatchEvent(new h.dom.window.KeyboardEvent("keydown", {
      key: "Enter", bubbles: true, cancelable: true,
    }));
    const revisionAfterNavigation = h.lastRevision();
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe("one");
    h.searchClose().click();
    h.receive({
      type: "executeCommand", requestID: "redo", documentID: "history",
      revision: revisionAfterNavigation, command: "redo",
    });
    await settle();
    expect(area.value).toBe(edited);
  });

  it("查找面板：编辑/Undo/Redo 后按最新 stateChanged 重算", async () => {
    const h = await bootMain();
    const original = "<x>foo foo</x>\r\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 2, text: original });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();
    expect(h.searchResultsText()).toContain("2 处匹配");

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.value = "<x>foo bar</x>\r\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
    h.sourceApply().click();
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");

    // 原生文档命令只应在正文真实拥有焦点时操作正文历史。
    area.focus();
    h.receive({
      type: "executeCommand", requestID: "r2", documentID: "doc-src",
      revision: h.lastRevision(), command: "undo",
    });
    await settle();
    expect(h.searchResultsText()).toContain("2 处匹配");

    h.receive({
      type: "executeCommand", requestID: "r3", documentID: "doc-src",
      revision: h.lastRevision(), command: "redo",
    });
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");
  });

  it("查找输入持焦时拒绝文档 Undo/Redo，并保留正文历史与 future", async () => {
    const h = await bootMain();
    const original = "<x>original</x>\n";
    const edited = "<x>edited</x>\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: original });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    h.sourceApply().click();
    await settle();

    h.searchButton().click();
    h.typeSearchQuery("edited");
    await settle();
    area.setSelectionRange(3, 8);
    const revision = h.lastRevision();
    const stateCount = h.stateMessages().length;
    const stateBefore = h.stateMessages().at(-1)?.state;
    expect(h.dom.window.document.activeElement).toBe(h.searchQuery());

    h.receive({
      type: "executeCommand", requestID: "blocked-undo", documentID: "doc-src",
      revision, command: "undo",
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "editorError", requestID: "blocked-undo", code: "command_rejected",
      documentID: "doc-src", revision,
    });
    expect(area.value).toBe(edited);
    expect([area.selectionStart, area.selectionEnd]).toEqual([3, 8]);
    expect(h.stateMessages()).toHaveLength(stateCount);
    expect(h.stateMessages().at(-1)?.state).toEqual(stateBefore);
    expect(h.dom.window.document.activeElement).toBe(h.searchQuery());

    area.focus();
    h.receive({
      type: "executeCommand", requestID: "real-undo", documentID: "doc-src",
      revision, command: "undo",
    });
    await settle();
    expect(area.value).toBe(original);
    const undoneRevision = h.lastRevision();

    h.searchQuery().focus();
    h.receive({
      type: "executeCommand", requestID: "blocked-redo", documentID: "doc-src",
      revision: undoneRevision, command: "redo",
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "editorError", requestID: "blocked-redo", code: "command_rejected",
      documentID: "doc-src", revision: undoneRevision,
    });
    expect(area.value).toBe(original);
    expect(h.lastRevision()).toBe(undoneRevision);

    area.focus();
    h.receive({
      type: "executeCommand", requestID: "real-redo", documentID: "doc-src",
      revision: undoneRevision, command: "redo",
    });
    await settle();
    expect(area.value).toBe(edited);
  });

  it("查询 composition 中大纲导航不夺焦点，收口后仍可正常导航", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc", revision: 0, text: "# First\n\n# Second\n" });
    await settle();
    h.searchButton().click();
    const input = h.searchQuery();
    input.dispatchEvent(new h.dom.window.Event("compositionstart"));
    input.value = "pinyin";
    input.setSelectionRange(1, 4);
    input.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
    const messages = h.sent.length;
    const documentText = h.editorHost().textContent;

    const button = h.headingButtons()[1];
    button.dispatchEvent(new h.dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    button.click();
    expect(h.dom.window.document.activeElement).toBe(input);
    expect(input.value).toBe("pinyin");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(h.editorHost().textContent).toBe(documentText);
    expect(h.sent).toHaveLength(messages);
    expect(h.panel().querySelector(".analysis-panel-navigation-status")?.textContent)
      .toContain("完成查找输入");

    input.dispatchEvent(new h.dom.window.Event("compositionend"));
    button.click();
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    const headings = editor.querySelectorAll("h1");
    expect(h.dom.window.document.activeElement).toBe(editor);
    expect(headings[1].contains(h.dom.window.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(h.sent).toHaveLength(messages);
  });

  it("查找面板：接受 load 清旧结果与绑定，被拒 load 完全保留查找状态", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 5, text: "<x>needle needle</x>\n" });
    h.sourceMode().click();
    await settle();
    h.searchButton().click();
    h.typeSearchQuery("needle");
    await settle();
    expect(h.searchResultsText()).toContain("2 处匹配");

    // 被拒（过期 revision）load：查询、开关与结果原样保留。
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-a", revision: 4, text: "<x>other</x>\n" });
    await settle();
    expect(h.sent.at(-1)?.code).toBe("stale_revision");
    expect(h.searchQuery().value).toBe("needle");
    expect(h.searchResultsText()).toContain("2 处匹配");
    expect(h.searchBody().hidden).toBe(false);

    // 接受的新 load：结果与绑定立即清空，查询/大小写回默认，开关保留。
    h.receive({ type: "loadDocument", requestID: "r3", documentID: "doc-b", revision: 0, text: "# 文档B\n" });
    await settle();
    expect(h.searchBody().hidden).toBe(false);
    expect(h.searchQuery().value).toBe("");
    expect(h.searchCase().checked).toBe(true);
    expect(h.searchResultsText()).toContain("输入查询");
    expect(h.searchResultsText()).not.toContain("needle");
  });

  it("查找面板：查询组合中跨 load 保留候选焦点，收口后安全重置", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 0, text: "<x>foo</x>\n" });
    await settle();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();

    const input = h.searchQuery();
    input.focus();
    input.dispatchEvent(new h.dom.window.Event("compositionstart"));
    input.value = "候选草稿";
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-b", revision: 0, text: "<x>bar</x>\n" });
    await settle();

    expect(h.dom.window.document.activeElement).toBe(input);
    expect(input.value).toBe("候选草稿");
    expect(h.searchResultsText()).toContain("输入查询");
    expect(h.searchResultsText()).not.toContain("foo");

    input.dispatchEvent(new h.dom.window.Event("compositionend"));
    await settle();
    expect(input.value).toBe("");
    expect(h.searchResultsText()).toContain("输入查询");
  });

  it.each([
    ["readonly", "a\rb"],
    ["ProseMirror", "# New document\n"],
  ])("查找面板：replacement 组合跨 load 到 %s 时保留活候选并在收口后清理", async (_mode, text) => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 0, text: "<x>a</x>\n" });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("a");
    await settle();

    const input = h.replacement();
    input.focus();
    input.dispatchEvent(new h.dom.window.Event("compositionstart"));
    input.value = "pinyin";
    input.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-b", revision: 0, text });
    await settle();

    expect(input.isConnected).toBe(true);
    expect(h.dom.window.document.activeElement).toBe(input);
    expect(input.value).toBe("pinyin");

    input.dispatchEvent(new h.dom.window.Event("compositionend"));
    input.value = "late final input";
    input.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true }));
    await settle();
    expect(input.value).toBe("");
    expect(input.isConnected).toBe(false);
  });

  it("查找面板：快速跨文档同 revision 旧查找任务作废，不覆盖新文档", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-a", revision: 7, text: "<x>apple apple</x>\n" });
    h.searchButton().click();
    h.typeSearchQuery("apple");
    // 同 revision 异 documentID：立即 load 新文档，旧任务计时器被取消。
    h.receive({ type: "loadDocument", requestID: "r2", documentID: "doc-b", revision: 7, text: "<x>banana</x>\n" });
    await settle();
    expect(h.searchQuery().value).toBe("");
    expect(h.searchResultsText()).toContain("输入查询");
    expect(h.searchResultsText()).not.toContain("apple");
  });

  it("查找面板：source runtime composition 期间保留旧结果，收口后重算", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>foo</x>\n" });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.focus();
    area.dispatchEvent(new h.dom.window.Event("compositionstart"));
    area.value = "<x>foo foo</x>\n"; // 组合中间态编辑
    area.dispatchEvent(new h.dom.window.Event("input"));
    await settle();
    // composition 中：保留上一份稳定结果，不用组合中间文本重搜。
    expect(h.searchResultsText()).toContain("1 处匹配");

    area.dispatchEvent(new h.dom.window.Event("compositionend"));
    h.sourceApply().click();
    await settle();
    // 源码草稿显式提交后的真实 stateChanged 才重算。
    expect(h.searchResultsText()).toContain("2 处匹配");
  });

  it("查找面板：查询框自身 composition 不用半拼音重搜", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>zhong 文</x>\n" });
    h.sourceMode().click();
    await settle();
    h.searchButton().click();
    h.typeSearchQuery("文");
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");

    const input = h.searchQuery();
    input.dispatchEvent(new h.dom.window.Event("compositionstart"));
    input.value = "zhōng";
    input.dispatchEvent(new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配"); // 保留旧稳定结果

    input.dispatchEvent(new h.dom.window.Event("compositionend"));
    await settle();
    expect(h.searchResultsText()).toContain("0 处匹配");
  });

  it("查找面板：已排队查询遇到 query composition 时不读取半成品", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>foo foo bar</x>\n" });
    h.sourceMode().click();
    await settle();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();
    expect(h.searchMatches()).toHaveLength(2);

    h.typeSearchQuery("bar");
    h.searchQuery().dispatchEvent(new h.dom.window.Event("compositionstart"));
    h.searchQuery().value = "pinyin";
    h.searchQuery().dispatchEvent(
      new h.dom.window.InputEvent("input", { bubbles: true, isComposing: true }),
    );
    await settle();
    expect(h.searchMatches()).toHaveLength(2);
  });

  it("查找面板：query composition 中拒绝关闭和大小写变更", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>foo foo</x>\n" });
    h.sourceMode().click();
    await settle();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();
    const input = h.searchQuery();
    input.focus();
    input.dispatchEvent(new h.dom.window.Event("compositionstart"));

    const pointer = new h.dom.window.MouseEvent("pointerdown", {
      bubbles: true, cancelable: true,
    });
    expect(h.searchClose().dispatchEvent(pointer)).toBe(false);
    h.searchClose().click();
    expect(h.searchBody().hidden).toBe(false);
    expect(h.dom.window.document.activeElement).toBe(input);

    h.searchCase().checked = false;
    h.searchCase().dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
    expect(h.searchCase().checked).toBe(true);
    expect(h.searchMatches()).toHaveLength(2);
  });

  it("查找面板：作者样式不覆盖 hidden 属性", async () => {
    const h = await bootMain();
    const style = h.dom.window.document.createElement("style");
    style.textContent = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    h.dom.window.document.head.append(style);
    expect(h.searchBody().hidden).toBe(true);
    expect(h.dom.window.getComputedStyle(h.searchBody()).display).toBe("none");
  });

  it("查找面板：Esc 关闭并回焦点正文；面板动作不改正文/历史/revision", async () => {
    const h = await bootMain();
    const original = "<x>foo</x>\r\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 3, text: original });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;

    h.searchButton().click();
    h.typeSearchQuery("foo");
    h.searchCase().checked = false;
    h.searchCase().dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
    await settle();

    // 正文、dirty/revision 基线均未被面板动作触碰。
    expect(area.value.replace(/\r\n/g, "\n")).toBe(original.replace(/\r\n/g, "\n"));
    const revisionBefore = h.lastRevision();
    const messages = h.stateMessages().length;

    const esc = new h.dom.window.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    });
    h.searchQuery().dispatchEvent(esc);
    expect(h.searchBody().hidden).toBe(true);
    expect(h.dom.window.document.activeElement).toBe(area);
    expect(h.lastRevision()).toBe(revisionBefore);
    expect(h.stateMessages()).toHaveLength(messages);

    // 编辑历史仍可用：编辑后 undo 回到 load 基线。
    area.value = "<x>foo edited</x>\r\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
    h.sourceApply().click();
    await settle();
    h.receive({
      type: "executeCommand", requestID: "r2", documentID: "doc-src",
      revision: h.lastRevision(), command: "undo",
    });
    await settle();
    expect(area.value.replace(/\r\n/g, "\n")).toBe(original.replace(/\r\n/g, "\n"));
  });

  it("查找面板：后台刷新不打断编辑器焦点与选区", async () => {
    const h = await bootMain();
    const original = "<x>foo foo</x>\r\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 1, text: original });
    await settle();
    h.sourceMode().click();
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.focus();
    area.setSelectionRange(6, 9);
    // markSaved 产生真实 stateChanged → 查找刷新，但不改文本。
    h.receive({
      type: "markSaved", requestID: "r2", documentID: "doc-src",
      revision: h.lastRevision(), text: original,
    });
    await settle();
    expect(h.dom.window.document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(6);
    expect(area.selectionEnd).toBe(9);
    expect(h.searchResultsText()).toContain("2 处匹配");
  });

  it("查找面板：编辑器 composition 中入口被拒且不夺焦点", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>正文</x>\n" });
    await settle();
    h.sourceMode().click();
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.focus();
    area.setSelectionRange(2, 4);
    area.dispatchEvent(new h.dom.window.Event("compositionstart"));

    const pointer = new h.dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    expect(h.searchButton().dispatchEvent(pointer)).toBe(false);
    h.searchButton().click();
    expect(h.searchBody().hidden).toBe(true);
    expect(h.dom.window.document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(2);
    expect(area.selectionEnd).toBe(4);
    expect(
      h.dom.window.document.querySelector(".search-panel-status")?.textContent,
    ).toContain("完成中文输入");
  });

  it("查找面板：结构化（PM）文档同样可查，composition 中保留旧结果", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-pm", revision: 0,
      text: "# 标题\n\n正文段落。\n",
    });
    await settle();
    const editor = h.editorHost().querySelector<HTMLElement>("#editor")!;
    h.searchButton().click();
    h.typeSearchQuery("正文");
    await settle();
    expect(h.searchResultsText()).toContain("1 处匹配");

    // PM composition：真实 DOM 编辑 + input，session 汇报组合前文档，
    // 查找调度在 composition 中保留旧结果。
    editor.dispatchEvent(new h.dom.window.Event("compositionstart", { bubbles: true }));
    const paragraph = editor.querySelector("p")!;
    (paragraph.firstChild as Text).appendData("追加");
    editor.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    await settle(150);
    expect(h.searchResultsText()).toContain("1 处匹配");
  });
});

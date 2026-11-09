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
  state?: { documentID: string; revision: number; dirty: boolean };
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

async function bootMain(): Promise<Harness> {
  const dom = new JSDOM("<!doctype html><main id='app'></main>", {
    pretendToBeVisual: true,
    url: "https://editor.local/",
  });
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
  };
}

// 真实计时器例外：面板调度（jsdom window 上的 setTimeout 0）与 ProseMirror
// DOMObserver 的 requestAnimationFrame 都挂在 jsdom window 上，vi 假计时器
// 无法驱动；集成测试用有界真实等待。Promise.withResolvers 需 es2024 lib
// （仓库 tsconfig 较低且不在本任务允许修改范围），沿用 executor 形式。
const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function expectedStats(raw: string): { characters: string; writingUnits: string } {
  const analysis = analyzeDocument({ raw, revision: 0 });
  return {
    characters: String(analysis.content.characters),
    writingUnits: String(analysis.content.writingUnits),
  };
}

afterEach(() => {
  for (const [key, value] of savedGlobals) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  vi.resetModules();
});

describe("main：真实 main/Bridge/runtime 面板集成", () => {
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
    expect(h.panelStat("字符数")).toBe(expectedStats(original).characters);

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected source mode textarea");

    // 真实编辑：input 事件 → kernel → runtime → recordChange → stateChanged。
    area.value = "<custom-element>改后中文</custom-element>\r\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
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

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor");
    if (!area) throw new Error("Expected source mode textarea");
    // 真实编辑 → native 持久化该文本 → markSaved 回流。
    const edited = "<custom-element>已编辑中文</custom-element>\r\n";
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input"));
    await settle();
    expect(h.panelStat("字数")).toBe(expectedStats(edited).writingUnits);

    h.receive({
      type: "markSaved", requestID: "r2", documentID: "doc-src",
      revision: h.lastRevision(), text: edited,
    });
    await settle();
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


  it("恶意标题只按字面显示，不执行 HTML", async () => {
    const h = await bootMain();
    h.receive({
      type: "loadDocument", requestID: "r1", documentID: "doc-x", revision: 0,
      text: '# <img src=x onerror="alert(1)">\n',
    });
    await settle();
    expect(h.panelHeadings()).toEqual(['<img src=x onerror="alert(1)">']);
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

  it("bare-CR 只读模式可定位，结构化模式只显示计数与不支持原因", async () => {
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
    expect(structured.searchResultsText()).toContain("结构化编辑模式暂不支持原文范围定位");
    expect(structured.dom.window.document.querySelector(".search-panel-match-button")).toBeNull();
    expect(structured.dom.window.document.querySelector(".search-panel-navigation")).toBeNull();
  });

  it("旧结果按钮与 composition 导航请求均拒绝且不改变正文选区", async () => {
    const h = await bootMain();
    const raw = "<x>one one</x>\n";
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "source", revision: 0, text: raw });
    await settle();
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
    h.searchButton().click();
    h.typeSearchQuery("one");
    await settle();
    const oldNext = h.dom.window.document.querySelector<HTMLButtonElement>(".search-panel-next")!;

    h.receive({ type: "loadDocument", requestID: "r2", documentID: "same", revision: 2, text: "<x>one one</x>\n" });
    await settle();
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
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea")!;
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
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
    h.searchButton().click();
    h.typeSearchQuery("foo");
    await settle();
    expect(h.searchResultsText()).toContain("2 处匹配");

    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.value = "<x>foo bar</x>\r\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
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
    const area = h.editorHost().querySelector<HTMLTextAreaElement>("textarea#editor")!;
    area.value = edited;
    area.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
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
    await settle();
    // 收口后的真实 stateChanged 才重算。
    area.value = "<x>foo foo</x>\n";
    area.dispatchEvent(new h.dom.window.Event("input"));
    await settle();
    expect(h.searchResultsText()).toContain("2 处匹配");
  });

  it("查找面板：查询框自身 composition 不用半拼音重搜", async () => {
    const h = await bootMain();
    h.receive({ type: "loadDocument", requestID: "r1", documentID: "doc-src", revision: 0, text: "<x>zhong 文</x>\n" });
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

import { JSDOM } from "jsdom";
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
    // 稳定宿主在面板之前，活编辑器不因分析更新被重建/移动。
    const appChildren = Array.from(h.dom.window.document.querySelector("#app")!.children);
    expect(appChildren[0]).toBe(host);
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
});

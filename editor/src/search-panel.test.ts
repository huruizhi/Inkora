import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchSource } from "./source-search";
import {
  SEARCH_MAX_RESULTS,
  SearchPanel,
  type SearchPanelHandlers,
} from "./search-panel";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

let dom: JSDOM;

function setup(): { panel: SearchPanel; handlers: SearchPanelHandlers } {
  dom = new JSDOM("<!doctype html><main id='app'></main>", {
    pretendToBeVisual: true,
    url: "https://editor.local/",
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  const handlers: SearchPanelHandlers = {
    onSearchRequest: vi.fn(),
    isEditorComposing: vi.fn((): boolean => false),
    onFocusEditor: vi.fn(),
  };
  const parent = dom.window.document.querySelector<HTMLElement>("#app")!;
  const panel = new SearchPanel(parent, handlers);
  return { panel, handlers };
}

function doc(): Document {
  return dom.window.document;
}

function findButton(): HTMLButtonElement {
  return doc().querySelector<HTMLButtonElement>(".search-toggle")!;
}

function queryInput(): HTMLInputElement {
  return doc().querySelector<HTMLInputElement>(".search-panel-query")!;
}

function caseInput(): HTMLInputElement {
  return doc().querySelector<HTMLInputElement>(".search-panel-case input")!;
}

function closeButton(): HTMLButtonElement {
  return doc().querySelector<HTMLButtonElement>(".search-panel-close")!;
}

function resultsText(): string {
  return doc().querySelector(".search-panel-results")?.textContent ?? "";
}

function typeQuery(value: string, options: { isComposing?: boolean } = {}): void {
  const input = queryInput();
  input.value = value;
  input.dispatchEvent(
    new dom.window.InputEvent("input", {
      bubbles: true,
      ...(options.isComposing !== undefined ? { isComposing: options.isComposing } : {}),
    }),
  );
}

function pointerDown(target: Element): boolean {
  const pointer = new dom.window.MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
  });
  return target.dispatchEvent(pointer);
}

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("SearchPanel：打开/关闭与焦点", () => {
  it("ownsFocus 只读反映查询区域的真实 DOM 焦点", () => {
    const { panel } = setup();
    expect(panel.ownsFocus).toBe(false);
    panel.open();
    expect(panel.ownsFocus).toBe(true);
    const foreign = document.createElement("button");
    document.body.append(foreign);
    foreign.focus();
    expect(panel.ownsFocus).toBe(false);
  });

  it("查找按钮打开面板并聚焦查询框，关闭按钮回焦点正文", () => {
    const { panel, handlers } = setup();
    findButton().click();
    expect(panel.isOpen).toBe(true);
    expect(doc().activeElement).toBe(queryInput());

    closeButton().click();
    expect(panel.isOpen).toBe(false);
    expect(handlers.onFocusEditor).toHaveBeenCalledTimes(1);
  });

  it("面板默认隐藏；空查询打开不发查找请求", () => {
    const { panel, handlers } = setup();
    expect(panel.isOpen).toBe(false);
    expect(
      doc().querySelector<HTMLElement>("#search-panel-body")!.hidden,
    ).toBe(true);
    findButton().click();
    expect(handlers.onSearchRequest).not.toHaveBeenCalled();
  });

  it("关闭取消待执行搜索，重新打开时保留查询并重算", () => {
    const { panel, handlers } = setup();
    findButton().click();
    typeQuery("foo");
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(1);
    closeButton().click();
    expect(panel.query).toBe("foo");
    findButton().click();
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(3);
  });
});

describe("SearchPanel：查询输入与 composition", () => {
  it("输入触发重算请求；半拼音（composition/isComposing）不触发", () => {
    const { handlers } = setup();
    findButton().click();
    typeQuery("中");
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(1);

    queryInput().dispatchEvent(new dom.window.Event("compositionstart"));
    typeQuery("zhōng", { isComposing: true });
    typeQuery("zhong", { isComposing: true });
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(1);

    queryInput().dispatchEvent(new dom.window.Event("compositionend"));
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(2);
    expect(queryInput().value).toBe("zhong");
  });

  it("Esc 在查询框非组合时关闭面板并回焦点；组合中不拦", () => {
    const { handlers } = setup();
    findButton().click();
    queryInput().dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(handlers.onFocusEditor).toHaveBeenCalledTimes(1);

    // composition 事件期间 + isComposing 标记的 Esc 都不得关闭面板。
    findButton().click();
    queryInput().dispatchEvent(new dom.window.Event("compositionstart"));
    const composing = new dom.window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composing, "isComposing", { value: true });
    queryInput().dispatchEvent(composing);
    const flaggedOnly = new dom.window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(flaggedOnly, "isComposing", { value: true });
    queryInput().dispatchEvent(flaggedOnly);
    expect(handlers.onFocusEditor).toHaveBeenCalledTimes(1);
  });

  it("查询框 Enter 不触发正文命令（无焦点回调、无异常）", () => {
    const { handlers } = setup();
    findButton().click();
    queryInput().dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(handlers.onFocusEditor).not.toHaveBeenCalled();
    expect(handlers.onSearchRequest).not.toHaveBeenCalled();
  });

  it("查询组合中拒绝关闭和大小写切换，保留稳定查询与焦点", () => {
    const { panel, handlers } = setup();
    findButton().click();
    typeQuery("foo");
    queryInput().focus();
    queryInput().dispatchEvent(new dom.window.Event("compositionstart"));
    queryInput().value = "pinyin";
    typeQuery("pinyin", { isComposing: true });

    expect(pointerDown(closeButton())).toBe(false);
    closeButton().click();
    expect(panel.isOpen).toBe(true);
    expect(panel.query).toBe("foo");
    expect(doc().activeElement).toBe(queryInput());

    caseInput().checked = false;
    caseInput().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(caseInput().checked).toBe(true);
    expect(panel.caseSensitive).toBe(true);
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(1);
  });

  it("组合期间的新文档重置延后清查询，收口后忽略晚到 final input", async () => {
    const { panel, handlers } = setup();
    findButton().click();
    typeQuery("stable");
    queryInput().dispatchEvent(new dom.window.Event("compositionstart"));
    queryInput().value = "候选草稿";

    panel.resetForNewDocument();
    expect(queryInput().value).toBe("候选草稿");
    expect(panel.query).toBe("stable");
    expect(resultsText()).toContain("输入查询");

    queryInput().dispatchEvent(new dom.window.Event("compositionend"));
    queryInput().value = "晚到终态";
    queryInput().dispatchEvent(
      new dom.window.InputEvent("input", { bubbles: true, isComposing: false }),
    );
    expect(queryInput().value).toBe("");
    expect(panel.query).toBe("");
    expect(handlers.onSearchRequest).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  });
});

describe("SearchPanel：编辑器 composition 守卫", () => {
  function composingSetup() {
    const ctx = setup();
    vi.mocked(ctx.handlers.isEditorComposing).mockReturnValue(true);
    return ctx;
  }

  it("组合中查找按钮 pointerdown 被阻止且 click 不打开面板", () => {
    const { panel } = composingSetup();
    expect(pointerDown(findButton())).toBe(false);
    findButton().click();
    expect(panel.isOpen).toBe(false);
    expect(
      doc().querySelector(".search-panel-status")?.textContent,
    ).toContain("完成中文输入");
    expect(
      doc().querySelector<HTMLElement>(".search-panel-status")!.closest("[hidden]"),
    ).toBeNull();
  });

  it("组合中关闭按钮 pointerdown 被阻止且 click 不回焦点", () => {
    const { panel, handlers } = composingSetup();
    findButton().click(); // 组合中打开同样被拒绝，面板保持关闭。
    expect(panel.isOpen).toBe(false);
    expect(doc().querySelector<HTMLElement>("#search-panel-body")!.hidden).toBe(true);
    expect(pointerDown(closeButton())).toBe(false);
    closeButton().click();
    expect(panel.isOpen).toBe(false);
    expect(handlers.onFocusEditor).not.toHaveBeenCalled();
  });

  it("组合中大小写开关被还原且不发请求", () => {
    const { panel, handlers } = composingSetup();
    findButton().click();
    typeQuery("foo");
    vi.mocked(handlers.onSearchRequest).mockClear();
    caseInput().checked = false;
    caseInput().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(caseInput().checked).toBe(true);
    expect(panel.caseSensitive).toBe(true);
    expect(handlers.onSearchRequest).not.toHaveBeenCalled();
  });
});

describe("SearchPanel：结果渲染（真实 searchSource 结果）", () => {
  it("计数与条目来自真实 searchSource；大小写一致", () => {
    const { panel } = setup();
    const raw = "Foo bar foo BAR\nsecond foo\n";
    findButton().click();
    typeQuery("foo");
    const sensitive = searchSource({ raw, revision: 2 }, "foo", {
      caseSensitive: true,
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 2, epoch: 0, raw },
      result: sensitive,
    });
    expect(resultsText()).toContain("2 处匹配");
    expect(doc().querySelectorAll(".search-panel-match")).toHaveLength(2);

    // 大小写不敏感重算。
    caseInput().checked = false;
    caseInput().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const insensitive = searchSource({ raw, revision: 2 }, "foo", {
      caseSensitive: false,
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 2, epoch: 0, raw },
      result: insensitive,
    });
    expect(resultsText()).toContain("3 处匹配");
  });

  it("超过上限时显式 truncated 文案，不冒充精确总数", () => {
    const { panel } = setup();
    const raw = `${"ha ".repeat(150)}`;
    findButton().click();
    typeQuery("ha");
    const result = searchSource({ raw, revision: 0 }, "ha", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    expect(result.truncated).toBe(true);
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    expect(resultsText()).toContain(
      `匹配至少 ${SEARCH_MAX_RESULTS} 处，仅显示前 ${SEARCH_MAX_RESULTS} 处`,
    );
    expect(doc().querySelectorAll(".search-panel-match")).toHaveLength(SEARCH_MAX_RESULTS);
  });

  it("恶意文本只按 textContent 渲染，无 HTML 注入", () => {
    const { panel } = setup();
    const raw = "<img src=x onerror=alert(1)> <script>alert(2)</script> tail";
    findButton().click();
    typeQuery("<script>");
    const result = searchSource({ raw, revision: 0 }, "<script>", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    expect(doc().querySelectorAll(".search-panel-match")).toHaveLength(1);
    expect(doc().querySelector(".search-panel-match script")).toBeNull();
    expect(doc().querySelector(".search-panel-match img")).toBeNull();
    expect(doc().querySelector(".search-panel-match mark")?.textContent).toContain(
      "<script>",
    );
  });

  it("emoji 字素不被摘要切断：命中保持完整字素", () => {
    const { panel } = setup();
    const raw = "prefix 👨‍💻 family text 👨‍💻 suffix";
    findButton().click();
    typeQuery("👨‍💻");
    const result = searchSource({ raw, revision: 0 }, "👨‍💻", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    const marks = Array.from(doc().querySelectorAll(".search-panel-match mark"));
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark.textContent).toBe("👨‍💻");
  });

  it("超长命中只显示字素安全的首尾有限预览", () => {
    const { panel } = setup();
    const raw = `BEGIN${"a".repeat(10_000)}END`;
    const result = searchSource({ raw, revision: 0 }, raw, {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    const hit = doc().querySelector(".search-panel-match mark")?.textContent ?? "";
    expect(hit.length).toBeLessThanOrEqual(128);
    expect(hit.startsWith("BEGIN")).toBe(true);
    expect(hit.endsWith("END")).toBe(true);
  });

  it("摘要上下文遇到超长组合字素时整簇省略，不从组合符开始", () => {
    const { panel } = setup();
    const raw = `Xa${"\u0301".repeat(100)}needleZ`;
    const result = searchSource({ raw, revision: 0 }, "needle", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    const text = doc().querySelector(".search-panel-match")?.textContent ?? "";
    expect(text.replace(/^…/, "")).not.toMatch(/^\p{M}/u);
  });

  it("空查询与错误态文案；rejected 不计入计数也不成条目", () => {
    const { panel } = setup();
    findButton().click();
    panel.update({ kind: "idle" });
    expect(resultsText()).toContain("输入查询");
    panel.update({ kind: "error", message: "boom" });
    expect(resultsText()).toContain("查找失败：boom");

    // 构造 rejected：查询横跨 CRLF 内部边界会被 searchSource 拒绝。
    const raw = "ab\r\ncd";
    const result = searchSource({ raw, revision: 0 }, "b\r", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    expect(result.matches).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(resultsText()).toContain("0 处匹配");
    expect(resultsText()).toContain("被跳过");
    expect(doc().querySelectorAll(".search-panel-match")).toHaveLength(0);
  });

  it("每个结果视图都声明基于 Markdown 原文且定位/替换未开放", () => {
    const { panel } = setup();
    const raw = "hello world";
    findButton().click();
    typeQuery("hello");
    const result = searchSource({ raw, revision: 0 }, "hello", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    expect(resultsText()).toContain("结果基于 Markdown 原文");
    expect(resultsText()).toContain("尚未开放");
    // 不渲染任何定位/替换控件。
    expect(doc().querySelector(".search-panel-results button")).toBeNull();
  });
});

describe("SearchPanel：状态归属与副作用", () => {
  it("update 不改变焦点与选区", () => {
    const { panel } = setup();
    const foreign = doc().createElement("input");
    doc().body.append(foreign);
    foreign.focus();
    const raw = "needle here";
    const result = searchSource({ raw, revision: 0 }, "needle", {
      maxResults: SEARCH_MAX_RESULTS,
    });
    panel.update({
      kind: "document",
      binding: { documentID: "d", revision: 0, epoch: 0, raw },
      result,
    });
    expect(doc().activeElement).toBe(foreign);
  });

  it("resetForNewDocument 清结果与绑定、查询/大小写回默认，保留展开", () => {
    const { panel } = setup();
    findButton().click();
    typeQuery("foo");
    caseInput().checked = false;
    caseInput().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(panel.query).toBe("foo");
    expect(panel.caseSensitive).toBe(false);

    panel.resetForNewDocument();
    expect(panel.isOpen).toBe(true);
    expect(panel.query).toBe("");
    expect(panel.caseSensitive).toBe(true);
    expect(queryInput().value).toBe("");
    expect(caseInput().checked).toBe(true);
    expect(resultsText()).toContain("输入查询");
  });

  it("destroy 移除全部 DOM，不残留面板节点", () => {
    const { panel } = setup();
    expect(doc().querySelector(".search-root")).not.toBeNull();
    panel.destroy();
    expect(doc().querySelector(".search-root")).toBeNull();
  });
});

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDocument } from "./document-analysis";
import { DocumentAnalysisPanel, type AnalysisPanelState } from "./document-analysis-panel";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function stubDom(): { parent: HTMLElement } {
  const dom = new JSDOM("<!doctype html><main id='app'></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector<HTMLElement>("#app");
  if (!parent) throw new Error("Missing test parent");
  return { parent };
}

function documentState(raw: string): AnalysisPanelState {
  return {
    kind: "document",
    documentID: "doc-1",
    revision: 3,
    epoch: 7,
    raw,
    analysis: analyzeDocument({ raw, revision: 3 }),
  };
}

function headingTexts(panel: DocumentAnalysisPanel): string[] {
  return Array.from(panel.element.querySelectorAll(".analysis-panel-heading")).map(
    (item) => item.textContent,
  );
}

function statValue(panel: DocumentAnalysisPanel, term: string): string {
  const terms = Array.from(panel.element.querySelectorAll(".analysis-panel-stats dt"));
  const index = terms.findIndex((node) => node.textContent === term);
  const values = panel.element.querySelectorAll(".analysis-panel-stats dd");
  return values[index]?.textContent ?? "";
}

describe("DocumentAnalysisPanel：真实分析 + 真实 DOM", () => {
  it("按层级渲染大纲并保留重复标题", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    panel.update(documentState("# 甲\n\n## 乙\n\n## 乙\n\n正文段落。\n"));
    const items = Array.from(panel.element.querySelectorAll(".analysis-panel-heading"));
    expect(items.map((item) => item.className)).toEqual([
      "analysis-panel-heading analysis-panel-level-1",
      "analysis-panel-heading analysis-panel-level-2",
      "analysis-panel-heading analysis-panel-level-2",
    ]);
    expect(headingTexts(panel)).toEqual(["甲", "乙", "乙"]);
  });

  it("显示内容口径的字符数与字数，并给出可理解的计数规则说明", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    const raw = "# 标题\n\nhello 世界123。\n";
    panel.update(documentState(raw));
    const expected = analyzeDocument({ raw, revision: 3 });
    expect(statValue(panel, "字符数")).toBe(String(expected.content.characters));
    expect(statValue(panel, "字数")).toBe(String(expected.content.writingUnits));
    const hint = panel.element.querySelector(".analysis-panel-hint")?.textContent ?? "";
    expect(hint).toContain("组合表情算一个字符");
    expect(hint).toContain("中文逐字计数");
    expect(hint).toContain("标点与表情不计入字数");
  });

  it("空文档与无标题文档有明确说明", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    panel.update(documentState(""));
    expect(panel.element.querySelector(".analysis-panel-note")?.textContent).toBe(
      "空文档：暂无标题",
    );
    panel.update(documentState("只有正文，没有标题。\n"));
    expect(panel.element.querySelector(".analysis-panel-note")?.textContent).toBe(
      "本文档没有标题",
    );
  });

  it("恶意标题只按字面文本显示，不执行 HTML 或加载资源", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    panel.update(documentState('# <img src=x onerror="alert(1)"><script>alert(2)</script>\n'));
    expect(headingTexts(panel)).toEqual([
      '<img src=x onerror="alert(1)"><script>alert(2)</script>',
    ]);
    expect(panel.element.querySelectorAll("img, script, iframe")).toHaveLength(0);
  });

  it("标题是键盘可达按钮，并按序发送绑定快照与原文范围", () => {
    const { parent } = stubDom();
    const requests: unknown[] = [];
    const panel = new DocumentAnalysisPanel(parent, (snapshot, target) => {
      requests.push({ snapshot, target });
      return { ok: true };
    });
    panel.update(documentState("# 同名\n\n# 同名\n"));
    const buttons = panel.element.querySelectorAll<HTMLButtonElement>(".analysis-panel-heading");
    expect(buttons).toHaveLength(2);
    expect(buttons[1].tagName).toBe("BUTTON");
    buttons[1].click();
    expect(requests).toEqual([{
      snapshot: { documentID: "doc-1", revision: 3, epoch: 7, raw: "# 同名\n\n# 同名\n" },
      target: { level: 1, text: "同名", start: 6, end: 10, index: 1 },
    }]);
  });

  it("pointerdown 不提前夺走编辑器焦点，失败在面板局部可见", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent, () => ({ ok: false, message: "组合输入中" }));
    panel.update(documentState("# 甲\n"));
    const editor = document.createElement("textarea");
    parent.prepend(editor);
    editor.focus();
    editor.setSelectionRange(0, 0);
    const button = panel.element.querySelector<HTMLButtonElement>(".analysis-panel-heading")!;
    const pointer = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    expect(button.dispatchEvent(pointer)).toBe(false);
    expect(document.activeElement).toBe(editor);
    button.click();
    expect(panel.element.querySelector(".analysis-panel-navigation-status")?.textContent).toBe("组合输入中");
  });

  it("错误态显示明确提示且不抛出", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    panel.update({ kind: "error", message: "内部统计失败" });
    const note = panel.element.querySelector(".analysis-panel-note");
    expect(note?.textContent).toBe("分析失败：内部统计失败");
    expect(note?.className).toContain("analysis-panel-error");
  });

  it("收起/展开切换 aria 状态与可见性，不外泄副作用", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    const toggle = panel.element.querySelector<HTMLButtonElement>(".analysis-panel-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-controls")).toBe("analysis-panel-body");

    toggle?.click();
    expect(panel.isCollapsed).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toBe("展开面板");
    expect(panel.element.classList.contains("analysis-panel-collapsed")).toBe(true);
    expect(
      panel.element
        .querySelector("#analysis-panel-body")
        ?.classList.contains("analysis-panel-collapsed"),
    ).toBe(true);

    toggle?.click();
    expect(panel.isCollapsed).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.textContent).toBe("收起面板");
    expect(panel.element.classList.contains("analysis-panel-collapsed")).toBe(false);
  });

  it("收起 root 在宽窗释放宽度、窄窗释放高度的 CSS 契约存在", () => {
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.analysis-panel\.analysis-panel-collapsed\s*\{[^}]*flex-basis:\s*96px/s);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.analysis-panel\.analysis-panel-collapsed\s*\{[^}]*max-height:\s*44px/s);
  });

  it("更新不偷焦点、不改既有选区", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    const outside = document.createElement("input");
    outside.value = "abcdef";
    parent.append(outside);
    outside.focus();
    outside.setSelectionRange(1, 2);
    panel.update(documentState("# 甲\n\n正文。\n"));
    expect(document.activeElement).toBe(outside);
    expect(outside.selectionStart).toBe(1);
    expect(outside.selectionEnd).toBe(2);
  });

  it("重复更新幂等，destroy 移除元素", () => {
    const { parent } = stubDom();
    const panel = new DocumentAnalysisPanel(parent);
    for (let i = 0; i < 3; i += 1) panel.update(documentState("# 甲\n"));
    expect(headingTexts(panel)).toEqual(["甲"]);
    const root = panel.element;
    panel.destroy();
    expect(root.isConnected).toBe(false);
    expect(parent.contains(root)).toBe(false);
  });
});

import type { DocumentAnalysis } from "./document-analysis";
import type {
  HeadingNavigationResult,
  HeadingNavigationTarget,
} from "./heading-navigation";

/**
 * 大纲与统计只读面板：真实 DOM 组件，只通过 createElement/textContent 等
 * 安全 API 显示分析结果，不执行 HTML、不加载资源。
 *
 * 组件不拥有任何计时器与焦点逻辑：更新（update）只重绘自身内容，
 * 不会移动焦点、选区或触发编辑器副作用。标题定位（滚动/光标跳转）
 * 导航由调用方执行；面板只发出绑定分析快照的请求并显示局部结果。
 */

export type AnalysisPanelState =
  | { kind: "empty"; message: string }
  | { kind: "document"; documentID: string; revision: number; epoch: number; raw: string; analysis: DocumentAnalysis }
  | { kind: "error"; message: string };

export class DocumentAnalysisPanel {
  private readonly body: HTMLElement;
  private collapsed = false;

  constructor(
    parent: HTMLElement,
    private readonly onNavigate: (
      snapshot: { documentID: string; revision: number; epoch: number; raw: string },
      target: HeadingNavigationTarget,
    ) => HeadingNavigationResult = () => ({ ok: false, message: "导航尚未连接" }),
  ) {
    const root = document.createElement("aside");
    root.className = "analysis-panel";

    const header = document.createElement("div");
    header.className = "analysis-panel-header";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "analysis-panel-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-controls", "analysis-panel-body");
    toggle.textContent = "收起面板";
    toggle.addEventListener("click", () => this.setCollapsed(!this.collapsed));

    const title = document.createElement("span");
    title.className = "analysis-panel-title";
    title.textContent = "大纲与统计";

    header.append(toggle, title);

    this.body = document.createElement("div");
    this.body.id = "analysis-panel-body";
    this.body.className = "analysis-panel-body";

    root.append(header, this.body);
    this.root = root;
    this.toggleButton = toggle;
    parent.append(root);
    this.update({ kind: "empty", message: "尚未打开文档" });
  }

  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;

  get element(): HTMLElement {
    return this.root;
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
    this.toggleButton.textContent = collapsed ? "展开面板" : "收起面板";
    this.body.classList.toggle("analysis-panel-collapsed", collapsed);
    this.root.classList.toggle("analysis-panel-collapsed", collapsed);
  }

  /** 只重绘面板内容；不触碰焦点、选区或编辑器状态。 */
  update(state: AnalysisPanelState): void {
    this.body.replaceChildren();
    if (state.kind === "empty" || state.kind === "error") {
      const note = document.createElement("p");
      note.className =
        state.kind === "error" ? "analysis-panel-note analysis-panel-error" : "analysis-panel-note";
      note.textContent = state.kind === "error" ? `分析失败：${state.message}` : state.message;
      this.body.append(note);
      return;
    }
    this.body.append(this.renderOutline(state), this.renderStats(state.analysis));
  }

  destroy(): void {
    this.root.remove();
  }

  private renderOutline(state: Extract<AnalysisPanelState, { kind: "document" }>): HTMLElement {
    const { analysis } = state;
    const section = document.createElement("section");
    section.className = "analysis-panel-section";
    section.setAttribute("aria-label", "大纲");

    const heading = document.createElement("h2");
    heading.textContent = "大纲";
    section.append(heading);

    if (analysis.headings.length === 0) {
      const note = document.createElement("p");
      note.className = "analysis-panel-note";
      note.textContent =
        analysis.raw.characters === 0 ? "空文档：暂无标题" : "本文档没有标题";
      section.append(note);
      return section;
    }

    const list = document.createElement("ul");
    list.className = "analysis-panel-outline";
    const feedback = document.createElement("p");
    feedback.className = "analysis-panel-note analysis-panel-navigation-status";
    feedback.setAttribute("role", "status");
    feedback.hidden = true;
    for (const [index, entry] of analysis.headings.entries()) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `analysis-panel-heading analysis-panel-level-${entry.level}`;
      // 只读显示：textContent 不会执行 HTML；重复标题原样保留。
      button.textContent = entry.text;
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const result = this.onNavigate(
          { documentID: state.documentID, revision: state.revision, epoch: state.epoch, raw: state.raw },
          { ...entry, index },
        );
        feedback.hidden = result.ok;
        feedback.textContent = result.ok ? "" : result.message;
      });
      item.append(button);
      list.append(item);
    }
    section.append(list, feedback);
    return section;
  }

  private renderStats(analysis: DocumentAnalysis): HTMLElement {
    const section = document.createElement("section");
    section.className = "analysis-panel-section";
    section.setAttribute("aria-label", "统计");

    const heading = document.createElement("h2");
    heading.textContent = "统计";
    section.append(heading);

    const list = document.createElement("dl");
    list.className = "analysis-panel-stats";

    const charactersTerm = document.createElement("dt");
    charactersTerm.textContent = "字符数";
    const charactersValue = document.createElement("dd");
    charactersValue.textContent = String(analysis.content.characters);
    list.append(charactersTerm, charactersValue);

    const unitsTerm = document.createElement("dt");
    unitsTerm.textContent = "字数";
    const unitsValue = document.createElement("dd");
    unitsValue.textContent = String(analysis.content.writingUnits);
    list.append(unitsTerm, unitsValue);
    section.append(list);

    const hint = document.createElement("p");
    hint.className = "analysis-panel-hint";
    hint.textContent =
      "字符数按内容文本计（不计空白，组合表情算一个字符）；" +
      "字数中文逐字计数，英文与数字的连续串按一个词计，标点与表情不计入字数。";
    section.append(hint);
    return section;
  }
}

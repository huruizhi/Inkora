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
  private readonly stats: HTMLElement;
  private readonly statsToggle: HTMLButtonElement;
  private readonly statsSummary: HTMLElement;
  private readonly toolbarElements: readonly HTMLElement[];
  private collapsed = true;
  private statsExpanded = false;

  constructor(
    parent: HTMLElement,
    private readonly onNavigate: (
      snapshot: { documentID: string; revision: number; epoch: number; raw: string },
      target: HeadingNavigationTarget,
    ) => HeadingNavigationResult = () => ({ ok: false, message: "导航尚未连接" }),
    private readonly canToggle: () => boolean = () => true,
    toolbarParent?: HTMLElement,
  ) {
    const root = document.createElement("aside");
    root.className = "analysis-panel";

    const toolbar = toolbarParent ?? root;

    const statsToggle = document.createElement("button");
    statsToggle.type = "button";
    statsToggle.className = "analysis-stats-toggle";
    statsToggle.setAttribute("aria-expanded", "false");
    statsToggle.setAttribute("aria-controls", "analysis-stats-popover");
    statsToggle.setAttribute("aria-label", "显示文档统计");
    const statsSummary = document.createElement("span");
    statsSummary.className = "analysis-stats-summary";
    statsSummary.textContent = "0 分钟";
    const statsChevron = document.createElement("span");
    statsChevron.className = "analysis-stats-chevron";
    statsChevron.setAttribute("aria-hidden", "true");
    statsToggle.append(statsSummary, statsChevron);
    statsToggle.addEventListener("pointerdown", event => event.preventDefault());
    statsToggle.addEventListener("click", () => {
      if (this.canToggle()) this.setStatsExpanded(!this.statsExpanded);
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "analysis-panel-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "analysis-panel-body");
    toggle.setAttribute("aria-label", "展开大纲");
    toggle.title = "大纲";
    const outlineIcon = document.createElement("span");
    outlineIcon.className = "corner-icon corner-icon-outline";
    outlineIcon.setAttribute("aria-hidden", "true");
    toggle.append(outlineIcon);
    toggle.addEventListener("pointerdown", event => event.preventDefault());
    toggle.addEventListener("click", () => {
      if (this.canToggle()) this.setCollapsed(!this.collapsed);
    });

    this.body = document.createElement("div");
    this.body.id = "analysis-panel-body";
    this.body.className = "analysis-panel-body";

    this.stats = document.createElement("div");
    this.stats.id = "analysis-stats-popover";
    this.stats.className = "analysis-stats-popover";
    this.stats.setAttribute("aria-label", "文档统计");
    this.stats.hidden = true;
    root.append(this.body);
    toolbar.append(statsToggle, toggle, this.stats);
    this.root = root;
    this.toggleButton = toggle;
    this.statsToggle = statsToggle;
    this.statsSummary = statsSummary;
    this.toolbarElements = [statsToggle, toggle, this.stats];
    parent.append(root);
    this.setCollapsed(true);
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
    this.toggleButton.setAttribute("aria-label", collapsed ? "展开大纲" : "收起大纲");
    this.toggleButton.title = collapsed ? "大纲" : "收起大纲";
    this.body.hidden = collapsed;
    this.body.classList.toggle("analysis-panel-collapsed", collapsed);
    this.root.classList.toggle("analysis-panel-collapsed", collapsed);
  }

  /** 只重绘面板内容；不触碰焦点、选区或编辑器状态。 */
  update(state: AnalysisPanelState): void {
    this.body.replaceChildren();
    this.stats.replaceChildren();
    if (state.kind === "empty" || state.kind === "error") {
      this.statsSummary.textContent = "0 分钟";
      const note = document.createElement("p");
      note.className =
        state.kind === "error" ? "analysis-panel-note analysis-panel-error" : "analysis-panel-note";
      note.textContent = state.kind === "error" ? `分析失败：${state.message}` : state.message;
      this.body.append(note);
      const status = note.cloneNode(true);
      this.stats.append(status);
      return;
    }
    this.statsSummary.textContent = `${readingMinutes(state.analysis.content.writingUnits)} 分钟`;
    this.body.append(this.renderOutline(state));
    this.stats.append(this.renderStats(state.analysis, state.raw));
  }

  destroy(): void {
    this.root.remove();
    for (const element of this.toolbarElements) element.remove();
  }

  private setStatsExpanded(expanded: boolean): void {
    this.statsExpanded = expanded;
    this.stats.hidden = !expanded;
    this.statsToggle.setAttribute("aria-expanded", String(expanded));
    this.statsToggle.setAttribute("aria-label", expanded ? "隐藏文档统计" : "显示文档统计");
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

  private renderStats(analysis: DocumentAnalysis, raw: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "analysis-panel-section";
    section.setAttribute("aria-label", "统计");

    const list = document.createElement("dl");
    list.className = "analysis-panel-stats";

    const linesTerm = document.createElement("dt");
    linesTerm.textContent = "行数";
    const linesValue = document.createElement("dd");
    linesValue.textContent = String(lineCount(raw));
    list.append(linesTerm, linesValue);

    const unitsTerm = document.createElement("dt");
    unitsTerm.textContent = "字数";
    const unitsValue = document.createElement("dd");
    unitsValue.textContent = String(analysis.content.writingUnits);
    list.append(unitsTerm, unitsValue);

    const charactersTerm = document.createElement("dt");
    charactersTerm.textContent = "字符数";
    const charactersValue = document.createElement("dd");
    charactersValue.textContent = String(analysis.content.characters);
    list.append(charactersTerm, charactersValue);
    section.append(list);

    const hint = document.createElement("p");
    hint.className = "analysis-panel-hint";
    hint.textContent =
      "字符数按内容文本计（不计空白，组合表情算一个字符）；" +
      "字数中文逐字计数，英文与数字的连续串按一个词计，标点与表情不计入字数。";
    const rules = document.createElement("details");
    rules.className = "analysis-panel-count-rules";
    const summary = document.createElement("summary");
    summary.textContent = "计数规则";
    rules.append(summary, hint);
    section.append(rules);
    return section;
  }
}

function lineCount(raw: string): number {
  if (raw.length === 0) return 0;
  let lines = 1;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\n") lines += 1;
    else if (raw[index] === "\r") {
      lines += 1;
      if (raw[index + 1] === "\n") index += 1;
    }
  }
  return lines;
}

function readingMinutes(writingUnits: number): number {
  if (writingUnits === 0) return 0;
  return Math.max(1, Math.ceil(writingUnits / 500));
}

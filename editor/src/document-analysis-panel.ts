import { SidebarChrome, SidebarLayout } from "./sidebar-chrome";
import type { DocumentAnalysis } from "./document-analysis";
import { SidebarLibrary, type SidebarCatalog, type SidebarLibraryAction, type SidebarSearchResult } from "./sidebar-library";
import type {
  HeadingNavigationResult,
  HeadingNavigationTarget,
} from "./heading-navigation";

/**
 * 大纲与统计只读面板：真实 DOM 组件，只通过 createElement/textContent 等
 * 安全 API 显示分析结果，不执行 HTML、不加载资源。
 *
 * Chrome/Layout只管理呈现计时器；更新（update）只重绘自身内容，
 * 不会移动焦点、选区或触发编辑器副作用。标题定位（滚动/光标跳转）
 * 导航由调用方执行；面板只发出绑定分析快照的请求并显示局部结果。
 */

export type AnalysisPanelState =
  | { kind: "empty"; message: string }
  | { kind: "document"; documentID: string; revision: number; epoch: number; raw: string; analysis: DocumentAnalysis }
  | { kind: "error"; message: string };

export class DocumentAnalysisPanel {
  private readonly body: HTMLElement;
  private readonly outlineBody: HTMLElement;
  private readonly header: HTMLElement;
  private readonly viewToggle: HTMLButtonElement;
  private readonly sidebarTitle: HTMLElement;
  private readonly searchToggle: HTMLButtonElement;
  private readonly outlineQuery: HTMLInputElement;
  private readonly library: SidebarLibrary;
  private view: "outline" | "files" = "outline";
  private outlineComposing = false;
  private outlineFilter = "";
  private currentState?: AnalysisPanelState;
  private readonly stats: HTMLElement;
  private readonly statsToggle: HTMLButtonElement;
  private readonly statsSummary: HTMLElement;
  private readonly toolbarElements: readonly HTMLElement[];
  private readonly chrome?: SidebarChrome;
  private readonly layout: SidebarLayout;
  private selectedStat = "time";
  private statValues: Record<string, string> = { time: "0 分钟" };
  private destroyed = false;
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
    onLibraryAction: (action: SidebarLibraryAction) => void = () => {
      this.library.showError("请在Inkora应用中打开侧栏文件夹。");
    },
  ) {
    const root = document.createElement("aside");
    root.className = "analysis-panel";
    root.setAttribute("aria-label", "导航侧栏");

    this.header = document.createElement("header");
    this.header.className = "sidebar-header";
    this.viewToggle = document.createElement("button");
    this.viewToggle.type = "button";
    this.viewToggle.className = "sidebar-view-toggle";
    this.viewToggle.addEventListener("pointerdown", event => event.preventDefault());
    this.viewToggle.addEventListener("click", () => {
      if (!this.canToggle() || this.isInputComposing) return;
      if (this.view === "files" && this.library.isSearching) this.library.setSearchOpen(false);
      this.view = this.view === "outline" ? "files" : "outline";
      this.updateHeader();
    });
    this.sidebarTitle = document.createElement("span");
    this.sidebarTitle.className = "sidebar-title";
    this.searchToggle = document.createElement("button");
    this.searchToggle.type = "button";
    this.searchToggle.className = "sidebar-search-toggle";
    this.searchToggle.textContent = "⌕";
    this.searchToggle.addEventListener("pointerdown", event => event.preventDefault());
    this.searchToggle.addEventListener("click", () => {
      if (!this.canToggle() || this.isInputComposing) return;
      if (this.view === "files") this.library.setSearchOpen(true);
      else {
        this.outlineQuery.hidden = !this.outlineQuery.hidden;
        if (!this.outlineQuery.hidden) this.outlineQuery.focus();
      }
    });
    this.header.append(this.viewToggle, this.sidebarTitle, this.searchToggle);
    this.outlineQuery = document.createElement("input");
    this.outlineQuery.type = "search";
    this.outlineQuery.className = "sidebar-outline-query";
    this.outlineQuery.placeholder = "搜索标题";
    this.outlineQuery.setAttribute("aria-label", "搜索大纲标题");
    this.outlineQuery.hidden = true;
    this.outlineQuery.addEventListener("compositionstart", () => { this.outlineComposing = true; });
    this.outlineQuery.addEventListener("compositionend", () => {
      this.outlineComposing = false;
      this.outlineFilter = this.outlineQuery.value;
      this.renderCurrentOutline();
    });
    this.outlineQuery.addEventListener("input", event => {
      if (this.outlineComposing || (event as InputEvent).isComposing) return;
      this.outlineFilter = this.outlineQuery.value;
      this.renderCurrentOutline();
    });

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
      if (this.canToggle() && !this.isInputComposing) this.setStatsExpanded(!this.statsExpanded);
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "analysis-panel-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "analysis-panel-body");
    toggle.setAttribute("aria-label", "展开大纲");
    toggle.title = "大纲";
    const outlineIcon = document.createElement("span");
    outlineIcon.className = "corner-icon corner-icon-sidebar";
    outlineIcon.setAttribute("aria-hidden", "true");
    toggle.append(outlineIcon);
    toggle.addEventListener("pointerdown", event => event.preventDefault());
    toggle.addEventListener("click", () => {
      if (this.canToggle() && !this.isInputComposing) this.setCollapsed(!this.collapsed);
    });

    this.body = document.createElement("div");
    this.body.id = "analysis-panel-body";
    this.body.className = "analysis-panel-body";
    this.outlineBody = document.createElement("div");
    this.outlineBody.className = "sidebar-outline-content";
    this.library = new SidebarLibrary(onLibraryAction, canToggle, () => this.updateHeader());
    this.body.append(this.outlineBody, this.library.element);

    this.stats = document.createElement("div");
    this.stats.id = "analysis-stats-popover";
    this.stats.className = "analysis-stats-popover";
    this.stats.setAttribute("aria-label", "文档统计");
    this.stats.hidden = true;
    root.append(this.header, this.outlineQuery, this.body);
    toolbar.append(statsToggle, toggle, this.stats);
    this.root = root;
    this.layout = new SidebarLayout(root);
    if (toolbarParent) this.chrome = new SidebarChrome(toolbarParent);
    this.toggleButton = toggle;
    this.statsToggle = statsToggle;
    this.statsSummary = statsSummary;
    this.toolbarElements = [statsToggle, toggle, this.stats];
    parent.append(root);
    this.setCollapsed(true);
    this.updateHeader();
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

  get isInputComposing(): boolean { return this.outlineComposing || this.library.isInputComposing; }
  get ownsInputFocus(): boolean { return document.activeElement === this.outlineQuery || this.library.ownsInputFocus; }
  resetWorkspace(): void { this.library.reset(); }
  setCurrentFile(fileID?: string): void { this.library.setCurrentFile(fileID); }
  updateWorkspace(catalog: SidebarCatalog): void { this.library.update(catalog); }
  updateFileSearch(query: string, result: SidebarSearchResult): void { this.library.showSearch(query, result); }
  showWorkspaceError(message: string): void { this.library.showError(message); }

  setCollapsed(collapsed: boolean): void {
    if (this.isInputComposing || this.destroyed || this.currentState !== undefined && !this.canToggle()) return;
    this.collapsed = collapsed;
    this.layout.setCollapsed(collapsed);
    this.toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
    this.updateToggleLabel();
    this.body.hidden = collapsed;
    this.header.hidden = collapsed || this.view === "files" && this.library.isSearching;
    if (collapsed) this.outlineQuery.hidden = true;
    this.body.classList.toggle("analysis-panel-collapsed", collapsed);
    this.root.classList.toggle("analysis-panel-collapsed", collapsed);
  }

  /** 只重绘面板内容；不触碰焦点、选区或编辑器状态。 */
  update(state: AnalysisPanelState): void {
    this.currentState = state;
    this.renderCurrentOutline();
    for (const child of Array.from(this.stats.children)) if (!child.classList.contains("sidebar-stat-choices")) child.remove();
    if (state.kind === "empty" || state.kind === "error") {
      this.statsSummary.textContent = this.selectedStat === "lines" ? "0 行" : this.selectedStat === "words" ? "0 词" : this.selectedStat === "characters" ? "0 字符" : "0 分钟";
      this.statsToggle.onkeydown = null;
      const note = document.createElement("p");
      note.className =
        state.kind === "error" ? "analysis-panel-note analysis-panel-error" : "analysis-panel-note";
      note.textContent = state.kind === "error" ? `分析失败：${state.message}` : state.message;
      this.stats.querySelector(".sidebar-stat-choices")?.remove();
      const status = note.cloneNode(true);
      this.stats.append(status);
      return;
    }
    this.statsSummary.textContent = `${readingMinutes(state.analysis.content.writingUnits)} 分钟`;
    this.stats.append(this.renderStats(state.analysis, state.raw));
    this.renderStatChoices(state.analysis, state.raw);
  }

  private updateToggleLabel(): void {
    const name = this.view === "outline" ? "大纲" : this.library.isSearching ? "文件搜索" : "文档列表";
    this.toggleButton.setAttribute("aria-label", `${this.collapsed ? "展开" : "收起"}${name}`);
    this.toggleButton.title = this.collapsed ? name : `收起${name}`;
  }

  private updateHeader(): void {
    this.updateToggleLabel();
    this.header.hidden = this.collapsed || this.view === "files" && this.library.isSearching;
    this.sidebarTitle.textContent = this.view === "outline" ? "大纲" : "文档";
    const action = this.view === "outline" ? "切换到文档列表视图" : "切换到大纲视图";
    this.viewToggle.setAttribute("aria-label", action);
    this.viewToggle.title = action;
    this.viewToggle.textContent = this.view === "outline" ? "▤" : "☷";
    this.searchToggle.setAttribute("aria-label", this.view === "outline" ? "搜索大纲标题" : "搜索文件夹内容");
    this.searchToggle.title = this.view === "outline" ? "搜索大纲标题" : "搜索文件夹内容";
    this.library.element.hidden = this.view !== "files";
    this.outlineBody.hidden = this.view !== "outline";
    if (this.view !== "outline") this.outlineQuery.hidden = true;
  }

  private renderCurrentOutline(): void {
    this.outlineBody.replaceChildren();
    const state = this.currentState;
    if (!state) return;
    if (state.kind === "document") this.outlineBody.append(this.renderOutline(state));
    else {
      const note = document.createElement("p");
      note.className = state.kind === "error" ? "analysis-panel-note analysis-panel-error" : "analysis-panel-note";
      note.textContent = state.kind === "error" ? `分析失败：${state.message}` : state.message;
      this.outlineBody.append(note);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.chrome?.destroy();
    this.layout.destroy();
    this.library.destroy();
    this.root.remove();
    for (const element of this.toolbarElements) element.remove();
  }

  private setStatsExpanded(expanded: boolean): void {
    this.statsExpanded = expanded;
    this.chrome?.setMenuOpen(expanded);
    this.stats.hidden = !expanded;
    this.statsToggle.setAttribute("aria-expanded", String(expanded));
    this.statsToggle.setAttribute("aria-label", expanded ? "隐藏文档统计" : "显示文档统计");
  }

  private renderOutline(state: Extract<AnalysisPanelState, { kind: "document" }>): HTMLElement {
    const { analysis } = state;
    const section = document.createElement("section");
    section.className = "analysis-panel-section";
    section.setAttribute("aria-label", "大纲");

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
      if (this.outlineFilter && !entry.text.toLocaleLowerCase().includes(this.outlineFilter.toLocaleLowerCase())) continue;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `analysis-panel-heading analysis-panel-level-${entry.level}`;
      // 只读显示：textContent 不会执行 HTML；重复标题原样保留。
      button.textContent = entry.text;
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!button.isConnected || this.destroyed || this.currentState !== state) return;
        if (this.isInputComposing || !this.canToggle()) {
          feedback.hidden = false;
          feedback.textContent = "请先完成中文输入或完成查找输入，再定位标题";
          return;
        }
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
    if (!list.children.length) {
      feedback.hidden = false;
      feedback.textContent = "没有匹配的标题";
    }
    section.append(list, feedback);
    return section;
  }

  private renderStatChoices(analysis: DocumentAnalysis, raw: string): void {
    this.statValues = { time: `${readingMinutes(analysis.content.writingUnits)} 分钟`, lines: `${lineCount(raw)} 行`, words: `${analysis.content.writingUnits} 词`, characters: `${analysis.content.characters} 字符` };
    this.statsSummary.textContent = this.statValues[this.selectedStat];
    this.statsToggle.setAttribute("aria-haspopup", "menu");
    const existing = this.stats.querySelector<HTMLElement>(".sidebar-stat-choices");
    if (existing) {
      const labels: Record<string, string> = { time: "阅读时间", lines: "行数", words: "词数", characters: "字符数" };
      for (const button of existing.querySelectorAll<HTMLButtonElement>("button")) button.textContent = `${labels[button.dataset.stat!]} ${this.statValues[button.dataset.stat!]}`;
      return;
    }
    const menu = document.createElement("div");
    menu.className = "sidebar-stat-choices";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "选择统计口径");
    for (const [key, label] of [["time", "阅读时间"], ["lines", "行数"], ["words", "词数"], ["characters", "字符数"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitemradio");
      button.dataset.stat = key;
      button.textContent = `${label} ${this.statValues[key]}`;
      button.setAttribute("aria-checked", String(key === this.selectedStat));
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", () => {
        if (!button.isConnected || this.destroyed || this.isInputComposing || !this.canToggle()) return;
        this.selectedStat = key;
        this.statsSummary.textContent = this.statValues[key];
        for (const item of menu.querySelectorAll("button")) item.setAttribute("aria-checked", String(item === button));
        const restore = menu.contains(document.activeElement);
        this.setStatsExpanded(false);
        if (restore) this.statsToggle.focus();
      });
      menu.append(button);
    }
    menu.addEventListener("keydown", event => {
      const items = Array.from(menu.querySelectorAll("button"));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); this.setStatsExpanded(false); this.statsToggle.focus(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        items[next].focus();
      }
    });
    this.statsToggle.onkeydown = event => {
      if (["ArrowDown", "ArrowUp"].includes(event.key) && this.canToggle() && !this.isInputComposing) {
        event.preventDefault(); this.setStatsExpanded(true);
        (menu.querySelector('[aria-checked="true"]') as HTMLElement)?.focus();
      }
    };
    this.stats.prepend(menu);
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

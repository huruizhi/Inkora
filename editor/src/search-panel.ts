import type { SearchDirection, SourceSearchResult } from "./source-search";

/**
 * 当前文档查找面板（阶段 B）：复用 source-search 纯函数的结果列表，
 * 安全呈现查询，并把显式源码导航意图交给调用方复核；不做替换。
 *
 * 组件约束（INK-M1-009）：
 * - 全部内容经 createElement/textContent 渲染，无 HTML 注入、无资源加载。
 * - update() 不触碰焦点、选区、编辑器状态，也不产生 Bridge 消息。
 * - 查询输入自身 composition 期间保留上一份稳定结果，不用半拼音重搜；
 *   compositionend 后自然触发一次重算请求。
 * - 编辑器 composition 期间拒绝会移动焦点的面板动作（pointerdown 阻止
 *   夺焦，click 二次校验），只给局部提示。
 * - Esc 仅在查询框非 composition 且 event.isComposing 为 false 时关闭
 *   面板；不截获其他场合的候选 Esc / 正文 Esc。
 */

export const SEARCH_MAX_RESULTS = 100;

export interface SearchSnapshotBinding {
  readonly documentID: string;
  readonly revision: number;
  readonly epoch: number;
  readonly raw: string;
}

export type SearchPanelState =
  | { kind: "idle" }
  | {
      kind: "document";
      binding: SearchSnapshotBinding;
      result: SourceSearchResult;
      scope?: "content" | "source";
      navigation?: { readonly available: boolean; readonly reason?: string };
      replacement?: { readonly available: boolean; readonly reason?: string };
    }
  | { kind: "error"; message: string };

export interface SearchPanelHandlers {
  /** 查询/大小写/面板打开等变化，请求调用方按最新快照重算。 */
  onSearchRequest(): void;
  /** 编辑器（textarea 或 ProseMirror）当前是否处于 composition。 */
  isEditorComposing(): boolean;
  /** 面板正常关闭后，把焦点交还正文编辑器。 */
  onFocusEditor(): void;
  /** 请求调用方按完整快照重新校验并定位，不由面板直接操作编辑器。 */
  onNavigate(request: SearchNavigationRequest): SearchNavigationOutcome;
  /** 请求调用方重验完整快照并执行原子替换。 */
  onReplace(request: SearchReplacementRequest): SearchReplacementOutcome;
}

export interface SearchReplacementRequest {
  readonly kind: "replace-one" | "replace-all";
  readonly replacement: string;
  readonly binding: SearchSnapshotBinding;
  readonly result: SourceSearchResult;
}

export type SearchReplacementOutcome =
  | { readonly ok: true; readonly changed: boolean; readonly replacedCount: number }
  | { readonly ok: false; readonly message: string };

export type SearchNavigationRequest =
  | {
      readonly kind: "relative";
      readonly direction: SearchDirection;
      readonly binding: SearchSnapshotBinding;
      readonly result: SourceSearchResult;
    }
  | {
      readonly kind: "index";
      readonly matchIndex: number;
      readonly binding: SearchSnapshotBinding;
      readonly result: SourceSearchResult;
    };

export type SearchNavigationOutcome =
  | { readonly ok: true; readonly matchIndex: number; readonly wrapped: boolean }
  | { readonly ok: false; readonly message: string };

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

interface GraphemeRange {
  start: number;
  end: number;
}

/** 每次 render 只对完整原文分段一次，后续每个命中只做二分与有限片段拼接。 */
function segmentGraphemes(raw: string): GraphemeRange[] {
  const ranges: GraphemeRange[] = [];
  for (const segment of graphemeSegmenter.segment(raw)) {
    const previous = ranges.at(-1);
    if (previous) previous.end = segment.index;
    ranges.push({ start: segment.index, end: raw.length });
  }
  return ranges;
}

function lowerBound(ranges: readonly GraphemeRange[], position: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ranges[middle]!.start < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

interface SnippetParts {
  before: string;
  hit: string;
  after: string;
}

const SNIPPET_CONTEXT_UNITS = 24;
const SNIPPET_HIT_EDGE_UNITS = 48;

function takeBefore(
  raw: string,
  ranges: readonly GraphemeRange[],
  position: number,
): string {
  let start = position;
  let remaining = SNIPPET_CONTEXT_UNITS;
  for (let index = lowerBound(ranges, position) - 1; index >= 0; index -= 1) {
    const range = ranges[index]!;
    const length = range.end - range.start;
    if (length > remaining) break;
    start = range.start;
    remaining -= length;
  }
  return (start > 0 ? "…" : "") + raw.slice(start, position);
}

function takeAfter(
  raw: string,
  ranges: readonly GraphemeRange[],
  position: number,
): string {
  let end = position;
  let remaining = SNIPPET_CONTEXT_UNITS;
  for (let index = lowerBound(ranges, position); index < ranges.length; index += 1) {
    const range = ranges[index]!;
    const length = range.end - range.start;
    if (length > remaining) break;
    end = range.end;
    remaining -= length;
  }
  return raw.slice(position, end) + (end < raw.length ? "…" : "");
}

function takeHit(
  raw: string,
  ranges: readonly GraphemeRange[],
  from: number,
  to: number,
): string {
  if (to - from <= SNIPPET_HIT_EDGE_UNITS * 2) return raw.slice(from, to);

  const first = lowerBound(ranges, from);
  const last = lowerBound(ranges, to);
  let prefixEnd = from;
  let remainingPrefix = SNIPPET_HIT_EDGE_UNITS;
  for (let index = first; index < last; index += 1) {
    const range = ranges[index]!;
    const length = range.end - range.start;
    if (length > remainingPrefix) break;
    prefixEnd = range.end;
    remainingPrefix -= length;
  }

  let suffixStart = to;
  let remainingSuffix = SNIPPET_HIT_EDGE_UNITS;
  for (let index = last - 1; index >= first; index -= 1) {
    const range = ranges[index]!;
    if (range.start < prefixEnd) break;
    const length = range.end - range.start;
    if (length > remainingSuffix) break;
    suffixStart = range.start;
    remainingSuffix -= length;
  }
  return `${raw.slice(from, prefixEnd)}…${raw.slice(suffixStart, to)}`;
}

/** 摘要为字素安全的有限上下文；超长命中只保留首尾并加省略号。 */
function buildSnippet(
  raw: string,
  ranges: readonly GraphemeRange[],
  from: number,
  to: number,
): SnippetParts {
  return {
    before: takeBefore(raw, ranges, from),
    hit: takeHit(raw, ranges, from, to),
    after: takeAfter(raw, ranges, to),
  };
}

export class SearchPanel {
  private readonly root: HTMLElement;
  private readonly findButton: HTMLButtonElement;
  private readonly panelBody: HTMLElement;
  private readonly queryInput: HTMLInputElement;
  private readonly caseInput: HTMLInputElement;
  private readonly replacementControls: HTMLElement;
  private readonly replacementInput: HTMLInputElement;
  private readonly replaceSelectedButton: HTMLButtonElement;
  private readonly replaceAllButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly statusLine: HTMLElement;
  private readonly resultsBody: HTMLElement;

  private queryValue = "";
  private caseValue = true;
  private openValue = false;
  private queryComposing = false;
  private replacementValue = "";
  private replacementComposing = false;
  private resetQueryAfterComposition = false;
  private resetReplacementAfterComposition = false;
  private ignoreLateCompositionInput = false;
  private ignoreLateReplacementInput = false;
  private lateCompositionInputTimer: number | undefined;
  private lateReplacementInputTimer: number | undefined;
  private state: SearchPanelState = { kind: "idle" };

  constructor(
    parent: HTMLElement,
    private readonly handlers: SearchPanelHandlers,
  ) {
    const root = document.createElement("div");
    root.className = "search-root";

    const findButton = document.createElement("button");
    findButton.type = "button";
    findButton.className = "search-toggle";
    findButton.setAttribute("aria-expanded", "false");
    findButton.setAttribute("aria-controls", "search-panel-body");
    findButton.textContent = "查找";
    findButton.addEventListener("pointerdown", (event) => {
      if (this.isInteractionBlocked()) {
        // 阻止按钮夺走焦点，避免迫使编辑器 composition 提交。
        event.preventDefault();
        this.showStatus("请先完成中文输入，再使用查找");
      }
    });
    findButton.addEventListener("click", () => {
      if (this.openValue) return;
      this.open();
    });

    const panel = document.createElement("aside");
    panel.id = "search-panel-body";
    panel.className = "search-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "当前文档查找");

    const controls = document.createElement("div");
    controls.className = "search-panel-controls";

    const queryInput = document.createElement("input");
    queryInput.type = "text";
    queryInput.className = "search-panel-query";
    queryInput.placeholder = "在当前文档查找";
    queryInput.setAttribute("aria-label", "查找内容");
    queryInput.autocapitalize = "off";
    queryInput.autocomplete = "off";
    queryInput.spellcheck = false;
    queryInput.addEventListener("compositionstart", () => {
      this.queryComposing = true;
    });
    queryInput.addEventListener("input", (event) => {
      // 查询框自身 composition（半拼音）期间不重搜，保留上一份稳定结果。
      const composing =
        this.queryComposing || (event as InputEvent).isComposing === true;
      if (composing) return;
      if (this.ignoreLateCompositionInput) {
        queryInput.value = "";
        this.queryValue = "";
        return;
      }
      if (this.queryValue === queryInput.value) return;
      this.queryValue = queryInput.value;
      this.handlers.onSearchRequest();
    });
    queryInput.addEventListener("compositionend", () => {
      this.queryComposing = false;
      if (this.resetQueryAfterComposition) {
        this.resetQueryAfterComposition = false;
        this.ignoreLateCompositionInput = true;
        this.clearQuery();
        if (this.lateCompositionInputTimer !== undefined) {
          window.clearTimeout(this.lateCompositionInputTimer);
        }
        this.lateCompositionInputTimer = window.setTimeout(() => {
          this.ignoreLateCompositionInput = false;
          this.lateCompositionInputTimer = undefined;
        }, 0);
        this.handlers.onSearchRequest();
        return;
      }
      this.queryValue = queryInput.value;
      // 组合收口后自然重算一次。
      this.handlers.onSearchRequest();
    });
    queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.queryComposing || event.isComposing) return;
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key !== "Enter") return;
      // 候选确认 Enter 属于 IME，先判断组合态再决定是否消费；
      // 组合期不 preventDefault，避免截获候选确认键。
      if (this.queryComposing || event.isComposing || this.handlers.isEditorComposing()) {
        this.showStatus("请先完成中文输入，再定位查找结果");
        return;
      }
      event.preventDefault();
      this.navigateRelative(event.shiftKey ? "backward" : "forward");
    });

    const caseLabel = document.createElement("label");
    caseLabel.className = "search-panel-case";
    const caseInput = document.createElement("input");
    caseInput.type = "checkbox";
    caseInput.checked = true;
    caseInput.addEventListener("pointerdown", (event) => {
      if (this.isInteractionBlocked()) {
        event.preventDefault();
        this.showStatus("请先完成中文输入，再切换大小写");
      }
    });
    caseInput.addEventListener("change", () => {
      if (this.isInteractionBlocked()) {
        caseInput.checked = this.caseValue;
        this.showStatus("请先完成中文输入，再切换大小写");
        return;
      }
      this.caseValue = caseInput.checked;
      this.handlers.onSearchRequest();
    });
    const caseText = document.createElement("span");
    caseText.textContent = "区分大小写";
    caseLabel.append(caseInput, caseText);

    const replacementControls = document.createElement("div");
    replacementControls.className = "search-panel-replacement-controls";
    const replacementInput = document.createElement("input");
    replacementInput.type = "text";
    replacementInput.className = "search-panel-replacement";
    replacementInput.placeholder = "替换为（单行字面文本）";
    replacementInput.setAttribute("aria-label", "替换文本");
    replacementInput.autocapitalize = "off";
    replacementInput.autocomplete = "off";
    replacementInput.spellcheck = false;
    replacementInput.addEventListener("compositionstart", () => {
      this.replacementComposing = true;
    });
    replacementInput.addEventListener("input", (event) => {
      if (this.replacementComposing || (event as InputEvent).isComposing) return;
      if (this.ignoreLateReplacementInput) {
        replacementInput.value = "";
        this.replacementValue = "";
        return;
      }
      this.replacementValue = replacementInput.value.replace(/[\r\n]/g, "");
      if (replacementInput.value !== this.replacementValue) replacementInput.value = this.replacementValue;
    });
    replacementInput.addEventListener("compositionend", () => {
      this.replacementComposing = false;
      if (this.resetReplacementAfterComposition) {
        this.resetReplacementAfterComposition = false;
        this.ignoreLateReplacementInput = true;
        this.replacementValue = "";
        replacementInput.value = "";
        if (this.lateReplacementInputTimer !== undefined) {
          window.clearTimeout(this.lateReplacementInputTimer);
        }
        this.lateReplacementInputTimer = window.setTimeout(() => {
          this.ignoreLateReplacementInput = false;
          this.lateReplacementInputTimer = undefined;
        }, 0);
        this.render();
        return;
      }
      this.replacementValue = replacementInput.value.replace(/[\r\n]/g, "");
      replacementInput.value = this.replacementValue;
    });
    replacementInput.addEventListener("keydown", (event) => {
      if (this.replacementComposing || event.isComposing) return;
      if (event.key === "Enter" || event.key === "Escape") return;
    });

    const replaceSelectedButton = document.createElement("button");
    replaceSelectedButton.type = "button";
    replaceSelectedButton.className = "search-panel-replace-selected";
    replaceSelectedButton.textContent = "替换选中匹配";
    const replaceAllButton = document.createElement("button");
    replaceAllButton.type = "button";
    replaceAllButton.className = "search-panel-replace-all";
    replaceAllButton.textContent = "全部替换";
    for (const [button, kind] of [
      [replaceSelectedButton, "replace-one"],
      [replaceAllButton, "replace-all"],
    ] as const) {
      button.addEventListener("pointerdown", (event) => {
        if (this.isInteractionBlocked()) {
          event.preventDefault();
          this.showStatus("请先完成中文输入，再执行替换");
        }
      });
      button.addEventListener("click", () => this.requestReplacement(kind));
    }
    replacementControls.append(replacementInput, replaceSelectedButton, replaceAllButton);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "search-panel-close";
    closeButton.setAttribute("aria-label", "关闭查找");
    closeButton.textContent = "关闭";
    closeButton.addEventListener("pointerdown", (event) => {
      if (this.isInteractionBlocked()) {
        event.preventDefault();
        this.showStatus("请先完成中文输入，再关闭查找");
      }
    });
    closeButton.addEventListener("click", () => {
      this.close();
    });

    controls.append(queryInput, caseLabel, closeButton);

    const statusLine = document.createElement("p");
    statusLine.className = "search-panel-status";
    statusLine.setAttribute("role", "status");
    statusLine.hidden = true;

    const resultsBody = document.createElement("div");
    resultsBody.className = "search-panel-results";

    panel.append(controls, resultsBody);
    // 拒绝打开时面板仍 hidden，因此提示必须位于 hidden 子树之外。
    root.append(findButton, statusLine, panel);
    this.root = root;
    this.findButton = findButton;
    this.panelBody = panel;
    this.queryInput = queryInput;
    this.caseInput = caseInput;
    this.replacementControls = replacementControls;
    this.replacementInput = replacementInput;
    this.replaceSelectedButton = replaceSelectedButton;
    this.replaceAllButton = replaceAllButton;
    this.closeButton = closeButton;
    this.statusLine = statusLine;
    this.resultsBody = resultsBody;
    parent.append(root);
    this.render();
  }

  get element(): HTMLElement {
    return this.root;
  }

  get isOpen(): boolean {
    return this.openValue;
  }

  get query(): string {
    return this.queryValue;
  }

  get caseSensitive(): boolean {
    return this.caseValue;
  }

  get shouldSearch(): boolean {
    return this.openValue && this.queryValue.length > 0;
  }

  get isQueryComposing(): boolean {
    return this.queryComposing;
  }

  get isInputComposing(): boolean {
    return this.queryComposing || this.replacementComposing;
  }

  get replacement(): string {
    return this.replacementValue;
  }

  /** 查询区域是否拥有当前 DOM 焦点；只读派生，不保存第二份焦点状态。 */
  get ownsFocus(): boolean {
    const activeElement = document.activeElement;
    return activeElement !== null && this.root.contains(activeElement);
  }

  open(): void {
    if (this.isInteractionBlocked()) {
      this.showStatus("请先完成中文输入，再使用查找");
      return;
    }
    this.openValue = true;
    this.panelBody.hidden = false;
    this.findButton.setAttribute("aria-expanded", "true");
    this.hideStatus();
    this.queryInput.focus();
    if (this.queryValue.length > 0) this.handlers.onSearchRequest();
  }

  close(): void {
    if (this.isInteractionBlocked()) {
      this.showStatus("请先完成中文输入，再关闭查找");
      return;
    }
    this.openValue = false;
    this.panelBody.hidden = true;
    this.findButton.setAttribute("aria-expanded", "false");
    this.hideStatus();
    this.handlers.onSearchRequest();
    this.handlers.onFocusEditor();
  }

  /** 只重绘结果内容；不触碰焦点、选区或编辑器状态。 */
  update(state: SearchPanelState): void {
    this.state = state;
    this.hideStatus();
    this.render();
  }

  /** 接受新 load 后：清旧结果与绑定，查询/大小写回到默认；保留展开开关。 */
  resetForNewDocument(): void {
    this.state = { kind: "idle" };
    this.caseValue = true;
    this.caseInput.checked = true;
    if (this.queryComposing) {
      // 不在 IME 候选期间改写输入值；收口后再执行已声明的新文档重置。
      this.resetQueryAfterComposition = true;
    } else {
      this.clearQuery();
    }
    if (this.replacementComposing) this.resetReplacementAfterComposition = true;
    else {
      this.replacementValue = "";
      this.replacementInput.value = "";
    }
    this.render();
  }

  destroy(): void {
    if (this.lateCompositionInputTimer !== undefined) {
      window.clearTimeout(this.lateCompositionInputTimer);
      this.lateCompositionInputTimer = undefined;
    }
    if (this.lateReplacementInputTimer !== undefined) {
      window.clearTimeout(this.lateReplacementInputTimer);
      this.lateReplacementInputTimer = undefined;
    }
    this.root.remove();
  }

  private showStatus(message: string): void {
    this.statusLine.textContent = message;
    this.statusLine.hidden = false;
  }

  private hideStatus(): void {
    this.statusLine.textContent = "";
    this.statusLine.hidden = true;
  }

  private clearQuery(): void {
    this.queryValue = "";
    this.queryInput.value = "";
  }

  private isInteractionBlocked(): boolean {
    return this.queryComposing || this.replacementComposing || this.handlers.isEditorComposing();
  }

  private requestReplacement(kind: "replace-one" | "replace-all"): void {
    if (this.isInteractionBlocked()) {
      this.showStatus("请先完成中文输入，再执行替换");
      return;
    }
    const state = this.state;
    if (state.kind !== "document" || !state.replacement?.available) {
      this.showStatus(state.kind === "document"
        ? state.replacement?.reason ?? "当前编辑模式不支持原文替换"
        : "查找结果尚未就绪");
      return;
    }
    if (state.result.query.length === 0) {
      this.showStatus("请输入查询内容后再替换");
      return;
    }
    if (kind === "replace-all" && state.result.truncated) {
      this.showStatus("全部替换需要完整结果；当前结果已截断");
      return;
    }
    const outcome = this.handlers.onReplace({
      kind, replacement: this.replacementValue, binding: state.binding, result: state.result,
    });
    if (!outcome.ok) this.showStatus(outcome.message);
    else if (!outcome.changed) this.showStatus("未产生更改");
    else this.showStatus(`已替换 ${outcome.replacedCount} 处`);
  }

  private navigateRelative(direction: SearchDirection): void {
    const state = this.state;
    if (state.kind !== "document" || !state.navigation?.available) {
      this.showStatus(state.kind === "document"
        ? state.navigation?.reason ?? "当前编辑模式不支持原文定位"
        : "查找结果尚未就绪");
      return;
    }
    this.reportNavigation(this.handlers.onNavigate({
      kind: "relative",
      direction,
      binding: state.binding,
      result: state.result,
    }), state.result.matches.length);
  }

  private navigateIndex(matchIndex: number, state: Extract<SearchPanelState, { kind: "document" }>): void {
    if (this.isInteractionBlocked()) {
      this.showStatus("请先完成中文输入，再定位查找结果");
      return;
    }
    this.reportNavigation(this.handlers.onNavigate({
      kind: "index",
      matchIndex,
      binding: state.binding,
      result: state.result,
    }), state.result.matches.length);
  }

  private reportNavigation(outcome: SearchNavigationOutcome, count: number): void {
    if (!outcome.ok) {
      this.showStatus(outcome.message);
      return;
    }
    this.showStatus(
      `当前第 ${outcome.matchIndex + 1}/${count} 处${outcome.wrapped ? "（已回绕）" : ""}`,
    );
  }

  private render(): void {
    this.resultsBody.replaceChildren();
    const state = this.state;

    const replacementAvailable = state.kind === "document" && state.replacement?.available === true;
    if (replacementAvailable && !this.replacementControls.isConnected) {
      this.panelBody.querySelector(".search-panel-controls")?.append(this.replacementControls);
    } else if (!replacementAvailable && this.replacementControls.isConnected &&
        !this.replacementComposing && !this.resetReplacementAfterComposition) {
      this.replacementControls.remove();
    }
    if (replacementAvailable && state.kind === "document") {
      const empty = state.result.query.length === 0 || state.result.matches.length === 0;
      this.replaceSelectedButton.disabled = empty;
      this.replaceAllButton.disabled = empty || state.result.truncated;
    }

    if (state.kind === "error") {
      const note = document.createElement("p");
      note.className = "search-panel-note search-panel-error";
      note.textContent = `查找失败：${state.message}`;
      this.resultsBody.append(note);
      return;
    }

    if (state.kind === "idle" || state.result.query === "") {
      const note = document.createElement("p");
      note.className = "search-panel-note";
      note.textContent = state.kind === "document" && state.scope === "content"
        ? "输入查询以查找可编辑内容（不含 Markdown 定界符、链接目标和工具栏）。"
        : "输入查询以在当前文档中查找（结果基于 Markdown 原文）。";
      this.resultsBody.append(note);
      return;
    }

    const header = document.createElement("p");
    header.className = "search-panel-count";
    if (state.result.truncated) {
      header.textContent = `匹配至少 ${SEARCH_MAX_RESULTS} 处，仅显示前 ${state.result.matches.length} 处`;
    } else {
      header.textContent = `${state.result.matches.length} 处匹配`;
    }
    this.resultsBody.append(header);

    if (state.result.rejected.length > 0) {
      const rejected = document.createElement("p");
      rejected.className = "search-panel-note";
      rejected.textContent = `另有 ${state.result.rejected.length} 处候选命中因字素或换行边界校验被跳过，未计入。`;
      this.resultsBody.append(rejected);
    }

    if (state.replacement?.available && state.result.truncated) {
      const replaceNote = document.createElement("p");
      replaceNote.className = "search-panel-note";
      replaceNote.textContent = "全部替换需要完整结果；当前结果已截断，操作已禁用。";
      this.resultsBody.append(replaceNote);
    } else if (state.replacement && !state.replacement.available) {
      const replaceNote = document.createElement("p");
      replaceNote.className = "search-panel-note";
      replaceNote.textContent = state.replacement.reason ?? "当前编辑模式不支持原文替换";
      this.resultsBody.append(replaceNote);
    } else if (!state.replacement) {
      const replaceNote = document.createElement("p");
      replaceNote.className = "search-panel-note";
      replaceNote.textContent = "替换尚未开放。";
      this.resultsBody.append(replaceNote);
    }

    if (state.navigation?.available && state.result.matches.length > 0) {
      const navigation = document.createElement("div");
      navigation.className = "search-panel-navigation";
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "search-panel-previous";
      previous.textContent = "上一处";
      const next = document.createElement("button");
      next.type = "button";
      next.className = "search-panel-next";
      next.textContent = "下一处";
      for (const [button, direction] of [
        [previous, "backward"],
        [next, "forward"],
      ] as const) {
        button.addEventListener("pointerdown", (event) => {
          if (this.isInteractionBlocked()) {
            event.preventDefault();
            this.showStatus("请先完成中文输入，再定位查找结果");
          }
        });
        button.addEventListener("click", () => {
          if (this.isInteractionBlocked()) {
            this.showStatus("请先完成中文输入，再定位查找结果");
            return;
          }
          this.reportNavigation(this.handlers.onNavigate({
            kind: "relative",
            direction,
            binding: state.binding,
            result: state.result,
          }), state.result.matches.length);
        });
      }
      navigation.append(previous, next);
      this.resultsBody.append(navigation);
    }

    const list = document.createElement("ul");
    list.className = "search-panel-matches";
    const displayText = state.result.source.raw;
    const graphemes = segmentGraphemes(displayText);
    state.result.matches.forEach((match, matchIndex) => {
      const item = document.createElement("li");
      item.className = "search-panel-match";
      const navigable = state.navigation?.available === true;
      const content = navigable
        ? document.createElement("button")
        : document.createElement("span");
      if (navigable) {
        const button = content as HTMLButtonElement;
        button.type = "button";
        button.className = "search-panel-match-button";
        button.setAttribute("aria-label", `定位到第 ${matchIndex + 1} 处匹配`);
        button.addEventListener("pointerdown", (event) => {
          if (this.isInteractionBlocked()) {
            event.preventDefault();
            this.showStatus("请先完成中文输入，再定位查找结果");
          }
        });
        button.addEventListener("click", () => this.navigateIndex(matchIndex, state));
      }
      const snippet = buildSnippet(displayText, graphemes, match.from, match.to);
      content.append(document.createTextNode(snippet.before));
      const hit = document.createElement("mark");
      hit.textContent = snippet.hit;
      content.append(hit, document.createTextNode(snippet.after));
      item.append(content);
      list.append(item);
    });
    this.resultsBody.append(list);

    const hint = document.createElement("p");
    hint.className = "search-panel-hint";
    const scope = state.scope === "content" ? "结果基于可编辑内容" : "结果基于 Markdown 原文";
    hint.textContent = state.navigation?.available
      ? `${scope}；Enter/Shift-Enter 或结果按钮仅在显示的 ${state.result.matches.length} 处内定位${state.result.truncated ? "，未显示部分不参与循环" : ""}。`
      : `${scope}；${state.navigation?.reason ?? "当前编辑模式不支持原文定位"}。`;
    this.resultsBody.append(hint);
  }
}

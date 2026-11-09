import type { SourceSearchResult } from "./source-search";

/**
 * 当前文档查找面板（阶段 A）：复用 source-search 纯函数的结果列表，
 * 只负责安全的 DOM 呈现与查询输入，不做定位/替换。
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
    }
  | { kind: "error"; message: string };

export interface SearchPanelHandlers {
  /** 查询/大小写/面板打开等变化，请求调用方按最新快照重算。 */
  onSearchRequest(): void;
  /** 编辑器（textarea 或 ProseMirror）当前是否处于 composition。 */
  isEditorComposing(): boolean;
  /** 面板正常关闭后，把焦点交还正文编辑器。 */
  onFocusEditor(): void;
}

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
  private readonly closeButton: HTMLButtonElement;
  private readonly statusLine: HTMLElement;
  private readonly resultsBody: HTMLElement;

  private queryValue = "";
  private caseValue = true;
  private openValue = false;
  private queryComposing = false;
  private resetQueryAfterComposition = false;
  private ignoreLateCompositionInput = false;
  private lateCompositionInputTimer: number | undefined;
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
      if (event.key !== "Escape") return;
      if (this.queryComposing || event.isComposing) return;
      event.preventDefault();
      this.close();
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
    this.render();
  }

  destroy(): void {
    if (this.lateCompositionInputTimer !== undefined) {
      window.clearTimeout(this.lateCompositionInputTimer);
      this.lateCompositionInputTimer = undefined;
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
    return this.queryComposing || this.handlers.isEditorComposing();
  }

  private render(): void {
    this.resultsBody.replaceChildren();
    const state = this.state;

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
      note.textContent = "输入查询以在当前文档中查找（结果基于 Markdown 原文）。";
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

    const list = document.createElement("ul");
    list.className = "search-panel-matches";
    const graphemes = segmentGraphemes(state.binding.raw);
    for (const match of state.result.matches) {
      const item = document.createElement("li");
      item.className = "search-panel-match";
      const snippet = buildSnippet(state.binding.raw, graphemes, match.from, match.to);
      item.append(document.createTextNode(snippet.before));
      const hit = document.createElement("mark");
      hit.textContent = snippet.hit;
      item.append(hit, document.createTextNode(snippet.after));
      list.append(item);
    }
    this.resultsBody.append(list);

    const hint = document.createElement("p");
    hint.className = "search-panel-hint";
    hint.textContent =
      "结果基于 Markdown 原文；点击定位与替换尚未开放。";
    this.resultsBody.append(hint);
  }
}

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

function isGraphemeBoundary(raw: string, position: number): boolean {
  if (position <= 0 || position >= raw.length) return true;
  const windowStart = Math.max(0, position - 32);
  const windowEnd = Math.min(raw.length, position + 32);
  for (const segment of graphemeSegmenter.segment(raw.slice(windowStart, windowEnd))) {
    if (windowStart + segment.index === position) return true;
  }
  return false;
}

/** 把代码单元边界向 dir 方向吸附到最近的字素边界，避免摘要切断字素。 */
function snapToGrapheme(raw: string, position: number, dir: -1 | 1): number {
  if (isGraphemeBoundary(raw, position)) return position;
  for (let distance = 1; distance <= 16; distance += 1) {
    const candidate = position + distance * dir;
    if (candidate < 0 || candidate > raw.length) break;
    if (isGraphemeBoundary(raw, candidate)) return candidate;
  }
  return Math.max(0, Math.min(raw.length, position));
}

interface SnippetParts {
  before: string;
  hit: string;
  after: string;
}

const SNIPPET_CONTEXT_UNITS = 24;
const SNIPPET_MAX_HIT_UNITS = 96;

/** 摘要为字素安全的有限上下文；超长命中只保留首尾并加省略号。 */
function buildSnippet(raw: string, from: number, to: number): SnippetParts {
  let hitStart = from;
  let hitEnd = to;
  let hitOmitted = false;
  if (to - from > SNIPPET_MAX_HIT_UNITS) {
    hitStart = snapToGrapheme(raw, from + SNIPPET_MAX_HIT_UNITS / 2, -1);
    hitEnd = snapToGrapheme(raw, to - SNIPPET_MAX_HIT_UNITS / 2, 1);
    hitOmitted = true;
  }
  const start = snapToGrapheme(raw, Math.max(0, hitStart - SNIPPET_CONTEXT_UNITS), -1);
  const end = snapToGrapheme(raw, Math.min(raw.length, hitEnd + SNIPPET_CONTEXT_UNITS), 1);
  const before = (start > 0 ? "…" : "") + raw.slice(start, hitStart);
  const hit = raw.slice(hitStart, hitEnd) + (hitOmitted ? "…" : "");
  const after = raw.slice(hitEnd, end) + (end < raw.length ? "…" : "");
  return { before, hit, after };
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
      if (this.handlers.isEditorComposing()) {
        // 阻止按钮夺走焦点，避免迫使编辑器 composition 提交。
        event.preventDefault();
        this.showStatus("请先完成中文输入，再使用查找");
      }
    });
    findButton.addEventListener("click", () => {
      if (this.handlers.isEditorComposing()) return;
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
      this.queryValue = queryInput.value;
      // 查询框自身 composition（半拼音）期间不重搜，保留上一份稳定结果。
      const composing =
        this.queryComposing || (event as InputEvent).isComposing === true;
      if (composing) return;
      this.handlers.onSearchRequest();
    });
    queryInput.addEventListener("compositionend", () => {
      this.queryComposing = false;
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
      if (this.handlers.isEditorComposing()) {
        event.preventDefault();
        this.showStatus("请先完成中文输入，再切换大小写");
      }
    });
    caseInput.addEventListener("change", () => {
      if (this.handlers.isEditorComposing()) {
        caseInput.checked = this.caseValue;
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
      if (this.handlers.isEditorComposing()) {
        event.preventDefault();
        this.showStatus("请先完成中文输入，再关闭查找");
      }
    });
    closeButton.addEventListener("click", () => {
      if (this.handlers.isEditorComposing()) return;
      this.close();
    });

    controls.append(queryInput, caseLabel, closeButton);

    const statusLine = document.createElement("p");
    statusLine.className = "search-panel-status";
    statusLine.hidden = true;

    const resultsBody = document.createElement("div");
    resultsBody.className = "search-panel-results";

    panel.append(controls, statusLine, resultsBody);
    root.append(findButton, panel);
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

  open(): void {
    this.openValue = true;
    this.panelBody.hidden = false;
    this.findButton.setAttribute("aria-expanded", "true");
    if (this.handlers.isEditorComposing()) {
      // 编辑器组合中只呈现面板，不夺焦点。
      this.showStatus("请先完成中文输入，再使用查找");
    } else {
      this.hideStatus();
      this.queryInput.focus();
    }
    if (this.queryValue.length > 0) this.handlers.onSearchRequest();
  }

  close(): void {
    this.openValue = false;
    this.panelBody.hidden = true;
    this.findButton.setAttribute("aria-expanded", "false");
    this.hideStatus();
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
    this.queryValue = "";
    this.queryInput.value = "";
    this.caseValue = true;
    this.caseInput.checked = true;
    this.render();
  }

  destroy(): void {
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
    for (const match of state.result.matches) {
      const item = document.createElement("li");
      item.className = "search-panel-match";
      const snippet = buildSnippet(state.binding.raw, match.from, match.to);
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

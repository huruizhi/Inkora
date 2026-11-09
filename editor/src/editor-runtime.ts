import { EditorView } from "prosemirror-view";
import { InkoraEditorSession } from "./editor-session";
import { TextAreaEditorKernel } from "./editor-kernel";
import { classifyLineEndings } from "./line-endings";
import { TextSelection } from "prosemirror-state";
import { analyzeDocument } from "./document-analysis";
import {
  sameHeading,
  type HeadingNavigationResult,
  type HeadingNavigationTarget,
} from "./heading-navigation";
import {
  mapRawRangeToTextarea,
  rawOffsetToTextareaOffset,
  readRawSelection,
  textareaProjection,
  type SourceNavigationResult,
} from "./source-navigation";
import { searchSource, type DirectedSelection, type SourceReplacementPlan, type SourceSearchResult, type SearchOptions } from "./source-search";
import { indexVisualText, locateVisualMatch, sameSearchResult, searchVisualText, type VisualSearchNavigation, type VisualSearchLocation } from "./visual-search";
import { validateSourceReplacementPlan } from "./source-replacement";
import { SourceAuthoritySession } from "./source-authority";
import { revealTextareaOffset } from "./textarea-visibility";
import { createCodeHighlightDecorations } from "./code-highlighting";
import { createCodeBlockNodeViews } from "./code-block-view";
import { createTableNodeViews, handleTableTab, insertDefaultTable } from "./table-editing";
import { createTaskListItemNodeViews } from "./task-list-view";

export interface EditorRuntimeStatus {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  draftDirty: boolean;
  unresolved: boolean;
  saveEligible: boolean;
}

export type EditorMode = "visual" | "source" | "read_only";
export type RuntimeChangeKind = "document" | "status";

export interface EditorRuntime {
  readonly status: EditorRuntimeStatus;
  readonly mode: EditorMode;
  readonly sourceNavigation: boolean;
  readonly sourceReplacement: boolean;
  getText(): string;
  search(query: string, revision: number, options?: SearchOptions): SourceSearchResult;
  navigateVisualSearch(raw: string, result: SourceSearchResult, request: VisualSearchNavigation): SourceNavigationResult<VisualSearchLocation>;
  getSourceSelection(raw: string): SourceNavigationResult<DirectedSelection>;
  selectSourceRange(raw: string, selection: DirectedSelection): SourceNavigationResult;
  applySourceReplacement(plan: SourceReplacementPlan): SourceNavigationResult<{
    readonly changed: boolean;
    readonly replacedCount: number;
  }>;
  readonly composing: boolean;
  insertTable(): boolean;
  enterSourceMode(): boolean;
  applySourceDraft(): boolean;
  cancelSourceDraft(): boolean;
  snapshotText(): SourceNavigationResult<string>;
  whenCompositionStable(): Promise<boolean>;
  markSaved(text: string): void;
  undo(): boolean;
  redo(): boolean;
  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult;
  focus(): void;
  destroy(): void;
}

export type RuntimeChangeListener = (
  status: EditorRuntimeStatus,
  kind?: RuntimeChangeKind,
) => void;

class SourceAuthorityEditorRuntime implements EditorRuntime {
  private readonly ownerWindow: Window;
  private view: EditorView | undefined;
  private textArea: HTMLTextAreaElement | undefined;
  private sourceKernel: TextAreaEditorKernel | undefined;
  private compositionQuietTimer: number | undefined;
  private compositionPhase: "idle" | "active" | "settling" = "idle";
  private compositionID: unknown;
  private sourceCompositionUnsubscribe: (() => void) | undefined;
  private readonly stabilityWaiters = new Set<{
    resolve: (stable: boolean) => void;
    timer: number;
  }>();
  private publishedLogicalRevision = 0;
  private readonly session: SourceAuthoritySession;

  constructor(
    private readonly parent: HTMLElement,
    text: string,
    private readonly onChange: RuntimeChangeListener,
  ) {
    const ownerWindow = parent.ownerDocument.defaultView;
    if (!ownerWindow) throw new Error("Editor runtime requires an attached window");
    this.ownerWindow = ownerWindow;
    this.session = new SourceAuthoritySession(text);
    this.renderVisual();
  }

  get mode(): EditorMode {
    return this.textArea ? "source" : "visual";
  }

  get sourceNavigation(): boolean {
    return this.mode === "source";
  }

  get sourceReplacement(): boolean {
    return this.mode === "source";
  }

  get composing(): boolean {
    return this.mode === "source"
      ? (this.sourceKernel?.composing ?? false)
      : this.session.composing;
  }

  get status(): EditorRuntimeStatus {
    return {
      dirty: this.session.documentDirty,
      canUndo: this.session.past.length > 0,
      canRedo: this.session.future.length > 0,
      draftDirty: this.session.draftDirty,
      unresolved: this.session.unresolvedIntent !== null || this.session.issues.length > 0,
      saveEligible: this.session.saveEligible,
    };
  }

  getText(): string {
    return this.session.currentRaw;
  }

  search(query: string, revision: number, options: SearchOptions = {}): SourceSearchResult {
    return this.mode === "visual"
      ? searchVisualText(indexVisualText(this.session.state.doc), revision, query, options)
      : searchSource({ raw: this.session.currentRaw, revision }, query, options);
  }

  navigateVisualSearch(raw: string, result: SourceSearchResult, request: VisualSearchNavigation): SourceNavigationResult<VisualSearchLocation> {
    const view = this.view;
    if (!view || this.composing || this.session.draftDirty || this.status.unresolved) {
      return { ok: false, message: "当前输入尚未稳定，不能定位查找结果" };
    }
    if (raw !== this.session.currentRaw) return { ok: false, message: "文档已变化，请重新查找" };
    const index = indexVisualText(view.state.doc);
    const current = searchVisualText(index, result.source.revision, result.query,
      { caseSensitive: result.caseSensitive, maxResults: result.maxResults < 10_000 ? result.maxResults : undefined });
    if (!sameSearchResult(current, result)) return { ok: false, message: "查找结果已过期" };
    const location = locateVisualMatch(index, current, view.state.selection, request);
    if (!location) return { ok: false, message: "当前查询没有可定位的匹配" };
    const selection = TextSelection.create(view.state.doc, location.anchor, location.head);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView().setMeta("addToHistory", false));
    return view.state.selection.eq(selection)
      ? { ok: true, value: location }
      : { ok: false, message: "该结果无法安全映射到当前原文" };
  }

  snapshotText(): SourceNavigationResult<string> {
    if (!this.session.saveEligible) {
      const reason = this.session.draftDirty
        ? "源码草稿尚未提交"
        : this.session.issues[0]?.message ??
          this.session.unresolvedIntent?.description ??
          "当前输入尚未形成可安全保存的原文";
      return { ok: false, message: reason };
    }
    return { ok: true, value: this.session.currentRaw };
  }

  whenCompositionStable(): Promise<boolean> {
    if (!this.composing) return Promise.resolve(true);
    return new Promise(resolve => {
      const waiter = {
        resolve,
        timer: this.ownerWindow.setTimeout(() => {
          this.stabilityWaiters.delete(waiter);
          resolve(false);
        }, COMPOSITION_STABILITY_TIMEOUT_MS),
      };
      this.stabilityWaiters.add(waiter);
    });
  }

  enterSourceMode(): boolean {
    if (this.composing || !this.session.beginSource()) return false;
    this.renderSource();
    this.onChange(this.status, "status");
    return true;
  }

  applySourceDraft(): boolean {
    const kernel = this.sourceKernel;
    const area = this.textArea;
    if (!kernel || !area || kernel.composing) return false;
    const draftRaw = kernel.getText();
    const selection = readRawSelection(
      draftRaw,
      area.value,
      area.selectionStart,
      area.selectionEnd,
      area.selectionDirection,
    );
    if (!selection.ok) return false;
    this.session.updateDraft(draftRaw, { ...selection.value, affinity: "right" });
    const before = this.session.currentRaw;
    if (!this.session.applySource()) return false;
    this.session.beginSource();
    kernel.setText(this.session.currentRaw);
    this.applySourceSelection(this.session.currentRaw, this.session.rawSelection);
    this.notifyChange(before === this.session.currentRaw ? "status" : "document");
    return true;
  }

  cancelSourceDraft(): boolean {
    const area = this.textArea;
    const kernel = this.sourceKernel;
    if (!area || !kernel || this.composing) return false;
    if (kernel.getText() === this.session.currentRaw) {
      const selection = readRawSelection(
        this.session.currentRaw,
        area.value,
        area.selectionStart,
        area.selectionEnd,
        area.selectionDirection,
      );
      if (!selection.ok || !this.session.setSourceSelection(
        selection.value.anchor,
        selection.value.head,
        "right",
      )) return false;
    }
    if (!this.session.cancelSource()) return false;
    this.renderVisual();
    this.onChange(this.status, "status");
    return true;
  }

  getSourceSelection(raw: string): SourceNavigationResult<DirectedSelection> {
    const area = this.textArea;
    if (!area || this.composing) {
      return { ok: false, message: this.composing
        ? "请先完成中文输入，再定位查找结果"
        : "可视编辑模式暂不支持原文范围定位" };
    }
    if (this.session.draftDirty) return { ok: false, message: "请先提交或取消源码草稿" };
    if (this.session.currentRaw !== raw) return { ok: false, message: "文档已变化，请等待查找刷新" };
    return readRawSelection(
      raw,
      area.value,
      area.selectionStart,
      area.selectionEnd,
      area.selectionDirection,
    );
  }

  selectSourceRange(raw: string, selection: DirectedSelection): SourceNavigationResult {
    const area = this.textArea;
    if (!area || this.composing) {
      return { ok: false, message: this.composing
        ? "请先完成中文输入，再定位查找结果"
        : "可视编辑模式暂不支持原文范围定位" };
    }
    if (this.session.draftDirty) return { ok: false, message: "请先提交或取消源码草稿" };
    if (this.session.currentRaw !== raw) return { ok: false, message: "文档已变化，请等待查找刷新" };
    const mapped = mapRawRangeToTextarea(raw, area.value, {
      from: Math.min(selection.anchor, selection.head),
      to: Math.max(selection.anchor, selection.head),
    });
    if (!mapped.ok) return mapped;
    area.setSelectionRange(
      mapped.value.start,
      mapped.value.end,
      selection.anchor > selection.head ? "backward" : "forward",
    );
    revealTextareaOffset(area, mapped.value.start);
    return { ok: true, value: undefined };
  }

  applySourceReplacement(plan: SourceReplacementPlan): SourceNavigationResult<{
    readonly changed: boolean;
    readonly replacedCount: number;
  }> {
    const area = this.textArea;
    if (!area || this.composing) return { ok: false, message: "当前不能执行原文替换" };
    if (this.session.draftDirty) return { ok: false, message: "请先提交或取消源码草稿" };
    const validation = validateSourceReplacementPlan(plan, this.session.currentRaw, area.value);
    if (!validation.ok) return validation;
    if (!plan.changed) return { ok: true, value: { changed: false, replacedCount: 0 } };
    const currentSelection = this.getSourceSelection(this.session.currentRaw);
    if (!currentSelection.ok || !this.session.setSourceSelection(
      currentSelection.value.anchor,
      currentSelection.value.head,
      "right",
    )) {
      return { ok: false, message: "当前原文选区无效" };
    }
    const before = this.session.currentRaw;
    if (!this.session.updateDraft(plan.resultRaw, { ...plan.selection, affinity: "right" }) ||
        !this.session.applySource()) {
      return { ok: false, message: this.session.diagnostic || "无法应用原文替换" };
    }
    this.session.beginSource();
    this.sourceKernel?.setText(this.session.currentRaw);
    this.applySourceSelection(plan.resultRaw, plan.selection);
    this.notifyChange(before === this.session.currentRaw ? "status" : "document");
    return { ok: true, value: { changed: true, replacedCount: plan.replacedCount } };
  }

  markSaved(text: string): void {
    this.session.markSaved(text);
    this.onChange(this.status, "status");
  }

  insertTable(): boolean {
    return this.view ? insertDefaultTable(this.view) : false;
  }

  undo(): boolean {
    if (this.composing) return false;
    if (!this.session.undo()) return false;
    this.publishedLogicalRevision = this.session.status.revision;
    this.renderCurrentMode();
    return true;
  }

  redo(): boolean {
    if (this.composing) return false;
    if (!this.session.redo()) return false;
    this.publishedLogicalRevision = this.session.status.revision;
    this.renderCurrentMode();
    return true;
  }

  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult {
    if (this.composing) return { ok: false, message: "请先完成中文输入，再定位标题" };
    if (this.session.currentRaw !== raw) return { ok: false, message: "文档已变化，请等待大纲刷新" };
    const analyzed = analyzeDocument({ raw, revision: 0 }).headings;
    if (!sameHeading(analyzed[target.index], target)) {
      return { ok: false, message: "大纲快照已过期，无法定位标题" };
    }
    if (this.mode === "source") {
      const offset = rawOffsetToTextareaOffset(raw, target.start);
      if (offset === undefined || !this.textArea) {
        return { ok: false, message: "标题原文范围无效，无法定位" };
      }
      this.textArea.focus();
      this.textArea.setSelectionRange(offset, offset);
      revealTextareaOffset(this.textArea, offset);
      return { ok: true };
    }
    const headings: Array<{ level: number; text: string; position: number }> = [];
    this.session.state.doc.descendants((node, position) => {
      if (node.type.name === "heading") {
        headings.push({ level: Number(node.attrs.level), text: node.textContent, position });
      }
    });
    if (headings.length !== analyzed.length || headings.some((heading, index) =>
      heading.level !== analyzed[index]?.level || heading.text !== analyzed[index]?.text
    )) {
      return { ok: false, message: "当前编辑视图与原文大纲不一致，无法安全定位" };
    }
    const heading = headings[target.index];
    if (!heading) return { ok: false, message: "目标标题不存在" };
    this.session.dispatch(
      this.session.state.tr
        .setSelection(TextSelection.create(this.session.state.doc, heading.position + 1))
        .setMeta("addToHistory", false)
        .scrollIntoView(),
    );
    this.view?.updateState(this.session.state);
    this.view?.focus();
    return { ok: true };
  }

  focus(): void {
    if (this.mode === "source") this.sourceKernel?.focus();
    else this.view?.focus();
  }

  destroy(): void {
    this.cancelCompositionQuietTimer();
    this.resolveStabilityWaiters(false);
    this.destroySurface();
  }

  private renderCurrentMode(): void {
    if (this.mode === "source") {
      this.session.beginSource();
      this.sourceKernel?.setText(this.session.currentRaw);
      this.applySourceSelection(this.session.currentRaw, this.session.rawSelection);
    } else {
      this.renderVisual();
    }
  }

  private renderVisual(): void {
    this.destroySurface();
    this.parent.replaceChildren();
    let view: EditorView;
    let lastDispatchAccepted: boolean | undefined;
    const codeBlockNodeView = createCodeBlockNodeViews({
      isComposing: () => this.session.composing || view?.composing === true,
      applyLanguageChange: (getPos, expectedNode, nextLanguage) => {
        if (this.session.composing || view.composing) {
          return { ok: false, message: "请先完成中文输入，再选择代码语言。" };
        }
        const pos = getPos();
        if (pos === undefined) return { ok: false, message: "代码块已变化，请重试。" };
        const currentNode = view.state.doc.nodeAt(pos);
        if (!currentNode || currentNode.type !== expectedNode.type) {
          return { ok: false, message: "代码块已变化，请重试。" };
        }
        lastDispatchAccepted = undefined;
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
          ...currentNode.attrs,
          language: nextLanguage,
        }));
        return lastDispatchAccepted
          ? { ok: true }
          : { ok: false, message: this.session.diagnostic || "无法安全修改代码语言。" };
      },
    });
    const codeDecorations = createCodeHighlightDecorations();
    const tableNodeView = createTableNodeViews({
      isComposing: () => this.session.composing || view?.composing === true,
    });
    const taskListItemNodeView = createTaskListItemNodeViews({
      isComposing: () => this.session.composing || view?.composing === true,
    });
    view = new EditorView(this.parent, {
      state: this.session.state,
      decorations: codeDecorations,
      nodeViews: {
        code_block: codeBlockNodeView,
        table: tableNodeView,
        list_item: taskListItemNodeView,
      },
      handleDOMEvents: {
        keydown: (activeView, event) => {
          if (event.key !== "Tab" || event.isComposing || this.session.composing || activeView.composing) return false;
          if (!handleTableTab(activeView, event.shiftKey)) return false;
          event.preventDefault();
          return true;
        },
      },
      dispatchTransaction: (transaction) => {
        const compositionID = transaction.getMeta("composition");
        if (transaction.docChanged && this.compositionPhase === "settling" &&
            (compositionID === undefined ||
              (this.compositionID !== undefined && compositionID !== this.compositionID))) {
          this.settleComposition(true);
        }
        if (this.compositionPhase !== "idle" && compositionID !== undefined &&
            this.compositionID === undefined) {
          this.compositionID = compositionID;
        }
        const before = this.session.currentRaw;
        const accepted = this.session.dispatch(transaction);
        lastDispatchAccepted = accepted;
        view.updateState(this.session.state);
        if (accepted && this.compositionPhase === "settling" &&
            compositionID !== undefined && compositionID === this.compositionID) {
          this.scheduleCompositionSettlement();
        }
        if (!accepted || before === this.session.currentRaw || this.session.composing) return;
        if (this.session.status.revision > this.publishedLogicalRevision) {
          this.publishedLogicalRevision = this.session.status.revision;
          this.onChange(this.status, "document");
        } else {
          this.onChange(this.status, "status");
        }
      },
    });
    this.view = view;
    view.dom.id = "editor";
    view.dom.setAttribute("aria-label", "Markdown editor");
    view.dom.addEventListener("compositionstart", this.handleCompositionStart);
    view.dom.addEventListener("compositionend", this.handleCompositionEnd);
  }

  private renderSource(): void {
    this.destroySurface();
    this.parent.replaceChildren();
    const area = document.createElement("textarea");
    area.id = "editor";
    area.autocapitalize = "off";
    area.autocomplete = "off";
    area.spellcheck = false;
    area.setAttribute("aria-label", "Markdown source draft");
    this.parent.append(area);
    const kernel = new TextAreaEditorKernel(area);
    kernel.setText(this.session.draft?.raw ?? this.session.currentRaw);
    kernel.onChange((text) => {
      const selection = readRawSelection(
        text,
        area.value,
        area.selectionStart,
        area.selectionEnd,
        area.selectionDirection,
      );
      const rawSelection = selection.ok
        ? { ...selection.value, affinity: "right" as const }
        : { anchor: text.length, head: text.length, affinity: "right" as const };
      this.session.updateDraft(text, rawSelection);
      this.onChange(this.status, "status");
    });
    this.sourceCompositionUnsubscribe = kernel.onCompositionChange(composing => {
      if (!composing) this.resolveStabilityWaiters(true);
    });
    this.textArea = area;
    this.sourceKernel = kernel;
    const selection = this.session.draft?.selection ?? this.session.rawSelection;
    this.applySourceSelection(this.session.draft?.raw ?? this.session.currentRaw, selection);
  }

  private applySourceSelection(raw: string, selection: DirectedSelection): void {
    const area = this.textArea;
    if (!area) return;
    const mapped = mapRawRangeToTextarea(raw, area.value, {
      from: Math.min(selection.anchor, selection.head),
      to: Math.max(selection.anchor, selection.head),
    });
    if (!mapped.ok) return;
    area.setSelectionRange(
      mapped.value.start,
      mapped.value.end,
      selection.anchor > selection.head ? "backward" : "forward",
    );
  }

  private destroySurface(): void {
    this.sourceCompositionUnsubscribe?.();
    this.sourceCompositionUnsubscribe = undefined;
    if (this.view) {
      this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
      this.view.destroy();
      this.view = undefined;
    }
    this.textArea?.remove();
    this.textArea = undefined;
    this.sourceKernel = undefined;
  }

  private readonly handleCompositionStart = (): void => {
    if (this.compositionPhase === "settling") this.settleComposition(true);
    this.cancelCompositionQuietTimer();
    this.compositionPhase = "active";
    this.compositionID = undefined;
    this.session.startComposition();
  };

  private readonly handleCompositionEnd = (): void => {
    if (this.compositionPhase !== "active") return;
    this.compositionPhase = "settling";
    this.scheduleCompositionSettlement();
  };

  private scheduleCompositionSettlement(): void {
    this.cancelCompositionQuietTimer();
    // prosemirror-view exposes `composing`, but deliberately does not expose
    // its pending DOM observer. A quiet window, reset by each accepted final
    // transaction, is the public seam that covers its microtask/20ms cleanup
    // without calling private domObserver APIs.
    this.compositionQuietTimer = this.ownerWindow.setTimeout(
      () => this.settleComposition(),
      COMPOSITION_QUIET_WINDOW_MS,
    );
  }

  private settleComposition(force = false): void {
    if (this.compositionPhase === "idle") return;
    if (!force && this.view?.composing) {
      this.scheduleCompositionSettlement();
      return;
    }
    this.cancelCompositionQuietTimer();
    this.compositionPhase = "idle";
    this.compositionID = undefined;
    this.session.endComposition();
    this.view?.updateState(this.session.state);
    if (this.session.status.revision > this.publishedLogicalRevision) {
      this.publishedLogicalRevision = this.session.status.revision;
      this.onChange(this.status, "document");
    }
    this.resolveStabilityWaiters(true);
  }

  private notifyChange(kind: RuntimeChangeKind): void {
    if (kind === "document") {
      this.publishedLogicalRevision = this.session.status.revision;
    }
    this.onChange(this.status, kind);
  }

  private cancelCompositionQuietTimer(): void {
    if (this.compositionQuietTimer !== undefined) {
      this.ownerWindow.clearTimeout(this.compositionQuietTimer);
      this.compositionQuietTimer = undefined;
    }
  }

  private resolveStabilityWaiters(stable: boolean): void {
    for (const waiter of this.stabilityWaiters) {
      this.ownerWindow.clearTimeout(waiter.timer);
      waiter.resolve(stable);
    }
    this.stabilityWaiters.clear();
  }
}

const COMPOSITION_QUIET_WINDOW_MS = 24;
const COMPOSITION_STABILITY_TIMEOUT_MS = 120;

// EOL-003: keep exact bytes independent of textarea's LF normalization.
class ReadOnlyEditorRuntime implements EditorRuntime {
  readonly mode = "read_only" as const;
  readonly sourceNavigation = true;
  readonly sourceReplacement = false;
  private readonly textArea: HTMLTextAreaElement;
  readonly status = {
    dirty: false,
    canUndo: false,
    canRedo: false,
    draftDirty: false,
    unresolved: false,
    saveEligible: true,
  };
  readonly composing = false;

  constructor(parent: HTMLElement, private readonly text: string) {
    this.textArea = document.createElement("textarea");
    this.textArea.id = "editor";
    this.textArea.readOnly = true;
    this.textArea.setAttribute("aria-label", "Markdown source (read only: bare CR)");
    this.textArea.value = text;
    parent.append(this.textArea);
  }

  getText(): string { return this.text; }
  search(query: string, revision: number, options: SearchOptions = {}): SourceSearchResult {
    return searchSource({ raw: this.text, revision }, query, options);
  }
  navigateVisualSearch(_raw: string, _result: SourceSearchResult, _request: VisualSearchNavigation): SourceNavigationResult<VisualSearchLocation> {
    return { ok: false, message: "当前文档采用原文导航" };
  }
  insertTable(): boolean { return false; }
  enterSourceMode(): boolean { return true; }
  applySourceDraft(): boolean { return false; }
  cancelSourceDraft(): boolean { return false; }
  snapshotText(): SourceNavigationResult<string> { return { ok: true, value: this.text }; }
  whenCompositionStable(): Promise<boolean> { return Promise.resolve(true); }
  getSourceSelection(raw: string): SourceNavigationResult<DirectedSelection> {
    if (this.text !== raw) return { ok: false, message: "文档已变化，请等待查找刷新" };
    return readRawSelection(
      raw,
      this.textArea.value,
      this.textArea.selectionStart,
      this.textArea.selectionEnd,
      this.textArea.selectionDirection,
    );
  }
  selectSourceRange(raw: string, selection: DirectedSelection): SourceNavigationResult {
    if (this.text !== raw) return { ok: false, message: "文档已变化，请等待查找刷新" };
    const from = Math.min(selection.anchor, selection.head);
    const to = Math.max(selection.anchor, selection.head);
    const mapped = mapRawRangeToTextarea(raw, this.textArea.value, { from, to });
    if (!mapped.ok) return mapped;
    this.textArea.setSelectionRange(
      mapped.value.start,
      mapped.value.end,
      selection.anchor > selection.head ? "backward" : "forward",
    );
    revealTextareaOffset(this.textArea, mapped.value.start);
    return { ok: true, value: undefined };
  }
  applySourceReplacement(_plan: SourceReplacementPlan): SourceNavigationResult<never> {
    return { ok: false, message: "裸 CR 文档为只读，不能替换" };
  }
  markSaved(_text: string): void {}
  undo(): boolean { return false; }
  redo(): boolean { return false; }
  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult {
    if (this.text !== raw) return { ok: false, message: "文档已变化，请等待大纲刷新" };
    const analyzed = analyzeDocument({ raw, revision: 0 }).headings;
    if (!sameHeading(analyzed[target.index], target) || this.textArea.value !== textareaProjection(raw)) {
      return { ok: false, message: "原文与只读视图映射不一致，无法安全定位" };
    }
    const offset = rawOffsetToTextareaOffset(raw, target.start);
    if (offset === undefined || offset > this.textArea.value.length) {
      return { ok: false, message: "标题原文范围无效，无法定位" };
    }
    this.textArea.focus();
    this.textArea.setSelectionRange(offset, offset);
    revealTextareaOffset(this.textArea, offset);
    return { ok: true };
  }
  focus(): void { this.textArea.focus(); }
  destroy(): void { this.textArea.remove(); }
}

export function createEditorRuntime(
  parent: HTMLElement,
  text: string,
  onChange: RuntimeChangeListener,
): EditorRuntime {
  parent.replaceChildren();
  const endings = classifyLineEndings(text);
  if (endings === "bare_cr") return new ReadOnlyEditorRuntime(parent, text);
  return new SourceAuthorityEditorRuntime(parent, text, onChange);
}

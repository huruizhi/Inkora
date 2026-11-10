import {
  BRIDGE_PROTOCOL_VERSION,
  decodeNativeCommand,
  EditorProtocolSession,
  encodeEditorMessage,
  recoveryActionFor,
  type EditorMessage,
  type EditorCommand,
  type NativeCommand,
} from "./bridge";
import {
  createEditorRuntime,
  type EditorRuntime,
  type EditorRuntimeStatus,
  type LinkEditBinding,
  type RuntimeChangeKind,
} from "./editor-runtime";
import { DocumentAnalysisPanel } from "./document-analysis-panel";
import { sameSearchResult } from "./visual-search";
import {
  SEARCH_MAX_RESULTS,
  SearchPanel,
  type SearchNavigationOutcome,
  type SearchNavigationRequest,
  type SearchReplacementOutcome,
  type SearchReplacementRequest,
} from "./search-panel";
import {
  findSourceMatch,
  planSourceReplaceAll,
  planSourceReplacement,
  searchSource,
  type DirectedSelection,
  type SourceSearchResult,
} from "./source-search";
import "./style.css";
import "./code-highlighting.css";
import "./writing-surface.css";
import "./technical-preview.css";

declare global {
  interface Window {
    inkora: {
      receive(serialized: string): void;
    };
    webkit?: {
      messageHandlers?: {
        inkora?: { postMessage(serialized: string): void };
      };
    };
}
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("Missing #app element");
}

// 稳定工作区：工具条/查找区与 editorHost 隔离。loadDocument 时
// createEditorRuntime 只 replaceChildren(editorHost)，工具条不受影响。
const workspace = document.createElement("div");
workspace.className = "editor-workspace";
app.append(workspace);
const topBar = document.createElement("header");
topBar.className = "editor-topbar";
workspace.append(topBar);
const findBar = document.createElement("div");
findBar.className = "find-bar";
topBar.append(findBar);
const modeBar = document.createElement("div");
modeBar.className = "editor-mode-bar";
modeBar.setAttribute("role", "toolbar");
modeBar.setAttribute("aria-label", "编辑模式");
const visualModeButton = document.createElement("button");
visualModeButton.type = "button";
visualModeButton.className = "editor-mode-visual";
visualModeButton.textContent = "可视";
const sourceModeButton = document.createElement("button");
sourceModeButton.type = "button";
sourceModeButton.className = "editor-mode-source";
sourceModeButton.textContent = "源码";
const sourceApplyButton = document.createElement("button");
sourceApplyButton.type = "button";
sourceApplyButton.className = "source-draft-apply";
sourceApplyButton.textContent = "提交源码";
const sourceCancelButton = document.createElement("button");
sourceCancelButton.type = "button";
sourceCancelButton.className = "source-draft-cancel";
sourceCancelButton.textContent = "取消草稿";
const insertTableButton = document.createElement("button");
insertTableButton.type = "button";
insertTableButton.className = "insert-table";
insertTableButton.textContent = "插入表格";
insertTableButton.setAttribute("aria-label", "插入两列表格");
const modeStatus = document.createElement("span");
modeStatus.className = "editor-mode-status";
modeStatus.setAttribute("role", "status");
modeBar.append(
  visualModeButton,
  sourceModeButton,
  sourceApplyButton,
  sourceCancelButton,
  insertTableButton,
  modeStatus,
);
topBar.append(modeBar);
const linkEditorHost = document.createElement("div");
linkEditorHost.className = "link-editor-host";
workspace.append(linkEditorHost);
const editorHost = document.createElement("div");
editorHost.className = "editor-host";
workspace.append(editorHost);
const session = new EditorProtocolSession();
let runtime: EditorRuntime | undefined;
let executingCommand = false;
let activeDocumentID: string | undefined;
let activeRevision: number | undefined;
let loadEpoch = 0;
let readingWidth: 760 | 900 = 760;
if (window.webkit?.messageHandlers?.inkora) document.documentElement.classList.add("native-chrome");
let activeLinkEditor: HTMLFormElement | undefined;
const composingLinkEditors = new WeakSet<HTMLFormElement>();

function closeLinkEditor(form = activeLinkEditor): boolean {
  if (!form) return true;
  if (composingLinkEditors.has(form)) return false;
  form.remove();
  if (activeLinkEditor === form) activeLinkEditor = undefined;
  return true;
}

function openLinkEditor(owner: EditorRuntime, binding: LinkEditBinding): void {
  if (owner.composing || runtime !== owner || activeDocumentID === undefined ||
      activeRevision === undefined) return;
  if (!closeLinkEditor()) return;
  const documentID = activeDocumentID;
  const revision = activeRevision;
  const epoch = loadEpoch;
  const form = document.createElement("form");
  form.className = "link-editor";
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-label", binding.attrs ? "编辑链接" : "创建链接");

  const hrefLabel = document.createElement("label");
  hrefLabel.textContent = "链接";
  const href = document.createElement("input");
  href.className = "link-editor-href";
  href.type = "text";
  href.required = true;
  href.autocomplete = "off";
  href.value = binding.attrs?.href ?? "";
  hrefLabel.append(href);

  const titleLabel = document.createElement("label");
  titleLabel.textContent = "标题";
  const title = document.createElement("input");
  title.className = "link-editor-title";
  title.type = "text";
  title.autocomplete = "off";
  const originalTitle = binding.attrs?.title ?? null;
  title.value = (originalTitle ?? "").replace(/\r\n|\r|\n/g, " ");
  const initialTitleValue = title.value;
  titleLabel.append(title);

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "link-editor-save";
  save.textContent = binding.attrs ? "更新" : "创建";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "link-editor-cancel";
  cancel.textContent = "取消";
  const status = document.createElement("span");
  status.className = "link-editor-status";
  status.setAttribute("role", "status");

  const apply = (
    attrs: { href: string; title: string | null } | null,
    eventIsComposing = false,
  ): void => {
    if (eventIsComposing || composingLinkEditors.has(form)) return;
    if (runtime !== owner || activeDocumentID !== documentID || activeRevision !== revision ||
        loadEpoch !== epoch) {
      status.textContent = "链接编辑请求已过期，请重新执行 Mod-K";
      return;
    }
    const result = owner.applyLinkEdit(binding, attrs);
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    closeLinkEditor(form);
    owner.focus();
  };
  form.addEventListener("submit", event => {
    // This cancels form navigation, not the input method's key event.
    event.preventDefault();
    if ((event as Event & { isComposing?: boolean }).isComposing ||
        composingLinkEditors.has(form)) return;
    apply({
      href: href.value,
      title: title.value === initialTitleValue
        ? originalTitle
        : title.value.length ? title.value : null,
    });
  });
  cancel.addEventListener("click", event => {
    if ((event as PointerEvent & { isComposing?: boolean }).isComposing ||
        composingLinkEditors.has(form)) return;
    closeLinkEditor(form);
    if (runtime === owner && loadEpoch === epoch) owner.focus();
  });
  form.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing || composingLinkEditors.has(form)) return;
    event.preventDefault();
    cancel.click();
  });
  const compositionStart = (): void => {
    composingLinkEditors.add(form);
  };
  const compositionEnd = (): void => {
    composingLinkEditors.delete(form);
    if (runtime !== owner || activeDocumentID !== documentID || loadEpoch !== epoch) {
      closeLinkEditor(form);
    }
  };
  href.addEventListener("compositionstart", compositionStart);
  href.addEventListener("compositionend", compositionEnd);
  title.addEventListener("compositionstart", compositionStart);
  title.addEventListener("compositionend", compositionEnd);
  form.addEventListener("pointerdown", event => {
    if (composingLinkEditors.has(form) && event.target !== document.activeElement) {
      event.preventDefault();
    }
  });

  const actions = document.createElement("div");
  actions.className = "link-editor-actions";
  if (binding.attrs) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link-editor-remove";
    remove.textContent = "移除链接";
    remove.addEventListener("click", event => apply(
      null,
      (event as PointerEvent & { isComposing?: boolean }).isComposing === true,
    ));
    actions.append(remove);
  }
  actions.append(save, cancel, status);
  form.append(hrefLabel, titleLabel, actions);
  linkEditorHost.append(form);
  activeLinkEditor = form;
  href.focus();
  href.select();
}

const guardLinkCompositionAction = (event: Event): void => {
  const form = activeLinkEditor;
  if (!form || !composingLinkEditors.has(form) || form.contains(event.target as Node | null)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};
app.addEventListener("pointerdown", guardLinkCompositionAction, true);
app.addEventListener("click", guardLinkCompositionAction, true);
let assetEpoch: string | undefined;

function updateModeControls(): void {
  const activeRuntime = runtime;
  const mode = activeRuntime?.mode;
  visualModeButton.setAttribute("aria-pressed", String(mode === "visual"));
  sourceModeButton.setAttribute("aria-pressed", String(mode === "source"));
  visualModeButton.disabled = !activeRuntime || mode === "read_only" ||
    (mode === "source" && activeRuntime.status.draftDirty);
  sourceModeButton.disabled = !activeRuntime || mode === "read_only" || mode === "source" ||
    activeRuntime.composing;
  sourceApplyButton.hidden = mode !== "source";
  sourceCancelButton.hidden = mode !== "source";
  const needsSourceConfirmation = activeRuntime?.status.unresolved &&
    !activeRuntime.status.saveEligible;
  sourceApplyButton.disabled = (!activeRuntime?.status.draftDirty && !needsSourceConfirmation) ||
    !activeRuntime || activeRuntime.composing;
  sourceCancelButton.disabled = !activeRuntime || activeRuntime.composing;
  insertTableButton.disabled = !activeRuntime || mode !== "visual" || activeRuntime.composing;
  modeStatus.textContent = activeRuntime?.status.unresolved
    ? activeRuntime.status.saveEligible
      ? "源码已提交；未识别的语法只读保留，可按原文保存"
      : "当前原文需要源码修复，保存已阻断"
    : activeRuntime?.status.draftDirty
      ? "源码草稿尚未提交"
      : mode === "source" ? "源码模式" : "";
}

function availableEditorCommands(): EditorCommand[] {
  const current = runtime;
  if (!current || current.composing || searchPanel.isInputComposing ||
      (activeLinkEditor && composingLinkEditors.has(activeLinkEditor))) return [];
  const commands: EditorCommand[] = ["find", "toggleOutline", "readingWidth760", "readingWidth900"];
  if (current.mode === "visual") commands.push("sourceMode");
  if (current.mode === "source") {
    commands.push("cancelSource");
    if (!current.status.draftDirty) commands.push("visualMode");
    if (current.status.draftDirty || (current.status.unresolved && !current.status.saveEligible)) {
      commands.push("applySource");
    }
  }
  if (searchPanel.ownsFocus || activeLinkEditor?.contains(document.activeElement)) return commands;
  if (current.status.canUndo) commands.push("undo");
  if (current.status.canRedo) commands.push("redo");
  if (current.mode === "visual") commands.push("insertTable", "insertImage");
  return commands;
}

function performEditorAction(command: EditorCommand): boolean {
  if (!availableEditorCommands().includes(command)) return false;
  switch (command) {
    case "sourceMode": closeLinkEditor(); return runtime!.enterSourceMode();
    case "visualMode":
    case "cancelSource": return runtime!.cancelSourceDraft();
    case "applySource": return runtime!.applySourceDraft();
    case "insertTable": return runtime!.insertTable();
    case "find": searchPanel.open(); return true;
    case "toggleOutline": panel.setCollapsed(!panel.isCollapsed); return true;
    case "readingWidth760":
    case "readingWidth900":
      readingWidth = command === "readingWidth760" ? 760 : 900;
      workspace.style.setProperty("--writing-width", `${readingWidth}px`);
      return true;
    // Image insertion is owned by the Native file picker, never a DOM click.
    default: return false;
  }
}

sourceModeButton.addEventListener("click", () => { performEditorAction("sourceMode"); updateModeControls(); });
visualModeButton.addEventListener("click", () => { performEditorAction("visualMode"); updateModeControls(); });
sourceApplyButton.addEventListener("click", () => { performEditorAction("applySource"); updateModeControls(); });
sourceCancelButton.addEventListener("click", () => { performEditorAction("cancelSource"); updateModeControls(); });
insertTableButton.addEventListener("pointerdown", (event) => event.preventDefault());
insertTableButton.addEventListener("click", () => { performEditorAction("insertTable"); updateModeControls(); });
updateModeControls();

const panel = new DocumentAnalysisPanel(app, (snapshot, target) => {
  const activeRuntime = runtime;
  if (!activeRuntime) return { ok: false, message: "尚未打开文档" };
  if (activeRuntime.composing) return { ok: false, message: "请先完成中文输入，再定位标题" };
  if (searchPanel.isInputComposing) {
    return { ok: false, message: "请先完成查找输入，再定位标题" };
  }
  if (snapshot.epoch !== loadEpoch) {
    return { ok: false, message: "文档已重新载入，请等待大纲刷新" };
  }
  if (snapshot.documentID !== activeDocumentID || snapshot.revision !== activeRevision) {
    return { ok: false, message: "大纲快照已过期，请等待刷新" };
  }
  if (activeRuntime.getText() !== snapshot.raw) {
    return { ok: false, message: "文档已变化，请等待大纲刷新" };
  }
  return activeRuntime.navigateToHeading(snapshot.raw, target);
}, () => !runtime?.composing && !searchPanel.isInputComposing &&
  !(activeLinkEditor && composingLinkEditors.has(activeLinkEditor)));

// 查找面板（INK-M1-009 阶段 A）：只做查询与结果列表，不做定位/替换。
// 面板动作自身不产生任何 Bridge 消息，也不改正文/历史/保存点。
const searchPanel = new SearchPanel(findBar, {
  onSearchRequest: () => {
    if (activeDocumentID !== undefined && activeRevision !== undefined) {
      scheduleSearch(activeDocumentID, activeRevision);
    }
  },
  isEditorComposing: () => runtime?.composing ?? false,
  onFocusEditor: () => runtime?.focus(),
  onNavigate: (request) => performSearchNavigation(request),
  onReplace: (request) => performSearchReplacement(request),
});

function performSearchNavigation(request: SearchNavigationRequest): SearchNavigationOutcome {
  const activeRuntime = runtime;
  if (!activeRuntime) {
    return { ok: false, message: "尚未打开文档" };
  }
  if (activeRuntime.composing || searchPanel.isInputComposing) {
    return { ok: false, message: "请先完成中文输入，再定位查找结果" };
  }
  if (request.binding.documentID !== activeDocumentID ||
      request.binding.revision !== activeRevision || request.binding.epoch !== loadEpoch) {
    return { ok: false, message: "查找结果已过期，请等待刷新" };
  }
  if (!searchPanel.isOpen || searchPanel.query !== request.result.query ||
      searchPanel.caseSensitive !== request.result.caseSensitive) {
    return { ok: false, message: "查询已变化，请等待查找刷新" };
  }
  const raw = activeRuntime.getText();
  if (raw !== request.binding.raw ||
      (activeRuntime.mode !== "visual" && raw !== request.result.source.raw) ||
      request.result.source.revision !== activeRevision) {
    return { ok: false, message: "文档已变化，请等待查找刷新" };
  }

  let current: SourceSearchResult;
  try {
    current = activeRuntime.search(searchPanel.query, activeRevision,
      { caseSensitive: searchPanel.caseSensitive, maxResults: SEARCH_MAX_RESULTS });
  } catch {
    return { ok: false, message: "无法重新校验当前查找结果" };
  }
  if (!sameSearchResult(current, request.result)) {
    return { ok: false, message: "查找结果已过期，请等待刷新" };
  }

  if (activeRuntime.mode === "visual") {
    const located = activeRuntime.navigateVisualSearch(raw, current, request);
    return located.ok
      ? { ok: true, matchIndex: located.value.matchIndex, wrapped: located.value.wrapped }
      : located;
  }

  const selection = activeRuntime.getSourceSelection(raw);
  if (!selection.ok) return selection;
  let matchIndex: number;
  let wrapped = false;
  let targetSelection: DirectedSelection;
  if (request.kind === "relative") {
    try {
      const located = findSourceMatch(current, selection.value, request.direction, true);
      if (!located) return { ok: false, message: "当前查询没有可定位的匹配" };
      matchIndex = located.matchIndex;
      wrapped = located.wrapped;
      targetSelection = located.selection;
    } catch {
      return { ok: false, message: "当前选区不在安全的原文边界上" };
    }
  } else {
    const match = current.matches[request.matchIndex];
    if (!match) return { ok: false, message: "所选查找结果已过期" };
    matchIndex = request.matchIndex;
    targetSelection = selection.value.anchor > selection.value.head
      ? { anchor: match.to, head: match.from }
      : { anchor: match.from, head: match.to };
  }
  const applied = activeRuntime.selectSourceRange(raw, targetSelection);
  if (!applied.ok) return applied;
  return { ok: true, matchIndex, wrapped };
}

function performSearchReplacement(request: SearchReplacementRequest): SearchReplacementOutcome {
  const activeRuntime = runtime;
  if (!activeRuntime || (activeRuntime.mode !== "visual" && !activeRuntime.sourceReplacement)) {
    return { ok: false, message: "当前编辑模式不支持原文替换" };
  }
  if (activeRuntime.composing || searchPanel.isInputComposing) {
    return { ok: false, message: "请先完成中文输入，再执行替换" };
  }
  if (request.binding.documentID !== activeDocumentID ||
      request.binding.revision !== activeRevision || request.binding.epoch !== loadEpoch) {
    return { ok: false, message: "替换请求已过期，请等待刷新" };
  }
  if (!searchPanel.isOpen || searchPanel.query !== request.result.query ||
      searchPanel.caseSensitive !== request.result.caseSensitive ||
      searchPanel.replacement !== request.replacement) {
    return { ok: false, message: "查询或替换文本已变化，请重新执行" };
  }
  const raw = activeRuntime.getText();
  if (raw !== request.binding.raw || (activeRuntime.mode !== "visual" && raw !== request.result.source.raw) ||
      request.result.source.revision !== activeRevision) {
    return { ok: false, message: "文档已变化，请等待查找刷新" };
  }

  let current: SourceSearchResult;
  try {
    current = activeRuntime.search(searchPanel.query, activeRevision, {
      caseSensitive: searchPanel.caseSensitive, maxResults: SEARCH_MAX_RESULTS,
    });
  } catch {
    return { ok: false, message: "无法重新校验当前查找结果" };
  }
  if (!sameSearchResult(current, request.result)) {
    return { ok: false, message: "查找结果已过期，请等待刷新" };
  }
  if (activeRuntime.mode === "visual") {
    const applied = activeRuntime.replaceVisualSearch(raw, current, request.kind, request.replacement);
    return applied.ok ? { ok: true, ...applied.value } : applied;
  }
  const selection = activeRuntime.getSourceSelection(raw);
  if (!selection.ok) return selection;
  let planned;
  if (request.kind === "replace-one") {
    const from = Math.min(selection.value.anchor, selection.value.head);
    const to = Math.max(selection.value.anchor, selection.value.head);
    const matchIndex = current.matches.findIndex((match) => match.from === from && match.to === to);
    if (matchIndex < 0) return { ok: false, message: "请先选择一个完整的查找结果" };
    planned = planSourceReplacement(current, { raw, revision: activeRevision }, matchIndex,
      request.replacement, selection.value);
  } else {
    let complete = current;
    if (current.truncated) {
      try {
        complete = activeRuntime.search(searchPanel.query, activeRevision, {
          caseSensitive: searchPanel.caseSensitive,
        });
      } catch {
        return { ok: false, message: "无法重新校验完整查找结果" };
      }
      if (complete.truncated) {
        return { ok: false, message: "完整匹配达到安全上限，整批未应用" };
      }
    }
    planned = planSourceReplaceAll(complete, { raw, revision: activeRevision },
      request.replacement, selection.value);
  }
  if (!planned.ok) return { ok: false, message: planned.failure.message };
  const applied = activeRuntime.applySourceReplacement(planned.plan);
  if (!applied.ok) return applied;
  return { ok: true, changed: applied.value.changed, replacedCount: applied.value.replacedCount };
}

// ---------------------------------------------------------------------------
// 面板分析调度：只由真实 stateChanged 消息驱动，documentID/revision 来自
// 既有协议字段，文本来自 runtime.getText()。分析失败与延迟均隔离在面板内，
// 不产生额外协议消息、不阻断保存/编辑。
// ---------------------------------------------------------------------------

let analysisGeneration = 0;
let analysisTimer: number | undefined;

function cancelPendingAnalysis(): void {
  analysisGeneration += 1;
  if (analysisTimer !== undefined) {
    window.clearTimeout(analysisTimer);
    analysisTimer = undefined;
  }
}

function scheduleAnalysis(documentID: string, revision: number): void {
  cancelPendingAnalysis();
  // composition 进行中保留上一份稳定统计，不显示半拼音文本。
  if (runtime?.composing) return;
  const generation = analysisGeneration;
  analysisTimer = window.setTimeout(() => {
    analysisTimer = undefined;
    // 跨文档/重复 load 已 bump generation，旧任务到此作废。
    if (generation !== analysisGeneration) return;
    const activeRuntime = runtime;
    if (!activeRuntime || activeRuntime.composing) return;
    try {
      const raw = activeRuntime.getText();
      const analysis = activeRuntime.analyzeDocument(revision);
      if (generation !== analysisGeneration) return;
      panel.update({ kind: "document", documentID, revision, epoch: loadEpoch, raw, analysis });
    } catch (error) {
      // 分析异常只落在面板错误态，绝不冒充 Bridge 错误或打断编辑。
      panel.update({
        kind: "error",
        message: error instanceof Error ? error.message : "无法分析当前文档",
      });
    }
  }, 0);
}

// 查找调度：与面板分析同一范式 —— 真实 stateChanged / 查询输入驱动，
// generation 防竞态，composition 期间保留上一份稳定结果，异常只落面板
// 局部错误态，不发 editorError、不触发 stop_saving。

let searchGeneration = 0;
let searchTimer: number | undefined;

function cancelPendingSearch(): void {
  searchGeneration += 1;
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function scheduleSearch(documentID: string, revision: number): void {
  cancelPendingSearch();
  if (!searchPanel.shouldSearch) {
    searchPanel.update({ kind: "idle" });
    return;
  }
  if (runtime?.composing || searchPanel.isQueryComposing) return;
  const generation = searchGeneration;
  const epoch = loadEpoch;
  const query = searchPanel.query;
  const caseSensitive = searchPanel.caseSensitive;
  searchTimer = window.setTimeout(() => {
    searchTimer = undefined;
    // 跨文档/重复 load 已 bump generation，旧任务到此作废。
    if (generation !== searchGeneration) return;
    const activeRuntime = runtime;
    if (!activeRuntime || activeRuntime.composing || searchPanel.isQueryComposing) return;
    if (!searchPanel.isOpen || searchPanel.query !== query) return;
    if (searchPanel.caseSensitive !== caseSensitive) return;
    if (activeDocumentID !== documentID || activeRevision !== revision) return;
    if (loadEpoch !== epoch) return;
    try {
      const raw = activeRuntime.getText();
      const result = activeRuntime.search(query, revision, { caseSensitive, maxResults: SEARCH_MAX_RESULTS });
      if (generation !== searchGeneration) return;
      searchPanel.update({
        kind: "document",
        binding: { documentID, revision, epoch, raw },
        result,
        scope: activeRuntime.mode === "visual" ? "content" : "source",
        navigation: activeRuntime.mode === "visual" || activeRuntime.sourceNavigation
          ? { available: true }
          : { available: false, reason: "结构化编辑模式暂不支持原文范围定位" },
        replacement: activeRuntime.mode === "visual"
          ? { available: true, completeOnReplaceAll: true }
          : activeRuntime.sourceReplacement
          ? { available: true, completeOnReplaceAll: true }
          : { available: false, reason: activeRuntime.sourceNavigation
              ? "当前文档只读，不能替换"
              : "结构化编辑模式不支持原文替换" },
      });
    } catch (error) {
      searchPanel.update({
        kind: "error",
        message: error instanceof Error ? error.message : "无法查找当前文档",
      });
    }
  }, 0);
}

function postToNative(message: Parameters<typeof encodeEditorMessage>[0]): void {
  if (message.type === "stateChanged") {
    message = { ...message, state: { ...message.state,
      availableCommands: availableEditorCommands(), readingWidth,
    } };
  }
  const serialized = encodeEditorMessage(message);
  const handler = window.webkit?.messageHandlers?.inkora;
  if (handler) {
    handler.postMessage(serialized);
  }
  // 既有的每一条 stateChanged（load/markSaved/executeCommand/runtime 变更）
  // 都携带真实 documentID/revision，是面板唯一的刷新信号源。
  if (message.type === "stateChanged") {
    activeDocumentID = message.state.documentID;
    activeRevision = message.state.revision;
    scheduleAnalysis(message.state.documentID, message.state.revision);
    if (searchPanel.shouldSearch) {
      scheduleSearch(message.state.documentID, message.state.revision);
    }
  }
}

function recordRuntimeChange(
  status: EditorRuntimeStatus,
  kind: RuntimeChangeKind = "document",
): void {
  updateModeControls();
  if (kind === "status") {
    // Mode/projection changes can change the searchable surface without
    // changing document bytes or the Bridge revision.
    if (activeDocumentID !== undefined && activeRevision !== undefined && searchPanel.shouldSearch) {
      scheduleSearch(activeDocumentID, activeRevision);
    }
    return;
  }
  if (executingCommand) return;
  const message = session.recordChange(status);
  if (message) postToNative(message);
}

window.inkora = {
  receive(serialized: string): void {
    let requestID: string | undefined;
    try {
      const command = decodeNativeCommand(serialized);
      requestID = command.requestID;
      switch (command.type) {
        case "loadDocument":
          {
            // 先验证再重置：被拒绝的 load（stale_revision/request_conflict）
            // 保留当前有效面板与待执行分析，只有真正接受的新 load 才
            // 取消旧任务并进入"正在打开文档"过渡态。
            const response = session.loadDocument(command);
            if (response.type === "stateChanged") {
              const queryWasComposing = searchPanel.isInputComposing;
              const linkWasComposing = !!activeLinkEditor &&
                composingLinkEditors.has(activeLinkEditor);
              cancelPendingSearch();
              // 接受新 load：立即清旧查找结果与绑定（查询/大小写回到默认，
              // 面板开关保留）。被拒 load 不走这里，查找状态原样保留。
              searchPanel.resetForNewDocument();
              loadEpoch += 1;
              closeLinkEditor();
              assetEpoch = undefined;
              runtime?.destroy();
              const runtimeEpoch = loadEpoch;
              runtime = createEditorRuntime(editorHost, command.text, recordRuntimeChange, {
                searchIdentity: { documentID: command.documentID, epoch: loadEpoch },
                onLinkRequest: (binding) => {
                  const owner = runtime;
                  if (owner) openLinkEditor(owner, binding);
                },
                onImageAccessRequest: href => {
                  if (loadEpoch !== runtimeEpoch) return;
                  if (activeDocumentID === undefined || activeRevision === undefined) return;
                  const ownership = runtime?.captureImageOwnership();
                  if (!ownership || !ownership.imageURIs.includes(href)) return;
                  postToNative({
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    type: "imageAccessRequested",
                    documentID: activeDocumentID,
                    revision: activeRevision,
                    href,
                    imageOwnership: {
                      documentID: activeDocumentID,
                      revision: activeRevision,
                      raw: ownership.raw,
                      imageURIs: ownership.imageURIs,
                    },
                  });
                },
              });
              updateModeControls();
              // 跨 load 不夺走查询框正在进行的 IME composition；面板会在
              // compositionend 安全收口后执行已声明的新文档查询重置。
              if (!queryWasComposing && !linkWasComposing) runtime.focus();
            }
            postToNative(response);
          }
          break;
        case "createSnapshot":
          // Native has resigned first responder. Drain compositionend (including
          // ProseMirror's final DOM transaction) before sampling text and revision.
          {
            const captureRuntime = runtime;
            const capture = (): void => {
              if (runtime !== captureRuntime) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: "Document changed while draining text composition",
                });
                return;
              }
              if (captureRuntime?.composing) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: "Finish text composition before saving or closing",
                });
                return;
              }
              const snapshot = captureRuntime?.snapshotText();
              if (!snapshot?.ok) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: snapshot?.message ?? "No document is loaded",
                });
                return;
              }
              postToNative(session.queryState({
                protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "queryState",
                requestID: `${command.requestID}-state`,
              }));
              const ownership = captureRuntime?.captureImageOwnership();
              if (!ownership || ownership.raw !== snapshot.value) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: "Image ownership changed while capturing the snapshot",
                });
                return;
              }
              postToNative(session.createSnapshot(command, ownership));
            };
            if (captureRuntime?.composing) {
              void captureRuntime.whenCompositionStable().then(stable => {
                if (!stable) {
                  postToNative({
                    protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                    requestID: command.requestID, code: "editor_not_ready", action: "retry",
                    message: "Text composition did not reach a stable boundary",
                  });
                  return;
                }
                capture();
              });
            } else capture();
          }
          break;
        case "markSaved":
          executingCommand = true;
          try {
            postToNative(
              session.markSaved(
                command,
                () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
                () => runtime?.markSaved(command.text),
              ),
            );
          } finally {
            executingCommand = false;
            updateModeControls();
          }
          break;
        case "executeCommand":
          executingCommand = true;
          try {
            const before = runtime?.getText();
            const historyCommand = command.command === "undo" || command.command === "redo";
            const documentCommandBlocked = runtime?.composing ||
              searchPanel.ownsFocus || searchPanel.isInputComposing ||
              !!activeLinkEditor && (composingLinkEditors.has(activeLinkEditor) ||
                activeLinkEditor.contains(document.activeElement));
            postToNative(session.executeCommand(command, () => {
              if (!historyCommand) {
                if (command.command === "insertTable" && (
                  command.selectionAnchor !== runtime?.directedSelection.selectionAnchor ||
                  command.selectionHead !== runtime?.directedSelection.selectionHead
                )) return false;
                return performEditorAction(command.command);
              }
              return !documentCommandBlocked && (command.command === "undo"
                ? (runtime?.undo() ?? false) : (runtime?.redo() ?? false));
            }, () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
            () => historyCommand || runtime?.getText() !== before));
          } finally {
            executingCommand = false;
            updateModeControls();
          }
          break;
        case "queryState":
          postToNative(session.queryState(
            command,
            runtime ? { ...runtime.status, ...runtime.directedSelection } : undefined,
          ));
          break;
        case "applyImageImport":
          executingCommand = true;
          try {
            const epochMatches = assetEpoch === undefined || assetEpoch === command.documentEpoch;
            const selectionMatches = runtime?.directedSelection.selectionAnchor === command.selectionAnchor
              && runtime?.directedSelection.selectionHead === command.selectionHead;
            const response = session.executeMutation(
              command,
              () => epochMatches && selectionMatches && !searchPanel.isInputComposing &&
                !(activeLinkEditor && composingLinkEditors.has(activeLinkEditor)) &&
                (runtime?.insertImage({
                assetID: command.assetID, uri: command.uri, alt: command.alt, title: command.title,
              }) ?? false),
              () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
            );
            if (response.type === "stateChanged") {
              assetEpoch = command.documentEpoch;
              runtime?.applyImageDescriptors([{
                href: command.uri, status: "ready", displayURL: command.displayURL,
              }]);
            }
            postToNative(response);
          } finally {
            executingCommand = false;
            updateModeControls();
          }
          break;
        case "prepareImageSave":
          executingCommand = true;
          try {
            const proofError = validateCurrentImageOwnership(command);
            if (proofError) {
              postToNative(proofError);
              break;
            }
            const epochMatches = assetEpoch === undefined || assetEpoch === command.documentEpoch;
            const rawBefore = runtime?.getText();
            const response = session.executeMutation(
              command,
              () => epochMatches && !searchPanel.isInputComposing &&
                !(activeLinkEditor && composingLinkEditors.has(activeLinkEditor)) &&
                (runtime?.rewriteManagedImages(command.rewrites) ?? false),
              () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              () => runtime?.getText() !== rawBefore,
            );
            if (response.type === "stateChanged") assetEpoch = command.documentEpoch;
            postToNative(response);
          } finally {
            executingCommand = false;
            updateModeControls();
          }
          break;
        case "setImageDescriptors":
          {
            const proofError = validateCurrentImageOwnership(command);
            if (proofError) {
              postToNative(proofError);
              break;
            }
            const epochMatches = assetEpoch === undefined || assetEpoch === command.documentEpoch;
            const response = epochMatches
              ? session.acknowledge(
                command,
                runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              )
              : session.executeMutation(
                command, () => false,
                () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              );
            // The acknowledgement is enqueued before a capability reaches a NodeView.
            // Native commits provisional broker entries only from this response.
            postToNative(response);
            if (response.type === "stateChanged") {
              runtime?.applyImageDescriptors(command.descriptors);
              assetEpoch = command.documentEpoch;
            }
          }
          break;
      }
    } catch (error) {
      const code =
        error instanceof Error && error.message.includes("protocol version")
          ? "unsupported_version"
          : "invalid_message";
      postToNative({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "editorError",
        requestID,
        code,
        action: recoveryActionFor(code),
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
};

function validateCurrentImageOwnership(
  command: Extract<NativeCommand, { type: "setImageDescriptors" | "prepareImageSave" }>,
): EditorMessage | undefined {
  const proof = command.imageOwnership;
  const composing = runtime?.composing || searchPanel.isInputComposing ||
    !!activeLinkEditor && composingLinkEditors.has(activeLinkEditor);
  if (composing) {
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
      requestID: command.requestID, documentID: command.documentID, revision: command.revision,
      code: "editor_not_ready", action: "retry",
      message: "Finish text composition before changing image resources",
    };
  }
  const current = runtime?.captureImageOwnership();
  const ownersMatch = current !== undefined &&
    current.imageURIs.length === proof.imageURIs.length &&
    current.imageURIs.every((uri, index) => uri === proof.imageURIs[index]);
  if (
    proof.documentID !== command.documentID || proof.revision !== command.revision ||
    current?.raw !== proof.raw || !ownersMatch
  ) {
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
      requestID: command.requestID, documentID: command.documentID, revision: command.revision,
      code: "stale_revision", action: "retry",
      message: "Image ownership proof no longer matches the current document",
    };
  }
  return undefined;
}

postToNative({ protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "ready" });

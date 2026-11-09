import {
  BRIDGE_PROTOCOL_VERSION,
  decodeNativeCommand,
  EditorProtocolSession,
  encodeEditorMessage,
  recoveryActionFor,
} from "./bridge";
import {
  createEditorRuntime,
  type EditorRuntime,
  type EditorRuntimeStatus,
  type LinkEditBinding,
  type RuntimeChangeKind,
} from "./editor-runtime";
import { analyzeDocument } from "./document-analysis";
import { DocumentAnalysisPanel } from "./document-analysis-panel";
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
const findBar = document.createElement("div");
findBar.className = "find-bar";
workspace.append(findBar);
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
const modeStatus = document.createElement("span");
modeStatus.className = "editor-mode-status";
modeStatus.setAttribute("role", "status");
modeBar.append(
  visualModeButton,
  sourceModeButton,
  sourceApplyButton,
  sourceCancelButton,
  modeStatus,
);
workspace.append(modeBar);
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
  title.value = binding.attrs?.title ?? "";
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
    apply({ href: href.value, title: title.value.length ? title.value : null });
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
  sourceApplyButton.disabled = !activeRuntime?.status.draftDirty || activeRuntime.composing;
  sourceCancelButton.disabled = !activeRuntime || activeRuntime.composing;
  modeStatus.textContent = activeRuntime?.status.unresolved
    ? "当前原文需要源码修复，保存已阻断"
    : activeRuntime?.status.draftDirty
      ? "源码草稿尚未提交"
      : "";
}

sourceModeButton.addEventListener("click", () => {
  closeLinkEditor();
  runtime?.enterSourceMode();
  updateModeControls();
});
visualModeButton.addEventListener("click", () => {
  closeLinkEditor();
  if (runtime?.mode === "source" && !runtime.status.draftDirty) {
    runtime.cancelSourceDraft();
  }
  updateModeControls();
});
sourceApplyButton.addEventListener("click", () => {
  runtime?.applySourceDraft();
  updateModeControls();
});
sourceCancelButton.addEventListener("click", () => {
  runtime?.cancelSourceDraft();
  updateModeControls();
});
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
});

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

function sameSearchResult(left: SourceSearchResult, right: SourceSearchResult): boolean {
  return left.source.raw === right.source.raw &&
    left.source.revision === right.source.revision &&
    left.query === right.query &&
    left.caseSensitive === right.caseSensitive &&
    left.maxResults === right.maxResults &&
    left.truncated === right.truncated &&
    left.matches.length === right.matches.length &&
    left.matches.every((match, index) => {
      const other = right.matches[index];
      return other !== undefined && match.from === other.from && match.to === other.to &&
        match.text === other.text;
    });
}

function performSearchNavigation(request: SearchNavigationRequest): SearchNavigationOutcome {
  const activeRuntime = runtime;
  if (!activeRuntime || !activeRuntime.sourceNavigation) {
    return { ok: false, message: "结构化编辑模式暂不支持原文范围定位" };
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
  if (raw !== request.binding.raw || raw !== request.result.source.raw ||
      request.result.source.revision !== activeRevision) {
    return { ok: false, message: "文档已变化，请等待查找刷新" };
  }

  let current: SourceSearchResult;
  try {
    current = searchSource(
      { raw, revision: activeRevision },
      searchPanel.query,
      { caseSensitive: searchPanel.caseSensitive, maxResults: SEARCH_MAX_RESULTS },
    );
  } catch {
    return { ok: false, message: "无法重新校验当前查找结果" };
  }
  if (!sameSearchResult(current, request.result)) {
    return { ok: false, message: "查找结果已过期，请等待刷新" };
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
  if (!activeRuntime?.sourceReplacement) {
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
  if (raw !== request.binding.raw || raw !== request.result.source.raw ||
      request.result.source.revision !== activeRevision) {
    return { ok: false, message: "文档已变化，请等待查找刷新" };
  }

  let current: SourceSearchResult;
  try {
    current = searchSource({ raw, revision: activeRevision }, searchPanel.query, {
      caseSensitive: searchPanel.caseSensitive, maxResults: SEARCH_MAX_RESULTS,
    });
  } catch {
    return { ok: false, message: "无法重新校验当前查找结果" };
  }
  if (!sameSearchResult(current, request.result)) {
    return { ok: false, message: "查找结果已过期，请等待刷新" };
  }
  if (request.kind === "replace-all" && current.truncated) {
    return { ok: false, message: "全部替换需要完整结果；当前结果已截断" };
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
    planned = planSourceReplaceAll(current, { raw, revision: activeRevision },
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
      const analysis = analyzeDocument({ raw, revision });
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
      const result = searchSource(
        { raw, revision },
        query,
        { caseSensitive, maxResults: SEARCH_MAX_RESULTS },
      );
      if (generation !== searchGeneration) return;
      searchPanel.update({
        kind: "document",
        binding: { documentID, revision, epoch, raw },
        result,
        navigation: activeRuntime.sourceNavigation
          ? { available: true }
          : { available: false, reason: "结构化编辑模式暂不支持原文范围定位" },
        replacement: activeRuntime.sourceReplacement
          ? { available: true }
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
  if (kind === "status") return;
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
              runtime?.destroy();
              runtime = createEditorRuntime(editorHost, command.text, recordRuntimeChange, {
                onLinkRequest: (binding) => {
                  const owner = runtime;
                  if (owner) openLinkEditor(owner, binding);
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
              if (runtime?.composing) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: "Finish text composition before saving or closing",
                });
                return;
              }
              const snapshot = runtime?.snapshotText();
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
              postToNative(session.createSnapshot(command, snapshot.value));
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
            // 原生菜单命令没有携带 Web 端文本输入焦点。查询区域拥有焦点或
            // 正在 composition 时，明确拒绝文档 Undo/Redo，避免越过查询框
            // 修改正文；正文重新拥有焦点后仍走既有文档历史。
            const documentCommandBlocked =
              searchPanel.ownsFocus || searchPanel.isInputComposing ||
              !!activeLinkEditor && (
                composingLinkEditors.has(activeLinkEditor) ||
                activeLinkEditor.contains(document.activeElement)
              );
            postToNative(
              session.executeCommand(
                command,
                () =>
                  !documentCommandBlocked &&
                  (command.command === "undo"
                    ? (runtime?.undo() ?? false)
                    : (runtime?.redo() ?? false)),
                () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              ),
            );
          } finally {
            // executingCommand 期间 runtime 回调被抑制（避免重复 Bridge 消息），
            // 但显式响应已作为 stateChanged 发出，面板据此刷新 Undo/Redo 后内容。
            executingCommand = false;
            updateModeControls();
          }
          break;
        case "queryState":
          postToNative(session.queryState(command));
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

postToNative({ protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "ready" });

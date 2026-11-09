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
} from "./editor-runtime";
import { analyzeDocument } from "./document-analysis";
import { DocumentAnalysisPanel } from "./document-analysis-panel";
import { SEARCH_MAX_RESULTS, SearchPanel } from "./search-panel";
import { searchSource } from "./source-search";
import "./style.css";

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
const editorHost = document.createElement("div");
editorHost.className = "editor-host";
workspace.append(editorHost);
const session = new EditorProtocolSession();
let runtime: EditorRuntime | undefined;
let executingCommand = false;
let activeDocumentID: string | undefined;
let activeRevision: number | undefined;
let loadEpoch = 0;

const panel = new DocumentAnalysisPanel(app, (snapshot, target) => {
  const activeRuntime = runtime;
  if (!activeRuntime) return { ok: false, message: "尚未打开文档" };
  if (activeRuntime.composing) return { ok: false, message: "请先完成中文输入，再定位标题" };
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
});

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
  if (!searchPanel.shouldSearch) return;
  if (runtime?.composing) return;
  const generation = searchGeneration;
  searchTimer = window.setTimeout(() => {
    searchTimer = undefined;
    // 跨文档/重复 load 已 bump generation，旧任务到此作废。
    if (generation !== searchGeneration) return;
    const activeRuntime = runtime;
    if (!activeRuntime || activeRuntime.composing) return;
    try {
      const raw = activeRuntime.getText();
      const result = searchSource(
        { raw, revision },
        searchPanel.query,
        { caseSensitive: searchPanel.caseSensitive, maxResults: SEARCH_MAX_RESULTS },
      );
      if (generation !== searchGeneration) return;
      searchPanel.update({
        kind: "document",
        binding: { documentID, revision, epoch: loadEpoch, raw },
        result,
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

function recordRuntimeChange(status: EditorRuntimeStatus): void {
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
              cancelPendingSearch();
              // 接受新 load：立即清旧查找结果与绑定（查询/大小写回到默认，
              // 面板开关保留）。被拒 load 不走这里，查找状态原样保留。
              searchPanel.resetForNewDocument();
              loadEpoch += 1;
              runtime?.destroy();
              runtime = createEditorRuntime(editorHost, command.text, recordRuntimeChange);
              runtime.focus();
            }
            postToNative(response);
          }
          break;
        case "createSnapshot":
          // Native has resigned first responder. Drain compositionend (including
          // ProseMirror's final DOM transaction) before sampling text and revision.
          {
            const capture = (): void => {
              if (runtime?.composing) {
                postToNative({
                  protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "editorError",
                  requestID: command.requestID, code: "editor_not_ready", action: "retry",
                  message: "Finish text composition before saving or closing",
                });
                return;
              }
              postToNative(session.queryState({
                protocolVersion: BRIDGE_PROTOCOL_VERSION, type: "queryState",
                requestID: `${command.requestID}-state`,
              }));
              postToNative(session.createSnapshot(command, runtime?.getText() ?? ""));
            };
            if (runtime?.composing) window.setTimeout(capture, 0);
            else capture();
          }
          break;
        case "markSaved":
          executingCommand = true;
          try {
            runtime?.markSaved(command.text);
            postToNative(
              session.markSaved(
                command,
                runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              ),
            );
          } finally {
            executingCommand = false;
          }
          break;
        case "executeCommand":
          executingCommand = true;
          try {
            postToNative(
              session.executeCommand(
                command,
                () =>
                  command.command === "undo"
                    ? (runtime?.undo() ?? false)
                    : (runtime?.redo() ?? false),
                () => runtime?.status ?? { dirty: false, canUndo: false, canRedo: false },
              ),
            );
          } finally {
            // executingCommand 期间 runtime 回调被抑制（避免重复 Bridge 消息），
            // 但显式响应已作为 stateChanged 发出，面板据此刷新 Undo/Redo 后内容。
            executingCommand = false;
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

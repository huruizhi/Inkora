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

// 稳定子宿主：分析更新只重绘面板，绝不重建/移动活编辑器 DOM。
// loadDocument 时 createEditorRuntime 自行清空并重建 editorHost 内容。
const editorHost = document.createElement("div");
editorHost.className = "editor-host";
app.append(editorHost);
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
              cancelPendingAnalysis();
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

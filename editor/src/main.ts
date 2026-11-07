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
import "./style.css";

declare global {
  interface Window {
    inkora: {
      receive(serialized: string): void;
    };
    webkit?: {
      messageHandlers?: {
        inkora?: {
          postMessage(message: string): void;
        };
      };
    };
  }
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("Missing #app element");
}

const session = new EditorProtocolSession();
let runtime: EditorRuntime | undefined;
let executingCommand = false;

function postToNative(message: Parameters<typeof encodeEditorMessage>[0]): void {
  const serialized = encodeEditorMessage(message);
  const handler = window.webkit?.messageHandlers?.inkora;
  if (handler) {
    handler.postMessage(serialized);
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
            const response = session.loadDocument(command);
            if (response.type === "stateChanged") {
              runtime?.destroy();
              runtime = createEditorRuntime(app, command.text, recordRuntimeChange);
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

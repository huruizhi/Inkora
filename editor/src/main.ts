import {
  BRIDGE_PROTOCOL_VERSION,
  decodeNativeCommand,
  EditorProtocolSession,
  encodeEditorMessage,
  recoveryActionFor,
} from "./bridge";
import { TextAreaEditorKernel } from "./editor-kernel";
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

const textArea = document.createElement("textarea");
textArea.id = "editor";
textArea.autocapitalize = "off";
textArea.autocomplete = "off";
textArea.spellcheck = false;
textArea.setAttribute("aria-label", "Markdown editor");
app.append(textArea);

const kernel = new TextAreaEditorKernel(textArea);
const session = new EditorProtocolSession();

function postToNative(message: Parameters<typeof encodeEditorMessage>[0]): void {
  const serialized = encodeEditorMessage(message);
  const handler = window.webkit?.messageHandlers?.inkora;
  if (handler) {
    handler.postMessage(serialized);
  }
}

kernel.onChange(() => {
  const message = session.recordChange();
  if (message) postToNative(message);
});

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
              kernel.setText(command.text);
              kernel.focus();
            }
            postToNative(response);
          }
          break;
        case "createSnapshot":
          postToNative(session.createSnapshot(command, kernel.getText()));
          break;
        case "executeCommand":
          postToNative(session.rejectCommand(command));
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

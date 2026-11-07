import { decodeNativeCommand, encodeEditorMessage } from "./bridge";
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

function postToNative(message: Parameters<typeof encodeEditorMessage>[0]): void {
  const serialized = encodeEditorMessage(message);
  const handler = window.webkit?.messageHandlers?.inkora;
  if (handler) {
    handler.postMessage(serialized);
  }
}

kernel.onChange((text) => {
  postToNative({ type: "contentChanged", text });
});

window.inkora = {
  receive(serialized: string): void {
    let requestID: string | undefined;
    try {
      const command = decodeNativeCommand(serialized);
      switch (command.type) {
        case "load":
          kernel.setText(command.text);
          kernel.focus();
          break;
        case "getText":
          requestID = command.requestID;
          postToNative({
            type: "text",
            requestID: command.requestID,
            text: kernel.getText(),
          });
          break;
      }
    } catch (error) {
      postToNative({
        type: "error",
        requestID,
        code: "invalid_message",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
};

postToNative({ type: "ready" });

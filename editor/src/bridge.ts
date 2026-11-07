export type NativeCommand =
  | { type: "load"; text: string }
  | { type: "getText"; requestID: string };

export type EditorMessage =
  | { type: "ready" }
  | { type: "contentChanged"; text: string }
  | { type: "text"; requestID: string; text: string }
  | { type: "error"; requestID?: string; code: string; message: string };

export function decodeNativeCommand(serialized: string): NativeCommand {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid native command");
  }

  if (value.type === "load") {
    if (typeof value.text !== "string") {
      throw new Error("Invalid load command");
    }
    return { type: "load", text: value.text };
  }

  if (value.type === "getText") {
    if (typeof value.requestID !== "string") {
      throw new Error("Invalid getText command");
    }
    return { type: "getText", requestID: value.requestID };
  }

  throw new Error(`Unsupported native command: ${value.type}`);
}

export function encodeEditorMessage(message: EditorMessage): string {
  return JSON.stringify(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

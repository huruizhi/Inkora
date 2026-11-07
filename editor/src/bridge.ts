export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export type EditorCommand = "undo" | "redo";
export type EditorErrorCode =
  | "invalid_message"
  | "unsupported_version"
  | "editor_not_ready"
  | "stale_revision"
  | "request_conflict"
  | "command_rejected"
  | "internal_error";
export type RecoveryAction = "retry" | "notify" | "stop_saving";

export interface EditorState {
  documentID: string;
  revision: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export type NativeCommand =
  | {
      protocolVersion: 1;
      type: "loadDocument";
      requestID: string;
      documentID: string;
      revision: number;
      text: string;
    }
  | {
      protocolVersion: 1;
      type: "createSnapshot";
      requestID: string;
      documentID: string;
      revision: number;
    }
  | {
      protocolVersion: 1;
      type: "executeCommand";
      requestID: string;
      documentID: string;
      revision: number;
      command: EditorCommand;
    }
  | {
      protocolVersion: 1;
      type: "queryState";
      requestID: string;
    };

export type EditorMessage =
  | { protocolVersion: 1; type: "ready" }
  | {
      protocolVersion: 1;
      type: "stateChanged";
      requestID?: string;
      state: EditorState;
    }
  | {
      protocolVersion: 1;
      type: "snapshotReady";
      requestID: string;
      documentID: string;
      revision: number;
      text: string;
    }
  | {
      protocolVersion: 1;
      type: "editorError";
      requestID?: string;
      documentID?: string;
      revision?: number;
      code: EditorErrorCode;
      action: RecoveryAction;
      message: string;
    };

export function decodeNativeCommand(serialized: string): NativeCommand {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid native command");
  }
  if (value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    throw new Error("Unsupported Bridge protocol version");
  }
  const requestID = requireString(value, "requestID");

  switch (value.type) {
    case "loadDocument":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "loadDocument",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        text: requireString(value, "text", true),
      };
    case "createSnapshot":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "createSnapshot",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
      };
    case "executeCommand": {
      const command = requireString(value, "command");
      if (command !== "undo" && command !== "redo") {
        throw new Error("Invalid editor command");
      }
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "executeCommand",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        command,
      };
    }
    case "queryState":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "queryState",
        requestID,
      };
    default:
      throw new Error(`Unsupported native command: ${value.type}`);
  }
}

export function encodeEditorMessage(message: EditorMessage): string {
  return JSON.stringify(message);
}

export function recoveryActionFor(code: EditorErrorCode): RecoveryAction {
  switch (code) {
    case "editor_not_ready":
    case "stale_revision":
    case "request_conflict":
      return "retry";
    case "command_rejected":
      return "notify";
    case "invalid_message":
    case "unsupported_version":
    case "internal_error":
      return "stop_saving";
  }
}

export class EditorProtocolSession {
  private state: EditorState | undefined;
  private readonly usedRequestIDs = new Set<string>();

  loadDocument(command: Extract<NativeCommand, { type: "loadDocument" }>): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    if (
      this.state?.documentID === command.documentID &&
      command.revision < this.state.revision
    ) {
      return this.error("stale_revision", command.requestID, "Load revision is stale");
    }
    this.state = {
      documentID: command.documentID,
      revision: command.revision,
      dirty: false,
      canUndo: false,
      canRedo: false,
    };
    return this.stateChanged(command.requestID);
  }

  recordChange(): EditorMessage | undefined {
    if (!this.state) return undefined;
    if (this.state.revision >= Number.MAX_SAFE_INTEGER) {
      return this.error("internal_error", undefined, "Revision limit reached");
    }
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      dirty: true,
      canUndo: false,
      canRedo: false,
    };
    return this.stateChanged();
  }

  createSnapshot(
    command: Extract<NativeCommand, { type: "createSnapshot" }>,
    text: string,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    const mismatch = this.validateDocumentRevision(command);
    if (mismatch) return mismatch;
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "snapshotReady",
      requestID: command.requestID,
      documentID: command.documentID,
      revision: command.revision,
      text,
    };
  }

  queryState(command: Extract<NativeCommand, { type: "queryState" }>): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    if (!this.state) {
      return this.error("editor_not_ready", command.requestID, "No document is loaded");
    }
    return this.stateChanged(command.requestID);
  }

  rejectCommand(
    command: Extract<NativeCommand, { type: "executeCommand" }>,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    const mismatch = this.validateDocumentRevision(command);
    if (mismatch) return mismatch;
    return this.error(
      "command_rejected",
      command.requestID,
      `Command is not implemented: ${command.command}`,
    );
  }

  private validateDocumentRevision(command: {
    requestID: string;
    documentID: string;
    revision: number;
  }): EditorMessage | undefined {
    if (!this.state) {
      return this.error("editor_not_ready", command.requestID, "No document is loaded");
    }
    if (
      command.documentID !== this.state.documentID ||
      command.revision !== this.state.revision
    ) {
      return this.error("stale_revision", command.requestID, "Revision does not match");
    }
    return undefined;
  }

  private claimRequest(requestID: string): EditorMessage | undefined {
    if (this.usedRequestIDs.has(requestID)) {
      return this.error("request_conflict", requestID, "requestID was already used");
    }
    this.usedRequestIDs.add(requestID);
    return undefined;
  }

  private stateChanged(requestID?: string): EditorMessage {
    if (!this.state) {
      return this.error("internal_error", requestID, "State is unavailable");
    }
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "stateChanged",
      ...(requestID ? { requestID } : {}),
      state: this.state,
    };
  }

  private error(
    code: EditorErrorCode,
    requestID: string | undefined,
    message: string,
  ): EditorMessage {
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "editorError",
      ...(requestID ? { requestID } : {}),
      ...(this.state
        ? { documentID: this.state.documentID, revision: this.state.revision }
        : {}),
      code,
      action: recoveryActionFor(code),
      message,
    };
  }
}

function requireRevision(value: Record<string, unknown>): number {
  const revision = value.revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new Error("Invalid revision");
  }
  return revision as number;
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  allowEmpty = false,
): string {
  const field = value[key];
  if (typeof field !== "string" || (!allowEmpty && field.length === 0)) {
    throw new Error(`Invalid ${key}`);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

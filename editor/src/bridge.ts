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
  selectionAnchor?: number;
  selectionHead?: number;
}

export interface EditableState {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectionAnchor?: number;
  selectionHead?: number;
}

export type ImageDescriptorStatus =
  | "ready" | "missing" | "denied" | "unsupported" | "error" | "pending";

export interface BridgeImageDescriptor {
  href: string;
  status: ImageDescriptorStatus;
  displayURL?: string;
  message?: string;
}

export interface BridgeImageOwnershipProof {
  readonly documentID: string;
  readonly revision: number;
  readonly raw: string;
  readonly imageURIs: readonly string[];
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
      type: "markSaved";
      requestID: string;
      documentID: string;
      revision: number;
      text: string;
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
    }
  | {
      protocolVersion: 1;
      type: "applyImageImport";
      requestID: string;
      documentID: string;
      revision: number;
      documentEpoch: string;
      assetID: string;
      uri: string;
      alt: string;
      title: string | null;
      displayURL: string;
      selectionAnchor: number;
      selectionHead: number;
    }
  | {
      protocolVersion: 1;
      type: "setImageDescriptors";
      requestID: string;
      documentID: string;
      revision: number;
      documentEpoch: string;
      imageOwnership: BridgeImageOwnershipProof;
      descriptors: BridgeImageDescriptor[];
    }
  | {
      protocolVersion: 1;
      type: "prepareImageSave";
      requestID: string;
      documentID: string;
      revision: number;
      documentEpoch: string;
      imageOwnership: BridgeImageOwnershipProof;
      rewrites: Array<{ assetID: string; from: string; to: string }>;
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
      imageOwnership?: BridgeImageOwnershipProof;
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
    }
  | {
      protocolVersion: 1;
      type: "imageAccessRequested";
      documentID: string;
      revision: number;
      href: string;
      imageOwnership?: BridgeImageOwnershipProof;
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
    case "markSaved":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "markSaved",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        text: requireString(value, "text", true),
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
    case "applyImageImport":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "applyImageImport",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        documentEpoch: requireString(value, "documentEpoch"),
        assetID: requireString(value, "assetID"),
        uri: requireString(value, "uri"),
        alt: requireString(value, "alt", true),
        title: requireNullableString(value, "title"),
        displayURL: requireCapabilityURL(value, "displayURL"),
        selectionAnchor: requireSafePosition(value, "selectionAnchor"),
        selectionHead: requireSafePosition(value, "selectionHead"),
      };
    case "setImageDescriptors":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "setImageDescriptors",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        documentEpoch: requireString(value, "documentEpoch"),
        imageOwnership: requireImageOwnership(value.imageOwnership),
        descriptors: requireImageDescriptors(value.descriptors),
      };
    case "prepareImageSave":
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        type: "prepareImageSave",
        requestID,
        documentID: requireString(value, "documentID"),
        revision: requireRevision(value),
        documentEpoch: requireString(value, "documentEpoch"),
        imageOwnership: requireImageOwnership(value.imageOwnership),
        rewrites: requireImageRewrites(value.rewrites),
      };
    default:
      throw new Error(`Unsupported native command: ${value.type}`);
  }
}

function requireImageOwnership(value: unknown): BridgeImageOwnershipProof {
  if (!isRecord(value)) throw new Error("Missing imageOwnership");
  const imageURIs = value.imageURIs;
  if (!Array.isArray(imageURIs) || imageURIs.some(uri => typeof uri !== "string" || uri === "")) {
    throw new Error("Invalid imageOwnership.imageURIs");
  }
  return {
    documentID: requireString(value, "documentID"),
    revision: requireRevision(value),
    raw: requireString(value, "raw", true),
    imageURIs: imageURIs as string[],
  };
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

  loadDocument(
    command: Extract<NativeCommand, { type: "loadDocument" }>,
    editable: EditableState = { dirty: false, canUndo: false, canRedo: false },
  ): EditorMessage {
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
      ...editable,
    };
    return this.stateChanged(command.requestID);
  }

  recordChange(editable: EditableState): EditorMessage | undefined {
    if (!this.state) return undefined;
    if (this.state.revision >= Number.MAX_SAFE_INTEGER) {
      return this.error("internal_error", undefined, "Revision limit reached");
    }
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      ...editable,
    };
    return this.stateChanged();
  }

  executeCommand(
    command: Extract<NativeCommand, { type: "executeCommand" }>,
    execute: () => boolean,
    getEditableState: () => EditableState,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    const mismatch = this.validateDocumentRevision(command);
    if (mismatch) return mismatch;
    if (!this.state || this.state.revision >= Number.MAX_SAFE_INTEGER) {
      return this.error("internal_error", command.requestID, "Revision limit reached");
    }
    if (!execute()) {
      return this.error(
        "command_rejected",
        command.requestID,
        `Command cannot be applied: ${command.command}`,
      );
    }
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      ...getEditableState(),
    };
    return this.stateChanged(command.requestID);
  }

  createSnapshot(
    command: Extract<NativeCommand, { type: "createSnapshot" }>,
    ownership: { readonly raw: string; readonly imageURIs: readonly string[] } | string,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    if (!this.state) {
      return this.error("editor_not_ready", command.requestID, "No document is loaded");
    }
    if (
      command.documentID !== this.state.documentID ||
      command.revision > this.state.revision
    ) {
      return this.error("stale_revision", command.requestID, "Revision is ahead or mismatched");
    }
    const captured = typeof ownership === "string"
      ? { raw: ownership, imageURIs: undefined }
      : ownership;
    return {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "snapshotReady",
      requestID: command.requestID,
      documentID: command.documentID,
      revision: this.state.revision,
      text: captured.raw,
      ...(captured.imageURIs ? {
        imageOwnership: {
          documentID: command.documentID,
          revision: this.state.revision,
          raw: captured.raw,
          imageURIs: [...captured.imageURIs],
        },
      } : {}),
    };
  }

  markSaved(
    command: Extract<NativeCommand, { type: "markSaved" }>,
    editable: EditableState | (() => EditableState),
    apply?: () => void,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    if (!this.state) {
      return this.error("editor_not_ready", command.requestID, "No document is loaded");
    }
    if (
      command.documentID !== this.state.documentID ||
      command.revision > this.state.revision
    ) {
      return this.error("stale_revision", command.requestID, "Saved revision is ahead or mismatched");
    }
    apply?.();
    this.state = {
      ...this.state,
      ...(typeof editable === "function" ? editable() : editable),
    };
    return this.stateChanged(command.requestID);
  }

  queryState(
    command: Extract<NativeCommand, { type: "queryState" }>,
    editable?: EditableState,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    if (!this.state) {
      return this.error("editor_not_ready", command.requestID, "No document is loaded");
    }
    if (editable) this.state = { ...this.state, ...editable };
    return this.stateChanged(command.requestID);
  }

  executeMutation(
    command: { requestID: string; documentID: string; revision: number },
    execute: () => boolean,
    getEditableState: () => EditableState,
    didChange: () => boolean = () => true,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    const mismatch = this.validateDocumentRevision(command);
    if (mismatch) return mismatch;
    if (!this.state || this.state.revision >= Number.MAX_SAFE_INTEGER) {
      return this.error("internal_error", command.requestID, "Revision limit reached");
    }
    if (!execute()) {
      return this.error("command_rejected", command.requestID, "Image content transaction was rejected");
    }
    this.state = {
      ...this.state,
      revision: this.state.revision + (didChange() ? 1 : 0),
      ...getEditableState(),
    };
    return this.stateChanged(command.requestID);
  }

  acknowledge(
    command: { requestID: string; documentID: string; revision: number },
    editable: EditableState,
  ): EditorMessage {
    const duplicate = this.claimRequest(command.requestID);
    if (duplicate) return duplicate;
    const mismatch = this.validateDocumentRevision(command);
    if (mismatch) return mismatch;
    this.state = { ...this.state!, ...editable };
    return this.stateChanged(command.requestID);
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

function requireSafePosition(value: Record<string, unknown>, key: string): number {
  const position = value[key];
  if (!Number.isSafeInteger(position) || (position as number) < 0) {
    throw new Error(`Invalid ${key}`);
  }
  return position as number;
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

function requireNullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  // Swift's synthesized Codable omits nil optionals. Treat an omitted nullable
  // field exactly like JSON null so both encoders preserve protocol semantics.
  if (field === undefined) return null;
  if (field !== null && typeof field !== "string") throw new Error(`Invalid ${key}`);
  return field as string | null;
}

const capabilityPattern = /^inkora-asset:\/\/resource\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireCapabilityURL(value: Record<string, unknown>, key: string): string {
  const field = requireString(value, key);
  if (!capabilityPattern.test(field)) throw new Error(`Invalid ${key}`);
  return field;
}

function requireImageDescriptors(value: unknown): BridgeImageDescriptor[] {
  if (!Array.isArray(value)) throw new Error("Invalid image descriptor");
  return value.map(item => {
    if (!isRecord(item)) throw new Error("Invalid image descriptor");
    const href = requireString(item, "href");
    const status = requireString(item, "status") as ImageDescriptorStatus;
    if (!["ready", "missing", "denied", "unsupported", "error", "pending"].includes(status)) {
      throw new Error("Invalid image descriptor");
    }
    const displayURL = item.displayURL === undefined ? undefined : requireCapabilityURL(item, "displayURL");
    const message = item.message === undefined ? undefined : requireString(item, "message");
    if ((status === "ready") !== (displayURL !== undefined)) throw new Error("Invalid image descriptor");
    return { href, status, ...(displayURL ? { displayURL } : {}), ...(message ? { message } : {}) };
  });
}

function requireImageRewrites(value: unknown): Array<{ assetID: string; from: string; to: string }> {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Invalid image rewrites");
  return value.map(item => {
    if (!isRecord(item)) throw new Error("Invalid image rewrites");
    return {
      assetID: requireString(item, "assetID"),
      from: requireString(item, "from"),
      to: requireString(item, "to"),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

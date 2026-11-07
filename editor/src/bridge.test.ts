import { describe, expect, it } from "vitest";

import {
  BRIDGE_PROTOCOL_VERSION,
  decodeNativeCommand,
  EditorProtocolSession,
  encodeEditorMessage,
  recoveryActionFor,
} from "./bridge";

describe("Bridge protocol v1 contracts", () => {
  it("decodes loadDocument without changing Markdown bytes", () => {
    const markdown = "# 标题\r\n\r\nemoji: 🖋️";

    expect(
      decodeNativeCommand(
        JSON.stringify({
          protocolVersion: 1,
          type: "loadDocument",
          requestID: "load-1",
          documentID: "doc-1",
          revision: 0,
          text: markdown,
        }),
      ),
    ).toEqual({
      protocolVersion: 1,
      type: "loadDocument",
      requestID: "load-1",
      documentID: "doc-1",
      revision: 0,
      text: markdown,
    });
  });

  it("decodes snapshot, command, and state queries", () => {
    expect(
      decodeNativeCommand(
        '{"protocolVersion":1,"type":"createSnapshot","requestID":"snap-1","documentID":"doc-1","revision":4}',
      ),
    ).toMatchObject({ type: "createSnapshot", revision: 4 });
    expect(
      decodeNativeCommand(
        '{"protocolVersion":1,"type":"executeCommand","requestID":"cmd-1","documentID":"doc-1","revision":4,"command":"undo"}',
      ),
    ).toMatchObject({ type: "executeCommand", command: "undo" });
    expect(
      decodeNativeCommand(
        '{"protocolVersion":1,"type":"queryState","requestID":"state-1"}',
      ),
    ).toEqual({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "queryState",
      requestID: "state-1",
    });
  });

  it("rejects unsupported versions, invalid revisions, and malformed commands", () => {
    expect(() =>
      decodeNativeCommand(
        '{"protocolVersion":0,"type":"queryState","requestID":"state-1"}',
      ),
    ).toThrow("Unsupported Bridge protocol version");
    expect(() =>
      decodeNativeCommand(
        '{"protocolVersion":1,"type":"createSnapshot","requestID":"snap-1","documentID":"doc-1","revision":-1}',
      ),
    ).toThrow("Invalid revision");
    expect(() =>
      decodeNativeCommand(
        '{"protocolVersion":1,"type":"executeCommand","requestID":"cmd-1","documentID":"doc-1","revision":0,"command":"formatDisk"}',
      ),
    ).toThrow("Invalid editor command");
  });

  it("encodes every editor event with protocolVersion", () => {
    expect(
      encodeEditorMessage({ protocolVersion: 1, type: "ready" }),
    ).toBe('{"protocolVersion":1,"type":"ready"}');
    expect(
      JSON.parse(
        encodeEditorMessage({
          protocolVersion: 1,
          type: "stateChanged",
          requestID: "load-1",
          state: {
            documentID: "doc-1",
            revision: 2,
            dirty: true,
            canUndo: true,
            canRedo: false,
          },
        }),
      ),
    ).toMatchObject({ type: "stateChanged", state: { revision: 2 } });
    expect(
      JSON.parse(
        encodeEditorMessage({
          protocolVersion: 1,
          type: "snapshotReady",
          requestID: "snap-1",
          documentID: "doc-1",
          revision: 2,
          text: "正文",
        }),
      ),
    ).toMatchObject({ type: "snapshotReady", text: "正文" });
    expect(
      JSON.parse(
        encodeEditorMessage({
          protocolVersion: 1,
          type: "editorError",
          code: "invalid_message",
          action: "stop_saving",
          message: "bad command",
        }),
      ),
    ).toMatchObject({ type: "editorError", action: "stop_saving" });
  });

  it("keeps revisions monotonic and rejects stale or duplicate requests", () => {
    const session = new EditorProtocolSession();
    const loaded = session.loadDocument({
      protocolVersion: 1,
      type: "loadDocument",
      requestID: "load-1",
      documentID: "doc-1",
      revision: 4,
      text: "first",
    });
    expect(loaded).toMatchObject({ type: "stateChanged", state: { revision: 4 } });

    expect(session.recordChange()).toMatchObject({
      type: "stateChanged",
      state: { revision: 5, dirty: true },
    });
    expect(
      session.createSnapshot(
        {
          protocolVersion: 1,
          type: "createSnapshot",
          requestID: "snap-stale",
          documentID: "doc-1",
          revision: 4,
        },
        "stale",
      ),
    ).toMatchObject({
      type: "editorError",
      code: "stale_revision",
      action: "retry",
    });
    const currentCommand = {
      protocolVersion: 1 as const,
      type: "createSnapshot" as const,
      requestID: "snap-current",
      documentID: "doc-1",
      revision: 5,
    };
    expect(session.createSnapshot(currentCommand, "current")).toMatchObject({
      type: "snapshotReady",
      revision: 5,
      text: "current",
    });
    expect(session.createSnapshot(currentCommand, "duplicate")).toMatchObject({
      type: "editorError",
      code: "request_conflict",
    });
    expect(
      session.loadDocument({
        protocolVersion: 1,
        type: "loadDocument",
        requestID: "load-stale",
        documentID: "doc-1",
        revision: 3,
        text: "old",
      }),
    ).toMatchObject({ type: "editorError", code: "stale_revision" });
  });

  it("classifies errors into retry, notify, and stop-saving actions", () => {
    expect(recoveryActionFor("editor_not_ready")).toBe("retry");
    expect(recoveryActionFor("stale_revision")).toBe("retry");
    expect(recoveryActionFor("command_rejected")).toBe("notify");
    expect(recoveryActionFor("invalid_message")).toBe("stop_saving");
    expect(recoveryActionFor("internal_error")).toBe("stop_saving");
  });

  it("reports editor_not_ready before a document is loaded", () => {
    const session = new EditorProtocolSession();
    expect(
      session.queryState({
        protocolVersion: 1,
        type: "queryState",
        requestID: "state-1",
      }),
    ).toMatchObject({
      type: "editorError",
      code: "editor_not_ready",
      action: "retry",
    });
  });

  it("stops instead of overflowing the safe revision range", () => {
    const session = new EditorProtocolSession();
    session.loadDocument({
      protocolVersion: 1,
      type: "loadDocument",
      requestID: "load-max",
      documentID: "doc-max",
      revision: Number.MAX_SAFE_INTEGER,
      text: "max",
    });

    expect(session.recordChange()).toMatchObject({
      type: "editorError",
      code: "internal_error",
      action: "stop_saving",
    });
  });
});

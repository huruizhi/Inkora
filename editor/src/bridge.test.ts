import { describe, expect, it } from "vitest";

import { decodeNativeCommand, encodeEditorMessage } from "./bridge";

describe("editor bridge protocol", () => {
  it("decodes a load command without changing Markdown bytes", () => {
    const markdown = "# 标题\r\n\r\nemoji: 🖋️";

    expect(
      decodeNativeCommand(
        JSON.stringify({ type: "load", text: markdown }),
      ),
    ).toEqual({ type: "load", text: markdown });
  });

  it("encodes a content change as the documented wire message", () => {
    expect(
      encodeEditorMessage({ type: "contentChanged", text: "**bold**" }),
    ).toBe('{"type":"contentChanged","text":"**bold**"}');
  });

  it("decodes a getText command with its request ID", () => {
    expect(
      decodeNativeCommand(
        '{"type":"getText","requestID":"request-123"}',
      ),
    ).toEqual({ type: "getText", requestID: "request-123" });
  });

  it("encodes ready, text, and error responses", () => {
    expect(encodeEditorMessage({ type: "ready" })).toBe('{"type":"ready"}');
    expect(
      encodeEditorMessage({
        type: "text",
        requestID: "request-123",
        text: "正文",
      }),
    ).toBe(
      '{"type":"text","requestID":"request-123","text":"正文"}',
    );
    expect(
      encodeEditorMessage({
        type: "error",
        requestID: "request-123",
        code: "invalid_message",
        message: "bad command",
      }),
    ).toBe(
      '{"type":"error","requestID":"request-123","code":"invalid_message","message":"bad command"}',
    );
  });

  it("rejects malformed commands at the bridge boundary", () => {
    expect(() =>
      decodeNativeCommand('{"type":"load","text":42}'),
    ).toThrow("Invalid load command");
  });
});

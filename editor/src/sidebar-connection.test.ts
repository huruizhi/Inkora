import { describe, expect, it } from "vitest";
import { SidebarConnection } from "./sidebar-connection";
const catalog = { id: "cat", rootName: "root", files: [{ id: "file", name: "a.md", relativePath: "a.md", summary: "a" }], incomplete: false, skippedFiles: 0 };
const options = { caseSensitive: false, wholeWord: false, regularExpression: false };
function setup() {
  let binding = { documentID: "doc", revision: 1 }; const sent: Record<string, unknown>[] = []; const catalogs: unknown[] = []; const results: unknown[] = []; const errors: string[] = []; let resets = 0;
  const connection = new SidebarConnection({ binding: () => binding, send: value => { sent.push(JSON.parse(value)); return true; }, catalog: value => catalogs.push(value), result: (query, value) => results.push({ query, value }), error: value => errors.push(value), reset: () => resets++ });
  const receive = (value: Record<string, unknown>) => connection.receive(JSON.stringify({ documentID: binding.documentID, contextID: "ctx", ...value }));
  connection.connect(); const first = sent.at(-1)!;
  receive({ kind: "ready", requestID: first.requestID }); receive({ kind: "catalog", requestID: first.requestID, catalog });
  return { connection, receive, sent, catalogs, results, errors, resets: () => resets, changeDocument: () => { binding = { documentID: "other", revision: 0 }; } };
}
describe("侧栏请求代际", () => {
  it("只接受最新query/选项响应；错误请求和旧catalog不可触发打开", () => {
    const s = setup(); s.connection.perform({ type: "search", catalogID: "cat", query: "a", options }); const old = s.sent.at(-1)!;
    s.connection.perform({ type: "search", catalogID: "cat", query: "a", options: { ...options, regularExpression: true } }); const current = s.sent.at(-1)!;
    const result = { hits: [{ fileID: "file", line: 1, snippet: "a", hitID: "hit", utf16Location: 0, utf16Length: 1 }], truncated: false };
    s.receive({ kind: "search", requestID: old.requestID, query: "a", result }); s.receive({ kind: "error", requestID: old.requestID, message: "old" }); expect(s.results).toEqual([]); expect(s.errors).toEqual([]);
    s.receive({ kind: "search", requestID: current.requestID, query: "wrong", result }); expect(s.results).toEqual([]);
    s.receive({ kind: "search", requestID: current.requestID, query: "a", result }); expect(s.results).toHaveLength(1);
    s.connection.perform({ type: "open", catalogID: "cat", fileID: "file", hitID: "hit" }); expect(s.sent.at(-1)).toMatchObject({ action: "open", hitID: "hit" });
    const count = s.sent.length; s.connection.perform({ type: "open", catalogID: "old", fileID: "file" }); expect(s.sent).toHaveLength(count);
  });
  it("返回/清空取消旧响应及旧open错误，当前open错误仍可达", () => {
    const s = setup(); s.connection.perform({ type: "open", catalogID: "cat", fileID: "file" }); const open = s.sent.at(-1)!;
    s.receive({ kind: "error", requestID: open.requestID, message: "打开失败" }); expect(s.errors).toEqual(["打开失败"]);
    s.connection.perform({ type: "open", catalogID: "cat", fileID: "file" }); const stale = s.sent.at(-1)!; const count = s.sent.length;
    s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(count + 1); expect(s.sent.at(-1)).toMatchObject({ action: "cancelSearch", catalogID: "cat", targetOpenRequestID: stale.requestID }); s.receive({ kind: "error", requestID: stale.requestID, message: "old" }); expect(s.errors).toHaveLength(1);
  });
  it("重连/跨load/跨document拒绝旧回包，invalidated仅刷新当前catalog", () => {
    const s = setup(); s.connection.perform({ type: "search", catalogID: "cat", query: "a", options }); const old = s.sent.at(-1)!;
    s.receive({ kind: "invalidated", catalogID: "old" }); expect(s.sent.at(-1)).toBe(old);
    s.receive({ kind: "invalidated", catalogID: "cat" }); expect(s.sent.at(-1)!.action).toBe("refresh");
    s.connection.connect(); expect(s.resets()).toBe(2);
    s.receive({ kind: "error", requestID: old.requestID, message: "old" }); expect(s.errors).toEqual([]);
    const ready = s.sent.at(-1)!; s.changeDocument(); s.receive({ kind: "ready", requestID: ready.requestID });
    const count = s.sent.length; s.connection.perform({ type: "refresh" }); expect(s.sent).toHaveLength(count);
    s.receive({ kind: "catalog", documentID: "doc", requestID: ready.requestID, catalog }); expect(s.catalogs).toHaveLength(1);
  });
  it("恶意或非法结果不触发UI callback", () => {
    const s = setup(); s.connection.receive("bad json");
    s.receive({ kind: "ready", contextID: "forged" });
    s.receive({ kind: "catalog", catalog }); expect(s.catalogs).toHaveLength(1); s.connection.perform({ type: "search", catalogID: "cat", query: "a", options }); const requestID = s.sent.at(-1)!.requestID;
    s.receive({ kind: "search", requestID, query: "a", result: { truncated: false, hits: [{ fileID: "file", line: 0, snippet: "a" }] } }); expect(s.results).toEqual([]);
    s.receive({ kind: "search", requestID, query: "a", result: { truncated: false, hits: [{ fileID: "file", line: 1, snippet: "a", hitID: {} }] } }); expect(s.results).toEqual([]);
  });
});

describe("Native取消传输", () => {
  it("取消已完成搜索的hit能力与延迟open，捕获旧目标后清空本地", () => {
    const s = setup(); s.connection.perform({ type: "search", catalogID: "cat", query: "a", options }); const search = s.sent.at(-1)!;
    s.receive({ kind: "search", requestID: search.requestID, query: "a", result: { hits: [{ fileID: "file", line: 1, snippet: "a", hitID: "proof" }], truncated: false } });
    s.connection.perform({ type: "open", catalogID: "cat", fileID: "file", hitID: "proof" }); const open = s.sent.at(-1)!;
    s.connection.perform({ type: "cancelSearch" }); const cancel = s.sent.at(-1)!;
    expect(cancel).toEqual({ action: "cancelSearch", requestID: expect.any(String), documentID: "doc", revision: 1, contextID: "ctx", catalogID: "cat", targetSearchRequestID: search.requestID, targetOpenRequestID: open.requestID });
    expect(cancel.requestID).not.toBe(open.requestID); expect(cancel.requestID).not.toBe(search.requestID);
    s.receive({ kind: "search", requestID: search.requestID, query: "a", result: { hits: [], truncated: false } });
    s.receive({ kind: "error", requestID: open.requestID, message: "old" }); expect(s.errors).toEqual([]); expect(s.results).toHaveLength(1);
    const count = s.sent.length; s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(count);
  });
  it("迟到cancelled不影响新search/open；新取消仅指向新目标", () => {
    const s = setup(); s.connection.perform({ type: "search", catalogID: "cat", query: "old", options }); const oldSearch = s.sent.at(-1)!;
    s.connection.perform({ type: "cancelSearch" }); const oldCancel = s.sent.at(-1)!;
    s.connection.perform({ type: "search", catalogID: "cat", query: "new", options }); const search = s.sent.at(-1)!;
    s.receive({ kind: "cancelled", requestID: oldCancel.requestID, catalogID: "cat", cancelledSearch: true, cancelledOpen: false });
    s.receive({ kind: "search", requestID: search.requestID, query: "new", result: { hits: [], truncated: false } }); expect(s.results).toHaveLength(1);
    s.connection.perform({ type: "open", catalogID: "cat", fileID: "file" }); const open = s.sent.at(-1)!;
    s.receive({ kind: "cancelled", requestID: oldCancel.requestID, catalogID: "cat", cancelledSearch: false, cancelledOpen: false });
    s.connection.perform({ type: "cancelSearch" }); expect(s.sent.at(-1)).toMatchObject({ targetSearchRequestID: search.requestID, targetOpenRequestID: open.requestID });
    expect(s.sent.at(-1)!.targetSearchRequestID).not.toBe(oldSearch.requestID); expect(s.errors).toEqual([]);
  });
  it("空目标与跨文档不会发取消，重载不会沿用旧能力", () => {
    const s = setup(); const count = s.sent.length; s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(count);
    s.connection.perform({ type: "search", catalogID: "cat", query: "a", options }); s.connection.connect(); const afterLoad = s.sent.length;
    s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(afterLoad);
    s.changeDocument(); s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(afterLoad);
  });
});

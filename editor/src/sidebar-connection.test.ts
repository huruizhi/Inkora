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
    s.connection.perform({ type: "cancelSearch" }); expect(s.sent).toHaveLength(count); s.receive({ kind: "error", requestID: stale.requestID, message: "old" }); expect(s.errors).toHaveLength(1);
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

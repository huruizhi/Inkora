import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarConnection } from "./sidebar-connection";
import { SidebarLibrary, type SidebarLibraryAction, type SidebarCatalog } from "./sidebar-library";
const original = globalThis.document;
afterEach(() => Object.defineProperty(globalThis, "document", { configurable: true, value: original }));
const catalog: SidebarCatalog = { id: "cat", rootName: "笔记", incomplete: false, skippedFiles: 0, files: [
  { id: "a", name: "笔记.md", relativePath: "笔记.md", summary: "摘要" }, { id: "b", name: "另一篇.txt", relativePath: "子目录/另一篇.txt", summary: "另一摘要" },
] };
function setup(sink: (action: SidebarLibraryAction) => void = () => {}) {
  const window = new JSDOM("<main></main>", { pretendToBeVisual: true }).window;
  Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });
  const actions: SidebarLibraryAction[] = []; let allowed = true;
  const library = new SidebarLibrary(action => { actions.push(action); sink(action); }, () => allowed); window.document.querySelector("main")!.append(library.element);
  return { window, library, actions, deny: () => { allowed = false; } };
}
describe("文件侧栏", () => {
  it("卡片淡化扩展名，当前文档标记，空/不完整/错误清晰且旧按钮失效", () => {
    const { library, actions } = setup(); library.update(catalog); library.setCurrentFile("a");
    expect(library.element.querySelector(".sidebar-file-extension")!.textContent).toBe(".md"); expect(library.element.querySelector('[aria-current]')!.textContent).toContain("当前文档");
    const stale = library.element.querySelector<HTMLButtonElement>(".sidebar-file-card")!;
    library.update({ ...catalog, files: [], incomplete: true }); stale.click(); expect(actions).toEqual([]); expect(library.element.textContent).toContain("未完整");
    library.update({ ...catalog, files: [] }); expect(library.element.textContent).toContain("没有支持"); library.showError("权限拒绝"); expect(library.element.textContent).toContain("权限拒绝"); library.destroy();
  });
  it("搜索按文件分组，点击原样转发hitID，composition不搜索且阻止退出", () => {
    const { library, window, actions } = setup(); library.update(catalog); library.setSearchOpen(true); actions.length = 0;
    const query = library.element.querySelector("input")!; query.dispatchEvent(new window.CompositionEvent("compositionstart")); query.value = "内容"; query.dispatchEvent(new window.Event("input"));
    library.setSearchOpen(false); expect(library.isSearching).toBe(true); expect(actions).toEqual([]);
    query.dispatchEvent(new window.CompositionEvent("compositionend")); expect(actions).toHaveLength(1); expect(library.ownsInputFocus).toBe(true);
    library.showSearch("内容", { truncated: false, hits: [{ fileID: "a", line: 2, snippet: "内容1", hitID: "proof1" }, { fileID: "a", line: 3, snippet: "内容2", hitID: "proof2" }, { fileID: "b", line: 1, snippet: "内容3" }] });
    expect(library.element.querySelectorAll(".sidebar-search-group")).toHaveLength(2);
    library.element.querySelector<HTMLButtonElement>(".sidebar-file-card")!.click(); expect(actions.at(-1)).toEqual({ type: "open", catalogID: "cat", fileID: "a", hitID: "proof1" });
    const old = library.element.querySelector<HTMLButtonElement>(".sidebar-file-card")!; query.value = "其他"; query.dispatchEvent(new window.Event("input")); const count = actions.length; old.click(); expect(actions).toHaveLength(count);
    library.showSearch("内容", { truncated: false, hits: [] }); expect(library.element.textContent).toContain("正在搜索");
    library.reset(); expect(library.element.querySelectorAll(".sidebar-file-card")).toHaveLength(0); library.destroy();
  });
});

it("真实DOM清空/返回将已完成search及在途open身份传至Native取消请求", () => {
  const sent: Record<string, unknown>[] = [];
  const s = setup(action => connection.perform(action));
  const connection = new SidebarConnection({ binding: () => ({ documentID: "doc", revision: 1 }), send: value => { sent.push(JSON.parse(value)); return true; }, catalog: value => s.library.update(value), result: (query, value) => s.library.showSearch(query, value), error: value => s.library.showError(value) });
  const receive = (value: Record<string, unknown>) => connection.receive(JSON.stringify({ documentID: "doc", contextID: "ctx", ...value }));
  connection.connect(); const ready = sent.at(-1)!;
  receive({ kind: "ready", requestID: ready.requestID }); receive({ kind: "catalog", requestID: ready.requestID, catalog }); s.library.setSearchOpen(true);
  const query = s.library.element.querySelector("input")!;
  query.value = "内容"; query.dispatchEvent(new s.window.Event("input")); const search = sent.at(-1)!;
  receive({ kind: "search", requestID: search.requestID, query: "内容", result: { hits: [{ fileID: "a", line: 1, snippet: "内容", hitID: "proof" }], truncated: false } });
  s.library.element.querySelector<HTMLButtonElement>(".sidebar-file-card")!.click(); const open = sent.at(-1)!;
  query.value = ""; query.dispatchEvent(new s.window.Event("input"));
  expect(sent.at(-1)).toMatchObject({ action: "cancelSearch", catalogID: "cat", targetSearchRequestID: search.requestID, targetOpenRequestID: open.requestID });
  query.value = "新内容"; query.dispatchEvent(new s.window.Event("input")); const next = sent.at(-1)!;
  s.library.element.querySelector<HTMLButtonElement>('[aria-label="返回文档列表"]')!.click();
  expect(sent.at(-1)).toMatchObject({ action: "cancelSearch", targetSearchRequestID: next.requestID }); expect(sent.at(-1)!.targetOpenRequestID).toBeUndefined(); s.library.destroy();
});

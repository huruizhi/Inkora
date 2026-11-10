import type { SidebarCatalog, SidebarLibraryAction, SidebarSearchResult } from "./sidebar-library";

interface Binding { documentID: string; revision: number }

/** The sidebar channel never emits editor state, snapshots, or save failures. */
export class SidebarConnection {
  private contextID?: string;
  private readyID?: string;
  private listID?: string;
  private searchID?: string;
  private openID?: string;
  private bindingID?: string;
  private serial = 0;
  private readonly instance = Math.random().toString(36).slice(2);

  constructor(private readonly options: {
    binding: () => Binding | undefined;
    send: (serialized: string) => boolean;
    catalog: (catalog: SidebarCatalog) => void;
    result: (query: string, result: SidebarSearchResult) => void;
    error: (message: string) => void;
  }) {}

  connect(): void {
    this.contextID = undefined;
    this.searchID = undefined;
    this.openID = undefined;
    this.bindingID = this.options.binding()?.documentID;
    this.readyID = this.nextID();
    this.listID = this.readyID;
    this.post({ action: "ready", requestID: this.readyID });
  }

  perform(action: SidebarLibraryAction): void {
    if (!this.contextID) { this.options.error("侧栏尚未就绪，请稍后重试。"); return; }
    const requestID = this.nextID();
    if (action.type === "chooseFolder" || action.type === "refresh") this.listID = requestID;
    if (action.type === "search") this.searchID = requestID;
    if (action.type === "open") this.openID = requestID;
    const { type, ...fields } = action;
    this.post({ ...fields, action: type, requestID, contextID: this.contextID });
  }

  receive(serialized: string): void {
    if (serialized.length > 20_000_000) return;
    let value: unknown;
    try { value = JSON.parse(serialized); } catch { return; }
    if (!record(value) || value.documentID !== this.bindingID ||
      value.documentID !== this.options.binding()?.documentID || typeof value.contextID !== "string") return;
    if (value.kind === "ready" && value.requestID === this.readyID) {
      this.contextID = value.contextID;
      return;
    }
    if (value.contextID !== this.contextID) return;
    if (value.kind === "catalog" && value.requestID === this.listID && catalog(value.catalog)) {
      this.searchID = undefined;
      this.options.catalog(value.catalog);
    } else if (value.kind === "search" && value.requestID === this.searchID &&
      typeof value.query === "string" && result(value.result)) {
      this.options.result(value.query, value.result);
    } else if (value.kind === "error" && typeof value.message === "string" &&
      [this.listID, this.searchID, this.openID].includes(value.requestID as string)) this.options.error(value.message);
  }

  private nextID(): string { return `sidebar-${this.instance}-${++this.serial}`; }
  private post(value: Record<string, unknown>): void {
    const binding = this.options.binding();
    if (!binding) return;
    if (!this.options.send(JSON.stringify({ ...binding, ...value })) && value.action !== "ready") {
      this.options.error("请在Inkora应用中使用文件夹侧栏。");
    }
  }
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function catalog(value: unknown): value is SidebarCatalog {
  return record(value) && typeof value.id === "string" && typeof value.rootName === "string" &&
    typeof value.incomplete === "boolean" && Number.isInteger(value.skippedFiles) &&
    Array.isArray(value.files) && value.files.length <= 10_000 && value.files.every(file =>
      record(file) && [file.id, file.name, file.relativePath, file.summary].every(field => typeof field === "string"));
}
function result(value: unknown): value is SidebarSearchResult {
  return record(value) && typeof value.truncated === "boolean" && Array.isArray(value.hits) &&
    value.hits.length <= 1_000 && value.hits.every(hit => record(hit) && typeof hit.fileID === "string" &&
      typeof hit.snippet === "string" && typeof hit.line === "number" && Number.isInteger(hit.line) && hit.line > 0);
}

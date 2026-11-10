export interface SidebarFile {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly summary: string;
  readonly isCurrent?: boolean;
}

export interface SidebarCatalog {
  readonly id: string;
  readonly rootName: string;
  readonly files: readonly SidebarFile[];
  readonly incomplete: boolean;
  readonly skippedFiles: number;
}

export interface SidebarSearchOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regularExpression: boolean;
}

export interface SidebarSearchHit { readonly fileID: string; readonly line: number; readonly snippet: string; readonly hitID?: string; readonly fileVersion?: string; readonly utf16Location?: number; readonly utf16Length?: number }
export interface SidebarSearchResult {
  readonly hits: readonly SidebarSearchHit[];
  readonly truncated: boolean;
}

export type SidebarLibraryAction =
  | { type: "cancelSearch" }
  | { type: "chooseFolder" }
  | { type: "refresh" }
  | { type: "search"; catalogID: string; query: string; options: SidebarSearchOptions }
  | { type: "open"; catalogID: string; fileID: string; hitID?: string };

/** File browsing is UI state. This module never reads files or changes the editor. */
export class SidebarLibrary {
  readonly element = document.createElement("section");
  private readonly controls = document.createElement("div");
  private readonly query = document.createElement("input");
  private readonly folder = document.createElement("button");
  private readonly notice = document.createElement("p");
  private readonly list = document.createElement("div");
  private readonly options: HTMLButtonElement[] = [];
  private catalog?: SidebarCatalog;
  private searching = false;
  private currentFileID?: string;
  private generation = 0;
  private destroyed = false;
  private composing = false;
  private stableQuery = "";
  private choice: SidebarSearchOptions = { caseSensitive: false, wholeWord: false, regularExpression: false };

  constructor(
    private readonly request: (action: SidebarLibraryAction) => void,
    private readonly canInteract: () => boolean,
    private readonly searchModeChanged: () => void = () => {},
  ) {
    this.element.className = "sidebar-library";
    this.element.setAttribute("aria-label", "文档列表");
    this.controls.className = "sidebar-file-search";
    this.controls.hidden = true;
    this.query.type = "search";
    this.query.placeholder = "查找";
    this.query.setAttribute("aria-label", "搜索文件夹中的内容");
    this.query.maxLength = 2_000;
    this.query.addEventListener("compositionstart", () => { this.composing = true; });
    this.query.addEventListener("compositionend", () => { this.composing = false; this.search(); });
    this.query.addEventListener("input", event => {
      if (!this.composing && !(event as InputEvent).isComposing) this.search();
    });
    this.controls.append(this.button("←", "返回文档列表", () => this.setSearchOpen(false)), this.query);
    const definitions = [
      ["caseSensitive", "Aa", "区分大小写"], ["wholeWord", "整词", "整词匹配"],
      ["regularExpression", ".*", "正则表达式"],
    ] as const;
    for (const [key, label, name] of definitions) {
      const button = this.button(label, name, () => {
        this.choice = { ...this.choice, [key]: !this.choice[key] };
        button.setAttribute("aria-pressed", String(this.choice[key]));
        this.search();
      });
      button.setAttribute("aria-pressed", "false");
      this.options.push(button);
      this.controls.append(button);
    }
    this.folder = this.button("打开文件夹…", "打开侧栏文件夹", () => this.request({ type: "chooseFolder" }));
    this.folder.className = "sidebar-folder-button";
    const refresh = this.button("刷新", "刷新文档列表", () => this.request({ type: "refresh" }));
    refresh.className = "sidebar-refresh";
    this.notice.className = "sidebar-notice";
    this.notice.setAttribute("role", "status");
    this.list.className = "sidebar-file-list";
    this.element.append(this.controls, this.folder, refresh, this.notice, this.list);
    this.notice.textContent = "选择文件夹以浏览和搜索其中的文档。";
  }

  get isInputComposing(): boolean { return this.composing; }
  get ownsInputFocus(): boolean { return document.activeElement === this.query; }
  get isSearching(): boolean { return this.searching; }

  setSearchOpen(open: boolean): void {
    if (this.composing || !this.canInteract()) return;
    this.generation++;
    this.searching = open;
    this.controls.hidden = !open;
    this.searchModeChanged();
    if (open) { this.query.focus(); this.search(); }
    else { this.request({ type: "cancelSearch" }); this.renderFiles(); }
  }

  reset(): void {
    this.generation++; this.catalog = undefined; this.currentFileID = undefined;
    this.list.replaceChildren(); this.folder.textContent = "打开文件夹…";
    this.notice.textContent = "选择文件夹以浏览和搜索其中的文档。";
  }
  destroy(): void { this.destroyed = true; this.generation++; this.element.remove(); }
  setCurrentFile(fileID?: string): void {
    this.currentFileID = fileID;
    for (const card of this.list.querySelectorAll<HTMLElement>(".sidebar-file-card")) {
      const current = card.dataset.fileId === fileID || this.catalog?.files.some(file => file.id === card.dataset.fileId && file.isCurrent) === true;
      card.toggleAttribute("aria-current", current);
      card.querySelector(".sidebar-current-state")?.remove();
      if (current) { const status = document.createElement("span"); status.className = "sidebar-current-state"; status.textContent = "当前文档"; card.append(status); }
    }
  }

  update(catalog: SidebarCatalog): void {
    this.generation++;
    this.catalog = { ...catalog, files: catalog.files.map(file => ({ ...file })) };
    this.folder.textContent = catalog.rootName;
    this.folder.title = "更换侧栏文件夹";
    if (this.searching && !this.composing) this.search();
    else this.renderFiles();
  }

  showSearch(query: string, result: SidebarSearchResult): void {
    if (!this.searching || this.composing || query !== this.stableQuery) return;
    this.list.replaceChildren();
    const partial = this.catalog?.incomplete || this.catalog?.skippedFiles;
    this.notice.textContent = result.truncated ? `至少 ${result.hits.length} 处匹配，结果未完整展示` :
      partial ? `已索引文档中 ${result.hits.length} 处匹配，索引未完整` : `${result.hits.length} 处匹配`;
    const groups = new Map<string, HTMLElement>();
    for (const hit of result.hits) {
      const file = this.catalog?.files.find(item => item.id === hit.fileID);
      if (!file) continue;
      let group = groups.get(file.id);
      if (!group) {
        group = document.createElement("section");
        group.className = "sidebar-search-group";
        group.setAttribute("aria-label", file.relativePath);
        const heading = document.createElement("h3"); heading.textContent = file.relativePath;
        group.append(heading); groups.set(file.id, group); this.list.append(group);
      }
      const row = this.fileButton(file, hit.hitID);
      const snippet = document.createElement("span");
      snippet.className = "sidebar-file-snippet";
      snippet.textContent = `第 ${hit.line} 行：${hit.snippet}`;
      row.append(snippet); group.append(row);
    }
  }

  showError(message: string): void { this.generation++; this.list.replaceChildren(); this.notice.textContent = message; }

  private search(): void {
    if (this.composing || !this.canInteract()) return;
    this.generation++;
    this.stableQuery = this.query.value;
    this.list.replaceChildren();
    if (!this.catalog) { this.notice.textContent = "请先选择要搜索的文件夹。"; return; }
    if (!this.stableQuery) { this.request({ type: "cancelSearch" }); this.renderFiles(); return; }
    this.notice.textContent = "正在搜索…";
    this.request({ type: "search", catalogID: this.catalog.id, query: this.stableQuery, options: { ...this.choice } });
  }

  private renderFiles(): void {
    this.list.replaceChildren();
    if (!this.catalog) return;
    const { incomplete, skippedFiles, files } = this.catalog;
    this.notice.textContent = incomplete ? `索引未完整：仅展示已索引的 ${files.length} 份文档，请缩小文件夹范围` :
      skippedFiles ? `${files.length} 份文档，${skippedFiles} 份文件不可读取` :
      files.length ? "" : "文件夹中没有支持的文本文档。";
    for (const file of files) {
      const row = this.fileButton(file);
      const summary = document.createElement("span");
      summary.className = "sidebar-file-summary";
      summary.textContent = file.summary;
      row.append(summary);
      this.list.append(row);
    }
  }

  private fileButton(file: SidebarFile, hitID?: string): HTMLButtonElement {
    const catalogID = this.catalog!.id;
    const generation = this.generation;
    const row = this.button("", `打开文档 ${file.name}`, () => {
      if (this.generation === generation && this.catalog?.id === catalogID) this.request({ type: "open", catalogID, fileID: file.id, ...(hitID ? { hitID } : {}) });
    });
    row.className = "sidebar-file-card";
    row.dataset.fileId = file.id;
    if (file.id === this.currentFileID || file.isCurrent) {
      row.setAttribute("aria-current", "true");
      const status = document.createElement("span"); status.className = "sidebar-current-state"; status.textContent = "当前文档"; row.append(status);
    }
    row.title = file.relativePath;
    const name = document.createElement("strong");
    const dot = file.name.lastIndexOf(".");
    name.textContent = dot > 0 ? file.name.slice(0, dot) : file.name;
    if (dot > 0) { const extension = document.createElement("span"); extension.className = "sidebar-file-extension"; extension.textContent = file.name.slice(dot); name.append(extension); }
    row.append(name);
    return row;
  }

  private button(text: string, label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", () => { if (button.isConnected && !this.destroyed && !this.composing && this.canInteract()) action(); });
    return button;
  }
}

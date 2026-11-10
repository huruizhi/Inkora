export interface SidebarFile {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly summary: string;
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

export interface SidebarSearchResult {
  readonly hits: readonly { fileID: string; line: number; snippet: string }[];
  readonly truncated: boolean;
}

export type SidebarLibraryAction =
  | { type: "chooseFolder" }
  | { type: "refresh" }
  | { type: "search"; catalogID: string; query: string; options: SidebarSearchOptions }
  | { type: "open"; catalogID: string; fileID: string };

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
    this.searching = open;
    this.controls.hidden = !open;
    this.searchModeChanged();
    if (open) { this.query.focus(); this.search(); }
    else this.renderFiles();
  }

  update(catalog: SidebarCatalog): void {
    this.catalog = { ...catalog, files: catalog.files.map(file => ({ ...file })) };
    this.folder.textContent = catalog.rootName;
    this.folder.title = "更换侧栏文件夹";
    if (this.searching && !this.composing) this.search();
    else this.renderFiles();
  }

  showSearch(query: string, result: SidebarSearchResult): void {
    if (!this.searching || this.composing || query !== this.stableQuery) return;
    this.list.replaceChildren();
    this.notice.textContent = result.truncated ? `至少 ${result.hits.length} 处匹配，结果未完整展示` : `${result.hits.length} 处匹配`;
    for (const hit of result.hits) {
      const file = this.catalog?.files.find(item => item.id === hit.fileID);
      if (!file) continue;
      const row = this.fileButton(file);
      const snippet = document.createElement("span");
      snippet.className = "sidebar-file-snippet";
      snippet.textContent = `第 ${hit.line} 行：${hit.snippet}`;
      row.append(snippet);
      this.list.append(row);
    }
  }

  showError(message: string): void { this.notice.textContent = message; }

  private search(): void {
    if (this.composing || !this.canInteract()) return;
    this.stableQuery = this.query.value;
    this.list.replaceChildren();
    if (!this.catalog) { this.notice.textContent = "请先选择要搜索的文件夹。"; return; }
    if (!this.stableQuery) { this.renderFiles(); return; }
    this.notice.textContent = "正在搜索…";
    this.request({ type: "search", catalogID: this.catalog.id, query: this.stableQuery, options: { ...this.choice } });
  }

  private renderFiles(): void {
    this.list.replaceChildren();
    if (!this.catalog) return;
    const { incomplete, skippedFiles, files } = this.catalog;
    this.notice.textContent = incomplete ? `仅展示已索引的 ${files.length} 份文档，请缩小文件夹范围` :
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

  private fileButton(file: SidebarFile): HTMLButtonElement {
    const catalogID = this.catalog!.id;
    const row = this.button("", `打开文档 ${file.name}`, () => {
      if (this.catalog?.id === catalogID) this.request({ type: "open", catalogID, fileID: file.id });
    });
    row.className = "sidebar-file-card";
    row.title = file.relativePath;
    const name = document.createElement("strong");
    name.textContent = file.name;
    row.append(name);
    return row;
  }

  private button(text: string, label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", () => { if (!this.composing && this.canInteract()) action(); });
    return button;
  }
}

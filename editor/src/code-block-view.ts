import { codeViewPreferences } from "./code-view-preferences";
import { mountCodeLanguagePicker } from "./code-language-picker";
import notices from "../public/RENDERER_NOTICES.txt?raw";
import "./code-tools.css";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { bindContextToolbar } from "./context-tools";
import { mountMermaidPreview } from "./mermaid-preview";
import { TextSelection } from "prosemirror-state";
import { buildLanguageAttr, CODE_LANGUAGES, firstInfoToken, resolveHighlightLanguageId } from "./code-highlighting";

export interface CodeLanguageChangeResult {
  readonly ok: boolean;
  readonly message?: string;
}

export interface CodeBlockViewContext {
  readonly onQueryFocus?: (owner: object, focused: boolean) => void;
  readonly onQueryComposition?: (owner: object, active: boolean) => void;
  readonly isComposing: () => boolean;
  readonly applyLanguageChange: (
    getPos: () => number | undefined,
    node: PMNode,
    nextLanguage: string | null,
  ) => CodeLanguageChangeResult;
}

type CodeBlockNodeView = NodeView & {
  readonly stopEvent: (event: Event | { target: Node | null }) => boolean;
  readonly ignoreMutation: (mutation: MutationRecord | { target: Node }) => boolean;
};

const PLAIN_LABEL = "纯文本（无语言）";

function currentSelectValue(node: PMNode): string {
  return firstInfoToken(node.attrs.language as string | null);
}

function preservedLabel(token: string): string {
  const resolved = resolveHighlightLanguageId(token);
  const canonicalLabel = CODE_LANGUAGES.find((language) => language.id === resolved)?.label
    .replace(/（[^）]+）$/, "") ?? resolved;
  return resolved
    ? `保持 ${token}（${canonicalLabel} 别名）`
    : `保持 ${token}（未知语言，按纯文本显示）`;
}

function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

export function createCodeBlockNodeViews(context: CodeBlockViewContext) {
  return (
    initialNode: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ): CodeBlockNodeView => {
    let node = initialNode;
    let alive = true;
    const preferences = codeViewPreferences(view.dom.ownerDocument.defaultView!);
    const dom = document.createElement("div");
    dom.className = "inkora-code-block";

    const toolbar = document.createElement("div");
    toolbar.className = "inkora-code-toolbar";
    toolbar.contentEditable = "false";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "代码块操作");
    bindContextToolbar(toolbar, view, context.isComposing);

    const label = document.createElement("label");
    label.className = "inkora-code-language-label";
    label.textContent = "语言";
    const select = document.createElement("select");
    select.className = "inkora-code-language";
    select.setAttribute("aria-label", "代码块语言");
    label.append(select);

    const message = document.createElement("span");
    message.className = "inkora-code-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const license = document.createElement("button");
    license.type = "button";
    license.className = "inkora-code-license";
    license.textContent = "许可…";
    license.setAttribute("aria-label", "第三方许可");
    license.title = "查看第三方许可（只读）";
    license.setAttribute("aria-haspopup", "dialog");
    license.setAttribute("aria-expanded", "false");
    const noticePanel = document.createElement("dialog");
    noticePanel.className = "inkora-code-notices";
    noticePanel.setAttribute("role", "dialog");
    noticePanel.setAttribute("aria-label", "第三方许可（只读）");
    noticePanel.hidden = true;
    const closeNotice = document.createElement("button");
    closeNotice.type = "button";
    closeNotice.textContent = "关闭许可";
    const noticeText = document.createElement("pre");
    noticeText.tabIndex = 0;
    noticeText.setAttribute("aria-label", "第三方许可全文");
    noticePanel.append(closeNotice, noticeText);
    const closeNotices = (): void => {
      if (noticePanel.open) noticePanel.close();
      noticePanel.hidden = true;
      noticeText.textContent = "";
      license.setAttribute("aria-expanded", "false");
      license.focus();
      toolbar.classList.remove("has-notices");
    };
    license.addEventListener("click", () => {
      if (context.isComposing() || !license.isConnected) return;
      toolbar.classList.add("has-notices");
      noticeText.textContent = notices;
      noticePanel.hidden = false;
      if (typeof noticePanel.showModal === "function") noticePanel.showModal();
      license.setAttribute("aria-expanded", "true");
      closeNotice.focus();
    });
    closeNotice.addEventListener("click", () => {
      if (!context.isComposing()) closeNotices();
    });
    noticePanel.addEventListener("cancel", event => {
      event.preventDefault();
      if (!context.isComposing()) closeNotices();
    });
    noticePanel.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.isComposing || context.isComposing()) return;
      event.preventDefault();
      event.stopPropagation();
      closeNotices();
    });
    const lineToggle = document.createElement("button");
    lineToggle.type = "button"; lineToggle.textContent = "行号";
    lineToggle.setAttribute("aria-label", "显示代码行号");
    lineToggle.addEventListener("pointerdown", event => event.preventDefault());
    lineToggle.addEventListener("click", () => {
      if (alive && lineToggle.isConnected && !context.isComposing() && !view.composing) preferences.toggle();
    });
    toolbar.append(label, message, lineToggle, license, noticePanel);

    const body = document.createElement("div"); body.className = "inkora-code-body";
    const gutter = document.createElement("div"); gutter.className = "code-line-numbers";
    gutter.contentEditable = "false"; gutter.setAttribute("aria-hidden", "true");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code); body.append(gutter, pre);
    let previousCount = -1;
    const renderLineNumbers = (): void => {
      const enabled = preferences.lineNumbers;
      lineToggle.setAttribute("aria-pressed", String(enabled));
      gutter.hidden = !enabled;
      body.classList.toggle("has-line-numbers", enabled);
      const count = node.textContent.split(/\r\n|\r|\n/).length;
      if (count !== previousCount) {
        previousCount = count;
        gutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
      }
    };
    const unsubscribe = preferences.subscribe(renderLineNumbers);
    renderLineNumbers();
    const diagram = document.createElement("div");
    diagram.className = "mermaid-preview";
    diagram.contentEditable = "false";
    diagram.setAttribute("aria-label", "Mermaid 图表预览；点击可编辑代码");
    const editDiagram = document.createElement("button");
    editDiagram.type = "button";
    editDiagram.className = "mermaid-edit";
    editDiagram.contentEditable = "false";
    editDiagram.textContent = "编辑图表";
    let cancelPreview: (() => void) | undefined;
    let previewSource: string | undefined;
    const renderDiagram = (): void => {
      const isMermaid = currentSelectValue(node).toLowerCase() === "mermaid";
      dom.classList.toggle("is-mermaid", isMermaid);
      diagram.hidden = !isMermaid;
      editDiagram.hidden = !isMermaid;
      const source = isMermaid ? node.textContent : undefined;
      if (source === previewSource) return;
      cancelPreview?.();
      previewSource = source;
      cancelPreview = source === undefined ? undefined : mountMermaidPreview(diagram, source);
    };
    diagram.addEventListener("pointerdown", event => event.preventDefault());
    const enterDiagramCode = (): void => {
      if (context.isComposing()) return;
      const pos = getPos();
      if (pos === undefined) return;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
      view.focus();
    };
    diagram.addEventListener("click", event => {
      if ((event.target as HTMLElement).closest("button")) return;
      enterDiagramCode();
    });
    editDiagram.addEventListener("pointerdown", event => event.preventDefault());
    editDiagram.addEventListener("click", enterDiagramCode);
    dom.append(toolbar, diagram, editDiagram, body);

    const queryOwner = {};
    const picker = mountCodeLanguagePicker({ toolbar, view, node: () => node, getPos,
      isComposing: context.isComposing, apply: context.applyLanguageChange,
      onCompositionChange: active => context.onQueryComposition?.(queryOwner, active),
      onFocusChange: focused => context.onQueryFocus?.(queryOwner, focused),
      message: text => { message.dataset.failure = String(!!text); message.textContent = text; },
    });

    const renderSelector = (): void => {
      const languageAttr = node.attrs.language as string | null;
      const token = currentSelectValue(node);
      select.replaceChildren();
      const resolved = token.toLowerCase() === "mermaid" ? token : resolveHighlightLanguageId(token);
      if (token && (!resolved || resolved !== token)) {
        select.append(option(token, preservedLabel(token)));
      }
      select.append(option("", PLAIN_LABEL));
      for (const language of CODE_LANGUAGES) {
        select.append(option(language.id, language.label));
      }
      if (token.toLowerCase() !== "mermaid") select.append(option("mermaid", "Mermaid 图表（mermaid）"));
      else select.append(option(token, "Mermaid 图表（mermaid）"));
      select.value = token && resolved === token ? token : token || "";

      const indented = node.attrs.style === "indented";
      select.disabled = indented;
      if (indented) {
        message.textContent = "缩进代码块没有围栏语言信息，不能在此持久化语言。";
      } else if (message.dataset.failure !== "true") {
        message.textContent = "";
      }
      dom.dataset.language = languageAttr ?? "";
    };

    const guardComposition = (event: Event): boolean => {
      if (!context.isComposing()) return false;
      event.preventDefault();
      select.value = currentSelectValue(node);
      message.dataset.failure = "true";
      message.textContent = "请先完成中文输入，再选择代码语言。";
      return true;
    };

    select.addEventListener("pointerdown", guardComposition);
    select.addEventListener("click", guardComposition);
    select.addEventListener("change", (event) => {
      if (!alive || !select.isConnected || !view.editable || guardComposition(event)) return;
      const current = node.attrs.language as string | null;
      const next = buildLanguageAttr(current, select.value);
      if (next === current) return;
      const result = context.applyLanguageChange(getPos, node, next);
      if (!result.ok) {
        select.value = currentSelectValue(node);
        message.dataset.failure = "true";
        message.textContent = result.message ?? "无法修改代码语言。";
        return;
      }
      message.dataset.failure = "false";
      message.textContent = "";
    });

    renderSelector();
    picker.update();
    renderDiagram();

    return {
      dom,
      contentDOM: code,
      update(nextNode) {
        if (nextNode.type !== node.type) return false;
        node = nextNode;
        message.dataset.failure = "false";
        renderSelector();
        picker.update();
        renderLineNumbers();
        renderDiagram();
        return true;
      },
      stopEvent(event) {
        return !!event.target && (toolbar.contains(event.target as Node) ||
          diagram.contains(event.target as Node) || editDiagram.contains(event.target as Node));
      },
      ignoreMutation(mutation) {
        return toolbar.contains(mutation.target) || diagram.contains(mutation.target) ||
          editDiagram.contains(mutation.target) || gutter.contains(mutation.target) || mutation.target === body;
      },
      destroy() { alive = false; unsubscribe(); picker.destroy(); cancelPreview?.(); },
    };
  };
}

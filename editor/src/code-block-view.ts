import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { bindContextToolbar } from "./context-tools";
import { buildLanguageAttr, CODE_LANGUAGES, firstInfoToken, resolveHighlightLanguageId } from "./code-highlighting";

export interface CodeLanguageChangeResult {
  readonly ok: boolean;
  readonly message?: string;
}

export interface CodeBlockViewContext {
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

    const license = document.createElement("a");
    license.className = "inkora-code-license";
    license.href = "./THIRD_PARTY_NOTICES.txt";
    license.textContent = "高亮许可";
    license.target = "_blank";
    license.rel = "noreferrer";
    toolbar.append(label, message, license);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    dom.append(toolbar, pre);

    const renderSelector = (): void => {
      const languageAttr = node.attrs.language as string | null;
      const token = currentSelectValue(node);
      select.replaceChildren();
      const resolved = resolveHighlightLanguageId(token);
      if (token && (!resolved || resolved !== token)) {
        select.append(option(token, preservedLabel(token)));
      }
      select.append(option("", PLAIN_LABEL));
      for (const language of CODE_LANGUAGES) {
        select.append(option(language.id, language.label));
      }
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
      if (guardComposition(event)) return;
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

    return {
      dom,
      contentDOM: code,
      update(nextNode) {
        if (nextNode.type !== node.type) return false;
        node = nextNode;
        message.dataset.failure = "false";
        renderSelector();
        return true;
      },
      stopEvent(event) {
        return !!event.target && toolbar.contains(event.target as Node);
      },
      ignoreMutation(mutation) {
        return toolbar.contains(mutation.target);
      },
    };
  };
}

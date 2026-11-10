import MarkdownIt from "markdown-it";
import { renderTechnicalPreview } from "./technical-preview";

const preview = new MarkdownIt("commonmark", { html: false }).enable(["table", "strikethrough"]);

export function protectedPreview(raw: string, kind: string): HTMLElement {
  const element = document.createElement("section");
  element.className = "protected-block";
  element.dataset.inkoraRaw = raw;
  element.dataset.inkoraKind = kind;
  element.contentEditable = "false";
  element.setAttribute("aria-label", "受保护原文；请在源码中修改");
  element.title = "保留完整原文；请在源码中修改";
  if (renderTechnicalPreview(element, raw, kind)) return element;
  if (kind !== "table" && kind !== "wiki") {
    const pre = document.createElement("pre");
    pre.textContent = raw;
    element.append(pre);
  } else {
    const tokens = preview.parse(raw, {});
    if (kind === "wiki") {
      for (const token of tokens) {
        for (const child of token.children ?? []) {
          if (child.type === "text") {
            child.content = child.content.replace(/\[\[([^\]\n]+)\]\]/g,
              (_match, target: string) => target.split("|").at(-1) ?? target);
          }
        }
      }
    }
    // markdown-it escapes text and disables HTML; no input HTML is executed.
    element.innerHTML = preview.renderer.render(tokens, preview.options, {});
  }
  return element;
}

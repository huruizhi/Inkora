import MarkdownIt from "markdown-it";

const preview = new MarkdownIt("commonmark", { html: false }).enable(["table", "strikethrough"]);

export function protectedPreview(raw: string, kind: string): HTMLElement {
  const element = document.createElement("section");
  element.className = "protected-block";
  element.dataset.inkoraRaw = raw;
  element.dataset.inkoraKind = kind;
  element.contentEditable = "false";
  element.setAttribute("aria-label", "保留原文的预览（整块选择或删除）");
  element.title = "保留原文的预览；暂不支持块内编辑";
  if (kind === "metadata") {
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

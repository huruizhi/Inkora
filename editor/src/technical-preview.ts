import katex from "katex";
import MarkdownIt from "markdown-it";

const footnoteMarkdown = new MarkdownIt("commonmark", { html: false }).disable("image");

function navigateFootnote(element: HTMLElement, label: string, toDefinition: boolean): void {
  const root = element.closest("#editor");
  const candidates = root?.querySelectorAll<HTMLElement>(
    toDefinition ? ".footnote-definition" : ".footnote-reference",
  );
  const target = Array.from(candidates ?? []).find(item => item.dataset.footnoteLabel === label);
  target?.scrollIntoView?.({ block: "center" });
}

export function footnoteReference(raw: string): HTMLElement | undefined {
  const match = /^\[\^([A-Za-z0-9_-]+)\]$/.exec(raw);
  if (!match) return undefined;
  const sup = document.createElement("sup");
  sup.className = "footnote-reference";
  sup.dataset.footnoteLabel = match[1];
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = match[1];
  button.setAttribute("aria-label", `查看脚注 ${match[1]}`);
  button.addEventListener("keydown", event => event.stopPropagation());
  button.addEventListener("pointerdown", event => event.preventDefault());
  button.addEventListener("click", event => {
    event.stopPropagation();
    navigateFootnote(sup, match[1], true);
  });
  sup.append(button);
  return sup;
}

/** Only called for canonical accepted opaque kinds; never classifies source. */
export function renderTechnicalPreview(
  element: HTMLElement, raw: string, kind: string, mathContent?: string,
): boolean {
  const normalized = raw.replace(/\r\n?/g, "\n");
  if (kind === "math") {
    const lines = normalized.split("\n");
    if (mathContent === undefined &&
        (lines[0]?.trim() !== "$$" || lines.at(-1)?.trim() !== "$$" || lines.length < 3)) return false;
    element.classList.add("math-preview");
    element.setAttribute("aria-label", "公式；可在源码中修改");
    const output = document.createElement("div");
    output.className = "math-output";
    try {
      const expression = mathContent ?? lines.slice(1, -1).join("\n");
      if (expression.length > 16000) throw Error("公式超过预览长度限制");
      output.innerHTML = katex.renderToString(expression, {
        displayMode: true, output: "mathml", trust: false, strict: "error",
        throwOnError: true, maxExpand: 1000, maxSize: 20, macros: {},
      });
      element.append(output);
    } catch {
      const error = document.createElement("p");
      error.className = "technical-preview-error";
      error.textContent = "公式暂无法预览，请在源码中检查。原文已保留。";
      const source = document.createElement("pre");
      source.textContent = raw;
      element.append(error, source);
    }
    return true;
  }
  if (kind !== "footnote") return false;
  const match = /^\[\^([A-Za-z0-9_-]+)\]:[\t ]*([\s\S]*)$/.exec(normalized);
  if (!match) return false;
  element.classList.add("footnote-definition");
  element.dataset.footnoteLabel = match[1];
  element.setAttribute("aria-label", `脚注 ${match[1]}；可在源码中修改`);
  const label = document.createElement("span");
  label.className = "footnote-label";
  label.textContent = `${match[1]}.`;
  const body = document.createElement("div");
  body.className = "footnote-body";
  // This is presentation of already-owned raw, never the save source or a
  // second boundary parser. HTML and images are disabled in this preview.
  body.innerHTML = footnoteMarkdown.render(match[2].replace(/^(?: {4}|\t)/gm, ""));
  const back = document.createElement("button");
  back.type = "button";
  back.className = "footnote-back";
  back.textContent = "↩";
  back.setAttribute("aria-label", `返回脚注 ${match[1]} 的引用`);
  back.addEventListener("keydown", event => event.stopPropagation());
  back.addEventListener("pointerdown", event => event.preventDefault());
  back.addEventListener("click", event => {
    event.stopPropagation();
    navigateFootnote(element, match[1], false);
  });
  element.append(label, body, back);
  return true;
}

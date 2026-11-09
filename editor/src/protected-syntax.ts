import type MarkdownIt from "markdown-it";
import type { StateBlock } from "markdown-it";

function acceptBlock(state: StateBlock, start: number, end: number, kind: string, issue?: string): void {
  const token = state.push("inkora_protected_block", "", 0);
  token.block = true;
  token.map = [start, end];
  token.meta = { inkoraOpaque: kind, inkoraIssue: issue };
  state.line = end;
}

/** Canonical D002 wins over CommonMark reference definitions at the same start. */
export function installProtectedSyntax(markdown: MarkdownIt): void {
  markdown.block.ruler.before("code", "inkora_front_matter", (
    state: StateBlock, start: number, end: number, silent: boolean,
  ): boolean => {
    if (start !== 0 || state.bMarks[start] !== 0) return false;
    // An opening metadata line needs its line ending. The EOF-only `---`
    // remains the supported horizontal-rule spelling on both load and input.
    if (state.eMarks[start] === state.src.length) return false;
    const marker = state.src.slice(0, state.eMarks[start]);
    if (marker !== "---" && marker !== "+++") return false;
    if (silent) return true;
    let next = start + 1;
    for (; next < end; next++) {
      const line = state.src.slice(state.bMarks[next], state.eMarks[next]);
      if (line === marker || (marker === "---" && line === "...")) break;
    }
    acceptBlock(state, start, next < end ? next + 1 : end, "front_matter",
      next < end ? undefined : "front matter 缺少合法结束围栏，已保留原文并阻断结构化保存");
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  markdown.block.ruler.before("blockquote", "inkora_callout", (
    state: StateBlock, start: number, end: number, silent: boolean,
  ): boolean => {
    const from = state.bMarks[start];
    if (from > 0 && state.src[from - 1] !== "\n") return false;
    const line = state.src.slice(from, state.eMarks[start]);
    if (!/^> ?\[!/.test(line)) return false;
    const valid = /^> ?\[![A-Za-z0-9_-]+\][+-]?(?:[\t ].*)?$/.test(line);
    if (silent) return true;
    let next = start + 1;
    while (next < end && state.src[state.bMarks[next]] === ">") next++;
    acceptBlock(state, start, next, "callout", valid ? undefined :
      "callout 类型或标题边界非法，已保留原文并阻断结构化保存");
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  markdown.block.ruler.before("reference", "inkora_footnote_definition", (
    state: StateBlock, start: number, end: number, silent: boolean,
  ): boolean => {
    const from = state.bMarks[start];
    // D002 starts at the physical line start, not after a quote/list prefix.
    if (from > 0 && state.src[from - 1] !== "\n") return false;
    const definition = /^\[\^([^\]\n]*)\]:/.exec(state.src.slice(from, state.eMarks[start]));
    if (!definition) return false;
    const valid = /^[A-Za-z0-9_-]+$/.test(definition[1]);
    let next = start + 1;
    let acceptedEnd = next;
    while (next < end) {
      const line = state.src.slice(state.bMarks[next], state.eMarks[next]);
      if (/^[\t ]*$/.test(line)) { next++; continue; }
      if (!/^(?: {4}|\t)/.test(line)) break;
      acceptedEnd = ++next;
    }
    if (silent) return true;
    acceptBlock(state, start, acceptedEnd, "footnote", valid ? undefined :
      "脚注定义 label 非法，已保留原文并阻断结构化保存");
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
}

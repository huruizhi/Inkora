import type MarkdownIt from "markdown-it";
import type { StateBlock, StateInline } from "markdown-it";
import { gfmAutolinks } from "./gfm-autolinks";

function boundaryRule(kind: string, issue: string | undefined, form: 'block' | 'inline'): string {
  if (issue) {
    if (['jsx', 'esm', 'template_expression'].includes(kind)) return 'SYN-U001';
    if (['json_front_matter', 'definition_list', 'unsupported_inline'].includes(kind) ||
        (kind === 'math' && form === 'inline')) return 'SYN-U005';
    return 'SYN-U002';
  }
  return ({front_matter: 'SYN-D001', footnote: 'SYN-D002', math: 'SYN-D003',
    raw_html: 'SYN-D004', html_comment: 'SYN-D005', wiki: 'SYN-D006', callout: 'SYN-D007'} as Record<string, string>)[kind]
    ?? 'SYN-U002';
}

function acceptInline(state: StateInline, end: number, kind: string, issue?: string): void {
  const from = state.pos;
  const token = state.push('inkora_protected_inline', '', 0);
  token.content = state.src.slice(from, end);
  token.meta = { inkoraOpaque: kind, inkoraFrom: from, inkoraTo: end, inkoraIssue: issue,
    inkoraRule: boundaryRule(kind, issue, 'inline') };
  state.pos = end;
}

function acceptBlock(state: StateBlock, start: number, end: number, kind: string, issue?: string): void {
  const token = state.push("inkora_protected_block", "", 0);
  token.block = true;
  token.map = [start, end];
  token.meta = { inkoraOpaque: kind, inkoraIssue: issue, inkoraRule: boundaryRule(kind, issue, 'block') };
  state.line = end;
}

/** Canonical D002 wins over CommonMark reference definitions at the same start. */
export function installProtectedSyntax(markdown: MarkdownIt): void {
  type InlineRule = (state: StateInline, silent: boolean) => boolean;
  const ruler = markdown.inline.ruler as typeof markdown.inline.ruler & {
    __rules__: Array<{ name: string; fn: InlineRule }>;
  };
  const link = ruler.__rules__.find(rule => rule.name === 'link')?.fn;
  const image = ruler.__rules__.find(rule => rule.name === 'image')?.fn;
  const html = ruler.__rules__.find(rule => rule.name === 'html_inline')?.fn;
  const code = ruler.__rules__.find(rule => rule.name === 'backticks')?.fn;
  const autolink = ruler.__rules__.find(rule => rule.name === 'autolink')?.fn;
  if (!link || !image || !html || !code || !autolink) throw Error('markdown-it owner rules unavailable');
  let imageDepth = 0;
  let linkDepth = 0;
  const bareOwners = new WeakMap<StateInline, ReturnType<typeof gfmAutolinks>>();
  ruler.at('image', (state, silent) => {
    imageDepth++;
    try { return image(state, silent); } finally { imageDepth--; }
  });
  ruler.at('link', (state, silent) => {
    linkDepth++;
    try { return link(state, silent); } finally { linkDepth--; }
  });
  const insideOwner = (_state: StateInline) => imageDepth > 0 || linkDepth > 0;
  ruler.at('html_inline', (state, silent) => {
    if (insideOwner(state)) return false;
    const from = state.pos;
    const before = state.tokens.length;
    const accepted = html(state, silent);
    if (!accepted || silent) return accepted;
    const token = state.tokens.slice(before).find(item => item.type === 'html_inline');
    if (!token) throw Error('已接受 HTML 缺少原始 token');
    const jsx = /^<\/?[A-Z]/.test(token.content);
    token.type = 'inkora_protected_inline'; token.tag = '';
    token.meta = { inkoraOpaque: token.content.startsWith('<!--') ? 'html_comment' : jsx ? 'jsx' : 'raw_html',
      inkoraFrom: from, inkoraTo: state.pos,
      inkoraRule: jsx ? 'SYN-U001' : token.content.startsWith('<!--') ? 'SYN-D005' : 'SYN-D004',
      inkoraIssue: jsx ? '大写 JSX 候选不支持结构化编辑，已保留原文' : undefined };
    return true;
  });
  type BlockRule = (state: StateBlock, start: number, end: number, silent: boolean) => boolean;
  const blockRuler = markdown.block.ruler as typeof markdown.block.ruler & {
    __rules__: Array<{name: string; fn: BlockRule; alt: string[]}>;
  };
  const htmlBlock = blockRuler.__rules__.find(rule => rule.name === 'html_block');
  if (!htmlBlock) throw Error('markdown-it HTML block rule unavailable');
  const originalHtmlBlock = htmlBlock.fn;
  blockRuler.at('html_block', (state, start, end, silent) => {
    const before = state.tokens.length;
    const accepted = originalHtmlBlock(state, start, end, silent);
    if (!accepted || silent) return accepted;
    const token = state.tokens.slice(before).find(item => item.type === 'html_block');
    if (!token) throw Error('已接受 HTML 块缺少原始 token');
    const jsx = /^<\/?[A-Z]/.test(token.content);
    token.type = 'inkora_protected_block';
    token.meta = { inkoraOpaque: token.content.startsWith('<!--') ? 'html_comment' : jsx ? 'jsx' : 'raw_html',
      inkoraRule: jsx ? 'SYN-U001' : token.content.startsWith('<!--') ? 'SYN-D005' : 'SYN-D004',
      inkoraIssue: jsx ? '大写 JSX 块不支持结构化编辑，已保留原文' : undefined };
    return true;
  }, {alt: htmlBlock.alt});
  ruler.before('link', 'inkora_footnote_reference', (state, silent) => {
    if (silent || insideOwner(state)) return false;
    const match = /^\[\^[A-Za-z0-9_-]+\]/.exec(state.src.slice(state.pos, state.posMax));
    if (!match) return false;
    // A complete inline link at the same start wins. Disable reference
    // fallback only in this isolated probe; never mutate the shared env.
    if (state.src[state.pos + match[0].length] === '(') {
      const probe = new markdown.inline.State(state.src, markdown, { ...state.env, references: undefined }, []);
      probe.pos = state.pos; probe.posMax = state.posMax;
      if (link(probe, true)) return false;
    }
    acceptInline(state, state.pos + match[0].length, 'footnote');
    return true;
  });
  // Complete CommonMark links and images run first. This rule only accepts a
  // still-unowned single-line wiki spelling at the current parser position.
  markdown.inline.ruler.after("image", "inkora_wiki", (state, silent) => {
    if (silent || insideOwner(state)) return false;
    const from = state.pos;
    if (state.src.startsWith('[^', from)) {
      const close = state.src.indexOf(']', from + 2);
      const newline = state.src.indexOf('\n', from + 2);
      const end = Math.min(close < 0 ? state.posMax : close + 1,
        newline < 0 ? state.posMax : newline, state.posMax);
      acceptInline(state, end, 'footnote', '脚注引用 label 或闭合边界非法，已保留原文');
      return true;
    }
    const marker = state.src.startsWith("![[", from) ? "![[" : "[[";
    if (!state.src.startsWith(marker, from)) return false;
    const close = state.src.indexOf("]]", from + marker.length);
    const newline = state.src.indexOf('\n', from + marker.length);
    if (close < 0 || close + 2 > state.posMax || (newline >= 0 && newline < close)) {
      acceptInline(state, newline < 0 ? state.posMax : Math.min(newline, state.posMax), 'wiki', 'Wiki 候选缺少合法闭合，已保留原文');
      return true;
    }
    const target = state.src.slice(from + marker.length, close);
    acceptInline(state, close + 2, 'wiki', !target || target.includes('[[')
      ? 'Wiki target 为空或含嵌套候选，已保留原文' : undefined);
    return true;
  });
  markdown.inline.ruler.push('inkora_unowned_candidate', (state, silent) => {
    if (silent || insideOwner(state)) return false;
    const from = state.pos;
    const rest = state.src.slice(from, state.posMax);
    let end: number | undefined;
    let kind = 'unsupported';
    if (rest[0] === '{' || rest[0] === '}') { end = from + 1; kind = 'template_expression'; }
    else if (/^<\/?[A-Z][A-Za-z0-9]*(?=[\s/>])/.test(rest)) {
      const close = rest.indexOf('>');
      const newline = rest.indexOf('\n');
      end = from + Math.min(close < 0 ? rest.length : close + 1, newline < 0 ? rest.length : newline);
      kind = 'jsx';
    } else if (from > 0 && state.src[from - 1] === '\n' && rest.startsWith(': ')) {
      const newline = rest.indexOf('\n');
      end = from + (newline < 0 ? rest.length : newline); kind = 'definition_list';
    } else {
      const marker = rest.startsWith('==') ? '==' : ['^', '~', '$'].includes(rest[0]) ? rest[0] : undefined;
      if (marker && !(marker === '~' && (rest[1] === '~' || state.src[from - 1] === '~'))) {
        for (let at = from + marker.length; at < state.posMax && state.src[at] !== '\n'; at++) {
          if (state.src[at] === '\\') { at++; continue; }
          // A lower-priority U pair cannot consume a future code/link/HTML/D
          // owner. Ask the locked rules, rather than reimplement their grammar.
          const char = state.src[at];
          if ('`[!<'.includes(char)) {
            if (state.src.startsWith('[^', at) || state.src.startsWith('[[', at) || state.src.startsWith('![[', at)) break;
            const probe = new markdown.inline.State(state.src, markdown, state.env, []);
            probe.pos = at; probe.posMax = state.posMax;
            if (char === '`') {
              code(probe, false);
              if (probe.tokens.some(token => token.type === 'code_inline')) break;
              at = probe.pos - 1;
              continue;
            }
            if ((char === '[' && link(probe, true)) || (char === '!' && image(probe, true)) ||
                (char === '<' && (autolink(probe, true) || html(probe, true)))) break;
          }
          if (at > from + marker.length && state.src.startsWith(marker, at) &&
              !(marker === '~' && (state.src[at - 1] === '~' || state.src[at + 1] === '~'))) {
            end = at + marker.length;
            kind = marker === '$' ? 'math' : 'unsupported_inline'; break;
          }
        }
      }
    }
    if (end === undefined) return false;
    let bare = bareOwners.get(state);
    if (!bare) { bare = gfmAutolinks(state.src); bareOwners.set(state, bare); }
    if (bare.some(owner => owner.from < end! && owner.to > from)) return false;
    acceptInline(state, end, kind, '无法证明该扩展语法的结构化边界；已保留原文并开放源码提交');
    return true;
  });
  markdown.block.ruler.before("code", "inkora_front_matter", (
    state: StateBlock, start: number, end: number, silent: boolean,
  ): boolean => {
    if (start !== 0 || state.bMarks[start] !== 0) return false;
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
  markdown.block.ruler.before('blockquote', 'inkora_math_block', (state, start, end, silent) => {
    const from = state.bMarks[start] + state.tShift[start];
    if (state.src.slice(from, state.eMarks[start]) !== '$$') return false;
    if (silent) return true;
    let next = start + 1;
    for (; next < end; next++) {
      if (state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]) === '$$') break;
    }
    acceptBlock(state, start, next < end ? next + 1 : end, 'math',
      next < end ? undefined : '数学围栏缺少配对 $$ 行；已保留原文');
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
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
  markdown.block.ruler.before('paragraph', 'inkora_unowned_block', (state, start, end, silent) => {
    const from = state.bMarks[start] + state.tShift[start];
    const line = state.src.slice(from, state.eMarks[start]);
    const json = start === 0 && from === 0 && line.startsWith('{');
    const esm = /^(?:import|export)(?=[\t {])/.test(line);
    const container = /^(?:::{2,}|!!!)\s*\S+/.test(line);
    if (!json && !esm && !container) return false;
    if (silent) return true;
    let next = start + 1;
    if (json) next = end;
    else while (next < end && !state.isEmpty(next)) next++;
    acceptBlock(state, start, next, json ? 'json_front_matter' : esm ? 'esm' : 'custom_container',
      '未支持的块级语法候选，已保留原文并开放源码提交');
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
}

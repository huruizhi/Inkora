import type MarkdownIt from "markdown-it";
import type { Token, StateInline } from "markdown-it";

/** Capture resolved delimiters on the real parse, before text_join merges them. */
export function installInlineProvenance(markdown: MarkdownIt): void {
  const positions = new WeakMap<StateInline, Map<number, number>>();
  markdown.inline.ruler.before('emphasis', 'inkora_emphasis_positions', (state, silent) => {
    if (silent || !'*_'.includes(state.src[state.pos])) return false;
    let end = state.pos + 1;
    while (state.src[end] === state.src[state.pos]) end++;
    let captured = positions.get(state);
    if (!captured) { captured = new Map(); positions.set(state, captured); }
    const first = state.tokens.length + (state.pending ? 1 : 0);
    for (let pos = state.pos; pos < end; pos++) captured.set(first + pos - state.pos, pos);
    return false;
  });
  markdown.inline.ruler2.after('emphasis', 'inkora_emphasis_provenance', state => {
    const captured = positions.get(state);
    state.tokens.forEach((token, index) => {
      const pos = captured?.get(index);
      if (pos === undefined) return;
      const syntax = ({ em_open: 'em-open', em_close: 'em-close', strong_open: 'strong-open', strong_close: 'strong-close' } as Record<string, string>)[token.type];
      if (!syntax) return;
      const from = token.type === 'strong_open' ? pos - 1 : pos;
      token.meta = { ...token.meta, inkoraDelimiter: { from, to: from + token.markup.length, syntax } };
    });
    return false;
  });
}

// Capture the container prefix while markdown-it's block parser still has its
// list/quote indentation context. Restored physical lines cannot reconstruct
// that context by looking for the first occurrence of token.content.
type ContainerBlockState = {
  src: string;
  tokens: Token[];
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  bsCount: number[];
  blkIndent: number;
};
type ContainerBlockRule = (state: ContainerBlockState, start: number, end: number, silent: boolean) => boolean;
type ContainerBlockRuler = {
  __rules__?: Array<{ name: string; fn: ContainerBlockRule; alt: string[] }>;
  at(name: string, fn: ContainerBlockRule, options: { alt: string[] }): void;
};

export function installContainerProvenance(markdown: MarkdownIt): void {
  const containerRuler = markdown.block.ruler as unknown as ContainerBlockRuler;
  for (const name of ['paragraph', 'fence', 'code']) {
    const entry = containerRuler.__rules__?.find(rule => rule.name === name);
    if (!entry) throw Error(`markdown-it ${name} block rule unavailable`);
    const original = entry.fn;
    containerRuler.at(name, (state, start, end, silent) => {
      const before = state.tokens.length;
      const accepted = original(state, start, end, silent);
      if (!accepted || silent) return accepted;
      for (const token of state.tokens.slice(before)) {
        if (!token.map || !['inline', 'fence', 'code_block'].includes(token.type)) continue;
        const columns: number[] = [];
        for (let line = token.map[0]; line < token.map[1]; line++) {
          const lineStart = state.bMarks[line];
          let first = lineStart;
          let indent = 0;
          while (first < state.eMarks[line] && indent < state.blkIndent) {
            const char = state.src[first];
            if (char === '\t') indent += 4 - (indent + state.bsCount[line]) % 4;
            else if (char === ' ' || first - lineStart < state.tShift[line]) indent++;
            else break;
            first++;
          }
          // A partial tab expansion has no one-to-one raw character boundary.
          // Preserve the existing explicit refusal instead of inventing spaces.
          if (indent > state.blkIndent) {
            columns.push(-1);
          } else {
            const physicalStart = state.src.lastIndexOf('\n', Math.max(0, lineStart - 1)) + 1;
            columns.push(first - physicalStart);
          }
        }
        token.meta = { ...token.meta, inkoraContainerColumns: columns };
      }
      return accepted;
    }, { alt: entry.alt });
  }
}

export type RawUnit = { start: number; end: number };
export type InlineInput = { text: string; units: RawUnit[] };
export type AcceptedOpaqueInline = {
  sourceStart: number; sourceEnd: number; raw: string; kind: string;
  rule: string;
  form: 'block' | 'inline';
};
export type AcceptedDelimiter = { sourceStart: number; sourceEnd: number; syntax: string };
type PrefixSpan = { sourceStart: number; sourceEnd: number; role: "block-prefix" | "block-suffix"; syntax: string; visible: false };
type PrefixSink = { push(...spans: PrefixSpan[]): unknown };

export function lineTable(source: string): Array<{ start: number; contentEnd: number; end: number; text: string }> {
  const lines: Array<{ start: number; contentEnd: number; end: number; text: string }> = [];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i !== source.length && source[i] !== '\n') continue;
    const end = i < source.length ? i + 1 : i;
    const contentEnd = i > start && source[i - 1] === '\r' ? i - 1 : i;
    lines.push({ start, contentEnd, end, text: source.slice(start, contentEnd) });
    start = end;
  }
  return lines;
}

export function prefixCursor(line: string, heading: boolean): number {
  let cursor = line.startsWith('\uFEFF') ? 1 : 0;
  let changed = true;
  while (changed) {
    changed = false;
    const quote = line.slice(cursor).match(/^ {0,3}>[ \t]?/);
    if (quote) { cursor += quote[0].length; changed = true; continue; }
    const list = line.slice(cursor).match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/);
    if (list) { cursor += list[0].length; changed = true; }
  }
  if (heading) {
    const marker = line.slice(cursor).match(/^ {0,3}#{1,6}(?:[ \t]+|$)/);
    if (marker) cursor += marker[0].length;
  }
  return cursor;
}

export function containerLine(
  lines: ReturnType<typeof lineTable>, token: Token, index: number, occupied: PrefixSink,
): ReturnType<typeof lineTable>[number] {
  const line = lines[index];
  const column = (token.meta?.inkoraContainerColumns?.[index - token.map![0]] ?? 0)
    + (line.start === 0 && line.text.startsWith('\uFEFF') ? 1 : 0);
  if (!Number.isInteger(column) || column < 0 || column > line.text.length) {
    throw Error('容器前缀无法映射到完整原文边界');
  }
  if (column) occupied.push({
    sourceStart: line.start, sourceEnd: line.start + column,
    role: 'block-prefix', syntax: 'container-prefix', visible: false,
  });
  return { ...line, start: line.start + column, text: line.text.slice(column) };
}

export function mapInlineToken(source: string, lines: ReturnType<typeof lineTable>, token: Token, heading: boolean, occupied: PrefixSink): InlineInput {
  if (!token.map) throw Error('inline token 缺少块级行范围');
  const desired = token.content.split('\n');
  const physical = lines.slice(token.map[0], token.map[1]).map((_, offset) =>
    containerLine(lines, token, token.map![0] + offset, occupied));
  const units: RawUnit[] = [];
  let text = '';
  let physicalIndex = 0;
  for (let part = 0; part < desired.length; part++) {
    const wanted = desired[part];
    let match: { line: (typeof physical)[number]; start: number; end: number } | undefined;
    for (; physicalIndex < physical.length; physicalIndex++) {
      const line = physical[physicalIndex];
      let cursor = prefixCursor(line.text, heading && part === 0);
      // Paragraph's asciiTrim removes the first logical line's remaining
      // indentation after getLines has removed the proven container prefix.
      if (part === 0 && token.meta?.inkoraContainerColumns) {
        cursor += /^[\t ]*/.exec(line.text.slice(cursor))![0].length;
      }
      if (part === 0 && typeof token.meta?.inkoraTaskPrefixLength === 'number') {
        const physicalTask = /^\[[ xX]\][\t ]+/.exec(line.text.slice(cursor));
        cursor += physicalTask?.[0].length ?? token.meta.inkoraTaskPrefixLength;
      }
      let content = line.text.slice(cursor);
      if (heading && part === 0) content = content.replace(/[ \t]+#+[ \t]*$/, '');
      // CommonMark drops ordinary spaces at the end of the final inline line.
      // They remain source-owned bytes (and may be a short-lived visual draft)
      // rather than an alignment failure. Internal line endings are excluded:
      // their spaces can change softbreak/hardbreak semantics.
      const finalTrailingSpaces = part === desired.length - 1
        && content.startsWith(wanted)
        && /^ *$/.test(content.slice(wanted.length));
      if (content !== wanted && !finalTrailingSpaces) continue;
      match = { line, start: line.start + cursor, end: line.start + cursor + wanted.length };
      physicalIndex++;
      break;
    }
    if (!match) throw Error(`inline 原文行无法词法定位：${JSON.stringify(wanted)}`);
    if (match.start > match.line.start) occupied.push({ sourceStart: match.line.start, sourceEnd: match.start, role: 'block-prefix', syntax: 'block-prefix', visible: false });
    if (match.end < match.line.contentEnd) occupied.push({ sourceStart: match.end, sourceEnd: match.line.contentEnd, role: 'block-suffix', syntax: heading ? 'heading-close' : 'block-suffix', visible: false });
    for (let j = 0; j < wanted.length; j++) units.push({ start: match.start + j, end: match.start + j + 1 });
    text += wanted;
    if (part < desired.length - 1) {
      if (match.line.end === match.line.contentEnd) throw Error('inline softbreak 缺少原文行尾');
      units.push({ start: match.line.contentEnd, end: match.line.end });
      text += '\n';
    }
  }
  return { text, units };
}

type TableSourceCell = { start: number; end: number; anchor: number };

function tablePipeOffsets(text: string): number[] {
  const offsets: number[] = [];
  let codeDelimiter = "";
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "`") {
      let end = index + 1;
      while (text[end] === "`") end++;
      const run = text.slice(index, end);
      if (!codeDelimiter) codeDelimiter = run;
      else if (run === codeDelimiter) codeDelimiter = "";
      index = end - 1;
      continue;
    }
    if (text[index] !== "|" || codeDelimiter) continue;
    let slashes = 0;
    for (let before = index - 1; before >= 0 && text[before] === "\\"; before--) slashes++;
    if (slashes % 2 === 0) offsets.push(index);
  }
  return offsets;
}

export function tableCellsForLine(line: ReturnType<typeof lineTable>[number], columns: number): TableSourceCell[] {
  const prefix = prefixCursor(line.text, false);
  const tableText = line.text.slice(prefix);
  const pipes = tablePipeOffsets(tableText);
  const leading = pipes[0] !== undefined && tableText.slice(0, pipes[0]).trim() === "";
  const trailing = pipes.at(-1) !== undefined && tableText.slice(pipes.at(-1)! + 1).trim() === "";
  const boundaries = [leading ? pipes[0] + 1 : 0];
  for (const pipe of pipes) {
    if (leading && pipe === pipes[0]) continue;
    if (trailing && pipe === pipes.at(-1)) break;
    boundaries.push(pipe + 1);
  }
  const rowEnd = trailing ? pipes.at(-1)! : tableText.length;
  const cells: TableSourceCell[] = [];
  for (let column = 0; column < columns; column++) {
    const segmentStart = boundaries[column] ?? rowEnd;
    const segmentEnd = column + 1 < boundaries.length ? boundaries[column + 1] - 1 : rowEnd;
    let start = segmentStart;
    let end = Math.max(segmentStart, segmentEnd);
    while (start < end && /[\t ]/.test(tableText[start])) start++;
    while (end > start && /[\t ]/.test(tableText[end - 1])) end--;
    cells.push({
      start: line.start + prefix + start,
      end: line.start + prefix + end,
      anchor: line.start + prefix + segmentEnd,
    });
  }
  return cells;
}

export function tableCellInlineInput(source: string, start: number, end: number): InlineInput {
  let text = '';
  const units: RawUnit[] = [];
  for (let offset = start; offset < end; offset++) {
    if (source[offset] === '\\' && source[offset + 1] === '|') {
      text += '|';
      units.push({ start: offset, end: offset + 2 });
      offset++;
      continue;
    }
    text += source[offset];
    units.push({ start: offset, end: offset + 1 });
  }
  return { text, units };
}

/** Bind parser-accepted inline ranges using the same physical units as ledger. */
export function bindOpaqueInlineSource(source: string, tokens: readonly Token[]): void {
  const lines = lineTable(source);
  let cells: ReturnType<typeof tableCellsForLine> = [];
  let cellIndex = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'inkora_protected_block') {
      if (!token.map) throw Error('保护块没有同次解析的物理行范围');
      const first = lines[token.map[0]];
      const last = lines[token.map[1] - 1];
      if (!first || !last) throw Error('保护块行范围越界');
      const start = first.start + (first.start === 0 && source[0] === '\uFEFF' ? 1 : 0);
      const accepted: AcceptedOpaqueInline = { sourceStart: start, sourceEnd: last.contentEnd,
        raw: source.slice(start, last.contentEnd), kind: token.meta.inkoraOpaque,
        rule: token.meta.inkoraRule, form: 'block' };
      token.meta = { ...token.meta, inkoraRaw: accepted.raw, inkoraAccepted: accepted };
    }
    if (token.type === "tr_open" && token.map) {
      let columns = 0;
      for (let next = index + 1; next < tokens.length && tokens[next].type !== "tr_close"; next++) {
        if (tokens[next].type === "th_open" || tokens[next].type === "td_open") columns++;
      }
      cells = tableCellsForLine(lines[token.map[0]], columns);
      cellIndex = 0;
    }
    if (token.type !== "inline") continue;
    const cell = token.map ? undefined : cells[cellIndex++];
    const children = (token.children ?? []).filter(child =>
      child.type === "inkora_protected_inline" || child.meta?.inkoraDelimiter);
    if (!children.length) continue;
    const input = token.map
      ? mapInlineToken(source, lines, token, tokens[index - 1]?.type === "heading_open", [])
      : cell ? tableCellInlineInput(source, cell.start, cell.end) : undefined;
    if (!input || input.text !== token.content) throw Error("已接受行内 token 没有唯一原文依据");
    for (const child of children) {
      const delimiter = child.meta.inkoraDelimiter;
      const from = (delimiter?.from ?? child.meta.inkoraFrom) - (token.meta?.inkoraTaskPrefixLength ?? 0);
      const to = (delimiter?.to ?? child.meta.inkoraTo) - (token.meta?.inkoraTaskPrefixLength ?? 0);
      const first = input.units[from];
      const last = input.units[to - 1];
      if (!first || !last || from >= to) throw Error("保护行内范围超出已接受 token");
      if (delimiter) {
        child.meta = { ...child.meta, inkoraAcceptedDelimiter: {
          sourceStart: first.start, sourceEnd: last.end, syntax: delimiter.syntax,
        } satisfies AcceptedDelimiter };
        continue;
      }
      const accepted: AcceptedOpaqueInline = {
        sourceStart: first.start, sourceEnd: last.end,
        raw: source.slice(first.start, last.end), kind: child.meta.inkoraOpaque,
        rule: child.meta.inkoraRule, form: 'inline',
      };
      child.meta = { ...child.meta, inkoraRaw: accepted.raw, inkoraAccepted: accepted };
    }
  }
}

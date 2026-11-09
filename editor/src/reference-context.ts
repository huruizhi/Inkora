// Capture accepted CommonMark definitions and their exact source fields;
// identical bytes inside fenced/indented code or literal blocks stay literal.
import type MarkdownIt from 'markdown-it';

type ReferenceField = { from: number; to: number };
type DefinitionProvenance = {
  key: string;
  href: string;
  title: string | null;
  label: ReferenceField;
  destination: ReferenceField;
  destinationSyntax: ReferenceField;
  titleSource?: ReferenceField;
};
export type ReferenceLineRange = {
  startLine: number;
  endLine: number;
  definition?: DefinitionProvenance;
};
export type SourceReferenceDefinition = DefinitionProvenance & { from: number; to: number };

const captureKey = '__inkoraReferenceLineRanges';
const wrappedKey = Symbol('inkoraReferenceCapture');

type BlockState = {
  env: Record<string, unknown>;
  line: number;
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
};
type BlockRule = (state: BlockState, startLine: number, endLine: number, silent: boolean) => boolean;
type RuleEntry = { name: string; fn: BlockRule & { [wrappedKey]?: boolean }; alt: string[] };
type BlockRuler = {
  __rules__?: RuleEntry[];
  at(name: string, rule: BlockRule, options?: { alt?: string[] }): void;
};

function captureDefinition(
  markdown: MarkdownIt, state: BlockState, startLine: number, endLine: number,
): DefinitionProvenance {
  let text = '';
  const positions: number[] = [];
  // These are the exact continuation starts used by the accepted reference
  // rule, while the parent list/quote still owns its temporary indentation.
  for (let line = startLine; line < endLine; line++) {
    const from = state.bMarks[line] + state.tShift[line];
    const to = Math.min(state.eMarks[line] + 1, state.src.length);
    text += state.src.slice(from, to);
    for (let index = from; index < to; index++) positions.push(index);
  }
  let labelEnd = 1;
  for (; labelEnd < text.length; labelEnd++) {
    if (text[labelEnd] === '\\') { labelEnd++; continue; }
    if (text[labelEnd] === ']') break;
  }
  if (text[0] !== '[' || text[labelEnd + 1] !== ':') {
    throw Error('已接受的引用定义缺少可审计 label 边界');
  }
  const field = (from: number, to: number): ReferenceField => {
    const start = positions[from];
    const end = from === to ? start : positions[to - 1] + 1;
    if (start === undefined || end === undefined || end < start) {
      throw Error('引用定义字段无法映射到原始 parser 单元');
    }
    return { from: start, to: end };
  };
  let cursor = labelEnd + 2;
  while (/[\t \n]/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
  const destinationStart = cursor;
  const destination = markdown.helpers.parseLinkDestination(text, cursor, text.length);
  if (!destination.ok) throw Error('已接受的引用 destination 无法重证');
  const angle = text[cursor] === '<';
  const hrefSource = field(cursor + (angle ? 1 : 0), destination.pos - (angle ? 1 : 0));
  const afterDestination = destination.pos;
  cursor = afterDestination;
  while (/[\t \n]/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
  const title = markdown.helpers.parseLinkTitle(text, cursor, text.length);
  const hasTitle = cursor > afterDestination && title.ok && /^[\t \n]*$/.test(text.slice(title.pos));
  return {
    key: markdown.utils.normalizeReference(text.slice(1, labelEnd)),
    href: markdown.normalizeLink(destination.str),
    title: hasTitle ? title.str || null : null,
    label: field(1, labelEnd),
    destination: hrefSource,
    destinationSyntax: field(destinationStart, afterDestination),
    titleSource: hasTitle ? field(cursor + 1, title.pos - 1) : undefined,
  };
}

export function installReferenceCapture(markdown: MarkdownIt): void {
  const ruler = markdown.block.ruler as unknown as BlockRuler;
  const entry = ruler.__rules__?.find(rule => rule.name === 'reference');
  if (!entry) throw Error('markdown-it reference block rule unavailable');
  if (entry.fn[wrappedKey]) return;
  const original = entry.fn;
  const wrapped: BlockRule & { [wrappedKey]?: boolean } = (state, startLine, endLine, silent) => {
    const accepted = original(state, startLine, endLine, silent);
    if (accepted && !silent) {
      const existing = state.env[captureKey];
      const ranges = Array.isArray(existing) ? existing as ReferenceLineRange[] : [];
      if (!Array.isArray(existing)) state.env[captureKey] = ranges;
      ranges.push({
        startLine, endLine: state.line,
        definition: captureDefinition(markdown, state, startLine, state.line),
      });
    }
    return accepted;
  };
  wrapped[wrappedKey] = true;
  ruler.at('reference', wrapped, { alt: entry.alt });
}

export function referenceDefinitions(
  source: string, ranges: readonly ReferenceLineRange[],
): SourceReferenceDefinition[] {
  if (!ranges.length) return [];
  // Both parser callers exclude the file BOM. It is not an indentation column.
  const bomWidth = source.startsWith('\uFEFF') ? 1 : 0;
  const rawStarts = [bomWidth];
  const normalizedStarts = [0];
  let normalized = 0;
  for (let raw = bomWidth; raw < source.length; raw++) {
    normalized++;
    if (source[raw] === '\r' && source[raw + 1] === '\n') raw++;
    if (source[raw] === '\n' || source[raw] === '\r') {
      rawStarts.push(raw + 1);
      normalizedStarts.push(normalized);
    }
  }
  const rawOffset = (offset: number): number => {
    let low = 0, high = normalizedStarts.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (normalizedStarts[mid] <= offset) low = mid + 1;
      else high = mid;
    }
    const line = low - 1;
    if (line < 0 || offset > normalized) throw Error('引用定义 parser 坐标越界');
    return rawStarts[line] + offset - normalizedStarts[line];
  };
  const field = (value: ReferenceField): ReferenceField => ({
    from: rawOffset(value.from), to: rawOffset(value.to),
  });
  return ranges.map(range => {
    const definition = range.definition;
    if (!definition) throw Error('引用定义缺少 parser provenance');
    return {
      ...definition,
      from: rawStarts[range.startLine],
      to: rawStarts[range.endLine] ?? source.length,
      label: field(definition.label),
      destination: field(definition.destination),
      destinationSyntax: field(definition.destinationSyntax),
      titleSource: definition.titleSource ? field(definition.titleSource) : undefined,
    };
  });
}

export function referenceLineRanges(env: Record<string, unknown>): readonly ReferenceLineRange[] {
  const value = env[captureKey];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReferenceLineRange => !!item
    && Number.isInteger((item as ReferenceLineRange).startLine)
    && Number.isInteger((item as ReferenceLineRange).endLine)
    && (item as ReferenceLineRange).endLine > (item as ReferenceLineRange).startLine);
}

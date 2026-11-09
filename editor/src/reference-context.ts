// definition from identical bytes inside fenced/indented code or literal
// blocks.
import type MarkdownIt from 'markdown-it';

export type ReferenceLineRange = { startLine: number; endLine: number };

const captureKey = '__inkoraReferenceLineRanges';
const wrappedKey = Symbol('inkoraReferenceCapture');

type BlockState = {
  env: Record<string, unknown>;
  line: number;
};
type BlockRule = (state: BlockState, startLine: number, endLine: number, silent: boolean) => boolean;
type RuleEntry = { name: string; fn: BlockRule & { [wrappedKey]?: boolean }; alt: string[] };
type BlockRuler = {
  __rules__?: RuleEntry[];
  at(name: string, rule: BlockRule, options?: { alt?: string[] }): void;
};

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
      ranges.push({ startLine, endLine: state.line });
    }
    return accepted;
  };
  wrapped[wrappedKey] = true;
  ruler.at('reference', wrapped, { alt: entry.alt });
}

export function referenceLineRanges(env: Record<string, unknown>): readonly ReferenceLineRange[] {
  const value = env[captureKey];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReferenceLineRange => !!item
    && Number.isInteger((item as ReferenceLineRange).startLine)
    && Number.isInteger((item as ReferenceLineRange).endLine)
    && (item as ReferenceLineRange).endLine > (item as ReferenceLineRange).startLine);
}

export function referenceSourceSlices(source: string, ranges: readonly ReferenceLineRange[]): string[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === '\n') starts.push(index + 1);
  return ranges.map(range => {
    const start = starts[range.startLine];
    const end = starts[range.endLine] ?? source.length;
    if (start === undefined || start > end) throw Error(`引用定义行范围越界：${range.startLine}..${range.endLine}`);
    return source.slice(start, end);
  });
}

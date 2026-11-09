import type { Node as PMNode } from "prosemirror-model";
import {
  searchSource,
  type SearchOptions,
  type SourceSearchResult,
} from "./source-search";

export interface VisualTextBlock {
  readonly from: number;
  readonly to: number;
  /** UTF-16 text boundaries in this block, mapped to actual PM positions. */
  readonly positions: readonly number[];
}

export interface VisualTextIndex {
  readonly text: string;
  readonly blocks: readonly VisualTextBlock[];
}

export type VisualSearchNavigation =
  | { readonly kind: "index"; readonly matchIndex: number }
  | { readonly kind: "relative"; readonly direction: "forward" | "backward" };

export interface VisualSearchLocation {
  readonly matchIndex: number;
  readonly wrapped: boolean;
  readonly anchor: number;
  readonly head: number;
}

export interface VisualSearchTarget {
  readonly from: number;
  readonly to: number;
}

export interface VisualTextEdit {
  readonly from: number;
  readonly to: number;
  readonly expected: string;
  readonly insert: string;
}

export function sameSearchResult(left: SourceSearchResult, right: SourceSearchResult): boolean {
  return left.source.raw === right.source.raw && left.source.revision === right.source.revision &&
    left.query === right.query && left.caseSensitive === right.caseSensitive &&
    left.maxResults === right.maxResults && left.truncated === right.truncated &&
    left.matches.length === right.matches.length && left.matches.every((match, i) =>
      match.from === right.matches[i]?.from && match.to === right.matches[i]?.to && match.text === right.matches[i]?.text);
}

export function locateVisualMatch(
  index: VisualTextIndex,
  result: SourceSearchResult,
  selection: { readonly anchor: number; readonly head: number },
  request: VisualSearchNavigation,
  mappedTargets?: readonly VisualSearchTarget[],
): VisualSearchLocation | null {
  const targets = mappedTargets ?? mapVisualMatches(index, result);
  if (!targets.length) return null;
  let matchIndex: number;
  let wrapped = false;
  if (request.kind === "index") matchIndex = request.matchIndex;
  else if (request.direction === "forward") {
    matchIndex = targets.findIndex(item => item.from >= Math.max(selection.anchor, selection.head));
    if (matchIndex < 0) { matchIndex = 0; wrapped = true; }
  } else {
    matchIndex = -1;
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i].to <= Math.min(selection.anchor, selection.head)) { matchIndex = i; break; }
    }
    if (matchIndex < 0) { matchIndex = targets.length - 1; wrapped = true; }
  }
  if (!Number.isInteger(matchIndex) || matchIndex < 0 || matchIndex >= targets.length) return null;
  const target = targets[matchIndex];
  return {
    matchIndex, wrapped,
    anchor: selection.anchor > selection.head ? target.to : target.from,
    head: selection.anchor > selection.head ? target.from : target.to,
  };
}

/** Map one stable result snapshot once; replacement batches reuse this table. */
export function mapVisualMatches(
  index: VisualTextIndex,
  result: SourceSearchResult,
): readonly VisualSearchTarget[] {
  const targets: VisualSearchTarget[] = [];
  let blockIndex = 0;
  for (const match of result.matches) {
    while (blockIndex < index.blocks.length && index.blocks[blockIndex]!.to < match.from) {
      blockIndex++;
    }
    const block = index.blocks[blockIndex];
    if (!block || block.from > match.from || block.to < match.to) {
      throw Error("查找结果跨越内容结构边界");
    }
    const from = block.positions[match.from - block.from];
    const to = block.positions[match.to - block.from];
    if (from === undefined || to === undefined) throw Error("查找结果没有完整 PM 位置依据");
    targets.push({ from, to });
  }
  return targets;
}

/** Index the editable PM document, never NodeView/toolbar DOM text. */
export function indexVisualText(doc: PMNode): VisualTextIndex {
  const blocks: VisualTextBlock[] = [];
  let text = "";
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let part = "";
    let positions: number[] = [];
    const flush = (): void => {
      if (!part) return;
      if (blocks.length) text += "\n";
      const from = text.length;
      text += part;
      blocks.push({ from, to: text.length, positions });
      part = "";
      positions = [];
    };
    node.forEach((child, offset) => {
      // Old image placeholders contain source syntax; they are not editable
      // label text. Image alt navigation has its own owner, never a text caret.
      const visible = child.isText && !child.marks.some(mark => mark.type.name === "image_ref")
        ? child.text!
        : child.type.name === "hard_break" ? "\n" : null;
      if (visible === null) { flush(); return; }
      const start = pos + 1 + offset;
      if (!positions.length) positions.push(start);
      for (let index = 0; index < visible.length; index++) positions.push(start + index + 1);
      part += visible;
    });
    flush();
    return false;
  });
  return { text, blocks };
}

/** Match inside each textblock; paragraph/cell separators never form a hit. */
export function searchVisualText(
  index: VisualTextIndex,
  revision: number,
  query: string,
  options: SearchOptions = {},
): SourceSearchResult {
  const empty = searchSource({ raw: index.text, revision }, "", options);
  const matches: SourceSearchResult["matches"][number][] = [];
  const rejected: SourceSearchResult["rejected"][number][] = [];
  let truncated = false;
  blocks: for (const block of index.blocks) {
    const local = searchSource({ raw: index.text.slice(block.from, block.to), revision }, query, options);
    for (const item of local.rejected) {
      rejected.push({ ...item, range: { from: block.from + item.range.from, to: block.from + item.range.to } });
    }
    for (const match of local.matches) {
      if (matches.length === empty.maxResults) { truncated = true; break blocks; }
      matches.push({ ...match, from: block.from + match.from, to: block.from + match.to });
    }
    if (local.truncated) { truncated = true; break; }
  }
  return { ...empty, query, matches, rejected, truncated };
}

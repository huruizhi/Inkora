import type { DirectedSelection, SourceRange } from "./source-search";

export type SourceNavigationResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function validRawBoundary(raw: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > raw.length) return false;
  if (offset > 0 && offset < raw.length) {
    const before = raw.charCodeAt(offset - 1);
    const after = raw.charCodeAt(offset);
    if (before === 0x0d && after === 0x0a) return false;
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) {
      return false;
    }
  }
  if (offset === 0 || offset === raw.length) return true;
  for (const segment of graphemeSegmenter.segment(raw)) {
    if (segment.index === offset) return true;
    if (segment.index > offset) return false;
  }
  return false;
}

export function textareaProjection(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

export function rawOffsetToTextareaOffset(raw: string, offset: number): number | undefined {
  if (!validRawBoundary(raw, offset)) return undefined;
  let rawIndex = 0;
  let textareaIndex = 0;
  while (rawIndex < offset) {
    if (raw[rawIndex] === "\r") {
      rawIndex += raw[rawIndex + 1] === "\n" ? 2 : 1;
    } else {
      rawIndex += 1;
    }
    textareaIndex += 1;
  }
  return rawIndex === offset ? textareaIndex : undefined;
}

export function textareaOffsetToRawOffset(raw: string, offset: number): number | undefined {
  const projection = textareaProjection(raw);
  if (!Number.isInteger(offset) || offset < 0 || offset > projection.length) return undefined;
  let rawIndex = 0;
  let textareaIndex = 0;
  while (textareaIndex < offset) {
    if (raw[rawIndex] === "\r") {
      rawIndex += raw[rawIndex + 1] === "\n" ? 2 : 1;
    } else {
      rawIndex += 1;
    }
    textareaIndex += 1;
  }
  return validRawBoundary(raw, rawIndex) ? rawIndex : undefined;
}

export function readRawSelection(
  raw: string,
  textareaValue: string,
  selectionStart: number,
  selectionEnd: number,
  selectionDirection: "forward" | "backward" | "none",
): SourceNavigationResult<DirectedSelection> {
  if (textareaValue !== textareaProjection(raw)) {
    return { ok: false, message: "原文与源码视图映射不一致，无法读取当前选区" };
  }
  const start = textareaOffsetToRawOffset(raw, selectionStart);
  const end = textareaOffsetToRawOffset(raw, selectionEnd);
  if (start === undefined || end === undefined) {
    return { ok: false, message: "当前选区不在安全的原文边界上" };
  }
  return {
    ok: true,
    value: selectionDirection === "backward"
      ? { anchor: end, head: start }
      : { anchor: start, head: end },
  };
}

export function mapRawRangeToTextarea(
  raw: string,
  textareaValue: string,
  range: SourceRange,
): SourceNavigationResult<{ readonly start: number; readonly end: number }> {
  if (textareaValue !== textareaProjection(raw)) {
    return { ok: false, message: "原文与源码视图映射不一致，无法定位查找结果" };
  }
  const start = rawOffsetToTextareaOffset(raw, range.from);
  const end = rawOffsetToTextareaOffset(raw, range.to);
  if (start === undefined || end === undefined || start > end) {
    return { ok: false, message: "查找结果不在安全的原文边界上" };
  }
  return { ok: true, value: { start, end } };
}

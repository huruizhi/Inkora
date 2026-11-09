import type { HeadingEntry } from "./document-analysis";

export interface HeadingNavigationTarget extends HeadingEntry {
  readonly index: number;
}

export type HeadingNavigationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export function sameHeading(
  actual: HeadingEntry | undefined,
  target: HeadingNavigationTarget,
): boolean {
  return actual !== undefined &&
    actual.level === target.level &&
    actual.text === target.text &&
    actual.start === target.start &&
    actual.end === target.end;
}

/**
 * Map an original UTF-16 boundary to a textarea value boundary.
 * Rejects offsets without a defined textarea counterpart: boundaries inside a
 * CRLF pair (the two units collapse to one LF in the textarea) and boundaries
 * splitting a surrogate pair (never a valid heading start/end, since analysis
 * ranges align with code point boundaries).
 */
export function rawOffsetToTextareaOffset(raw: string, offset: number): number | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset > raw.length) return undefined;
  const before = offset > 0 ? raw.charCodeAt(offset - 1) : -1;
  const after = offset < raw.length ? raw.charCodeAt(offset) : -1;
  if (offset > 0 && offset < raw.length && (
    (before === 0x0d && after === 0x0a) ||
    (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff)
  )) {
    return undefined;
  }
  let textareaOffset = 0;
  for (let index = 0; index < offset; index += 1) {
    if (raw[index] === "\r") {
      if (index + 1 < offset && raw[index + 1] === "\n") index += 1;
      textareaOffset += 1;
    } else {
      textareaOffset += 1;
    }
  }
  return textareaOffset;
}


export function textareaProjection(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

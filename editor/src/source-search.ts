export interface SourceSnapshot {
  readonly raw: string;
  readonly revision: number;
}

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface DirectedSelection {
  readonly anchor: number;
  readonly head: number;
}

export interface SourceMatch extends SourceRange {
  readonly text: string;
}

export type RejectedMatchReason =
  | "surrogate-boundary"
  | "grapheme-boundary"
  | "crlf-boundary"
  | "leading-bom";

export interface RejectedMatch {
  readonly range: SourceRange;
  readonly text: string;
  readonly reason: RejectedMatchReason;
}

export interface SearchOptions {
  readonly caseSensitive?: boolean;
  readonly maxResults?: number;
}

export interface SourceSearchResult {
  readonly source: SourceSnapshot;
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly maxResults: number;
  readonly matches: readonly SourceMatch[];
  readonly rejected: readonly RejectedMatch[];
  readonly truncated: boolean;
}

export type SearchDirection = "forward" | "backward";

export interface LocatedSourceMatch {
  readonly matchIndex: number;
  readonly match: SourceMatch;
  readonly selection: DirectedSelection;
  readonly wrapped: boolean;
}

export interface SourcePatch extends SourceRange {
  readonly expected: string;
  readonly insert: string;
}

export interface SourceReplacementPlan {
  readonly source: SourceSnapshot;
  readonly resultRaw: string;
  readonly patches: readonly SourcePatch[];
  readonly applyOrder: "descending";
  readonly replacedCount: number;
  readonly changed: boolean;
  readonly selection: DirectedSelection;
}

export interface ReplaceOneIntent {
  readonly kind: "replace-one";
  readonly matchIndex: number;
  readonly replacement: string;
  readonly selection?: DirectedSelection;
}

export interface ReplaceAllIntent {
  readonly kind: "replace-all";
  readonly replacement: string;
  readonly selection?: DirectedSelection;
}

export type ReplacementIntent = ReplaceOneIntent | ReplaceAllIntent;

export type ReplacementFailureReason =
  | "revision-mismatch"
  | "source-mismatch"
  | "missing-match"
  | "truncated-search"
  | "invalid-replacement-unicode"
  | "invalid-selection"
  | "invalid-result-caret";

export interface ReplacementFailure {
  readonly reason: ReplacementFailureReason;
  readonly message: string;
  readonly intent: ReplacementIntent;
  readonly current: SourceSnapshot;
}

export type ReplacementPlanResult =
  | { readonly ok: true; readonly plan: SourceReplacementPlan }
  | { readonly ok: false; readonly failure: ReplacementFailure };

const DEFAULT_MAX_RESULTS = 10_000;
const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export class SourceSearchError extends Error {
  constructor(
    readonly code: "invalid-selection",
    message: string,
  ) {
    super(message);
    this.name = "SourceSearchError";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function graphemeBoundaries(raw: string): Set<number> {
  const boundaries = new Set<number>([0, raw.length]);
  for (const segment of graphemeSegmenter.segment(raw)) {
    boundaries.add(segment.index);
  }
  return boundaries;
}

function isInsideSurrogatePair(raw: string, position: number): boolean {
  if (position <= 0 || position >= raw.length) return false;
  const previous = raw.charCodeAt(position - 1);
  const next = raw.charCodeAt(position);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
}

function isInsideCrlf(raw: string, position: number): boolean {
  return position > 0 && position < raw.length && raw[position - 1] === "\r" && raw[position] === "\n";
}

function boundaryReason(
  raw: string,
  from: number,
  to: number,
  boundaries: ReadonlySet<number>,
  protectLeadingBom: boolean,
): RejectedMatchReason | null {
  if (protectLeadingBom && raw.startsWith("\uFEFF") && from === 0 && to > 0) {
    return "leading-bom";
  }
  if (isInsideSurrogatePair(raw, from) || isInsideSurrogatePair(raw, to)) {
    return "surrogate-boundary";
  }
  if (isInsideCrlf(raw, from) || isInsideCrlf(raw, to)) {
    return "crlf-boundary";
  }
  if (!boundaries.has(from) || !boundaries.has(to)) {
    return "grapheme-boundary";
  }
  return null;
}

function validateMaxResults(value: number, explicitlyProvided: boolean): void {
  const maximum = explicitlyProvided ? DEFAULT_MAX_RESULTS - 1 : DEFAULT_MAX_RESULTS;
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      explicitlyProvided
        ? `Explicit maxResults must be a positive integer smaller than ${DEFAULT_MAX_RESULTS}`
        : `maxResults must be ${DEFAULT_MAX_RESULTS}`,
    );
  }
}

export function searchSource(
  snapshot: SourceSnapshot,
  query: string,
  options: SearchOptions = {},
): SourceSearchResult {
  const caseSensitive = options.caseSensitive ?? true;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  validateMaxResults(maxResults, options.maxResults !== undefined);

  const matches: SourceMatch[] = [];
  const rejected: RejectedMatch[] = [];
  let truncated = false;

  if (query.length > 0) {
    const boundaries = graphemeBoundaries(snapshot.raw);
    const expression = new RegExp(
      escapeRegExp(query),
      caseSensitive ? "gu" : "giu",
    );
    for (const rawMatch of snapshot.raw.matchAll(expression)) {
      const from = rawMatch.index;
      const to = from + rawMatch[0].length;
      const reason = boundaryReason(snapshot.raw, from, to, boundaries, true);
      if (reason) {
        rejected.push({ range: { from, to }, text: rawMatch[0], reason });
        continue;
      }
      if (matches.length === maxResults) {
        truncated = true;
        break;
      }
      matches.push({ from, to, text: rawMatch[0] });
    }
  }

  return {
    source: snapshot,
    query,
    caseSensitive,
    maxResults,
    matches,
    rejected,
    truncated,
  };
}

function assertValidSelection(raw: string, selection: DirectedSelection): void {
  const positions = [selection.anchor, selection.head];
  const inRange = positions.every(
    (position) => Number.isInteger(position) && position >= 0 && position <= raw.length,
  );
  const boundaries = graphemeBoundaries(raw);
  const valid =
    inRange &&
    boundaryReason(raw, selection.anchor, selection.anchor, boundaries, false) === null &&
    boundaryReason(raw, selection.head, selection.head, boundaries, false) === null;
  if (!valid) {
    throw new SourceSearchError(
      "invalid-selection",
      "Selection endpoints must be valid UTF-16 grapheme and CRLF boundaries",
    );
  }
}

export function findSourceMatch(
  search: SourceSearchResult,
  selection: DirectedSelection,
  direction: SearchDirection,
  wrap = true,
): LocatedSourceMatch | null {
  assertValidSelection(search.source.raw, selection);
  if (search.matches.length === 0) return null;

  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);
  const selectedIndex = search.matches.findIndex(
    (match) => match.from === from && match.to === to,
  );
  let matchIndex = -1;
  let wrapped = false;

  if (direction === "forward") {
    matchIndex =
      selectedIndex >= 0
        ? selectedIndex + 1
        : search.matches.findIndex((match) => match.from >= to);
    if (matchIndex < 0 || matchIndex >= search.matches.length) {
      if (!wrap) return null;
      matchIndex = 0;
      wrapped = true;
    }
  } else {
    if (selectedIndex >= 0) {
      matchIndex = selectedIndex - 1;
    } else {
      for (let index = search.matches.length - 1; index >= 0; index -= 1) {
        if (search.matches[index].to <= from) {
          matchIndex = index;
          break;
        }
      }
    }
    if (matchIndex < 0) {
      if (!wrap) return null;
      matchIndex = search.matches.length - 1;
      wrapped = true;
    }
  }

  const match = search.matches[matchIndex];
  const reversed = selection.anchor > selection.head;
  return {
    matchIndex,
    match,
    selection: reversed
      ? { anchor: match.to, head: match.from }
      : { anchor: match.from, head: match.to },
    wrapped,
  };
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function failure(
  reason: ReplacementFailureReason,
  message: string,
  intent: ReplacementIntent,
  current: SourceSnapshot,
): ReplacementPlanResult {
  return { ok: false, failure: { reason, message, intent, current } };
}

function validatePlanInput(
  search: SourceSearchResult,
  current: SourceSnapshot,
  intent: ReplacementIntent,
): ReplacementPlanResult | null {
  if (current.revision !== search.source.revision) {
    return failure(
      "revision-mismatch",
      "Current revision does not match the revision bound to the search",
      intent,
      current,
    );
  }
  if (current.raw !== search.source.raw) {
    return failure(
      "source-mismatch",
      "Current source does not match the source bound to the search",
      intent,
      current,
    );
  }
  if (!isWellFormedUnicode(intent.replacement)) {
    return failure(
      "invalid-replacement-unicode",
      "Replacement contains an unpaired UTF-16 surrogate",
      intent,
      current,
    );
  }
  if (intent.selection) {
    try {
      assertValidSelection(current.raw, intent.selection);
    } catch {
      return failure(
        "invalid-selection",
        "Requested selection is not on a grapheme and CRLF boundary",
        intent,
        current,
      );
    }
  }
  return null;
}

function applyPatches(raw: string, patches: readonly SourcePatch[]): string {
  let result = raw;
  for (const patch of patches) {
    if (result.slice(patch.from, patch.to) !== patch.expected) {
      throw new Error("Source patch no longer matches its expected text");
    }
    result = result.slice(0, patch.from) + patch.insert + result.slice(patch.to);
  }
  return result;
}

function validateResultCaret(
  resultRaw: string,
  caret: number,
  intent: ReplacementIntent,
  current: SourceSnapshot,
): ReplacementPlanResult | null {
  const boundaries = graphemeBoundaries(resultRaw);
  if (boundaryReason(resultRaw, caret, caret, boundaries, false) !== null) {
    return failure(
      "invalid-result-caret",
      "Suggested caret would split a resulting grapheme or CRLF sequence",
      intent,
      current,
    );
  }
  return null;
}

function success(
  source: SourceSnapshot,
  resultRaw: string,
  patches: readonly SourcePatch[],
  selection: DirectedSelection,
): ReplacementPlanResult {
  return {
    ok: true,
    plan: {
      source,
      resultRaw,
      patches,
      applyOrder: "descending",
      replacedCount: patches.length,
      changed: patches.length > 0,
      selection,
    },
  };
}

export function planSourceReplacement(
  search: SourceSearchResult,
  current: SourceSnapshot,
  matchIndex: number,
  replacement: string,
  selection?: DirectedSelection,
): ReplacementPlanResult {
  const intent: ReplaceOneIntent = {
    kind: "replace-one",
    matchIndex,
    replacement,
    ...(selection ? { selection } : {}),
  };
  const invalid = validatePlanInput(search, current, intent);
  if (invalid) return invalid;

  const match = search.matches[matchIndex];
  if (!match || !Number.isInteger(matchIndex)) {
    return failure(
      "missing-match",
      "Requested match is not present in this search result",
      intent,
      current,
    );
  }
  if (match.text === replacement) {
    return success(
      current,
      current.raw,
      [],
      selection ?? { anchor: match.from, head: match.to },
    );
  }

  const patch: SourcePatch = {
    from: match.from,
    to: match.to,
    expected: match.text,
    insert: replacement,
  };
  const resultRaw = applyPatches(current.raw, [patch]);
  const caret = match.from + replacement.length;
  const invalidCaret = validateResultCaret(resultRaw, caret, intent, current);
  if (invalidCaret) return invalidCaret;
  return success(current, resultRaw, [patch], { anchor: caret, head: caret });
}

export function planSourceReplaceAll(
  search: SourceSearchResult,
  current: SourceSnapshot,
  replacement: string,
  selection?: DirectedSelection,
): ReplacementPlanResult {
  const intent: ReplaceAllIntent = {
    kind: "replace-all",
    replacement,
    ...(selection ? { selection } : {}),
  };
  const invalid = validatePlanInput(search, current, intent);
  if (invalid) return invalid;
  if (search.truncated) {
    return failure(
      "truncated-search",
      "Replace-all requires a complete, untruncated search result",
      intent,
      current,
    );
  }

  const ascending = search.matches
    .filter((match) => match.text !== replacement)
    .map<SourcePatch>((match) => ({
      from: match.from,
      to: match.to,
      expected: match.text,
      insert: replacement,
    }));
  if (ascending.length === 0) {
    return success(current, current.raw, [], selection ?? { anchor: 0, head: 0 });
  }

  const patches = [...ascending].reverse();
  const resultRaw = applyPatches(current.raw, patches);
  const last = ascending[ascending.length - 1];
  const precedingDelta = ascending
    .slice(0, -1)
    .reduce((total, patch) => total + patch.insert.length - (patch.to - patch.from), 0);
  const caret = last.from + precedingDelta + last.insert.length;
  const invalidCaret = validateResultCaret(resultRaw, caret, intent, current);
  if (invalidCaret) return invalidCaret;
  return success(current, resultRaw, patches, { anchor: caret, head: caret });
}

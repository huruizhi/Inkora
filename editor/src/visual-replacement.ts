import type { Mark } from "prosemirror-model";
import type { LedgerSpan, SourceLedger, SourceLinkOwner } from "./source-ledger";

interface MarkScope {
  readonly name: "strong" | "em" | "strike";
  readonly open: LedgerSpan;
  readonly close: LedgerSpan;
  readonly visualFrom: number;
  readonly visualTo: number;
}

const MARK_DELIMITERS = {
  "strong-open": { name: "strong", close: "strong-close" },
  "em-open": { name: "em", close: "em-close" },
  "strike-open": { name: "strike", close: "strike-close" },
} as const;

const ESCAPABLE = new Set('\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'.split(''));

function markScopes(ledger: SourceLedger): MarkScope[] {
  const scopes: MarkScope[] = [];
  for (const block of ledger.blocks) {
    const ordered = [...block.spans].sort((left, right) =>
      left.sourceStart - right.sourceStart || left.sourceEnd - right.sourceEnd);
    const stacks = new Map<keyof typeof MARK_DELIMITERS, LedgerSpan[]>();
    for (const span of ordered) {
      const opening = MARK_DELIMITERS[span.syntax as keyof typeof MARK_DELIMITERS];
      if (opening) {
        const stack = stacks.get(span.syntax as keyof typeof MARK_DELIMITERS) ?? [];
        stack.push(span);
        stacks.set(span.syntax as keyof typeof MARK_DELIMITERS, stack);
        continue;
      }
      const openSyntax = (Object.entries(MARK_DELIMITERS) as Array<[
        keyof typeof MARK_DELIMITERS,
        (typeof MARK_DELIMITERS)[keyof typeof MARK_DELIMITERS],
      ]>).find(([, value]) => value.close === span.syntax)?.[0];
      if (!openSyntax) continue;
      const open = stacks.get(openSyntax)?.pop();
      if (!open) continue;
      const visible = ordered.filter(item => item.visible && item.visualStart !== undefined &&
        item.visualEnd !== undefined && item.sourceStart >= open.sourceEnd &&
        item.sourceEnd <= span.sourceStart);
      if (!visible.length) continue;
      scopes.push({
        name: MARK_DELIMITERS[openSyntax].name,
        open,
        close: span,
        visualFrom: Math.min(...visible.map(item => item.visualStart!)),
        visualTo: Math.max(...visible.map(item => item.visualEnd!)),
      });
    }
  }
  return scopes;
}

export function escapeEditableText(value: string): string {
  let escaped = "";
  for (const character of value) escaped += ESCAPABLE.has(character) ? `\\${character}` : character;
  return escaped;
}

export function renderAutolinkLabel(raw: string, owner: SourceLinkOwner, label: string): string {
  const angle = raw[owner.source.from] === "<";
  const destination = angle
    ? raw.slice(owner.labelMarkupSource.from, owner.labelMarkupSource.to)
    : owner.href;
  // Inside an explicit link label, dots, @ and URL separators cannot start
  // another autolink. Escape only syntax that can change the displayed label.
  const literalLabel = angle ? escapeEditableText(label)
    : [...label].map(character => '\\[]*_~`&<|'.includes(character)
      ? `\\${character}` : character).join('');
  return `[${literalLabel}](<${destination}>)`;
}

/** Keep untouched link owners around partial selections; drop consumed owners. */
export function rewriteLinkBoundaries(
  raw: string,
  ledger: SourceLedger,
  edit: { from: number; to: number; insert: string },
  rawFrom: number,
  rawTo: number,
  startMarks: readonly Mark[],
): { from: number; to: number; suffixes: Array<{ at: number; text: string }>; marks: readonly Mark[] } {
  let from = rawFrom;
  let to = rawTo;
  let marks = startMarks;
  const suffixes: Array<{ at: number; text: string }> = [];
  for (const scope of ledger.links) {
    if (edit.to <= scope.visual.from || edit.from >= scope.visual.to) continue;
    const whole = edit.from <= scope.visual.from && edit.to >= scope.visual.to;
    const crossesOwner = edit.from < scope.visual.from || edit.to > scope.visual.to;
    if (whole && crossesOwner) {
      from = Math.min(from, scope.source.from);
      to = Math.max(to, scope.source.to);
      if (edit.from === scope.visual.from) marks = marks.filter(mark => mark.type.name !== "link");
    } else if (edit.from > scope.visual.from && edit.to > scope.visual.to) {
      suffixes.push({ at: scope.labelMarkupSource.to, text: raw.slice(scope.labelMarkupSource.to, scope.source.to) });
    } else if (edit.from < scope.visual.from && edit.to < scope.visual.to) {
      suffixes.push({ at: scope.source.from, text: raw.slice(scope.source.from, scope.labelMarkupSource.from) });
    }
  }
  return { from, to, marks, suffixes };
}

/**
 * Build one source-owner patch for literal editable text. The PM transaction
 * remains the semantic authority; this function only preserves or reconstructs
 * delimiters that the selected source range would otherwise leave dangling.
 */
export function planVisualReplacementPatch(
  raw: string,
  ledger: SourceLedger,
  edit: { from: number; to: number; insert: string },
  rawFrom: number,
  rawTo: number,
  startMarks: readonly Mark[],
): {
  from: number;
  to: number;
  insert: string;
  marks: readonly Mark[];
  visualFrom: number;
  visualTo: number;
  visualInsert: string;
} {
  const autolinks = ledger.links.filter(scope => scope.kind === "autolink" &&
    edit.to > scope.visual.from && edit.from < scope.visual.to);
  if (autolinks.length === 1) {
    const scope = autolinks[0]!;
    const whole = edit.from <= scope.visual.from && edit.to >= scope.visual.to;
    const crossesOwner = edit.from < scope.visual.from || edit.to > scope.visual.to;
    if (!(whole && crossesOwner)) {
      const before = edit.from > scope.visual.from
        ? raw.slice(scope.labelMarkupSource.from, rawFrom)
        : "";
      const after = edit.to < scope.visual.to
        ? raw.slice(rawTo, scope.labelMarkupSource.to)
        : "";
      const inlineLink = (label: string): string =>
        renderAutolinkLabel(raw, scope, label);
      const startsInLink = edit.from >= scope.visual.from;
      return {
        from: Math.min(rawFrom, scope.source.from),
        to: Math.max(rawTo, scope.source.to),
        marks: startMarks,
        visualFrom: edit.from,
        visualTo: edit.to,
        visualInsert: edit.insert,
        insert: startsInLink
          ? inlineLink(before + edit.insert + after)
          : escapeEditableText(edit.insert) + inlineLink(after),
      };
    }
  }
  const linked = rewriteLinkBoundaries(raw, ledger, edit, rawFrom, rawTo, startMarks);
  let { from, to } = linked;
  let visualTo = edit.to;
  let visualInsert = edit.insert;
  const prefixes: Array<{ at: number; text: string }> = [];
  const suffixes = [...linked.suffixes];
  const markNames = new Set(linked.marks.map(mark => mark.type.name));

  for (const scope of markScopes(ledger)) {
    if (edit.to <= scope.visualFrom || edit.from >= scope.visualTo) continue;
    const inherited = markNames.has(scope.name);
    const openDeleted = scope.open.sourceStart >= from && scope.open.sourceEnd <= to;
    const closeDeleted = scope.close.sourceStart >= from && scope.close.sourceEnd <= to;
    const openText = raw.slice(scope.open.sourceStart, scope.open.sourceEnd);
    const closeText = raw.slice(scope.close.sourceStart, scope.close.sourceEnd);

    if (inherited) {
      if (openDeleted) prefixes.push({ at: scope.open.sourceStart, text: openText });
      if (closeDeleted) suffixes.push({ at: scope.close.sourceStart, text: closeText });
      continue;
    }
    if (openDeleted && !closeDeleted) {
      if (edit.to < scope.visualTo) {
        const leadingWhitespace = raw.slice(rawTo, scope.close.sourceStart).match(/^[\t ]+/)?.[0] ?? "";
        if (leadingWhitespace) {
          to = Math.max(to, rawTo + leadingWhitespace.length);
          visualTo = Math.max(visualTo, edit.to + leadingWhitespace.length);
          visualInsert += leadingWhitespace;
        }
        suffixes.push({
          at: scope.open.sourceStart,
          text: leadingWhitespace + openText,
        });
      } else {
        to = Math.max(to, scope.close.sourceEnd);
      }
    } else if (!openDeleted && closeDeleted) {
      // A selection beginning inside this mark must inherit it. Refuse to
      // manufacture a different format when the PM start marks disagree.
      throw Error(`替换起点缺少 ${scope.name} mark，整批未应用`);
    }
  }

  const codeText = markNames.has("code") || ledger.spans.some(span =>
    span.visible && span.role === "code-text" && span.visualStart !== undefined &&
    span.visualEnd !== undefined && edit.from >= span.visualStart && edit.from < span.visualEnd);
  const literal = codeText ? edit.insert : escapeEditableText(edit.insert);
  return {
    from,
    to,
    marks: linked.marks,
    visualFrom: edit.from,
    visualTo,
    visualInsert,
    insert: prefixes.sort((left, right) => left.at - right.at).map(item => item.text).join("") +
      literal +
      suffixes.sort((left, right) => left.at - right.at).map(item => item.text).join(""),
  };
}

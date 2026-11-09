import type { Mark } from "prosemirror-model";
import type { SourceLedger } from "./source-ledger";

interface LinkScope {
  rawFrom: number;
  rawTo: number;
  contentFrom: number;
  contentTo: number;
  visualFrom: number;
  visualTo: number;
}

/** Bind lexical owners to their source block, never merge same-href links globally. */
function linkScopes(ledger: SourceLedger): LinkScope[] {
  const scopes: LinkScope[] = [];
  for (const block of ledger.blocks) {
    const owners = new Set(block.spans.filter(span => span.syntax === "link-label-open").map(span => span.owner));
    for (const owner of owners) {
      if (!owner) continue;
      const spans = block.spans.filter(span => span.owner === owner);
      const open = spans.find(span => span.syntax === "link-label-open");
      const close = spans.find(span => span.syntax === "link-label-close");
      const visible = spans.filter(span => span.visible && span.visualStart !== undefined && span.visualEnd !== undefined);
      if (!open || !close || !visible.length) continue;
      scopes.push({
        rawFrom: Math.min(...spans.map(span => span.sourceStart)),
        rawTo: Math.max(...spans.map(span => span.sourceEnd)),
        contentFrom: open.sourceEnd, contentTo: close.sourceStart,
        visualFrom: Math.min(...visible.map(span => span.visualStart!)),
        visualTo: Math.max(...visible.map(span => span.visualEnd!)),
      });
    }
  }
  return scopes;
}

/** Keep untouched link owners around partial selections; drop consumed owners. */
export function rewriteLinkBoundaries(
  raw: string,
  ledger: SourceLedger,
  edit: { from: number; to: number; insert: string },
  rawFrom: number,
  rawTo: number,
  startMarks: readonly Mark[],
): { from: number; to: number; insert: string; marks: readonly Mark[] } {
  let from = rawFrom;
  let to = rawTo;
  let marks = startMarks;
  const suffixes: Array<{ at: number; text: string }> = [];
  for (const scope of linkScopes(ledger)) {
    if (edit.to <= scope.visualFrom || edit.from >= scope.visualTo) continue;
    const whole = edit.from <= scope.visualFrom && edit.to >= scope.visualTo;
    const crossesOwner = edit.from < scope.visualFrom || edit.to > scope.visualTo;
    if (whole && crossesOwner) {
      from = Math.min(from, scope.rawFrom);
      to = Math.max(to, scope.rawTo);
      if (edit.from === scope.visualFrom) marks = marks.filter(mark => mark.type.name !== "link");
    } else if (edit.from > scope.visualFrom && edit.to > scope.visualTo) {
      suffixes.push({ at: scope.contentTo, text: raw.slice(scope.contentTo, scope.rawTo) });
    } else if (edit.from < scope.visualFrom && edit.to < scope.visualTo) {
      suffixes.push({ at: scope.rawFrom, text: raw.slice(scope.rawFrom, scope.contentFrom) });
    }
  }
  return { from, to, marks, insert: edit.insert + suffixes.sort((a,b) => a.at-b.at).map(item => item.text).join("") };
}

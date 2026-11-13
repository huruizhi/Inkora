import { setBlockType, splitBlockKeepMarks } from 'prosemirror-commands';
import { EditorState, TextSelection, type Command, type Selection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { parse } from './source-document';
import type { SourceLedger } from './source-ledger';
import { applyNativePatches, eolForLine, type NativeAnchor, type NativePatch, type NativePlan, type NativeRange, type SourcePosition } from './native-source-edit';

type Key = 'Enter' | 'Backspace';
type Operation = {
  kind: 'insert-before' | 'remove-before' | 'unformat' | 'join-before';
  transaction: Transaction;
  selections: readonly Selection[];
};
type Context = {
  source: string;
  state: EditorState;
  transaction: Transaction;
  ranges: readonly NativeRange[];
  position: SourcePosition;
  fallbackEol: '\r\n' | '\n';
  ledger?: SourceLedger;
};

/** Both keyboard and native-transaction adapters use these same operations. */
function operation(state: EditorState, key: Key): Operation | null {
  const { empty, $from } = state.selection;
  if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'heading' || $from.parentOffset !== 0) return null;
  let transaction: Transaction | undefined;
  if (key === 'Enter') {
    if (!$from.parent.content.size) return null;
    splitBlockKeepMarks(state, tr => { transaction = tr; });
    if (!transaction) return null;
    return { kind: 'insert-before', transaction, selections: [transaction.selection,
      TextSelection.create(transaction.doc, $from.before() + 1)] };
  }
  if ($from.index(0) === 0) {
    setBlockType(state.schema.nodes.paragraph)(state, tr => { transaction = tr; });
    return transaction ? { kind: 'unformat', transaction, selections: [transaction.selection] } : null;
  }
  const previous = state.doc.child($from.index(0) - 1);
  if (previous.type.name === 'paragraph' && previous.content.size === 0) {
    transaction = state.tr.delete($from.before() - previous.nodeSize, $from.before());
    transaction.setSelection(TextSelection.create(transaction.doc, $from.pos - previous.nodeSize));
    return { kind: 'remove-before', transaction, selections: [transaction.selection] };
  }
  if (!['paragraph', 'heading'].includes(previous.type.name)) return null;
  transaction = state.tr.join($from.before());
  return { kind: 'join-before', transaction, selections: [transaction.selection] };
}

function command(key: Key): Command {
  return (state, dispatch, view) => {
    if (view?.composing) return false;
    const edit = operation(state, key);
    // Preserve PM's existing layout-aware joinBackward adapter for nonempty text.
    if (!edit || edit.kind === 'join-before') return false;
    if (dispatch) dispatch(edit.transaction.scrollIntoView());
    return true;
  };
}

export const headingStartCommands: Readonly<Record<Key, Command>> = {
  Enter: command('Enter'), Backspace: command('Backspace'),
};

function sourceParts(raw: string, node: PMNode): { prefix: string; body: string; suffix: string } | null {
  if (node.attrs.style === 'atx') {
    const opening = /^( {0,3}#{1,6})(?:[\t ]+|$)/.exec(raw);
    if (!opening || opening[1].trim().length !== node.attrs.level) return null;
    const rest = raw.slice(opening[0].length), closing = /[\t ]+#+[\t ]*$/.exec(rest);
    return { prefix: opening[0], body: closing ? rest.slice(0, closing.index) : rest, suffix: closing?.[0] ?? '' };
  }
  if (node.attrs.style === 'setext') {
    const underline = /(?:\r\n|\n) {0,3}(?:=+|-+)[\t ]*$/.exec(raw);
    if (underline) return { prefix: '', body: raw.slice(0, underline.index), suffix: underline[0] };
  }
  return null;
}

/** The returned placement cannot be rebound to another accepted document/selection. */
function plan(context: Context, patches: NativePatch[], kind: NativePlan['kind'],
  sourceCaret: number, sourceBoundary?: NativeAnchor): NativePlan {
  const { doc, selection } = context.transaction;
  return {
    patches, candidate: applyNativePatches(context.source, patches), kind,
    resolvePlacement(target) {
      if (target.doc !== doc || !target.selection.eq(selection)) {
        throw Error('标题起点编辑的落点不能绑定到另一目标');
      }
      return { sourceCaret, sourceBoundary };
    },
  };
}

/** Internal native adapter. Recognition, source proof and placement stay together. */
export function planHeadingStartEdit(context: Context): NativePlan | null {
  const { source, state, transaction, ranges, position, ledger, fallbackEol } = context;
  for (const key of ['Backspace', 'Enter'] as const) {
    const edit = operation(state, key);
    if (!edit || !edit.transaction.doc.eq(transaction.doc)) continue;
    const { $from } = state.selection;
    const owner = ranges.find(range => range.kind === 'heading' && range.pos === $from.before());
    if (!owner) return null;
    const parts = sourceParts(source.slice(owner.start, owner.end), $from.parent);
    if (edit.kind !== 'insert-before' && !parts) return null;
    if (!edit.selections.some(selection => selection.eq(transaction.selection))) {
      throw Error('标题边界事务的目标选区与已证明意图不符');
    }
    if (edit.kind === 'insert-before') {
      const step = transaction.steps[0]?.toJSON();
      if (step?.stepType !== 'replace' || step.from !== step.to) return null;
      const eol = eolForLine(source, position($from.pos, 'any'), fallbackEol);
      const patches = [{ from: owner.start, to: owner.start, insert: eol + eol }];
      const caret = transaction.selection.head === $from.before() + 1
        ? owner.start : position($from.pos, 'from') + eol.length * 2;
      return plan(context, patches, 'paragraph-split', caret,
        { pmPos: $from.before() + 1, sourceOffset: owner.start, reason: '已证明标题前新空段的原文起点' });
    }
    if (!parts) return null;
    if (edit.kind === 'unformat') {
      const patches: NativePatch[] = [];
      if (parts.prefix) patches.push({ from: owner.start, to: owner.start + parts.prefix.length, insert: '' });
      if (parts.suffix) patches.push({ from: owner.end - parts.suffix.length, to: owner.end, insert: '' });
      const result = plan(context, patches, 'block-structure', owner.start);
      // Prove the source syntax change against the same operation on its parse.
      // The editable target may also contain already accepted whitespace anchors.
      const sourceEdit = operation(EditorState.create({ doc: parse(source).doc }), 'Backspace');
      return sourceEdit?.kind === 'unformat' && parse(result.candidate).doc.eq(sourceEdit.transaction.doc) ? result : null;
    }
    const previous = state.doc.child($from.index(0) - 1), previousPos = $from.before() - previous.nodeSize;
    if (edit.kind === 'remove-before') {
      // Former text carets can share this position; only the blank-line witness owns these EOLs.
      const to = owner.start;
      const anchors = ledger?.spans.filter(span => span.role === 'insertion-anchor' &&
        span.visualStart === previousPos + 1 && span.visualEnd === previousPos + 1 &&
        span.sourceStart === span.sourceEnd && span.sourceStart < to &&
        /^(?:[\t ]*(?:\r\n|\n)){1,2}$/.test(source.slice(span.sourceStart, to))) ?? [];
      const starts = [...new Set(anchors.map(span => span.sourceStart))];
      if (starts.length !== 1) throw Error('标题前空段缺少唯一的已接受原文空行依据');
      const from = starts[0];
      return plan(context, [{ from, to, insert: '' }], 'paragraph-join', position($from.pos, 'from') - (to - from));
    }
    const left = ranges.find(range => range.pos === previousPos && range.kind === previous.type.name);
    if (!left || !/^[\t \r\n]+$/.test(source.slice(left.end, owner.start))) return null;
    const leftRaw = source.slice(left.start, left.end);
    const leftParts = previous.type.name === 'heading' ? sourceParts(leftRaw, previous)
      : { prefix: '', body: leftRaw, suffix: '' };
    if (!leftParts) return null;
    const result = plan(context, [{ from: left.start, to: owner.end,
      insert: leftParts.prefix + leftParts.body + parts.body + leftParts.suffix }],
    'paragraph-join', left.start + leftParts.prefix.length + leftParts.body.length);
    return parse(result.candidate).doc.eq(transaction.doc) ? result : null;
  }
  return null;
}

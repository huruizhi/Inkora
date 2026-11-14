import { splitBlockKeepMarks } from 'prosemirror-commands';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { applyNativePatches, eolForLine, type NativePlan, type NativeRange, type SourcePosition } from './native-source-edit';

type Key = 'Enter' | 'Backspace';

// EOF paragraphs can be editable source gaps. Their text carets have source
// anchors, but the surrounding PM wrappers are not source text positions.
function operation(state: EditorState, key: Key): Transaction | null {
  const { empty, $from } = state.selection;
  if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' ||
      $from.after() !== state.doc.content.size) return null;
  if (key === 'Enter') {
    if ($from.parentOffset !== $from.parent.content.size) return null;
    let result: Transaction | null = null;
    splitBlockKeepMarks(state, tr => { result = tr; });
    return result;
  }
  if ($from.parent.content.size !== 0 || $from.index(0) === 0) return null;
  const adjacent = state.doc.child($from.index(0) - 1);
  if (adjacent.type.name === 'paragraph' && adjacent.content.size === 0) {
    const tr = state.tr.delete($from.before() - adjacent.nodeSize, $from.before());
    return tr.setSelection(TextSelection.create(tr.doc, $from.pos - adjacent.nodeSize));
  }
  if (!['paragraph', 'heading', 'bullet_list', 'ordered_list'].includes(adjacent.type.name)) return null;
  const tr = state.tr.delete($from.before(), $from.after());
  return tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size), -1));
}

function command(key: Key): Command {
  return (state, dispatch, view) => {
    if (view?.composing) return false;
    const tr = operation(state, key);
    if (!tr) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

export const emptyParagraphCommands = { Enter: command('Enter'), Backspace: command('Backspace') };

function contentEnd(source: string, owner: NativeRange): number {
  const eols = /(?:\r\n|\n)+$/.exec(source.slice(owner.start, owner.end));
  return owner.end - (eols?.[0].length ?? 0);
}

export function planEmptyParagraphEdit(source: string, state: EditorState,
  transaction: Transaction, ranges: readonly NativeRange[], position: SourcePosition,
  fallbackEol: '\r\n' | '\n'): NativePlan | null {
  for (const key of ['Backspace', 'Enter'] as const) {
    const expected = operation(state, key);
    if (!expected || !expected.doc.eq(transaction.doc)) continue;
    if (!expected.selection.eq(transaction.selection)) throw Error('文末空段落事务的目标选区与已证明意图不符');
    const { $from } = state.selection;
    let from: number, to: number, insert: string, sourceCaret: number;
    if (key === 'Enter') {
      const owner = ranges.find(range => range.pos === $from.before() && range.kind === 'paragraph');
      if ($from.parent.content.size && !owner) return null;
      from = to = $from.parent.content.size ? contentEnd(source, owner!) : position($from.pos, 'from');
      if (!/^[\r\n]*$/.test(source.slice(from))) return null;
      insert = eolForLine(source, from, fallbackEol).repeat(2);
      sourceCaret = from + insert.length;
    } else {
      to = position($from.pos, 'from');
      const separator = /(?:\r\n|\n){2}$/.exec(source.slice(0, to));
      if (!separator || !/^[\r\n]*$/.test(source.slice(to))) return null;
      from = to - separator[0].length;
      insert = '';
      const adjacent = state.doc.child($from.index(0) - 1);
      const previousEmpty = adjacent.type.name === 'paragraph' && adjacent.content.size === 0;
      sourceCaret = position(expected.selection.head, previousEmpty ? 'from' : 'to');
      if (previousEmpty) {
        if (sourceCaret !== from) return null;
      } else {
        const owner = ranges.find(range => range.pos + range.size === $from.before() &&
          range.kind === adjacent.type.name);
        if (!owner || sourceCaret < owner.start || sourceCaret > owner.end || from < contentEnd(source, owner) ||
            !/^[\r\n]*$/.test(source.slice(contentEnd(source, owner), from))) return null;
      }
    }
    const patches = [{ from, to, insert }];
    return { patches, candidate: applyNativePatches(source, patches), kind: key === 'Enter' ? 'paragraph-split' : 'paragraph-join',
      resolvePlacement: target => {
        if (target.doc !== transaction.doc || !target.selection.eq(expected.selection)) {
          throw Error('文末空段落目标文档或选区与原文计划不一致');
        }
        return { sourceCaret, sourceBoundary: { pmPos: expected.selection.head, sourceOffset: sourceCaret,
          reason: '文末空段落编辑后的已证明插入点' } };
      } };
  }
  return null;
}

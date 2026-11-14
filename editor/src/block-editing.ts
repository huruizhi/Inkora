import { headingStartCommands } from './heading-start-edit';
import {
  chainCommands,
  createParagraphNear,
  deleteSelection,
  exitCode,
  joinBackward,
  lift,
  liftEmptyBlock,
  newlineInCode,
  selectNodeBackward,
  setBlockType,
  splitBlockKeepMarks,
  wrapIn,
} from "prosemirror-commands";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from "prosemirror-schema-list";
import { Plugin, TextSelection, type Transaction, type Command } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { inkoraSchema } from "./schema";

export function setHeading(level: number): Command {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new RangeError("Heading level must be an integer from 1 through 6");
  }
  return setBlockType(inkoraSchema.nodes.heading, { level });
}

export const setParagraph: Command = setBlockType(inkoraSchema.nodes.paragraph);

export function setCodeBlock(language: string | null = null): Command {
  return setBlockType(inkoraSchema.nodes.code_block, { language });
}

export const wrapBlockquote: Command = wrapIn(inkoraSchema.nodes.blockquote);
export const liftBlock: Command = lift;
export const wrapBulletList: Command = wrapInList(inkoraSchema.nodes.bullet_list, {
  bullet: "-",
  tight: true,
});
export const wrapOrderedList: Command = wrapInList(inkoraSchema.nodes.ordered_list, {
  order: 1,
  delimiter: ".",
  tight: true,
});

export const insertHorizontalRule: Command = (state, dispatch) => {
  const rule = inkoraSchema.nodes.horizontal_rule.create();
  if (dispatch) dispatch(state.tr.replaceSelectionWith(rule).scrollIntoView());
  return true;
};

const splitTaskListItem: Command = (state, dispatch, view) => {
  const resolved = state.selection.$from;
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (node.type === inkoraSchema.nodes.list_item && node.attrs.task) {
      return splitListItem(inkoraSchema.nodes.list_item, {
        task: true,
        checked: false,
        stateChar: " ",
      })(state, dispatch, view);
    }
  }
  return false;
};

type EmptyListEnter = { doc: PMNode; head: number };
const listEnterSequences = new WeakMap<EditorView, EmptyListEnter>();

// Empty items split on the first Enter, and leave the list on the next
// consecutive Enter. Only the exact accepted document/caret can continue it.
const enterListItem: Command = (state, dispatch, view) => {
  const { $from, empty } = state.selection;
  if (view?.composing || $from.depth < 3 ||
      $from.parent.type !== inkoraSchema.nodes.paragraph ||
      $from.node(-1).type !== inkoraSchema.nodes.list_item) return false;
  const split = chainCommands(splitTaskListItem, splitListItem(inkoraSchema.nodes.list_item));
  if (!view || $from.node(-1).attrs.task) return split(state, dispatch, view);
  const last = listEnterSequences.get(view);
  const send = dispatch ? (tr: Transaction) => {
    dispatch(tr);
    const selected = view.state.selection;
    if (view.state.doc === tr.doc && selected.empty && selected.$from.depth >= 3 &&
        selected.$from.parent.type === inkoraSchema.nodes.paragraph && selected.$from.parent.content.size === 0 &&
        selected.$from.node(-1).type === inkoraSchema.nodes.list_item) {
      listEnterSequences.set(view, { doc: view.state.doc, head: selected.head });
    } else listEnterSequences.delete(view);
  } : undefined;
  const isEmpty = empty && $from.parent.content.size === 0;
  const consecutive = last?.doc === state.doc && last.head === state.selection.head;
  if (isEmpty && !consecutive && $from.index(-1) === 0 && $from.node(-1).childCount === 1) {
    const item = $from.node(-1);
    const types = [{ type: item.type, attrs: item.attrs },
      { type: $from.parent.type, attrs: $from.parent.attrs }];
    const tr = state.tr;
    try { tr.split($from.pos, 2, types); } catch { return false; }
    send?.(tr.scrollIntoView());
    return true;
  }
  if (isEmpty && consecutive) {
    return listBoundaryBackspace(state, send ? tr => send(tr.setMeta('inkoraListEnterExit', true)) : undefined, view);
  }
  return split(state, send, view);
};

const insertTabInCode: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type !== inkoraSchema.nodes.code_block) {
    return false;
  }
  if (dispatch) dispatch(state.tr.insertText("\t").scrollIntoView());
  return true;
};

export const clearEmptyHeading: Command = (state, dispatch, view) => {
  const { empty, $from } = state.selection;
  if (view?.composing || !empty || $from.depth !== 1 || $from.parent.type.name !== 'heading' ||
      $from.parent.content.size !== 0 || $from.parentOffset !== 0) return false;
  return setParagraph(state, dispatch, view);
};

export const headingBoundaryBackspace = headingStartCommands.Backspace;

// The generic joinBackward first joins list-item wrappers into a tight item
// with two paragraphs, which has no exact Markdown representation. At the
// first paragraph boundary, lift one level before continuing backward.
export const listBoundaryBackspace: Command = (state, dispatch, view) => {
  const { $from, empty } = state.selection;
  if (empty && $from.parentOffset === 0 && $from.parent.type === inkoraSchema.nodes.paragraph &&
      ($from.parent.content.size > 0 || $from.index(-1) < $from.node(-1).childCount - 1) &&
      $from.index(-1) > 0 && !view?.composing &&
      ($from.depth === 1 || $from.node(-1).type === inkoraSchema.nodes.blockquote)) {
    const previous = $from.node(-1).child($from.index(-1) - 1);
    if ((previous.type === inkoraSchema.nodes.bullet_list || previous.type === inkoraSchema.nodes.ordered_list) &&
        previous.lastChild?.childCount === 1 && previous.lastChild.firstChild?.type === inkoraSchema.nodes.paragraph) {
      if (dispatch) {
        const joinAt = $from.before() - 3;
        const tr = state.tr.delete($from.before(), $from.after()).insert(joinAt, $from.parent.content);
        const boundary = tr.mapping.map($from.after(), 1);
        const adjacent = tr.doc.resolve(boundary);
        if (adjacent.nodeBefore && adjacent.nodeAfter && adjacent.nodeBefore.sameMarkup(adjacent.nodeAfter) &&
            [inkoraSchema.nodes.bullet_list, inkoraSchema.nodes.ordered_list].includes(adjacent.nodeBefore.type)) tr.join(boundary);
        tr.setSelection(TextSelection.create(tr.doc, joinAt));
        dispatch(tr.setMeta('inkoraParagraphAfterListJoin', true));
      }
      return true;
    }
  }
  if (empty && $from.depth === 1 && $from.parent.type === inkoraSchema.nodes.paragraph &&
      $from.parent.content.size === 0 && $from.index(0) > 0 &&
      $from.after() === state.doc.content.size && !view?.composing) {
    const previous = state.doc.child($from.index(0) - 1);
    if (previous.type === inkoraSchema.nodes.bullet_list || previous.type === inkoraSchema.nodes.ordered_list) {
      if (dispatch) {
        const tr = state.tr.delete($from.before(), $from.after());
        tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size), -1));
        dispatch(tr.setMeta('inkoraEmptyParagraphAfterList', true));
      }
      return true;
    }
  }
  if (!empty || $from.parentOffset !== 0 || $from.depth < 2 ||
      $from.parent.type !== inkoraSchema.nodes.paragraph ||
      $from.node(-1).type !== inkoraSchema.nodes.list_item ||
      $from.index(-1) !== 0 || view?.composing) return false;
  const listDepth = $from.depth - 2;
  const listStart = $from.before(listDepth);
  const listEnd = $from.after(listDepth);
  return liftListItem(inkoraSchema.nodes.list_item)(state, dispatch ? tr => {
    // Lifting can split a loose list into one-item lists. A sole paragraph
    // has no blank-separated sibling/block and is canonically tight.
    tr.doc.nodesBetween(tr.mapping.map(listStart, -1), tr.mapping.map(listEnd, 1), (node, pos) => {
      if (tr.doc.resolve(pos).depth === listDepth - 1 && (node.type === inkoraSchema.nodes.bullet_list || node.type === inkoraSchema.nodes.ordered_list) &&
          node.attrs.tight === false && node.childCount === 1 && node.firstChild?.childCount === 1 &&
          node.firstChild.firstChild?.type === inkoraSchema.nodes.paragraph) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, tight: true });
      }
    });
    dispatch(tr.setMeta('inkoraListBoundaryLift', true));
  } : undefined, view);
};

export const blockKeyBindings: Record<string, Command> = {
  Enter: chainCommands(
    newlineInCode,
    enterListItem,
    headingStartCommands.Enter,
    createParagraphNear,
    liftEmptyBlock,
    splitBlockKeepMarks,
  ),
  "Mod-Enter": exitCode,
  Backspace: chainCommands(deleteSelection, headingBoundaryBackspace, clearEmptyHeading, listBoundaryBackspace, joinBackward, selectNodeBackward),
  Tab: chainCommands(
    insertTabInCode,
    sinkListItem(inkoraSchema.nodes.list_item),
  ),
  "Shift-Tab": liftListItem(inkoraSchema.nodes.list_item),
  "Mod-Alt-0": setParagraph,
  "Mod-Alt-1": setHeading(1),
  "Mod-Alt-2": setHeading(2),
  "Mod-Alt-3": setHeading(3),
  "Mod-Alt-4": setHeading(4),
  "Mod-Alt-5": setHeading(5),
  "Mod-Alt-6": setHeading(6),
  "Mod-Shift-7": wrapOrderedList,
  "Mod-Shift-8": wrapBulletList,
  "Mod-Shift-.": wrapBlockquote,
  "Mod-Alt-c": setCodeBlock(),
};

export function createBlockKeymap(): Plugin {
  const bindings = keymap(blockKeyBindings);
  const reset = (view: EditorView) => { listEnterSequences.delete(view); return false; };
  return new Plugin({
    ...bindings.spec,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey ||
            event.isComposing || view.composing) reset(view);
        return bindings.props.handleKeyDown?.call(bindings, view, event) ?? false;
      },
      handleDOMEvents: { pointerdown: reset, mousedown: reset, blur: reset, compositionstart: reset },
    },
    view: initialView => ({
      update(view) {
        const prior = listEnterSequences.get(view);
        if (prior && (prior.doc !== view.state.doc || !view.state.selection.empty || prior.head !== view.state.selection.head)) reset(view);
      },
      destroy() { reset(initialView); },
    }),
  });
}

const headingInputRule = textblockTypeInputRule(
  /^(#{1,6})\s$/,
  inkoraSchema.nodes.heading,
  (match) => ({ level: match[1].length }),
);

const blockquoteInputRule = wrappingInputRule(
  /^\s*>\s$/,
  inkoraSchema.nodes.blockquote,
);

const orderedListInputRule = wrappingInputRule(
  /^(\d+)\.\s$/,
  inkoraSchema.nodes.ordered_list,
  (match) => ({ order: Number(match[1]), delimiter: ".", tight: true }),
  (match, node) => node.childCount + node.attrs.order === Number(match[1]),
);

const bulletListInputRule = wrappingInputRule(
  /^\s*([-+*])\s$/,
  inkoraSchema.nodes.bullet_list,
  (match) => ({ bullet: match[1], tight: true }),
);

const codeBlockInputRule = textblockTypeInputRule(
  /^```([A-Za-z0-9_-]+)?\s$/,
  inkoraSchema.nodes.code_block,
  (match) => ({
    language: match[1] ?? null,
    style: "fenced",
    fence: "```",
    closed: false,
  }),
);

const horizontalRuleInputRule = new InputRule(
  /^(?:---|___|\*\*\*)$/,
  (state, _match, start, end) =>
    state.tr.replaceWith(
      start - 1,
      end,
      inkoraSchema.nodes.horizontal_rule.create(),
    ),
);

export const blockInputRules = [
  headingInputRule,
  blockquoteInputRule,
  orderedListInputRule,
  bulletListInputRule,
  codeBlockInputRule,
  horizontalRuleInputRule,
] as const;

export function createBlockInputRules(): Plugin {
  return inputRules({ rules: blockInputRules });
}

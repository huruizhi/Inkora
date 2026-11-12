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
import { TextSelection, type Command, type Plugin } from "prosemirror-state";
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

// The generic joinBackward first joins list-item wrappers into a tight item
// with two paragraphs, which has no exact Markdown representation. At the
// first paragraph boundary, lift one level before continuing backward.
export const listBoundaryBackspace: Command = (state, dispatch, view) => {
  const { $from, empty } = state.selection;
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
  return liftListItem(inkoraSchema.nodes.list_item)(state, dispatch, view);
};

export const blockKeyBindings: Record<string, Command> = {
  Enter: chainCommands(
    newlineInCode,
    splitTaskListItem,
    splitListItem(inkoraSchema.nodes.list_item),
    createParagraphNear,
    liftEmptyBlock,
    splitBlockKeepMarks,
  ),
  "Mod-Enter": exitCode,
  Backspace: chainCommands(deleteSelection, clearEmptyHeading, listBoundaryBackspace, joinBackward, selectNodeBackward),
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
  return keymap(blockKeyBindings);
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

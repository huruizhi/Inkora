import { toggleMark } from "prosemirror-commands";
import { InputRule, inputRules, undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Attrs, MarkType } from "prosemirror-model";
import type { Command, EditorState, Plugin, Transaction } from "prosemirror-state";
import { inkoraSchema } from "./schema";

export { undoInputRule };

export interface LinkAttrs {
  href: string;
  title?: string | null;
}

export type LinkRequest = (state: EditorState) => LinkAttrs | null;

export const toggleStrong: Command = toggleMark(inkoraSchema.marks.strong);
export const toggleEm: Command = toggleMark(inkoraSchema.marks.em);
export const toggleStrike: Command = toggleMark(inkoraSchema.marks.strike);
export const toggleCode: Command = toggleMark(inkoraSchema.marks.code);

function normalizedLinkAttrs(attrs: LinkAttrs): Attrs {
  if (typeof attrs.href !== "string" || attrs.href.length === 0) {
    throw new RangeError("Link href must be a non-empty string");
  }
  if (attrs.title !== undefined && attrs.title !== null && typeof attrs.title !== "string") {
    throw new RangeError("Link title must be a string or null");
  }
  return { href: attrs.href, title: attrs.title ?? null };
}

export function setLink(attrs: LinkAttrs): Command {
  const mark = inkoraSchema.marks.link.create(normalizedLinkAttrs(attrs));
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (!dispatch) return true;

    if (empty) {
      dispatch(state.tr.addStoredMark(mark));
    } else {
      dispatch(state.tr.removeMark(from, to, inkoraSchema.marks.link).addMark(from, to, mark));
    }
    return true;
  };
}

export const unsetLink: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (!dispatch) return true;

  if (empty) {
    dispatch(state.tr.removeStoredMark(inkoraSchema.marks.link));
  } else {
    dispatch(state.tr.removeMark(from, to, inkoraSchema.marks.link));
  }
  return true;
};

export function isMarkActive(state: EditorState, markType: MarkType): boolean {
  const { from, to, empty } = state.selection;
  if (empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    return marks.some((mark) => mark.type === markType);
  }
  return state.doc.rangeHasMark(from, to, markType);
}

export function inlineKeyBindings(requestLink?: LinkRequest): Record<string, Command> {
  return {
    "Mod-b": toggleStrong,
    "Mod-i": toggleEm,
    "Mod-Shift-x": toggleStrike,
    "Mod-e": toggleCode,
    "Mod-k": (state, dispatch) => {
      const attrs = requestLink?.(state);
      return attrs ? setLink(attrs)(state, dispatch) : false;
    },
    "Mod-Shift-k": unsetLink,
    Backspace: undoInputRule,
  };
}

export function createInlineKeymap(requestLink?: LinkRequest): Plugin {
  return keymap(inlineKeyBindings(requestLink));
}

function markInputRule(
  expression: RegExp,
  markType: MarkType,
  attrs?: (match: RegExpMatchArray) => Attrs,
): InputRule {
  return new InputRule(
    expression,
    (state, match, start, end): Transaction | null => {
      const markup = match[1];
      const content = match[2];
      if (!markup || content === undefined) return null;

      const markupOffset = match[0].lastIndexOf(markup);
      const markupStart = start + markupOffset;
      const mark = markType.create(attrs?.(match));
      return state.tr.replaceWith(
        markupStart,
        end,
        state.schema.text(content, [mark]),
      );
    },
    { inCodeMark: false },
  );
}

export const inlineInputRules = [
  markInputRule(/(?:^|\s)(\*\*([^*\n]+)\*\*)$/, inkoraSchema.marks.strong),
  markInputRule(/(?:^|\s)(__([^_\n]+)__)$/, inkoraSchema.marks.strong),
  markInputRule(/(?:^|\s)(~~([^~\n]+)~~)$/, inkoraSchema.marks.strike),
  markInputRule(/(?:^|\s)(`([^`\n]+)`)$/, inkoraSchema.marks.code),
  markInputRule(/(?:^|\s)(\*([^*\n]+)\*)$/, inkoraSchema.marks.em),
  markInputRule(/(?:^|\s)(_([^_\n]+)_)$/, inkoraSchema.marks.em),
  markInputRule(
    /(?:^|\s)(\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"([^"\n]*)")?\))$/,
    inkoraSchema.marks.link,
    (match) => ({ href: match[3], title: match[4] ?? null }),
  ),
] as const;

export function createInlineInputRules(): Plugin {
  return inputRules({ rules: inlineInputRules });
}

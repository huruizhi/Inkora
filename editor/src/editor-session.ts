import {
  DOMParser as ProseMirrorDOMParser,
  Fragment,
  type Node as ProseMirrorNode,
  Slice,
} from "prosemirror-model";
import {
  closeHistory,
  history,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  EditorState,
  Plugin,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  createBlockInputRules,
  createBlockKeymap,
} from "./block-editing";
import {
  createInlineInputRules,
  createInlineKeymap,
  type LinkRequest,
} from "./inline-formatting";
import { parseMarkdown } from "./markdown-codec";
import { inkoraSchema } from "./schema";

export interface EditorSessionStatus {
  revision: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  composing: boolean;
}

export interface EditorSessionSnapshot extends EditorSessionStatus {
  state: EditorState;
}

export type EditorSessionListener = (snapshot: EditorSessionSnapshot) => void;

export type PastePayload =
  | { kind: "plain_text"; text: string }
  | { kind: "markdown"; text: string }
  | { kind: "rich_html"; html: string; document: Document };

export interface EditorStateOptions {
  requestLink?: LinkRequest;
}

const historyKeymap = keymap({
  "Mod-z": undo,
  "Shift-Mod-z": redo,
  "Mod-y": redo,
});

export function createInkoraEditorState(
  document: ProseMirrorNode,
  options: EditorStateOptions = {},
): EditorState {
  return createEditorState(document, options, true);
}

export function createInkoraProjectionState(
  document: ProseMirrorNode,
  options: EditorStateOptions = {},
): EditorState {
  return createEditorState(document, options, false);
}

function createEditorState(
  document: ProseMirrorNode,
  options: EditorStateOptions,
  includeHistory: boolean,
): EditorState {
  if (document.type !== inkoraSchema.topNodeType) {
    throw new RangeError("Editor state requires a doc root");
  }
  document.check();
  return EditorState.create({
    doc: document,
    plugins: [
      ...(includeHistory ? [history(), historyKeymap] : []),
      createBlockInputRules(),
      createInlineInputRules(),
      createBlockKeymap(),
      createInlineKeymap(options.requestLink),
      createPastePlugin(),
    ],
  });
}

export class InkoraEditorSession {
  private currentState: EditorState;
  private savedDocument: ProseMirrorNode;
  private readonly listeners = new Set<EditorSessionListener>();
  private revision = 0;
  private composing = false;
  private compositionChanged = false;
  private compositionStartDocument: ProseMirrorNode | undefined;

  constructor(document: ProseMirrorNode, options: EditorStateOptions = {}) {
    this.currentState = createInkoraEditorState(document, options);
    this.savedDocument = document;
  }

  get state(): EditorState {
    return this.currentState;
  }

  get status(): EditorSessionStatus {
    return {
      revision: this.revision,
      // A save acknowledgement may arrive during a newer IME composition.
      // Report the last committed document, never its candidate-text model.
      dirty: !(this.compositionStartDocument ?? this.currentState.doc).eq(this.savedDocument),
      canUndo: undoDepth(this.currentState) > 0,
      canRedo: redoDepth(this.currentState) > 0,
      composing: this.composing,
    };
  }

  onStateChange(listener: EditorSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(transaction: Transaction): void {
    const previousDocument = this.currentState.doc;
    this.currentState = this.currentState.apply(transaction);
    if (previousDocument.eq(this.currentState.doc)) return;

    if (this.composing) {
      this.compositionChanged = true;
      return;
    }
    this.publishDocumentChange();
  }

  markSaved(document: ProseMirrorNode = this.currentState.doc): void {
    document.check();
    this.savedDocument = document;
    if (!this.composing) {
      this.currentState = this.currentState.apply(closeHistory(this.currentState.tr));
    }
    this.publishStatus();
  }

  undo(): boolean {
    if (this.composing) return false;
    return undo(this.currentState, (transaction) => this.dispatch(transaction));
  }

  redo(): boolean {
    if (this.composing) return false;
    return redo(this.currentState, (transaction) => this.dispatch(transaction));
  }

  beginComposition(): void {
    if (this.composing) return;
    this.currentState = this.currentState.apply(closeHistory(this.currentState.tr));
    this.composing = true;
    this.compositionChanged = false;
    this.compositionStartDocument = this.currentState.doc;
  }

  endComposition(): void {
    if (!this.composing) return;
    const changed =
      this.compositionChanged &&
      this.compositionStartDocument !== undefined &&
      !this.compositionStartDocument.eq(this.currentState.doc);
    this.composing = false;
    this.compositionChanged = false;
    this.compositionStartDocument = undefined;
    this.currentState = this.currentState.apply(closeHistory(this.currentState.tr));
    if (changed) this.publishDocumentChange();
  }

  private publishDocumentChange(): void {
    this.revision += 1;
    this.publishStatus();
  }

  private publishStatus(): void {
    const snapshot = { state: this.currentState, ...this.status };
    for (const listener of this.listeners) listener(snapshot);
  }
}

function textSlice(state: EditorState, text: string): Slice {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (state.selection.$from.parent.type.spec.code) {
    return new Slice(Fragment.from(inkoraSchema.text(normalized)), 0, 0);
  }

  const marks = state.selection.$from.marks();
  if (!normalized.includes("\n")) {
    return new Slice(Fragment.from(inkoraSchema.text(normalized, marks)), 0, 0);
  }
  const blocks = normalized.split("\n").map((line) =>
    inkoraSchema.nodes.paragraph.create(
      null,
      line ? inkoraSchema.text(line, marks) : undefined,
    ),
  );
  return new Slice(Fragment.fromArray(blocks), 0, 0);
}

function markdownSlice(markdown: string): Slice {
  const document = parseMarkdown(markdown);
  return new Slice(document.content, 0, 0);
}

function htmlSlice(html: string, ownerDocument: Document): Slice {
  const inertDocument = ownerDocument.implementation.createHTMLDocument("");
  inertDocument.body.innerHTML = html;
  return ProseMirrorDOMParser.fromSchema(inkoraSchema).parseSlice(
    inertDocument.body,
    { preserveWhitespace: true },
  );
}

export function createPasteTransaction(
  state: EditorState,
  payload: PastePayload,
): Transaction | null {
  const source = payload.kind === "rich_html" ? payload.html : payload.text;
  if (source.length === 0) return null;
  const slice =
    payload.kind === "plain_text"
      ? textSlice(state, payload.text)
      : payload.kind === "markdown"
        ? markdownSlice(payload.text)
        : htmlSlice(payload.html, payload.document);
  if (slice.size === 0) return null;

  const transaction = state.tr
    .replaceSelection(slice)
    .setMeta("uiEvent", "paste")
    .setMeta("inkoraSourcePaste", {
      kind: payload.kind,
      source: payload.kind === "rich_html" ? undefined : payload.text,
    })
    .scrollIntoView();
  transaction.doc.check();
  return transaction;
}

function hasClipboardType(data: DataTransfer, type: string): boolean {
  return Array.from(data.types).includes(type);
}

export function createPastePlugin(): Plugin {
  return new Plugin({
    props: {
      handlePaste(view: EditorView, event: ClipboardEvent): boolean {
        const data = event.clipboardData;
        if (!data) return false;

        let payload: PastePayload;
        if (hasClipboardType(data, "text/markdown")) {
          payload = { kind: "markdown", text: data.getData("text/markdown") };
        } else if (hasClipboardType(data, "text/html")) {
          payload = {
            kind: "rich_html",
            html: data.getData("text/html"),
            document: view.dom.ownerDocument,
          };
        } else {
          payload = { kind: "plain_text", text: data.getData("text/plain") };
        }

        try {
          const transaction = createPasteTransaction(view.state, payload);
          if (!transaction) return false;
          event.preventDefault();
          view.dispatch(transaction);
          return true;
        } catch {
          return false;
        }
      },
    },
  });
}

import { EditorView } from "prosemirror-view";
import { InkoraEditorSession } from "./editor-session";
import { TextAreaEditorKernel } from "./editor-kernel";
import { parseMarkdown, serializeMarkdown } from "./markdown-codec";
import { analyzeMarkdownSafety } from "./markdown-safety";

export interface EditorRuntimeStatus {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorRuntime {
  readonly status: EditorRuntimeStatus;
  getText(): string;
  markSaved(text: string): void;
  undo(): boolean;
  redo(): boolean;
  focus(): void;
  destroy(): void;
}

export type RuntimeChangeListener = (status: EditorRuntimeStatus) => void;

class StructuredEditorRuntime implements EditorRuntime {
  private readonly session: InkoraEditorSession;
  private readonly view: EditorView;
  private compositionTimer: number | undefined;

  constructor(
    parent: HTMLElement,
    private savedText: string,
    onChange: RuntimeChangeListener,
  ) {
    this.session = new InkoraEditorSession(parseMarkdown(savedText));
    let view: EditorView;
    view = new EditorView(parent, {
      state: this.session.state,
      dispatchTransaction: (transaction) => {
        this.session.dispatch(transaction);
        view.updateState(this.session.state);
      },
    });
    this.view = view;
    this.view.dom.id = "editor";
    this.view.dom.setAttribute("aria-label", "Markdown editor");
    this.view.dom.addEventListener("compositionstart", this.handleCompositionStart);
    this.view.dom.addEventListener("compositionend", this.handleCompositionEnd);
    this.session.onStateChange(() => onChange(this.status));
  }

  get status(): EditorRuntimeStatus {
    const { dirty, canUndo, canRedo } = this.session.status;
    return { dirty, canUndo, canRedo };
  }

  getText(): string {
    if (!this.status.dirty) {
      return this.savedText;
    }
    const output = serializeMarkdown(this.session.state.doc);
    // EOL-004: the presence of a final newline is document state; restore it
    // when the serializer's LF-only output dropped it.
    if (this.savedText.endsWith("\n") && !output.endsWith("\n")) {
      return `${output}\n`;
    }
    return output;
  }

  markSaved(text: string): void {
    this.savedText = text;
    this.session.markSaved(parseMarkdown(text));
    this.view.updateState(this.session.state);
  }

  undo(): boolean {
    const applied = this.session.undo();
    if (applied) this.view.updateState(this.session.state);
    return applied;
  }

  redo(): boolean {
    const applied = this.session.redo();
    if (applied) this.view.updateState(this.session.state);
    return applied;
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
    this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
    this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
    this.view.destroy();
  }

  private readonly handleCompositionStart = (): void => {
    if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
    this.compositionTimer = undefined;
    this.session.beginComposition();
  };

  private readonly handleCompositionEnd = (): void => {
    if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
    this.compositionTimer = window.setTimeout(() => {
      this.compositionTimer = undefined;
      this.session.endComposition();
      this.view.updateState(this.session.state);
    }, 0);
  };
}

class SourceEditorRuntime implements EditorRuntime {
  private readonly textArea: HTMLTextAreaElement;
  private readonly kernel: TextAreaEditorKernel;
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];
  private currentText: string;

  constructor(
    parent: HTMLElement,
    private savedText: string,
    private readonly onChange: RuntimeChangeListener,
  ) {
    this.textArea = document.createElement("textarea");
    this.textArea.id = "editor";
    this.textArea.autocapitalize = "off";
    this.textArea.autocomplete = "off";
    this.textArea.spellcheck = false;
    this.textArea.setAttribute("aria-label", "Markdown source editor");
    parent.append(this.textArea);
    this.kernel = new TextAreaEditorKernel(this.textArea);
    this.kernel.setText(savedText);
    this.currentText = savedText;
    this.kernel.onChange((text) => {
      this.undoStack.push(this.currentText);
      this.redoStack.length = 0;
      this.currentText = text;
      this.onChange(this.status);
    });
  }

  get status(): EditorRuntimeStatus {
    return {
      dirty: this.currentText !== this.savedText,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  getText(): string {
    return this.currentText;
  }

  markSaved(text: string): void {
    this.savedText = text;
    this.onChange(this.status);
  }

  undo(): boolean {
    if (this.kernel.composing) return false;
    const previous = this.undoStack.pop();
    if (previous === undefined) return false;
    this.redoStack.push(this.currentText);
    this.replaceText(previous);
    return true;
  }

  redo(): boolean {
    if (this.kernel.composing) return false;
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(this.currentText);
    this.replaceText(next);
    return true;
  }

  focus(): void {
    this.kernel.focus();
  }

  destroy(): void {
    this.textArea.remove();
  }

  private replaceText(text: string): void {
    this.currentText = text;
    this.kernel.setText(text);
    this.onChange(this.status);
  }
}

export function createEditorRuntime(
  parent: HTMLElement,
  text: string,
  onChange: RuntimeChangeListener,
): EditorRuntime {
  parent.replaceChildren();
  // EOL-001/EOL-003: the structured serializer emits LF only, so documents
  // containing any CR stay in source mode where the kernel preserves every
  // original line boundary.
  if (!text.includes("\r") && analyzeMarkdownSafety(text).structuredSaveAllowed) {
    try {
      return new StructuredEditorRuntime(parent, text, onChange);
    } catch {
      parent.replaceChildren();
    }
  }
  return new SourceEditorRuntime(parent, text, onChange);
}

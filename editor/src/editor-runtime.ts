import { parseProtectedMarkdown } from "./protected-markdown";
import { EditorView } from "prosemirror-view";
import { InkoraEditorSession } from "./editor-session";
import { TextAreaEditorKernel } from "./editor-kernel";
import { parseMarkdown, serializeMarkdown } from "./markdown-codec";
import { classifyLineEndings, structuredInput, structuredOutput, type LineEndings } from "./line-endings";
import { analyzeMarkdownSafety } from "./markdown-safety";
import { TextSelection } from "prosemirror-state";
import { analyzeDocument } from "./document-analysis";
import {
  rawOffsetToTextareaOffset,
  sameHeading,
  textareaProjection,
  type HeadingNavigationResult,
  type HeadingNavigationTarget,
} from "./heading-navigation";

export interface EditorRuntimeStatus {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorRuntime {
  readonly status: EditorRuntimeStatus;
  getText(): string;
  readonly composing: boolean;
  markSaved(text: string): void;
  undo(): boolean;
  redo(): boolean;
  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult;
  focus(): void;
  destroy(): void;
}

export type RuntimeChangeListener = (status: EditorRuntimeStatus) => void;

class StructuredEditorRuntime implements EditorRuntime {
  private readonly session: InkoraEditorSession;
  private readonly view: EditorView;
  private compositionTimer: number | undefined;
  private readonly lineEndings: LineEndings;

  constructor(
    parent: HTMLElement,
    private savedText: string,
    onChange: RuntimeChangeListener,
    private readonly protectedMode = false,
  ) {
    this.lineEndings = classifyLineEndings(savedText);
    this.session = new InkoraEditorSession(this.parse(savedText));
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

  private parse(text: string) {
    const input = structuredInput(text);
    return (this.protectedMode ? parseProtectedMarkdown(input) : null) ?? parseMarkdown(input);
  }

  get composing(): boolean {
    return this.session.status.composing;
  }

  get status(): EditorRuntimeStatus {
    const { dirty, canUndo, canRedo } = this.session.status;
    return { dirty, canUndo, canRedo };
  }

  getText(): string {
    if (!this.status.dirty) {
      return this.savedText;
    }
    return structuredOutput(serializeMarkdown(this.session.state.doc), this.savedText, this.lineEndings);
  }

  markSaved(text: string): void {
    this.savedText = text;
    this.session.markSaved(this.parse(text));
    if (!this.composing) this.view.updateState(this.session.state);
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

  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult {
    if (this.composing) return { ok: false, message: "请先完成中文输入，再定位标题" };
    if (this.getText() !== raw) return { ok: false, message: "文档已变化，请等待大纲刷新" };

    const analyzed = analyzeDocument({ raw, revision: 0 }).headings;
    if (!sameHeading(analyzed[target.index], target)) {
      return { ok: false, message: "大纲快照已过期，无法定位标题" };
    }

    const headings: Array<{ level: number; text: string; position: number }> = [];
    this.session.state.doc.descendants((node, position) => {
      if (node.type.name === "heading") {
        headings.push({ level: Number(node.attrs.level), text: node.textContent, position });
      }
    });
    if (headings.length !== analyzed.length || headings.some((heading, index) =>
      heading.level !== analyzed[index]?.level || heading.text !== analyzed[index]?.text
    )) {
      return { ok: false, message: "当前编辑视图与原文大纲不一致，无法安全定位" };
    }
    const heading = headings[target.index];
    if (!heading) return { ok: false, message: "目标标题不存在" };
    const transaction = this.session.state.tr
      .setSelection(TextSelection.create(this.session.state.doc, heading.position + 1))
      .setMeta("addToHistory", false)
      .scrollIntoView();
    this.session.dispatch(transaction);
    this.view.updateState(this.session.state);
    this.view.focus();
    return { ok: true };
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

  get composing(): boolean {
    return this.kernel.composing;
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

  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult {
    if (this.composing) return { ok: false, message: "请先完成中文输入，再定位标题" };
    if (this.getText() !== raw) return { ok: false, message: "文档已变化，请等待大纲刷新" };
    const analyzed = analyzeDocument({ raw, revision: 0 }).headings;
    if (!sameHeading(analyzed[target.index], target)) {
      return { ok: false, message: "大纲快照已过期，无法定位标题" };
    }
    if (this.textArea.value !== textareaProjection(raw)) {
      return { ok: false, message: "原文与源码编辑器映射不一致，无法安全定位" };
    }
    const offset = rawOffsetToTextareaOffset(raw, target.start);
    if (offset === undefined || offset > this.textArea.value.length) {
      return { ok: false, message: "标题原文范围无效，无法定位" };
    }
    this.textArea.focus();
    this.textArea.setSelectionRange(offset, offset);
    return { ok: true };
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

// EOL-003: keep exact bytes independent of textarea's LF normalization.
class ReadOnlyEditorRuntime implements EditorRuntime {
  private readonly textArea: HTMLTextAreaElement;
  readonly status = { dirty: false, canUndo: false, canRedo: false };
  readonly composing = false;

  constructor(parent: HTMLElement, private readonly text: string) {
    this.textArea = document.createElement("textarea");
    this.textArea.id = "editor";
    this.textArea.readOnly = true;
    this.textArea.setAttribute("aria-label", "Markdown source (read only: bare CR)");
    this.textArea.value = text;
    parent.append(this.textArea);
  }

  getText(): string { return this.text; }
  markSaved(_text: string): void {}
  undo(): boolean { return false; }
  redo(): boolean { return false; }
  navigateToHeading(raw: string, target: HeadingNavigationTarget): HeadingNavigationResult {
    if (this.text !== raw) return { ok: false, message: "文档已变化，请等待大纲刷新" };
    const analyzed = analyzeDocument({ raw, revision: 0 }).headings;
    if (!sameHeading(analyzed[target.index], target) || this.textArea.value !== textareaProjection(raw)) {
      return { ok: false, message: "原文与只读视图映射不一致，无法安全定位" };
    }
    const offset = rawOffsetToTextareaOffset(raw, target.start);
    if (offset === undefined || offset > this.textArea.value.length) {
      return { ok: false, message: "标题原文范围无效，无法定位" };
    }
    this.textArea.focus();
    this.textArea.setSelectionRange(offset, offset);
    return { ok: true };
  }
  focus(): void { this.textArea.focus(); }
  destroy(): void { this.textArea.remove(); }
}

export function createEditorRuntime(
  parent: HTMLElement,
  text: string,
  onChange: RuntimeChangeListener,
): EditorRuntime {
  parent.replaceChildren();
  const endings = classifyLineEndings(text);
  if (endings === "bare_cr") return new ReadOnlyEditorRuntime(parent, text);
  const input = structuredInput(text);
  if (endings !== "mixed" &&
      analyzeMarkdownSafety(input).structuredSaveAllowed) {
    try {
      // CRLF support must not introduce unrelated codec normalization diffs.
      if (endings === "crlf" &&
          structuredOutput(serializeMarkdown(parseMarkdown(input)), text) !== text) {
        return new SourceEditorRuntime(parent, text, onChange);
      }
      return new StructuredEditorRuntime(parent, text, onChange);
    } catch {
      parent.replaceChildren();
    }
  }
  if (endings !== "mixed") {
    try {
      const protectedDocument = parseProtectedMarkdown(input);
      if (protectedDocument) {
        if (endings === "crlf" &&
            structuredOutput(serializeMarkdown(protectedDocument), text) !== text) {
          return new SourceEditorRuntime(parent, text, onChange);
        }
        return new StructuredEditorRuntime(parent, text, onChange, true);
      }
    } catch {
      parent.replaceChildren();
    }
  }
  return new SourceEditorRuntime(parent, text, onChange);
}

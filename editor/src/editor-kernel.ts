export interface EditorKernel {
  setText(text: string): void;
  getText(): string;
  onChange(listener: (text: string) => void): () => void;
  focus(): void;
}

export class TextAreaEditorKernel implements EditorKernel {
  private readonly listeners = new Set<(text: string) => void>();
  private lastNotifiedText: string;
  private isComposing = false;
  private originalText: string | undefined;
  private lineEndings: string[] = [];
  private defaultLineEnding = "\n";
  private hasUserChanges = false;

  constructor(private readonly textArea: HTMLTextAreaElement) {
    this.lastNotifiedText = textArea.value;
    textArea.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });
    textArea.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.notifyIfChanged();
    });
    textArea.addEventListener("input", () => {
      if (!this.isComposing) {
        this.notifyIfChanged();
      }
    });
  }

  get composing(): boolean {
    return this.isComposing;
  }

  setText(text: string): void {
    this.originalText = text;
    this.lineEndings = text.match(/\r\n|\r|\n/g) ?? [];
    this.defaultLineEnding = this.lineEndings[0] ?? "\n";
    this.hasUserChanges = false;
    this.textArea.value = text;
    this.lastNotifiedText = this.textArea.value;
  }

  getText(): string {
    if (!this.hasUserChanges && this.originalText !== undefined) {
      return this.originalText;
    }
    const lines = this.textArea.value.split("\n");
    return lines
      .map((line, index) => {
        if (index === lines.length - 1) {
          return line;
        }
        return line + (this.lineEndings[index] ?? this.defaultLineEnding);
      })
      .join("");
  }

  onChange(listener: (text: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  focus(): void {
    this.textArea.focus();
  }

  private notifyIfChanged(): void {
    const normalizedText = this.textArea.value;
    if (normalizedText === this.lastNotifiedText) {
      return;
    }

    this.updateLineEndings(this.lastNotifiedText, normalizedText);
    this.lastNotifiedText = normalizedText;
    this.hasUserChanges = true;
    const text = this.getText();
    for (const listener of this.listeners) {
      listener(text);
    }
  }

  private updateLineEndings(previousText: string, nextText: string): void {
    let prefixLength = 0;
    while (
      prefixLength < previousText.length &&
      prefixLength < nextText.length &&
      previousText[prefixLength] === nextText[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < previousText.length - prefixLength &&
      suffixLength < nextText.length - prefixLength &&
      previousText[previousText.length - suffixLength - 1] ===
        nextText[nextText.length - suffixLength - 1]
    ) {
      suffixLength += 1;
    }

    const previousChangeEnd = previousText.length - suffixLength;
    const nextChangeEnd = nextText.length - suffixLength;
    const preservedPrefixCount = countNewlines(
      previousText.slice(0, prefixLength),
    );
    const preservedSuffixStart = countNewlines(
      previousText.slice(0, previousChangeEnd),
    );
    const insertedCount = countNewlines(
      nextText.slice(prefixLength, nextChangeEnd),
    );

    this.lineEndings = [
      ...this.lineEndings.slice(0, preservedPrefixCount),
      ...Array<string>(insertedCount).fill(
        this.insertedLineEnding(previousText, prefixLength),
      ),
      ...this.lineEndings.slice(preservedSuffixStart),
    ];
  }

  // EOL-002: an inserted newline inherits the ending of the line the caret is
  // on, falling back to the nearest previous line, the document's first
  // ending, and finally LF.
  private insertedLineEnding(previousText: string, insertionOffset: number): string {
    const line = countNewlines(previousText.slice(0, insertionOffset));
    const afterBoundary =
      insertionOffset > 0 && previousText[insertionOffset - 1] === "\n";
    const current = afterBoundary
      ? this.lineEndings[line - 1]
      : this.lineEndings[line];
    return current ?? this.lineEndings[line - 1] ?? this.defaultLineEnding;
  }
}

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}

import { describe, expect, it } from "vitest";

import { TextAreaEditorKernel } from "./editor-kernel";

class NormalizingTextArea extends EventTarget {
  private storedValue = "";

  get value(): string {
    return this.storedValue;
  }

  set value(value: string) {
    this.storedValue = value.replace(/\r\n?/g, "\n");
  }

  focus(): void {}
}

describe("textarea editor kernel", () => {
  it("returns the original line endings when the user made no changes", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    const original = "first\r\nsecond\r\n";

    kernel.setText(original);

    expect(kernel.getText()).toBe(original);
  });

  it("preserves CRLF line endings after an input event", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    kernel.setText("first\r\nsecond\r\n");

    textArea.value = "first\nchanged\n";
    textArea.dispatchEvent(new Event("input"));

    expect(kernel.getText()).toBe("first\r\nchanged\r\n");
  });

  it("keeps LF line endings after an input event", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    kernel.setText("first\nsecond\n");

    textArea.value = "first\nchanged\n";
    textArea.dispatchEvent(new Event("input"));

    expect(kernel.getText()).toBe("first\nchanged\n");
  });

  it("keeps mixed line endings aligned when lines are inserted and removed", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    const original = "first\r\nsecond\nthird\r\nfourth";
    kernel.setText(original);

    textArea.value = "first\ninserted\nsecond\nthird\nfourth";
    textArea.dispatchEvent(new Event("input"));
    expect(kernel.getText()).toBe(
      "first\r\ninserted\r\nsecond\nthird\r\nfourth",
    );

    textArea.value = "first\nsecond\nthird\nfourth";
    textArea.dispatchEvent(new Event("input"));
    expect(kernel.getText()).toBe(original);
  });

  it("inherits the current line's ending for inserted newlines in mixed files", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    kernel.setText("crlf line\r\nlf line\n");

    // Splitting the LF line yields an LF boundary, not the document default.
    textArea.value = "crlf line\nlf\nline\n";
    textArea.dispatchEvent(new Event("input"));
    expect(kernel.getText()).toBe("crlf line\r\nlf\nline\n");

    // Splitting the CRLF line yields a CRLF boundary.
    textArea.value = "crlf\nline\nlf\nline\n";
    textArea.dispatchEvent(new Event("input"));
    expect(kernel.getText()).toBe("crlf\r\nline\r\nlf\nline\n");
  });

  it("inserts a boundary at the end of a file without a final newline", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    kernel.setText("only line\r\ntrailing");

    textArea.value = "only line\ntrailing\nadded";
    textArea.dispatchEvent(new Event("input"));

    // EOL-002: the last line has no ending, so inherit the nearest previous one.
    expect(kernel.getText()).toBe("only line\r\ntrailing\r\nadded");
  });

  it("uses LF for the first newline of an empty document", () => {
    const textArea = new NormalizingTextArea();
    const kernel = new TextAreaEditorKernel(
      textArea as unknown as HTMLTextAreaElement,
    );
    kernel.setText("");

    textArea.value = "first\n";
    textArea.dispatchEvent(new Event("input"));

    expect(kernel.getText()).toBe("first\n");
  });
});

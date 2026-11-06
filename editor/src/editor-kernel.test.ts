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
});

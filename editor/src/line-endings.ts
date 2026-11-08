export type LineEndings = "lf" | "crlf" | "mixed" | "bare_cr";

export function classifyLineEndings(text: string): LineEndings {
  if (/\r(?!\n)/.test(text)) return "bare_cr";
  if (!text.includes("\r\n")) return "lf";
  return text.replace(/\r\n/g, "").includes("\n") ? "mixed" : "crlf";
}

// Only called on the structured path; source buffers retain every boundary.
export function structuredInput(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function structuredOutput(
  output: string,
  baseline: string,
  endings: LineEndings = classifyLineEndings(baseline),
): string {
  if (endings === "crlf") {
    // Preserve all trailing boundaries, including trailing blank lines. Convert
    // the entire output so fenced code and future opaque nodes cannot leak LF.
    const trailingCount = (baseline.match(/(?:\r\n)+$/)?.[0].length ?? 0) / 2;
    const outputTrailingCount = output.match(/\n+$/)?.[0].length ?? 0;
    return output.replace(/\n/g, "\r\n") +
      "\r\n".repeat(Math.max(0, trailingCount - outputTrailingCount));
  }
  return baseline.endsWith("\n") && !output.endsWith("\n") ? `${output}\n` : output;
}

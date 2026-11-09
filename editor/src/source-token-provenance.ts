import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

// Capture the container prefix while markdown-it's block parser still has its
// list/quote indentation context. Restored physical lines cannot reconstruct
// that context by looking for the first occurrence of token.content.
type ContainerBlockState = {
  src: string;
  tokens: Token[];
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  bsCount: number[];
  blkIndent: number;
};
type ContainerBlockRule = (state: ContainerBlockState, start: number, end: number, silent: boolean) => boolean;
type ContainerBlockRuler = {
  __rules__?: Array<{ name: string; fn: ContainerBlockRule; alt: string[] }>;
  at(name: string, fn: ContainerBlockRule, options: { alt: string[] }): void;
};

export function installContainerProvenance(markdown: MarkdownIt): void {
  const containerRuler = markdown.block.ruler as unknown as ContainerBlockRuler;
  for (const name of ['paragraph', 'fence', 'code']) {
    const entry = containerRuler.__rules__?.find(rule => rule.name === name);
    if (!entry) throw Error(`markdown-it ${name} block rule unavailable`);
    const original = entry.fn;
    containerRuler.at(name, (state, start, end, silent) => {
      const before = state.tokens.length;
      const accepted = original(state, start, end, silent);
      if (!accepted || silent) return accepted;
      for (const token of state.tokens.slice(before)) {
        if (!token.map || !['inline', 'fence', 'code_block'].includes(token.type)) continue;
        const columns: number[] = [];
        for (let line = token.map[0]; line < token.map[1]; line++) {
          const lineStart = state.bMarks[line];
          let first = lineStart;
          let indent = 0;
          while (first < state.eMarks[line] && indent < state.blkIndent) {
            const char = state.src[first];
            if (char === '\t') indent += 4 - (indent + state.bsCount[line]) % 4;
            else if (char === ' ' || first - lineStart < state.tShift[line]) indent++;
            else break;
            first++;
          }
          // A partial tab expansion has no one-to-one raw character boundary.
          // Preserve the existing explicit refusal instead of inventing spaces.
          if (indent > state.blkIndent) {
            columns.push(-1);
          } else {
            const physicalStart = state.src.lastIndexOf('\n', Math.max(0, lineStart - 1)) + 1;
            columns.push(first - physicalStart);
          }
        }
        token.meta = { ...token.meta, inkoraContainerColumns: columns };
      }
      return accepted;
    }, { alt: entry.alt });
  }
}

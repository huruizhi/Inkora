import { afterAll, describe, it } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { parseMarkdown, serializeMarkdown } from "../../src/markdown-codec";
import {
  createInkoraEditorState,
  InkoraEditorSession,
} from "../../src/editor-session";
import {
  measureMilliseconds,
  measurePerIteration,
  mulberry32,
  recordMetric,
  writeResults,
} from "./harness";
import { loadSample } from "./samples";

// Deterministic typing workload: 200 single-character insert transactions per
// sample, positions drawn from a fixed PRNG seed so every run edits the same
// offsets of the same document. The dispatch path also covers the per-change
// dirty check (document.eq) and status publication.
const TYPING_TRANSACTIONS = 200;
const TYPING_SEED = 0x23;

describe("editor performance baseline", () => {
  const documents = new Map<string, ProseMirrorNode>();

  it("parses markdown samples", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const sample = loadSample(size);
      const batch = size === "small" ? 5 : 1;
      const result = measurePerIteration(batch, () => {
        for (let index = 0; index < batch; index += 1) {
          parseMarkdown(sample.text);
        }
      });
      documents.set(size, parseMarkdown(sample.text));
      recordMetric(`parse/${size}`, result);
    }
  });

  it("serializes markdown documents", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const document = documents.get(size);
      if (!document) throw new Error(`missing parsed document: ${size}`);
      const batch = size === "small" ? 5 : 1;
      const result = measurePerIteration(batch, () => {
        for (let index = 0; index < batch; index += 1) {
          serializeMarkdown(document);
        }
      });
      recordMetric(`serialize/${size}`, result);
    }
  });

  it("creates editor state with plugins", () => {
    for (const size of ["medium", "large"] as const) {
      const document = documents.get(size);
      if (!document) throw new Error(`missing parsed document: ${size}`);
      const result = measurePerIteration(10, () => {
        for (let index = 0; index < 10; index += 1) {
          createInkoraEditorState(document);
        }
      });
      recordMetric(`state-create/${size}`, result);
    }
  });

  it("applies typing transactions and snapshots the result", () => {
    for (const size of ["medium", "large"] as const) {
      const document = documents.get(size);
      if (!document) throw new Error(`missing parsed document: ${size}`);
      const session = new InkoraEditorSession(document);

      const rng = mulberry32(TYPING_SEED);
      const positions = Array.from({ length: TYPING_TRANSACTIONS }, () => {
        const bound = Math.max(1, document.content.size - 2);
        return 1 + Math.floor(rng() * bound);
      });
      const typing = measurePerIteration(
        TYPING_TRANSACTIONS,
        () => {
          for (const position of positions) {
            session.dispatch(session.state.tr.insertText("字", position));
          }
        },
        { samples: 9 },
      );
      recordMetric(`input-typing/${size}`, typing);

      // Mirrors StructuredEditorRuntime.getText on a dirty document: full
      // markdown serialization of the current ProseMirror document.
      const snapshot = measureMilliseconds(() => {
        serializeMarkdown(session.state.doc);
      });
      recordMetric(`snapshot-serialize/${size}`, snapshot);

      // Dirty-check cost (document.eq) is covered by input-typing above: every
      // dispatch publishes status, which compares against the saved document.
    }
  }, 600_000);

  afterAll(() => {
    writeResults("editor", "editor.json");
  });
});

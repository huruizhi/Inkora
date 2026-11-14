import type { EditorState } from 'prosemirror-state';

export type NativePlacement = {
  readonly sourceCaret: number;
  /** A new insertion point owned by this edit, replacing former aliases there. */
  readonly sourceBoundary?: NativeAnchor;
};

export type NativeRange = { start: number; end: number; pos: number; size: number; kind: string };
export type NativePatch = { from: number; to: number; insert: string };
export type NativeAnchor = { pmPos: number; sourceOffset: number; reason?: string };

export type NativePlan = {
  patches: NativePatch[];
  candidate: string;
  kind: 'text' | 'empty-text' | 'paste' | 'inline-code' | 'inline-mark' | 'image-attrs' | 'block-structure' | 'table-text' | 'table-structure' | 'task-toggle' | 'projection-sync' | 'heading-level' | 'fence-language' | 'paragraph-split' | 'paragraph-join' | 'list-split' | 'list-join' | 'code-exit';
  /** A Markdown source cannot represent a newly-created empty paragraph. */
  mayStage?: boolean;
} & ({
  /** Legacy planners supply their existing source placement. */
  sourceCaret?: number;
  sourceBoundary?: NativeAnchor;
  resolvePlacement?: never;
} | {
  /** Scoped contracts bind placement to the exact applied target. */
  resolvePlacement: (target: EditorState) => NativePlacement;
  sourceCaret?: never;
  sourceBoundary?: never;
});

export type LegacyNativePlan = NativePlan & { resolvePlacement?: never };

export type SourcePosition = (position: number, side?: 'from' | 'to' | 'any') => number;

export function applyNativePatches(source: string, patches: readonly NativePatch[]): string {
  let candidate = source;
  for (const patch of [...patches].sort((a, b) => b.from - a.from)) {
    if (patch.from < 0 || patch.to < patch.from || patch.to > candidate.length) throw Error('原文补丁范围无效');
    candidate = candidate.slice(0, patch.from) + patch.insert + candidate.slice(patch.to);
  }
  return candidate;
}

export function eolForLine(
  source: string,
  offset: number,
  fallback: '\r\n' | '\n' = '\n',
): '\r\n' | '\n' {
  const after = source.slice(offset).match(/\r\n|\n/);
  if (after) return after[0] as '\r\n' | '\n';
  const before = source.slice(0, offset).match(/(?:\r\n|\n)(?![\s\S]*(?:\r\n|\n))/);
  return (before?.[0] ?? fallback) as '\r\n' | '\n';
}

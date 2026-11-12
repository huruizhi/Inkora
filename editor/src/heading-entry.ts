import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Decoration } from 'prosemirror-view';

interface HeadingEntry {
  pos: number;
  sourceStart: number;
  marker: string;
  ready: boolean;
}

/** Local appearance only: canonical headings and their source/history stay untouched. */
export class HeadingEntryPresentation {
  private entries = new WeakMap<PMNode, HeadingEntry>();

  clear(): void { this.entries = new WeakMap(); }

  private read(state: EditorState, raw: string, pos: number, sourceStart: number): HeadingEntry | undefined {
    const node = state.doc.nodeAt(pos);
    if (node?.type.name !== 'heading' || node.attrs.style !== 'atx' || state.doc.resolve(pos).depth !== 0) return;
    const prefix = /^(#{1,6})([\t ]+|(?=\r?\n|$))/.exec(raw.slice(sourceStart));
    if (!prefix || prefix[1].length !== node.attrs.level) return;
    return { pos, sourceStart, marker: prefix[0], ready: !!prefix[2] };
  }

  advance(before: EditorState, after: EditorState, beforeRaw: string, raw: string,
    sourceAnchor: number, transaction: Transaction, composing: boolean): void {
    if (!transaction.docChanged || transaction.before !== before.doc || beforeRaw === raw) return;
    const step = transaction.steps.length === 1 ? transaction.steps[0].toJSON() as {
      stepType?: string; from?: number; to?: number;
      slice?: { content?: Array<{ type?: string; text?: string }> };
    } : undefined;
    const text = step?.slice?.content ?? [];
    const plain = step?.stepType === 'replace' && step.from !== undefined && step.to !== undefined &&
      text.every(node => node.type === 'text' && typeof node.text === 'string' && !/[\r\n]/.test(node.text)) &&
      transaction.getMeta('paste') !== true && transaction.getMeta('uiEvent') !== 'paste';
    if (!plain) return; // Enter/format/paste ends entry; no content transaction is invented.

    const prior = this.entries.get(before.doc);
    if (prior) {
      const owner = before.doc.nodeAt(prior.pos);
      if (owner?.type.name !== 'heading' ||
          beforeRaw.slice(prior.sourceStart, prior.sourceStart + prior.marker.length) !== prior.marker ||
          step.from! < prior.pos + 1 || step.to! > prior.pos + owner.nodeSize - 1) return;
      const next = this.read(after, raw, prior.pos, prior.sourceStart);
      if (next) this.entries.set(after.doc, next);
      else if (composing && !prior.ready && after.doc.nodeAt(prior.pos)?.type.name === 'heading') {
        // A bare-hash IME candidate temporarily keeps its original H1 owner.
        // Only appearance follows that owner; settlement may canonicalize it to a paragraph.
        this.entries.set(after.doc, prior);
      }
      return;
    }

    const { $from, empty } = before.selection;
    if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size ||
        step.from !== before.selection.from || step.to !== before.selection.to ||
        !/^#{1,6}[\t ]*$/.test(text.map(node => node.text).join(''))) return;
    const next = this.read(after, raw, $from.before(), sourceAnchor);
    if (next) this.entries.set(after.doc, next);
  }

  canonicalized(before: EditorState, after: EditorState, raw: string): void {
    const prior = this.entries.get(before.doc);
    if (!prior || !before.doc.eq(after.doc)) return;
    const next = this.read(after, raw, prior.pos, prior.sourceStart);
    if (next) this.entries.set(after.doc, next);
  }

  decorations(state: EditorState): Decoration[] {
    const entry = this.entries.get(state.doc);
    const owner = entry && state.doc.nodeAt(entry.pos);
    if (!entry || owner?.type.name !== 'heading') return [];
    return [Decoration.node(entry.pos, entry.pos + owner.nodeSize, {
      class: `inkora-heading-entry${entry.ready ? ' inkora-heading-entry-ready' : ''}`,
      'data-heading-entry-marker': entry.marker,
    })];
  }
}

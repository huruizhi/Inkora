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

  capture(before: EditorState, beforeRaw: string, sourceAnchor: number, transaction: Transaction):
    ((after: EditorState, raw: string, composing: boolean) => void) | undefined {
    if (!transaction.docChanged || transaction.before !== before.doc) return;
    const step = transaction.steps.length === 1 ? transaction.steps[0].toJSON() as {
      stepType?: string; from?: number; to?: number;
      slice?: { content?: Array<{ type?: string; text?: string }> };
    } : undefined;
    const text = step?.slice?.content ?? [];
    const plain = step?.stepType === 'replace' && step.from !== undefined && step.to !== undefined &&
      text.every(node => node.type === 'text' && typeof node.text === 'string' && !/[\r\n]/.test(node.text)) &&
      transaction.getMeta('paste') !== true && transaction.getMeta('uiEvent') !== 'paste';
    const prior = this.entries.get(before.doc);
    if (!plain && !prior) return; // Only a genuine text entry can start this display state.

    // Source acceptance may append its own mark-removal steps to this mutable
    // transaction. Capture the original user edit before those safety steps.
    return (after, raw, composing) => {
      if (beforeRaw === raw) return;
      if (prior) {
        const owner = before.doc.nodeAt(prior.pos);
        if (owner?.type.name !== 'heading' ||
            beforeRaw.slice(prior.sourceStart, prior.sourceStart + prior.marker.length) !== prior.marker) return;
        if (plain) {
          if (step!.from! < prior.pos + 1 || step!.to! > prior.pos + owner.nodeSize - 1) return;
        } else {
          // Inline formatting is still editing this line. A split, block-format
          // change, sibling edit or moved source prefix cannot inherit its appearance.
          const index = before.doc.resolve(prior.pos).index();
          if (before.doc.childCount !== after.doc.childCount ||
              !owner.sameMarkup(after.doc.child(index)) ||
              beforeRaw.slice(0, prior.sourceStart) !== raw.slice(0, prior.sourceStart)) return;
          for (let sibling = 0; sibling < before.doc.childCount; sibling++) {
            if (sibling !== index && !before.doc.child(sibling).eq(after.doc.child(sibling))) return;
          }
        }
        const next = this.read(after, raw, prior.pos, prior.sourceStart);
        if (next) this.entries.set(after.doc, next);
        else if (composing && !prior.ready && after.doc.nodeAt(prior.pos)?.type.name === 'heading') {
          // A bare-hash IME candidate temporarily keeps its original H1 owner.
          // Only appearance follows that owner; settlement may canonicalize it to a paragraph.
          this.entries.set(after.doc, prior);
        }
        return;
      }

      if (!plain || !step) return;
      const { $from, empty } = before.selection;
      if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size ||
          step.from !== before.selection.from || step.to !== before.selection.to ||
          !/^#{1,6}[\t ]*$/.test(text.map(node => node.text).join(''))) return;
      const next = this.read(after, raw, $from.before(), sourceAnchor);
      if (next) this.entries.set(after.doc, next);
    };
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
    }), Decoration.widget(entry.pos + 1, view => {
      const marker = view.dom.ownerDocument.createElement('span');
      marker.className = 'inkora-heading-entry-marker';
      marker.dataset.marker = entry.marker;
      marker.contentEditable = 'false';
      marker.setAttribute('aria-hidden', 'true');
      return marker;
    }, { side: -1, key: `heading-prefix:${entry.marker}`, ignoreSelection: true })];
  }
}

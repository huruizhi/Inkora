import type { Node as PMNode } from 'prosemirror-model';
import type { parse, Range } from './source-document';
import type { SourceLedger } from './source-ledger';

type GapAnchor = { visual: number; raw: number };

/** A blank source line can temporarily separate two visual fragments of one list. */
export function listGapProjection(raw: string, parsed: ReturnType<typeof parse>, doc: PMNode,
  anchors: readonly GapAnchor[], base: SourceLedger): { parsedDoc: PMNode; ranges: Range[]; ledger: SourceLedger } | null {
  if (doc.childCount < parsed.doc.childCount + 2 || parsed.issues.length || base.sourceLength !== raw.length || base.docSize !== parsed.doc.content.size) return null;
  const positions: number[] = [];
  doc.forEach((_node, pos) => positions.push(pos));
  for (let index = 0; index < parsed.doc.childCount; index++) {
    const merged = parsed.doc.child(index), left = doc.maybeChild(index);
    if (!left || !['bullet_list', 'ordered_list'].includes(merged.type.name) || left.type !== merged.type) continue;
    let rightIndex = index + 1;
    while (doc.maybeChild(rightIndex)?.type.name === 'paragraph' && doc.child(rightIndex).content.size === 0) rightIndex++;
    const count = rightIndex - index - 1, right = doc.maybeChild(rightIndex);
    if (count < 1 || !right || right.type !== merged.type || doc.childCount !== parsed.doc.childCount + count + 1) continue;
    const sameAttrs = (node: PMNode) => Object.keys(merged.attrs).every(key => key === 'tight' || node.attrs[key] === merged.attrs[key]);
    if (!sameAttrs(left) || !sameAttrs(right) || !left.childCount || !right.childCount ||
        !left.content.append(right.content).eq(merged.content)) continue;
    let siblingsMatch = true;
    parsed.doc.forEach((node, _pos, sibling) => {
      if (sibling !== index && !node.eq(doc.child(sibling < index ? sibling : sibling + count + 1))) siblingsMatch = false;
    });
    if (!siblingsMatch || left.lastChild?.childCount !== 1 || left.lastChild.firstChild?.type.name !== 'paragraph' ||
        right.firstChild?.firstChild?.type.name !== 'paragraph') continue;
    const range = parsed.ranges[index];
    if (!range || positions[index] !== range.pos) continue;
    const split = range.pos + 1 + left.content.size;
    const leftBody = split - left.lastChild.nodeSize + 2;
    const leftEnd = leftBody + left.lastChild.firstChild.content.size;
    const leftSpans = base.spans.filter(span => span.visible && span.visualStart !== undefined && span.visualStart >= leftBody && span.visualEnd === leftEnd);
    const rightSpans = base.spans.filter(span => span.visible && span.visualStart === split + 2);
    if (leftSpans.length < 1 || rightSpans.length < 1) continue;
    const lastSource = Math.max(...leftSpans.map(span => span.sourceEnd));
    const newline = raw.indexOf('\n', lastSource);
    if (newline < 0) continue;
    const from = raw[newline - 1] === '\r' ? newline - 1 : newline;
    const rightBody = Math.min(...rightSpans.map(span => span.sourceStart));
    const to = raw.lastIndexOf('\n', rightBody - 1) + 1;
    if (to <= from || !/^[\t \r\n]+$/.test(raw.slice(from, to))) continue;
    const points: number[] = [];
    for (let offset = 0; offset < count; offset++) {
      const visual = positions[index + 1 + offset] + 1;
      const matches = [...new Set(anchors.filter(anchor => anchor.visual === visual && Number.isInteger(anchor.raw) &&
        anchor.raw > from && anchor.raw < to && raw[anchor.raw - 1] === '\n' &&
        (raw[anchor.raw] === '\n' || raw.slice(anchor.raw, anchor.raw + 2) === '\r\n')).map(anchor => anchor.raw))];
      if (matches.length !== 1 || (points.length && matches[0] <= points.at(-1)!)) break;
      points.push(matches[0]);
    }
    if (points.length !== count) continue;
    const delta = count * 2 + 2;
    const shift = (pos: number) => pos >= split ? pos + delta : pos;
    const spans = base.spans.map(span => ({ ...span,
      visualStart: span.visualStart === undefined ? undefined : shift(span.visualStart),
      visualEnd: span.visualEnd === undefined ? undefined : shift(span.visualEnd) }));
    points.forEach((point, offset) => spans.push({ sourceStart: point, sourceEnd: point,
      role: 'insertion-anchor', syntax: 'list-gap-paragraph', visible: true, text: '',
      visualStart: positions[index + 1 + offset] + 1, visualEnd: positions[index + 1 + offset] + 1 }));
    const ranges: Range[] = parsed.ranges.flatMap((item, sibling) => {
      if (sibling !== index) return [{ ...item, pos: sibling < index ? item.pos : item.pos + delta }];
      return [{ ...item, end: from, size: left.nodeSize },
        ...points.map((point, offset) => ({ start: point, end: point, pos: positions[index + 1 + offset], size: 2, kind: 'paragraph' })),
        { ...item, start: to, pos: positions[rightIndex], size: right.nodeSize }];
    });
    return { parsedDoc: parsed.doc, ranges, ledger: { ...base, docSize: doc.content.size, spans,
      blocks: ranges.map((item, child) => {
        const owned = spans.filter(span => span.sourceStart >= item.start && span.sourceEnd <= item.end);
        let inlineCount = 0;
        doc.child(child).descendants(node => { if (node.isTextblock && node.type.name !== 'code_block' && node.content.size) inlineCount++; });
        return { range: item, spans: owned, visualText: owned.filter(span => span.visible).map(span => span.text ?? '').join(''), inlineCount };
      }),
      links: base.links.map(link => ({ ...link, visual: { from: shift(link.visual.from), to: shift(link.visual.to) } })),
    } };
  }
  return null;
}

/** Tight/loose spacing is parser-derived; every other node and mark must agree. */
export function sameListContent(left: PMNode, right: PMNode): boolean {
  if (left.eq(right)) return true;
  if (left.type !== right.type || left.isText || right.isText || left.childCount !== right.childCount) return false;
  const markup = ['bullet_list', 'ordered_list'].includes(left.type.name)
    ? left.type.create({ ...left.attrs, tight: right.attrs.tight }, left.content, left.marks).sameMarkup(right)
    : left.sameMarkup(right);
  if (!markup) return false;
  for (let index = 0; index < left.childCount; index++) if (!sameListContent(left.child(index), right.child(index))) return false;
  return true;
}

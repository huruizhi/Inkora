// Lexical source ownership for inline text. All coordinates are UTF-16.

import MarkdownIt, { type Token } from 'markdown-it';
import type { Node as PMNode } from 'prosemirror-model';
import { parse as parseCanonicalSource, type Range, type CanonicalTokenEvidence } from "./source-document";
import { referenceDefinitions, type ReferenceLineRange } from "./reference-context";
import { gfmAutolinks, installGfmAutolinks } from "./gfm-autolinks";
import { lineTable, prefixCursor, containerLine, mapInlineToken, tableCellsForLine, tableCellInlineInput, type InlineInput, type AcceptedOpaqueInline, type AcceptedDelimiter } from "./source-token-provenance";

export type SourceRole =
  | 'text' | 'link-label' | 'image-alt' | 'autolink-text' | 'code-text'
  | 'hardbreak' | 'insertion-anchor'
  | 'delimiter' | 'href' | 'title' | 'reference-label'
  | 'definition-label' | 'definition-href' | 'definition-title'
  | 'block-prefix' | 'block-suffix' | 'line-ending' | 'gap'
  | 'protected';

export type LedgerSpan = {
  sourceStart: number;
  sourceEnd: number;
  role: SourceRole;
  syntax: string;
  visible: boolean;
  text?: string;
  visualStart?: number;
  visualEnd?: number;
  owner?: string;
  detail?: string;
};

export type LedgerBlock = {
  range: Range;
  spans: LedgerSpan[];
  visualText: string;
  inlineCount: number;
};

export type LedgerDiagnostic = {
  code: string;
  message: string;
  sourceStart?: number;
  sourceEnd?: number;
};

export type SourceLedger = {
  sourceLength: number;
  docSize: number;
  blocks: LedgerBlock[];
  spans: LedgerSpan[];
  links: SourceLinkOwner[];
  diagnostics: LedgerDiagnostic[];
};

export type SourceRange = { from: number; to: number };

export type SourceLinkOwner = {
  owner: string;
  kind: 'inline' | 'reference' | 'autolink';
  href: string;
  title: string | null;
  source: SourceRange;
  labelSource: SourceRange;
  labelMarkupSource: SourceRange;
  visual: SourceRange;
  hrefSource?: SourceRange;
  titleSource?: SourceRange;
  titleSeparatorSource?: SourceRange;
  trailingSource?: SourceRange;
  referenceKey?: string;
  referenceUsageCount?: number;
  definition?: {
    source: SourceRange;
    hrefSource: SourceRange;
    destinationSource?: SourceRange;
    titleSource?: SourceRange;
    titleSeparatorSource?: SourceRange;
  };
};

export type BuildLedgerResult =
  | { ok: true; ledger: SourceLedger }
  | { ok: false; reason: string; diagnostics: LedgerDiagnostic[] };

export type MapOptions = {
  snap?: 'none' | 'nearest' | 'adjacent-gap';
  collapsedAffinity?: 'left' | 'right';
};

export type LedgerMapResult =
  | { ok: true; anchor: number; head: number; snapped: string[] }
  | { ok: false; reason: string; candidates?: number[] };


type Atom = LedgerSpan & {
  visible: true;
  text: string;
  projection?: 'text' | 'atom';
  expectedNode?: { type: string; attrs: Record<string, unknown> };
};
type ReferenceDefinition = {
  key: string;
  href: string;
  title: string | null;
  spans: LedgerSpan[];
  destinationSyntax: SourceRange;
};
type LinkExpectation = {
  owner: string;
  mark: 'link' | 'image';
  kind: 'inline' | 'reference' | 'autolink';
  href: string;
  title: string | null;
  referenceKey?: string;
};
type ScanState = {
  opaque: ReadonlyMap<number, AcceptedOpaqueInline>;
  delimiters: ReadonlyMap<number, AcceptedDelimiter>;
  spans: LedgerSpan[];
  atoms: Atom[];
  expectations: LinkExpectation[];
  references: Map<string, ReferenceDefinition>;
  ownerSerial: number;
};
type TextLeaf = {
  start: number;
  end: number;
  text: string;
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[];
};
type ProjectionUnit = TextLeaf | {
  start: number;
  end: number;
  atom: string;
  attrs: Record<string, unknown>;
  marks: TextLeaf['marks'];
};

const markdown = new MarkdownIt('commonmark', {
  breaks: false,
  html: false,
  linkify: false,
}).enable(['table', 'strikethrough']);
installGfmAutolinks(markdown);


const ESCAPABLE = new Set('\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'.split(''));
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function diagnostic(code: string, message: string, start?: number, end?: number): LedgerDiagnostic {
  return { code, message, sourceStart: start, sourceEnd: end };
}

function fail(reason: string, diagnostics: LedgerDiagnostic[] = []): BuildLedgerResult {
  return { ok: false, reason, diagnostics: diagnostics.length ? diagnostics : [diagnostic('ledger_build_failed', reason)] };
}

function normalizeReference(label: string): string {
  return markdown.utils.normalizeReference(label);
}

function addHidden(state: ScanState, input: InlineInput, from: number, to: number, role: SourceRole, syntax: string, owner?: string, detail?: string): void {
  if (to <= from) return;
  const first = input.units[from];
  const last = input.units[to - 1];
  if (!first || !last) throw Error(`词法范围 ${from}..${to} 越界`);
  state.spans.push({ sourceStart: first.start, sourceEnd: last.end, role, syntax, visible: false, owner, detail });
}

function addAtom(state: ScanState, input: InlineInput, from: number, to: number, text: string, role: SourceRole, syntax: string, owner?: string, detail?: string): void {
  if (to <= from) throw Error(`可视词法范围 ${from}..${to} 为空`);
  const first = input.units[from];
  const last = input.units[to - 1];
  if (!first || !last) throw Error(`可视词法范围 ${from}..${to} 越界`);
  const atom: Atom = { sourceStart: first.start, sourceEnd: last.end, role, syntax, visible: true, text, owner, detail };
  state.spans.push(atom);
  state.atoms.push(atom);
}

function addRawAtom(state: ScanState, start: number, end: number, text: string, role: SourceRole, syntax: string, projection: 'text' | 'atom' = 'text', detail?: string): void {
  if (end <= start) throw Error(`可视原文范围 ${start}..${end} 为空`);
  const atom: Atom = { sourceStart: start, sourceEnd: end, role, syntax, visible: true, text, projection, detail };
  state.spans.push(atom);
  state.atoms.push(atom);
}

function addImageAtom(
  state: ScanState,
  input: InlineInput,
  from: number,
  to: number,
  alt: string,
  href: string,
  title: string | null,
  owner: string,
): void {
  const first = input.units[from];
  const last = input.units[to - 1];
  if (!first || !last) throw Error(`图片原文范围 ${from}..${to} 越界`);
  const atom: Atom = {
    sourceStart: first.start,
    sourceEnd: last.end,
    role: 'image-alt',
    syntax: 'image',
    visible: true,
    text: alt,
    owner,
    projection: 'atom',
    expectedNode: { type: 'image', attrs: { alt, href, title } },
    detail: '完整 Markdown 图片 owner 映射到一个可选择 PM atom',
  };
  state.spans.push(atom);
  state.atoms.push(atom);
}

function addAnchor(state: ScanState, sourceOffset: number, visualOffset: number, syntax: string, detail: string): void {
  const anchor: Atom = {
    sourceStart: sourceOffset,
    sourceEnd: sourceOffset,
    role: 'insertion-anchor',
    syntax,
    visible: true,
    text: '',
    visualStart: visualOffset,
    visualEnd: visualOffset,
    projection: 'atom',
    detail,
  };
  state.spans.push(anchor);
  state.atoms.push(anchor);
}

function addDecodedAtom(state: ScanState, input: InlineInput, from: number, to: number, text: string, role: SourceRole, syntax: string, owner?: string): void {
  // A decoded entity can expand to several graphemes. The whole decoded value
  // is one indivisible source atom because no interior raw boundary exists.
  addAtom(state, input, from, to, text, role, syntax, owner, '仅原文 span 两端是合法映射边界');
}

function scanPlain(state: ScanState, input: InlineInput, from: number, to: number, role: SourceRole, syntax: string, owner?: string): void {
  const text = input.text.slice(from, to);
  for (const part of segmenter.segment(text)) {
    const start = from + part.index;
    addAtom(state, input, start, start + part.segment.length, part.segment, role, syntax, owner,
      part.segment.length > 1 ? 'grapheme 内部 UTF-16 位置不映射' : undefined);
  }
}

function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '[') depth++;
    if (text[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

function delimiterAt(text: string, start: number, delimiter: string): number {
  for (let at = text.indexOf(delimiter, start); at >= 0; at = text.indexOf(delimiter, at + 1)) {
    let slashes = 0;
    for (let i = at - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
    if (slashes % 2 === 0) return at;
  }
  return -1;
}

function scanLinkTail(text: string, pos: number): { end: number; hrefStart: number; hrefEnd: number; titleStart?: number; titleEnd?: number; href: string; title: string | null } | undefined {
  if (text[pos] !== '(') return undefined;
  let cursor = pos + 1;
  while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  const helper = markdown.helpers.parseLinkDestination(text, cursor, text.length);
  if (!helper.ok) return undefined;
  const hrefStart = cursor;
  const hrefEnd = helper.pos;
  cursor = helper.pos;
  const spaceStart = cursor;
  while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  let titleStart: number | undefined;
  let titleEnd: number | undefined;
  let title: string | null = null;
  if (cursor > spaceStart) {
    const parsedTitle = markdown.helpers.parseLinkTitle(text, cursor, text.length);
    if (parsedTitle.ok) {
      titleStart = cursor;
      titleEnd = parsedTitle.pos;
      title = parsedTitle.str;
      cursor = parsedTitle.pos;
      while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
    }
  }
  if (text[cursor] !== ')') return undefined;
  const href = markdown.normalizeLink(helper.str);
  if (!markdown.validateLink(href)) return undefined;
  return { end: cursor + 1, hrefStart, hrefEnd, titleStart, titleEnd, href, title };
}

function scanInline(state: ScanState, input: InlineInput, from = 0, to = input.text.length, role: SourceRole = 'text', owner?: string): void {
  const text = input.text;
  const bareLinks = new Map(owner ? [] : gfmAutolinks(text).map(link => [link.from, link]));
  let i = from;
  while (i < to) {
    const opaque = state.opaque.get(input.units[i].start);
    if (opaque) {
      let end = i + 1;
      while (end <= to && input.units[end - 1].end < opaque.sourceEnd) end++;
      if (end > to || input.units[end - 1].end !== opaque.sourceEnd) throw Error('保护行内 token 范围不能精确投影');
      const atom: Atom = {
        sourceStart: opaque.sourceStart, sourceEnd: opaque.sourceEnd,
        role: 'protected', syntax: 'protected-inline', visible: true, text: '',
        projection: 'atom', expectedNode: { type: 'protected_inline', attrs: { raw: opaque.raw, kind: opaque.kind } },
      };
      state.spans.push(atom); state.atoms.push(atom);
      i = end;
      continue;
    }
    const bareLink = bareLinks.get(i);
    if (bareLink && bareLink.to <= to) {
      const linkOwner = `inline-${++state.ownerSerial}`;
      const href = markdown.normalizeLink(bareLink.href);
      state.expectations.push({ owner: linkOwner, mark: 'link', kind: 'autolink', href, title: null });
      const start = input.units[i].start;
      const end = input.units[bareLink.to - 1].end;
      state.spans.push({ sourceStart: start, sourceEnd: start, role: 'delimiter',
        syntax: 'autolink-open', visible: false, owner: linkOwner });
      scanPlain(state, input, i, bareLink.to, 'autolink-text', 'gfm-autolink', linkOwner);
      state.spans.push({ sourceStart: end, sourceEnd: end, role: 'delimiter',
        syntax: 'autolink-close', visible: false, owner: linkOwner });
      i = bareLink.to;
      continue;
    }
    // A backslash immediately followed by a line ending is one PM hard_break
    // atom. Its PM nodeSize is 1; the backslash and complete LF/CRLF source
    // spelling are owned together and are never projected as a text leaf.
    if (text[i] === '\\' && i + 1 < to && text[i + 1] === '\n') {
      const first = input.units[i];
      const last = input.units[i + 1];
      if (!first || !last) throw Error('反斜线 hardbreak 原文范围越界');
      addRawAtom(state, first.start, last.end, '\n', 'hardbreak', 'hardbreak-backslash', 'atom', 'PM hard_break atom，nodeSize=1');
      i += 2;
      continue;
    }
    // Escapes are owned by one displayed grapheme, never by a search for the
    // decoded character elsewhere in the block.
    if (text[i] === '\\' && i + 1 < to && ESCAPABLE.has(text[i + 1])) {
      addDecodedAtom(state, input, i, i + 2, text[i + 1], role, 'escape', owner);
      i += 2;
      continue;
    }

    // CommonMark entities decode once. &amp;amp; therefore displays &amp;:
    // the first '&' owns &amp;, while the following "amp;" remains literal.
    if (text[i] === '&') {
      const entity = text.slice(i, to).match(/^(?:&#(?:x[a-f0-9]{1,6}|[0-9]{1,7});|&[a-z][a-z0-9]{1,31};)/i)?.[0];
      if (entity) {
        const decoded = markdown.utils.unescapeAll(entity);
        if (decoded !== entity) {
          addDecodedAtom(state, input, i, i + entity.length, decoded, role, 'entity', owner);
          i += entity.length;
          continue;
        }
      }
    }

    // Code spans use exact delimiter runs and CommonMark's newline/outer-space
    // normalization. Removed padding is retained as non-visible ledger spans.
    if (text[i] === '`') {
      let openerEnd = i + 1;
      while (openerEnd < to && text[openerEnd] === '`') openerEnd++;
      const marker = text.slice(i, openerEnd);
      const close = delimiterAt(text, openerEnd, marker);
      if (close >= 0 && close < to) {
        addHidden(state, input, i, openerEnd, 'delimiter', 'code-open', owner);
        let contentStart = openerEnd;
        let contentEnd = close;
        const inner = text.slice(contentStart, contentEnd);
        if (inner.startsWith(' ') && inner.endsWith(' ') && /[^ ]/.test(inner)) {
          addHidden(state, input, contentStart, contentStart + 1, 'delimiter', 'code-padding', owner);
          addHidden(state, input, contentEnd - 1, contentEnd, 'delimiter', 'code-padding', owner);
          contentStart++;
          contentEnd--;
        }
        for (let p = contentStart; p < contentEnd; ) {
          if (text[p] === '\n') {
            addAtom(state, input, p, p + 1, ' ', 'code-text', 'code-newline', owner, '源码换行按 CommonMark 显示为空格');
            p++;
            continue;
          }
          const part = segmenter.segment(text.slice(p, contentEnd))[Symbol.iterator]().next().value as Intl.SegmentData | undefined;
          if (!part) break;
          addAtom(state, input, p, p + part.segment.length, part.segment, 'code-text', 'code', owner,
            part.segment.length > 1 ? 'grapheme 内部 UTF-16 位置不映射' : undefined);
          p += part.segment.length;
        }
        addHidden(state, input, close, close + marker.length, 'delimiter', 'code-close', owner);
        i = close + marker.length;
        continue;
      }
    }

    // Inline image/link. Bracket ownership is lexical; destination text can
    // equal adjacent body text without becoming a mapping candidate.
    const image = text[i] === '!' && text[i + 1] === '[';
    if (image || text[i] === '[') {
      const bracket = image ? i + 1 : i;
      const labelEnd = closingBracket(text, bracket);
      if (labelEnd >= 0 && labelEnd < to) {
        let end = labelEnd + 1;
        let href = '';
        let title: string | null = null;
        let resolved = false;
        let referenceStart: number | undefined;
        let referenceEnd: number | undefined;
        let referenceKey: string | undefined;
        const tail = scanLinkTail(text, end);
        if (tail && tail.end <= to) {
          end = tail.end;
          href = tail.href;
          title = tail.title;
          resolved = true;
        } else {
          let rawReference: string | undefined;
          if (text[end] === '[') {
            const refEnd = closingBracket(text, end);
            if (refEnd >= 0 && refEnd < to) {
              referenceStart = end;
              referenceEnd = refEnd + 1;
              rawReference = text.slice(end + 1, refEnd) || text.slice(bracket + 1, labelEnd);
              end = refEnd + 1;
            }
          } else {
            rawReference = text.slice(bracket + 1, labelEnd);
          }
          referenceKey = rawReference === undefined ? undefined : normalizeReference(rawReference);
          const definition = referenceKey === undefined ? undefined : state.references.get(referenceKey);
          if (definition) {
            href = definition.href;
            title = definition.title;
            resolved = true;
          }
        }
        if (resolved) {
          const linkOwner = `inline-${++state.ownerSerial}`;
          state.expectations.push({
            owner: linkOwner,
            mark: image ? 'image' : 'link',
            kind: tail ? 'inline' : 'reference',
            href,
            title,
            referenceKey,
          });
          if (image) addHidden(state, input, i, i + 1, 'delimiter', 'image-marker', linkOwner);
          addHidden(state, input, bracket, bracket + 1, 'delimiter', image ? 'image-alt-open' : 'link-label-open', linkOwner);
          if (image) {
            addHidden(state, input, bracket + 1, labelEnd, 'image-alt', 'image-alt-source', linkOwner);
          } else {
            scanInline(state, input, bracket + 1, labelEnd, 'link-label', linkOwner);
          }
          addHidden(state, input, labelEnd, labelEnd + 1, 'delimiter', image ? 'image-alt-close' : 'link-label-close', linkOwner);
          if (tail) {
            addHidden(state, input, labelEnd + 1, tail.hrefStart, 'delimiter', 'inline-link-open', linkOwner);
            addHidden(state, input, tail.hrefStart, tail.hrefEnd, 'href', 'inline-href', linkOwner, href);
            if (tail.titleStart !== undefined && tail.titleEnd !== undefined) {
              addHidden(state, input, tail.hrefEnd, tail.titleStart, 'delimiter', 'inline-link-separator', linkOwner);
              addHidden(state, input, tail.titleStart, tail.titleEnd, 'title', 'inline-title', linkOwner, title ?? undefined);
              addHidden(state, input, tail.titleEnd, tail.end - 1, 'delimiter', 'inline-link-space', linkOwner);
            } else addHidden(state, input, tail.hrefEnd, tail.end - 1, 'delimiter', 'inline-link-space', linkOwner);
            addHidden(state, input, tail.end - 1, tail.end, 'delimiter', 'inline-link-close', linkOwner);
          } else if (referenceStart !== undefined && referenceEnd !== undefined) {
            addHidden(state, input, referenceStart, referenceStart + 1, 'delimiter', 'reference-open', linkOwner);
            addHidden(state, input, referenceStart + 1, referenceEnd - 1, 'reference-label', 'reference-label', linkOwner);
            addHidden(state, input, referenceEnd - 1, referenceEnd, 'delimiter', 'reference-close', linkOwner);
          }
          if (image) {
            addImageAtom(
              state,
              input,
              i,
              end,
              text.slice(bracket + 1, labelEnd),
              href,
              title,
              linkOwner,
            );
          }
          i = end;
          continue;
        }
      }
    }

    // Autolinks are deliberately limited to forms whose visible value is the
    // literal value between angle brackets. Any normalization difference is a
    // safe build failure later when PM text is compared.
    if (text[i] === '<') {
      const close = delimiterAt(text, i + 1, '>');
      if (close > i + 1 && close < to) {
        const value = text.slice(i + 1, close);
        if (/^[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\x00-\x20]*$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          const href = markdown.normalizeLink(value.includes('@') && !value.includes(':') ? `mailto:${value}` : value);
          const visible = markdown.normalizeLinkText(value);
          const linkOwner = `inline-${++state.ownerSerial}`;
          state.expectations.push({ owner: linkOwner, mark: 'link', kind: 'autolink', href, title: null });
          addHidden(state, input, i, i + 1, 'delimiter', 'autolink-open', linkOwner);
          if (visible !== value) throw Error(`尖括号链接 ${JSON.stringify(value)} 发生显示规范化，当前账本明确拒绝`);
          scanPlain(state, input, i + 1, close, 'autolink-text', 'autolink', linkOwner);
          addHidden(state, input, close, close + 1, 'delimiter', 'autolink-close', linkOwner);
          i = close + 1;
          continue;
        }
      }
    }

    const emphasisDelimiter = state.delimiters.get(input.units[i].start);
    if (emphasisDelimiter) {
      let end = i + 1;
      while (end <= to && input.units[end - 1].end < emphasisDelimiter.sourceEnd) end++;
      if (end > to || input.units[end - 1].end !== emphasisDelimiter.sourceEnd) throw Error('emphasis delimiter range mismatch');
      addHidden(
        state,
        input,
        i,
        end,
        'delimiter',
        emphasisDelimiter.syntax,
        owner,
        '由 markdown-it CommonMark delimiter 配对确认',
      );
      i = end;
      continue;
    }

    // Strikethrough keeps its existing conservative pair. Emphasis and strong
    // above use markdown-it's resolved provenance so adjacent `***` / `___`
    // closing runs cannot be assigned to the wrong nested mark.
    const marker = text.startsWith('~~', i) ? '~~' : undefined;
    if (marker) {
      const close = delimiterAt(text, i + marker.length, marker);
      if (close > i + marker.length && close < to) {
        addHidden(state, input, i, i + marker.length, 'delimiter', 'strike-open', owner);
        scanInline(state, input, i + marker.length, close, role, owner);
        addHidden(state, input, close, close + marker.length, 'delimiter', 'strike-close', owner);
        i = close + marker.length;
        continue;
      }
    }

    if (text[i] === '\n') {
      addAtom(state, input, i, i + 1, '\n', role, 'softbreak', owner);
      i++;
      continue;
    }

    // Accumulate only until the next possible syntax character; scanPlain then
    // creates grapheme atoms and forbids surrogate/combining interior offsets.
    let end = i + 1;
    while (end < to && !'\\&`![<*_~\n'.includes(text[end]) && !bareLinks.has(end)) end++;
    let literalEnd = end;
    if (end < to && text[end] === '\n') {
      let spaces = end;
      while (spaces > i && text[spaces - 1] === ' ') spaces--;
      if (end - spaces >= 2) {
        scanPlain(state, input, i, spaces, role, 'literal', owner);
        const first = input.units[spaces];
        const last = input.units[end];
        if (!first || !last) throw Error('双空格 hardbreak 原文范围越界');
        addRawAtom(state, first.start, last.end, '\n', 'hardbreak', 'hardbreak-spaces', 'atom', 'PM hard_break atom，nodeSize=1；尾部空格与行尾共同归属');
        i = end + 1;
        continue;
      }
    }
    scanPlain(state, input, i, literalEnd, role, 'literal', owner);
    i = end;
  }
}


function hiddenRaw(state: ScanState, start: number, end: number, role: SourceRole, syntax: string, detail?: string): void {
  if (end > start) state.spans.push({ sourceStart: start, sourceEnd: end, role, syntax, visible: false, detail });
}

function codeLineContent(line: ReturnType<typeof lineTable>[number], style: 'fenced' | 'indented', fenceIndent: number, minimumStart = line.start): { start: number; text: string } {
  const rawStart = Math.max(line.start, minimumStart);
  const rawText = line.text.slice(rawStart - line.start);
  if (style === 'fenced') {
    let removed = 0;
    while (removed < fenceIndent && rawText[removed] === ' ') removed++;
    return { start: rawStart + removed, text: rawText.slice(removed) };
  }
  if (rawText.startsWith('    ')) return { start: rawStart + 4, text: rawText.slice(4) };
  if (rawText.startsWith('\t')) return { start: rawStart + 1, text: rawText.slice(1) };
  if (rawText.trim() === '') return { start: line.contentEnd, text: '' };
  throw Error(`缩进代码行 ${line.start} 缺少可审计的四空格或 tab 前缀`);
}

function mapCodeToken(lines: ReturnType<typeof lineTable>, token: Token, range: Range, state: ScanState): void {
  if (!token.map || (token.type !== 'fence' && token.type !== 'code_block')) throw Error('代码块 token 缺少可审计行范围');
  const style = token.type === 'fence' ? 'fenced' : 'indented';
  const physical = lines.slice(token.map[0], token.map[1]).map((_, offset) =>
    containerLine(lines, token, token.map![0] + offset, state.spans));
  let contentLines = physical;
  let fenceIndent = 0;
  if (style === 'fenced') {
    const opening = physical[0];
    if (!opening) throw Error('围栏起始行不存在');
    const openingSliceStart = Math.max(range.start, opening.start);
    const openingSlice = opening.text.slice(openingSliceStart - opening.start);
    const match = openingSlice.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (!match || match[2] !== token.markup) throw Error('围栏 opening marker 与 markdown token 不一致');
    fenceIndent = match[1].length;
    const markerStart = openingSliceStart + fenceIndent;
    hiddenRaw(state, openingSliceStart, markerStart, 'block-prefix', 'fence-indent');
    hiddenRaw(state, markerStart, markerStart + token.markup.length, 'delimiter', 'fence-open');
    hiddenRaw(state, markerStart + token.markup.length, opening.contentEnd, 'block-prefix', 'fence-info', '语言/info string 为非可视语法');
    hiddenRaw(state, opening.contentEnd, opening.end, 'line-ending', 'fence-open-eol');

    const possibleClosing = physical[physical.length - 1];
    if (!possibleClosing) throw Error('围栏闭合行不存在');
    const marker = token.markup[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const close = possibleClosing.text.match(new RegExp(`^( {0,3})(${marker}{${token.markup.length},})([\\t ]*)$`));
    if (close) {
      const closeMarkerStart = possibleClosing.start + close[1].length;
      hiddenRaw(state, possibleClosing.start, closeMarkerStart, 'block-prefix', 'fence-close-indent');
      hiddenRaw(state, closeMarkerStart, closeMarkerStart + close[2].length, 'delimiter', 'fence-close');
      hiddenRaw(state, closeMarkerStart + close[2].length, possibleClosing.contentEnd, 'block-suffix', 'fence-close-space');
      contentLines = physical.slice(1, -1);
    } else {
      // CommonMark closes a fence implicitly at EOF. Keep the physical source
      // exact and map every following line as code content; no synthetic close
      // delimiter is introduced into the ledger.
      contentLines = physical.slice(1);
    }
  }

  const logical: Array<{ char: string; start: number; end: number; lineEnding: boolean }> = [];
  for (let lineIndex = 0; lineIndex < contentLines.length; lineIndex++) {
    const line = contentLines[lineIndex];
    const lineStart = style === 'indented' && lineIndex === 0 ? Math.max(line.start, range.start) : line.start;
    const content = codeLineContent(line, style, fenceIndent, lineStart);
    hiddenRaw(state, lineStart, content.start, 'block-prefix', style === 'fenced' ? 'fence-content-indent' : 'indented-code-prefix');
    for (let i = 0; i < content.text.length; i++) logical.push({ char: content.text[i], start: content.start + i, end: content.start + i + 1, lineEnding: false });
    if (line.end > line.contentEnd) logical.push({ char: '\n', start: line.contentEnd, end: line.end, lineEnding: true });
  }
  const logicalText = logical.map(unit => unit.char).join('');
  // markdown-it appends a logical final newline to indented-code token.content
  // even when EOF has no EOL byte. Projection is derived from physical source
  // units, then checked against the real PM node below; no synthetic source
  // position is created for the parser-only newline.
  const projected = logicalText.endsWith('\n') ? logicalText.slice(0, -1) : logicalText;
  let logicalIndex = 0;
  for (const part of segmenter.segment(projected)) {
    const length = part.segment.length;
    const units = logical.slice(logicalIndex, logicalIndex + length);
    if (units.length !== length || units.map(unit => unit.char).join('') !== part.segment) throw Error('代码块 grapheme 无法回溯到原文单元');
    addRawAtom(state, units[0].start, units[units.length - 1].end, part.segment, 'code-text', units[0].lineEnding ? 'code-line-ending' : 'code-literal', 'text',
      part.segment.length > 1 ? 'grapheme 内部 UTF-16 位置不映射' : undefined);
    logicalIndex += length;
  }
  for (const unit of logical.slice(logicalIndex)) hiddenRaw(state, unit.start, unit.end, 'line-ending', 'code-trailing-eol', 'PM code_block 按 token 规则移除一个末尾换行');

  if (!projected.length) {
    const sourceOffset = style === 'fenced'
      ? (contentLines[0]?.start ?? lines[token.map[0]].end)
      : range.start;
    addAnchor(state, sourceOffset, range.pos + 1, 'empty-code-block', '空 code_block 的可视插入位置；围栏/缩进语法仍保持非可视');
  }
}

function parseDefinitions(source: string, accepted: readonly ReferenceLineRange[]): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>();
  for (const definition of referenceDefinitions(source, accepted)) {
    const { key, href, title } = definition;
    const labelStart = definition.label.from;
    const labelEnd = definition.label.to;
    const destinationStart = definition.destination.from;
    const destinationEnd = definition.destination.to;
    const syntaxEnd = definition.destinationSyntax.to;
    const spans: LedgerSpan[] = [
      { sourceStart: definition.from, sourceEnd: labelStart, role: 'delimiter', syntax: 'definition-open', visible: false },
      { sourceStart: labelStart, sourceEnd: labelEnd, role: 'definition-label', syntax: 'definition-label', visible: false, detail: key },
      { sourceStart: labelEnd, sourceEnd: destinationStart, role: 'delimiter', syntax: 'definition-separator', visible: false },
      { sourceStart: destinationStart, sourceEnd: destinationEnd, role: 'definition-href', syntax: 'definition-href', visible: false, detail: href },
    ];
    if (syntaxEnd > destinationEnd) spans.push({
      sourceStart: destinationEnd, sourceEnd: syntaxEnd,
      role: 'delimiter', syntax: 'definition-destination-close', visible: false,
    });
    if (definition.titleSource) {
      const titleStart = definition.titleSource.from;
      const titleEnd = definition.titleSource.to;
      spans.push({ sourceStart: syntaxEnd, sourceEnd: titleStart, role: 'delimiter', syntax: 'definition-title-separator', visible: false });
      spans.push({ sourceStart: titleStart, sourceEnd: titleEnd, role: 'definition-title', syntax: 'definition-title', visible: false, detail: title ?? '' });
      spans.push({ sourceStart: titleEnd, sourceEnd: definition.to, role: 'delimiter', syntax: 'definition-close', visible: false });
    } else spans.push({ sourceStart: syntaxEnd, sourceEnd: definition.to, role: 'delimiter', syntax: 'definition-close', visible: false });
    const existing = definitions.get(key);
    // CommonMark keeps the first definition for resolution. Later duplicate
    // definitions are still audited as non-visible source, but cannot replace
    // the href/title used by PM.
    if (existing) existing.spans.push(...spans);
    else definitions.set(key, {
      key, href, title, spans,
      destinationSyntax: { from: definition.destinationSyntax.from, to: syntaxEnd },
    });
  }
  return definitions;
}

function projectionUnitsFor(doc: PMNode, range: Range): ProjectionUnit[] {
  const leaves: ProjectionUnit[] = [];
  doc.nodesBetween(range.pos, range.pos + range.size, (node, pos) => {
    if (node.isText && node.text) leaves.push({ start: pos, end: pos + node.text.length, text: node.text, marks: node.marks as TextLeaf['marks'] });
    else if (node.isAtom && !node.isText) leaves.push({
      start: pos,
      end: pos + node.nodeSize,
      atom: node.type.name,
      attrs: node.attrs,
      marks: node.marks as TextLeaf['marks'],
    });
  });
  return leaves;
}

function assignVisualPositions(atoms: Atom[], leaves: ProjectionUnit[], expectations: LinkExpectation[]): string {
  const projectedAtoms = atoms.filter(atom => atom.visualStart === undefined);
  let leafIndex = 0;
  let leafOffset = 0;
  for (const atom of projectedAtoms) {
    while (leafIndex < leaves.length) {
      const candidate = leaves[leafIndex];
      if (!('text' in candidate) || leafOffset !== candidate.text.length) break;
      leafIndex++;
      leafOffset = 0;
    }
    const leaf = leaves[leafIndex];
    if (!leaf) return `词法 atom ${JSON.stringify(atom.text)} 没有对应 PM 单元`;
    if (atom.projection === 'atom') {
      if (!('atom' in leaf) || leaf.end - leaf.start !== 1) return `词法 ${atom.syntax} 未命中 nodeSize=1 的 PM atom`;
      if (atom.expectedNode) {
        if (leaf.atom !== atom.expectedNode.type) return `词法 ${atom.syntax} 未命中 PM ${atom.expectedNode.type} atom`;
        for (const [key, value] of Object.entries(atom.expectedNode.attrs)) {
          if ((leaf.attrs[key] ?? null) !== (value ?? null)) return `PM ${leaf.atom} 的 ${key} 与图片原文 owner 不一致`;
        }
      } else if (leaf.atom !== 'hard_break') {
        return `词法 ${atom.syntax} 未命中 PM hard_break atom`;
      }
      atom.visualStart = leaf.start;
      atom.visualEnd = leaf.end;
      leafIndex++;
      leafOffset = 0;
      continue;
    }
    if (!('text' in leaf) || leafOffset + atom.text.length > leaf.text.length) return `词法 atom ${JSON.stringify(atom.text)} 跨越 PM 文本叶，拒绝猜测`;
    if (leaf.text.slice(leafOffset, leafOffset + atom.text.length) !== atom.text) return `词法 atom ${JSON.stringify(atom.text)} 未命中 PM 叶`;
    atom.visualStart = leaf.start + leafOffset;
    atom.visualEnd = atom.visualStart + atom.text.length;
    if (atom.owner) {
      const expectedMark = expectations.find(item => item.owner === atom.owner);
      if (expectedMark) {
        const mark = leaf.marks.find(item => item.type.name === expectedMark.mark);
        if (!mark) return `${expectedMark.mark} 的可视文本缺少对应 PM mark`;
        if (mark.attrs.href !== expectedMark.href || (mark.attrs.title ?? null) !== expectedMark.title) return `${expectedMark.mark} 的 href/title 与词法来源不一致`;
      }
    }
    leafOffset += atom.text.length;
  }
  while (leafIndex < leaves.length) {
    const candidate = leaves[leafIndex];
    if (!('text' in candidate) || leafOffset !== candidate.text.length) break;
    leafIndex++;
    leafOffset = 0;
  }
  return leafIndex === leaves.length ? '' : 'PM 文本/atom 仍有未归属内容';
}

function fillGaps(source: string, spans: LedgerSpan[], ranges: Range[]): LedgerSpan[] {
  const covered = new Uint8Array(source.length);
  for (const span of spans) for (let i = span.sourceStart; i < span.sourceEnd && i < covered.length; i++) covered[i] = 1;
  const protectedRanges = ranges.filter(range => range.kind === 'protected_block');
  const extra: LedgerSpan[] = [];
  for (let i = 0; i < source.length; ) {
    if (covered[i]) { i++; continue; }
    const start = i;
    while (i < source.length && !covered[i]) i++;
    const owner = protectedRanges.find(range => start >= range.start && start < range.end);
    const bomGap = start === 0 && source[0] === '\uFEFF';
    extra.push({ sourceStart: start, sourceEnd: i, role: owner ? 'protected' : source.slice(start, i).trim() ? 'gap' : 'line-ending', syntax: owner ? 'protected-block' : bomGap ? 'bom-gap' : 'unprojected-gap', visible: false,
      detail: owner ? '受保护块内部不建立文本锚点' : '块间空白、BOM、定义残余或未投影语法' });
  }
  return [...spans, ...extra].sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd || Number(b.visible) - Number(a.visible));
}


function mapTableNode(
  source: string,
  physical: ReturnType<typeof lineTable>,
  table: PMNode,
  tablePos: number,
  pmDoc: PMNode,
  state: ScanState,
): void {
  if (table.type.name !== "table") throw Error("table 范围未对应 table 节点");
  const headRow = table.firstChild?.firstChild;
  if (!headRow) throw Error("table 缺少表头行");
  const columns = headRow.childCount;
  if (physical.length < 2) throw Error("table 缺少分隔行");
  const sourceRows = [physical[0], ...physical.slice(2)];
  const modelCells: Array<{ pos: number; node: PMNode }> = [];
  pmDoc.nodesBetween(tablePos, tablePos + table.nodeSize, (node, pos) => {
    if (node.type.name === "table_header" || node.type.name === "table_cell") {
      modelCells.push({ pos: pos + 1, node });
    }
  });
  const expectedCells = sourceRows.length * columns;
  if (modelCells.length !== expectedCells) {
    throw Error(`table cell 数量不一致：source=${expectedCells}, PM=${modelCells.length}`);
  }
  let modelIndex = 0;
  for (const line of sourceRows) {
    for (const cell of tableCellsForLine(line, columns)) {
      const model = modelCells[modelIndex++];
      if (!model) throw Error("table cell 投影越界");
      if (cell.end > cell.start) {
        scanInline(state, tableCellInlineInput(source, cell.start, cell.end));
      } else {
        addAnchor(state, cell.anchor, model.pos, "empty-table-cell", "空表格单元格的可视插入边界");
      }
    }
  }
}

export function buildSourceLedger(source: string, pmDoc: PMNode, ranges: readonly Range[], evidence?: CanonicalTokenEvidence): BuildLedgerResult {
  const diagnostics: LedgerDiagnostic[] = [];
  try {
    const lines = lineTable(source);
    const accepted = evidence ?? parseCanonicalSource(source).tokenEvidence;
    if (accepted.raw !== source) throw Error('已接受 token 的原文已过期');
    const tokens = accepted.tokens;
    const references = parseDefinitions(source, accepted.references);
    const indexedTokensByRange: Array<Array<{
      token: Token;
      tokenIndex: number;
    }>> = Array.from({ length: ranges.length }, () => []);
    tokens.forEach((token, tokenIndex) => {
      if (!token.map || !['inline', 'table_open', 'fence', 'code_block', 'hr', 'inkora_protected_block'].includes(token.type)) return;
      const tokenStart = lines[token.map[0]]?.start;
      const tokenEnd = lines[Math.max(token.map[1] - 1, token.map[0])]?.contentEnd;
      if (tokenStart === undefined || tokenEnd === undefined) return;
      let low = 0;
      let high = ranges.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (ranges[middle].end <= tokenStart) low = middle + 1;
        else high = middle;
      }
      const range = ranges[low];
      if (range && tokenEnd > range.start && tokenStart < range.end) {
        indexedTokensByRange[low].push({ token, tokenIndex });
      }
    });
    const opaque = new Map<number, AcceptedOpaqueInline>();
    const delimiters = new Map<number, AcceptedDelimiter>();
    for (const token of tokens) for (const child of token.children ?? []) {
      const accepted = child.meta?.inkoraAccepted as AcceptedOpaqueInline | undefined;
      if (accepted) opaque.set(accepted.sourceStart, accepted);
      const delimiter = child.meta?.inkoraAcceptedDelimiter as AcceptedDelimiter | undefined;
      if (delimiter) delimiters.set(delimiter.sourceStart, delimiter);
    }
    const blocks: LedgerBlock[] = [];
    const allSpans: LedgerSpan[] = [];
    const allExpectations: Array<{
      expectation: LinkExpectation;
      blockSource: SourceRange;
    }> = [];
    let ownerSerial = 0;
    for (const [rangeIndex, range] of ranges.entries()) {
      if (range.kind === 'protected_block') {
        blocks.push({ range, spans: [{ sourceStart: range.start, sourceEnd: range.end, role: 'protected', syntax: 'protected-block', visible: false, detail: '受保护块内部不建立文本锚点' }], visualText: '', inlineCount: 0 });
        allSpans.push(...blocks[blocks.length - 1].spans);
        continue;
      }
      const state: ScanState = { spans: [], atoms: [], expectations: [], references, ownerSerial, opaque, delimiters };
      if (range.kind === 'horizontal_rule') {
        const token = indexedTokensByRange[rangeIndex].find(item => item.token.type === 'hr');
        if (!token) throw Error('水平线没有同次解析的已接受 token');
        const atom: Atom = {
          sourceStart: range.start, sourceEnd: range.end,
          role: 'delimiter', syntax: 'horizontal-rule', visible: true, text: '',
          projection: 'atom', expectedNode: { type: 'horizontal_rule', attrs: {} },
        };
        const error = assignVisualPositions([atom], projectionUnitsFor(pmDoc, range), []);
        if (error) throw Error(`水平线投影不一致：${error}`);
        blocks.push({ range, spans: [atom], visualText: '', inlineCount: 0 });
        allSpans.push(atom);
        continue;
      }
      if (range.kind === 'table') {
        const table = pmDoc.nodeAt(range.pos);
        // The token index uses overlap, so a BOF table whose model range starts
        // after the BOM still owns the physical token beginning at zero.
        const tableToken = indexedTokensByRange[rangeIndex]
          .find(({ token }) => token.type === 'table_open')?.token;
        if (!table || !tableToken?.map) throw Error('顶层 table 缺少 source token 或 PM 节点');
        mapTableNode(source, lines.slice(tableToken.map[0], tableToken.map[1]), table, range.pos, pmDoc, state);
        const projectionError = assignVisualPositions(state.atoms, projectionUnitsFor(pmDoc, range), state.expectations);
        if (projectionError) throw Error(`范围 ${range.start}..${range.end}：${projectionError}`);
        const visualText = state.atoms.map(atom => atom.text).join('');
        const block = { range: range as Range, spans: state.spans, visualText, inlineCount: state.atoms.length };
        blocks.push(block);
        allSpans.push(...state.spans);
        allExpectations.push(...state.expectations.map(expectation => ({
          expectation,
          blockSource: { from: range.start, to: range.end },
        })));
        ownerSerial = state.ownerSerial;
        continue;
      }
      if (range.kind === 'code_block') {
        const codeToken = indexedTokensByRange[rangeIndex]
          .find(({ token }) => token.type === 'fence' || token.type === 'code_block')?.token;
        if (!codeToken) throw Error(`范围 ${range.start}..${range.end} 的 code_block 没有可审计块 token`);
        mapCodeToken(lines, codeToken, range, state);
        const projectionError = assignVisualPositions(state.atoms, projectionUnitsFor(pmDoc, range), state.expectations);
        if (projectionError) throw Error(`范围 ${range.start}..${range.end}：${projectionError}`);
        const visualText = state.atoms.map(atom => atom.text).join('');
        const block = { range: range as Range, spans: state.spans, visualText, inlineCount: 0 };
        blocks.push(block);
        allSpans.push(...state.spans);
        allExpectations.push(...state.expectations.map(expectation => ({
          expectation,
          blockSource: { from: range.start, to: range.end },
        })));
        ownerSerial = state.ownerSerial;
        continue;
      }
      // A leading BOM belongs to the file gap while the first model range
      // starts one UTF-16 unit later. The pre-index retains the prior overlap
      // rule instead of requiring identical token and range starts.
      const rangeTokens = indexedTokensByRange[rangeIndex];
      const inlineTokens = rangeTokens.filter(({ token }) => token.type === 'inline');
      const nestedTableTokens = rangeTokens.filter(({ token }) => token.type === 'table_open');
      const codeTokens = rangeTokens.filter(({ token }) => token.type === 'fence' || token.type === 'code_block');
      const nestedTables: Array<{ node: PMNode; pos: number }> = [];
      const nestedCodes: Array<{ node: PMNode; pos: number }> = [];
      pmDoc.nodesBetween(range.pos, range.pos + range.size, (node, pos) => {
        if (node.type.name === 'table') nestedTables.push({ node, pos });
        if (node.type.name === 'code_block') nestedCodes.push({ node, pos });
      });
      let tableIndex = 0;
      let codeIndex = 0;
      const actions = rangeTokens.filter(({ token }) =>
        token.type === 'inline' || token.type === 'table_open' || token.type === 'fence' || token.type === 'code_block' || token.type === 'inkora_protected_block');
      for (const { token, tokenIndex } of actions) {
        if (token.type === 'inkora_protected_block') {
          const accepted = token.meta?.inkoraAccepted as AcceptedOpaqueInline | undefined;
          if (!accepted) throw Error('嵌套保护块缺少已接受原文范围');
          const atom: Atom = { sourceStart: accepted.sourceStart, sourceEnd: accepted.sourceEnd,
            role: 'protected', syntax: 'protected-block', visible: true, text: '', projection: 'atom',
            expectedNode: { type: 'protected_block', attrs: { raw: accepted.raw, kind: accepted.kind } } };
          state.spans.push(atom); state.atoms.push(atom);
        } else if (token.type === 'table_open') {
          const target = nestedTables[tableIndex++];
          if (!target || !token.map) throw Error('容器 table token 与 PM 节点数量不一致');
          mapTableNode(source, lines.slice(token.map[0], token.map[1]), target.node, target.pos, pmDoc, state);
        } else if (token.type === 'fence' || token.type === 'code_block') {
          const target = nestedCodes[codeIndex++];
          if (!target || !token.map) throw Error('容器 code token 与 PM 节点数量不一致');
          mapCodeToken(lines, token, {
            start: lines[token.map[0]].start,
            end: lines[token.map[1] - 1].contentEnd,
            pos: target.pos, size: target.node.nodeSize, kind: 'code_block',
          }, state);
        } else {
          const heading = tokenIndex > 0 && tokens[tokenIndex - 1].type === 'heading_open';
          const input = mapInlineToken(source, lines, token, heading, state.spans);
          scanInline(state, input);
        }
      }
      const projectionUnits = projectionUnitsFor(pmDoc, range);
      const hasAcceptedOpaqueBlock = actions.some(({ token }) => token.type === 'inkora_protected_block');
      if (!inlineTokens.length && !nestedTableTokens.length && !codeTokens.length &&
          !hasAcceptedOpaqueBlock && projectionUnits.length) {
        throw Error(`范围 ${range.start}..${range.end} 有 PM 文本/atom 但没有可审计 inline token`);
      }
      const emptyTextblocks: number[] = [];
      pmDoc.nodesBetween(range.pos, range.pos + range.size, (node, pos) => {
        if (node.isTextblock && node.childCount === 0) emptyTextblocks.push(pos + 1);
      });
      const emptyTaskTokens = inlineTokens.map(({ token }) => token).filter(token =>
        token.content.length === 0 && typeof token.meta?.inkoraTaskPrefixLength === 'number');
      for (const [index, token] of emptyTaskTokens.entries()) {
        const line = token.map ? lines[token.map[0]] : undefined;
        const visual = emptyTextblocks[index];
        if (!line || visual === undefined) throw Error('空任务缺少唯一 source/PM 锚点');
        addAnchor(state, line.contentEnd, visual, 'empty-task-label', '空任务标记后的可视插入边界');
      }
      const remainingEmpty = emptyTextblocks.slice(emptyTaskTokens.length);
      if (!state.atoms.length && remainingEmpty.length) {
        if (remainingEmpty.length !== 1) throw Error(`范围 ${range.start}..${range.end} 含多个空 textblock，当前无法唯一定位插入 source 边界`);
        const line = lines.find(item => range.start >= item.start && range.start <= item.contentEnd);
        if (!line) throw Error('空结构缺少原文行');
        const cursor = prefixCursor(line.text, range.kind === 'heading');
        const sourceOffset = Math.max(range.start, line.start + cursor);
        addAnchor(state, sourceOffset, remainingEmpty[0], 'empty-textblock', `空 ${range.kind} 的可视插入位置，锚定在块前缀之后`);
      }
      const projectionError = assignVisualPositions(state.atoms, projectionUnits, state.expectations);
      if (projectionError) throw Error(`范围 ${range.start}..${range.end}：${projectionError}`);
      const visualText = state.atoms.map(atom => atom.text).join('');
      const block = { range: range as Range, spans: state.spans, visualText, inlineCount: inlineTokens.length };
      blocks.push(block);
      allSpans.push(...state.spans);
      allExpectations.push(...state.expectations.map(expectation => ({
        expectation,
        blockSource: { from: range.start, to: range.end },
      })));
      ownerSerial = state.ownerSerial;
    }
    for (const definition of references.values()) allSpans.push(...definition.spans);
    if (!ranges.length) {
      const emptyTextblocks: number[] = [];
      pmDoc.descendants((node, pos) => {
        if (node.isTextblock && node.childCount === 0) emptyTextblocks.push(pos + 1);
      });
      if (emptyTextblocks.length !== 1) throw Error('无块原文没有唯一的 PM 空 textblock 插入位置');
      const firstBoundary = source.startsWith('\uFEFF') ? 1 : 0;
      const anchors = source.length === firstBoundary ? [firstBoundary] : [firstBoundary, source.length];
      for (const sourceOffset of anchors) allSpans.push({
        sourceStart: sourceOffset,
        sourceEnd: sourceOffset,
        role: 'insertion-anchor',
        syntax: source.trim().length ? 'definition-only-document' : 'blank-document',
        visible: true,
        text: '',
        visualStart: emptyTextblocks[0],
        visualEnd: emptyTextblocks[0],
        detail: anchors.length === 1
          ? '空文档唯一插入边界'
          : '原文有前后两个合法 gap；PM→source 必须给 collapsedAffinity，禁止静默重置到文档头',
      });
    }
    const opaqueIntervals = [...opaque.values()].sort((a, b) => a.sourceStart - b.sourceStart);
    const uniqueOwnerSpans = allSpans.filter(span => {
      if (span.role !== 'block-prefix' || !opaqueIntervals.length) return true;
      let low = 0, high = opaqueIntervals.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (opaqueIntervals[mid].sourceEnd <= span.sourceStart) low = mid + 1;
        else high = mid;
      }
      const owner = opaqueIntervals[low];
      if (!owner || owner.sourceStart >= span.sourceEnd) return true;
      if (owner.sourceStart <= span.sourceStart && owner.sourceEnd >= span.sourceEnd) return false;
      throw Error('容器前缀与保护范围部分交叠，不能建立唯一原文归属');
    });
    const spans = fillGaps(source, uniqueOwnerSpans, ranges as Range[]);
    const spansByOwner = new Map<string, LedgerSpan[]>();
    for (const span of spans) {
      if (!span.owner) continue;
      const owned = spansByOwner.get(span.owner);
      if (owned) owned.push(span);
      else spansByOwner.set(span.owner, [span]);
    }
    const referenceUsageCounts = new Map<string, number>();
    for (const { expectation } of allExpectations) {
      if (expectation.referenceKey === undefined) continue;
      referenceUsageCounts.set(
        expectation.referenceKey,
        (referenceUsageCounts.get(expectation.referenceKey) ?? 0) + 1,
      );
    }
    const definitionRanges = new Map<string, NonNullable<SourceLinkOwner['definition']>>();
    for (const [key, definition] of references) {
      const hrefs = definition.spans.filter(span => span.role === 'definition-href');
      if (hrefs.length !== 1) continue;
      const titles = definition.spans.filter(span => span.role === 'definition-title');
      const separators = definition.spans.filter(span => span.syntax === 'definition-title-separator');
      let from = Number.POSITIVE_INFINITY;
      let to = Number.NEGATIVE_INFINITY;
      for (const span of definition.spans) {
        from = Math.min(from, span.sourceStart);
        to = Math.max(to, span.sourceEnd);
      }
      definitionRanges.set(key, {
        source: { from, to },
        hrefSource: { from: hrefs[0].sourceStart, to: hrefs[0].sourceEnd },
        destinationSource: definition.destinationSyntax,
        titleSource: titles.length === 1
          ? { from: titles[0].sourceStart, to: titles[0].sourceEnd }
          : undefined,
        titleSeparatorSource: separators.length === 1
          ? { from: separators[0].sourceStart, to: separators[0].sourceEnd }
          : undefined,
      });
    }
    const visibleSpansWithin = (from: number, to: number): Array<LedgerSpan & {
      visualStart: number;
      visualEnd: number;
    }> => {
      let low = 0;
      let high = spans.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (spans[middle].sourceStart < from) low = middle + 1;
        else high = middle;
      }
      const visible: Array<LedgerSpan & { visualStart: number; visualEnd: number }> = [];
      for (let index = low; index < spans.length && spans[index].sourceStart <= to; index++) {
        const span = spans[index];
        if (span.visible && span.sourceEnd <= to &&
            span.visualStart !== undefined && span.visualEnd !== undefined) {
          visible.push(span as LedgerSpan & { visualStart: number; visualEnd: number });
        }
      }
      return visible;
    };
    const links = allExpectations.filter(({ expectation }) => expectation.mark === 'link')
      .map(({ expectation, blockSource }): SourceLinkOwner | null => {
      const owned = (spansByOwner.get(expectation.owner) ?? []).filter(span =>
        span.sourceStart >= blockSource.from && span.sourceEnd <= blockSource.to);
      if (!owned.length) throw Error(`链接 owner ${expectation.owner} 缺少可审计范围`);
      const find = (role: SourceRole, syntax?: string): LedgerSpan | undefined =>
        owned.find(span => span.role === role && (syntax === undefined || span.syntax === syntax));
      const inlineHref = find('href', 'inline-href');
      const inlineTitle = find('title', 'inline-title');
      const inlineSeparator = find('delimiter', 'inline-link-separator');
      const inlineTrailing = find('delimiter', 'inline-link-space');
      const labelOpen = owned.find(span =>
        span.syntax === 'link-label-open' || span.syntax === 'autolink-open');
      const labelClose = owned.find(span =>
        span.syntax === 'link-label-close' || span.syntax === 'autolink-close');
      if (!labelOpen || !labelClose) throw Error(`链接 owner ${expectation.owner} 缺少 label 边界`);
      // A link label may contain an image with its own lexical owner. Its
      // atom still belongs to this label's source interval and PM link mark.
      const visible = visibleSpansWithin(labelOpen.sourceEnd, labelClose.sourceStart);
      if (!visible.length) {
        // An empty link has no selectable PM label. Keep all syntax spans,
        // while omitting a visual editing target rather than inventing one.
        if (labelOpen.sourceEnd === labelClose.sourceStart) return null;
        throw Error(`链接 owner ${expectation.owner} 缺少可审计 label 投影`);
      }
      for (const span of visible) {
        if (span.syntax !== 'image') continue;
        const node = pmDoc.nodeAt(span.visualStart);
        const link = node?.marks.find(mark => mark.type.name === 'link');
        if (node?.type.name !== 'image' || !link || link.attrs.href !== expectation.href ||
            (link.attrs.title ?? null) !== expectation.title) {
          throw Error(`链接 owner ${expectation.owner} 的嵌套图片缺少一致的 PM link mark`);
        }
      }
      const definitionRange = expectation.referenceKey === undefined
        ? undefined
        : definitionRanges.get(expectation.referenceKey);
      return {
        owner: expectation.owner,
        kind: expectation.kind,
        href: expectation.href,
        title: expectation.title,
        source: {
          from: Math.min(...owned.map(span => span.sourceStart)),
          to: Math.max(...owned.map(span => span.sourceEnd)),
        },
        labelSource: {
          from: Math.min(...visible.map(span => span.sourceStart)),
          to: Math.max(...visible.map(span => span.sourceEnd)),
        },
        labelMarkupSource: { from: labelOpen.sourceEnd, to: labelClose.sourceStart },
        visual: {
          from: Math.min(...visible.map(span => span.visualStart)),
          to: Math.max(...visible.map(span => span.visualEnd)),
        },
        hrefSource: inlineHref
          ? { from: inlineHref.sourceStart, to: inlineHref.sourceEnd }
          : undefined,
        titleSource: inlineTitle
          ? { from: inlineTitle.sourceStart, to: inlineTitle.sourceEnd }
          : undefined,
        titleSeparatorSource: inlineSeparator
          ? { from: inlineSeparator.sourceStart, to: inlineSeparator.sourceEnd }
          : undefined,
        trailingSource: inlineTrailing
          ? { from: inlineTrailing.sourceStart, to: inlineTrailing.sourceEnd }
          : undefined,
        referenceKey: expectation.referenceKey,
        referenceUsageCount: expectation.referenceKey === undefined
          ? undefined
          : referenceUsageCounts.get(expectation.referenceKey),
        definition: definitionRange,
      } satisfies SourceLinkOwner;
    }).filter((owner): owner is SourceLinkOwner => owner !== null);
    return {
      ok: true,
      ledger: { sourceLength: source.length, docSize: pmDoc.content.size, blocks, spans, links, diagnostics },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diagnostics.push(diagnostic('unsupported_or_ambiguous_syntax', reason));
    return fail(reason, diagnostics);
  }
}

function visibleSpans(ledger: SourceLedger): Array<LedgerSpan & { visible: true; visualStart: number; visualEnd: number; text: string }> {
  return ledger.spans.filter((span): span is LedgerSpan & { visible: true; visualStart: number; visualEnd: number; text: string } =>
    span.visible && span.visualStart !== undefined && span.visualEnd !== undefined && span.text !== undefined);
}

function nearestVisual(ledger: SourceLedger, sourceOffset: number): { value: number; note: string } | undefined {
  const spans = visibleSpans(ledger);
  const candidates = spans.flatMap(span => [
    { distance: Math.abs(sourceOffset - span.sourceStart), source: span.sourceStart, visual: span.visualStart },
    { distance: Math.abs(sourceOffset - span.sourceEnd), source: span.sourceEnd, visual: span.visualEnd },
  ]).sort((a, b) => a.distance - b.distance || a.source - b.source);
  const first = candidates[0];
  return first ? { value: first.visual, note: `原文 ${sourceOffset} 位于非可视语法，吸附到 source ${first.source} / PM ${first.visual}` } : undefined;
}

function mapVisualEndpoint(ledger: SourceLedger, position: number, affinity: 'left' | 'right' | undefined, options: MapOptions, snapped: string[]): number {
  if (position < 0 || position > ledger.docSize) throw Error(`PM 位置 ${position} 越界（0..${ledger.docSize}）`);
  const spans = visibleSpans(ledger);
  const interiors = spans.filter(span => position > span.visualStart && position < span.visualEnd);
  if (interiors.length) throw Error(`PM ${position} 位于 ${interiors[0].syntax} grapheme/entity/escape 内部，UTF-16 中间位置不安全`);
  const left = spans.filter(span => span.visualEnd === position);
  const right = spans.filter(span => span.visualStart === position);
  if (affinity === 'left' && left.length) return left[left.length - 1].sourceEnd;
  if (affinity === 'right' && right.length) return right[0].sourceStart;
  const exact = [...new Set([...left.map(span => span.sourceEnd), ...right.map(span => span.sourceStart)])];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw Object.assign(Error(`PM ${position} 两侧隔着非可视语法，折叠端点需要 left/right affinity`), { candidates: exact });
  const protectedBlock = ledger.blocks.find(block => block.range.kind === 'protected_block'
    && position >= block.range.pos && position <= block.range.pos + block.range.size);
  if (protectedBlock) throw Error(`PM ${position} 位于受保护块（原文 ${protectedBlock.range.start}..${protectedBlock.range.end}）；块内是不可视 protected/protected-block，需主动源码修复`);
  if (options.snap === 'nearest') {
    const candidates = spans.flatMap(span => [
      { distance: Math.abs(position - span.visualStart), visual: span.visualStart, source: span.sourceStart },
      { distance: Math.abs(position - span.visualEnd), visual: span.visualEnd, source: span.sourceEnd },
    ]).sort((a, b) => a.distance - b.distance || a.visual - b.visual);
    if (candidates[0]) {
      snapped.push(`PM ${position} 位于结构边界，吸附到 PM ${candidates[0].visual} / source ${candidates[0].source}`);
      return candidates[0].source;
    }
  }
  throw Error(`PM ${position} 没有可审计文本锚点`);
}

export function visualToSource(ledger: SourceLedger, anchor: number, head: number, options: MapOptions = {}): LedgerMapResult {
  const snapped: string[] = [];
  try {
    let anchorAffinity: 'left' | 'right' | undefined;
    let headAffinity: 'left' | 'right' | undefined;
    if (anchor === head) anchorAffinity = headAffinity = options.collapsedAffinity;
    else if (anchor < head) { anchorAffinity = 'right'; headAffinity = 'left'; }
    else { anchorAffinity = 'left'; headAffinity = 'right'; }
    const mappedAnchor = mapVisualEndpoint(ledger, anchor, anchorAffinity, options, snapped);
    const mappedHead = anchor === head
      ? mappedAnchor
      : mapVisualEndpoint(ledger, head, headAffinity, options, snapped);
    return { ok: true, anchor: mappedAnchor, head: mappedHead, snapped: [...new Set(snapped)] };
  } catch (error) {
    const candidateValue = (error as { candidates?: number[] }).candidates;
    return { ok: false, reason: error instanceof Error ? error.message : String(error), candidates: candidateValue };
  }
}

function mapSourceEndpoint(ledger: SourceLedger, offset: number, affinity: 'left' | 'right' | undefined, options: MapOptions, snapped: string[]): number {
  if (offset < 0 || offset > ledger.sourceLength) throw Error(`原文位置 ${offset} 越界（0..${ledger.sourceLength}）`);
  const spans = visibleSpans(ledger);
  const interior = spans.find(span => offset > span.sourceStart && offset < span.sourceEnd);
  if (interior) throw Error(`原文 ${offset} 位于 ${interior.syntax} 的不可分割 span ${interior.sourceStart}..${interior.sourceEnd} 内部`);
  const left = spans.filter(span => span.sourceEnd === offset);
  const right = spans.filter(span => span.sourceStart === offset);
  if (affinity === 'left' && left.length) return left[left.length - 1].visualEnd;
  if (affinity === 'right' && right.length) return right[0].visualStart;
  const exact = [...new Set([...left.map(span => span.visualEnd), ...right.map(span => span.visualStart)])];
  if (exact.length === 1) return exact[0];
  const hidden = ledger.spans.find(span => !span.visible && offset > span.sourceStart && offset < span.sourceEnd);
  const adjacent = ledger.spans.find(span => !span.visible && offset >= span.sourceStart && offset <= span.sourceEnd);
  const adjacentGapAllowed = options.snap === 'adjacent-gap' && adjacent
    && adjacent.syntax !== 'bom-gap'
    && (adjacent.role === 'line-ending'
      || adjacent.role === 'gap'
      || adjacent.syntax.startsWith('definition-'));
  if (hidden && options.snap !== 'nearest' && !adjacentGapAllowed) {
    if (hidden.role === 'protected') throw Error(`原文 ${offset} 位于受保护块 ${hidden.sourceStart}..${hidden.sourceEnd} 的非可视 ${hidden.role}/${hidden.syntax}；需主动源码修复`);
    throw Error(`原文 ${offset} 位于非可视 ${hidden.role}/${hidden.syntax}，不盲映射到正文`);
  }
  if (options.snap === 'nearest' || adjacentGapAllowed) {
    const nearest = nearestVisual(ledger, offset);
    if (nearest) {
      snapped.push(adjacentGapAllowed
        ? `显式 adjacent-gap：${nearest.note}；owner=${adjacent!.role}/${adjacent!.syntax}`
        : nearest.note);
      return nearest.value;
    }
  }
  throw Error(hidden ? `原文 ${offset} 位于非可视 ${hidden.role}/${hidden.syntax}` : `原文 ${offset} 没有可审计文本锚点`);
}

export function sourceToVisual(ledger: SourceLedger, anchor: number, head: number, options: MapOptions = {}): LedgerMapResult {
  const snapped: string[] = [];
  try {
    let anchorAffinity: 'left' | 'right' | undefined;
    let headAffinity: 'left' | 'right' | undefined;
    if (anchor === head) anchorAffinity = headAffinity = options.collapsedAffinity;
    else if (anchor < head) { anchorAffinity = 'right'; headAffinity = 'left'; }
    else { anchorAffinity = 'left'; headAffinity = 'right'; }
    const mappedAnchor = mapSourceEndpoint(ledger, anchor, anchorAffinity, options, snapped);
    const mappedHead = anchor === head
      ? mappedAnchor
      : mapSourceEndpoint(ledger, head, headAffinity, options, snapped);
    return { ok: true, anchor: mappedAnchor, head: mappedHead, snapped: [...new Set(snapped)] };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

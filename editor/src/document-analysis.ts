import MarkdownIt, { type Token } from "markdown-it";

/**
 * 文档分析：基于不可变快照 `{ raw, revision }` 的大纲（标题索引）与
 * 原文/内容双口径统计。纯函数，不修改输入，不读写文件，不触 DOM。
 *
 * 所有偏移都是原文 `raw` 的 UTF-16 半开区间；解析在归一化副本上进行
 * （剥离 BOM、\r\n 与孤立 \r 折叠为 \n），通过索引映射还原原文偏移。
 * 原文本身从不被归一化或改写。
 */

export interface DocumentSnapshot {
  readonly raw: string;
  readonly revision: number;
}

/** UTF-16 半开区间 `[start, end)`，指向 `raw` 的原文偏移。 */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

export interface HeadingEntry {
  /** 1–6，ATX 与 Setext 统一映射。 */
  readonly level: number;
  /** 显示文本：来自 inline token（链接取 label、行内代码取内容、图片取 alt）。 */
  readonly text: string;
  /** 标题结构在原文中的半开区间（ATX 含 `#` 行，Setext 含文本行与下划线行，不含尾随 EOL）。 */
  readonly start: number;
  readonly end: number;
}

export interface TextStats {
  /** 字素簇数；纯空白字素不计（BOM 计 1，emoji 组合 / ZWJ 序列 / 组合重音各计 1）。 */
  readonly characters: number;
  /**
   * 写作单元：每个 Han 字素计 1；其他 Unicode 字母/数字的连续串计 1
   * （附着组合符不拆）；标点、emoji、空白、下划线/连字符只分隔单元，不计数。
   */
  readonly writingUnits: number;
}

export interface DocumentAnalysis {
  readonly revision: number;
  readonly headings: readonly HeadingEntry[];
  /** 原文口径：含 Markdown 符号、链接目标、引用定义、格式定界符、BOM，不受排除影响。 */
  readonly raw: TextStats;
  /** 内容口径：只计可读文本（含行内代码、代码块内容、图片 alt、链接 label）；排除范围不计。 */
  readonly content: TextStats;
  /** 校验后按 start 升序回显的排除范围。 */
  readonly excludedRanges: readonly SourceRange[];
}

export interface DocumentAnalysisOptions {
  /** 调用方已识别的高级原文/元数据范围；在解析副本上按等长空白屏蔽。 */
  readonly excludedRanges?: readonly SourceRange[];
}

export class ExcludedRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ExcludedRangeError";
  }
}

const parser = new MarkdownIt("commonmark", { breaks: false, html: true, linkify: false });

const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

const whitespaceOnly = /^\p{White_Space}*$/u;
const hanCluster = /\p{Script=Han}/u;
// 非汉字的字母/数字（字素簇的基字符；附着组合符随簇，不拆）。
const alnumCluster = /^(?:\p{M}|[\p{L}\p{N}])/u;



function countStats(segments: readonly string[]): TextStats {
  let characters = 0;
  let writingUnits = 0;
  let inLetterRun = false;
  for (const segment of segments) {
    inLetterRun = false; // 段间（不同块/换行）不延续字母数字串。
    for (const { segment: cluster } of graphemeSegmenter.segment(segment)) {
      if (whitespaceOnly.test(cluster)) {
        inLetterRun = false;
        continue;
      }
      characters += 1;
      if (hanCluster.test(cluster)) {
        writingUnits += 1;
        inLetterRun = false;
      } else if (alnumCluster.test(cluster)) {
        if (!inLetterRun) {
          writingUnits += 1;
          inLetterRun = true;
        }
      } else {
        inLetterRun = false;
      }
    }
  }
  return { characters, writingUnits };
}

// ---------------------------------------------------------------------------
// 排除范围校验：非法、重叠、切断 CRLF 或字素簇均拒绝。
// ---------------------------------------------------------------------------

function graphemeBoundaries(text: string): Set<number> {
  const boundaries = new Set<number>();
  boundaries.add(text.length);

  let index = 0;
  for (const { segment: cluster } of graphemeSegmenter.segment(text)) {
    boundaries.add(index);
    index += cluster.length;
  }
  return boundaries;
}

function validateExcludedRanges(raw: string, ranges: readonly SourceRange[]): SourceRange[] {
  const sorted = [...ranges].map((range, i) => {
    const { start, end } = range;
    if (
      typeof start !== "number" || typeof end !== "number" ||
      !Number.isInteger(start) || !Number.isInteger(end)
    ) {
      throw new ExcludedRangeError(
        `excludedRanges[${i}] 偏移必须是整数（收到 start=${String(start)}, end=${String(end)}）`,
      );
    }
    if (start < 0 || end > raw.length || start > end) {
      throw new ExcludedRangeError(
        `excludedRanges[${i}] 越界：[${start}, ${end}) 不在原文 [0, ${raw.length}) 内`,
      );
    }
    return { start, end };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new ExcludedRangeError(
        `excludedRanges 重叠：[${sorted[i - 1].start}, ${sorted[i - 1].end}) 与 [${sorted[i].start}, ${sorted[i].end})`,
      );
    }
  }

  const boundaries = graphemeBoundaries(raw);
  for (let i = 0; i < sorted.length; i += 1) {
    const { start, end } = sorted[i];
    // 切断 CRLF：边界落在 \r 与 \n 之间。
    if ((start > 0 && raw[start - 1] === "\r" && raw[start] === "\n") ||
        (end > 0 && end < raw.length && raw[end - 1] === "\r" && raw[end] === "\n")) {
      throw new ExcludedRangeError(
        `excludedRanges[${i}] 切断 CRLF：边界 ${start === end ? start : `${start}/${end}`} 落在 \\r 与 \\n 之间`,
      );
    }
    if (!boundaries.has(start) || !boundaries.has(end)) {
      throw new ExcludedRangeError(
        `excludedRanges[${i}] 切断字素簇：start/end 必须落在字素簇边界（[${start}, ${end})）`,
      );
    }
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// 解析副本：等长屏蔽排除范围（保留 EOL 字符），剥离 BOM、折叠 EOL，并保留
// 归一化索引 → 原文索引的映射。
// ---------------------------------------------------------------------------

interface ParseCopy {
  /** 归一化文本（无 BOM，EOL 全为 \n），供 markdown-it 解析。 */
  readonly text: string;
  /** text 中每个索引对应的原文索引；额外一项 text.length → 原文长度。 */
  readonly toRaw: readonly number[];
  /** text 每一行的起始索引。 */
  readonly lineStarts: readonly number[];
}

function buildParseCopy(raw: string, excluded: readonly SourceRange[]): ParseCopy {
  const bomLength = raw.charCodeAt(0) === 0xfeff ? 1 : 0;
  const body = bomLength === 0 ? raw : raw.slice(1);

  let masked = body;
  if (excluded.length > 0) {
    // 逐 UTF-16 单位等长替换：排除范围是原文偏移，代理对两半各替换为
    // 一空格以保持总长与 toRaw 映射；EOL 字符保留以维持行结构。
    const units: string[] = new Array(body.length);
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (ch === "\n" || ch === "\r") {
        units[i] = ch;
        continue;
      }
      const at = i + bomLength;
      units[i] = excluded.some((r) => at >= r.start && at < r.end) ? " " : ch;
    }
    masked = units.join("");
  }

  let text = "";
  const toRaw: number[] = [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "\r" || ch === "\n") {
      // \r\n 折叠为一个 \n，映射指向 \r 的原文位置；孤立 \r 同样按一行处理。
      // 先记映射再跳过 \n：否则归一化换行会错指向 \n，标题尾随 CRLF 的
      // 剥离判定（slice(-2) === "\r\n"）随之错位。
      toRaw.push(i + bomLength);
      if (ch === "\r" && i + 1 < masked.length && masked[i + 1] === "\n") i += 1;
      text += "\n";
      lineStarts.push(text.length);
    } else {
      toRaw.push(i + bomLength);
      text += ch;
    }
  }
  toRaw.push(masked.length + bomLength);
  return { text, toRaw, lineStarts };
}

function toRawOffset(copy: ParseCopy, normOffset: number): number {
  if (normOffset >= copy.toRaw.length) return copy.toRaw[copy.toRaw.length - 1];
  if (normOffset < 0) return copy.toRaw[0];
  return copy.toRaw[normOffset];
}


// ---------------------------------------------------------------------------
// inline token → 显示文本 / 内容片段
// ---------------------------------------------------------------------------


function inlineContentText(children: readonly Token[]): string {
  // 同一 inline 块内拼接为单段：相邻 token 视作连续（跨格式定界符不拆字母串），
  // 换行位补空白以断开字母数字串。
  let out = "";
  for (const token of children) {
    switch (token.type) {
      case "text":
      case "code_inline":
        out += token.content;
        break;
      case "image":
        out += token.children && token.children.length > 0
          ? inlineContentText(token.children)
          : token.attrGet("alt") ?? "";
        break;
      case "softbreak":
      case "hardbreak":
        out += " ";
        break;
      default:
        break;
    }
  }
  return out;
}

// 围栏内容直接使用 token.content：markdown-it 已剥离围栏定界符、信息串、
// 容器标记与围栏缩进；闭合与否（内容是否计到文末）也由其统一处理。

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export function analyzeDocument(
  snapshot: DocumentSnapshot,
  options: DocumentAnalysisOptions = {},
): DocumentAnalysis {
  if (snapshot === null || typeof snapshot !== "object") {
    throw new TypeError("snapshot 必须是 { raw, revision } 对象");
  }
  if (typeof snapshot.raw !== "string") {
    throw new TypeError("snapshot.raw 必须是字符串");
  }
  if (typeof snapshot.revision !== "number" || !Number.isFinite(snapshot.revision)) {
    throw new TypeError("snapshot.revision 必须是有限数字");
  }
  const { raw, revision } = snapshot;

  const excluded = validateExcludedRanges(
    raw,
    options.excludedRanges ?? [],
  );
  const copy = buildParseCopy(raw, excluded);
  const tokens = parser.parse(copy.text, {});

  const headings: HeadingEntry[] = [];
  const contentSegments: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const inline = tokens[i + 1];
      const children = inline && inline.type === "inline" ? inline.children ?? [] : [];
      const [startLine, endLine] = token.map ?? [0, 0];
      const normStart = copy.lineStarts[startLine] ?? 0;
      const nextLineStart = copy.lineStarts[endLine] ?? copy.text.length;
      const rawNext = toRawOffset(copy, nextLineStart);
      const eolCut = raw.slice(rawNext - 2, rawNext) === "\r\n"
        ? 2
        : raw[rawNext - 1] === "\n" || raw[rawNext - 1] === "\r"
          ? 1
          : 0;
      headings.push({
        level: Number(token.tag.slice(1)),
        text: inlineContentText(children),
        start: toRawOffset(copy, normStart),
        end: Math.max(toRawOffset(copy, normStart), rawNext - eolCut),
      });
    } else if (token.type === "inline") {
      const inlineText = inlineContentText(token.children ?? []);
      if (inlineText.length > 0) contentSegments.push(inlineText);
    } else if (token.type === "fence") {
      // token.content 即围栏内部内容（已剥定界符/信息串/容器标记/缩进；
      // 不闭合时为到文末的全部行），无需手工切行判闭合。
      if (token.content.length > 0) contentSegments.push(token.content);
    } else if (token.type === "code_block") {
      // 缩进代码块：token.content 已去掉每行 4 空格缩进，直接计内容。
      if (token.content.length > 0) contentSegments.push(token.content);
    }
    // html_block / html_inline 不执行也不计入内容；引用定义不产生 token。
  }

  return {
    revision,
    headings,
    raw: countStats([raw]),
    content: countStats(contentSegments),
    excludedRanges: excluded,
  };
}

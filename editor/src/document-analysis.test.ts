import { describe, expect, it } from "vitest";
import {
  analyzeDocument,
  ExcludedRangeError,
  type DocumentSnapshot,
} from "./document-analysis";

const snap = (raw: string, revision = 7): DocumentSnapshot => ({ raw, revision });

describe("analyzeDocument 快照契约", () => {
  it("按 GFM 自动链接保留 URL 内部的星号显示与统计", () => {
    const result = analyzeDocument(snap("# www.example.org/a*b*\n"));
    expect(result.headings[0].text).toBe("www.example.org/a*b*");
    expect(result.content).toEqual({ characters: 20, writingUnits: 5 });
  });
  it("返回相同 revision 且不修改原文与快照", () => {
    const raw = "# 标题\n\n正文 `code` 行。\n";
    const snapshot = snap(raw, 42);
    const frozen: DocumentSnapshot = Object.freeze({ ...snapshot });
    const result = analyzeDocument(frozen);
    expect(result.revision).toBe(42);
    expect(frozen.raw).toBe(raw);
    expect(result.headings.length).toBeGreaterThan(0);
  });

  it("拒绝非法快照", () => {
    expect(() => analyzeDocument({ raw: 1, revision: 0 } as never)).toThrow(TypeError);
    expect(() => analyzeDocument({ raw: "", revision: NaN })).toThrow(TypeError);
    expect(() => analyzeDocument(null as never)).toThrow(TypeError);
  });

  it("内容统计排除任务标记和表格管道，只计可见 cell 与 label", () => {
    const raw = "- [ ] 中文\n- [x] done\n\n| A | B |\n| --- | --- |\n| x | y |\n";
    const result = analyzeDocument(snap(raw));
    expect(result.content).toEqual({ characters: 10, writingUnits: 7 });
  });
});

describe("大纲：标题识别与原文偏移", () => {
  it("ATX 1–6 级与原文偏移（含 BOM、# 定界符行）", () => {
    const raw = "\uFEFF# 一级\n正文\n## 二级\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => [h.level, h.text])).toEqual([
      [1, "一级"],
      [2, "二级"],
    ]);
    // BOM 后 `#` 的原文索引是 1。
    expect(result.headings[0].start).toBe(1);
    expect(raw.slice(result.headings[0].start, result.headings[0].end)).toBe("# 一级");
    expect(raw.slice(result.headings[1].start, result.headings[1].end)).toBe("## 二级");
  });

  it("CRLF / 混合 EOL / 无尾换行下的偏移", () => {
    const crlf = "# 甲\r\n\r\n## 乙\r\n";
    const r1 = analyzeDocument(snap(crlf));
    expect(crlf.slice(r1.headings[1].start, r1.headings[1].end)).toBe("## 乙");

    const mixed = "# 甲\r\n\r\n## 乙\n正文\n### 丙";
    const r2 = analyzeDocument(snap(mixed));
    expect(mixed.slice(r2.headings[1].start, r2.headings[1].end)).toBe("## 乙");
    expect(mixed.slice(r2.headings[2].start, r2.headings[2].end)).toBe("### 丙");
    expect(r2.headings[2].end).toBe(mixed.length);
  });

  it("Setext 标题包含文本行与下划线行，且与分隔线区分", () => {
    const raw = "标题文本\n===\n\n---\n\n下级\n---\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.level)).toEqual([1, 2]);
    expect(raw.slice(result.headings[0].start, result.headings[0].end)).toBe("标题文本\n===");
    expect(result.headings[1].text).toBe("下级");
  });

  it("重复标题原样保留，不做 slug 去重", () => {
    const result = analyzeDocument(snap("# 同名\n\n# 同名\n"));
    expect(result.headings.map((h) => h.text)).toEqual(["同名", "同名"]);
  });

  it("嵌套引用/列表中的标题仍被识别", () => {
    const raw = "> 引用中\n> # 引用标题\n\n- 列表项\n- # 列表标题\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.text)).toEqual(["引用标题", "列表标题"]);
    expect(raw.slice(result.headings[0].start, result.headings[0].end)).toBe("> # 引用标题");
    expect(raw.slice(result.headings[1].start, result.headings[1].end)).toBe("- # 列表标题");
  });

  it("代码块中的 # 不作为标题；不闭合围栏同规则", () => {
    const raw = "```\n# 假标题\n```\n\n    # 缩进假标题\n\n# 真标题\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.text)).toEqual(["真标题"]);

    const unclosed = "# 真\n\n```\n# 假\n";
    expect(analyzeDocument(snap(unclosed)).headings.map((h) => h.text)).toEqual(["真"]);
  });

  it("显示文本来自 inline token：链接 label、行内代码、图片 alt", () => {
    const raw = '# [链接](https://example.com "标题") 与 `code` 与 ![alt文本](x.png)\n';
    const result = analyzeDocument(snap(raw));
    expect(result.headings[0].text).toBe("链接 与 code 与 alt文本");
  });

  it("空文档无标题、统计为零", () => {
    const result = analyzeDocument(snap(""));
    expect(result.headings).toEqual([]);
    expect(result.raw).toEqual({ characters: 0, writingUnits: 0 });
    expect(result.content).toEqual({ characters: 0, writingUnits: 0 });
  });

describe("回归：UTF-16 排除偏移与围栏/CR 边界", () => {
  it("排除 astral 字素后，后续标题的原文偏移不错位", () => {
    const raw = "😀\n\n# 保留\n";
    const result = analyzeDocument(snap(raw), { excludedRanges: [{ start: 0, end: 2 }] });
    expect(result.headings.map((h) => raw.slice(h.start, h.end))).toEqual(["# 保留"]);
  });

  it("排除 astral 之后的标题：整段 UTF-16 范围屏蔽后标题消失", () => {
    const raw = "😀\n\n# 隐藏\n\n# 保留\n";
    const start = raw.indexOf("# 隐藏");
    const result = analyzeDocument(snap(raw), { excludedRanges: [{ start, end: start + 4 }] });
    expect(result.headings.map((h) => h.text)).toEqual(["保留"]);
  });

  it("排除范围落在 astral 字素前后（BOM/CRLF 混合）仍保持等长屏蔽", () => {
    const raw = "\uFEFFa😀b\r\n# 标\r\n# c\r\n";
    const start = raw.indexOf("b");
    const result = analyzeDocument(snap(raw), { excludedRanges: [{ start, end: start + 1 }] });
    expect(result.headings.map((h) => raw.slice(h.start, h.end))).toEqual(["# 标", "# c"]);
  });

  it("排除范围只含 astral 字素本体（BOM 不计入标题 slice 起点）", () => {
    const raw = "\uFEFF#😀#\n";
    const start = raw.indexOf("😀");
    const result = analyzeDocument(snap(raw), { excludedRanges: [{ start, end: start + 2 }] });
    expect(result.headings.map((h) => raw.slice(h.start, h.end))).toEqual(["#😀#"]);
    expect(result.headings[0].text).toBe(""); // 😀 屏蔽后该 ATX 首标记为空标题
  });

  it("无尾换行的闭合围栏：closing fence 不计内容", () => {
    expect(analyzeDocument(snap("```\nx\n```")).content.characters).toBe(1);
  });

  it("引用与列表内的围栏：容器标记与 closing fence 不计内容", () => {
    expect(analyzeDocument(snap("> ```\n> x\n> ```\n")).content.characters).toBe(1);
    expect(analyzeDocument(snap("- ```\n  x\n  ```\n")).content.characters).toBe(1);
  });

  it("缩进围栏：基准缩进剥离，额外缩进保留计入", () => {
    expect(analyzeDocument(snap("  ```\n  x\n  ```\n")).content.characters).toBe(1);
  });

  it("不闭合围栏在引用内：内容计到引用块文末", () => {
    expect(analyzeDocument(snap("> ```\n> x\n")).content.characters).toBe(1);
  });

  it("孤立 CR 行尾：标题 slice 不带尾部 CR", () => {
    const raw = "# A\r# B\r";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end))).toEqual(["# A", "# B"]);
  });

  it("CR/CRLF 混合文档的标题偏移与切片", () => {
    const raw = "# A\r\n# B\r# C\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end))).toEqual(["# A", "# B", "# C"]);
  });

  it("CRLF：标题后空行/连续空行时首标题 end 不含 CRLF（含 BOM）", () => {
    // 边界切片由原字符串独立定义，不用实现反推 expected。
    const raw = "\uFEFF# 甲\r\n\r\n\r\n## 乙\r\n";
    const first = raw.indexOf("# 甲");
    const second = raw.indexOf("## 乙");
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end)))
      .toEqual(["# 甲", "## 乙"]);
    expect(result.headings[0].start).toBe(first);
    expect(result.headings[0].end).toBe(first + "# 甲".length);
    expect(result.headings[1].start).toBe(second);
    expect(result.headings[1].end).toBe(second + "## 乙".length);
  });

  it("CRLF：标题后无空行、EOF 无尾 EOL 时 end 到标题末字符为止", () => {
    const raw = "# 甲\r\n## 乙"; // 无空行、无尾 EOL
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end)))
      .toEqual(["# 甲", "## 乙"]);
    expect(result.headings[1].end).toBe(raw.length);
  });

  it("CRLF：Setext 标题 end 不含下划线行尾的 CRLF", () => {
    const raw = "甲\r\n===\r\n\r\n# 乙\r\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end)))
      .toEqual(["甲\r\n===", "# 乙"]);
  });

  it("CRLF：嵌套引用/列表内标题与中文/emoji 偏移不漂移", () => {
    const raw = "> - # 甲😀\r\n>   ## 乙\r\n";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => raw.slice(h.start, h.end)))
      .toEqual(["> - # 甲😀", ">   ## 乙"]);
    expect(result.headings.map((h) => h.text)).toEqual(["甲😀", "乙"]);
  });

  it("CRLF：排除范围不因 EOL 归一化映射修复而漂移", () => {
    const raw = "\uFEFFmeta\r\n# 标题\r\n\r\n# 保留\r\n";
    const start = raw.indexOf("meta");
    const result = analyzeDocument(snap(raw), {
      excludedRanges: [{ start, end: start + "meta".length }],
    });
    expect(result.headings.map((h) => raw.slice(h.start, h.end)))
      .toEqual(["# 标题", "# 保留"]);
  });
});
});

describe("统计规则", () => {
  it("中文：每字素一单元；标点分隔不计单元", () => {
    const result = analyzeDocument(snap("中文，写作。"));
    expect(result.content.characters).toBe(6);
    expect(result.content.writingUnits).toBe(4);
  });

  it("英文：字母数字连续串一个单元，空白/下划线/连字符分隔", () => {
    const result = analyzeDocument(snap("hello world foo_bar baz-42"));
    expect(result.content.characters).toBe(23);
    expect(result.content.writingUnits).toBe(6); // hello world foo bar baz 42
  });

  it("中英混排", () => {
    const result = analyzeDocument(snap("使用vitest编写测试"));
    expect(result.content.characters).toBe(12);
    expect(result.content.writingUnits).toBe(7); // 6 个 Han 字素 + vitest 一个连续串
  });

  it("emoji 与 ZWJ 序列：各计 1 字符、0 单元", () => {
    const family = "👨‍👩‍👧‍👦";
    const result = analyzeDocument(snap(`a${family}b`));
    expect(result.content.characters).toBe(3);
    expect(result.content.writingUnits).toBe(2); // a + emoji 分隔后 b
    expect(analyzeDocument(snap("👍👍")).content.characters).toBe(2);
  });

  it("组合重音：一个字素、一个字符、随字母串不拆", () => {
    const result = analyzeDocument(snap("cafe\u0301 au"));
    expect(result.content.characters).toBe(6);
    expect(result.content.writingUnits).toBe(2);
  });

  it("原文口径包含 Markdown 符号与链接目标；内容口径不含", () => {
    const raw = "# 标题\n\n[标签](https://example.com/url) **加粗** `code`\n\n[ref]: https://example.com/def\n";
    const result = analyzeDocument(snap(raw));
    // 原文：所有非空白字素（#、*、`、[、]、url、定义全部计入）。
    expect(result.raw.characters).toBeGreaterThan(result.content.characters);
    // 内容：标题文本 + 标签 + 加粗 + code = 标题|标签|加粗|code
    expect(result.content.writingUnits).toBe(7); // 标题2 + 标签2 + 加粗2 + code1
    expect(result.content.characters).toBe(10);
  });

  it("代码块内容计入内容口径；围栏定界符与信息串不计", () => {
    const raw = "```js\nconst x = 1;\n```\n";
    const result = analyzeDocument(snap(raw));
    expect(result.content.characters).toBe(9); // c o n s t x = 1 ;
    expect(result.content.writingUnits).toBe(3); // const | x | 1
  });

  it("不闭合围栏：内容计到文末", () => {
    const result = analyzeDocument(snap("```\ncode42\n"));
    expect(result.content.writingUnits).toBe(1);
    expect(result.content.characters).toBe(6);
  });
});

describe("excludedRanges", () => {
  const raw = "# 标题\n\n$formula$\n\n正文 text\n";

  it("排除范围不计内容，原文口径不受影响", () => {
    const start = raw.indexOf("$formula$");
    const excluded = [{ start, end: start + "$formula$".length }];
    const base = analyzeDocument(snap(raw));
    const result = analyzeDocument(snap(raw), { excludedRanges: excluded });
    expect(result.raw).toEqual(base.raw);
    expect(result.excludedRanges).toEqual([excluded[0]]);
    expect(result.content.characters).toBe(
      base.content.characters - "$formula$".length,
    );
  });

  it("屏蔽不改变原文快照与 revision", () => {
    const snapshot = snap(raw, 3);
    const before = snapshot.raw;
    analyzeDocument(snapshot, { excludedRanges: [{ start: 0, end: 1 }] });
    expect(snapshot.raw).toBe(before);
  });

  it("拒绝非法、越界、重叠范围", () => {
    const s = snap("abcd");
    expect(() => analyzeDocument(s, { excludedRanges: [{ start: 0.5, end: 2 } as never] }))
      .toThrow(ExcludedRangeError);
    expect(() => analyzeDocument(s, { excludedRanges: [{ start: -1, end: 2 }] }))
      .toThrow(ExcludedRangeError);
    expect(() => analyzeDocument(s, { excludedRanges: [{ start: 1, end: 99 }] }))
      .toThrow(ExcludedRangeError);
    expect(() => analyzeDocument(s, { excludedRanges: [{ start: 0, end: 2 }, { start: 1, end: 3 }] }))
      .toThrow(ExcludedRangeError);
    // 相邻（touching）不重叠，允许。
    expect(() => analyzeDocument(s, { excludedRanges: [{ start: 0, end: 2 }, { start: 2, end: 4 }] }))
      .not.toThrow();
  });

  it("拒绝切断 CRLF 与字素簇", () => {
    const crlf = snap("ab\r\ncd");
    expect(() => analyzeDocument(crlf, { excludedRanges: [{ start: 2, end: 3 }] }))
      .toThrow(ExcludedRangeError); // \r 与 \n 之间
    const surrogate = snap("a👍b");
    expect(() => analyzeDocument(surrogate, { excludedRanges: [{ start: 2, end: 3 }] }))
      .toThrow(ExcludedRangeError); // 代理对内部
    const accent = snap("e\u0301f");
    expect(() => analyzeDocument(accent, { excludedRanges: [{ start: 1, end: 2 }] }))
      .toThrow(ExcludedRangeError);
  });

  it("跨行排除保留换行边界（行结构不塌缩）", () => {
    const text = "aa\nbb\ncc\n";
    const start = text.indexOf("bb");
    const result = analyzeDocument(snap(text), {
      excludedRanges: [{ start, end: start + 2 }],
    });
    expect(result.content.writingUnits).toBe(2); // aa + cc
  });
});


describe("HTML token：不执行也不显示（Spec 审查 INK-M1-016）", () => {
  it("inline HTML 包裹标题与正文：标签不进入显示文本与内容统计", () => {
    const raw = "# <b>Title</b>\n\n<b>x</b>";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.text)).toEqual(["Title"]);
    expect(result.content.characters).toBe(6); // Title + x
    expect(result.content.writingUnits).toBe(2);
    // 原文口径不变：标签字符照常计入 raw。
    expect(result.raw.characters).toBe(raw.replace(/\s/g, "").length);
  });

  it("HTML 注释与 raw block：标题/脚本内容不泄漏进大纲与统计", () => {
    const raw = "# a <!-- comment <script>alert(1)</script> --> b\n\n<!-- raw\n# NotHeading\n-->";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.text)).toEqual(["a  b"]);
    expect(result.content).toEqual({ characters: 2, writingUnits: 2 }); // 仅 a、b
  });

  it("code_inline / 围栏内的 HTML 字面内容仍计入", () => {
    expect(analyzeDocument(snap("`<b>x</b>` 文本")).content).toEqual({
      characters: 10, // < b > x < / b > + 文本
      writingUnits: 5,
    });
    expect(analyzeDocument(snap("```\n<b>keep</b>\n```")).content).toEqual({
      characters: 11,
      writingUnits: 3, // b | keep | b
    });
  });

  it("实体 / 反斜杠转义的 HTML 显示文字不被误删", () => {
    // &lt;b&gt; 解码为字面文本 <b>，按内容计。
    expect(analyzeDocument(snap("a &lt;b&gt; c")).content).toEqual({
      characters: 5, // a < b > c
      writingUnits: 3,
    });
    // \< 转义后 <b> 是字面文本而非标签。
    expect(analyzeDocument(snap("\\<b>literal")).content).toEqual({
      characters: 10,
      writingUnits: 2, // b | literal
    });
  });

  it("BOM/CRLF 原文偏移不变：标题切片仍指向原文", () => {
    const raw = "\uFEFF# <b>汉Ti</b>\r\n正文\r";
    const result = analyzeDocument(snap(raw));
    expect(result.headings[0].text).toBe("汉Ti");
    expect(result.headings[0].start).toBe(1); // BOM 之后
    expect(raw.slice(result.headings[0].start, result.headings[0].end)).toBe("# <b>汉Ti</b>");
  });

  it("危险属性脚本仅 tokenize 不执行：img/script 内容不计统计", () => {
    const result = analyzeDocument(snap('<img src=x onerror=alert(1)> 后文'));
    expect(result.content).toEqual({ characters: 2, writingUnits: 2 }); // 仅 后文
  });

  it("block HTML 按锁定 CommonMark token 语义：内部 Markdown 不解析", () => {
    const raw = "# 前\n\n<div>\n# 不是标题\n*b?*\n</div>\n\n# 后";
    const result = analyzeDocument(snap(raw));
    expect(result.headings.map((h) => h.text)).toEqual(["前", "后"]);
    expect(result.content).toEqual({ characters: 2, writingUnits: 2 }); // 前 + 后
  });
});
describe("实体与文本边界（内容口径）", () => {
  it("HTML 实体按解析后文本计入内容，不执行 HTML", () => {
    const result = analyzeDocument(snap("a&amp;b\n"));
    expect(result.content.characters).toBe(3); // 实体解码为解析文本 a&b
  });
});

describe("有界规模烟测", () => {
  it("约 2000 行样本在界内完成（不宣称 WK 性能预算）", () => {
    const section = Array.from(
      { length: 200 },
      (_, i) => `## 标题${i}\n\n段落 text ${i} 与 `+"`code`"+`。\n`,
    ).join("\n");
    const raw = section.repeat(10);
    const started = Date.now();
    const result = analyzeDocument(snap(raw));
    const elapsed = Date.now() - started;
    expect(result.headings.length).toBe(2000);
    expect(elapsed).toBeLessThan(30_000);
  });
});

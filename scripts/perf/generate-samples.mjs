#!/usr/bin/env node
// Deterministic Markdown sample generator for performance benchmarks.
// Fixed seed; output is byte-identical across runs on the same script version.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SEED = 0x1C0DE; // deterministic across runs
const DEFAULT_OUTPUT = "build/perf-samples";

const TARGETS = [
  { name: "small", bytes: 12_000 },
  { name: "medium", bytes: 150_000 },
  { name: "large", bytes: 1_000_000 },
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const englishWords = [
  "editor", "document", "paragraph", "snapshot", "revision", "bridge",
  "session", "composition", "selection", "undo", "history", "markdown",
  "fence", "list", "heading", "quote", "render", "measure", "baseline",
  "regression", "threshold", "stable", "repeatable", "parser", "serializer",
  "cursor", "keyboard", "window", "sandbox", "offline", "storage",
];

const cjkWords = [
  "编辑器", "文档", "段落", "快照", "修订", "桥接", "会话", "输入法",
  "选区", "撤销", "历史", "基准", "回归", "阈值", "稳定", "序列化",
  "解析", "渲染", "光标", "键盘", "窗口", "沙盒", "离线", "存储",
  "中文", "协作", "性能", "测量", "报告", "列表", "标题", "引用",
];

const codeLines = [
  "function measure(operation, options) {",
  "  const samples = [];",
  "  for (let index = 0; index < options.samples; index += 1) {",
  "    const start = performance.now();",
  "    operation();",
  "    samples.push(performance.now() - start);",
  "  }",
  "  return samples.sort((a, b) => a - b);",
  "}",
  "struct DocumentStorage {",
  "  private let lock = NSLock()",
  "  private var text: String = \"\"",
  "  func get() -> String { lock.withLock { text } }",
  "}",
  "let configuration = WKWebViewConfiguration()",
  "configuration.websiteDataStore = .nonPersistent()",
  "bridge.attach(webView: webView)",
  "try document.read(from: data, ofType: markdownType)",
];

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function sentenceEN(rng, { long = false } = {}) {
  const words = long ? 30 + Math.floor(rng() * 30) : 8 + Math.floor(rng() * 12);
  const parts = [];
  for (let index = 0; index < words; index += 1) parts.push(pick(rng, englishWords));
  const text = parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

function sentenceCJK(rng, { long = false } = {}) {
  const count = long ? 18 + Math.floor(rng() * 14) : 5 + Math.floor(rng() * 6);
  const parts = [];
  for (let index = 0; index < count; index += 1) parts.push(pick(rng, cjkWords));
  return parts.join("") + "。";
}

function paragraphEN(rng) {
  const long = rng() < 0.2;
  return sentenceEN(rng, { long });
}

function paragraphCJK(rng) {
  const long = rng() < 0.25;
  return sentenceCJK(rng, { long });
}

function paragraphMixed(rng) {
  return `${sentenceEN(rng)} ${sentenceCJK(rng)}`;
}

function paragraphInline(rng) {
  const word = pick(rng, englishWords);
  const cjk = pick(rng, cjkWords);
  return [
    `**${word}** 与 *${cjk}* 构成格式段落，`,
    "包含 ~~删除线~~、``代码片段``、",
    `[链接文本](https://example.com/${word})`,
    "以及行内混排 English 与中文标点。",
  ].join("");
}

function headingATX(rng) {
  const level = 1 + Math.floor(rng() * 4);
  return `${"#".repeat(level)} ${pick(rng, cjkWords)}与${pick(rng, englishWords)}`;
}

function headingSetext(rng) {
  const marker = rng() < 0.5 ? "=" : "-";
  const title = `${sentenceEN(rng).replace(/\.$/, "")} ${pick(rng, cjkWords)}`;
  return `${title}\n${marker.repeat(6)}`;
}

function codeBlock(rng) {
  const languages = ["swift", "typescript", "json", "shell"];
  const language = pick(rng, languages);
  const count = 6 + Math.floor(rng() * 14);
  const body = [];
  for (let index = 0; index < count; index += 1) {
    const line = pick(rng, codeLines);
    body.push(`${line} // ${index}`);
  }
  // Always close the fence so the sample stays in structured editing mode.
  return `\`\`\`${language}\n${body.join("\n")}\n\`\`\``;
}

function codeBlockTilde(rng) {
  const count = 4 + Math.floor(rng() * 8);
  const body = [];
  for (let index = 0; index < count; index += 1) {
    body.push(`data: ${index}, value: ${pick(rng, englishWords)}_${index}`);
  }
  return `~~~text\n${body.join("\n")}\n~~~`;
}

function bulletList(rng) {
  const count = 4 + Math.floor(rng() * 6);
  const loose = rng() < 0.3;
  const marker = rng() < 0.5 ? "-" : "*";
  const items = [];
  for (let index = 0; index < count; index += 1) {
    const text = rng() < 0.4 ? sentenceCJK(rng) : sentenceEN(rng);
    items.push(`${marker} ${text}`);
  }
  return items.join(loose ? "\n\n" : "\n");
}

function orderedList(rng) {
  const count = 4 + Math.floor(rng() * 6);
  const delimiter = rng() < 0.5 ? "." : ")";
  const items = [];
  for (let index = 1; index <= count; index += 1) {
    items.push(`${index}${delimiter} ${rng() < 0.5 ? sentenceEN(rng) : sentenceCJK(rng)}`);
  }
  return items.join("\n");
}

function blockquote(rng) {
  const count = 2 + Math.floor(rng() * 3);
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    lines.push(`> ${sentenceEN(rng)}`);
  }
  if (rng() < 0.5) {
    lines.push(`> - ${sentenceCJK(rng)}`);
    lines.push(`> - ${sentenceCJK(rng)}`);
  }
  return lines.join("\n");
}

const blockBuilders = [
  { weight: 26, build: paragraphEN },
  { weight: 22, build: paragraphCJK },
  { weight: 8, build: paragraphMixed },
  { weight: 8, build: paragraphInline },
  { weight: 8, build: headingATX },
  { weight: 3, build: headingSetext },
  { weight: 10, build: codeBlock },
  { weight: 3, build: codeBlockTilde },
  { weight: 6, build: bulletList },
  { weight: 4, build: orderedList },
  { weight: 4, build: blockquote },
];

const totalWeight = blockBuilders.reduce((sum, entry) => sum + entry.weight, 0);

function nextBlock(rng) {
  let ticket = rng() * totalWeight;
  for (const entry of blockBuilders) {
    ticket -= entry.weight;
    if (ticket <= 0) return entry.build(rng);
  }
  return paragraphEN(rng);
}

function generateDocument(targetBytes) {
  const rng = mulberry32(SEED);
  const blocks = [];
  let text = "";
  let guard = 0;
  while (Buffer.byteLength(text, "utf8") < targetBytes && guard < 200_000) {
    const block = nextBlock(rng);
    blocks.push(block);
    text = `${text}${text.length > 0 ? "\n\n" : ""}${block}\n`;
    guard += 1;
  }
  return text;
}

function sha256(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--output" && argv[index + 1] !== undefined) {
      args.output = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const outputDir = resolve(process.cwd(), args.output);

const manifest = {
  schema: 1,
  seed: SEED,
  files: {},
};

for (const target of TARGETS) {
  const text = generateDocument(target.bytes);
  const file = join(outputDir, `${target.name}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
  manifest.files[target.name] = {
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split("\n").length,
    blocks: text.split("\n\n").length,
    sha256: sha256(text),
  };
}

// CRLF variant of the large sample: forces the source-mode runtime so the
// bridge snapshot round trip can be measured with deterministic content.
const source = readFileSync(join(outputDir, "large.md"), "utf8");
const converted = source.replace(/\n/g, "\r\n");
writeFileSync(join(outputDir, "large-crlf.md"), converted, "utf8");
manifest.files["large-crlf"] = {
  bytes: Buffer.byteLength(converted, "utf8"),
  lines: converted.split("\n").length,
  blocks: converted.split("\n\n").length,
  sha256: sha256(converted),
};

writeFileSync(
  join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const summary = Object.entries(manifest.files)
  .map(
    ([name, info]) =>
      `${name}: ${info.bytes} bytes, ${info.lines} lines, sha256 ${info.sha256.slice(0, 12)}`,
  )
  .join("\n");
process.stdout.write(`Samples written to ${outputDir} (seed ${SEED}):\n${summary}\n`);

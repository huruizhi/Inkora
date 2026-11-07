#!/usr/bin/env node
// Compares performance results against the checked-in baseline and reports
// regressions. Exit policy: warnings by default; `--fail` (or
// INKORA_PERF_STRICT=1) exits non-zero when any metric exceeds its threshold.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const BASELINE_DEFAULT = "docs/perf/baseline.json";
const RESULTS_DEFAULT = "build/perf-results";

function parseArgs(argv) {
  const args = {
    baseline: BASELINE_DEFAULT,
    resultsDir: RESULTS_DEFAULT,
    fail: process.env.INKORA_PERF_STRICT === "1",
    report: null,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--baseline" && argv[index + 1] !== undefined) {
      args.baseline = argv[index + 1];
      index += 1;
    } else if (flag === "--results-dir" && argv[index + 1] !== undefined) {
      args.resultsDir = argv[index + 1];
      index += 1;
    } else if (flag === "--report" && argv[index + 1] !== undefined) {
      args.report = argv[index + 1];
      index += 1;
    } else if (flag === "--fail") {
      args.fail = true;
    }
  }
  return args;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function loadResults(resultsDir) {
  const results = [];
  const dir = resolve(resultsDir);
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".json") || entry === "environment.json" || entry === "comparison.json") {
      continue;
    }
    const parsed = JSON.parse(readFileSync(join(dir, entry), "utf8"));
    if (parsed && typeof parsed === "object" && parsed.metrics && parsed.layer) {
      results.push({ file: entry, ...parsed });
    }
  }
  return results;
}

const args = parseArgs(process.argv);
const baselinePath = resolve(process.cwd(), args.baseline);
if (!existsSync(baselinePath)) {
  process.stderr.write(`Baseline not found: ${baselinePath}\n`);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const results = loadResults(args.resultsDir);

if (results.length === 0) {
  process.stderr.write(`No perf result files found in ${resolve(args.resultsDir)}\n`);
  process.exit(2);
}

const measuredProfiles = new Set(
  results.flatMap((result) => {
    if (Array.isArray(result.profile)) return result.profile;
    return result.profile !== undefined ? [result.profile] : [];
  }),
);
const current = new Map();
for (const result of results) {
  for (const [name, metric] of Object.entries(result.metrics)) {
    current.set(`${result.layer}.${name}`, { ...metric, file: result.file });
  }
}

const threshold = baseline.threshold?.relative ?? 0.2;
const rows = [];
let regressions = 0;

for (const [name, entry] of Object.entries(baseline.metrics)) {
  const metric = current.get(name);
  if (!metric) {
    const profiles = entry.profiles ?? [];
    if (profiles.length > 0 && !profiles.some((profile) => measuredProfiles.has(profile))) {
      rows.push({ name, status: "skipped", note: `not measured (needs profile: ${profiles.join("+")})` });
      continue;
    }
    rows.push({ name, status: "missing", note: "expected from baseline but absent in results" });
    continue;
  }
  const base = entry.value;
  const value = metric.value;
  const ratio = base > 0 ? value / base : Number.POSITIVE_INFINITY;
  const delta = (ratio - 1) * 100;
  if (ratio > 1 + threshold) {
    regressions += 1;
    rows.push({
      name,
      status: "REGRESSION",
      base,
      value,
      unit: metric.unit ?? entry.unit,
      delta: `+${delta.toFixed(1)}%`,
      cv: metric.cv,
    });
  } else if (base > 0 && ratio < 1 - threshold) {
    rows.push({
      name,
      status: "improved",
      base,
      value,
      unit: metric.unit ?? entry.unit,
      delta: `${delta.toFixed(1)}%`,
      cv: metric.cv,
    });
  } else {
    rows.push({
      name,
      status: "ok",
      base,
      value,
      unit: metric.unit ?? entry.unit,
      delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
      cv: metric.cv,
    });
  }
}

for (const [name, metric] of current) {
  if (baseline.metrics[name] === undefined) {
    rows.push({
      name,
      status: "new",
      note: "no baseline entry (consider updating docs/perf/baseline.json)",
      value: metric.value,
      unit: metric.unit,
    });
  }
}

function formatRow(row) {
  const base = row.base !== undefined ? row.base.toFixed(3) : "-";
  const value = row.value !== undefined ? row.value.toFixed(3) : "-";
  const delta = row.delta ?? "-";
  const cv = row.cv !== undefined ? row.cv.toFixed(3) : "-";
  return `| ${row.name} | ${row.status} | ${base} | ${value} | ${row.unit ?? "-"} | ${delta} | ${cv} |`;
}

const lines = [
  "# Performance baseline comparison",
  "",
  `Baseline: ${baselinePath} (recorded ${baseline.recordedAt ?? "unknown"})`,
  `Results: ${resolve(args.resultsDir)} (${results.map((result) => result.file).join(", ")})`,
  `Profiles measured: ${[...measuredProfiles].join(", ") || "unknown"}`,
  `Threshold: +${(threshold * 100).toFixed(0)}% relative regression`,
  "",
  "| metric | status | baseline | current | unit | delta | cv |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(formatRow),
  "",
];

for (const row of rows) {
  if (row.cv !== undefined && row.cv > 0.25) {
    lines.push(`WARNING: ${row.name} is noisy (cv=${row.cv.toFixed(3)} > 0.25); treat with caution.`);
  }
}
if (regressions > 0) {
  lines.push(
    `REGRESSIONS: ${regressions} metric(s) exceeded the +${(threshold * 100).toFixed(0)}% threshold.`,
  );
} else {
  lines.push("No regressions beyond threshold.");
}

const report = lines.join("\n");
process.stdout.write(`${report}\n`);

if (args.report) {
  const reportPath = resolve(process.cwd(), args.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${report}\n`, "utf8");
}

if (args.fail && regressions > 0) {
  process.exit(1);
}

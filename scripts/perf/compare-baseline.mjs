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
let invalid = 0;

for (const [name, entry] of Object.entries(baseline.metrics)) {
  const metric = current.get(name);
  if (!metric) {
    const profiles = entry.profiles ?? [];
    if (profiles.length > 0 && !profiles.some((profile) => measuredProfiles.has(profile))) {
      rows.push({ name, status: "skipped", note: `not measured (needs profile: ${profiles.join("+")})` });
      continue;
    }
    invalid += 1;
    rows.push({ name, status: "missing", note: "expected from baseline but absent in results" });
    continue;
  }
  if (!Number.isFinite(metric.value) || metric.value < 0 || metric.unit !== entry.unit) {
    invalid += 1;
    rows.push({ name, status: "invalid", note: "non-finite/negative value or unit mismatch" });
    continue;
  }
  const base = entry.value;
  const value = metric.value;
  const ratio = base > 0 ? value / base : value === 0 ? 1 : Number.POSITIVE_INFINITY;
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

const environmentPath = join(resolve(args.resultsDir), "environment.json");
const environment = existsSync(environmentPath)
  ? JSON.parse(readFileSync(environmentPath, "utf8")) : {};
const manifestPath = resolve("build/perf-samples/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const sampleWarnings = Object.entries(baseline.samples ?? {}).flatMap(([name, sample]) => {
  if (manifest?.files?.[name]?.sha256 === sample.sha256) return [];
  invalid += 1;
  return [`WARNING: sample ${name} missing or changed; regenerate/rebaseline before comparing.`];
});

const environmentWarnings = ["model", "chip", "memoryGB", "macOS", "node"].filter(
  (key) => environment[key] !== baseline.environment?.[key],
).map((key) => `WARNING: environment ${key}: baseline=${baseline.environment?.[key]}, current=${environment[key]}; cross-machine comparisons are advisory.`);

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
  ...rows.filter((row) => row.note).map((row) => `${row.status}: ${row.name}: ${row.note}`),
  ...environmentWarnings,
  ...sampleWarnings,
  "",
];

for (const row of rows) {
  if (row.cv !== undefined && row.cv > 0.25) {
    lines.push(`WARNING: ${row.name} is noisy (cv=${row.cv.toFixed(3)} > 0.25); treat with caution.`);
  }
}
if (invalid > 0) lines.push(`INVALID: ${invalid} missing/invalid metrics or changed samples.`);
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

if (args.fail && (regressions > 0 || invalid > 0)) {
  process.exit(1);
}

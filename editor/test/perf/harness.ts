import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type PerfProfileName = "light" | "full";

export interface MetricResult {
  unit: "ms" | "MB";
  value: number;
  samples: number[];
  cv: number;
}

const PROFILE_DEFAULT: PerfProfileName = "light";
const PROFILE_RUNS: Record<PerfProfileName, { warmup: number; samples: number }> = {
  light: { warmup: 1, samples: 5 },
  full: { warmup: 2, samples: 9 },
};

export function currentProfile(): PerfProfileName {
  const value = process.env.INKORA_PERF_PROFILE;
  return value === "full" ? "full" : PROFILE_DEFAULT;
}

export function runs(): { warmup: number; samples: number } {
  return PROFILE_RUNS[currentProfile()];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Deterministic sampling: warmup runs, then N timed samples; reports the
 * median as the metric value and the coefficient of variation for noise.
 */
export function measureMilliseconds(
  operation: () => void,
  options: { warmup?: number; samples?: number } = {},
): MetricResult {
  const { warmup, samples } = { ...runs(), ...options };
  for (let index = 0; index < warmup; index += 1) operation();
  const timings: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    operation();
    timings.push(performance.now() - start);
  }
  return {
    unit: "ms",
    value: median(timings),
    samples: timings,
    cv: coefficientOfVariation(timings),
  };
}

/**
 * Like measureMilliseconds, but the operation runs `iterations` inner units of
 * work per sample; the reported value is the per-unit median in milliseconds.
 */
export function measurePerIteration(
  iterations: number,
  operation: () => void,
  options: { warmup?: number; samples?: number } = {},
): MetricResult {
  const result = measureMilliseconds(operation, options);
  return { ...result, value: result.value / iterations };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const recordedMetrics = new Map<string, MetricResult>();

export function recordMetric(name: string, result: MetricResult): void {
  if (recordedMetrics.has(name)) {
    throw new Error(`Perf metric recorded twice: ${name}`);
  }
  recordedMetrics.set(name, result);
  const value =
    result.unit === "ms"
      ? `${result.value.toFixed(3)} ms (cv ${result.cv.toFixed(3)})`
      : `${result.value.toFixed(3)} MB`;
  console.log(`[perf] ${name}: ${value}`);
}

/** Writes all recorded metrics into the shared results JSON (merging runs). */
export function writeResults(layer: string, file: string): void {
  const target =
    process.env.INKORA_PERF_OUTPUT ??
    join(process.cwd(), "..", "build", "perf-results", file);
  const output = resolve(process.cwd(), target);
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(output, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  type StoredMetric = { unit: string; value: number; cv: number };
  const metrics: Record<string, StoredMetric> = {
    ...((existing.metrics as Record<string, StoredMetric>) ?? {}),
  };
  for (const [name, result] of recordedMetrics) {
    metrics[name] = { unit: result.unit, value: round(result.value, 4), cv: round(result.cv, 4) };
  }
  const payload = {
    schema: 1,
    layer,
    profile: currentProfile(),
    metrics,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[perf] wrote ${Object.keys(metrics).length} ${layer} metrics to ${output}`);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

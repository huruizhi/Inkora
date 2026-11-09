import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, expect, it } from "vitest";
import { SourceAuthoritySession } from "../../src/source-authority";
import { loadSample } from "./samples";

const allowed = ["small", "medium", "large", "large-crlf", "mixed"];
const names = (process.env.INKORA_PRODUCTION_PERF_SIZES ?? allowed.join(",")).split(",");
if (names.some(name => !allowed.includes(name))) throw Error("Unknown production perf sample");
const metrics: Record<string, unknown> = {};
const inputs: Record<string, unknown> = {};
const repetitions = 5;
const sha = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");

function record(name: string, samples: number[]): void {
  const ordered = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const cv = mean === 0 ? 0 : Math.sqrt(samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length) / mean;
  const value = ordered[Math.floor(ordered.length / 2)]!;
  metrics[name] = { unit: "ms", value, samples, cv,
    p95: ordered[Math.ceil(ordered.length * 0.95) - 1], min: ordered[0], max: ordered.at(-1) };
  console.log(`[production-model] ${name}: median=${value.toFixed(3)}ms cv=${cv.toFixed(3)}`);
}

for (const name of names) {
  it(`measures production source-authority workflows for ${name}`, () => {
    const raw = name === "mixed"
      ? readFileSync(new URL("./production-mixed.md", import.meta.url), "utf8")
      : loadSample(name).text;
    inputs[name] = { sha256: sha(raw), bytes: Buffer.byteLength(raw), utf16: raw.length };
    // All fixed inputs start with a plain ATX title. The oracle is insertion
    // immediately after its prefix, with every other byte unchanged.
    const prefix = raw.match(/^#{1,6} /)?.[0];
    expect(prefix).toBeDefined();
    const caret = prefix!.length;
    const expected = raw.slice(0, caret) + "字" + raw.slice(caret);
    const timings: Record<string, number[]> = {};
    function timed<T>(key: string, warmup: boolean, operation: () => T): T {
      const start = performance.now();
      const result = operation();
      const elapsed = performance.now() - start;
      if (!warmup) (timings[key] ??= []).push(elapsed);
      return result;
    }
    for (let iteration = -1; iteration < repetitions; iteration++) {
      const warmup = iteration === -1;
      const session = timed("open-auditable", warmup, () => {
        const value = new SourceAuthoritySession(raw);
        if (!value.saveEligible) throw Error(`Input not eligible: ${value.diagnostic}`);
        return value;
      });
      expect(session.currentRaw).toBe(raw);
      const inserted = timed("select-and-input", warmup, () => {
        if (!session.setRawSelection(caret)) return false;
        return session.nativeType("字") && session.saveEligible;
      });
      expect(inserted, session.diagnostic).toBe(true);
      expect(session.currentRaw).toBe(expected);
      const snapshot = timed("eligible-snapshot", warmup, () => ({
        eligible: session.saveEligible, raw: session.currentRaw,
      }));
      expect(snapshot).toEqual({ eligible: true, raw: expected });
      const history = { past: session.past.length, future: session.future.length,
        version: session.version, selection: { ...session.rawSelection } };
      expect(timed("source-no-op", warmup, () => session.beginSource() && session.applySource())).toBe(true);
      expect(timed("savepoint", warmup, () => session.saveMemory())).toBe(true);
      expect(session.savedRaw).toBe(expected);
      expect(session.documentDirty).toBe(false);
      expect({ past: session.past.length, future: session.future.length,
        version: session.version, selection: session.rawSelection }).toEqual(history);
      expect(session.undo()).toBe(true);
      expect(session.currentRaw).toBe(raw);
      expect(session.redo()).toBe(true);
      expect(session.currentRaw).toBe(expected);
    }
    for (const [operation, samples] of Object.entries(timings)) record(`${operation}/${name}`, samples);
  });
}

afterAll(() => {
  const output = resolve(process.env.INKORA_PRODUCTION_PERF_OUTPUT ?? "../build/production-perf/model.json");
  const sourcePaths = ["source-authority.ts", "source-document.ts", "source-ledger.ts", "source-transaction.ts",
    "markdown-codec.ts", "gfm-autolinks.ts"];
  const sources = Object.fromEntries(sourcePaths.map(path => [path,
    sha(readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8"))]));
  const payload = { schema: 1, layer: "production-model-node", repetitions, warmup: 1,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    node: process.version, sources, inputs, metrics,
    boundaries: "Public SourceAuthoritySession; no DOM, Bridge, disk, visible paint or physical IME" };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(payload, null, 2) + "\n");
  console.log(`[production-model] wrote ${output}`);
});

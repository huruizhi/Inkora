import { readFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLES_DIRECTORY =
  process.env.INKORA_PERF_SAMPLES_DIR ??
  join(process.cwd(), "..", "build", "perf-samples");

export interface Sample {
  readonly name: string;
  readonly text: string;
  readonly bytes: number;
  readonly lines: number;
}

export function loadSample(name: string): Sample {
  try {
    const text = readFileSync(join(SAMPLES_DIRECTORY, `${name}.md`), "utf8");
    return {
      name,
      text,
      bytes: Buffer.byteLength(text, "utf8"),
      lines: text.split("\n").length,
    };
  } catch {
    throw new Error(
      `Perf sample "${name}" not found under ${SAMPLES_DIRECTORY}. ` +
        "Run `make perf-samples` (or scripts/perf/generate-samples.mjs) first.",
    );
  }
}

export function sampleDirectory(): string {
  return SAMPLES_DIRECTORY;
}

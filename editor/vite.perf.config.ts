import { defineConfig } from "vitest/config";

// Dedicated config for deterministic performance runs:
// single worker, no file parallelism, long timeouts. Only *.perf.ts files
// under test/perf are included; the default `vitest run` (make test-editor)
// never picks them up.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/perf/**/*.perf.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});

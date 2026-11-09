import { defineConfig } from "vitest/config";

// Opt-in: does not add production workflows to the historical light baseline.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/perf/source-authority.bench.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 600_000,
  },
});

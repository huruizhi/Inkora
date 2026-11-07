#!/usr/bin/env node
// Collects hardware and toolchain information for performance baselines.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { output: "build/perf-results/environment.json" };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--output" && argv[index + 1] !== undefined) {
      args.output = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const output = resolve(process.cwd(), args.output);

const xcodeVersion = run("xcodebuild", ["-version"]) ?? null;
const xcodeLines = xcodeVersion ? xcodeVersion.split("\n") : [];
const memoryBytes = run("sysctl", ["-n", "hw.memsize"]);

const environment = {
  schema: 1,
  model: run("sysctl", ["-n", "hw.model"]),
  chip: run("sysctl", ["-n", "machdep.cpu.brand_string"]),
  memoryGB: memoryBytes ? Math.round(Number(memoryBytes) / 1024 / 1024 / 1024) : null,
  macOS: run("sw_vers", ["-productVersion"]),
  xcode: xcodeLines[0] ?? null,
  xcodeBuild: xcodeLines[1] ?? null,
  node: run("node", ["--version"]),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(environment, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(environment, null, 2)}\n`);

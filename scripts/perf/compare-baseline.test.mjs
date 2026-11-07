// Exercise exit policy with synthetic data; never measures wall clock or starts UI.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'inkora-perf-compare-'));
try {
  const baseline = join(directory, 'baseline.fixture');
  writeFileSync(baseline, JSON.stringify({ metrics: {
    'editor.parse/large': { unit: 'ms', value: 10, profiles: ['light'] },
    'launch.launch/warm': { unit: 'ms', value: 100, profiles: ['full'] },
  }, threshold: { relative: 0.2 } }));
  const run = (metric, strict, profile = 'light') => {
    writeFileSync(join(directory, 'editor.json'), JSON.stringify({ layer: 'editor', profile, metrics: metric }));
    return spawnSync(process.execPath, ['scripts/perf/compare-baseline.mjs', '--baseline', baseline,
      '--results-dir', directory, ...(strict ? ['--fail'] : [])], {
      encoding: 'utf8', env: { ...process.env, INKORA_PERF_STRICT: '0' },
    });
  };
  const metric = (value, unit = 'ms') => ({ 'parse/large': { unit, value } });
  assert.equal(run(metric(12), true).status, 0);
  assert.match(run(metric(13), false).stdout, /REGRESSION/);
  assert.equal(run(metric(13), false).status, 0);
  assert.equal(run(metric(13), true).status, 1);
  assert.equal(run({}, true).status, 1);
  assert.equal(run(metric(10, 'MB'), true).status, 1);
  assert.equal(run(metric(null), true).status, 1);
  assert.equal(run(metric(10), true, 'full').status, 1);
  console.log('Performance comparison: threshold, warn/strict, missing, invalid and profile checks passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

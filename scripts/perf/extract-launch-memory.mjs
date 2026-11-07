// Extract XCTest's target-app physical peak, not RSS or a WebKit process tree.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const [bundle, output] = process.argv.slice(2);
const results = JSON.parse(execFileSync('xcrun', ['xcresulttool', 'get', 'test-results', 'metrics',
  '--path', bundle, '--compact'], { encoding: 'utf8' }));
const metrics = results.filter((test) => test.testIdentifier ===
  'PerformanceBaselineUITests/testApplicationMemoryMetric()')
  .flatMap((test) => test.testRuns.flatMap((run) => run.metrics));
const metric = metrics.find((entry) => entry.identifier === 'com.apple.dt.XCTMetric_Memory.physical_peak');
if (!metric || metric.unitOfMeasurement !== 'kB' || !metric.measurements.length ||
    metric.measurements.some((value) => !Number.isFinite(value) || value <= 0)) {
  throw new Error('Missing or invalid XCTest app peak physical memory samples');
}
const values = metric.measurements.map((value) => value / 1000).sort((a, b) => a - b);
const middle = Math.floor(values.length / 2);
const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
const cv = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / mean;
const payload = JSON.parse(readFileSync(output, 'utf8'));
payload.metrics['launch/peak-physical-memory'] = { unit: 'MB', value: median, cv };
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`App physical memory peak: ${median.toFixed(2)} MB (cv ${cv.toFixed(3)})`);

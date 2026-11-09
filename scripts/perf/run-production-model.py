#!/usr/bin/env python3
"""Run each production-model vector in its own bounded process group."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
NAMES = ['small', 'medium', 'large', 'large-crlf', 'mixed']


def stop(process):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pnpm', default=str(ROOT / '.tools/node_modules/.bin/pnpm'))
    parser.add_argument('--timeout-seconds', type=float, default=60)
    args = parser.parse_args()
    if not math.isfinite(args.timeout_seconds) or not 1 <= args.timeout_seconds <= 600:
        parser.error('timeout must be finite and between 1 and 600 seconds')
    names = os.environ.get('INKORA_PRODUCTION_PERF_SIZES', ','.join(NAMES)).split(',')
    if any(n not in NAMES for n in names) or len(set(names)) != len(names):
        parser.error('unknown or duplicate production sample')
    output = Path(os.environ.get('INKORA_PRODUCTION_PERF_DIR', ROOT / 'build/production-perf'))
    output.mkdir(parents=True, exist_ok=True)
    samples = Path(os.environ.get('INKORA_PERF_SAMPLES_DIR', ROOT / 'build/perf-samples'))
    report = {'schema': 1, 'layer': 'production-model-node', 'inputs': {}, 'metrics': {},
              'requestedNames': names, 'completed': False,
              'startedAt': datetime.now(timezone.utc).isoformat(),
              'attempts': [], 'commit': subprocess.check_output(
                  ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'boundary': 'Node public model only; no DOM, WK, visible paint, native write or IME'}
    (output / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    for name in names:
        raw_path = ROOT / 'editor/test/perf/production-mixed.md' if name == 'mixed' else samples / (name + '.md')
        raw = raw_path.read_bytes()
        input_sha = hashlib.sha256(raw).hexdigest()
        report['inputs'][name] = {'sha256': input_sha, 'bytes': len(raw)}
        case_output = output / (name + '.json')
        case_output.unlink(missing_ok=True)
        env = dict(os.environ, INKORA_PRODUCTION_PERF_SIZES=name,
                   INKORA_PRODUCTION_PERF_OUTPUT=str(case_output.resolve()),
                   INKORA_PERF_SAMPLES_DIR=str(samples.resolve()))
        start = time.monotonic()
        status = 'failed'
        with (output / (name + '.log')).open('w') as log:
            process = subprocess.Popen([args.pnpm, '--dir', 'editor', 'exec', 'vitest', 'run',
                                        '--config', 'vite.production-perf.config.ts'],
                                       cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            try:
                code = process.wait(timeout=args.timeout_seconds)
                status = 'passed' if code == 0 else 'failed'
            except subprocess.TimeoutExpired:
                stop(process)
                code = process.returncode
                status = 'timed-out'
            finally:
                stop(process)
        if status == 'passed':
            try:
                case = json.loads(case_output.read_text())
                assert case['inputs'][name]['sha256'] == input_sha
                assert len(case['metrics']) == 5
                assert all(len(m['samples']) == 5 for m in case['metrics'].values())
                report['metrics'].update(case['metrics'])
                report['sources'] = case['sources']
                report['node'] = case['node']
            except (OSError, ValueError, KeyError, AssertionError):
                status = 'invalid-evidence'
        report['attempts'].append({'name': name, 'status': status, 'exitCode': code,
                                   'elapsedSeconds': time.monotonic() - start,
                                   'limitSeconds': args.timeout_seconds})
        (output / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'{name}: {status} ({report["attempts"][-1]["elapsedSeconds"]:.2f}s)', flush=True)
    report['completed'] = True
    (output / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if all(a['status'] == 'passed' for a in report['attempts']) else 1


if __name__ == '__main__':
    raise SystemExit(main())

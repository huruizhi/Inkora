#!/usr/bin/env python3
"""Verify frozen expected bytes, never drive or certify the product."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'cases.json').read_text())
seen = set()
checks = 0
for case in manifest['cases']:
    assert case['id'] not in seen
    seen.add(case['id'])
    before = (root / case['input']).read_bytes()
    expected = (root / case['expected']).read_bytes()
    for data, prefix in [(before, 'input'), (expected, 'expected')]:
        data.decode('utf8')
        assert len(data) == case[prefix + '_bytes']
        assert hashlib.sha256(data).hexdigest() == case[prefix + '_sha256']
        checks += 3
    derived = before
    for op in case['operations']:
        old, new = op['find'].encode('utf8'), op['replace'].encode('utf8')
        assert derived.count(old) == 1, (case['id'], 'ambiguous operation')
        derived = derived.replace(old, new, 1)
        checks += 1
    assert derived == expected, (case['id'], 'expected bytes disagree with declared intent')
    checks += 1
assert len(seen) == 12
print(f'PASS: {len(seen)} frozen cases, {checks} byte/derivation checks; product NOT EXECUTED')

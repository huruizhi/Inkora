#!/usr/bin/env python3
"""Verify frozen byte oracles; this does not execute or certify the editor."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
manifest = json.loads((root / "cases.json").read_text())
checks = 0
listed = set()
assert manifest["schema"] == 1
assert len(manifest["cases"]) == 14
for case in manifest["cases"]:
    original = (root / case["input"]).read_bytes()
    expected = (root / case["expected"]).read_bytes()
    listed.update((case["input"], case["expected"]))
    for data, prefix in ((original, "input"), (expected, "expected")):
        assert len(data) == case[prefix + "Bytes"], case["name"]
        assert hashlib.sha256(data).hexdigest() == case[prefix + "SHA256"], case["name"]
        assert data.decode("utf-8").encode("utf-8") == data, case["name"]
        checks += 3
    derived = original
    for patch in case["derivation"]:
        start, end = patch["fromByte"], patch["toByte"]
        old = bytes.fromhex(patch["expectedHex"])
        new = bytes.fromhex(patch["insertHex"])
        assert 0 <= start <= end <= len(derived), case["name"]
        assert derived[start:end] == old, case["name"]
        derived = derived[:start] + new + derived[end:]
        checks += 2
    assert derived == expected, case["name"]
    if case["kind"] != "replace-all":
        assert original == expected and case["derivation"] == [], case["name"]
        checks += 1
    checks += 1
assert listed == {str(p.relative_to(root)) for p in (root / "cases").rglob("*.md")}
checks += 1
print(f"14 cases, {checks} checks passed; product behavior NOT executed")

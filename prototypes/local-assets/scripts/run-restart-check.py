#!/usr/bin/env python3
"""INK-PROT-021：真实子进程 SIGKILL 后，从磁盘记录启动全新恢复进程。"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BINARY = ROOT / ".build" / "persistent-recovery"
EVIDENCE = ROOT / "evidence" / "restart-recovery-results.json"
PHASES = [
    "after-import-before-save",
    "after-partial-publish",
    "after-all-published-before-markdown",
    "after-markdown-before-final-confirm",
]
EXPECTED_CHECKPOINT = {
    "after-import-before-save": "imported",
    "after-partial-publish": "partially-published",
    "after-all-published-before-markdown": "assets-published",
    "after-markdown-before-final-confirm": "markdown-committed-unconfirmed",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and not path.is_symlink():
            result[str(path.relative_to(root))] = digest(path)
        elif path.is_symlink():
            result[str(path.relative_to(root))] = "symlink:" + os.readlink(path)
    return result


def wait_ready(root: Path, proc: subprocess.Popen[bytes], timeout: float = 10) -> dict:
    ready = root / "ready.json"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if ready.exists():
            try:
                return json.loads(ready.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        if proc.poll() is not None:
            raise AssertionError(f"worker exited before ready: rc={proc.returncode}, stderr={proc.stderr.read().decode()}")
        time.sleep(0.02)
    raise AssertionError("worker ready timeout")


def start_and_kill(root: Path, operation: str, phase: str) -> dict:
    proc = subprocess.Popen(
        [str(BINARY), "worker", str(root), operation, phase],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    ready = wait_ready(root, proc)
    assert ready["pid"] == proc.pid
    assert ready["operation"] == operation
    assert ready["phase"] == phase
    assert ready["checkpoint"] == EXPECTED_CHECKPOINT[phase]
    os.kill(proc.pid, signal.SIGKILL)
    stdout, stderr = proc.communicate(timeout=5)
    assert proc.returncode == -signal.SIGKILL, (proc.returncode, stdout, stderr)
    return {
        "workerPID": proc.pid,
        "exitSignal": "SIGKILL",
        "rawReturnCode": proc.returncode,
        "sessionID": ready["sessionID"],
        "operationID": ready["operationID"],
        "checkpoint": ready["checkpoint"],
    }


def audit_with_pid(root: Path) -> tuple[dict, int]:
    proc = subprocess.Popen(
        [str(BINARY), "audit", str(root)], stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    pid = proc.pid
    stdout, stderr = proc.communicate(timeout=5)
    assert proc.returncode == 0, (proc.returncode, stderr.decode())
    return json.loads(stdout), pid


def interruption_case(base: Path, operation: str, phase: str) -> dict:
    root = base / f"{operation}-{phase}"
    root.mkdir()
    killed = start_and_kill(root, operation, phase)
    (root / "ready.json").unlink()
    before = snapshot(root)
    report, recovery_pid = audit_with_pid(root)
    after = snapshot(root)
    assert before == after, "read-only audit changed fixture"
    assert report["writesPerformed"] == 0 and report["deletesPerformed"] == 0
    assert len(report["sessions"]) == 1
    session = report["sessions"][0]
    assert session["accepted"] is True
    assert session["dirty"] is True and session["saved"] is False
    assert session["checkpoint"] == EXPECTED_CHECKPOINT[phase]
    assert [a["name"] for a in session["assets"]] == ["图.png", "图-1.png"]
    assert all(a["draftStatus"] == "present-matching" for a in session["assets"])
    managed_name = "original.assets" if operation == "saveAs" else "note.assets"
    expected_markdown = b"\xef\xbb\xbf" + (
        f"# 中文 😀\r\n\r\n![一]({managed_name}/图.png)\r\n"
        f"![二]({managed_name}/图-1.png)\r\n"
    ).encode()
    expected_markdown_sha = hashlib.sha256(expected_markdown).hexdigest()
    assert session["markdownSHA256"] == expected_markdown_sha
    expected_status = (
        "observed-bytes-match-completion-unknown"
        if phase == "after-markdown-before-final-confirm"
        else "not-committed"
    )
    assert session["status"] == expected_status, session
    target_rel = "destination/note.md" if operation == "saveAs" else "document/note.md"
    target = root / target_rel
    published = sum(a["targetStatus"] == "present-matching" for a in session["assets"])
    expected_published = {
        "after-import-before-save": 0,
        "after-partial-publish": 1,
        "after-all-published-before-markdown": 2,
        "after-markdown-before-final-confirm": 2,
    }[phase]
    assert published == expected_published
    target_sha = digest(target) if target.exists() else None
    if phase == "after-markdown-before-final-confirm":
        assert target_sha == session["markdownSHA256"]
    else:
        assert target_sha is None
    if operation == "saveAs":
        source = root / "source" / "original.md"
        assert digest(source) == session["sourceObservedSHA256"] == session["markdownSHA256"]
        assert all(a["sourceStatus"] == "present-matching" for a in session["assets"])
    return {
        "name": f"{operation}-{phase}",
        "pass": True,
        "operation": operation,
        "phase": phase,
        **killed,
        "recoveryPID": recovery_pid,
        "recoveryStatus": session["status"],
        "eventCount": session["eventCount"],
        "publishedMatchingCount": published,
        "targetSHA256BeforeRecovery": target_sha,
        "targetSHA256AfterRecovery": digest(target) if target.exists() else None,
        "treeSHAUnchangedByRecovery": before == after,
        "markdownFidelity": "BOM+CRLF+Chinese+emoji SHA matched",
        "sourceAssetsPreserved": operation != "saveAs" or all(
            a["sourceStatus"] == "present-matching" for a in session["assets"]
        ),
    }


def imported_fixture(root: Path, operation: str = "saveDraft") -> dict:
    root.mkdir(parents=True)
    return start_and_kill(root, operation, "after-import-before-save")


def only_session(report: dict) -> dict:
    assert len(report["sessions"]) == 1, report
    return report["sessions"][0]


def negative_cases(base: Path) -> list[dict]:
    results: list[dict] = []

    # 截断 manifest：拒绝记录，保留目录和资源，不整目录清空。
    root = base / "negative-truncated-manifest"
    info = imported_fixture(root)
    (root / "ready.json").unlink()
    manifest = next((root / "recovery").glob("*/manifest.json"))
    manifest.write_bytes(manifest.read_bytes()[:31])
    before = snapshot(root)
    report, pid = audit_with_pid(root)
    assert only_session(report)["status"] == "record-rejected"
    assert snapshot(root) == before
    results.append({"name": "truncated-manifest", "pass": True, "workerPID": info["workerPID"],
                    "recoveryPID": pid, "recoveryStatus": "record-rejected", "preserved": True})

    # 截断 event：无结尾换行即拒绝，不猜测最后事件完成。
    root = base / "negative-truncated-event"
    info = imported_fixture(root)
    (root / "ready.json").unlink()
    events = next((root / "recovery").glob("*/events.jsonl"))
    events.write_bytes(events.read_bytes() + b'{"schemaVersion":1')
    before = snapshot(root)
    report, pid = audit_with_pid(root)
    assert only_session(report)["reason"] == "event-log-truncated-or-invalid"
    assert snapshot(root) == before
    results.append({"name": "truncated-event", "pass": True, "workerPID": info["workerPID"],
                    "recoveryPID": pid, "recoveryStatus": "record-rejected", "preserved": True})

    # 外部目标变化：只读恢复不得覆盖。
    root = base / "negative-external-target-change"
    info = imported_fixture(root)
    (root / "ready.json").unlink()
    target = root / "document" / "note.md"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"EXTERNAL-CHANGE")
    external_sha = digest(target)
    report, pid = audit_with_pid(root)
    session = only_session(report)
    assert session["status"] == "external-target-change" and digest(target) == external_sha
    results.append({"name": "external-target-change", "pass": True, "workerPID": info["workerPID"],
                    "recoveryPID": pid, "recoveryStatus": session["status"],
                    "targetSHA256BeforeRecovery": external_sha, "targetSHA256AfterRecovery": digest(target)})

    # 草稿图片丢失：保守报告且不删除其余图片。
    root = base / "negative-missing-draft-asset"
    info = imported_fixture(root)
    (root / "ready.json").unlink()
    imports = next((root / "recovery").glob("*/imports"))
    missing = imports / "图.png"
    missing.unlink()
    remaining_before = snapshot(root)
    report, pid = audit_with_pid(root)
    session = only_session(report)
    assert session["status"] == "draft-asset-missing-or-changed"
    assert snapshot(root) == remaining_before
    results.append({"name": "missing-draft-asset", "pass": True, "workerPID": info["workerPID"],
                    "recoveryPID": pid, "recoveryStatus": session["status"], "preserved": True})

    # 同名字节：发布时只复用、不取得所有权，恢复不删。
    root = base / "negative-preexisting-same"
    same = root / "document" / "note.assets" / "图.png"
    same.parent.mkdir(parents=True)
    same.write_bytes("PNG-一-😀".encode())
    same_sha = digest(same)
    info = start_and_kill(root, "saveDraft", "after-partial-publish")
    (root / "ready.json").unlink()
    report, pid = audit_with_pid(root)
    session = only_session(report)
    first = session["assets"][0]
    assert first["ownership"] == "none" and digest(same) == same_sha
    results.append({"name": "preexisting-same-bytes", "pass": True, "workerPID": info["workerPID"],
                    "recoveryPID": pid, "ownership": first["ownership"], "preservedSHA256": same_sha})

    # 同名异字节：worker 真实失败，既有资源仍保持原 SHA；恢复只审计。
    root = base / "negative-preexisting-different"
    different = root / "document" / "note.assets" / "图.png"
    different.parent.mkdir(parents=True)
    different.write_bytes(b"OTHER-OWNER-DIFFERENT")
    different_sha = digest(different)
    proc = subprocess.Popen([str(BINARY), "worker", str(root), "saveDraft", "after-partial-publish"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate(timeout=10)
    assert proc.returncode != 0 and proc.returncode != -signal.SIGKILL, (stdout, stderr)
    before = snapshot(root)
    report, pid = audit_with_pid(root)
    session = only_session(report)
    assert session["assets"][0]["targetStatus"] == "different-preserved"
    assert digest(different) == different_sha and snapshot(root) == before
    results.append({"name": "preexisting-different-bytes", "pass": True, "workerPID": proc.pid,
                    "workerExitCode": proc.returncode, "recoveryPID": pid,
                    "targetStatus": "different-preserved", "preservedSHA256": different_sha})

    # 两个会话共存：第二次恢复不得清除或合并第一个会话。
    root = base / "negative-other-session"
    first_info = imported_fixture(root)
    (root / "ready.json").unlink()
    second_info = start_and_kill(root, "saveAs", "after-import-before-save")
    (root / "ready.json").unlink()
    before = snapshot(root)
    report, pid = audit_with_pid(root)
    assert len(report["sessions"]) == 2 and all(s["accepted"] for s in report["sessions"])
    assert snapshot(root) == before
    results.append({"name": "other-session-preserved", "pass": True,
                    "workerPIDs": [first_info["workerPID"], second_info["workerPID"]],
                    "recoveryPID": pid, "sessionCount": 2, "preserved": True})

    # 未知 schema / 非法相对路径：记录整体拒绝，不使用记录路径写删任意文件。
    for case, mutation in [
        ("unknown-schema", lambda m: m.__setitem__("schemaVersion", 999)),
        ("illegal-dotdot-path", lambda m: m.__setitem__("targetRelativePath", "../outside.md")),
    ]:
        root = base / f"negative-{case}"
        info = imported_fixture(root)
        (root / "ready.json").unlink()
        manifest = next((root / "recovery").glob("*/manifest.json"))
        body = json.loads(manifest.read_text())
        mutation(body)
        manifest.write_text(json.dumps(body, ensure_ascii=False) + "\n")
        outside = base / "outside.md"
        outside.write_bytes(b"OUTSIDE-MUST-STAY")
        outside_sha = digest(outside)
        before = snapshot(root)
        report, pid = audit_with_pid(root)
        assert only_session(report)["status"] == "record-rejected"
        assert snapshot(root) == before and digest(outside) == outside_sha
        results.append({"name": case, "pass": True, "workerPID": info["workerPID"],
                        "recoveryPID": pid, "recoveryStatus": "record-rejected",
                        "outsidePreservedSHA256": outside_sha})

    # UUID 目录符号链接：不得跟随到会话根外。
    root = base / "negative-session-symlink"
    recovery = root / "recovery"
    recovery.mkdir(parents=True)
    outside_dir = base / "outside-session"
    outside_dir.mkdir()
    outside_marker = outside_dir / "marker"
    outside_marker.write_bytes(b"NO-FOLLOW")
    link_name = "11111111-1111-1111-1111-111111111111"
    (recovery / link_name).symlink_to(outside_dir, target_is_directory=True)
    marker_sha = digest(outside_marker)
    report, pid = audit_with_pid(root)
    assert report["rejectedEntries"] == [f"{link_name}:session-symlink"]
    assert digest(outside_marker) == marker_sha
    results.append({"name": "session-symlink-boundary", "pass": True,
                    "recoveryPID": pid, "outsidePreservedSHA256": marker_sha})
    return results


def main() -> int:
    if not BINARY.exists():
        print(f"missing binary: {BINARY}", file=sys.stderr)
        return 2
    scratch = Path(tempfile.mkdtemp(prefix="ink-prot-021."))
    keep = os.environ.get("INK_PROT_KEEP") == "1"
    try:
        cases = [interruption_case(scratch, op, phase) for op in ("saveDraft", "saveAs") for phase in PHASES]
        negatives = negative_cases(scratch)
        report = {
            "prototype": "INK-PROT-021 persistent restart recovery 0.1",
            "schemaVersion": 1,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "binarySHA256": digest(BINARY),
            "scratchRoot": str(scratch),
            "processBoundary": "parent sends SIGKILL after child fsynced checkpoint; recovery is a fresh process reading disk only",
            "durabilityBoundary": "evidence covers process termination, not power loss or storage-hardware durability",
            "transactionBoundary": "asset publication and Markdown rename are not one multi-file atomic transaction; audited orphans may remain",
            "allPass": all(c["pass"] for c in cases + negatives),
            "interruptionCases": cases,
            "negativeCases": negatives,
            "notExecuted": [
                "App Sandbox bookmark/NSOpenPanel authorization",
                "WKWebView resource broker",
                "GUI/IME/cursor/selection/undo-redo",
                "macOS 14 physical-machine runtime",
                "power-loss/storage-hardware durability",
            ],
        }
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if report["allPass"] else 1
    finally:
        if keep:
            print(f"INK_PROT_KEEP=1: scratch kept at {scratch}", file=sys.stderr)
        else:
            shutil.rmtree(scratch)  # 只清理由本进程 mkdtemp 创建的 fixture 根


if __name__ == "__main__":
    raise SystemExit(main())

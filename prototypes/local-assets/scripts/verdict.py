#!/usr/bin/env python3
"""INK-PROT-011 L2 判定器 + 伪成功负例自测。

判定输入：
  probe     evidence/probe-results.json（签名沙盒探针输出）
  contrast  evidence/contrast-read.json（非沙盒对照读取，扁平结构）
  probe_rc / contrast_rc  两个命令的真实退出码
  ext_sha   控制脚本创建的外部 fixture 的 SHA256

判定输出：(状态, 原因列表)
  ok          全部证据成立
  fail        存在伪成功或证据矛盾
  incomplete  沙盒未激活/未确认，L2 未执行通过（同样不允许打印全通过）

关键规则：
- 对照读取必须成功且 SHA 与控制脚本 fixture 一致（外部 fixture 确实存在且可读）。
- 沙盒外部拒绝的 errno 必须是权限拒绝 EPERM(1)/EACCES(13)；
  ENOENT 等其它失败与“无权限”不得混淆。
- 容器写、容器读必须实际成功。
- 未激活沙盒 = L2 incomplete，不作为任何 Sandbox 证据。
"""

import json
import sys

PERMISSION_ERRNOS = {1: "EPERM", 13: "EACCES"}


def judge(probe, contrast, probe_rc, contrast_rc, ext_sha):
    reasons = []
    if probe_rc != 0:
        reasons.append("probe-exit-%s" % probe_rc)
    if contrast_rc != 0:
        reasons.append("contrast-exit-%s" % contrast_rc)
    if not probe.get("sandboxActive"):
        reasons.append("sandbox-inactive: 沙盒未激活或容器路径不匹配，L2 未执行通过")
        return "incomplete", reasons
    cw = probe.get("containerWrite", {})
    if not cw.get("attempted"):
        reasons.append("container-write-not-attempted")
    elif not cw.get("ok"):
        reasons.append("container-write-failed: %s" % cw.get("error"))
    cf = probe.get("containerFixture", {})
    if not cf.get("ok"):
        reasons.append("container-read-failed errno=%s" % cf.get("errno"))
    ext = probe.get("externalFixture", {})
    if ext.get("ok"):
        reasons.append("sandbox-contradiction: 自称沙盒但外部读取成功")
    elif ext.get("errno") not in PERMISSION_ERRNOS:
        reasons.append(
            "invalid-denial-evidence: errno=%s(%s) 不是权限拒绝(EPERM/EACCES)，"
            "文件不存在/其它错误不能充当沙盒拒绝证据"
            % (ext.get("errno"), ext.get("errnoMessage"))
        )
    if not contrast.get("ok"):
        reasons.append(
            "contrast-read-failed errno=%s(%s)：外部 fixture 本应存在且可被非沙盒进程读取"
            % (contrast.get("errno"), contrast.get("errnoMessage"))
        )
    elif contrast.get("sha256") != ext_sha:
        reasons.append("contrast-sha-mismatch: 对照读取字节与控制脚本 fixture 不一致")
    return ("fail" if reasons else "ok"), reasons


def _base_probe(**over):
    p = {
        "sandboxActive": True,
        "containerWrite": {"attempted": True, "ok": True, "error": None},
        "containerFixture": {"ok": True, "errno": None},
        "externalFixture": {"ok": False, "errno": 1, "errnoMessage": "Operation not permitted"},
    }
    p.update(over)
    return p


def _base_contrast(**over):
    c = {"ok": True, "errno": None, "errnoMessage": None, "sha256": "A" * 64}
    c.update(over)
    return c


def selftest():
    """针对伪成功的最小负例集；任一不按预期判定即非零退出。"""
    cases = [
        ("ok-baseline", _base_probe(), _base_contrast(), 0, 0, "A" * 64, "ok"),
        (
            "external-read-succeeded",
            _base_probe(externalFixture={"ok": True, "errno": None, "errnoMessage": None}),
            _base_contrast(), 0, 0, "A" * 64, "fail",
        ),
        (
            "denial-is-enoent",
            _base_probe(externalFixture={"ok": False, "errno": 2, "errnoMessage": "No such file or directory"}),
            _base_contrast(), 0, 0, "A" * 64, "fail",
        ),
        (
            "contrast-sha-mismatch",
            _base_probe(), _base_contrast(sha256="B" * 64), 0, 0, "A" * 64, "fail",
        ),
        (
            "contrast-read-failed",
            _base_probe(), _base_contrast(ok=False, errno=2, sha256=None), 0, 0, "A" * 64, "fail",
        ),
        (
            "container-read-failed",
            _base_probe(containerFixture={"ok": False, "errno": 1}), _base_contrast(), 0, 0, "A" * 64, "fail",
        ),
        ("sandbox-inactive", _base_probe(sandboxActive=False), _base_contrast(), 0, 0, "A" * 64, "incomplete"),
        ("probe-crashed", _base_probe(), _base_contrast(), 6, 0, "A" * 64, "fail"),
    ]
    failed = 0
    for name, probe, contrast, prc, crc, sha, expected in cases:
        status, reasons = judge(probe, contrast, prc, crc, sha)
        mark = "PASS" if status == expected else "FAIL"
        if status != expected:
            failed += 1
        print(mark, name, "->", status, ("; ".join(reasons) if reasons else ""))
    if failed:
        print("SELFTEST FAILED: %d case(s)" % failed)
        return 1
    print("SELFTEST PASSED: %d cases" % len(cases))
    return 0


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
        return selftest()
    if len(sys.argv) != 6:
        print("usage: verdict.py <probe.json> <contrast.json> <probe_rc> <contrast_rc> <ext_sha>", file=sys.stderr)
        return 64
    probe = json.load(open(sys.argv[1]))
    contrast = json.load(open(sys.argv[2]))
    status, reasons = judge(probe, contrast, int(sys.argv[3]), int(sys.argv[4]), sys.argv[5])
    print(json.dumps({"status": status, "reasons": reasons}, ensure_ascii=False))
    return 0 if status == "ok" else (3 if status == "incomplete" else 2)


if __name__ == "__main__":
    sys.exit(main())

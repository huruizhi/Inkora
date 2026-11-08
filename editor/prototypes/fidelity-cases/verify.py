#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""INK-PROT-002 样稿完整性校验器（仅标准库，Python 3.9+）。

用法：
    python3 editor/prototypes/fidelity-cases/verify.py

校验内容：
1. cases.json 可解析且结构齐全；
2. 所有被引用文件存在、字节数与 sha256 与 manifest 一致；
3. 每个文件的 BOM / EOL(lf|crlf|mixed) / 尾部换行标记与实际字节一致；
4. byte-exact 步骤：用 manifest 中的 ops 从前一状态独立重新推导，必须与预期文件
   逐字节一致（find 在前一状态必须恰好出现一次，证明“仅改允许区域”）；
5. state-ref 步骤：必须指向本变体更早出现过的状态且不带 ops；
6. operational 步骤：不得带 ops/expect，必须给出 acceptance；
7. cases/ 下无 manifest 未引用的孤立文件。

退出码：0 全部通过；1 存在失败。
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "cases"
BOM = b"\xef\xbb\xbf"

PASS = 0
FAIL = 0
FAILURES = []


def check(ok, label):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        FAILURES.append(label)


def meta_of(data: bytes) -> dict:
    bom = data.startswith(BOM)
    body = data[3:] if bom else data
    crlf = body.count(b"\r\n")
    lf = body.count(b"\n") - crlf
    cr = body.count(b"\r") - crlf
    if cr != 0:
        eol = "bare-cr"
    elif lf > 0 and crlf > 0:
        eol = "mixed"
    elif crlf > 0:
        eol = "crlf"
    elif lf > 0:
        eol = "lf"
    else:
        eol = "none"
    return {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bom": bom,
        "eol": eol,
        "trailing_newline": body.endswith(b"\n"),
    }


def apply_ops(state: bytes, ops: list, label: str) -> bytes:
    for i, op in enumerate(ops):
        f = op["find"].encode("utf-8")
        r = op["replace"].encode("utf-8")
        n = state.count(f)
        check(n == 1, f"{label} op[{i}] find 恰好出现一次（实际 {n} 次）: {op['find']!r}")
        if n == 1:
            state = state.replace(f, r, 1)
        else:
            raise AssertionError(f"{label} op[{i}] find 出现 {n} 次，无法推导")
    return state


def main() -> int:
    manifest_path = ROOT / "cases.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"cases.json 解析失败: {e}")
        return 1
    check(manifest.get("schema_version") == 1, "schema_version == 1")
    for key in ("task", "baseline_commit", "acceptance_basis", "independence", "cases"):
        check(key in manifest, f"顶层字段 {key} 存在")

    referenced = set()
    n_steps = 0
    n_byte_exact = 0
    n_state_ref = 0
    n_operational = 0

    for case in manifest["cases"]:
        cid = case["id"]
        for key in ("id", "title", "covers", "rules", "variants"):
            check(key in case, f"{cid}: 字段 {key} 存在")
        for variant in case["variants"]:
            vid = variant["id"]
            vlabel = f"{cid}/{vid}"
            states = {}  # name -> bytes
            for name, declared in variant["files"].items():
                rel = f"{cid}/{name}"
                referenced.add(rel)
                p = CASES / cid / name
                if not p.is_file():
                    check(False, f"{rel}: 文件不存在")
                    continue
                data = p.read_bytes()
                actual = meta_of(data)
                for field in ("bytes", "sha256", "bom", "eol", "trailing_newline"):
                    check(actual[field] == declared[field],
                          f"{rel}: {field} 与 manifest 不一致（实际 {actual[field]!r}，声明 {declared[field]!r}）")
                check(declared["eol"] in ("lf", "crlf", "mixed"),
                      f"{rel}: eol 标记合法（实际 {declared['eol']}）")
                states[name] = data
            check(len(variant["files"]) >= 1, f"{vlabel}: 至少一个输入文件")
            prev_name = list(variant["files"].keys())[0]

            for st in variant["steps"]:
                n_steps += 1
                slabel = f"{vlabel} step{st['n']}"
                check(bool(st.get("acceptance")), f"{slabel}: acceptance 非空")
                check(st.get("verdict") in ("byte-exact", "state-ref", "operational"),
                      f"{slabel}: verdict 合法")
                check(st.get("mode") in ("visual", "source", "either"), f"{slabel}: mode 合法")
                check("action" in st and "edit_scope" in st and "delimiter_scope" in st,
                      f"{slabel}: action/edit_scope/delimiter_scope 存在")
                exp = st.get("expect")
                if st["verdict"] == "byte-exact":
                    n_byte_exact += 1
                    check(exp is not None, f"{slabel}: byte-exact 必须有 expect")
                    if exp is None:
                        continue
                    fname = exp["file"]
                    rel = f"{cid}/{fname}"
                    referenced.add(rel)
                    p = CASES / cid / fname
                    if not p.is_file():
                        check(False, f"{rel}: 预期文件不存在")
                        continue
                    data = p.read_bytes()
                    try:
                        derived = apply_ops(states[prev_name], st["ops"], slabel)
                    except AssertionError as e:
                        check(False, str(e))
                        continue
                    check(derived == data,
                          f"{slabel}: ops 推导与 {fname} 逐字节一致"
                          f"（推导 {len(derived)}B/{hashlib.sha256(derived).hexdigest()[:12]}，"
                          f"实际 {len(data)}B/{hashlib.sha256(data).hexdigest()[:12]}）")
                    check(len(data) == exp["bytes"] and
                          hashlib.sha256(data).hexdigest() == exp["sha256"],
                          f"{slabel}: {fname} bytes/sha256 与 manifest 一致")
                    check("to_disk" in exp, f"{slabel}: expect.to_disk 存在")
                    states[fname] = data
                    prev_name = fname
                elif st["verdict"] == "state-ref":
                    n_state_ref += 1
                    check(exp is not None, f"{slabel}: state-ref 必须有 expect")
                    check(st["ops"] == [], f"{slabel}: state-ref 不得带 ops")
                    if exp is None:
                        continue
                    fname = exp["file"]
                    rel = f"{cid}/{fname}"
                    referenced.add(rel)
                    check(fname in states, f"{slabel}: state-ref 指向更早状态 {fname}")
                    if fname in states:
                        data = (CASES / cid / fname).read_bytes()
                        check(hashlib.sha256(data).hexdigest() == exp["sha256"],
                              f"{slabel}: {fname} sha256 与 manifest 一致")
                        prev_name = fname
                else:  # operational
                    n_operational += 1
                    check(exp is None, f"{slabel}: operational 不得带 expect")
                    check(st["ops"] == [], f"{slabel}: operational 不得带 ops")

    # 孤立文件检查
    on_disk = {
        str(p.relative_to(CASES)) for p in CASES.rglob("*") if p.is_file()
    }
    check(on_disk == referenced,
          f"cases/ 无孤立文件（磁盘 {len(on_disk)} 个，引用 {len(referenced)} 个；"
          f"多余: {sorted(on_disk - referenced)}, 缺失: {sorted(referenced - on_disk)}）")

    print(f"用例: {len(manifest['cases'])}  步骤: {n_steps} "
          f"(byte-exact {n_byte_exact} / state-ref {n_state_ref} / operational {n_operational})")
    print(f"检查通过 {PASS} 项，失败 {FAIL} 项")
    if FAILURES:
        print("失败明细：")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())

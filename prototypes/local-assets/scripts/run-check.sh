#!/bin/bash
# INK-PROT-011 run-check.sh — 端到端检查编排（分层严格判定）
# L1 状态模型场景 + L2 签名 Sandbox 探针 + 非沙盒对照，证据写入 evidence/，
# 完整日志写入被忽略的 artifacts/logs/ink-prot-011/。
# 退出码：0 通过；1 L1 场景失败；2 L2 证据失败/伪成功；3 沙盒未激活(L2 incomplete)；
# 4 判定器自测失败。任何非通过状态都不打印“全通过”。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"
SWIFT_VER="$(swift --version 2>&1 | head -1)"
EVID="$ROOT/evidence"
LOGDIR="$REPO/artifacts/logs/ink-prot-011"
mkdir -p "$EVID" "$LOGDIR"

# 本轮唯一 run ID：探针容器内子目录与清理都只作用于它
RUN_ID="$(uuidgen | tr 'A-Z' 'a-z')"
CONTAINER_FIXTURES="$HOME/Library/Containers/com.huruizhi.Inkora.AssetPrototype/Data/probe-fixtures"

TMP_BASE="${TMPDIR:-/tmp}"
SCRATCH="$(mktemp -d "$TMP_BASE/ink-prot-011.XXXXXX")"
cleanup() {
  if [[ "${INK_PROT_KEEP:-0}" == "1" ]]; then
    echo "INK_PROT_KEEP=1: scratch kept at $SCRATCH"
  else
    rm -rf "$SCRATCH"   # 只清理本次 mktemp 创建的目录
  fi
  # 只清理本轮 run ID 的容器子目录；不触碰其它运行/会话，不碰系统管理的容器内容
  rm -rf "$CONTAINER_FIXTURES/$RUN_ID" 2>/dev/null || true
}
trap cleanup EXIT

echo "== baseline: $GIT_SHA"
echo "== scratch: $SCRATCH"
echo "== run id: $RUN_ID"
echo "== swift: $SWIFT_VER"

# ---------- 0. 判定器自测（伪成功负例；任一失败即中止） ----------
echo "== [0] verdict selftest"
python3 "$ROOT/scripts/verdict.py" --selftest | tee "$LOGDIR/verdict-selftest.log"

# ---------- 1. 状态模型场景（普通进程 + 真实 scratch 文件系统） ----------
echo "== [1] model scenarios"
set +e
"$ROOT/.build/local-assets-model" "$SCRATCH/model" "$GIT_SHA" \
  > "$EVID/model-results.json" 2> "$LOGDIR/model.stderr"
model_rc=$?
set -e
python3 -c '
import json,sys
r=json.load(open(sys.argv[1]))
print("allPass:", r["allPass"])
for s in r["scenarios"]:
    print(("PASS" if s["pass"] else "FAIL"), s["name"])
    for d in s["detail"]:
        if d.startswith("FAIL"): print("   ", d)
' "$EVID/model-results.json"
l1_status="pass"; l1_reason=""
if [[ $model_rc -ne 0 ]]; then
  l1_status="fail"; l1_reason="model rc=$model_rc"
  echo "L1 FAILED rc=$model_rc (stderr: $LOGDIR/model.stderr)"
fi

# ---------- 2. 外部 fixture（控制脚本创建的唯一临时目录，非用户内容） ----------
EXTDIR="$SCRATCH/external"
mkdir -p "$EXTDIR"
EXTBIN="$EXTDIR/外 部%20fixture.bin"
printf 'INK-PROT-011 external fixture bytes — 探针不应有权读取\n' > "$EXTBIN"
EXT_SHA="$(shasum -a 256 "$EXTBIN" | cut -d" " -f1)"
echo "== external fixture: $EXTBIN sha256=$EXT_SHA"

# ---------- 3. 签名 Sandbox 探针 ----------
echo "== [2] signed sandbox probe (run $RUN_ID)"
PROBE="$ROOT/.build/AssetPrototype.app/Contents/MacOS/AssetPrototype"
set +e
"$PROBE" "$RUN_ID" "$EXTBIN" > "$EVID/probe-results.json" 2> "$LOGDIR/probe.stderr"
probe_rc=$?
set -e
cat "$EVID/probe-results.json"

# ---------- 4. 非沙盒对照（同一 posix-read 语义，仅作区分证据） ----------
echo "== [3] non-sandboxed contrast read"
set +e
"$ROOT/.build/local-assets-model" posix-read "$EXTBIN" \
  > "$EVID/contrast-read.json" 2> "$LOGDIR/contrast.stderr"
contrast_rc=$?
set -e
cat "$EVID/contrast-read.json"

# ---------- 5. 分层严格判定 ----------
VERDICT_JSON="$(python3 "$ROOT/scripts/verdict.py" \
  "$EVID/probe-results.json" "$EVID/contrast-read.json" \
  "$probe_rc" "$contrast_rc" "$EXT_SHA" | tee "$LOGDIR/verdict.log")"
l2_status="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["status"])' "$VERDICT_JSON")"
l2_reasons="$(python3 -c 'import json,sys; print("; ".join(json.loads(sys.argv[1])["reasons"]))' "$VERDICT_JSON")"
echo "== L2 verdict: $l2_status ${l2_reasons}"

case "$l2_status" in
  fail)     exit_code=2 ;;
  incomplete) exit_code=3 ;;
  ok)       exit_code=0 ;;
  *)        exit_code=2 ;;
esac
if [[ "$l1_status" == "fail" ]]; then exit_code=1; fi

# ---------- 6. 汇总证据 ----------
python3 - "$EVID" "$GIT_SHA" "$SWIFT_VER" "$SCRATCH" "$RUN_ID" \
  "$l1_status" "$l2_status" "$l2_reasons" "$probe_rc" "$contrast_rc" "$EXT_SHA" <<'PY'
import json, sys, os, datetime, hashlib
(ev, sha, swift, scratch, run_id, l1s, l2s, l2r, prc, crc, ext_sha) = (
    sys.argv[i] for i in range(1, 12))
model = json.load(open(os.path.join(ev, "model-results.json")))
probe = json.load(open(os.path.join(ev, "probe-results.json")))
contrast = json.load(open(os.path.join(ev, "contrast-read.json")))
def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
rootdir = os.path.dirname(ev)
summary = {
    "prototype": "INK-PROT-011 local-assets platform prototype part 1",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baselineGitSHA": sha,
    "swift": swift,
    "runID": run_id,
    "evidenceLayers": {
        "L1-pureModelPlusScratchFS": {
            "status": l1s,
            "allPass": model["allPass"],
            "scenarioCount": len(model["scenarios"]),
            "journalEntries": len(model["journal"]),
            "binarySHA256": sha256(os.path.join(rootdir, ".build", "local-assets-model")),
        },
        "L2-signedSandboxProbe": {
            "status": l2s,
            "probeExitCode": int(prc),
            "contrastExitCode": int(crc),
            "sandboxActive": probe["sandboxActive"],
            "containerHome": probe["containerHome"],
            "expectedContainerHome": probe["expectedContainerHome"],
            "containerWriteOk": probe["containerWrite"]["ok"],
            "containerFixtureReadOk": probe["containerFixture"]["ok"],
            "externalFixtureOk": probe["externalFixture"]["ok"],
            "externalErrno": probe["externalFixture"]["errno"],
            "externalErrnoMessage": probe["externalFixture"]["errnoMessage"],
            "externalFixtureSHA256ExpectedUnreadable": ext_sha,
            "binarySHA256": sha256(os.path.join(
                rootdir, ".build", "AssetPrototype.app", "Contents", "MacOS", "AssetPrototype")),
            "signing": "ad-hoc + com.apple.security.app-sandbox entitlement (see Makefile)",
        },
        "nonSandboxedContrast": {
            "status": "ok" if (contrast.get("ok") and contrast.get("sha256") == ext_sha) else "fail",
            "externalFixtureOk": contrast.get("ok"),
            "sha256": contrast.get("sha256"),
            "shaMatchesControlFixture": contrast.get("sha256") == ext_sha,
        },
    },
    "overallStatus": "pass" if (l1s == "pass" and l2s == "ok") else "fail-or-incomplete",
}
with open(os.path.join(ev, "summary.json"), "w") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2, sort_keys=True)
    f.write("\n")
PY

cat "$EVID/summary.json"

if [[ "$exit_code" -ne 0 ]]; then
  echo "CHECK NOT PASSED (exit=$exit_code): L1=$l1_status L2=$l2_status ${l2_reasons}"
  exit "$exit_code"
fi
echo "CHECK PASSED"

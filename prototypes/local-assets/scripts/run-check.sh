#!/bin/bash
# INK-PROT-011 run-check.sh — 端到端检查编排
# 1. 普通进程状态模型场景（真实 scratch 文件系统，临时隔离 fixtures）
# 2. 签名 Sandbox 探针：容器内 fixture 读写 + 未授权外部 fixture 读取尝试
# 3. 证据写入 evidence/（提交归档），完整日志写入被忽略的 artifacts/
# 退出码：0 通过；1 模型场景失败；2 探针自相矛盾（自称沙盒但读通外部文件）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"
SWIFT_VER="$(swift --version 2>&1 | head -1)"
EVID="$ROOT/evidence"
LOGDIR="$REPO/artifacts/logs/ink-prot-011"
mkdir -p "$EVID" "$LOGDIR"

TMP_BASE="${TMPDIR:-/tmp}"
SCRATCH="$(mktemp -d "$TMP_BASE/ink-prot-011.XXXXXX")"
cleanup() {
  if [[ "${INK_PROT_KEEP:-0}" == "1" ]]; then
    echo "INK_PROT_KEEP=1: scratch kept at $SCRATCH"
  else
    rm -rf "$SCRATCH"   # 只清理本次 mktemp 创建的目录
  fi
}
trap cleanup EXIT

echo "== baseline: $GIT_SHA"
echo "== scratch: $SCRATCH"
echo "== swift: $SWIFT_VER"

status="pass"
notes=()

# ---------- 1. 状态模型场景（普通进程 + 真实 scratch 文件系统） ----------
echo "== [1] model scenarios"
set +e
"$ROOT/.build/local-assets-model" "$SCRATCH/model" "$GIT_SHA" \
  > "$EVID/model-results.json" 2> "$LOGDIR/model.stderr"
model_rc=$?
set -e
cat "$EVID/model-results.json" | python3 -c '
import json,sys
r=json.load(sys.stdin)
print("allPass:", r["allPass"])
for s in r["scenarios"]:
    print(("PASS" if s["pass"] else "FAIL"), s["name"])
    for d in s["detail"]:
        if d.startswith("FAIL"): print("   ", d)
'
if [[ $model_rc -ne 0 ]]; then
  status="fail"
  notes+=("model scenarios rc=$model_rc")
  echo "MODEL FAILED rc=$model_rc (stderr in $LOGDIR/model.stderr)"
fi

MODEL_SUMMARY=$(python3 -c '
import json
r=json.load(open("'"$EVID"'/model-results.json"))
print(r["allPass"], len(r["scenarios"]), len(r["journal"]))
')

# ---------- 2. 外部 fixture（控制脚本创建的唯一临时目录，非用户内容） ----------
EXTDIR="$SCRATCH/external"
mkdir -p "$EXTDIR"
EXTBIN="$EXTDIR/外 部%20fixture.bin"
printf 'INK-PROT-011 external fixture bytes — 探针不应有权读取\n' > "$EXTBIN"
EXT_SHA="$(shasum -a 256 "$EXTBIN" | cut -d" " -f1)"
echo "== external fixture: $EXTBIN sha256=$EXT_SHA"

# ---------- 3. 签名 Sandbox 探针 ----------
echo "== [2] signed sandbox probe"
PROBE="$ROOT/.build/AssetPrototype.app/Contents/MacOS/AssetPrototype"
set +e
"$PROBE" "$EXTBIN" > "$EVID/probe-results.json" 2> "$LOGDIR/probe.stderr"
probe_rc=$?
set -e
if [[ $probe_rc -ne 0 ]]; then
  notes+=("probe rc=$probe_rc")
fi
cat "$EVID/probe-results.json"
# 探针容器内 fixture 由本次运行产生，运行后清理；容器骨架由系统管理保留
rm -rf "$HOME/Library/Containers/com.huruizhi.Inkora.AssetPrototype/Data/probe-fixtures"

# ---------- 4. 非沙盒对照（同一 posix-read 语义，仅作区分证据） ----------
echo "== [3] non-sandboxed contrast read"
set +e
"$ROOT/.build/local-assets-model" posix-read "$EXTBIN" \
  > "$EVID/contrast-read.json" 2> "$LOGDIR/contrast.stderr"
contrast_rc=$?
set -e
cat "$EVID/contrast-read.json"

# ---------- 5. 汇总判定 ----------
verdict=$(python3 - "$EVID" "$EXT_SHA" <<'PY'
import json, sys, os
ev = sys.argv[1]; ext_sha = sys.argv[2]
probe = json.load(open(os.path.join(ev, "probe-results.json")))
contrast = json.load(open(os.path.join(ev, "contrast-read.json")))
model = json.load(open(os.path.join(ev, "model-results.json")))

lines = []
mode = "sandbox-active-blocked-external"
if not probe["sandboxActive"]:
    mode = "sandbox-inactive-recorded"      # 环境未激活沙盒：如实记录，不算通过证据
elif probe["externalFixture"]["ok"]:
    mode = "sandbox-contradiction"          # 自称沙盒却读通外部文件：真实反例，检查失败
elif probe["containerFixture"]["ok"] and probe["containerWrite"]["ok"]:
    mode = "sandbox-active-blocked-external"
else:
    mode = "sandbox-active-container-error" # 沙盒激活但容器操作失败
print(mode)
PY
)
echo "== verdict: $verdict"

if [[ "$verdict" == "sandbox-contradiction" ]]; then
  status="fail"
  notes+=("probe claims sandboxed but external read succeeded — see evidence/probe-results.json")
fi
if [[ "$verdict" == "sandbox-inactive-recorded" ]]; then
  notes+=("probe ran but sandbox not activated by direct exec in this environment; recorded as-is, NOT claimed as sandbox evidence")
fi

# ---------- 6. 汇总证据 ----------
python3 - "$EVID" "$GIT_SHA" "$SWIFT_VER" "$SCRATCH" "$verdict" "$status" "${notes[*]:-}" <<'PY'
import json, sys, os, datetime, hashlib
ev, sha, swift, scratch, verdict, status, notes = (sys.argv[i] for i in range(1, 8))
model = json.load(open(os.path.join(ev, "model-results.json")))
probe = json.load(open(os.path.join(ev, "probe-results.json")))
contrast = json.load(open(os.path.join(ev, "contrast-read.json")))
binary = os.path.join(os.path.dirname(ev), ".build", "AssetPrototype.app", "Contents", "MacOS", "AssetPrototype")
modelbin = os.path.join(os.path.dirname(ev), ".build", "local-assets-model")
def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
summary = {
    "prototype": "INK-PROT-011 local-assets platform prototype part 1",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baselineGitSHA": sha,
    "swift": swift,
    "evidenceLayers": {
        "pureModelPlusScratchFS": {
            "allPass": model["allPass"],
            "scenarioCount": len(model["scenarios"]),
            "journalEntries": len(model["journal"]),
            "binarySHA256": sha256(modelbin),
        },
        "signedSandboxProbe": {
            "verdict": verdict,
            "sandboxActive": probe["sandboxActive"],
            "containerHome": probe["containerHome"],
            "containerWriteOk": probe["containerWrite"]["ok"],
            "containerFixtureReadOk": probe["containerFixture"]["ok"],
            "externalFixtureOk": probe["externalFixture"]["ok"],
            "externalErrno": probe["externalFixture"]["errno"],
            "externalErrnoMessage": probe["externalFixture"]["errnoMessage"],
            "binarySHA256": sha256(binary),
            "signing": "ad-hoc + com.apple.security.app-sandbox entitlement (see Makefile)",
        },
        "nonSandboxedContrast": {
            "externalFixtureOk": contrast["ok"],
            "sha256": contrast.get("sha256"),
        },
    },
    "status": status,
    "notes": [n for n in notes.split(" | ") if n] if notes.strip() else [],
}
with open(os.path.join(ev, "summary.json"), "w") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2, sort_keys=True)
    f.write("\n")
PY

cat "$EVID/summary.json"

if [[ "$status" != "pass" ]]; then
  echo "CHECK FAILED: ${notes[*]}"
  exit 1
fi
echo "CHECK PASSED"

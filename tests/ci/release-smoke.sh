#!/bin/bash
# Isolated credential failures must never invoke Xcode, codesign or notarytool.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/inkora-release-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/security" <<'STUB'
#!/bin/bash
[[ $* == 'find-identity -v -p codesigning' ]] || exit 99
case ${INKORA_FIXTURE_IDENTITY:-missing} in
  error) exit 1 ;;
  *) echo '0 valid identities found' ;;
esac
STUB
for tool in xcodebuild codesign xcrun; do
  printf '#!/bin/bash\necho UNEXPECTED_TOOL >&2\nexit 99\n' > "$tmp/bin/$tool"
done
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
unset INKORA_SIGN_IDENTITY INKORA_TEAM_ID INKORA_NOTARY_PROFILE
expect() {
  local expected=$1
  shift
  local result=0
  "$root/scripts/release/release.sh" "$@" > "$tmp/output" 2>&1 || result=$?
  [[ $result == "$expected" ]] || { cat "$tmp/output"; echo "Expected $expected, got $result"; exit 1; }
  ! grep -q UNEXPECTED_TOOL "$tmp/output"
  ! grep -q 'Fixture Secret\|TESTPROFILE\|ABCDEFGHIJ' "$tmp/output"
}
expect 64
expect 64 invalid
expect 64 archive extra
for action in archive sign notarize dmg verify release; do
  expect 78 "$action"
  grep -q INKORA_SIGN_IDENTITY "$tmp/output"
done
export INKORA_SIGN_IDENTITY='Developer ID Application: Fixture Secret (ABCDEFGHIJ)'
expect 78 archive
grep -q INKORA_TEAM_ID "$tmp/output"
export INKORA_TEAM_ID=ABCDEFGHIJ
export INKORA_SIGN_IDENTITY=-
expect 78 sign
grep -q 'ad-hoc is forbidden' "$tmp/output"
export INKORA_SIGN_IDENTITY='Developer ID Application: Fixture Secret (ABCDEFGHIJ)'
expect 78 notarize
grep -q INKORA_NOTARY_PROFILE "$tmp/output"
export INKORA_NOTARY_PROFILE=TESTPROFILE
for action in archive sign notarize dmg verify release; do
  expect 78 "$action"
  grep -q 'certificate/private key not found' "$tmp/output"
done
export INKORA_FIXTURE_IDENTITY=error
expect 78 sign
grep -q 'Cannot query signing identities' "$tmp/output"
unset INKORA_FIXTURE_IDENTITY
printf '%s\n' "$INKORA_SIGN_IDENTITY $INKORA_TEAM_ID $INKORA_NOTARY_PROFILE" |
  python3 "$root/scripts/release/metadata.py" redact > "$tmp/redacted"
! grep -q 'Fixture Secret\|TESTPROFILE\|ABCDEFGHIJ' "$tmp/redacted"
# Entitlements checker accepts exact reviewed permissions and rejects debug/runtime exceptions.
python3 - "$root" "$tmp" <<'PY'
import pathlib, plistlib, subprocess, sys
root, tmp = map(pathlib.Path, sys.argv[1:])
info = tmp / 'Info.plist'
info.write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.huruizhi.Inkora'}))
expected = root / 'app/Resources/Inkora.entitlements'
expanded = tmp / 'expanded.entitlements'
subprocess.run(['python3', str(root / 'scripts/release/metadata.py'), 'entitlements', str(expected), str(expanded)], check=True)
entitlements = plistlib.loads(expanded.read_bytes())
cmd = ['python3', str(root / 'scripts/release/metadata.py'), 'check', str(info), str(expected)]
def check(value, success):
    result = subprocess.run(cmd, input=plistlib.dumps(value), capture_output=True)
    assert (result.returncode == 0) == success, result.stderr
check(entitlements, True)
# Source placeholders must expand exactly; no hardcoded exception list.
placeholder = tmp / 'placeholder.entitlements'
placeholder.write_bytes(plistlib.dumps({'fixture': ['$(PRODUCT_BUNDLE_IDENTIFIER)-spki']}))
subprocess.run(['python3', str(root / 'scripts/release/metadata.py'), 'entitlements', str(placeholder), str(expanded)], check=True)
assert plistlib.loads(expanded.read_bytes()) == {'fixture': ['com.huruizhi.Inkora-spki']}

check(dict(entitlements, **{'com.apple.security.get-task-allow': True}), False)
check(dict(entitlements, **{'com.apple.security.cs.allow-jit': True}), False)
check(dict(entitlements, **{'com.apple.developer.team-identifier': 'WRONG'}), False)
info.write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.huruizhi.Inkora.UITesting'}))
check(entitlements, False)
PY
echo 'Release argument, missing-credential, redaction and metadata checks passed'

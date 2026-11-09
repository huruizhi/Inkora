#!/bin/bash
set -euo pipefail

app=${1:?app path required}
expected_entitlements=${2:?entitlements path required}
binary="$app/Contents/MacOS/InkoraLocalAssetHost"
resources="$app/Contents/Resources"
actual=$(mktemp)
trap 'rm -f "$actual"' EXIT

codesign --verify --strict "$app"
codesign -d --entitlements :- "$app" >"$actual" 2>/dev/null
plutil -lint "$app/Contents/Info.plist" "$actual" "$expected_entitlements"

for key in \
  com.apple.security.app-sandbox \
  com.apple.security.files.user-selected.read-only \
  com.apple.security.files.bookmarks.app-scope \
  com.apple.security.network.client
do
  /usr/libexec/PlistBuddy -c "Print :$key" "$actual" | grep -qx true
done
[[ $(grep -c '<key>' "$actual") -eq 4 ]]

/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app/Contents/Info.plist" | grep -qx '14.0'
xcrun vtool -show-build "$binary" | grep -Eq 'minos 14\.0([[:space:]]|$)'

(cd "$resources" && shasum -a 256 -c ResourceManifest.sha256)
grep -Fq "default-src 'none'" "$resources/index.html"
grep -Fq "connect-src 'none'" "$resources/index.html"
grep -Fq "img-src inkora-asset:" "$resources/index.html"
! grep -ERn 'https?://|file://' "$resources/index.html" "$resources/app.js" "$resources/app.css"

source_root=$(cd "$(dirname "$0")/.." && pwd)
! grep -ERn 'URLSession|NSWorkspace\.shared\.open|loadFileURL|javaScript.*path' "$source_root/Sources" "$source_root/Resources"
grep -Fq 'O_NOFOLLOW' "$source_root/Sources/Host/Support.swift"
grep -Fq 'window.showImage' "$source_root/Resources/app.js"

echo "verify ok: signature, exact entitlements, deployment target, resource manifest, offline policy"

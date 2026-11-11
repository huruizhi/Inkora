#!/bin/bash
# No shell tracing: identities and keychain profile names must never enter logs.
set +x
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
fail() { echo "Release: $2" >&2; exit "$1"; }
[[ $# == 1 ]] || fail 64 'Usage: release.sh archive|sign|notarize|dmg|verify|release|dry-run'
action=$1
case "$action" in archive|sign|notarize|dmg|verify|release|dry-run) ;; *) fail 64 'Unknown release action' ;; esac
# Check credentials before any build, keychain access or mutation.
if [[ $action != dry-run ]]; then
  [[ -n ${INKORA_SIGN_IDENTITY:-} ]] || fail 78 'Set INKORA_SIGN_IDENTITY to a Developer ID Application certificate name.'
  [[ ${INKORA_TEAM_ID:-} =~ ^[A-Z0-9]{10}$ ]] || fail 78 'Set INKORA_TEAM_ID to the 10-character Apple Developer Team ID.'
  [[ $INKORA_SIGN_IDENTITY == 'Developer ID Application: '*"($INKORA_TEAM_ID)" ]] || fail 78 'Identity must be Developer ID Application and match INKORA_TEAM_ID; ad-hoc is forbidden.'
  if [[ $action == notarize || $action == release ]]; then
    [[ -n ${INKORA_NOTARY_PROFILE:-} ]] || fail 78 'Set INKORA_NOTARY_PROFILE after running xcrun notarytool store-credentials <profile> interactively.'
  fi
  identities=$(security find-identity -v -p codesigning 2>/dev/null) || fail 78 'Cannot query signing identities; unlock your signing keychain.'
  [[ $identities == *\""$INKORA_SIGN_IDENTITY"\"* ]] || fail 78 'Developer ID certificate/private key not found. Import it into your keychain and check security find-identity -v -p codesigning.'
  unset identities
fi
kind=developer-id
[[ $action != dry-run ]] || kind=dry-run
work="$root/build/release/$kind"
out="${INKORA_ARTIFACTS_DIR:-$root/artifacts}/release/$kind"
mkdir -p "$work" "$out"
# All child output is sanitized before reaching either the console or artifacts.
exec > >(python3 scripts/release/metadata.py redact | tee -a "$out/release.log") 2>&1
echo "Release action: $action ($kind)"
# Invalidate prior verification evidence before any attempted mutation.
rm -f "$out/SHA256SUMS"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/inkora-release.XXXXXX")
mountpoint=''
cleanup() {
  if [[ -n $mountpoint ]]; then hdiutil detach "$mountpoint" >/dev/null 2>&1 || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
app="$work/export/Inkora.app"
archive="$work/Inkora.xcarchive"
zip="$out/Inkora.zip"
dmg="$out/Inkora.dmg"
if [[ $kind == dry-run ]]; then zip="$out/Inkora-DRY-RUN.zip"; dmg="$out/Inkora-DRY-RUN.dmg"; fi
require_app() { [[ -d $app ]] || fail 66 'Exported App missing; run make release-archive release-sign first.'; }
archive_app() {
  make editor-build generate require-xcode
  rm -rf "$archive" "$work/export"
  if [[ $kind == dry-run ]]; then
    echo 'DRY RUN: unsigned archive, ad-hoc structure validation only. NOT FOR DISTRIBUTION.'
    xcodebuild -quiet -project Inkora.xcodeproj -scheme Inkora -configuration Release \
      -destination 'generic/platform=macOS' -archivePath "$archive" \
      INKORA_BUNDLE_IDENTIFIER=com.huruizhi.Inkora ENABLE_HARDENED_RUNTIME=YES \
      CODE_SIGNING_ALLOWED=NO archive
  else
    xcodebuild -quiet -project Inkora.xcodeproj -scheme Inkora -configuration Release \
      -destination 'generic/platform=macOS' -archivePath "$archive" \
      INKORA_BUNDLE_IDENTIFIER=com.huruizhi.Inkora ENABLE_HARDENED_RUNTIME=YES \
      CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$INKORA_SIGN_IDENTITY" \
      DEVELOPMENT_TEAM="$INKORA_TEAM_ID" archive
  fi
}
sign_app() {
  [[ -d $archive/Products/Applications/Inkora.app ]] || fail 66 'Archive missing; run make release-archive.'
  rm -rf "$work/export"
  if [[ $kind == dry-run ]]; then
    mkdir -p "$work/export"
    ditto "$archive/Products/Applications/Inkora.app" "$app"
    python3 scripts/release/metadata.py entitlements app/Resources/Inkora.entitlements "$scratch/Release.entitlements"
    python3 scripts/release/sign-nested.py "$app" - --timestamp=none
    codesign --force --sign - --options runtime --timestamp=none \
      --entitlements "$scratch/Release.entitlements" "$app"
  else
    python3 scripts/release/metadata.py entitlements app/Resources/Inkora.entitlements "$scratch/Release.entitlements"
    python3 scripts/release/metadata.py export scripts/release/ExportOptions.plist "$scratch/ExportOptions.plist"
    xcodebuild -quiet -exportArchive -archivePath "$archive" \
      -exportPath "$work/export" -exportOptionsPlist "$scratch/ExportOptions.plist"
    python3 scripts/release/sign-nested.py "$app" "$INKORA_SIGN_IDENTITY" --timestamp
    codesign --force --sign "$INKORA_SIGN_IDENTITY" --options runtime --timestamp \
      --entitlements "$scratch/Release.entitlements" "$app"
  fi
  check_app "$app"
}
check_app() {
  codesign --verify --deep --strict "$1"
  codesign -d --entitlements :- "$1" 2>/dev/null | python3 scripts/release/metadata.py check \
    "$1/Contents/Info.plist" app/Resources/Inkora.entitlements
  details=$(codesign -dv --verbose=4 "$1" 2>&1)
  [[ $details == *'runtime)'* ]] || fail 65 'Hardened Runtime flag missing.'
  if [[ $kind != dry-run ]]; then
    [[ $details == *"Authority=$INKORA_SIGN_IDENTITY"* && $details == *"TeamIdentifier=$INKORA_TEAM_ID"* ]] || fail 65 'Developer ID authority/team mismatch.'
  fi
  make --no-print-directory release-bundle-check RELEASE_APP_BUNDLE="$1"
}
make_zip() { rm -f "$zip"; ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"; }
make_dmg() {
  require_app
  check_app "$app"
  rm -rf "$scratch/staging"
  mkdir -p "$scratch/staging"
  ditto "$app" "$scratch/staging/Inkora.app"
  ln -s /Applications "$scratch/staging/Applications"
  rm -f "$dmg"
  hdiutil create -volname "Inkora-$kind" -srcfolder "$scratch/staging" -format UDZO -ov "$dmg"
  if [[ $kind != dry-run ]]; then codesign --sign "$INKORA_SIGN_IDENTITY" --timestamp "$dmg"; fi
  make_zip
  hdiutil verify "$dmg"
}
submit_notary() {
  xcrun notarytool submit "$1" --keychain-profile "$INKORA_NOTARY_PROFILE" --wait \
    --output-format json > "$scratch/notary.json"
  cat "$scratch/notary.json"
  python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("status") == "Accepted" else 65)' \
    "$scratch/notary.json" || fail 65 'Notarization was not Accepted; inspect the submission with notarytool log using your keychain profile.'
}
notarize() {
  require_app
  check_app "$app"
  make_zip
  submit_notary "$zip"
  xcrun stapler staple "$app"
  xcrun stapler validate "$app"
  # ZIP cannot be stapled: rebuild it with the stapled App before distribution.
  make_dmg
  submit_notary "$dmg"
  xcrun stapler staple "$dmg"
}
verify_app() {
  check_app "$1"
  if [[ $kind != dry-run ]]; then
    spctl -a -vvv -t exec "$1"
    xcrun stapler validate "$1"
  fi
}
verify() {
  require_app
  verify_app "$app"
  [[ -f $zip && -f $dmg ]] || fail 66 'DMG/ZIP missing; run release-notarize (production) or release-dry-run.'
  hdiutil verify "$dmg"
  if [[ $kind != dry-run ]]; then
    codesign --verify --strict "$dmg"
    xcrun stapler validate "$dmg"
  fi
  mountpoint="$scratch/mount"
  mkdir -p "$mountpoint"
  hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mountpoint" "$dmg"
  verify_app "$mountpoint/Inkora.app"
  hdiutil detach "$mountpoint"
  mountpoint=''
  ditto -x -k "$zip" "$scratch/unzipped"
  verify_app "$scratch/unzipped/Inkora.app"
  (cd "$out" && shasum -a 256 "$(basename "$zip")" "$(basename "$dmg")" > SHA256SUMS)
  echo "Verified $kind artifacts; no App was launched."
}
case "$action" in
  archive) archive_app ;;
  sign) sign_app ;;
  dmg) make_dmg ;;
  notarize) notarize ;;
  verify) verify ;;
  release|dry-run) archive_app; sign_app; if [[ $kind == dry-run ]]; then make_dmg; else notarize; fi; verify ;;
esac

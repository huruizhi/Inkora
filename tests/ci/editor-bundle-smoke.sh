#!/bin/zsh

set -euo pipefail

if (( $# != 1 )); then
  print -u2 "Usage: editor-bundle-smoke.sh <Inkora.app>"
  exit 64
fi

app_bundle=$1
editor_root="$app_bundle/Contents/Resources/editor"
index="$editor_root/index.html"

if [[ ! -f $index ]]; then
  print -u2 "Bundled editor index is missing: $index"
  exit 66
fi

script_path=$(sed -n 's/.*<script defer src="\.\/\([^"]*\)"><\/script>.*/\1/p' "$index")
if [[ -z $script_path || ! -f "$editor_root/$script_path" ]]; then
  print -u2 "Bundled editor script is missing or invalid: $script_path"
  exit 66
fi

grep -q "script-src inkora-editor://app" "$index"
grep -q "connect-src 'none'" "$index"
if grep -Eq 'https?://' "$index"; then
  print -u2 "Bundled editor HTML contains a network URL"
  exit 65
fi

signed_entitlements=$(codesign -d --entitlements :- "$app_bundle" 2>/dev/null)
if print -r -- "$signed_entitlements" | grep -q 'com.apple.security.network.client'; then
  print -u2 "Release app unexpectedly has network client entitlement"
  exit 65
fi

print -r -- "Offline editor bundle smoke passed ($script_path)"

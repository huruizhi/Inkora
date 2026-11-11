#!/usr/bin/env python3
"""Release metadata checks and streaming redaction; no credential files are read."""
import os
import plistlib
import re
import sys

def invalid(message):
    print(message, file=sys.stderr)
    sys.exit(65)


def expand(value):
    if isinstance(value, str):
        return value.replace("$(PRODUCT_BUNDLE_IDENTIFIER)", "com.huruizhi.Inkora")
    if isinstance(value, list):
        return [expand(item) for item in value]
    if isinstance(value, dict):
        return {key: expand(item) for key, item in value.items()}
    return value

mode = sys.argv[1]
if mode == "redact":
    values = [os.environ.get(key, "") for key in
              ("INKORA_SIGN_IDENTITY", "INKORA_TEAM_ID", "INKORA_NOTARY_PROFILE")]
    for line in sys.stdin:
        for value in sorted(filter(None, values), key=len, reverse=True):
            line = line.replace(value, "[REDACTED]")
        line = re.sub(r"Developer ID Application:[^\n\r\"<]*", "[SIGNING IDENTITY]", line)
        sys.stdout.write(line)
        sys.stdout.flush()
elif mode == "entitlements":
    with open(sys.argv[2], "rb") as source:
        expected = expand(plistlib.load(source))
    with open(sys.argv[3], "wb") as target:
        plistlib.dump(expected, target)
elif mode == "export":
    with open(sys.argv[2], "rb") as source:
        options = plistlib.load(source)
    options["signingCertificate"] = os.environ["INKORA_SIGN_IDENTITY"]
    options["teamID"] = os.environ["INKORA_TEAM_ID"]
    with open(sys.argv[3], "wb") as target:
        plistlib.dump(options, target)
elif mode == "check":
    with open(sys.argv[2], "rb") as source:
        info = plistlib.load(source)
    with open(sys.argv[3], "rb") as source:
        expected = expand(plistlib.load(source))
    actual = plistlib.loads(sys.stdin.buffer.read())
    if info.get("CFBundleIdentifier") != "com.huruizhi.Inkora":
        invalid("Release bundle id must be com.huruizhi.Inkora")
    # Xcode may inject only these signing metadata keys, never runtime exceptions.
    metadata = {"com.apple.application-identifier", "com.apple.developer.team-identifier"}
    if {k: v for k, v in actual.items() if k not in metadata} != expected:
        invalid("Signed entitlements differ from reviewed release entitlements")
    team = os.environ.get("INKORA_TEAM_ID")
    if team:
        for key, value in (("com.apple.developer.team-identifier", team),
                           ("com.apple.application-identifier", team + ".com.huruizhi.Inkora")):
            if key in actual and actual[key] != value:
                invalid("Signed entitlement team or application identifier mismatch")
    print("Release bundle id and signed entitlements verified")
else:
    sys.exit(64)

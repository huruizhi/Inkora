#!/usr/bin/env python3
"""Sign known Sparkle 2 helper code inside-out; never uses --deep signing."""
import pathlib
import subprocess
import sys

app, identity, timestamp = sys.argv[1:]
framework = pathlib.Path(app) / 'Contents/Frameworks/Sparkle.framework'
if framework.exists():
    base = framework / 'Versions/B'
    # Sparkle 2.10 helpers require no sandbox/runtime exception entitlements.
    # Do not propagate main-app entitlements or upstream team identifiers.
    for relative in ['XPCServices/Downloader.xpc', 'XPCServices/Installer.xpc',
                     'Updater.app', 'Autoupdate']:
        target = base / relative
        if target.exists():
            subprocess.run(['codesign', '--force', '--sign', identity, '--options', 'runtime',
                            timestamp, str(target)], check=True)
    subprocess.run(['codesign', '--force', '--sign', identity, '--options', 'runtime',
                    timestamp, str(framework)], check=True)

#!/usr/bin/env python3
"""Exercise archive branch selection using isolated script copies and command stubs."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ArchiveSchemeTests(unittest.TestCase):
    def check_archive(self, action, expected_scheme, unsigned):
        with tempfile.TemporaryDirectory(prefix='inkora-release-scheme-') as directory:
            fixture = Path(directory)
            release = fixture / 'scripts/release'
            release.mkdir(parents=True)
            for name in ('release.sh', 'metadata.py'):
                shutil.copyfile(ROOT / 'scripts/release' / name, release / name)
            commands = fixture / 'bin'
            commands.mkdir()
            def stub(name, source):
                path = commands / name
                path.write_text('#!' + sys.executable + '\n' + source)
                path.chmod(0o700)
            stub('make', 'import sys\nassert sys.argv[1:] == ["editor-build", "generate", "require-xcode"]\n')
            stub('security', '''import os, sys
assert sys.argv[1:] == ['find-identity', '-v', '-p', 'codesigning']
print('1) "' + os.environ['INKORA_SIGN_IDENTITY'] + '"')
''')
            stub('xcodebuild', '''import json, os, pathlib, sys
args = sys.argv[1:]
def value(flag):
    return args[args.index(flag) + 1]
# Store only public build selection, never credential arguments.
record = {'scheme': value('-scheme'), 'configuration': value('-configuration'),
          'destination': value('-destination'), 'action': args[-1],
          'unsigned': 'CODE_SIGNING_ALLOWED=NO' in args,
          'runtime': 'ENABLE_HARDENED_RUNTIME=YES' in args,
          'manual': 'CODE_SIGN_STYLE=Manual' in args,
          'bundle': 'INKORA_BUNDLE_IDENTIFIER=com.huruizhi.Inkora' in args}
pathlib.Path(os.environ['SCHEME_RECORD']).write_text(json.dumps(record))
sys.exit(86)  # Stop before any signing, export, packaging or verification.
''')
            for name in ('codesign', 'xcrun', 'ditto', 'hdiutil'):
                stub(name, 'raise RuntimeError("Unexpected command after archive stub")\n')
            record = fixture / 'record.json'
            env = dict(os.environ, PATH=str(commands) + os.pathsep + os.environ['PATH'],
                       INKORA_SIGN_IDENTITY='Developer ID Application: Fixture (ABCDEFGHIJ)',
                       INKORA_TEAM_ID='ABCDEFGHIJ', INKORA_ARTIFACTS_DIR=str(fixture / 'artifacts'),
                       SCHEME_RECORD=str(record))
            env.pop('INKORA_NOTARY_PROFILE', None)
            if unsigned:
                env.pop('INKORA_SIGN_IDENTITY')
                env.pop('INKORA_TEAM_ID')
            result = subprocess.run(['/bin/bash', str(release / 'release.sh'), action],
                                    env=env, capture_output=True)
            self.assertEqual(result.returncode, 86, result.stderr)
            self.assertEqual(json.loads(record.read_text()), {
                'scheme': expected_scheme, 'configuration': 'Release',
                'destination': 'generic/platform=macOS', 'action': 'archive',
                'unsigned': unsigned, 'runtime': True, 'manual': not unsigned, 'bundle': True})
            self.assertNotIn(b'ABCDEFGHIJ', result.stdout + result.stderr)

    def test_dry_run_uses_default_scheme_without_credentials(self):
        self.check_archive('dry-run', 'Inkora', True)

    def test_developer_id_archive_uses_distribution_scheme(self):
        self.check_archive('archive', 'InkoraDistribution', False)


if __name__ == '__main__':
    unittest.main()

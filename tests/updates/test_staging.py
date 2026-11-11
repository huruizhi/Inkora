import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]

class FailureTests(unittest.TestCase):
    def test_missing_arguments_invalidates_old_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt = pathlib.Path(directory) / 'receipt.json'
            receipt.write_text('{"verified":true}')
            result = subprocess.run(['python3', str(ROOT / 'scripts/updates/staging.py'),
                                     '--output', directory], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(receipt.exists())

if __name__ == '__main__':
    unittest.main()

import base64
import os
import plistlib
import zipfile

@unittest.skipUnless(os.environ.get('SPARKLE_BIN'), 'Set SPARKLE_BIN to pinned official 2.10.0 bin')
class OfficialToolTests(unittest.TestCase):
    def test_signatures_metadata_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            seed = root / 'seed'
            public = root / 'public'
            generator = root / 'key.swift'
            generator.write_text('''import Foundation
import CryptoKit
let key = Curve25519.Signing.PrivateKey()
try key.rawRepresentation.base64EncodedData().write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
try key.publicKey.rawRepresentation.base64EncodedData().write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
''')
            subprocess.run(['swift', str(generator), str(seed), str(public)], check=True, capture_output=True)
            seed.chmod(0o600)
            source = root / 'main.c'
            source.write_text('int main(void) { return 0; }')
            binary = root / 'Inkora'
            subprocess.run(['clang', str(source), '-o', str(binary)], check=True, capture_output=True)
            architecture = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip()
            info = {'CFBundleIdentifier': 'com.huruizhi.Inkora', 'CFBundleExecutable': 'Inkora',
                    'CFBundleVersion': '10', 'CFBundleShortVersionString': '0.1.0',
                    'LSMinimumSystemVersion': '14.0'}
            archive = root / 'Inkora.zip'
            def package():
                with zipfile.ZipFile(archive, 'w') as zipped:
                    zipped.writestr('Inkora.app/Contents/Info.plist', plistlib.dumps(info))
                    zipped.write(binary, 'Inkora.app/Contents/MacOS/Inkora')
            package()
            output = root / 'staging'
            cmd = ['python3', str(ROOT / 'scripts/updates/staging.py'), '--output', str(output),
                   '--archive', str(archive), '--tool', os.environ['SPARKLE_BIN'] + '/sign_update',
                   '--key-file', str(seed), '--public-key', public.read_text(),
                   '--url', 'https://example.org/Inkora.zip', '--feed-url', 'https://example.org/appcast.xml',
                   '--current-build', '9', '--architectures', architecture, '--channel', 'stable']
            count = 0
            def check(action, success, extra=()):
                nonlocal count
                # Plant stale success before every failure, including malformed arguments.
                if not success:
                    output.mkdir(exist_ok=True)
                    (output / 'receipt.json').write_text('{"verified":true}')
                result = subprocess.run(cmd + [action] + list(extra), capture_output=True)
                self.assertEqual(result.returncode == 0, success, result.stderr)
                self.assertEqual((output / 'receipt.json').exists(), success)
                self.assertNotIn(seed.read_bytes(), result.stdout + result.stderr)
                count += 1
            check('stage', True)
            check('verify', True)
            evidence = os.environ.get('UPDATE_EVIDENCE')
            if evidence:
                import shutil
                shutil.copyfile(output / 'receipt.json', pathlib.Path(evidence) / 'fixture-receipt.json')
                shutil.copyfile(output / 'appcast.xml', pathlib.Path(evidence) / 'fixture-appcast.xml')
                fixture = os.environ.get('UPDATE_FIXTURE_DIR')
                if fixture:
                    pathlib.Path(fixture).mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(archive, pathlib.Path(fixture) / 'Inkora.zip')

            original = archive.read_bytes()
            archive.write_bytes(original + b'corruption')
            check('verify', False)
            archive.write_bytes(original)
            feed = output / 'appcast.xml'
            signed_feed = feed.read_bytes()
            feed.write_bytes(signed_feed.replace(b'Inkora', b'Other', 1))
            check('verify', False)
            feed.write_bytes(signed_feed)
            check('verify', False, ['--current-build', '10'])
            check('stage', False, ['--url', 'http://example.org/package.zip'])
            check('verify', False, ['--public-key', base64.b64encode(bytes(32)).decode()])
            original_seed = seed.read_bytes()
            seed.write_bytes(base64.b64encode(os.urandom(32)))
            check('verify', False)  # official feed verification with genuinely wrong signing seed
            seed.write_bytes(original_seed)
            seed.chmod(0o644)
            check('stage', False)
            seed.chmod(0o600)
            info['CFBundleIdentifier'] = 'wrong.bundle'
            package()
            check('stage', False)
            info['CFBundleIdentifier'] = 'com.huruizhi.Inkora'
            package()
            check('stage', True, ['--channel', 'beta'])
            check('verify', False)  # stable cannot silently consume beta staging
            # Real loopback transport interruption; fixture install bytes remain untouched.
            import http.server
            import threading
            import urllib.request
            installed = root / 'installed-fixture'
            installed.write_bytes(b'original installation sentinel')
            class Interrupted(http.server.BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200)
                    self.send_header('Content-Length', str(len(original)))
                    self.end_headers()
                    self.wfile.write(original[:40])
                    self.close_connection = True
                def log_message(self, *args):
                    pass
            server = http.server.HTTPServer(('127.0.0.1', 0), Interrupted)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                with self.assertRaises(Exception):
                    with urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/archive', timeout=3) as response:
                        response.read()
            finally:
                server.shutdown()
                server.server_close()
                worker.join()
            self.assertEqual(installed.read_bytes(), b'original installation sentinel')
            archive.write_bytes(original[:40])  # interrupted/truncated download
            check('stage', False)
            print(f'Official Sparkle + CryptoKit: {count} staging/negative cases passed; no installation executed')

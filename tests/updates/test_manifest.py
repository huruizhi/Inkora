import copy
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / 'scripts/updates/manifest.py'


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.archive = self.root / 'Inkora.zip'
        self.output = self.root / 'out'
        self.input = self.root / 'input.json'
        self.info = {'CFBundleIdentifier': 'com.huruizhi.Inkora', 'CFBundleVersion': '10',
                     'CFBundleShortVersionString': '0.1.0'}
        self.package()
        self.args = ['--output', str(self.output), '--archive', str(self.archive),
                     '--asset', str(self.archive), '--tag', 'v0.1.0-beta.3', '--channel', 'beta',
                     '--source-commit', 'e13234f2033aa3b5b97883ceae6e003658547ba7']

    def package(self):
        with zipfile.ZipFile(self.archive, 'w') as archive:
            archive.writestr('Inkora.app/Contents/Info.plist', plistlib.dumps(self.info))

    def invoke(self, success=True, action='create', extra=()):
        if not success:
            self.output.mkdir(exist_ok=True)
            for name in ('receipt.json', 'PROVENANCE.json'):
                (self.output / name).write_text('{"oldSuccess":true}')
        result = subprocess.run(['python3', str(TOOL), *self.args, action, *extra], capture_output=True)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        for name in ('receipt.json', 'PROVENANCE.json'):
            self.assertEqual((self.output / name).exists(), success)
        if success:
            receipt = json.loads((self.output / 'receipt.json').read_text())
            self.assertFalse(receipt['published'])
            self.assertFalse(receipt['installationAuthorized'])
            self.assertEqual(receipt['scope'], 'local-candidate-only')
            return json.loads((self.output / 'PROVENANCE.json').read_text())

    def test_roundtrip_actual_zip_and_assets(self):
        manifest = self.invoke()
        self.assertEqual(manifest['buildVersion'], '10')
        self.assertEqual(manifest['assets'][0]['byteLength'], self.archive.stat().st_size)
        self.input.write_text(json.dumps(manifest))
        self.invoke(action='verify', extra=['--manifest', str(self.input)])
        # In-place verify snapshots input before invalidating prior success.
        self.invoke(action='verify', extra=['--manifest', str(self.output / 'PROVENANCE.json')])
        evidence = os.environ.get('MANIFEST_EVIDENCE')
        if evidence:
            import shutil
            shutil.copyfile(self.output / 'PROVENANCE.json', Path(evidence) / 'local-PROVENANCE.json')
            shutil.copyfile(self.output / 'receipt.json', Path(evidence) / 'manifest-receipt.json')
            fixture = os.environ.get('MANIFEST_FIXTURE_DIR')
            if fixture:
                Path(fixture).mkdir(parents=True, exist_ok=True)
                shutil.copyfile(self.archive, Path(fixture) / 'Inkora.zip')
        self.invoke(extra=['--channel', 'stable', '--tag', 'v0.1.0'])

    def test_build_rejections(self):
        for value in ('0', '-1', '01', '1.0', '1e3', '9223372036854775808', '9' * 100, 10, True, ''):
            with self.subTest(value=value):
                self.info['CFBundleVersion'] = value
                self.package()
                self.invoke(False)
        self.info['CFBundleVersion'] = '9223372036854775807'
        self.package()
        self.invoke()

    def test_conflicting_manifest_fields_and_urls(self):
        manifest = self.invoke()
        mutations = [
            ('schema', 'unknown'), ('buildVersion', '11'), ('buildVersion', 10),
            ('bundleIdentifier', 'wrong.bundle'), ('channel', 'stable'),
            ('tag', 'v0.1.0-beta.4'), ('marketingVersion', '0.2.0'),
            ('sourceCommit', 'a' * 39), ('checks', {'export': {'versions': {'CFBundleVersion': '11'}}})]
        for field, value in mutations:
            with self.subTest(field=field, value=value):
                modified = copy.deepcopy(manifest)
                modified[field] = value
                self.input.write_text(json.dumps(modified))
                self.invoke(False, 'verify', ['--manifest', str(self.input)])
        url = manifest['assets'][0]['url']
        for replacement in [url.replace('https:', 'http:'), url + '#fragment', url + '?query',
                            url.replace('github.com', 'user:secret@github.com'),
                            url.replace('github.com', 'github.com:443'),
                            url.replace('huruizhi/Inkora', 'other/Inkora'),
                            url.replace('beta.3', 'beta.4'), url.replace('Inkora.zip', 'Other.zip')]:
            with self.subTest(url=replacement):
                modified = copy.deepcopy(manifest)
                modified['assets'][0]['url'] = replacement
                self.input.write_text(json.dumps(modified))
                self.invoke(False, 'verify', ['--manifest', str(self.input)])
        for field, value in [('name', 'Other.zip'), ('byteLength', 1), ('sha256', '0' * 64)]:
            modified = copy.deepcopy(manifest)
            modified['assets'][0][field] = value
            self.input.write_text(json.dumps(modified))
            self.invoke(False, 'verify', ['--manifest', str(self.input)])
        self.input.write_text(json.dumps(manifest).replace('"schema":', '"schema":"duplicate", "schema":'))
        self.invoke(False, 'verify', ['--manifest', str(self.input)])

    def test_bad_inputs_and_asset_changes(self):
        manifest = self.invoke()
        self.input.write_text(json.dumps(manifest))
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        self.invoke(False, 'verify', ['--manifest', str(self.input)])
        self.package()
        self.info['CFBundleIdentifier'] = 'wrong.bundle'
        self.package()
        self.invoke(False)
        self.info['CFBundleIdentifier'] = 'com.huruizhi.Inkora'
        self.package()
        for extra in [ ['--tag', 'v0.2.0-beta.3'], ['--channel', 'stable'],
                       ['--tag', 'v0.1.0-beta.0'], ['--source-commit', 'A' * 40],
                       ['--asset', str(self.archive)]]:
            self.invoke(False, extra=extra)
        self.output.mkdir(exist_ok=True)
        for name in ('receipt.json', 'PROVENANCE.json'):
            (self.output / name).write_text('stale')
        result = subprocess.run(['python3', str(TOOL), '--output', str(self.output)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.output / 'receipt.json').exists())
        self.assertFalse((self.output / 'PROVENANCE.json').exists())

    def test_release_metadata_binding(self):
        manifest = self.invoke()
        asset = manifest['assets'][0]
        metadata = {'tag_name': manifest['tag'], 'draft': False, 'prerelease': True,
                    'html_url': 'https://github.com/huruizhi/Inkora/releases/tag/' + manifest['tag'],
                    'assets': [{'name': asset['name'], 'browser_download_url': asset['url'],
                                'size': asset['byteLength'], 'digest': 'sha256:' + asset['sha256']}]}
        release = self.root / 'release.json'
        release.write_text(json.dumps(metadata))
        self.invoke(extra=['--release-metadata', str(release)])
        for field, value in [('tag_name', 'other'), ('draft', True), ('prerelease', False),
                             ('html_url', 'https://github.com/other/Inkora')]:
            modified = copy.deepcopy(metadata)
            modified[field] = value
            release.write_text(json.dumps(modified))
            self.invoke(False, extra=['--release-metadata', str(release)])
        for field, value in [('browser_download_url', asset['url'] + '#bad'),
                             ('size', 1), ('digest', 'sha256:' + '0' * 64), ('name', 'wrong')]:
            modified = copy.deepcopy(metadata)
            modified['assets'][0][field] = value
            release.write_text(json.dumps(modified))
            self.invoke(False, extra=['--release-metadata', str(release)])


if __name__ == '__main__':
    unittest.main()

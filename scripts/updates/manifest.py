#!/usr/bin/env python3
"""Generate/validate local release candidates. No network, installation or keys."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import sys
import zipfile

MAX_BUILD = 9223372036854775807
REPOSITORY = 'huruizhi/Inkora'


def require(value, message):
    if not value:
        raise ValueError(message)


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON field')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs)


def build_version(value):
    require(isinstance(value, str) and re.fullmatch(r'[1-9][0-9]{0,18}', value)
            and int(value) <= MAX_BUILD, 'Invalid buildVersion')
    return value


def zip_info(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate ZIP entries')
        require(all(not name.startswith('/') and '..' not in Path(name).parts for name in names),
                'Unsafe ZIP path')
        infos = [name for name in names if name.endswith('.app/Contents/Info.plist') and name.count('/') == 2]
        require(infos == ['Inkora.app/Contents/Info.plist'], 'Expected only Inkora.app')
        info = plistlib.loads(archive.read(infos[0]))
    require(info.get('CFBundleIdentifier') == 'com.huruizhi.Inkora', 'Wrong bundleIdentifier')
    build_version(info.get('CFBundleVersion'))
    require(isinstance(info.get('CFBundleShortVersionString'), str) and
            re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)',
                         info['CFBundleShortVersionString']), 'Invalid marketingVersion')
    return info


def candidate(archive, assets, tag, channel, source):
    require(channel in ('stable', 'beta'), 'Wrong channel')
    require(re.fullmatch(r'[0-9a-f]{40}', source), 'Invalid sourceCommit')
    info = zip_info(archive)
    marketing = info['CFBundleShortVersionString']
    pattern = 'v' + re.escape(marketing) + (r'-beta\.[1-9][0-9]*' if channel == 'beta' else '')
    require(re.fullmatch(pattern, tag), 'Tag/channel/marketingVersion conflict')
    require(archive.suffix == '.zip' and archive in assets, 'Candidate ZIP must be an asset')
    require(len(assets) == len(set(assets)) and len({p.name for p in assets}) == len(assets),
            'Duplicate asset')
    records = []
    for path in sorted(assets, key=lambda p: p.name):
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', path.name), 'Unsafe asset name')
        data = path.read_bytes()
        require(0 < len(data) <= MAX_BUILD, 'Invalid asset byteLength')
        records.append({'name': path.name,
                        'url': f'https://github.com/{REPOSITORY}/releases/download/{tag}/{path.name}',
                        'byteLength': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    return {'schema': 'inkora.release.v1', 'bundleIdentifier': info['CFBundleIdentifier'],
            'buildVersion': info['CFBundleVersion'], 'marketingVersion': marketing,
            'channel': channel, 'tag': tag, 'sourceCommit': source, 'assets': records}


def validate_release(metadata, manifest):
    require(metadata.get('tag_name') == manifest['tag'] and metadata.get('draft') is False,
            'Release tag/draft conflict')
    require(metadata.get('prerelease') is (manifest['channel'] == 'beta'), 'Release channel conflict')
    require(metadata.get('html_url') == f"https://github.com/{REPOSITORY}/releases/tag/{manifest['tag']}",
            'Release repository conflict')
    assets = metadata.get('assets')
    require(isinstance(assets, list), 'Missing Release assets')
    for record in manifest['assets']:
        matches = [a for a in assets if a.get('name') == record['name']]
        require(len(matches) == 1, 'Missing/duplicate Release asset')
        asset = matches[0]
        require(asset.get('browser_download_url') == record['url'] and
                type(asset.get('size')) is int and asset['size'] == record['byteLength'],
                'Release asset URL/size conflict')
        if asset.get('digest') is not None:
            require(asset['digest'] == 'sha256:' + record['sha256'], 'Release digest conflict')


def main():
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument('--output', required=True, type=Path)
    pre.add_argument('--manifest', type=Path)
    known, _ = pre.parse_known_args()
    # Snapshot a verification input before invalidating output (also works in-place).
    try:
        data = known.manifest.read_bytes() if known.manifest and known.manifest.is_file() else None
    except OSError:
        data = None
    known.output.mkdir(parents=True, exist_ok=True)
    for name in ('receipt.json', 'PROVENANCE.json'):
        (known.output / name).unlink(missing_ok=True)
    parser = argparse.ArgumentParser(parents=[pre])
    parser.add_argument('action', choices=('create', 'verify'))
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--asset', required=True, action='append', type=Path)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--channel', required=True, choices=('stable', 'beta'))
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--release-metadata', type=Path)
    args = parser.parse_args()
    expected = candidate(args.archive, args.asset, args.tag, args.channel, args.source_commit)
    if args.action == 'verify':
        require(data is not None, 'Manifest required')
        actual = strict_json(data)
        # Exact structure/types, including rejecting unknown/conflicting legacy fields and bool sizes.
        require(json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True),
                'Manifest conflicts with actual candidate bytes or requested release')
    else:
        require(args.manifest is None, 'Create does not accept manifest')
    if args.release_metadata:
        validate_release(strict_json(args.release_metadata.read_bytes()), expected)
    encoded = (json.dumps(expected, indent=2) + '\n').encode()
    (args.output / 'PROVENANCE.json').write_bytes(encoded)
    (args.output / 'receipt.json').write_text(json.dumps({
        'scope': 'local-candidate-only', 'published': False, 'installationAuthorized': False,
        'manifestSHA256': hashlib.sha256(encoded).hexdigest(),
        'releaseMetadataChecked': bool(args.release_metadata)}, indent=2) + '\n')
    print('Local candidate verified; no upload, publication or installation authorized')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Manifest failed closed: ' + str(error), file=sys.stderr)
        sys.exit(65)

#!/usr/bin/env python3
"""Local-only signed update staging. Never installs or publishes anything."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile

NS = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
ET.register_namespace('sparkle', NS)

def require(condition, message):
    if not condition:
        raise ValueError(message)

def run(command):
    # Official tools can echo malformed private input. Never forward their output.
    result = subprocess.run(command, capture_output=True)
    require(result.returncode == 0, 'Official tool validation failed')
    return result.stdout.decode().strip()

def https(value):
    url = urlsplit(value)
    require(url.scheme == 'https' and url.hostname and not url.username and not url.password
            and not url.fragment, 'An HTTPS destination without credentials is required')
    return value

def metadata(archive, current, architectures):
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        require(all(not n.startswith('/') and '..' not in Path(n).parts for n in names),
                'Unsafe archive path')
        infos = [n for n in names if n.endswith('.app/Contents/Info.plist') and n.count('/') == 2]
        require(infos == ['Inkora.app/Contents/Info.plist'], 'Expected exactly Inkora.app')
        info = plistlib.loads(package.read(infos[0]))
        require(info.get('CFBundleIdentifier') == 'com.huruizhi.Inkora', 'Wrong bundle ID')
        version = info.get('CFBundleVersion', '')
        require(isinstance(version, str) and re.fullmatch(r'[1-9][0-9]*', version)
                and int(version) > current, 'Build must increase')
        require(re.fullmatch(r'\d+\.\d+\.\d+', info.get('CFBundleShortVersionString', '')),
                'Invalid marketing version')
        minimum = info.get('LSMinimumSystemVersion', '')
        require(re.fullmatch(r'\d+\.\d+(?:\.\d+)?', minimum) and int(minimum.split('.')[0]) >= 14,
                'Invalid minimum macOS')
        executable = info.get('CFBundleExecutable', '')
        require(executable == 'Inkora', 'Unexpected executable')
        with tempfile.TemporaryDirectory(prefix='inkora-architecture-') as directory:
            binary = Path(directory) / executable
            binary.write_bytes(package.read('Inkora.app/Contents/MacOS/' + executable))
            actual = set(run(['lipo', '-archs', str(binary)]).split())
        require(actual == set(architectures.split(',')), 'Archive architectures differ')
        return info

def main():
    # Discover output before required-argument parsing so a failed retry cannot leave green evidence.
    preliminary = argparse.ArgumentParser(add_help=False)
    preliminary.add_argument('--output', required=True, type=Path)
    known, _ = preliminary.parse_known_args()
    known.output.mkdir(parents=True, exist_ok=True)
    receipt = known.output / 'receipt.json'
    receipt.unlink(missing_ok=True)
    parser = argparse.ArgumentParser(parents=[preliminary])
    parser.add_argument('action', choices=['stage', 'verify'])
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--tool', required=True, type=Path)
    parser.add_argument('--key-file', required=True, type=Path)
    parser.add_argument('--public-key', required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--feed-url', required=True)
    parser.add_argument('--current-build', required=True, type=int)
    parser.add_argument('--architectures', required=True)
    parser.add_argument('--channel', choices=['stable', 'beta'], required=True)
    args = parser.parse_args()
    require(args.current_build > 0, 'Current build must be positive')
    https(args.url)
    https(args.feed_url)
    require(args.archive.suffix == '.zip', 'Only ZIP update archives are accepted')
    require(args.key_file.is_file() and stat.S_IMODE(args.key_file.stat().st_mode) == 0o600 and not args.key_file.is_symlink(),
            'Key file must be a regular private 0600 file')
    seed = base64.b64decode(args.key_file.read_bytes().strip(), validate=True)
    require(len(seed) == 32, 'Expected a Sparkle 32-byte seed file')
    del seed
    require(len(base64.b64decode(args.public_key, validate=True)) == 32, 'Invalid public key')
    info = metadata(args.archive, args.current_build, args.architectures)
    require(hashlib.sha256(args.tool.read_bytes()).hexdigest() ==
            '43c249771bafc3aa581228abae00731a012d324691b8292860896635050be76b',
            'Expected official Sparkle 2.10.0 sign_update binary')
    tool = str(args.tool.resolve())
    key = str(args.key_file.resolve())
    archive = str(args.archive.resolve())
    feed = args.output / 'appcast.xml'
    length = args.archive.stat().st_size
    if args.action == 'stage':
        signature = run([tool, '--ed-key-file', key, '-p', archive])
        root = ET.Element('rss', version='2.0')
        channel = ET.SubElement(root, 'channel')
        ET.SubElement(channel, 'title').text = 'Inkora'
        ET.SubElement(channel, 'link').text = args.feed_url
        item = ET.SubElement(channel, 'item')
        ET.SubElement(item, 'title').text = 'Inkora ' + info['CFBundleShortVersionString']
        for tag, value in [('version', info['CFBundleVersion']),
                           ('shortVersionString', info['CFBundleShortVersionString']),
                           ('minimumSystemVersion', info['LSMinimumSystemVersion'])]:
            ET.SubElement(item, '{' + NS + '}' + tag).text = value
        if args.channel == 'beta':
            ET.SubElement(item, '{' + NS + '}channel').text = 'beta'
        ET.SubElement(item, 'enclosure', {'url': args.url, 'length': str(length),
                      'type': 'application/octet-stream', '{' + NS + '}edSignature': signature})
        ET.ElementTree(root).write(feed, encoding='utf-8', xml_declaration=True)
        run([tool, '--ed-key-file', key, str(feed)])
    run([tool, '--ed-key-file', key, '--verify', str(feed)])
    root = ET.parse(feed).getroot()
    items = root.findall('./channel/item')
    require(len(items) == 1, 'Expected one staged item')
    item = items[0]
    for tag, expected in [('version', info['CFBundleVersion']),
                          ('shortVersionString', info['CFBundleShortVersionString']),
                          ('minimumSystemVersion', info['LSMinimumSystemVersion']),
                          ('channel', 'beta' if args.channel == 'beta' else None)]:
        require(item.findtext('{' + NS + '}' + tag) == expected, 'Feed metadata mismatch')
    enclosure = item.find('enclosure')
    require(enclosure is not None and enclosure.get('url') == args.url
            and enclosure.get('length') == str(length), 'Feed enclosure mismatch')
    run([tool, '--ed-key-file', key, '--verify', archive, enclosure.get('{' + NS + '}edSignature', '')])
    run(['swift', str(Path(__file__).with_name('verify-public.swift')), args.public_key,
         enclosure.get('{' + NS + '}edSignature', ''), archive])
    receipt.write_text(json.dumps({'verified': True, 'scope': 'local-staging-only', 'sparkleVersion': '2.10.0',
        'bundle': info['CFBundleIdentifier'], 'build': info['CFBundleVersion'],
        'channel': args.channel, 'url': args.url, 'feedURL': args.feed_url,
        'length': length, 'sha256': hashlib.sha256(args.archive.read_bytes()).hexdigest(),
        'feedSHA256': hashlib.sha256(feed.read_bytes()).hexdigest(),
        'publicKey': args.public_key}, indent=2) + '\n')
    print('Official Sparkle signature and staging metadata verified; nothing published or installed')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Update staging failed closed; no success receipt. Check inputs and official tools.', file=sys.stderr)
        sys.exit(65)

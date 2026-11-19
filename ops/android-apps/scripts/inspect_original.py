#!/usr/bin/env python3
"""Read-only AAB metadata inspection; never opens or creates a signing key."""
import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path


def varint(data, pos):
    value = shift = 0
    while pos < len(data):
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7
        if shift > 63:
            raise ValueError('Invalid varint')
    raise ValueError('Truncated protobuf')


def fields(data):
    pos = 0
    result = []
    while pos < len(data):
        tag, pos = varint(data, pos)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            length, pos = varint(data, pos)
            value, pos = data[pos:pos + length], pos + length
            if len(value) != length:
                raise ValueError('Truncated field')
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            value, pos = data[pos:pos + length], pos + length
        else:
            raise ValueError('Unsupported protobuf field')
        result.append((field, wire, value))
    return result


def get(data, number, default=b''):
    return next((value for field, wire, value in fields(data) if field == number), default)


def text(data, number):
    return get(data, number).decode('utf-8')


def xmlnode(data):
    element = get(data, 1)
    if not element:
        return None
    return {
        'tag': text(element, 3),
        'attributes': {text(value, 2): text(value, 3) for field, wire, value in fields(element) if field == 4},
        'children': [node for field, wire, value in fields(element) if field == 5 if (node := xmlnode(value))],
    }


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError('Corrupt original AAB')
        manifest = xmlnode(archive.read('base/manifest/AndroidManifest.xml'))
        package = manifest['attributes']['package']
        strings, colors, booleans, integers = {}, {}, {}, {}
        for number, wire, pkg in fields(archive.read('base/resources.pb')):
            if number != 2:
                continue
            for number, wire, kind in fields(pkg):
                if number != 3:
                    continue
                type_name = text(kind, 2)
                if type_name not in ('string', 'color', 'bool', 'integer'):
                    continue
                for number, wire, entry in fields(kind):
                    if number != 3:
                        continue
                    name = text(entry, 2)
                    for number, wire, config in fields(entry):
                        if number != 6 or get(config, 1):
                            continue
                        item = get(get(config, 2), 4)
                        if not item:
                            continue
                        if type_name == 'string' and get(item, 2):
                            strings[name] = text(get(item, 2), 1)
                        elif type_name == 'color' and get(item, 7):
                            value = get(get(item, 7), 10, None)
                            if isinstance(value, int):
                                colors[name] = f'#{value:08x}'
                        elif type_name == 'bool' and get(item, 7):
                            booleans[name] = bool(get(get(item, 7), 8, 0))
                        elif type_name == 'integer' and get(item, 7):
                            value = get(get(item, 7), 6, None)
                            if isinstance(value, int):
                                integers[name] = value
        selected = ['appName', 'launcherName', 'launchUrl', 'hostName', 'webManifestUrl', 'generatorApp', 'providerAuthority', 'fallbackType', 'orientation', 'assetStatements']
        dependencies = {}
        for number, wire, library in fields(archive.read('BUNDLE-METADATA/com.android.tools.build.libraries/dependencies.pb')):
            if number == 1:
                coordinate = get(library, 1)
                if coordinate:
                    group, artifact, version = text(coordinate, 1), text(coordinate, 2), text(coordinate, 5)
                    if group == 'com.google.androidbrowserhelper':
                        dependencies[group + ':' + artifact] = version
        gradle_metadata = archive.read('BUNDLE-METADATA/com.android.tools.build.gradle/app-metadata.properties').decode()
        return {
            'file': path.name,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'package': package,
            'manifest': manifest['attributes'],
            'sdk': next(x['attributes'] for x in manifest['children'] if x['tag'] == 'uses-sdk'),
            'permissions': [x['attributes'] for x in manifest['children'] if x['tag'] == 'uses-permission'],
            'buildToolchain': {'gradlePlugin': dict(line.split('=', 1) for line in gradle_metadata.splitlines() if '=' in line).get('androidGradlePluginVersion'), 'libraries': dependencies},
            'strings': {name: strings[name] for name in selected if name in strings},
            'colors': {name: value for name, value in colors.items() if name in ['colorPrimary', 'colorPrimaryDark', 'backgroundColor', 'navigationColor', 'navigationColorDark', 'navigationDividerColor', 'navigationDividerColorDark']},
            'booleans': {name: value for name, value in booleans.items() if name.startswith('enable')},
            'integers': {name: value for name, value in integers.items() if 'splash' in name.lower()},
            'webManifest': json.loads(archive.read('base/res/raw/web_app_manifest.json')),
            'nativeSourceStatus': 'reconstructed-from-read-only-AAB-metadata; original-source-unavailable',
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('aab', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = inspect(args.aab)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
        print(f"Inspected {result['package']} (original unchanged)")
    else:
        print(rendered)

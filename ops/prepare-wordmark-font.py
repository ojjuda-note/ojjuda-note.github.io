#!/usr/bin/env python3
"""Recreate the small OFL icon lettering font from a checksum-verified source."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/bagelfatone/BagelFatOne-Regular.ttf'
SOURCE_SHA256 = '9286944032c5a9b20ad70940105417beae14013e0b4f5fc292425afdc4330245'
OUTPUT_SHA256 = '56f53efa07b04cf38ec672d790be1094fc15d5c9efb9fb280cf40805a2504f41'
DESTINATION = Path(__file__).resolve().parents[1] / 'brand/app-icons/wordmark/font/OjjudaIconLettering-Regular.ttf'


def main():
    request = Request(SOURCE_URL, headers={'User-Agent': 'Ojjuda icon font build'})
    with urlopen(request, timeout=60) as response:
        original = response.read()
    if sha256(original).hexdigest() != SOURCE_SHA256:
        raise SystemExit('The upstream font changed; review it before updating the pinned checksum.')
    font = TTFont(BytesIO(original), recalcTimestamp=False)
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text='아지트공원파장 ')
    subsetter.subset(font)
    names = {
        1: 'Ojjuda Icon Lettering', 2: 'Regular',
        3: 'Ojjuda Icon Lettering-20261120', 4: 'Ojjuda Icon Lettering',
        6: 'OjjudaIconLettering-Regular', 16: 'Ojjuda Icon Lettering', 17: 'Regular',
    }
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    result = BytesIO()
    font.save(result)
    data = result.getvalue()
    digest = sha256(data).hexdigest()
    if digest != OUTPUT_SHA256:
        raise SystemExit('Font output differs from the reviewed subset; use fontTools 4.61.1.')
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_bytes(data)
    print(f'Prepared {DESTINATION.name}: {len(data)} bytes, SHA-256 {digest}')


if __name__ == '__main__':
    main()

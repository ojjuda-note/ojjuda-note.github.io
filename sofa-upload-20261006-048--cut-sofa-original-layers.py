"""Crop the supplied sofa pictures without repainting their original RGB pixels.

Usage: python scripts/cut-sofa-original-layers.py SIDE.png BODY.png
Only the background and the detached wooden frame are excluded. The side panel,
its wooden rail and its two feet remain one picture; the body stays one picture.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

target = Path(__file__).resolve().parents[1] / 'house-test/assets/sofa-original-layers-v1'
if len(sys.argv) != 3:
    raise SystemExit('Usage: cut-sofa-original-layers.py SIDE.png BODY.png')
target.mkdir(parents=True, exist_ok=True)
records = {}
for name, path in zip(('side', 'body'), map(Path, sys.argv[1:])):
    pixels = np.array(Image.open(path).convert('RGBA'))
    # The side image was flattened onto black. Exclude its very dark matte
    # fringe; keep the visible upholstery/wood RGB exactly as supplied.
    foreground = pixels[:, :, 3] > 0 if name == 'body' else pixels[:, :, :3].max(axis=2) > 60
    labels, _ = ndimage.label(foreground)
    counts = np.bincount(labels.ravel())
    keep = labels == (counts[1:].argmax() + 1)
    yy, xx = np.where(keep)
    crop = [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
    pixels[:, :, 3] = np.where(keep, pixels[:, :, 3], 0)
    cutout = Image.fromarray(pixels).crop(crop)
    output = target / f'{name}.png'
    cutout.save(output, optimize=True)
    original = np.array(Image.open(path).convert('RGBA').crop(crop))
    actual = np.array(cutout)
    visible = actual[:, :, 3] > 0
    assert np.array_equal(original[:, :, :3][visible], actual[:, :, :3][visible])
    records[name] = {'source': path.name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'crop': crop, 'size': list(cutout.size), 'file': output.name,
                     'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                     'visiblePixels': int(visible.sum()), 'changedVisibleRgbPixels': 0}
(target / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(records, ensure_ascii=False))

import hashlib
import json
import subprocess
from pathlib import Path

recipe = json.loads(Path('ops/matgo-review-patch.json').read_text())
def safe(path):
    p = Path(path)
    assert not p.is_absolute() and '..' not in p.parts and '.git' not in p.parts
    return p

outputs = []
for entry in recipe['files']:
    path, source = safe(entry['path']), safe(entry['source'])
    data = source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry['base_sha256'], str(source)
    text = data.decode('utf-8')
    for offset, old, new in reversed(entry['changes']):
        assert text[offset:offset + len(old)] == old, str(path)
        text = text[:offset] + new + text[offset + len(old):]
    result = text.encode('utf-8')
    assert hashlib.sha256(result).hexdigest() == entry['sha256'], str(path)
    outputs.append((path, result))
for path, data in outputs:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f'{path}: {len(data)} bytes; SHA-256 verified')

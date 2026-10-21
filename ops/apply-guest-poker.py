from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
changes=json.loads((root/'ops/guest-poker-edits.json').read_text())
for name,change in changes.items():
    p=root/name
    source=p.read_text()
    digest=hashlib.sha256(source.encode()).hexdigest()
    if digest==change['after']:continue
    assert digest==change['before'], 'Unexpected source: '+name
    for start,end,value in reversed(change['edits']):
        source=source[:start]+value+source[end:]
    assert hashlib.sha256(source.encode()).hexdigest()==change['after'], 'Invalid result: '+name
    p.write_text(source)
    print('Updated',name)

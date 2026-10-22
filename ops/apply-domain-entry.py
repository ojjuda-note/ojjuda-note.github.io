from pathlib import Path
import hashlib,json,subprocess

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'ops'/'domain-entry-edits.json').read_text())
for entry in manifest:
    path=root/entry['path']
    data=path.read_bytes()
    assert hashlib.sha256(data).hexdigest()==entry['before'],entry['path']+': changed base'
    text=data.decode()
    for edit in entry['edits']:
        assert text.count(edit['old'])==edit['count'],entry['path']+': changed match count'
        text=text.replace(edit['old'],edit['new'])
    output=text.encode()
    assert hashlib.sha256(output).hexdigest()==entry['after'],entry['path']+': output mismatch'
    path.write_bytes(output)
old_name='\uC6D4\uB4DC'
for name in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0'):
    if not name or name in {'ops/domain-entry-edits.json','ops/apply-domain-entry.py'}:continue
    try:text=(root/name).read_bytes().decode()
    except UnicodeError:continue
    assert old_name not in text.replace(old_name+'땅따먹기',''),name+': old Korean branding remains outside the retained game name'
print('Verified entry patches:',len(manifest))

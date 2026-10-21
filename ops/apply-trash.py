from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'ops/trash-edits.json').read_text())
for name,change in manifest['changes'].items():
 p=root/name
 if p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==change['after']:continue
 if change.get('source_at_base'):
  source=subprocess.check_output(['git','show',manifest['base']+':'+change['source_at_base']],cwd=root,text=True)
 else:source=p.read_text()
 assert hashlib.sha256(source.encode()).hexdigest()==change['before'],'Unexpected source: '+name
 for start,end,value in reversed(change['edits']):source=source[:start]+value+source[end:]
 assert hashlib.sha256(source.encode()).hexdigest()==change['after'],'Invalid output: '+name
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
 print('Updated',name)

"""Read-only candidate builder: never writes to main or publishes the website."""
from pathlib import Path
import json, subprocess, re, tempfile, concurrent.futures, urllib.request, urllib.parse
ROOT=Path.cwd(); OUT=ROOT/'recovery-evidence'; OUT.mkdir(exist_ok=True)
PRS={913:'0efbb920abc5c2a0a8b04b17c67baef781169aae',915:'106af424bb8069e6cf7d8271245331531e2834e6',919:'035802ae8c32db2c51565b65f603af5480e13d33',929:'baa8d0df0725bca23a93a61322fa9bb83024901c',939:'cd655fec712c2dab7a5f852a9925ec12d746a8eb',940:'c0c978e129ff1215c68ed745b67a0e23c45ee9fc',947:'9d308de079562368a434ab75448831f885f68d22',948:'ca77d33b4d1498f77b80c826defb256587e0b044',951:'ffbe767f469cea07a07d07d9471c15feb2712fc4'}
GROUPS=['hearts2hearts','kissoflife','kiiikiii','stayc','seventeen','enhypen','riize','boynextdoor']
def cmd(*args): return subprocess.check_output(args,text=True)
def git(*args): return cmd('git',*args)
BASE=git('rev-parse','origin/main').strip()
# Worktree permits exact semantic comparison without changing the audit branch checkout.
work=Path(tempfile.mkdtemp(prefix='fan-recovery-'))
subprocess.run(['git','worktree','add','--detach',str(work),BASE],check=True)
for number,head in PRS.items():
    subprocess.run(['git','fetch','--no-tags','origin',f'pull/{number}/head'],check=True)
    actual=git('rev-parse','FETCH_HEAD').strip()
    assert actual==head, f'PR {number} changed: stop and review'
    ancestor=git('merge-base',BASE,head).strip()
    rel='features/fanpages/artists-extra.js'
    a=OUT/f'{number}-ancestor.js'; a.write_text(git('show',f'{ancestor}:{rel}'))
    h=OUT/f'{number}-head.js'; h.write_text(git('show',f'{head}:{rel}'))
    current=work/rel
    result=subprocess.run(['git','merge-file','-p',str(current),str(a),str(h)],capture_output=True,text=True)
    assert result.returncode in (0,1), result.stderr
    text=result.stdout
    if result.returncode:
        def resolve(m):
            ours,theirs=m.group(1),m.group(2)
            if number==915 and "official: 'https://kissoflife.jp/'" in theirs and "youtube: 'https://www.youtube.com/@KISSOFLIFE_official'" in ours: return theirs
            if number==940 and "photoYear: '2025'" in ours and 'morePhotos:' in theirs: return theirs.replace("photoYear: '2024'", "photoYear: '2025'")
            raise RuntimeError(f'Unreviewed conflict in PR {number}')
        text=re.sub(r'<<<<<<<[^\n]*\n(.*?)=======\n(.*?)>>>>>>>[^\n]*\n',resolve,text,flags=re.S)
    assert '<<<<<<<' not in text
    current.write_text(text)
    paths=git('diff','--name-only',ancestor,head).splitlines()
    rel='features/fanpages/profiles-extra.js'
    if rel in paths:
        diff=git('diff','--unified=0',ancestor,head,'--',rel)
        assert not [l for l in diff.splitlines() if l.startswith('-') and not l.startswith('---')], 'profile deletions require manual review'
        added='\n'.join(l[1:] for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        with (work/rel).open('a') as f: f.write('\n'+added+'\n')
    rel='features/fanpages/videos.js'
    if rel in paths:
        a.write_text(git('show',f'{ancestor}:{rel}'));h.write_text(git('show',f'{head}:{rel}'));current=work/rel
        if number in [913,940]:
            result=subprocess.run(['git','merge-file','-p',str(current),str(a),str(h)],capture_output=True,text=True)
            assert result.returncode==0, 'video merge conflict';current.write_text(result.stdout)
        else:
            group={915:'kissoflife',919:'kiiikiii',929:'stayc',948:'riize',951:'boynextdoor'}[number]
            match=re.search(r'^  '+group+r': \[\n.*?^  \]',h.read_text(),re.M|re.S); assert match
            text=current.read_text();assert not re.search(r'^  '+group+':',text,re.M)
            text=re.sub(r'\n\}\);\s*$',',\n'+match[0]+'\n});\n',text);current.write_text(text)
# Export exact data to inspect sources and detect unrelated changes.
js="""const fs=require('fs'),vm=require('vm'),path=require('path');const root=process.argv[1];let c=vm.createContext({window:{},console});for(const f of ['artists.js','artists-extra.js','profiles.js','profiles-extra.js','videos.js'])vm.runInContext(fs.readFileSync(path.join(root,'features/fanpages',f),'utf8'),c);process.stdout.write(JSON.stringify(c.window));"""
def data(root):return json.loads(cmd('node','-e',js,str(root)))
before=data(ROOT);after=data(work)
for group in [a['id'] for a in before['OJJUDA_FAN_ARTISTS'] if a['id'] not in GROUPS]:
    for key in ['OJJUDA_FAN_PROFILES','OJJUDA_FAN_VIDEOS']:assert before[key].get(group)==after[key].get(group), (group,key)
    assert next(a for a in before['OJJUDA_FAN_ARTISTS'] if a['id']==group)==next(a for a in after['OJJUDA_FAN_ARTISTS'] if a['id']==group),group
(OUT/'candidate-data.json').write_text(json.dumps(after,ensure_ascii=False,indent=2))
(OUT/'baseline-sha.txt').write_text(BASE+'\n')
# Original video metadata and Commons licensing are queried from the original services.
items=[]
for group in GROUPS:
    old_ids={v['id'] for v in before['OJJUDA_FAN_VIDEOS'].get(group,[])}
    for video in after['OJJUDA_FAN_VIDEOS'].get(group,[]):
        if video['id'] not in old_ids:
            url='https://www.youtube.com/oembed?'+urllib.parse.urlencode({'url':'https://www.youtube.com/watch?v='+video['id'],'format':'json'})
            items.append({'group':group,'type':'video','expected':video,'url':url})
    a=next(a for a in after['OJJUDA_FAN_ARTISTS'] if a['id']==group);old=next(a for a in before['OJJUDA_FAN_ARTISTS'] if a['id']==group)
    old_photos={p['href'] for p in old.get('photos',[])}
    for photo in a.get('photos',[]):
        if photo['href'] not in old_photos:
            title=urllib.parse.unquote(photo['href'].split('/wiki/')[-1])
            url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960})
            items.append({'group':group,'type':'photo','expected':photo,'url':url})
def get(item):
    result=dict(item)
    try:
        req=urllib.request.Request(item['url'],headers={'User-Agent':'OjjudaFanpageVerification/1.0 (https://ojjuda.kr; source attribution audit)'})
        with urllib.request.urlopen(req,timeout=40) as r:result.update(status=r.status,response=json.load(r))
    except Exception as e:result['error']=str(e)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: checks=list(pool.map(get,items))
(OUT/'media-source-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
for item in checks:
    print(item['group'],item['type'],item.get('expected',{}).get('id',item.get('expected',{}).get('label')),item.get('error') or 'source returned')
# Preserve candidate as artifact only; no commit/push and no new publication.
for file in ['artists-extra.js','profiles-extra.js','videos.js']:
    target=OUT/'candidate'/'features'/'fanpages'/file;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((work/'features'/'fanpages'/file).read_bytes())
print('Other 22 artist/profile/video objects unchanged. Candidate exported for review.')

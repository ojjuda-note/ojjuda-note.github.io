from pathlib import Path
import json,urllib.request,concurrent.futures
out=Path('recovery-evidence');out.mkdir(exist_ok=True)
ids=[1694699906,6792701507,1886385269,6780313409,6806965442,1866860579,1848046045,1830522219,1800872866]
def check(id):
    url=f'https://itunes.apple.com/lookup?id={id}&entity=song&limit=200'
    result={'id':id,'url':url}
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'OjjudaFanpageVerification/1.0 (https://ojjuda.kr)'})
        with urllib.request.urlopen(req,timeout=35) as r:result.update(status=r.status,data=json.load(r))
    except Exception as e:result['error']=str(e)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rows=list(pool.map(check,ids))
(out/'apple-tracklists.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
for r in rows:
    print(r['id'],r.get('error'),[(x.get('trackNumber'),x.get('trackName'),x.get('releaseDate')) for x in r.get('data',{}).get('results',[])])

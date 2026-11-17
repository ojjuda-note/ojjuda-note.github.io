#!/usr/bin/env python3
"""Extract reusable headwords only; source examples/definitions are not distributed."""
import concurrent.futures, hashlib, json, re, sys, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REV='42c0d01889f34536e9cf94fe57f62bd2055b1bde'
BASE=f'https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl/{REV}/stdict/'
cache=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT.parent/'nickname-dictionary-cache'
cache.mkdir(exist_ok=True)
request=urllib.request.Request(f'https://api.github.com/repos/spellcheck-ko/korean-dict-nikl/contents/stdict?ref={REV}',headers={'User-Agent':'Ojjuda-dictionary-import'})
files=[f for f in json.load(urllib.request.urlopen(request,timeout=30)) if f['name'].endswith('.xml')]
reject=re.compile('낮잡|비속|욕설|비하하여|비하하는|모욕|음란|성기[를의가 ]|생식기|항문|성교|매춘|성매매|인종 차별')
unsafe=re.compile('씨발|시발|씨팔|씹|개새끼|병신|좆|자지|보지|페니스|음경|음핵|질경|강간|성폭행|포르노|야동|살인|자살|학살')
def extract(f):
    dest=cache/f['name']
    if not dest.exists():
        with urllib.request.urlopen(BASE+f['name'],timeout=60) as response: dest.write_bytes(response.read())
    raw=dest.read_bytes()
    git_hash=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    if git_hash!=f['sha']: raise ValueError('Source hash mismatch: '+f['name'])
    words=set(); blocked=set()
    for _,item in ET.iterparse(dest,events=['end']):
        if item.tag!='item': continue
        info=item.find('word_info')
        if info is not None and info.findtext('word_unit')=='단어':
            word=(info.findtext('word') or '').replace('-','')
            if re.fullmatch('[가-힣]{1,5}',word):
                cats={n.text for n in info.findall('.//cat')}
                definitions=' '.join(n.text or '' for n in info.findall('.//definition'))
                if cats & {'인명','지명'} or reject.search(definitions) or unsafe.search(word): blocked.add(word)
                elif any(n.text=='명사' for n in info.findall('pos_info/pos')): words.add(word)
        item.clear()
    return words,blocked
words=set();blocked=set()
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    for i,(new,denied) in enumerate(pool.map(extract,files),1):
        words.update(new);blocked.update(denied)
        if i%10==0 or i==len(files): print(f'Extracted {i}/{len(files)} dictionary shards',flush=True)
words=sorted(words-blocked)
output=ROOT/'data/signup-nicknames/words.txt'
output.write_text('\n'.join(words)+'\n',encoding='utf-8')
metadata={'source':'국립국어원 표준국어대사전','dictionary_url':'https://stdict.korean.go.kr/','mirror':'https://github.com/spellcheck-ko/korean-dict-nikl','revision':REV,'snapshot_date':'2026-06-05','license':'CC-BY-SA-2.0-KR','license_url':'https://creativecommons.org/licenses/by-sa/2.0/kr/','filter':'한글 1~5음절 명사, 단어 항목만; 붙임표 제거, 중복·인명·지명·비하/욕설/성적 표현 제외. 정의와 예문은 배포하지 않음. 서버 금칙어 검사를 추가 적용.','word_count':len(words),'ordered_distinct_pairs':len(words)*(len(words)-1),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(ROOT/'data/signup-nicknames/source.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(metadata,ensure_ascii=False),flush=True)

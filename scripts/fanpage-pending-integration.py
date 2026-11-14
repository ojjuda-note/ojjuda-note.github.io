"""One-off, fail-closed integration of the 22 user-approved pending fanpage PRs.
No production UI, game logic, versions or schedules are changed by this script.
"""
import hashlib, json, os, pathlib, re, subprocess, tempfile
ROOT = pathlib.Path.cwd()
BASE = '5b51d873c7e0e701c984019955fc7422ad7386fe'
HEADS = {
913:'0efbb920abc5c2a0a8b04b17c67baef781169aae',915:'106af424bb8069e6cf7d8271245331531e2834e6',919:'035802ae8c32db2c51565b65f603af5480e13d33',929:'baa8d0df0725bca23a93a61322fa9bb83024901c',939:'cd655fec712c2dab7a5f852a9925ec12d746a8eb',940:'c0c978e129ff1215c68ed745b67a0e23c45ee9fc',947:'9d308de079562368a434ab75448831f885f68d22',948:'ca77d33b4d1498f77b80c826defb256587e0b044',951:'ffbe767f469cea07a07d07d9471c15feb2712fc4',999:'fca648bfd6d406e8f33a970c66bfd588a6cf3ca1',1017:'93ec0758127e4d1fa055ef4434377fb69917aac9',1019:'d21e1a95a977d6e57bd70187db298e462830b379',1033:'f1e8a7aa66768a1ecd9ac022558e08be0ed918bd',1034:'dd2633ab515c1678b827332b03e26aac5716e6bc',1035:'4e45bf0d0fb99dfcb7b81e5b68f51f74ec6a914e',1037:'c018b7db0302ea4894316171c8cb73ef44021cbf',1040:'fda45a389396591b29cb8354009b82100a75f9a1',1043:'2095c84206f5bef456b1dab8f60b623e6a8f8170',1045:'fa5b759c90ef221f7b216f46558d9bfc4f4187a5',1046:'86fb2052e0180fbfc4d371c64b535bbb8b84e3a2',1051:'95a86a5f386055f7d1021981914d81633918d7c8',1053:'da8c367662ad1f262c450d915094e468b1829fe6'}
DATA = {'artists.js','artists-extra.js','profiles.js','profiles-extra.js','videos.js'}
OLD = {913,915,919,929,939,940,947,948,951}
report = {'baseline': BASE, 'prs': [], 'notes': []}
def git(*args):
    return subprocess.check_output(['git',*args], text=True)
def source(sha, path):
    return git('show',sha+':'+path)
for name in DATA:
    path='features/fanpages/'+name
    assert (ROOT/path).read_text() == source(BASE,path), 'Unreviewed newer fanpage change: '+path
with tempfile.TemporaryDirectory() as tmp:
    for number, expected in HEADS.items():
        ref='refs/remotes/fanpage-pending/'+str(number)
        subprocess.run(['git','fetch','origin','refs/pull/'+str(number)+'/head:'+ref],check=True)
        head=git('rev-parse',ref).strip()
        assert head==expected, 'PR head changed: '+str(number)
        base=git('merge-base',BASE,head).strip()
        record={'number':number,'head':head,'base':base,'files':{}}
        for path in git('diff','--name-only',base,head).splitlines():
            if pathlib.Path(path).name not in DATA or not path.startswith('features/fanpages/'):
                continue
            b=pathlib.Path(tmp)/'base';h=pathlib.Path(tmp)/'head'
            b.write_text(source(base,path));h.write_text(source(head,path))
            p=subprocess.run(['git','merge-file','--diff3','-p',str(ROOT/path),str(b),str(h)],capture_output=True,text=True)
            if p.returncode==0:
                (ROOT/path).write_text(p.stdout);record['files'][path]='applied-or-already-present'
            elif number in OLD:
                # Individually reviewed against runtime base/head/current data.
                # Preserve more complete tracks, original announcement dates,
                # current shipping/event terms, verified birthdays and source fixes.
                record['files'][path]='superseded-by-reviewed-newer-main'
            elif number in {1043,1051} and path.endswith('/profiles-extra.js'):
                pattern=r'^<<<<<<<[^\n]*\n(.*?)^\|\|\|\|\|\|\|[^\n]*\n(.*?)^=======\n(.*?)^>>>>>>>[^\n]*\n'
                def append_only(match):
                    assert not match[2].strip(), 'Non-additive profile conflict'
                    return match[1]+match[3]
                text=re.sub(pattern,append_only,p.stdout,flags=re.M|re.S)
                assert not re.search(r'^(<<<<<<<|=======|>>>>>>>)',text,re.M)
                (ROOT/path).write_text(text);record['files'][path]='both-independent-profile-additions-preserved'
            else:
                raise RuntimeError('Unreviewed merge conflict: '+str(number)+' '+path)
        report['prs'].append(record)
# Recover verified facts still absent from the earlier manually reconciled main.
f=ROOT/'features/fanpages/artists-extra.js';text=f.read_text()
def row(number, path, needle):
    lines=[line.strip().rstrip(',') for line in source(HEADS[number],path).splitlines() if needle in line]
    assert len(lines)==1,(number,needle,len(lines))
    return lines[0]
def add(group,field,value):
    global text
    begin=text.index("id: '"+group+"'")
    end=text.find('\n    },',begin)
    assert end>begin
    fragment=text[begin:end]
    marker='      '+field+': ['
    assert marker in fragment,(group,field)
    if value in fragment:return
    fragment=fragment.replace(marker,marker+'\n        '+value+',',1)
    text=text[:begin]+fragment+text[end:]
add('kiiikiii','campaigns',row(919,'features/fanpages/artists-extra.js',"title: 'New Era × KiiiKiii'"))
add('boynextdoor','campaigns',row(951,'features/fanpages/artists-extra.js',"title: 'LG유플러스 · 브랜드 앰배서더'"))
add('boynextdoor','news',row(951,'features/fanpages/artists-extra.js',"title: 'LG유플러스 브랜드 앰배서더 · HOME 협업 캠페인 발표'"))
text=text.replace('https://view.asiae.co.kr/en/article/2026051907592184505','https://m.lguplus.com/about/ko/corporation/promotion/press-kit/detail?atclNo=2000001561&pageNo=1&srchCond=titCon')
f.write_text(text)
f=ROOT/'features/fanpages/profiles-extra.js';text=f.read_text()
award=row(951,'features/fanpages/profiles-extra.js',"title: '40회 골든디스크어워즈 음원 본상 · 네이버 AI Choice'")
assert 'boynextdoorProfile.awards =' not in text
text=text.replace('  boynextdoorProfile.sources.push(', '  boynextdoorProfile.awards = [\n    '+award+'\n  ];\n  boynextdoorProfile.sources.push(',1);f.write_text(text)
# Keep current complete video registry; add the newly covered thirtieth group.
f=ROOT/'features/fanpages/check-videos.mjs';text=f.read_text();assert "'boynextdoor'];" in text
f.write_text(text.replace("'boynextdoor'];","'boynextdoor', 'straykids'];").replace('Exactly twenty-nine supported idol groups','Exactly thirty supported idol groups'))
for name in ['artist.html','index.html']:
    f=ROOT/'features/fanpages'/name;text=f.read_text()
    for asset in sorted(DATA):text=re.sub(r'('+re.escape(asset)+r'\?v=)[^"\s]+',r'\g<1>20261114-all-pending',text)
    f.write_text(text)
# Exact-menu assertions must include the existing approved admin feature.
# Do not remove assertions, skip tests, or alter production admin/game behavior.
f=ROOT/'tests/admin-navigation-ui.test.cjs';text=f.read_text()
old="['카드','쪽지 관리','그룹 관리','포토땅따먹기','위치 지도','자료 모아보기']"
assert old in text
f.write_text(text.replace(old,"['카드','쪽지 관리','그룹 관리','포토땅따먹기','술게임 질문·단어 관리','위치 지도','자료 모아보기']"))
f=ROOT/'tests/admin-menu-groups.test.cjs';text=f.read_text();f.write_text(text.replace("content:['cards','messages','groups','photo-stages','risk','map']","content:['cards','messages','groups','photo-stages','drinking-prompts','risk','map']"))
report['notes']=['Preserved newer official announcement dates and sources instead of obsolete duplicate news.','Preserved all verified birthdays and expanded album tracklists.','Did not resurrect expired Vancouver performance or closed preorder benefits.','RIIZE DICON notice 14906 and STAYC sponsorship date require direct source verification before any restoration.','No production game/admin implementation, versions or automation schedules changed.']
report['files']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in git('diff','--name-only').splitlines() if (ROOT/p).is_file()}
pathlib.Path('/tmp/fanpage-integration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'integrated_prs':len(HEADS),'changed_files':list(report['files'])},ensure_ascii=False))

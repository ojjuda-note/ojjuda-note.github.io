"""One-off recovery helper. Operates on an isolated worktree, never main."""
from pathlib import Path
import json,re,subprocess,sys
ROOT=Path(sys.argv[1]); EVIDENCE=Path(sys.argv[2])
groups=['hearts2hearts','kissoflife','kiiikiii','stayc','seventeen','enhypen','riize','boynextdoor']
p=ROOT/'features/fanpages/artists-extra.js';s=p.read_text()
def edit(group, transform):
 global s
 start=s.index("      id: '"+group+"'");end=s.index('\n    }',start)
 old=s[start:end];new=transform(old);assert old!=new,group;s=s[:start]+new+s[end:]
def replace(x,a,b):
 assert a in x,a
 return x.replace(a,b)
def drop(x,marker):
 rows=x.splitlines(True);assert any(marker in r for r in rows),marker
 return ''.join(r for r in rows if marker not in r)
cj='https://cjnews.cj.net/2026-mama-awards-a-to-z%EF%BD%9C%EC%B6%9C%EC%97%B0%EC%A7%84%EB%B6%80%ED%84%B0-%ED%8A%B9%EB%B3%84-%EB%AC%B4%EB%8C%80%EA%B9%8C%EC%A7%80-%ED%95%9C%EB%88%88%EC%97%90-%EB%AA%A8%EC%95%84%EB%B3%B4%EA%B8%B0/'
def heart(x):
 x=replace(x,'https://www.tenasia.co.kr/article/2026101655614',cj)
 x=replace(x,"date: '2026.10.16', tag: '공연', title: '11.20 MAMA AWARDS 오사카 첫날 무대 출연 확정'","date: '2026.11.10', tag: '공연', title: 'CJ ENM 공식 안내 · 11.20 MAMA AWARDS Chapter 1 출연'")
 return replace(x,'SMTOWN 일본 공식 스토어 · 11.05 20:00 판매 시작 · 재고는 판매처 확인','SMTOWN 일본 공식 스토어 · 11.05 20:00(JST) 판매 시작 · 11.11 이후 주문은 공연 전 배송 미보장 · 재고 확인')
edit('hearts2hearts',heart)
def kiss(x):
 x=replace(x,"href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' },\n        { title: 'SWEAT',","href: 'https://prtimes.jp/main/html/rd/p/000005074.000019470.html' },\n        { title: 'SWEAT',")
 x=replace(x,"date: '2026.09.16', tag: '음반', title: '일본 미니 2집 SWEAT -JAPANESE EP- 6곡 발매', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html'","date: '2026.08.27', tag: '음반', title: '일본 미니 2집 SWEAT -JAPANESE EP- 발매 발표 · 9.16 발매', href: 'https://prtimes.jp/main/html/rd/p/000005074.000019470.html'")
 return x.replace('싱글 3집','싱글').replace('싱글 2집','싱글')
edit('kissoflife',kiss)
def kii(x):
 x=drop(x,'https://www.bntnews.co.kr/article/view/bnt202602130181')
 return replace(x,'데뷔 미니 1집 · 타이틀 I DO ME','데뷔 미니 1집 · I DO ME / BTG 수록')
edit('kiiikiii',kii)
tracks=['MWUAH','I WANT IT (Japanese Ver.)','BEBE (Japanese Ver.)','POPPY','Teddy Bear (Japanese Ver.)','ASAP (Japanese Ver.)','LIT','STEREOTYPE (Japanese Ver.)','Tell Me Now','Satellite','Lover, Killer','Say My Name','MEOW','GPT (Japanese Ver.)','Bubble (Japanese Ver.)','Cheeky Icy Thang (Japanese Ver.)','Stay WITH me (Japanese Ver.)']
def stay(x):
 x=drop(x,'태국관광청(TAT) × Kimpton Maa-Lai Bangkok')
 x=replace(x,"type: '일본 정규 1집 · 대표 수록곡', songs: ['MWUAH', 'Satellite', 'I WANT IT -Japanese Ver.-', 'Stay WITH me -Japanese Ver.-'], href: 'https://www.universal-music.co.jp/stayc/news/2025-11-11/'","type: '일본 정규 1집 · CD 17곡', songs: "+json.dumps(tracks,ensure_ascii=False)+", href: 'https://store-annex.universal-music.co.jp/product/upch29482/'")
 x=replace(x,'https://open.spotify.com/album/252AHBq3W65lTnnELHIi4y','https://www.highup-ent.com/stayc/i-want-it/')
 x=replace(x,"date: '2026.02.11', tag: '앨범', title: '일본 정규 1집 STAY ALIVE 발매'","date: '2025.11.11', tag: '앨범', title: '일본 정규 1집 STAY ALIVE 상세 발표 · 2026.02.11 발매'")
 return replace(x,'UNIVERSAL MUSIC STORE · 통상반 · 재고·특전은 판매처 확인','UNIVERSAL MUSIC STORE · 통상반 · 스토어 한정 구매 특전 종료 · 재고는 판매처 확인')
edit('stayc',stay)
def svt(x):
 x=drop(x,'일본레코드협회 10월 골드디스크 골드 인증')
 x=replace(x,"{ date: '2026-11-27', title: 'HYBE CINE FEST 2026","{ date: '2026-11-27', endDate: '2026-12-10', title: 'HYBE CINE FEST 2026")
 x=replace(x,'현장 한정 MD · 재고·입장 방식은 공식 안내 확인','공식 MD · 품목별 판매 시작일 상이 · 입장 예약 대상 시간은 공식 안내 확인')
 x=replace(x,"'2025', 'SEVENTEEN', 'CC BY 3.0'","'2025', 'Seventeen', 'CC BY 3.0'")
 return replace(x,"'2024', 'PLEDIS Entertainment', 'CC BY 3.0'","'2024', 'Pledis Entertainment', 'CC BY 3.0'")
edit('seventeen',svt)
def en(x):
 ends={'2026-11-20':'2026-12-02','2026-12-18':'2026-12-27','2027-01-29':'2027-02-07','2027-02-11':'2027-02-21'}
 for start,end in ends.items():x=re.sub(r"\{ date: '"+start+r"', title: '(BLOOD SAGA [^']*팝업스토어[^']*)'",r"{ date: '"+start+"', endDate: '"+end+r"', title: '\1'",x)
 x=replace(x,'11:00~19:00 (JST) · 공식 MD·의상 전시','11:00~19:00 (JST) · 입장 예약·판매 상태는 공식 공지 확인')
 return replace(x,'Weverse 공식 응원봉 · 10.19 판매 시작 · 재고·가격은 판매처 확인','Weverse 공식 응원봉 · 10.19 18:00(KST) 판매 시작 · 수량 소진 시 종료 · 재고·가격 확인')
edit('enhypen',en)
def ri(x):
 x=drop(x,'DICON D’FESTA THE ORIGIN')
 x=replace(x,'2026.10.13 시작 · 품절·재고는 판매처 확인','2026.10.13 15:00(KST) 예약 시작 · 12.24부터 출고 예정 · 재고 확인')
 return replace(x,'일본 도쿄 · 추첨 당첨자 50명 · 개최 시간 추후 공지','일본 도쿄 · 당첨자 50명 · 2차 응모 11.15 23:59(JST) 종료 · 상세 시간 개별 안내')
edit('riize',ri)
def bnd(x):
 x=drop(x,'https://view.asiae.co.kr/en/article/2026051907592184505')
 x=replace(x,'캐나다 Queen Elizabeth Theatre · 현지 19:30 · Live Nation 공식 예매','캐나다 Queen Elizabeth Theatre · 현지 19:30 · AEG 주최 · 공연장 공식 예매 안내')
 x=replace(x,'https://www.livenation.com/event/1778v0G6GTaLiRS/boynextdoor-tour-knock-on-vol-2-in-north-america','https://vancouvercivictheatres.com/events/boynextdoor-tour-knock-on-vol2-nov-13-2026/')
 x=replace(x,'주최사 HYBE JAPAN 공식 투어 발표','소속사 그룹 HYBE JAPAN 공식 투어 발표')
 x=replace(x,"date: '2026.09.28', tag: '음반', title: 'HOME: DELUXE 리패키지 · ANIMAL 발매'","date: '2026.09.07', tag: '음반', title: 'HOME: DELUXE 예약 시작 · 9.28 정식 발매'")
 x=replace(x,'Weverse Shop · 정규 1집 리패키지 · 가격·재고는 판매처 확인','Weverse Shop · 9.28 발매 · 9.07~9.27 예약·특전 기간 종료 · 현재 재고는 판매처 확인')
 x=replace(x,'공식 일본 공지 · 멤버십 가입자 대상 · 11.02부터 수량 소진 시 종료','공식 일본 판매 · 멤버십 가입자·일본 배송 한정 · 11.02부터 수량 소진 시 종료')
 return replace(x,'Weverse Shop 공식 예약 안내 · 판매 상태는 판매처 확인','Weverse Global · 10.24~10.31 예약 종료 · 한국 등 일부 국가 판매 제한 · 상품별 출고일 확인')
edit('boynextdoor',bnd)
p.write_text(s)
p=ROOT/'features/fanpages/profiles-extra.js';s=p.read_text()
s=re.sub(r"  boynextdoorProfile\.awards = \[\n    \{ year: '2026', title: '40회 골든디스크어워즈[^\n]*\n  \];\n",'',s)
s+='\n// Pending PR reconciliation: only the eight manually reviewed profiles.\nfor (const id of '+json.dumps(groups)+") window.OJJUDA_FAN_PROFILES[id].checkedAt = '2026.11.13';\n";p.write_text(s)
p=ROOT/'features/fanpages/videos.js';s=p.read_text();checks=json.loads((EVIDENCE/'media-source-checks.json').read_text())
assert len([c for c in checks if c['type']=='video'])==24
for row in checks:
 if row['type']!='video':continue
 assert row.get('status')==200 and not row.get('error')
 id=row['expected']['id'];author=row['response']['author_name']
 pat=r"(\{ id: '"+re.escape(id)+r"', .*?source: )'[^']*'"
 s,n=re.subn(pat,lambda m:m[1]+json.dumps(author+' · 공식 채널',ensure_ascii=False),s);assert n==1,(id,n)
p.write_text(s)
p=ROOT/'features/fanpages/check-videos.mjs';s=p.read_text();s=s.replace("'andteam'];","'andteam', 'kissoflife', 'kiiikiii', 'stayc', 'riize', 'boynextdoor'];");s=s.replace('Exactly twenty-four supported idol groups','Exactly twenty-nine supported idol groups');p.write_text(s)
for html in ['index.html','artist.html']:
 p=ROOT/'features/fanpages'/html;s=p.read_text()
 for name in ['artists-extra.js','profiles-extra.js','videos.js']:
  s,n=re.subn(r'('+re.escape(name)+r'\?v=)[^"\s]+',r'\g<1>20261113-recovery8',s);assert n==(1 if html=='artist.html' or name=='artists-extra.js' else 0),(html,name,n)
 p.write_text(s)
for name in ['artists-extra.js','profiles-extra.js','videos.js']:subprocess.run(['node','--check',str(ROOT/'features/fanpages'/name)],check=True)
subprocess.run(['node',str(ROOT/'features/fanpages/check-profiles.mjs')],check=True)
subprocess.run(['node',str(ROOT/'features/fanpages/check-videos.mjs')],check=True)
print('Eight-group corrections validated. Main and public site not modified.')

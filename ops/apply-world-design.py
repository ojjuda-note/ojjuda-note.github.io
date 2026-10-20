from pathlib import Path
import re

import sys,hashlib
root = Path(sys.argv[1]) if len(sys.argv)>1 else Path.cwd()
p = root / 'world.html'
s = p.read_text()
if hashlib.sha256(p.read_bytes()).hexdigest()=='85136b92443ec6a6bfcb0f04172a77bc8ae5eaff0d21dcc9f6e2e15a8d912a6b':
 print('World source is already verified');sys.exit(0)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='75146dc472326373fc7d6b625cc11d66978194e80d6efb7f2aae74a59a1b109e'
def replace(old, new, count=1):
    global s
    assert s.count(old) >= count, old[:100]
    s = s.replace(old, new, count)
def function(name, next_name, new):
    global s
    start=s.index('function '+name+'(');end=s.index('function '+next_name+'(',start)
    s=s[:start]+new+'\n'+s[end:]

replace('</head>', '<link rel="stylesheet" href="/world-design.css?v=20261022-1">\n</head>')
replace('<body>', '<body class="world-redesign">')
s=s.replace('favicon.svg?v=20260929-logo1','favicon.svg?v=20261022-1')
s=s.replace('apple-touch-icon.png?v=20260929-logo1','apple-touch-icon.png?v=20261022-1')
s=s.replace('og-image.png?v=20260929-logo1','og-image.png?v=20261022-1')
s=s.replace('manifest.webmanifest?v=20261005-copy1','manifest.webmanifest?v=20261022-1')
s=s.replace('world-game-rankings.css?v=20261021-1','world-game-rankings.css?v=20261022-1').replace('world-game-rankings.js?v=20261021-1','world-game-rankings.js?v=20261022-1')
s=s.replace('world-park-notes.js?v=20261007-flow1','world-park-notes.js?v=20261022-1')
s=s.replace('content="#FF765F"','content="#245A48"')
s=s.replace('나만의 방을 꾸미고 친구와 일상을 나누는 오쭈다 월드.','게임을 즐기고, 공원에서 오늘의 이야기를 나누는 오쭈다 월드.')
s=s.replace('나만의 방, 익명카드와 친구의 하루가 모이는 오쭈다 월드.','오락실과 공원에서 만나는 작고 즐거운 일상, 오쭈다 월드.')
s=s.replace('family=Gowun+Dodum&family=Jua&family=Noto+Sans+KR:wght@400;500;700','family=Noto+Sans+KR:wght@400;500;600;700;800')
# Keep the shared icon renderer; replace its artwork with the new symbol family.
replace('${gu[t]}</svg>', '<use href="/assets/design/interface.svg#${t}"/></svg>')
replace('class="logo-word">오쭈다<em>월드</em>', 'class="logo-word">오쭈다<span class="logo-world">월드</span>', 2)
function('Dg','Sg', '''function Dg(){return`<aside class="side">${Oo(!0)}
  <nav class="sidenav" aria-label="메뉴">${ys.map(e=>{let o=worldMainTab()===e.id;return`<button class="navbtn${o?" on":""}" data-act="tab" data-tab="${e.id}"${o?' aria-current="page"':""}>${ie(e.ic)}<span>${e.label}</span>${Uf(e.id)}</button>`}).join("")}</nav>
  <span class="world-header-spacer" aria-hidden="true"></span></aside>`}''')
# Add an explicit profile shortcut alongside the existing notification and wallet controls.
replace('<div class="nn-top-actions">', '<div class="nn-top-actions">')
replace('${$.coins.toLocaleString?.()||$.coins}</button>', '${$.coins.toLocaleString?.()||$.coins}</button>') if '${$.coins.toLocaleString?.()||$.coins}</button>' in s else None
needle='</div></header><main class="main">${o}</main>'
replace(needle, '<button class="world-account" data-act="tab" data-tab="my" aria-label="내 프로필과 설정">${worldProfileAvatar($.me.avatar_url)}</button></div></header><main class="main">${o}</main>')
function('Cf','Mf', '''function Cf(){
 if(g.place?.id==="park"&&worldParkNotes)return worldParkNotes.markup();
 const place=g.place;
 return `<section class="arcade-home" aria-label="오락실">
 <header class="world-page-heading"><div><p class="world-eyebrow">PLAY A LITTLE, SMILE A LOT</p><h1>오늘의 작은 즐거움<span>.</span></h1><p>가볍게 한 판, 함께하면 더 즐거운 시간.</p></div><div class="visit-banner"><span class="world-live-dot" aria-hidden="true"></span><span id="pcount">지금 ${place.count||1}명</span><span id="pch">${place.ch?place.ch+"호점":""}</span><button class="btn sm" data-act="pl-channel">채널 변경</button></div></header>
 <div class="arcade-overview"><section data-arcade-rank-root aria-label="게임순위"></section><aside class="arcade-welcome"><img src="/assets/design/welcome.svg" alt="" width="600" height="360"><div><span class="world-eyebrow">YOUR LITTLE WORLD</span><p>잠깐 쉬어가도<br>좋은 곳.</p><button data-act="tab" data-tab="park">공원 산책하기 <span aria-hidden="true">↗</span></button></div></aside></div>
 <div class="panel" id="ppanel">${Df()}</div></section>`;
}''')
start=s.index('function Df('); end=s.index('function eo(', start)
old=s[start:end]
old=old.replace('<div class="arcade-card"><div class="panel-title" style="margin-top:0">솔로 게임</div>','<div class="arcade-card"><header class="game-section-heading"><div><span class="world-eyebrow">SOLO PLAY</span><h2>나만의 플레이</h2></div><span>혼자서도 즐겁게</span></header>')
old=old.replace('<span class="ge" aria-hidden="true">${r.emoji}</span><span>${r.name}', '<span class="ge" aria-hidden="true"><img src="/assets/design/games/${o}.svg" alt="" width="120" height="84" loading="lazy"></span><span class="game-name">${r.name}')
old=old.replace('게임 버튼을 눌러 시작해요. 오늘 최고 점수가 공개 순위에 표시돼요. 게임 ZU 보상은 점검 중이에요.','마음에 드는 게임을 골라 바로 시작하세요. 게임 ZU 보상은 점검 중이에요.')
old=old.replace('<div class="panel-title">멀티 게임${g.bdInvites?` <span class="bd-badge">신청 ${g.bdInvites}</span>`:""}</div>', '<header class="game-section-heading"><div><span class="world-eyebrow">BETTER TOGETHER</span><h2>함께하는 플레이${g.bdInvites?` <span class="bd-badge">신청 ${g.bdInvites}</span>`:""}</h2></div><span>친구와 한 판</span></header>')
for key,emoji in [('tank','🪖'),('tour','🌏'),('ttang','🟣'),('janggi','🀄'),('chess','♟️'),('carom4','🎱')]:
 old=old.replace(f'<span class="ge" aria-hidden="true">{emoji}</span>',f'<span class="ge" aria-hidden="true"><img src="/assets/design/games/{key}.svg" alt="" width="120" height="84" loading="lazy"></span>')
old=old.replace('탱크게임은 컴퓨터와 혼자 하거나 온라인으로 2~12명이 대결해요. 오쭈다 마블은 방 번호로 모여 각자 기기에서 2~8명이 함께해요. 같은 기기나 컴퓨터와도 즐길 수 있어요. 월드땅따먹기는 방 번호로 연결하고, 장기·체스·당구는 같은 폰에서도 할 수 있어요.','온라인 대전부터 같은 기기에서의 한 판까지. 게임을 선택하면 참여 방법을 볼 수 있어요.')
old=old.replace('<div class="panel-title">${e.arcade?"대화 · 대전방":"대화"}</div>', '<aside class="arcade-social"><header class="game-section-heading"><div><span class="world-eyebrow">PLAY TOGETHER</span><h2>대화 · 대전방</h2></div><span class="world-live-dot" aria-hidden="true"></span></header>')
old=old.replace('신고하거나 차단할 수 있어요.</p>`','신고하거나 차단할 수 있어요.</p></aside>`')
s=s[:start]+old+s[end:]
replace('<span class="ge" aria-hidden="true">🎴</span>', '<span class="ge" aria-hidden="true"><img src="/assets/design/games/matgo.svg" alt="" width="120" height="84" loading="lazy"></span>')
# Settings retains its existing native disclosures, account actions and draft state.
replace('<header class="my-hub-heading"><h2 class="h2">설정</h2></header>', '<header class="my-hub-heading world-page-heading"><div><p class="world-eyebrow">MAKE YOURSELF AT HOME</p><h2 class="h2">설정</h2><p>내 정보부터 친구까지, 편하게 관리하세요.</p></div></header><div class="settings-profile"><span class="settings-avatar" data-own-profile-photo>${worldProfileAvatar($.me.avatar_url)}</span><div><strong>${w(e.nick||"오쭈다")}</strong><p>${w(e.bio||"오늘도 반가워요.")}</p></div><span class="settings-profile-label">${D.online?"MY ACCOUNT":"WELCOME"}</span></div><div class="settings-columns"><section class="settings-section">')
replace('<h3 class="my-section-title">이용 설정</h3>', '</section><section class="settings-section"><h3 class="my-section-title">이용 설정</h3>')
replace('<h3 class="my-section-title">활동·도움</h3>', '</section><section class="settings-section settings-wide"><h3 class="my-section-title">활동·도움</h3><div class="settings-utilities">')
start=s.index('function Yg(');end=s.index('}var Hf=',start)
y=s[start:end]
icons={'나':'user','◐':'display','◇':'shield','?':'help','⚙':'gear'}
for old,icon in icons.items():
 y=y.replace(f'<span class="my-menu-icon" aria-hidden="true">{old}</span>',f'<span class="my-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/design/interface.svg#{icon}"/></svg></span>')
y=y.replace('[["pink","#F0679A"],["mint","#1FA488"],["sky","#4B82F0"],["lemon","#E3A008"],["lilac","#8A6BEF"]]','[["pink","#245A48"],["mint","#2C746E"],["sky","#39678C"],["lemon","#956522"],["lilac","#745681"]]')
y=y.replace('aria-label="${l}"','aria-label="${({pink:"포레스트",mint:"세이지",sky:"블루",lemon:"앰버",lilac:"플럼"})[l]}" aria-pressed="${t.accent===l}"')
y=y.replace('쭈 채우기','내 ZU 충전하기').replace('>충전</span>','>ZU 충전</span>')
y=y.replace('\n</section>`','\n</div></section></div></section>`')
s=s[:start]+y+s[end:]
s=s.replace('bio:"나만의 공간에 온 걸 환영해요",mood:"😊",moodText:"설레는 입주 첫날"','bio:"잠깐 쉬어가도 좋은 곳",mood:"😊",moodText:"오늘도 반가워요"')
p.write_text(s)
print('world.html redesigned')

s=p.read_text()
s=s.replace('</head>','<link rel="stylesheet" href="/world-themes.css?v=20261022-1">\n<script src="/world-themes.js?v=20261022-1"></script>\n</head>')
s=s.replace('<p>잠깐 쉬어가도<br>좋은 곳.</p>','<p data-theme-greeting>잠깐 쉬어가도 좋은 곳.</p>')
s=s.replace('<p>가볍게 한 판, 함께하면 더 즐거운 시간.</p>','<p>가볍게 한 판, 함께하면 더 즐거운 시간.</p><span class="world-theme-chip" data-theme-status></span>')
s=s.replace('<section class="settings-section settings-wide">','<section class="settings-section settings-theme-section"><h3 class="my-section-title">나의 화면</h3><details class="my-menu-group" data-my-group="themes"${document.querySelector(\'.my-hub [data-my-group="themes"]\')?.open?" open":""}><summary class="my-menu-summary"><span class="my-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/design/interface.svg#palette"/></svg></span><span class="my-menu-copy"><span class="my-menu-title">계절·기념일 테마</span><span class="my-menu-caption" data-theme-status>날짜에 맞춰 자동으로</span></span></summary><div class="my-menu-body" data-world-theme-settings></div></details></section><section class="settings-section settings-wide">')
# Accent choices remain meaningful in Classic mode; scheduled palettes own their colors.
s=s.replace('<label>테마 색</label>','<label>기본 테마의 강조색</label><p class="note">계절·기념일 테마는 각 테마의 전용 색을 사용해요.</p>')
s=s.replace('0.45.130-beta','0.46.0-beta')
p.write_text(s)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='85136b92443ec6a6bfcb0f04172a77bc8ae5eaff0d21dcc9f6e2e15a8d912a6b'
print('Verified redesigned world.html',p.stat().st_size,'85136b92443ec6a6bfcb0f04172a77bc8ae5eaff0d21dcc9f6e2e15a8d912a6b')

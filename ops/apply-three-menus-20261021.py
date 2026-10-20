from pathlib import Path
import json
import hashlib

root = Path(__import__('sys').argv[1])
for name, digest in {'world.html': 'aec4fcb2817b128bcf01846f75c95a90e2097d568623356ed8738c072404fec9', 'world-board.js': 'f03cd9470470a1af77ff15bdb94f3ee68619cb345fd3b0dcbe8607c5e59d1535', 'world-room.css': 'df54d9109e2e97b3d0c14225c6656f72456289cafbd5b4c4d1c600e7bfcab073', 'index.html': '21885e7ad4ef56f08ab9271943691331a414c9c67cc6345a622622f1f1c3ba25', 'version.json': '6a29f390f89eaae27ed000ce53310bd48c32c77c0772f682229183dfc27da3e7'}.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name + ': source changed'

def edit(name, transform):
    path = root / name
    before = path.read_text()
    after = transform(before)
    assert before != after, name + ': no change'
    path.write_text(after)

def replace(text, old, new):
    assert text.count(old) == 1, 'Expected one match: ' + old[:100]
    return text.replace(old, new, 1)

def world(s):
    s = replace(s, 'Go="0.45.128-beta"', 'Go="0.45.129-beta"')
    s = replace(s, 'ys=[{id:"friends",label:"동네",ic:"door"},{id:"board",label:"게시판",ic:"life"},{id:"arcade",label:"오락실",ic:"arcade"},{id:"park",label:"공원",ic:"park"},{id:"home",label:"우리집",ic:"home"},{id:"my",label:"메뉴",ic:"user"}]', 'ys=[{id:"arcade",label:"오락실",ic:"arcade"},{id:"park",label:"공원",ic:"park"},{id:"my",label:"설정",ic:"gear"}]')
    s = replace(s, 'var g={tab:"friends",', 'var g={tab:"arcade",')
    s = replace(s, 'grid-template-columns:repeat(6,minmax(0,1fr))', 'grid-template-columns:repeat(3,minmax(0,1fr))')
    s = replace(s, 'data-tab="friends" aria-label="오쭈다월드, 동네로 가기"', 'data-tab="arcade" aria-label="오쭈다월드, 오락실로 가기"')
    s = replace(s, '<button class="beta" data-act="feedback-open" title="의견 보내기">베타</button>', '')
    s = replace(s, '${D.isAdmin?`<button class="navbtn${g.tab==="admin"?" on":""}" data-act="tab" data-tab="admin">${ie("user")}<span>관리자 모드</span></button>`:""}</nav>\n  ${Wf()}', '</nav>')
    s = replace(s, '<section class="my-hub world-menu-grid" aria-label="메뉴"><header class="my-hub-heading"><h2 class="h2">메뉴</h2>', '<section class="my-hub world-menu-grid" aria-label="설정"><header class="my-hub-heading"><h2 class="h2">설정</h2>')
    s = replace(s, '<p class="note" style="margin:0 0 12px">주소록·가계부는 이 기기에 저장돼요.</p>', '')
    s = replace(s, '로그인하면 내 방과 기록, 친구 기능을 이용할 수 있어요.', '로그인하면 게임 기록을 저장하고 공원에서 이야기를 나눌 수 있어요.')
    storage = '<div class="set"><h3>저장 공간</h3><p style="margin:0">사진 ${o}장, 영상 ${r}개가 ${D.online&&D.mediaReady?"서버에":"이 기기에"} 저장돼 있어요.</p></div>'
    s = replace(s, storage, '')
    s = replace(s, '${i("guestbook","새 방명록")}${i("friend","친구 신청")}', '${i("friend","친구 신청")}')
    start = s.index('${D.online?`<div class="set"><h3>우리집 방문</h3>')
    end = s.index('\n  ${D.online?`<div class="set"><h3>차단한 사람</h3>', start)
    s = s[:start] + s[end:]
    s = replace(s, 'function H(){setTimeout(', 'function H(){if(!["my","admin"].includes(g.tab)&&!(g.tab==="place"&&["arcade","park"].includes(g.place?.id))){xf("arcade",undefined,true);return;}setTimeout(')
    s = replace(s, 'if(g.tab==="shop")g.tab="friends";', '')
    s = replace(s, 'let i=z("#pstage");i&&_f(i),Sa(z("#app"))', 'let i=z("#pstage");if(i)_f(i);else if(e==="place"&&g.place?.id==="arcade"&&!g.placeT)g.placeT=setInterval(pg,450);Sa(z("#app"))')
    s = replace(s, 'tab(t){worldVisitRequest++;', 'tab(t){if(!["arcade","park","my","admin"].includes(t.tab))t={...t,tab:"arcade"};worldVisitRequest++;')
    s = replace(s, 'function xf(t,e,fromMainMenu=false){let o=Pt[t]', 'function xf(t,e,fromMainMenu=true){if(!["arcade","park"].includes(t))t="arcade";let o=Pt[t]')
    s = replace(s, '"pl-leave"(){g.tab="friends",H(),window.scrollTo(0,0)}', '"pl-leave"(){sr.tab({tab:"arcade"})}')
    start = s.index('function Cf(){')
    end = s.index('function Mf(t)', start)
    s = s[:start] + '''function Cf(){
 if(g.place?.id==="park"&&worldParkNotes)return worldParkNotes.markup();
 const place=g.place;
 return `<section class="arcade-home" aria-label="오락실"><div class="visit-banner"><span><b>🎮 오락실</b> <span id="pch">${place.ch?place.ch+"호점":""}</span> <span class="note" id="pcount">지금 ${place.count||1}명</span></span><button class="btn sm" data-act="pl-channel">다른 채널</button></div><section data-arcade-rank-root aria-label="게임순위"></section><div class="panel" id="ppanel">${Df()}</div></section>`;
}
''' + s[end:]
    s = replace(s, 'isMain:()=>g.tab==="friends"&&!g.visiting,', 'isMain:()=>worldMainTab()==="arcade",')
    s = replace(s, 'currentPlace:()=>g.tab==="place"&&!g.place?.fromMainMenu?g.place?.id:null,places:["cafe","arcade","library"],changePlace:id=>xf(id),', 'currentPlace:()=>null,places:[],changePlace:id=>sr.tab({tab:id}),')
    s = replace(s, 'if(g.tab===\'board\')return window.OjjudaBoard?.refresh()??false;', 'if(g.tab===\'place\'&&g.place?.id===\'arcade\')return window.OjjudaBoard?.refresh()??false;')
    s = replace(s, "function mountWorldBoard(){const owner=D.online?D.user?.id:null;window.OjjudaBoard?.mount(document.querySelector('[data-board-root]'),{client:S,owner,games:worldRankGames(),onOpenGame:openWorldBoardGame,authorized:()=>g.tab==='board'&&(D.online?D.user?.id:null)===owner});}", "function mountWorldBoard(){const owner=D.online?D.user?.id:null;window.OjjudaBoard?.mount(document.querySelector('[data-arcade-rank-root]'),{client:S,owner,games:worldRankGames(),onOpenGame:openWorldBoardGame,rankingsOnly:true,authorized:()=>g.tab==='place'&&g.place?.id==='arcade'&&(D.online?D.user?.id:null)===owner});}")
    s = replace(s, 'previousPlace:()=>xf("library"),', 'previousPlace:()=>sr.tab({tab:"arcade"}),')
    s = replace(s, 'enter:()=>xf("park"),toWorld:()=>sr.tab({tab:"friends"}),toMenu:()=>sr.tab({tab:"my"}),toBoard:()=>sr.tab({tab:"board"})', 'enter:()=>sr.tab({tab:"park"}),toWorld:()=>sr.tab({tab:"arcade"}),toMenu:()=>sr.tab({tab:"my"}),toBoard:()=>sr.tab({tab:"arcade"})')
    s = replace(s, "isVillage:()=>g.tab==='friends',", "isVillage:()=>g.tab==='place'&&g.place?.id==='arcade',")
    s = replace(s, 'function my(){py(),H(),void resolveWorldProfilePhoto()', 'var worldEntryRouted=false;function my(){py();if(!worldEntryRouted){worldEntryRouted=true;const url=new URL(location.href),tab=url.searchParams.get("tab"),place=url.searchParams.get("place");sr.tab({tab:place==="park"||tab==="park"?"park":tab==="my"||tab==="settings"?"my":"arcade"});}else if(g.tab==="place"&&D.online&&!g.place?.live)xf(g.place.id,undefined,true);else H();void resolveWorldProfilePhoto()')
    s = replace(s, "const entryTab=new URL(location.href).searchParams.get('tab');\nif(['friends','home','board','my'].includes(entryTab)){g.tab=entryTab;H();}\n", '')
    s = replace(s, 'gm(()=>{g.tab="friends",g.visiting=null,g.visitData=null,H(),window.scrollTo(0,0)})', 'gm(()=>sr.tab({tab:"arcade"}))')
    s = replace(s, '/world-board.js?v=20261009-speed1', '/world-board.js?v=20261021-arcade-ranks1')
    s = replace(s, '/world-room.css?v=20261004-design1', '/world-room.css?v=20261021-three-menus1')
    s = replace(s, 'life:\'<rect x="4"', 'gear:\'<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8"/>\',life:\'<rect x="4"')
    return s

def board(s):
    s = replace(s, 'onOpenGame=null,authorized=()=>true', 'onOpenGame=null,rankingsOnly=false,authorized=()=>true')
    s = replace(s, "const content=el('div');host.replaceChildren(el('h2','게시판','h2'),status,content);", "const content=el('div');host.replaceChildren(...(rankingsOnly?[]:[el('h2','게시판','h2')]),status,content);")
    s = replace(s, 'const tasks=leaders(token);', 'const tasks=leaders(token);\n   if(rankingsOnly){await Promise.all(tasks);return active()&&token===request;}')
    s = replace(s, "status.textContent='로그인하면 게시판의 공개 글을 볼 수 있어요.';", "status.textContent=rankingsOnly?'로그인하면 게임 순위를 볼 수 있어요.':'로그인하면 게시판의 공개 글을 볼 수 있어요.';")
    return s

edit('world.html', world)
edit('world-board.js', board)
edit('world-room.css', lambda s: s + '\n/* The arcade opens with rankings above the complete game catalog. */\n.arcade-home{display:grid;gap:16px;min-width:0}.arcade-home>.visit-banner{margin:0;flex-wrap:wrap}.arcade-home [data-arcade-rank-root]{min-width:0}.arcade-home .board-leaders{margin:0}.arcade-home .board-status:empty{display:none}.arcade-home #ppanel{position:static;max-height:none}\n')
edit('index.html', lambda s: replace(s, "url.searchParams.set('tab', 'friends')", "url.searchParams.set('tab', 'arcade')"))
edit('version.json', lambda s: replace(s, '0.45.128-beta', '0.45.129-beta'))
print('Updated navigation, default entry, arcade rankings, and version.')

for name, digest in {'world.html': '8c0a3f727c5931ffe438fdabd037f33e1c7ae25ee6b3d4247a5faa05b167e8f2', 'world-board.js': '98034edd0c2118cf081797bf688abd0aca84c50618fcd6239d1ce81a56808fe4', 'world-room.css': '9f05d71457dfdb0e6a88ea6bdb194d928d13ffbc3fa3da290a48389775d3a2e8', 'index.html': 'bcc18fc88fd072b942ff0e4fd44e95f9bfaf56098359becbf7923d78cca51ffa', 'version.json': 'c5b7d8791344c7ea84e3495d2cce457c7f1b3fe852859a6f9a3c88ec6bad9f34'}.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name + ": output mismatch"

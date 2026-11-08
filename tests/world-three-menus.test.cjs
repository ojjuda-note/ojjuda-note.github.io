const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'world.html'),'utf8');
let source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
source=source.replaceAll('import.meta.env','({})').replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
source=source.slice(0,source.indexOf('j1(()=>H());gm('));
source+='\nwindow.worldTest={state:g,auth:D,actions:sr,render:H,start:my,model:$,rankGames:worldRankGames,adminTabs:adminTabsByArea,adminState:L,adminMarkup:y0,presence(){bg();return jt;},connectPresence(client,channel){S=client;Wo=channel;}};';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(url='https://ojjuda.kr/world.html'){
 const dom=new JSDOM('<div id="app"></div><div id="modal-root"></div><div id="toast"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}disconnect(){}};
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async()=>({ok:true,json:async()=>({}),text:async()=>''});
 w.OjjudaParkNotes={install:()=>({markup:()=>'<section data-park-app>공원 카드</section>',sync(){},route(){},canLeave:()=>true,preserveShell:()=>false})};
 w.eval(fs.readFileSync(path.join(root,'shared/games/world-game-rankings.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8'));
 w.eval(source);
 return dom;
}
(async()=>{
 let dom=fixture();
 try{
  const w=dom.window,t=w.worldTest;t.render();
  const active=()=>t.state.tab==='place'?t.state.place.id:t.state.tab;
  const assertTestGamesLast=()=>{
   const grids=[...w.document.querySelectorAll('[data-arcade-games]')];
   assert.equal(grids.at(-1).dataset.arcadeGames,'test','test games follow every regular game category');
   assert.deepEqual([...grids.at(-1).querySelectorAll('.gbtn')].map(button=>button.dataset.v),['group','festival','restaurants','byeolcheonji']);
   assert.equal(w.document.querySelector('[data-v=star]'),null,'the retired reservation helper has no menu entry');
   assert.equal(w.document.querySelector('[data-arcade-games] [data-v=recommendations]'),null,'member recommendations belong inside the certified directory');
   assert.equal(w.document.querySelectorAll('[data-arcade-games] [data-v=archery]').length,1,'released archery appears exactly once');
   assert.equal(w.document.querySelector('[data-arcade-test-heading] h2').textContent,'일상');
   assert.equal(w.document.querySelector('[data-arcade-games=solo] [data-v=archery] .game-test-badge'),null);
   assert.ok(w.document.querySelector('[data-arcade-games=solo] [data-v=archery]'));
   assert.deepEqual([...grids.at(-1).querySelectorAll('.game-test-badge')].map(badge=>badge.textContent),['회원 전용','회원 전용'],'only the two member-only tools carry badges');
  };
  assert.equal(active(),'arcade','the initial page opens the arcade');
  for(const selector of ['.bottomnav','.sidenav']){
   assert.deepEqual([...w.document.querySelectorAll(selector+' [data-tab]')].map(b=>b.textContent.trim()),['오락실','공원','설정']);
   assert.equal(w.document.querySelector(selector+' [aria-current=page]').dataset.tab,'arcade');
  }
  assert.equal(w.document.querySelector('#pstage'),null,'the old arcade illustration is removed');
  assert.ok(w.document.querySelector('[data-arcade-rank-root]'));
  assert.ok(w.document.querySelector('[data-arcade-games=solo]'));
  assert.ok(w.document.querySelector('[data-arcade-games=multi]'));
  assert.equal(w.document.querySelector('[data-arcade-adult]'),null,'guests have no adult section');
  assertTestGamesLast();
  assert.equal(w.document.querySelector('[data-arcade-games=solo] [data-v=poker]'),null,'poker is not duplicated in the solo list');
  w.OjjudaMatgoAccess={visible:minimum=>(minimum||19)<=19};
  t.auth.online=true;t.auth.user={id:'adult-menu-fixture'};t.render();
  const poker=w.document.querySelector('[data-arcade-games=adult] [data-v=poker]');
  assert.ok(poker,'eligible members see poker in the adult section');
  assert.equal(poker.previousElementSibling.dataset.act,'matgo-open','poker stays immediately after Matgo');
  assert.match(poker.textContent,/최대 4명/,'the menu displays the maximum player count');
  const roulette=w.document.querySelector('[data-arcade-games=adult] [data-v=roulette]');
  assert.ok(roulette,'eligible members see roulette in the adult section');
  assert.equal(roulette.previousElementSibling,poker,'roulette follows poker');
  assert.match(roulette.textContent,/최대 4명/,'roulette displays its four-player capacity');
  const gameId=button=>button.dataset.act==='matgo-open'?'matgo':button.dataset.act==='bl-open'?'billiards':button.dataset.v;
  const categories={
   solo:['chacha_rush','solitaire','archery','sacheonseong','mines','saetbyeol','mole','runner','stacker','breakout','spot','screw'],
   multi:['bang','tank','tour','ttang','janggi','chess','billiards'],
   adult:['matgo','poker','roulette','photo_ttang'],
   test:['group','festival','restaurants','byeolcheonji']
  };
  assert.deepEqual([...w.document.querySelectorAll('[data-arcade-games]')].map(grid=>grid.dataset.arcadeGames),Object.keys(categories),'test games follow solo, multiplayer and adult games');
  assertTestGamesLast();
  for(const [category,expected]of Object.entries(categories)){
   const actual=[...w.document.querySelectorAll(`[data-arcade-games=${category}] .gbtn`)].map(gameId);
   assert.deepEqual(actual,expected,category+' contains exactly its intended games in display order');
  }
  const gameButtons=[...w.document.querySelectorAll('[data-arcade-games] .gbtn')];
  assert.equal(new Set(gameButtons.map(gameId)).size,gameButtons.length,'every game appears in exactly one arcade category');
  assert.equal(w.document.querySelectorAll('[data-arcade-games] [data-v=bang]').length,1,'BANG has a single arcade entry');
  assert.equal(w.document.querySelector('[data-arcade-games=solo] [data-v=bang]'),null,'BANG is not duplicated in solo games');
  assert.match(w.document.querySelector('[data-arcade-games=multi] [data-v=bang]').textContent,/최대 7명/,'BANG is available for up to seven members');
  assert.ok(w.document.querySelector('[data-arcade-games=solo] [data-v=sacheonseong]'),'Sacheonseong is available in solo games');
  for(const button of gameButtons){
   const id=gameId(button);
   assert.equal(button.querySelectorAll('.game-version').length,0,id+' does not expose release metadata in the menu');
   assert.doesNotMatch(button.textContent,/v\d+\.\d+\.\d+/);
   if(id==='chacha_rush'){
    assert.equal(button.tagName,'A','the separately hosted 3D racer remains a link');
    assert.equal(new URL(button.href).protocol,'https:');
    assert.equal(button.target,'_blank');
    assert.match(button.rel,/noopener/);
    continue;
   }
   assert.match(w.OjjudaGameAssets.version(id),/^\d+\.\d+\.\d+$/,id+' retains its internal release version');
  }
  w.OjjudaMatgoAccess={visible:minimum=>(minimum||19)<=18};t.render();
  assert.equal(w.document.querySelector('[data-v=poker]'),null,'18-year-olds cannot see poker');
  assert.equal(w.document.querySelector('[data-v=roulette]'),null,'18-year-olds cannot see roulette');
  assert.equal(w.document.querySelector('[data-act=matgo-open]'),null,'Matgo uses the same age threshold');
  assert.equal(w.document.querySelector('[data-v=photo_ttang]'),null,'photo games use the same age threshold');
  assert.equal(w.document.querySelector('[data-arcade-adult]'),null,'underage members have no adult section');
  assertTestGamesLast();
  delete w.OjjudaMatgoAccess;t.auth.online=false;t.auth.user=null;t.render();
  assertTestGamesLast();
  assert.ok(w.document.querySelector('[data-arcade-rank-root]').compareDocumentPosition(w.document.querySelector('#ppanel'))&w.Node.DOCUMENT_POSITION_FOLLOWING,'rankings precede games');
  assert.equal(t.state.placeT,null,'arcade presence needs no repeating scene-update timer');
  const room=t.state.place,presence=t.presence();room.live=true;room.presenceStatus='auth';
  presence.onConnection(room);
  assert.equal(w.document.querySelector('#pcount').textContent,'접속자 인증 확인 중','connection events update the visible status without polling');
  room.presenceStatus='connected';room.count=3;presence.onPeople(room);
  assert.equal(w.document.querySelector('#pcount').textContent,'지금 3명','presence events update the visible member count without polling');
  presence.onConnection({...room,presenceStatus:'reconnecting'});
  assert.equal(w.document.querySelector('#pcount').textContent,'지금 3명','a stale room cannot overwrite the current connection status');
  room.live=false;
  assert.equal(w.document.querySelector('#plog,#pmsg,[data-act="pl-send"],[data-act="pl-react"],.arcade-welcome [data-tab="park"]'),null,'Arcade contains no public chat or Park shortcut');
  t.actions.tab({tab:'park'});assert.equal(active(),'park');assert.ok(w.document.querySelector('[data-park-app]'));
  t.actions.tab({tab:'my'});assert.equal(active(),'my');assert.equal(w.document.querySelector('.my-hub .h2').textContent,'설정');
  assert.equal(w.document.querySelector('[data-act="door-toggle"]'),null);
  for(const tab of ['friends','board','home','deco','life','shop']){
   t.actions.tab({tab});assert.equal(active(),'arcade',tab+' old navigation redirects to arcade');
   t.state.tab=tab;t.render();assert.equal(active(),'arcade',tab+' restored state redirects to arcade');
  }
  for(const id of ['cafe','library']){t.actions['enter-place']({id});assert.equal(active(),'arcade');}
  t.auth.isAdmin=true;t.auth.online=true;t.actions.tab({tab:'my'});
  assert.equal(w.document.querySelectorAll('.sidenav [data-tab]').length,3,'administration is inside settings');
  assert.ok(w.document.querySelector('.my-hub [data-tab=admin]'));
  assert.deepEqual(Array.from(t.adminTabs.content,x=>x[0]),['cards','messages','groups','photo-stages','risk','map','rewards']);
  assert.equal(t.adminTabs.operations.some(x=>x[0]==='quiz'),false);
  t.adminState.area='trash';t.adminState.tab='trash-cards';
  assert.ok(t.adminMarkup().includes('world-admin-trash'),'deleted cards use the unified trash screen');
  assert.equal(/house-test|world-life\.js|world-board-comments|world-house-visit/.test(html),false);
  assert.equal(typeof t.actions['account-login'],'function');
  assert.equal(w.document.querySelector('.sidenav').textContent.includes('undefined'),false,'all navigation icons exist');
 }finally{dom.window.close();}
 dom=fixture();
 try{
  const t=dom.window.worldTest,removed=[],channel={};t.render();
  t.auth.online=true;t.auth.user={id:'presence-fixture'};t.state.place.live=true;
  t.connectPresence({async removeChannel(current){removed.push(current);return 'ok';}},channel);
  assert.equal(t.state.placeT,null,'the connected arcade has no scene timer');
  t.actions.tab({tab:'my'});await tick();
  assert.equal(t.state.place,null,'entering settings releases the active place without a timer');
  assert.deepEqual(removed,[channel],'entering settings removes the live presence channel exactly once');
  t.render();await tick();assert.deepEqual(removed,[channel],'rerendering settings does not repeat presence cleanup');
 }finally{dom.window.close();}
 for(const [query,expected] of [['?tab=arcade','arcade'],['?game=star','arcade'],['?tab=my','my'],['?tab=settings','my'],['?place=park','park'],['?tab=park','park'],['?tab=board','arcade'],['?tab=home','arcade']]){
  dom=fixture('https://ojjuda.kr/world.html'+query);
  try{const t=dom.window.worldTest;t.start();assert.equal(t.state.tab==='place'?t.state.place.id:t.state.tab,expected,'initial link '+query);}finally{dom.window.close();}
 }
 dom=fixture();
 try{
  const w=dom.window,host=w.document.createElement('section');w.document.body.append(host);
  const calls=[],opened=[];
  let score=9,allowed=true;
  const client={from(){throw Error('removed board feeds must not load');},schema(){throw Error('removed card feeds must not load');},rpc:async(name,args)=>{assert.equal(name,'community_game_monthly_leaders');calls.push(args.p_games);return {data:{tank:{nick:'순위 회원',score}}};}};
  w.OjjudaGameRankings.mount(host,{client,owner:'member',games:{tank:{name:'탱크게임',unit:'승'},mines:{name:'지뢰찾기',unit:'점'}},rankingsOnly:true,authorized:()=>allowed,onOpenGame:id=>opened.push(id)});
  await tick();await tick();
  assert.equal(calls.length,1,'rankings load with one batch request');
  assert.equal(host.querySelectorAll('.board-best,.board-latest,.board-comics').length,0);
  assert.equal(host.querySelector('h2'),null,'no board heading remains');
  assert.equal(host.querySelector('[data-game=tank] .board-leader-score').textContent,'9승');
  const nextRank=host.querySelector('[aria-label="다음 게임 순위"]');
  assert.ok(nextRank,'the shared ranking pager exposes its next-game control');nextRank.click();
  assert.equal(host.querySelector('.board-rank-groups').dataset.rankCategory,'multi');
  host.querySelector('[data-game=tank] button').click();await tick();assert.deepEqual(opened,['tank']);
  score=10;await w.OjjudaGameRankings.refresh();assert.equal(host.querySelector('[data-game=tank] .board-leader-score').textContent,'10승');
  allowed=false;host.querySelector('[data-game=tank] button').click();await tick();assert.equal(opened.length,1,'stale access cannot launch games');
  w.OjjudaGameRankings.mount(host,{client,owner:null,rankingsOnly:true});assert.ok(host.textContent.includes('로그인하면 게임 순위'));
  w.OjjudaGameRankings.mount(null);
 }finally{dom.window.close();}
 console.log('PASS: three menus, legacy redirects, initial links, settings, presence, rankings-only requests, game launch, score refresh and access isolation');
})().catch(error=>{console.error(error);process.exitCode=1});

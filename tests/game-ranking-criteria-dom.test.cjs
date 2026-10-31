const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{const dom=new JSDOM('<body><main></main></body>',{url:'https://fixture.test',runScripts:'outside-only'});try{
 const w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
 w.eval(read('games/mines/rules.js'));w.eval(read('games/sacheonseong/ranking.js'));w.eval(read('world-game-rankings.js'));
 const world=read('world.html'),registry=world.slice(world.indexOf('function worldRankGames(){'),world.indexOf('function openWorldBoardGame'));
 const catalogStart=world.indexOf('var _r='),catalogEnd=world.indexOf(',Z=360',catalogStart);
 assert.ok(catalogStart>0&&catalogEnd>catalogStart);w.eval(world.slice(catalogStart,catalogEnd)+';');
 w.D={online:true,user:{id:'member'}};w.OjjudaMatgoAccess={visible:()=>true};w.eval(registry);
 const games=w.worldRankGames();assert.equal(Object.keys(games).filter(x=>/^(billiards|janggi|chess)$/.test(x)).length,3);
 assert.equal(Object.keys(games).filter(x=>/_(easy|normal|hard|online)$/.test(x)).length,0);
 assert.equal(games.tour.unit,'연승');assert.equal(games.tank.unit,'연승');
 assert.equal(games.matgo.rankingBasis,'best_round_gain');assert.equal(games.poker.rankingBasis,'best_round_gain');
 const rows={sacheonseong:{nick:'사천성친구',score:1999994000,stage:3},mines:{nick:'먼저 달성',score:69940},billiards:{nick:'당구친구',score:3,difficulty:'hard',variant:'pool8'},
  janggi:{nick:'장기친구',score:2,difficulty:'normal'},chess:{nick:'<img onerror=alert(1)>',score:7,difficulty:'online'},
  bang:{nick:'뱅친구',score:5},tour:{nick:'마블친구',score:4},tank:{nick:'탱크친구',score:2,opponents:11},ttang:{nick:'땅친구',score:3},spot:{nick:'그림친구',score:12},matgo:{nick:'맞고친구',score:900},poker:{nick:'포커친구',score:800},roulette:{nick:'룰렛친구',score:1200},photo_ttang:{nick:'사진친구',score:4}};
 const host=w.document.querySelector('main');
 const reads=[];
 w.OjjudaGameRankings.mount(host,{owner:'member',client:{rpc:async(name,args)=>{reads.push({name,args});return {data:name==='community_game_monthly_history'?{month:args.p_month?.slice(0,7)||'2026-10',currentMonth:'2026-10',closed:!!args.p_month,months:[{month:'2026-10'},{month:'2026-09'}],leaders:rows}:rows};}},games,onOpenGame(){}});
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 const categories={solo:['sacheonseong','saetbyeol','mines','screw_box','screw_flat','spot','mole','runner','stacker','breakout'],multi:['bang','tank','tour','billiards','janggi','chess','ttang'],adult:['matgo','poker','roulette','photo_ttang']};
 const historyPages={
  solo:[['sacheonseong','saetbyeol','mines'],['screw_box','screw_flat','spot'],['mole','runner','stacker'],['breakout','sacheonseong','saetbyeol']],
  multi:[['bang','tank','tour'],['billiards','janggi','chess'],['ttang','bang','tank']],
  adult:[['matgo','poker','roulette'],['photo_ttang','matgo','poker']]
 };
 const groupIds=key=>[...host.querySelectorAll(`[data-rank-group=${key}] [data-game]`)].map(item=>item.dataset.game);
 const selectCategory=key=>{
  for(let i=0;host.querySelector('.board-rank-groups').dataset.rankCategory!==key&&i<3;i++)host.querySelector('[aria-label="다음 분류 순위"]').click();
  assert.equal(host.querySelector('.board-rank-groups').dataset.rankCategory,key);
 };
 const checkGroups=()=>{
  const history=!!host.querySelector('.board-rank-history');
  assert.deepEqual([...host.querySelectorAll('[data-rank-group]')].map(group=>group.dataset.rankGroup),Object.keys(categories),'all ranking groups keep the requested order');
  assert.deepEqual([...host.querySelectorAll('.board-rank-group-head h4')].map(heading=>heading.textContent),['혼자하는 플레이','함께하는 플레이','어른들 플레이']);
  assert.equal(host.querySelectorAll('[data-rank-group][aria-hidden=false]').length,1,'only the selected category is exposed');
  for(const group of host.querySelectorAll('[data-rank-group]'))assert.equal(group.inert,group.getAttribute('aria-hidden')==='true');
  for(const [key,ids]of Object.entries(categories)){
   assert.deepEqual((history?groupIds(key):[...new Set(groupIds(key))]).sort(),[...ids].sort(),key+' contains only its own games');
   if(history){
    const group=host.querySelector(`[data-rank-group=${key}]`),visible=[...group.querySelectorAll('[data-game]:not([hidden])')].map(row=>row.dataset.game);
    assert.deepEqual(visible,historyPages[key][Number(group.dataset.rankPage)],key+' displays the selected three archived games');
    assert.equal(new Set(visible).size,3);assert.deepEqual(groupIds(key).slice(0,3),visible,'selected rows keep their visible page order');
   }else for(const page of host.querySelectorAll(`[data-rank-group=${key}] .board-rank-page`)){
    const visible=[...page.querySelectorAll('[data-game]')].map(row=>row.dataset.game);
    assert.equal(visible.length,3,'every home page is full, including the last');assert.equal(new Set(visible).size,3,'each page contains three different games');
   }
  }
  const ids=[...host.querySelectorAll('[data-game]')].map(item=>item.dataset.game);
  assert.equal(new Set(ids).size,Object.keys(games).length,'every allowed game remains reachable');
  if(history)assert.equal(ids.length,Object.keys(games).length,'history has one row per game');
  for(const id of Object.keys(games)){
   const copies=[...host.querySelectorAll(`[data-game=${id}]`)].map(row=>[row.textContent,row.querySelector('th').title,row.querySelector('.board-leader-nick').title,row.querySelector('.board-leader-score').title]);
   assert.ok(copies.every(copy=>JSON.stringify(copy)===JSON.stringify(copies[0])),id+' copies share nickname, record and condition formatting');
  }
 };
 checkGroups();assert.equal(reads.length,1,'all three cards share one initial read');assert.deepEqual(Array.from(reads[0].args.p_games),Object.keys(games));
 const row=id=>host.querySelector(`[data-game="${id}"]`),value=id=>row(id).querySelector('.board-leader-score').textContent;
 assert.equal(value('mines'),'1분 0초');assert.match(row('mines').textContent,/고급/);
 assert.equal(value('billiards'),'3연승');assert.match(row('billiards').textContent,/포켓볼 · 어려움/);
 assert.equal(value('janggi'),'2연승');assert.equal(value('chess'),'7연승');assert.match(row('chess').textContent,/회원대결/);
 assert.equal(value('ttang'),'3연승');assert.equal(value('spot'),'12장');assert.match(row('tank').textContent,/11명 상대/);assert.equal(value('tour'),'4연승');assert.equal(value('tank'),'2연승');
 assert.equal(value('matgo'),'900G');assert.equal(value('poker'),'800G');assert.equal(value('roulette'),'1,200G');assert.equal(value('photo_ttang'),'4장');
 assert.match(row('poker').querySelector('th').title,/한 판 최대 획득 골드/);
 assert.equal(host.querySelectorAll('img').length,0,'nicknames remain text');
 for(const score of [0,'0',-1,'-1',NaN,Infinity,'Infinity']){
  rows.billiards.score=score;await w.OjjudaGameRankings.refresh();
  assert.equal(value('billiards'),'—','only positive finite scores are ranked: '+score);
  assert.equal(row('billiards').querySelector('.board-leader-nick').textContent,'이번 달 기록 없음');
  assert.equal(row('billiards').querySelector('.board-leader-nick').hasAttribute('title'),false);
  assert.equal(row('billiards').querySelector('.board-game-difficulty'),null,'empty records hide old variant and difficulty labels');
  assert.equal([...new Set(groupIds('multi'))].at(-1),'billiards','empty records follow positive records before the page sequence wraps');
  checkGroups();
 }
 rows.billiards.score='3';await w.OjjudaGameRankings.refresh();assert.equal(value('billiards'),'3연승','positive numeric strings remain valid');
 host.querySelector('.board-rank-history-open').click();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 checkGroups();assert.equal(reads.at(-1).name,'community_game_monthly_history');assert.deepEqual(Array.from(reads.at(-1).args.p_games),Object.keys(games));
 const month=host.querySelector('.board-rank-month');month.value='2026-09';month.dispatchEvent(new w.Event('change'));await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(host.querySelector('.board-rank-month').value,'2026-09','the response month, rather than the local clock, controls the archive');
 assert.equal(value('sacheonseong'),'01:00.00');assert.match(row('sacheonseong').textContent,/3단계 · 36개/);
 assert.equal(value('mines'),'1분 0초');assert.match(row('mines').textContent,/고급/);
 assert.equal(value('billiards'),'3연승');assert.match(row('billiards').textContent,/포켓볼 · 어려움/);
 assert.match(row('chess').textContent,/회원대결/);assert.match(row('tank').textContent,/11명 상대/);
 assert.equal(value('matgo'),'900G');assert.equal(value('poker'),'800G');assert.equal(value('spot'),'12장');
 assert.match(row('poker').querySelector('.board-leader-nick').title,/2026년 9월/);
 assert.equal(host.querySelectorAll('img').length,0,'historical nicknames remain text');
 const historyRows=new Map(Object.keys(games).map(id=>[id,{node:row(id),text:row(id).textContent}])),readsBeforePaging=reads.length;
 for(const [key,pages]of Object.entries(historyPages)){
  selectCategory(key);
  const group=host.querySelector(`[data-rank-group=${key}]`),seen=new Set();
  for(let page=0;page<pages.length;page++){
   assert.equal(group.dataset.rankPage,String(page));checkGroups();
   for(const visible of group.querySelectorAll('[data-game]:not([hidden])')){
    const id=visible.dataset.game;seen.add(id);assert.equal(visible,historyRows.get(id).node,'paging reuses each unique history row');
    assert.equal(visible.textContent,historyRows.get(id).text,'paging preserves the visible record and condition');
   }
   group.querySelector('.board-rank-controls button:last-child').click();
  }
  assert.deepEqual([...seen].sort(),[...categories[key]].sort(),'every '+key+' archived game is reachable');
  assert.equal(group.dataset.rankPage,'0','the history pager wraps to its first page');
  group.querySelector('.board-rank-controls button:first-child').click();checkGroups();
  assert.equal(group.dataset.rankPage,String(pages.length-1),'previous from the first page opens the full last page');
  group.querySelector('.board-rank-controls button:last-child').click();
 }
 assert.equal(reads.length,readsBeforePaging,'paging all 21 archived games requires no additional RPC');
 rows.billiards.score='0';await w.OjjudaGameRankings.refresh();
 assert.equal(host.querySelector('.board-rank-month').value,'2026-09','hiding a zero archive record preserves the selected month');
 assert.equal(value('billiards'),'—');assert.equal(row('billiards').querySelector('.board-leader-nick').textContent,'기록 없음');
 assert.equal(row('billiards').querySelector('.board-game-difficulty'),null);
 checkGroups();
 for(const [key,ids]of Object.entries(categories))assert.deepEqual(groupIds(key),ids,'the archive keeps catalog order within '+key);
 console.log('PASS: real catalog in three current/archive cards, one initial RPC, per-group empty records, Mines and Sacheonseong time, variants, opponents, peak gold and safe text rendering');
}finally{dom.window.OjjudaGameRankings?.mount(null);dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1});

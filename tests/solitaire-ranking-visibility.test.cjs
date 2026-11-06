const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const width of [360,1200])test(`Solitaire stays on the first ranking page before and after its first clear at ${width}px`,async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://fixture.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.classList.contains('board-rank-groups')?width:0;}});
  const world=read('world.html'),start=world.indexOf('var _r='),end=world.indexOf(',Z=360',start);
  w.eval(world.slice(start,end)+';');w.D={online:true,user:{id:'test-owner'}};
  w.eval(world.slice(world.indexOf('function worldRankGames(){'),world.indexOf('function openWorldBoardGame')));
  for(const file of ['games/solitaire/rules.js','games/mines/rules.js','games/sacheonseong/ranking.js','shared/games/world-game-rankings.js'])w.eval(read(file));
  const games=w.worldRankGames(),rows=Object.fromEntries(Object.keys(games).map(id=>[id,id==='solitaire'?null:{nick:'검사용 기록',score:1}]));
  const opened=[],host=w.document.querySelector('main'),month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);
  const client={rpc:async name=>({data:name==='community_game_monthly_history'?{month,currentMonth:month,closed:false,months:[{month}],leaders:rows}:rows})};
  w.OjjudaGameRankings.mount(host,{owner:'test-owner',client,games,onOpenGame:id=>opened.push(id)});
  await tick();await tick();
  const card=()=>host.querySelector('[data-game=solitaire]');
  const visibleIds=()=>[...host.querySelectorAll('[data-rank-group=solo] .board-rank-page[aria-hidden=false] [data-game]')].map(row=>row.dataset.game);
  assert.equal(visibleIds()[0],'solitaire','an empty new record must not disappear behind older games with scores');
  assert.match(card().textContent,/이번 달 기록 없음/);assert.equal(card().querySelector('.board-leader-score').textContent,'—');
  assert.equal(host.querySelectorAll('[data-game=solitaire]').length,1,'do not duplicate the row to keep it visible');
  card().querySelector('button').click();await tick();assert.deepEqual(opened,['solitaire']);
  rows.solitaire={nick:'클리어 검사',score:299999880};await w.OjjudaGameRankings.refresh();
  assert.equal(visibleIds()[0],'solitaire');assert.match(card().textContent,/보통/);assert.match(card().textContent,/2분 0초/);
  rows.solitaire=null;await w.OjjudaGameRankings.refresh();assert.equal(visibleIds()[0],'solitaire','a new month with no records keeps the game visible');
  host.querySelector('.board-rank-history-open').click();await tick();await tick();
  assert.equal(card().hidden,false);assert.match(card().textContent,/이번 달 기록 없음/);
  assert.equal(host.querySelectorAll('[data-game=solitaire]').length,1);
 }finally{w.OjjudaGameRankings?.mount(null);w.close();}
});

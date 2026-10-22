const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
const registry=world.match(/function worldRankGames\(\)\{[\s\S]*?(?=\nfunction openWorldBoardGame)/)[0];
const start=world.indexOf('var _r=')+'var _r='.length;
const catalog=world.slice(start,world.indexOf(',Z=3',start));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
 const dom=new JSDOM('<main data-board-root></main>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,host=w.document.querySelector('main'),opened=[],requests=[];
 try{
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLElement.prototype.setPointerCapture=()=>{};
  w.OjjudaMatgoAccess={visible:()=>false};
  w.eval('var _r='+catalog+';'+registry);
  w.eval(fs.readFileSync(path.join(root,'world-game-rankings.js'),'utf8'));
  const query={select(){return this},eq(){return this},lte(){return this},order(){return this},range(){return Promise.resolve({data:[]})}};
  let wins=9,delay=false,release;
  const client={from:()=>query,schema:()=>({rpc:async()=>({data:[]})}),rpc:async(name,args)=>{
   if(name!=='community_game_monthly_leaders')return {data:{allowed:false}};
   requests.push(args.p_games);
   if(delay)await new Promise(resolve=>{release=resolve});
   return {data:Object.fromEntries(args.p_games.map(id=>[id,id==='tank'?{nick:'시험회원',score:wins,source:'tank_wins'}:null]))};
  }};
  w.OjjudaGameRankings.mount(host,{client,owner:'member',games:w.worldRankGames(),onOpenGame:id=>opened.push(id)});
  await tick();await tick();
  const tank=()=>host.querySelector('[data-game=tank]');
  const currentPage=()=>Number(host.querySelector('.board-leaders').dataset.rankPage);
  const visibleTank=()=>tank().closest('.board-rank-page').getAttribute('aria-hidden')==='false';
  function nextPage(){
   const viewport=host.querySelector('.board-rank-viewport');
   viewport.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:20}));
   viewport.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,button:0,clientX:20,clientY:20}));
  }
  assert.equal(host.querySelectorAll('[data-game=tank]').length,1,'the real game catalog includes Tank exactly once');
  assert.equal(tank().querySelector('.board-leader-score').textContent,'9연승');
  assert.ok(visibleTank(),'Tank wins appear on the first ranking page');
  tank().querySelector('button').click();await tick();assert.deepEqual(opened,['tank']);
  nextPage();assert.equal(currentPage(),1);assert.equal(visibleTank(),false);
  const before=requests.length;
  w.document.body.classList.add('gaming');await tick();
  wins=10;delay=true;
  w.dispatchEvent(new w.CustomEvent('ojjuda:game-record-saved',{detail:{owner:'member',game:'tank'}}));
  assert.equal(requests.length,before,'keep the game open while its result is saved');
  w.document.body.classList.remove('gaming');await tick();
  assert.equal(typeof release,'function');delay=false;release();await tick();await tick();
  assert.equal(tank().querySelector('.board-leader-score').textContent,'10연승');
  assert.ok(visibleTank(),'returning from Tank reveals its refreshed ranking, even from a later page');
  assert.equal(requests.length,before+1,'refresh all rankings in one request');
  nextPage();const retained=currentPage();await w.OjjudaGameRankings.refresh();
  assert.equal(currentPage(),retained,'ordinary refresh preserves the selected page');
  w.dispatchEvent(new w.CustomEvent('ojjuda:game-record-saved',{detail:{owner:'another-member',game:'tank'}}));await tick();
  assert.equal(currentPage(),retained,'another member cannot change the selected page');
  wins=0;await w.OjjudaGameRankings.refresh();assert.equal(tank().querySelector('.board-leader-score').textContent,'0연승');
  console.log('PASS: real Tank catalog, wins, game opening, return-page selection, delayed response, ordinary refresh and account isolation');
 }finally{w.OjjudaGameRankings?.mount(null);w.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

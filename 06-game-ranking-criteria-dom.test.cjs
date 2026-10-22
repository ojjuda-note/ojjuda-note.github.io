const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{const dom=new JSDOM('<body><main></main></body>',{url:'https://fixture.test',runScripts:'outside-only'});try{
 const w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
 w.eval(read('games/mines/rules.js'));w.eval(read('world-game-rankings.js'));
 const world=read('world.html'),registry=world.slice(world.indexOf('function worldRankGames(){'),world.indexOf('function openWorldBoardGame'));
 w._r={mines:{name:'지뢰찾기',unit:'초',rankingBasis:'difficulty_time'},ttang:{name:'월드땅따먹기',unit:'연승',rankingBasis:'current_streak'},spot:{name:'틀린그림찾기',unit:'장',rankingBasis:'picture_clears'}};w.OjjudaMatgoAccess={visible:()=>true};w.eval(registry);
 const games=w.worldRankGames();assert.equal(Object.keys(games).filter(x=>/^(billiards|janggi|chess)$/.test(x)).length,3);
 assert.equal(Object.keys(games).filter(x=>/_(easy|normal|hard|online)$/.test(x)).length,0);
 assert.equal(games.tour.unit,'연승');assert.equal(games.tank.unit,'연승');
 assert.equal(games.matgo.rankingBasis,'best_round_gain');assert.equal(games.poker.rankingBasis,'best_round_gain');
 const rows={mines:{nick:'먼저 달성',score:69940},billiards:{nick:'당구친구',score:3,difficulty:'hard',variant:'pool8'},
  janggi:{nick:'장기친구',score:2,difficulty:'normal'},chess:{nick:'<img onerror=alert(1)>',score:7,difficulty:'online'},
  tour:{nick:'마블친구',score:4},tank:{nick:'탱크친구',score:2,opponents:11},ttang:{nick:'땅친구',score:3},spot:{nick:'그림친구',score:12},matgo:{nick:'맞고친구',score:900},poker:{nick:'포커친구',score:800}};
 const host=w.document.querySelector('main');
 w.OjjudaGameRankings.mount(host,{owner:'member',client:{rpc:async()=>({data:rows})},games:Object.fromEntries(Object.keys(rows).map(id=>[id,games[id]])),onOpenGame(){}});
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 const row=id=>host.querySelector(`[data-game="${id}"]`),value=id=>row(id).querySelector('.board-leader-score').textContent;
 assert.equal(value('mines'),'1분 0초');assert.match(row('mines').textContent,/고급/);
 assert.equal(value('billiards'),'3연승');assert.match(row('billiards').textContent,/포켓볼 · 어려움/);
 assert.equal(value('janggi'),'2연승');assert.equal(value('chess'),'7연승');assert.match(row('chess').textContent,/회원대결/);
 assert.equal(value('ttang'),'3연승');assert.equal(value('spot'),'12장');assert.match(row('tank').textContent,/11명 상대/);assert.match(host.textContent,/쭈를 사용한 게임도 기록에 포함/);assert.equal(value('tour'),'4연승');assert.equal(value('tank'),'2연승');
 assert.equal(value('matgo'),'900G');assert.equal(value('poker'),'800G');
 assert.match(row('poker').querySelector('th').title,/한 판 최대 획득 골드/);
 assert.equal(host.querySelectorAll('img').length,0,'nicknames remain text');
 console.log('PASS: simplified game rows, Mines difficulty/time, billiards variant/difficulty, consecutive wins, peak gold labels and safe text rendering');
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1});

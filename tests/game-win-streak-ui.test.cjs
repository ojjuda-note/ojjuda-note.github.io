const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
window.streakTest={auth:D,actions:Qp,save:savePracticeStreak,registry:worldRankGames,
 board:()=>E,billiard:()=>k,
 chessMate(level){E=jp('chess','ai',{level,me:'b'});for(const move of [{f:53,t:45},{f:12,t:28},{f:54,t:38},{f:3,t:39}]){const legal=Xe.chess.find(E.s,move);if(!legal)throw Error('fixture move');E.s=Xe.chess.apply(E.s,legal)}pa();Je();},
 boardResult(kind,mode,level,result){E=jp(kind,mode,{level});E.over={over:true,result,reason:'test'};Je();},
 billiardResult(kind,mode,level,winner){k=tp(kind,mode,{level});k.st.over={winner,reason:'test'};al();},
 renderBoard:Je,renderBilliard:al,
 client(client){S=client},verified:verifiedGameCall};
g.tab='friends';H();`+world.slice(world.indexOf('</script>',boot));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.streakTest);
 await page.evaluate(()=>{window.saved=[];window.events=[];window.fail=false;streakTest.auth.online=true;streakTest.auth.user={id:'member-a'};streakTest.client({rpc:async(name,args)=>{saved.push({name,...args});return window.fail?{error:{message:'offline'}}:{data:{ok:true}}},functions:{invoke:async()=>({data:{ok:true,result:'p1'}})}});addEventListener('ojjuda:game-record-saved',e=>events.push(e.detail.owner));});
 await page.evaluate(()=>streakTest.chessMate('hard'));await page.waitForFunction(()=>saved.length===1&&events.length===1);
 assert.equal(await page.evaluate(()=>streakTest.board().over.result),'b','real chess checkmate reaches the save hook');
 assert.deepEqual(await page.evaluate(()=>({game:saved[0].p_game,difficulty:saved[0].p_difficulty,outcome:saved[0].p_outcome})),{game:'chess',difficulty:'hard',outcome:'win'});
 await page.evaluate(()=>{streakTest.renderBoard();streakTest.renderBoard()});assert.equal(await page.evaluate(()=>saved.length),1,'rerender never double counts a finished match');
 for(const [kind,winner,expected] of [['carom4','p1','win'],['carom3','p2','loss'],['pool8','p1','win']]){
  await page.evaluate(({kind,winner})=>streakTest.billiardResult(kind,'ai','easy',winner),{kind,winner});
  assert.deepEqual(await page.evaluate(()=>({game:saved.at(-1).p_game,difficulty:saved.at(-1).p_difficulty,outcome:saved.at(-1).p_outcome})),{game:kind,difficulty:'easy',outcome:expected});
 }
 await page.evaluate(()=>streakTest.boardResult('janggi','ai','normal','draw'));assert.equal(await page.evaluate(()=>saved.at(-1).p_outcome),'draw');
 const before=await page.evaluate(()=>saved.length);
 await page.evaluate(()=>{streakTest.boardResult('chess','local','normal','w');streakTest.billiardResult('pool8','online','normal','p1');});assert.equal(await page.evaluate(()=>saved.length),before,'shared-device and server-owned online games are not self-reported');
 await page.evaluate(()=>{window.fail=true;streakTest.boardResult('janggi','ai','hard','c')});await page.getByRole('button',{name:'연승 기록 다시 저장',exact:true}).waitFor();
 const failedId=await page.evaluate(()=>saved.at(-1).p_round);await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'연승 기록 다시 저장',exact:true}).click();await page.waitForFunction(()=>streakTest.board().streakRound.saved);
 assert.equal(await page.evaluate(()=>saved.at(-1).p_round),failedId,'retry uses the same round id');
 const count=await page.evaluate(()=>saved.length);
 await page.evaluate(()=>{const old=streakTest.board();old.streakRound.saved=false;streakTest.auth.user={id:'member-b'};streakTest.save(old,'c')});assert.equal(await page.evaluate(()=>saved.length),count,'old account result cannot be saved into a new account');
 await page.evaluate(()=>{streakTest.auth.user={id:'member-a'};return streakTest.verified('game_move',{p_id:'server-game'})});assert.equal(await page.evaluate(()=>events.at(-1)),'member-a','confirmed online completion refreshes the board');
 const entries=await page.evaluate(()=>Object.entries(streakTest.registry()).filter(([,x])=>x.rankingBasis==='current_streak').map(([id,x])=>({id,unit:x.unit,difficulty:x.difficulty})));
 assert.equal(entries.length,20);assert.ok(entries.every(x=>x.unit==='연승'));for(const game of ['carom4','carom3','pool8','chess','janggi'])for(const difficulty of ['easy','normal','hard','online'])assert.ok(entries.some(x=>x.id===game+'_'+difficulty));
 assert.deepEqual(errors,[]);console.log('PASS: real checkmate, all billiard result hooks, draws, difficulty isolation, duplicate saves, retry idempotence, account guard, online refresh and 20 distinct ranking rows');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});

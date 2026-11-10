const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.join(__dirname,'..'),world=fs.readFileSync(path.join(root,'world.html'),'utf8');
const rounds=world.slice(world.indexOf('async function _2(){'),world.indexOf('function z2('));
const stages=world.slice(world.indexOf('function canChooseBreakoutStage('),world.indexOf('function B2('));
const routes=world.slice(world.indexOf('function openWorldGameLink('),world.indexOf('function my(){'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const practiceStart=world.indexOf('async function savePracticeStreak('),practiceSource=world.slice(practiceStart,world.indexOf('\n}\n',practiceStart)+2);
function roundFixture({id='runner',leaders=[[{score:100}],[{score:100}]],receipt={ok:true,best:9999},save,rank,guest=false}={}){
 const cards=[],saved=[],events=[],elements={'#gctrl':{innerHTML:''},'#gres':{textContent:''}};
 let owner=guest?null:'member',day='2026-11-03',completed=false;
 const rankRead=rank||(async()=>{const value=leaders.shift();if(value instanceof Error)throw value;return value;});
 const game={draw(){},update(){}},window={OjjudaGuestAccess:{canPlay:()=>!guest||!completed,finished:()=>{events.push(['finished']);completed=true;}},OjjudaGameResults:{markup:options=>{cards.push(options);return '<div data-result>'+options.metric+'</div>';}},OjjudaGameChallenges:{onStart:id=>events.push(['start',id]),complete:(id,score)=>events.push(['complete',id,score])}};
 const context=vm.createContext({window,console,Promise,performance,URL,setTimeout,clearTimeout,D:{online:!guest,parkGuest:guest,user:guest?null:{id:owner}},Date:class extends Date{static now(){return Date.parse(day+'T12:00:00Z');}},S:{rpc:async(name,args)=>{assert.equal(name,'community_game_monthly_ranking');assert.equal(args.p_game,id);return {data:await rankRead()};}},
  R:{id,owner,game:null,running:false,loading:false,ctx:{},ov:{querySelector:selector=>elements[selector]||null}},
  G2:{[id]:()=>game},_r:{[id]:{unit:id==='stacker'?'층':'점'}},gt:{arcadeEnd(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  worldRewardRequest:()=>({owner}),worldRewardCurrent:request=>request.owner===owner,worldRewardOwner:()=>owner,
  Xp:()=>day,w:value=>String(value),ti(){},Ja(){},ef:rankRead,breakoutControls:()=>'',
  tf:async(key,score)=>{saved.push({key,score});return save?save():receipt;}
 });
 vm.runInContext(stages+'\n'+rounds,context);
 return {context,cards,saved,events,game,owner:value=>{owner=value;context.D.user={id:value};},day:value=>{day=value;}};
}
for(const [name,before,score,after,outcome,gap] of [
 ['strictly higher',[{score:100}],101,[{score:101,me:true}],'record',null],
 ['equal scores',[{score:100}],100,[{score:100}],'score','0점'],
 ['lower scores',[{score:100}],60,[{score:100}],'score','40점'],
 ['concurrent equal leader',[{score:100}],101,[{score:101,me:false}],'score','0점'],
 ['concurrent higher leader',[{score:100}],101,[{score:120}],'score','19점'],
 ['first positive score',[],1,[{score:1,me:true}],'record',null],
 ['first zero score',[],0,[{score:0}],'score','0점'],
 ['own higher previous record',[{score:150,me:true}],100,[{score:150,me:true}],'score','50점']
])test('score result: '+name,async()=>{
 const f=roundFixture({leaders:[before,after]});await f.context._2();await f.context.S2(score);await f.context.S2(score);
 assert.equal(f.cards[0].outcome,'score','the initial unverified result never celebrates a record');
 assert.equal(f.cards.at(-1).outcome,outcome);
 if(gap)assert.ok(f.cards.at(-1).metric.includes('이번 달 1등과 '+gap+' 차이'));
 assert.deepEqual(f.saved,[{key:'runner',score}],'opening or sharing a result must not duplicate a submission');
 assert.deepEqual(f.events,[],'a signed-in round does not consume guest access');
});
test('stacker keeps floors as its comparison unit and challenge completion runs only once',async()=>{
 const f=roundFixture({id:'stacker',leaders:[[{score:12}],[{score:12}]]});await f.context._2();await f.context.S2(8);await f.context.S2(8);
 assert.match(f.cards.at(-1).metric,/8층 · 이번 달 1등과 4층 차이/);
 assert.deepEqual(f.events,[['start','stacker'],['complete','stacker',8]]);
});
test('guest records use the same monthly board and confirm the winning guest token',async()=>{
 const f=roundFixture({id:'mole',guest:true}),queries=[],rows=[[{score:8,me:false}],[{score:9,me:true}]];
 f.context.D.online=false;f.context.D.user=null;f.context.window.OjjudaGuestScores={ranking:async(game,period)=>{queries.push({game,period});return rows.shift();}};
 await f.context._2();await f.context.S2(9);
 assert.equal(f.cards.at(-1).outcome,'record');assert.deepEqual(queries,[{game:'mole',period:'month'},{game:'mole',period:'month'}]);
});
test('ranking month follows the same 01:00 Korea reset as the main leaderboard',()=>{
 const f=roundFixture();assert.equal(f.context.arcadeRankingMonth(Date.parse('2026-11-30T15:59:59Z')),'2026-11');assert.equal(f.context.arcadeRankingMonth(Date.parse('2026-11-30T16:00:00Z')),'2026-12');
});
test('a successfully read empty board is not reported as a network failure after a zero-score run',async()=>{
 const f=roundFixture({leaders:[[],[]]});await f.context._2();await f.context.S2(0);assert.equal(f.cards.at(-1).outcome,'score');assert.doesNotMatch(f.cards.at(-1).extra,/못했|실패/);assert.match(f.cards.at(-1).encouragement,/첫 기록/);
});
for(const id of ['mole','runner','stacker','breakout'])test(id+': a zero-score guest finish still gates replay when score saving fails',async()=>{
 const f=roundFixture({id,guest:true,receipt:{ok:false,reason:'network'}});
 await f.context._2();assert.equal(f.context.R.running,true);await f.context.S2(0);await f.context.S2(0);
 assert.equal(f.events.filter(event=>event[0]==='finished').length,1);
 assert.deepEqual(f.saved,[{key:id,score:0}]);assert.equal(f.context.R.running,false);
 await f.context._2();assert.equal(f.context.R.running,false,'a replay cannot start during the login delay');
});
for(const [name,leaders,receipt]of [
 ['before lookup failed',[new Error('offline'),[{score:12}]],{ok:true}],
 ['after lookup failed',[[{score:10}],new Error('offline')],{ok:true}],
 ['malformed leaderboard',[[{score:null}],[{score:12}]],{ok:true}],
 ['score not visible after saving',[[{score:10}],[{score:10}]],{ok:true}],
 ['save rejected',[[{score:10}]],{ok:false,reason:'network'}]
])test('unknown record stays unconfirmed: '+name,async()=>{
 const f=roundFixture({leaders,receipt});await f.context._2();await f.context.S2(12);
 assert.equal(f.cards.at(-1).outcome,'score');assert.doesNotMatch(f.cards.at(-1).metric,/1등/);
 assert.match(f.cards.at(-1).extra,/확인하지 못|저장하지 못/);
});
test('a ranking month boundary invalidates an otherwise higher score comparison',async()=>{
 const f=roundFixture({leaders:[[{score:10}],[{score:12}]],save:()=>{f.day('2026-12-01');return {ok:true};}});
 await f.context._2();await f.context.S2(12);assert.equal(f.cards.at(-1).outcome,'score');assert.match(f.cards.at(-1).extra,/순위를 확인하지 못/);
});
test('a changed account cannot submit or repaint a result after the ranking read',async()=>{
 const pending=deferred(),f=roundFixture({rank:()=>pending.promise});await f.context._2();const ending=f.context.S2(12);
 f.owner('another-member');pending.resolve([{score:10}]);await ending;
 assert.equal(f.saved.length,0);assert.equal(f.cards.length,1);
});
test('a stalled leaderboard never blocks the legitimate score submission or fabricates a record',async()=>{
 const f=roundFixture({rank:()=>new Promise(()=>{})});
 f.context.setTimeout=callback=>{queueMicrotask(callback);return 1;};f.context.clearTimeout=()=>{};
 await f.context._2();await f.context.S2(12);
 assert.deepEqual(f.saved,[{key:'runner',score:12}]);assert.equal(f.cards.at(-1).outcome,'score');assert.match(f.cards.at(-1).extra,/순위를 확인하지 못/);
});
test('a departed game keeps its legitimate save but never replaces a newer game result',async()=>{
 const pending=deferred(),f=roundFixture({save:()=>pending.promise});await f.context._2();const ending=f.context.S2(12);
 await new Promise(resolve=>setImmediate(resolve));f.context.R={id:'mole',game:{},running:true};pending.resolve({ok:true});await ending;
 assert.deepEqual(f.saved,[{key:'runner',score:12}]);assert.equal(f.cards.length,1);
});
test('breakout progress buttons stay together and the next stage is locked on failure',()=>{
 const f=roundFixture({id:'breakout'});f.context.window.OjjudaBreakoutGame={levels:100};f.context.R.game={stage:9,stageCleared:false};
 let html=f.context.breakoutStagePicker(9);assert.match(html,/이전 단계/);assert.match(html,/지금 단계/);assert.match(html,/다음 단계/);
 assert.match(html,/data-stage="10" disabled/);assert.equal(f.context.canChooseBreakoutStage(10),false);
 assert.equal(f.context.canChooseBreakoutStage(8),true);f.context.R.game.stageCleared=true;
 html=f.context.breakoutStagePicker(9);assert.doesNotMatch(html,/data-stage="10" disabled/);assert.equal(f.context.canChooseBreakoutStage(10),true);
 assert.equal(f.context.canChooseBreakoutStage(11),false);assert.doesNotMatch(html,/힌트|클리어하면|다시 도전할 수/);
});
for(const id of ['breakout','screw'])test(id+': a lower-stage clear consumes the guest round without inventing a different-stage ranking comparison',async()=>{
 let queries=0;const f=roundFixture({id,guest:true,rank:()=>{queries++;throw Error('not a comparable stage leaderboard');}});
 f.context.window.OjjudaBreakoutGame={levels:100};f.context.R.running=true;f.context.R.game={draw(){},stage:8,levels:1000,stageCleared:true};
 if(id==='breakout')f.context.breakoutStageComplete(40);else{f.context.R.screwMode='box';f.context.screwStageResult(40,'success');}
 assert.equal(f.cards.at(-1).outcome,'success');assert.match(f.cards.at(-1).metric,/8단계/);assert.doesNotMatch(f.cards.at(-1).metric,/1등|차이/);assert.equal(queries,0);
 assert.deepEqual(f.events,[['finished']]);
 if(id==='breakout'){f.context.R.breakoutStage=9;await f.context._2();}else await f.context.chooseScrewStage(9);
 assert.equal(f.context.R.running,false,'the next stage cannot begin before the scheduled login');
});
test('a guest breakout clear finalizes and submits its score before navigation, once',async()=>{
 const f=roundFixture({id:'breakout',guest:true});let finished=0;
 f.context.window.OjjudaBreakoutGame={levels:100};await f.context._2();
 Object.assign(f.game,{stage:1,stageCleared:true,finishRun(){if(finished)return false;finished++;void f.context.S2(40);return true;}});
 f.context.breakoutStageComplete(40);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(finished,1);assert.deepEqual(f.saved,[{key:'breakout',score:40}]);assert.deepEqual(f.events,[['finished']]);
 assert.equal(f.cards.at(-1).outcome,'success');assert.equal(f.context.R.running,false);
 f.context.breakoutStageComplete(40);assert.equal(f.game.finishRun(),false,'the later close/pagehide cannot finish the same engine run twice');await f.context.S2(40);
 assert.equal(f.saved.length,1);assert.equal(f.events.length,1);
});
test('a member breakout clear retains the next-stage flow and does not finalize early',async()=>{
 const f=roundFixture({id:'breakout'});let finished=0;
 f.context.window.OjjudaBreakoutGame={levels:100};await f.context._2();
 Object.assign(f.game,{stage:1,stageCleared:true,finishRun(){finished++;return true;},continueStage(stage){this.stage=stage;this.stageCleared=false;return true;}});
 f.context.breakoutStageComplete(40);assert.equal(finished,0);assert.equal(f.saved.length,0);assert.equal(f.events.length,0);
 f.context.R.breakoutStage=2;await f.context._2();assert.equal(f.context.R.running,true);assert.equal(f.game.stage,2);assert.equal(finished,0);
});
for(const mode of ['box','flat'])for(const outcome of ['success','failure'])test('screw '+mode+': first-stage '+outcome+' consumes exactly one guest round',async()=>{
 const f=roundFixture({id:'screw',guest:true});
 const game={draw(){},stage:1,levels:1000,stageCleared:outcome==='success',stageFailed:outcome==='failure'};
 Object.assign(f.context.R,{game,running:true,screwMode:mode});
 f.context.screwStageResult(0,outcome);f.context.screwStageResult(0,outcome);
 assert.deepEqual(f.events,[['finished']]);assert.equal(f.cards.at(-1).outcome,outcome);
 await f.context.chooseScrewStage(1);assert.equal(f.context.R.game,game);assert.equal(f.context.R.running,false,'retrying the same stage is also gated');
});
test('screw failure recovery cannot resume play during the guest login delay',()=>{
 let allowed=false,resumed=0;
 const c=vm.createContext({window:{OjjudaGuestAccess:{canPlay:()=>allowed}},performance,worldRewardOwner:()=>null,R:{id:'screw',owner:null,game:{resume:()=>{resumed++;return true;}}},ti(){},sf(){}});
 vm.runInContext(world.slice(world.indexOf('function M2('),world.indexOf('function ti(')),c);
 const event={target:{closest:()=>({dataset:{g:'screw-resume'}})}};
 c.M2(event);assert.equal(resumed,0);assert.equal(c.R.running,undefined);
 allowed=true;c.M2(event);assert.equal(resumed,1);assert.equal(c.R.running,true,'the existing member recovery flow remains available');
});
test('screw next-stage choice rechecks guest access after pending purchase verification',async()=>{
 const f=roundFixture({id:'screw',guest:true}),pending=deferred();let continued=0;
 Object.assign(f.context.R,{screwBaseStage:1,game:{stage:1,levels:1000,unlockedStage:2,stageCleared:true,prepareStageChoice:()=>pending.promise,continueStage:()=>{continued++;return true;}}});
 const choosing=f.context.chooseScrewStage(2);f.context.window.OjjudaGuestAccess.finished();pending.resolve(true);await choosing;
 assert.equal(continued,0);assert.equal(f.context.R.running,false);assert.equal(f.context.R.stageChanging,false);
});
for(const id of ['runner','breakout','screw'])test(id+': a stale member round cannot consume access after sign-out into guest',async()=>{
 const f=roundFixture({id,guest:true});f.context.R.owner='previous-member';
 await f.context._2();assert.equal(f.context.R.running,false,'a stale member session cannot start another round');
 Object.assign(f.context.R,{running:true,game:{draw(){},stage:1,levels:1000,stageCleared:true},screwMode:'box'});f.context.window.OjjudaBreakoutGame={levels:100};
 if(id==='breakout')f.context.breakoutStageComplete(40);else if(id==='screw')f.context.screwStageResult(40,'success');else await f.context.S2(40);
 assert.equal(f.events.filter(event=>event[0]==='finished').length,0);
});
test('closing an unplayed inline game never consumes the guest round',()=>{
 const start=world.indexOf('function El(){'),source=world.slice(start,world.indexOf("window.addEventListener('pagehide'",start));
 for(const id of ['mole','runner','stacker','breakout','screw']){
  let finished=0,closed=false;
  const c=vm.createContext({window:{OjjudaGuestAccess:{finished:()=>finished++},removeEventListener(){}},document:{getElementById:()=>null,querySelector:()=>null,body:{classList:{remove(){}}}},worldGameAssetRequest:0,worldClosingGames:null,R:{id,running:false,game:null,ov:{remove:()=>{closed=true;}}},cancelAnimationFrame(){}});
  vm.runInContext(source,c);assert.equal(c.El(),true);assert.equal(closed,true);assert.equal(c.R,null);assert.equal(finished,0,id+' did not finish a round');
 }
});
test('all public game links use their existing entry functions and cannot select a locked stage',()=>{
 const calls=[],c=vm.createContext({window:{openMatgo:()=>calls.push(['matgo'])},Al:(...args)=>calls.push(['arcade',...args]),xn:id=>calls.push(['billiards',id]),vn:id=>calls.push(['board',id])});vm.runInContext(routes,c);
 const arcade=['sacheonseong','mines','saetbyeol','mole','runner','stacker','breakout','spot','screw','bang','tank','tour','ttang','poker','roulette','photo_ttang','archery','festival'];
 for(const id of arcade){c.openWorldGameLink(id);assert.deepEqual(calls.at(-1),['arcade',id]);}
 c.openWorldGameLink('restaurants');assert.equal(calls.at(-1)[0],'arcade');assert.equal(calls.at(-1)[1],'restaurants');assert.equal(Object.keys(calls.at(-1)[2]).length,0);
 c.openWorldGameLink('recommendations');assert.equal(calls.at(-1)[1],'restaurants');assert.equal(calls.at(-1)[2].openRecommendations,true,'legacy recommendation links open the directory and its member child');
 c.openWorldGameLink('restaurants',{openRecommendations:true});assert.equal(calls.at(-1)[1],'restaurants');assert.equal(calls.at(-1)[2].openRecommendations,true,'canonical nested options reach the directory');
 for(const id of ['carom4','carom3','pool8']){c.openWorldGameLink(id);assert.deepEqual(calls.at(-1),['billiards',id]);}
 for(const id of ['janggi','chess']){c.openWorldGameLink(id);assert.deepEqual(calls.at(-1),['board',id]);}
 c.openWorldGameLink('matgo');assert.deepEqual(calls.at(-1),['matgo']);
 for(const [id,mode]of [['screw_box','box'],['screw_flat','flat']]){c.openWorldGameLink(id);assert.equal(calls.at(-1)[1],'screw');assert.equal(calls.at(-1)[2].screwMode,mode);assert.equal(calls.at(-1)[2].stage,undefined);}
 const count=calls.length;for(const id of ['admin','<script>','screw_flat:1000',null])c.openWorldGameLink(id);assert.equal(calls.length,count);
});
function boxFixture(options={}){
 const storage=new Map(),events=[],w={},c=vm.createContext({window:w,console,crypto:require('node:crypto'),localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))}});
 // Run the real imported geometry helpers in the isolated VM as classic scripts.
 // The production game is an ESM module, while this result fixture has no loader.
 for(const file of ['games/screw/screw3d-premium-models.js','games/screw/screw3d-classic-styles.js','games/screw/screw3d-soft-cubes.js','games/screw/screw3d-replacement-models.js','games/screw/screw3d-sculpted-skins.js','games/screw/screw3d-depth-renderer.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8').replace(/^export (?=(?:const|function|class|let|var)\b)/gm,'');
  vm.runInContext(source,c,{filename:file});
 }
 const gameSource=fs.readFileSync(path.join(root,'games/screw/screw3d.js'),'utf8').replace(/^import .*;\s*$/gm,'').replace(/export \{[^}]*\};/, '');
 vm.runInContext(gameSource,c,{filename:'games/screw/screw3d.js'});
 const api={setScore(){},end:(score,detail)=>events.push(['end',score,detail?.outcome]),stageClear:score=>events.push(['clear',score]),...options};
 const game=c.screw3d(api,1);return {game,st:w.__ojjScrew3d,events,storage};
}
test('box screw completion waits for an explicit next choice instead of advancing on a timer',async()=>{
 const f=boxFixture();for(const s of f.st.lvl.screws)s.state='done';for(const e of f.st.lvl.els)e.state='gone';
 f.game.update(.05);assert.equal(f.events.length,1);assert.equal(f.events[0][0],'clear');assert.equal(f.game.stageCleared,true);
 for(let i=0;i<100;i++)f.game.update(.05);assert.equal(f.game.stage,1);assert.equal(f.events.length,1);
 assert.equal(f.game.continueStage(3),false);assert.equal(await f.game.prepareStageChoice(),true);assert.equal(f.game.continueStage(2),true);assert.equal(f.game.stage,2);assert.equal(f.game.stageCleared,false);
});
test('box screw failure ends once and never unlocks the next stage',()=>{
 const f=boxFixture();f.st.over=.01;f.game.update(.05);f.game.update(.05);assert.equal(f.events.length,1);assert.equal(f.events[0][2],'failure');assert.equal(f.game.stageFailed,true);assert.equal(f.game.continueStage(2),false);
});
test('box screw pending purchases block advancement until a read-only verification settles them',async()=>{
 const purchases=[],f=boxFixture({getUserId:()=> 'member',buyScrew:async(kind,id,stage,verify)=>{purchases.push({kind,stage,verify});return {ok:false,reason:'not_found',stage};}});
 for(const s of f.st.lvl.screws)s.state='done';for(const e of f.st.lvl.els)e.state='gone';f.game.update(.05);
 f.st.purchases.pending.box='00000000-0000-4000-8000-000000000001';assert.equal(f.game.continueStage(2),false);
 assert.equal(await f.game.prepareStageChoice(),true);assert.deepEqual(purchases,[{kind:'box',stage:1,verify:true}]);assert.equal(f.game.continueStage(2),true);
});
test('flat screw move exhaustion pauses for a result and preserves the existing recovery path',t=>{
 const previous=global.localStorage,storage=new Map();global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};t.after(()=>{global.localStorage=previous;});
 const events=[],G=require('../games/screw/screw-flat.js'),game=G.flat({setScore(){},end(){},stageFail:()=>events.push('failure'),stageClear:()=>events.push('success')},1);
 game.state.moves=game.state.moveLimit;game.update(.05);game.update(.05);assert.deepEqual(events,['failure']);assert.equal(game.canResume,true);assert.equal(game.continueStage(2),false);
 assert.equal(game.resume(),true);game.update(.05);assert.deepEqual(events,['failure'],'continuing to the purchase controls must not immediately reopen the same failure');
 for(const plate of game.state.level.plates)plate.state='gone';game.update(.05);assert.deepEqual(events,['failure','success']);assert.equal(game.stageCleared,true);
 for(let n=0;n<50;n++)game.update(.05);assert.equal(game.stage,1);assert.equal(game.continueStage(2),true);assert.equal(game.stage,2);game.destroy();
});
for(const [kind,outcomes]of [['chess',['w','b','draw']],['janggi',['c','h','draw']],['carom4',['p1','p2']],['carom3',['p1','p2']],['pool8',['p1','p2']]])for(const mode of ['ai','local'])test(kind+' '+mode+': every guest outcome reaches the shared one-round login flow',async()=>{
 const finished=[],c=vm.createContext({adminGamePreviewActive:()=>false,window:{OjjudaGuestAccess:{finished:(...args)=>finished.push(args)}},D:{online:false},console});vm.runInContext(practiceSource,c);
 const session={kind,mode,owner:null};
 await c.savePracticeStreak(session,null);assert.equal(finished.length,0,'opening or closing an unfinished game is not a result');
 for(const winner of outcomes)await c.savePracticeStreak(session,winner);
 assert.equal(finished.length,outcomes.length);assert.ok(finished.every(args=>args.length===0),'no result bypasses the automatic login with retainResult');
 await c.savePracticeStreak({...session,owner:'previous-member'},outcomes[0]);assert.equal(finished.length,outcomes.length,'a stale member result cannot consume the new guest session');
});
for(const kind of ['chess','janggi','carom4','carom3','pool8'])test(kind+': direct start also gates a consumed guest trial',()=>{
 let allowed=false,started=0;
 const c=vm.createContext({window:{OjjudaGuestAccess:{canPlay:()=>allowed}},mn(){},tp:()=>{started++;return {st:{inHand:false}};},ol(){},gn(){},Jt(){},yn(){},jp:()=>{started++;return {};},pa(){},Je(){}});
 const board=['chess','janggi'].includes(kind),start=board?'function zp(':'function ep(',end=board?'function b2(':'function gn(';
 vm.runInContext(world.slice(world.indexOf(start),world.indexOf(end,world.indexOf(start))),c);
 const launch=()=>board?c.zp(kind,'local',{}):c.ep(kind,'local',{});
 launch();assert.equal(started,0);allowed=true;launch();assert.equal(started,1,'an unused trial or signed-in start is unchanged');
});
for(const kind of ['chess','carom4'])test(kind+': failed streak settlement exposes retry inside the result and duplicate retry clicks still save once',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM(kind==='chess'?'<div id="bd-root"><div class="game-result-extra"></div></div>':'<div id="gov"><div class="bl-ctrl"></div><div class="world-billiards-result"><div class="game-result-extra"></div></div></div>');t.after(()=>dom.window.close());
 let calls=0;const notifications=[],session={kind,mode:'ai',owner:'member',me:'p1',level:'normal',ov:dom.window.document.querySelector('#gov'),streakRound:{id:'round',owner:'member',pending:false,saved:false}};
 const c=vm.createContext({adminGamePreviewActive:()=>false,window:{OjjudaGuestAccess:{finished(){}}},document:dom.window.document,D:{online:true,user:{id:'member'}},S:{rpc:async()=>++calls===1?{error:new Error('temporary offline')}:{data:{ok:true}}},k:kind==='chess'?null:session,E:kind==='chess'?session:null,notifyStreakSaved:owner=>notifications.push(owner),M(){},console:{error(){}}});
 vm.runInContext(practiceSource,c);await c.savePracticeStreak(session,'p1');
 const retry=dom.window.document.querySelector('.game-result-extra button');assert.ok(retry,'retry is in the visible result, not behind the game overlay');assert.equal(calls,1);
 retry.onclick();retry.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,2);assert.equal(session.streakRound.saved,true);assert.deepEqual(notifications,['member']);assert.equal(dom.window.document.querySelector('.game-result-extra button'),null);
});
test('the board replay action cannot bypass a consumed guest round',()=>{
 let allowed=false;const started=[],c=vm.createContext({window:{OjjudaGuestAccess:{canPlay:()=>allowed}},E:{kind:'chess',mode:'ai',level:'normal',me:'w'},zp:(...args)=>started.push(args)});
 vm.runInContext(world.slice(world.indexOf('var Qp='),world.indexOf('function Tp(')),c);c.Qp['bd-again']();assert.equal(started.length,0);allowed=true;c.Qp['bd-again']();assert.equal(started.length,1);
});

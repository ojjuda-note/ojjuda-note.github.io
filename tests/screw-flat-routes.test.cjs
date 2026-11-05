const assert=require('node:assert/strict'),fs=require('node:fs');
const Physics=require('../screw-flat-physics.js'),Game=require('../screw-flat.js');
const {solve}=require('./helpers/flat-solution-search.cjs');
require('./screw-flat-heads.test.cjs');
const witnessCache=new Map();
function solution(stage){
 if(!witnessCache.has(stage)){
  const result=solve(stage);
  assert.equal(result.reason,null,`stage ${stage} must physically fall: ${result.reason}`);
  witnessCache.set(stage,result.route.map(({screw,to,wait})=>[screw,to,wait]));
 }
 return witnessCache.get(stage);
}

const flatSource=fs.readFileSync(require.resolve('../screw-flat.js'),'utf8');
assert.doesNotMatch(flatSource,/fillText\s*\(\s*String\(p\.orderRank\)/);
assert.doesNotMatch(flatSource,/철판 번호 순서대로|routeGateBlocked|wrongRoute|drawKeeper\(/);
assert.doesNotMatch(flatSource,/line\(c,\[\[0,-5\],\[0,5\]\]/,'no answer-signalling plus heads');
const physicsSource=fs.readFileSync(require.resolve('../screw-flat-physics.js'),'utf8');
assert.doesNotMatch(physicsSource,/routeGateBlocked|routeUnlocked|routeProgress|orderRank/);

for(let stage=12;stage<=1000;stage++){
 if(stage===25)continue;
 const level=Physics.makeFlatLevel(stage);
 assert.ok(level.requiredMoves>=level.screws.length,'every original pin must actually be lifted');
 assert.equal(Game.moveLimit(level),level.requiredMoves+2);
 assert.equal(level.holes.length-level.screws.length,3);
 assert.equal(new Set(level.order).size,level.screws.length);
 for(let i=0;i<level.screws.length;i++)for(let j=i+1;j<level.screws.length;j++){
  const a=level.screws[i].hole,b=level.screws[j].hole;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=2*level.screwRadius+1.5-1e-6,`stage ${stage} has separated visible heads`);
 }
 const access=level.screws.map(s=>Physics.canUnscrew(level,s));assert.ok(access.some(Boolean));
 level.order=[];level.requiredMoves=0;
 assert.deepEqual(level.screws.map(s=>Physics.canUnscrew(level,s)),access,'neither a witness nor a move budget gates screws');
 assert.deepEqual(Physics.makeFlatLevel(stage).holes,level.holes,'retry reproduces the physical board');
 assert.ok(level.plates.every(p=>!p.guards));
}

// A real foreground sheet can hide a rear screwdriver slot without two
// screw heads overlapping. Removing the sheet exposes that same slot.
{
 const level={interlocked:true,screwRadius:6.5,holes:[],screws:[],plates:[]};
 for(const [id,x,y,w,h,mounts] of [[0,180,260,160,100,[[-60,0],[60,0]]],[1,120,260,40,60,[[-10,-20],[10,20]]]]){
  const p={id,z:id,x,y,angle:0,vertices:[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}],mounts:mounts.map(([x,y])=>({x,y})),pins:[],state:'fixed'};level.plates.push(p);
  for(const [mount,v] of p.mounts.entries()){const hole={id:level.holes.length,x:x+v.x,y:y+v.y,owner:id,screw:level.screws.length};level.holes.push(hole);p.pins.push({hole:hole.id,mount});level.screws.push({id:hole.screw,hole});}
 }
 assert.equal(Physics.canUnscrew(level,level.screws[0]),false);
 level.plates[1].state='gone';assert.equal(Physics.canUnscrew(level,level.screws[0]),true);
}

// A visible screw outside the certified order remains legal to pick up.
for(const stage of [26,55,220,598,1000]){
 const level=Physics.makeFlatLevel(stage),sim=Physics.createPhysics(level);
 const alternate=[...level.screws].reverse().find(s=>s.id!==solution(stage)[0][0]&&Physics.canUnscrew(level,s));
 assert.ok(alternate);assert.ok(sim.lift(alternate),'only physical visibility, not order, controls pickup');sim.destroy();
}

const storage=new Map();global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
storage.set(Game.STAGE_KEY,'1000');
const press=(game,h)=>{game.onDown(h.x,h.y,1);game.onUp(h.x,h.y,1);};
const tick=(game,seconds)=>{for(let n=0;n<Math.round(seconds*20);n++)game.update(.05);};
function play(game,[id,to,wait],expectBlocked=false){
 const level=game.state.level,screw=level.screws[id];assert.ok(screw.hole,'source is seated before pickup');
 if(expectBlocked){
  const original=screw.hole,before=game.state.moves;
  press(game,original);
  assert.equal(screw.hole,original,'a screw with no reachable destination remains fixed');
  assert.equal(game.state.moves,before,'a refused pickup spends no moves');
  assert.equal(game.state.selected,null,'the hand stays empty after a refused pickup');
  assert.match(game.state.message,/옮길 빈 구멍이 없어요/);
  return;
 }
 press(game,screw.hole);assert.equal(screw.hole,null,`stage ${game.state.L} screw ${id} lifts: ${game.state.message}`);tick(game,wait||1.5);
 if(to!==null&&!game.state.complete){
  tick(game,.4); // The rigid plates have 0.4s to settle before seat attempt.
  assert.ok(Physics.canSeatScrew(level,level.holes[to],screw),`stage ${game.state.L} screw ${id} to hole ${to} is physically accessible`);
  press(game,level.holes[to]);tick(game,1.5); // The screw seats immediately; artwork completes its flight.
  if(!game.state.complete)assert.equal(screw.hole,level.holes[to],`stage ${game.state.L} screw ${id} seats into hole ${to}: ${game.state.message}`);
 }
}
// The old collision-only witnesses deliberately include three bad-order
// choices. The new guard refuses those pickups instead of stranding a screw.
const blockedWitnessSteps=new Map([[220,37],[450,72],[650,175]]);
for(const stage of [12,21,26,35,55,80,115,160,220,450,598,650,800,1000]){
 const game=Game.flat({setScore(){},end(){}},stage);
 const route=solution(stage);
 for(let i=0;i<route.length;i++){if(game.state.complete)break;play(game,route[i],blockedWitnessSteps.get(stage)===i);if(blockedWitnessSteps.get(stage)===i)break;}
 tick(game,8);
 assert.equal(game.state.complete,!blockedWitnessSteps.has(stage),`stage ${stage} completes or properly refuses the known unsafe route`);
 assert.ok(game.state.moves<=route.length);assert.equal(game.state.extraHoles,0);assert.equal(game.state.extraMoves,0);game.destroy();
}

async function itemRecovery(){
 let bought=0,failures=0;
 const api={getUserId:()=> 'flat-route-test',getCoins:()=>10,setScore(){},end(){},stageFail(){failures++;},async buyScrew(kind,id,stage,read,attempt_id){if(!read&&kind==='flat_moves')bought++;return{ok:true,stage,attempt_id,count:kind==='flat_moves'?bought:0,extra_moves:kind==='flat_moves'?bought*3:0};}};
 const game=Game.flat(api,26),st=game.state,route=solution(26);await new Promise(resolve=>setImmediate(resolve));
 play(game,route[0]);play(game,route[1]);
 const parked=st.level.holes[0].screw;assert.notEqual(parked,null);assert.equal(st.level.holes[2].screw,null);
 play(game,[parked,2]);play(game,[parked,0]);play(game,[parked,0]); // Three real, unnecessary lifts.
 for(const step of route.slice(2,-1))play(game,step);
 assert.equal(st.moves,st.moveLimit);assert.equal(st.complete,false);assert.equal(st.failed,true,'an exhausted route offers recovery');
 assert.equal(failures,1);assert.equal(game.resume(),true,'the result screen returns to available item controls');
 const last=route.at(-1),screw=st.level.screws[last[0]],home=screw.hole;press(game,home);tick(game,.5);assert.equal(screw.hole,home,'no more pickups after the base budget');
 press(game,{x:200,y:510});await new Promise(resolve=>setImmediate(resolve));assert.equal(bought,1);assert.equal(st.extraMoves,3);
 play(game,last);tick(game,8);assert.equal(st.complete,true,'three bought moves recover the spent-lift mistake');game.destroy();
}
itemRecovery().then(()=>console.log('PASS: 988 certified budgets, geometric occlusion, 11 clear UI routes, 3 no-destination refusals, and item recovery.')).catch(error=>{console.error(error);process.exitCode=1;});

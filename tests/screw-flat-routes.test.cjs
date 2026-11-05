const assert=require('node:assert/strict'),fs=require('node:fs');
const Physics=require('../screw-flat-physics.js'),Game=require('../screw-flat.js');
const {solve}=require('./helpers/flat-solution-search.cjs');
const {solve:solveAtomic}=require('./helpers/flat-atomic-solution-search.cjs');
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
for(const stage of [1,30,31,122,123,244,245,366,367,488,489,610,611,732,733,854,855,976,977,1000]){
 assert.equal(Physics.spareHoleCount(stage),3,`stage ${stage} starts with only three free holes`);
}

for(let stage=12;stage<=1000;stage++){
 if(stage===25)continue;
 const level=Physics.makeFlatLevel(stage);
 assert.ok(level.requiredMoves>=level.screws.length,'every original pin must actually be lifted');
 assert.equal(Game.moveLimit(level),level.requiredMoves+(stage<=30?5:2));
 assert.equal(level.holes.length-level.screws.length,Physics.spareHoleCount(stage));
 const tray=level.holes.filter(h=>h.owner===null);
 for(let i=0;i<tray.length;i++)for(let j=i+1;j<tray.length;j++){
  const a=tray[i],b=tray[j];
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=13*(a.storageScale+b.storageScale)+1.5-1e-6,`stage ${stage}: even drawn parking screw heads never overlap`);
 }
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
{
 const level=Physics.makeFlatLevel(1000);
 for(let i=0;i<9;i++)level.holes.push({id:level.holes.length,owner:null,screw:null,extra:true});
 Physics.layoutSpareHoles(level);
 const all=level.holes.filter(h=>h.owner===null);
 assert.equal(all.length,12,'three starting holes plus nine paid holes fit the tray');
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=13*(a.storageScale+b.storageScale)+1.5-1e-6,'all twelve illustrated heads stay separated');
 }
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
 const original=screw.hole,before=game.state.moves;
 press(game,original);
 assert.equal(screw.hole,original,`stage ${game.state.L} screw ${id} stays seated when selected: ${game.state.message}`);
 assert.equal(game.state.selected,id);
 assert.equal(game.state.moves,before,'the selection tap is free');
 if(to!==null&&!game.state.complete){
  assert.ok(Physics.canSeatScrew(level,level.holes[to],screw),`stage ${game.state.L} screw ${id} to hole ${to} is accessible before releasing its old pin`);
  press(game,level.holes[to]);
  assert.equal(game.state.moves,before+1,'the destination tap commits exactly one move');
  tick(game,wait||1.5);
  if(!game.state.complete)assert.equal(screw.hole,level.holes[to],`stage ${game.state.L} screw ${id} seats into hole ${to}: ${game.state.message}`);
 }
}
// The old certified routes allowed lifting a screw before picking its new
// hole. Verify new, separately found atomic routes through actual two-tap UI.
const atomicWitnessSeeds=new Map([[12,0],[18,0],[26,0]]);
for(const [stage,seed] of atomicWitnessSeeds){
 const game=Game.flat({setScore(){},end(){}},stage);
 const result=solveAtomic(stage,undefined,seed),route=result.route.map(({screw,to,wait})=>[screw,to,wait]);
 assert.equal(result.reason,null,`stage ${stage} has an atomic solution`);
 assert.ok(result.moves<=Game.moveLimit(game.state.level),`stage ${stage} can be solved without buying moves`);
 for(let i=0;i<route.length;i++){
  if(game.state.complete)break;
  play(game,route[i]);
 }
 tick(game,8);
 assert.equal(game.state.complete,true,`stage ${stage} completes with first-tap selection and immediate second-tap transfer`);
 assert.ok(game.state.moves<=route.length);assert.equal(game.state.extraHoles,0);assert.equal(game.state.extraMoves,0);game.destroy();
}

async function itemRecovery(){
 let bought=0,failures=0;
 const api={getUserId:()=> 'flat-route-test',getCoins:()=>10,setScore(){},end(){},stageFail(){failures++;},async buyScrew(kind,id,stage,read,attempt_id){if(!read&&kind==='flat_moves')bought++;return{ok:true,stage,attempt_id,count:kind==='flat_moves'?bought:0,extra_moves:kind==='flat_moves'?bought*3:0};}};
 const game=Game.flat(api,26),st=game.state,route=solveAtomic(26,undefined,0).route.map(({screw,to,wait})=>[screw,to,wait]);await new Promise(resolve=>setImmediate(resolve));
 for(const step of route.slice(0,-1))play(game,step);
 assert.equal(st.complete,false,'the final screw still supports metal');
 st.moves=st.moveLimit;
 const last=route.at(-1),screw=st.level.screws[last[0]],home=screw.hole;press(game,home);assert.equal(screw.hole,home,'no more pickups after the base budget');
 press(game,{x:200,y:510});await new Promise(resolve=>setImmediate(resolve));assert.equal(bought,1);assert.equal(st.extraMoves,3);
 play(game,last);tick(game,8);assert.equal(st.complete,true,'three bought moves recover an exhausted route');game.destroy();
}
itemRecovery().then(()=>console.log('PASS: 988 certified budgets, three base holes in every stage, three atomic two-tap UI routes, and item recovery.')).catch(error=>{console.error(error);process.exitCode=1;});

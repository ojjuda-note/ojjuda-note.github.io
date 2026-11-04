const assert=require('node:assert/strict');
const Physics=require('../screw-flat-physics.js');
const Game=require('../screw-flat.js');

const storage=new Map();
global.localStorage={
 getItem:key=>storage.get(key)??null,
 setItem:(key,value)=>storage.set(key,String(value)),
 removeItem:key=>storage.delete(key)
};

// Every advanced layout has exactly one no-item winning transfer sequence.
// All other transfers still move real screws, but the minimum move allowance
// cannot certify them. Extra holes or moves let the player choose another path.
for(let stage=26;stage<=1000;stage++){
 const level=Physics.makeFlatLevel(stage),route=level.route;
 assert.ok(route,`stage ${stage} has a fixed base route`);
 assert.equal(route.length,4*level.plates.length-2);
 assert.equal(level.holes.length-level.screws.length,3);
 assert.equal(level.plates.filter(p=>p.orderRank>0).length,level.plates.length);
 assert.deepEqual([...level.plates.map(p=>p.orderRank)].sort((a,b)=>a-b),
  Array.from({length:level.plates.length},(_,i)=>i+1));
 const slots=level.holes.map(h=>h.screw),positions=level.screws.map(s=>s.startHole);
 for(const step of route){
  assert.ok(Number.isInteger(step.screw)&&Number.isInteger(step.to));
  assert.equal(slots[step.to],null,`stage ${stage} has a free destination`);
  const from=positions[step.screw];assert.equal(slots[from],step.screw);
  slots[from]=null;slots[step.to]=step.screw;positions[step.screw]=step.to;
 }
 assert.equal(level.routeProgress,0);assert.equal(Game.moveLimit(level),route.length);
 assert.deepEqual(Physics.makeFlatLevel(stage).route,route,'stage is reproducible');
}

// Physical playthroughs across every piece-count bracket, including 100 screws.
for(const stage of [26,27,35,55,80,115,160,220,450,650,800,1000]){
 const level=Physics.makeFlatLevel(stage),sim=Physics.createPhysics(level);
 for(const [i,step] of level.route.entries()){
  const screw=level.screws[step.screw],hole=level.holes[step.to];
  assert.ok(Physics.canUnscrew(level,screw),`stage ${stage}, step ${i} screw is accessible`);
  assert.ok(Physics.canAccessHole(level,hole),`stage ${stage}, step ${i} hole is accessible`);
  assert.ok(sim.move(screw,hole),`stage ${stage}, step ${i} uses a real transfer`);
  for(let t=0;t<30;t++)sim.step(.05);
  assert.equal(level.routeProgress,i+1);
 }
 for(let t=0;t<50;t++)sim.step(.05);
 assert.ok(level.plates.every(p=>p.state==='gone'),`stage ${stage} drops every plate`);
 assert.equal(level.routeBroken,false);
 sim.destroy();
}

const press=(game,h)=>{game.onDown(h.x,h.y,1);game.onUp(h.x,h.y,1);};
const tick=(game,seconds=2)=>{for(let i=0;i<Math.round(seconds/.05);i++)game.update(.05);};
function transfer(game,screwId,toId){
 const level=game.state.level,screw=level.screws[screwId],target=level.holes[toId];
 game.onKey('Escape');press(game,screw.hole);press(game,target);tick(game);
 assert.equal(screw.hole,target,`real tap moves screw ${screwId} to hole ${toId}`);
}

async function itemRecovery(){
 let bought=0;
 const api={
  getUserId:()=> 'flat-route-test',getCoins:()=>10,setScore(){},end(){},
  async buyScrew(kind,id,stage,read){
   const count=kind==='flat_moves'?bought:0;
   if(!read&&kind==='flat_moves')bought++;
   return{ok:true,stage,count:kind==='flat_moves'?bought:count,extra_moves:kind==='flat_moves'?bought*3:undefined};
  }
 };
 const game=Game.flat(api,26),st=game.state;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(st.shopReady,true);
 const wrong=st.level.route.at(-1).screw;
 transfer(game,wrong,2);
 assert.equal(st.level.routeBroken,true,'a wrong order still moves a real screw');
 assert.equal(st.level.routeProgress,0);
 const canonical=st.level.route.slice(0,-2);
 for(const step of canonical)transfer(game,step.screw,step.to);
 tick(game,3);
 assert.equal(st.level.plates.filter(p=>p.state!=='gone').length,1,'the final plate remains physically attached');
 assert.equal(st.complete,false,'the wrong free route cannot clear a stage');
 assert.equal(st.failed,false,'the player can still buy an escape item');
 const finalScrew=st.level.route.at(-2).screw;
 const target=st.level.holes[0];
 press(game,st.level.screws[finalScrew].hole);press(game,target);tick(game);
 assert.equal(st.level.routeGateBlocked,true,'the last safety screw cannot be bypassed for free');
 assert.equal(st.moves,st.moveLimit-1,'the rejected move costs no turns');
 press(game,{x:200,y:510});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bought,1,'the player bought exactly one move item');
 assert.equal(st.extraMoves,3);
 assert.equal(st.level.routeUnlocked,true,'the item permits a different path');
 transfer(game,finalScrew,0);
 tick(game,3);
 assert.equal(st.complete,true,'an alternate physical solution clears after the item');
 game.destroy();
}

itemRecovery().then(()=>console.log('PASS: all 975 advanced routes, 12 physical playthroughs, strict no-item route, and purchase-assisted recovery.'))
 .catch(error=>{console.error(error);process.exitCode=1;});

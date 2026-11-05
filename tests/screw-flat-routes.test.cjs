const assert=require('node:assert/strict');
const fs=require('node:fs');
const Physics=require('../screw-flat-physics.js');
const Game=require('../screw-flat.js');

// A concealed metal keeper, not a visible sequence or a final-step gate,
// prevents the screwdriver from reaching the next plate's covered fasteners.
const flatSource=fs.readFileSync(require.resolve('../screw-flat.js'),'utf8');
assert.doesNotMatch(flatSource,/fillText\s*\(\s*String\(p\.orderRank\)/);
assert.doesNotMatch(flatSource,/철판 번호 순서대로/);
assert.doesNotMatch(flatSource,/routeGateBlocked|wrongRoute/);
const physicsSource=fs.readFileSync(require.resolve('../screw-flat-physics.js'),'utf8');
assert.doesNotMatch(physicsSource,/routeGateBlocked|routeUnlocked|routeProgress/);
assert.doesNotMatch(physicsSource,/orderRank/);
const plateAt=(level,index)=>level.plates[level.holes[level.screws[level.order[index*2]].startHole].owner];

const storage=new Map();
global.localStorage={
 getItem:key=>storage.get(key)??null,
 setItem:(key,value)=>storage.set(key,String(value)),
 removeItem:key=>storage.delete(key)
};

// The base budget permits the intended economical route, while actual keeper
// geometry hides later screws until their covering metal piece is released.
for(let stage=26;stage<=1000;stage++){
 const level=Physics.makeFlatLevel(stage),route=level.route;
 assert.ok(route,`stage ${stage} has a fixed base route`);
 assert.equal(route.length,4*level.plates.length-2);
 assert.equal(level.holes.length-level.screws.length,3);
 assert.equal(level.order.length,level.screws.length);
 assert.equal(new Set(level.order).size,level.screws.length);
 const slots=level.holes.map(h=>h.screw),positions=level.screws.map(s=>s.startHole);
 for(const step of route){
  assert.ok(Number.isInteger(step.screw)&&Number.isInteger(step.to));
  assert.equal(slots[step.to],null,`stage ${stage} has a free destination`);
  const from=positions[step.screw];assert.equal(slots[from],step.screw);
  slots[from]=null;slots[step.to]=step.screw;positions[step.screw]=step.to;
 }
 assert.equal(Game.moveLimit(level),route.length);
 const first=plateAt(level,0),second=plateAt(level,1);
 assert.equal(first.guards.length,2);
 for(const id of first.holeIds)assert.ok(Physics.canUnscrew(level,level.screws[level.holes[id].screw]),`stage ${stage} exposes the first piece`);
 for(const id of second.holeIds)assert.ok(!Physics.canUnscrew(level,level.screws[level.holes[id].screw]),`stage ${stage} has a real metal cover over the next screw`);
 assert.deepEqual(Physics.makeFlatLevel(stage).route,route,'stage is reproducible');
}

// Physical playthroughs across every piece-count bracket, the narrow centre
// wedge on stage 598, and the 100-screw final stage.
for(const stage of [26,27,35,55,80,115,160,220,450,598,650,800,1000]){
 const level=Physics.makeFlatLevel(stage),sim=Physics.createPhysics(level);
 for(const [i,step] of level.route.entries()){
  const screw=level.screws[step.screw],hole=level.holes[step.to];
  assert.ok(Physics.canUnscrew(level,screw),`stage ${stage}, step ${i} screw is accessible`);
  assert.ok(Physics.canAccessHole(level,hole),`stage ${stage}, step ${i} hole is accessible`);
  assert.ok(sim.move(screw,hole),`stage ${stage}, step ${i} uses a real transfer`);
  for(let t=0;t<30;t++)sim.step(.05);
 }
 for(let t=0;t<50;t++)sim.step(.05);
 assert.ok(level.plates.every(p=>p.state==='gone'),`stage ${stage} drops every plate`);
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
 const first=st.level.route[0];
 const covered=plateAt(st.level,1);
 for(const id of covered.holeIds)assert.equal(Physics.canUnscrew(st.level,st.level.screws[st.level.holes[id].screw]),false,'the next screw is physically covered');
 transfer(game,first.screw,2); // Bad parking decision uses the spare socket.
 transfer(game,first.screw,first.to); // Undo it, spending one extra transfer.
 for(const step of st.level.route.slice(1,-1))transfer(game,step.screw,step.to);
 tick(game,3);
 assert.equal(st.level.plates.filter(p=>p.state!=='gone').length,1,'the final plate remains physically attached');
 assert.equal(st.complete,false,'a bad parking move spends the last free transfer');
 assert.equal(st.failed,false,'the player can still buy an escape item');
 const last=st.level.route.at(-1),finalScrew=last.screw,target=st.level.holes[last.to];
 assert.equal(st.moves,st.moveLimit,'every move was a real screw transfer');
 assert.equal(plateAt(st.level,st.level.plates.length-1).pins.length,1,'the final screw still physically holds the plate');
 press(game,st.level.screws[finalScrew].hole);press(game,target);tick(game);
 assert.equal(st.moves,st.moveLimit,'without an item the player has no transfers left');
 press(game,{x:200,y:510});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bought,1,'the player bought exactly one move item');
 assert.equal(st.extraMoves,3);
 transfer(game,finalScrew,last.to);
 tick(game,3);
 assert.equal(st.complete,true,'an alternate physical solution clears after the item');
 game.destroy();
}

itemRecovery().then(()=>console.log('PASS: 975 metal-covered routes, 13 physical playthroughs, no artificial finish latch, and item-assisted recovery.'))
 .catch(error=>{console.error(error);process.exitCode=1;});

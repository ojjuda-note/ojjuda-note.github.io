const assert=require('node:assert/strict');
const Game=require('../screw-flat.js');
const Physics=require('../screw-flat-physics.js');
const store=new Map();
global.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
store.set(Game.STAGE_KEY,'1000');
const press=(game,h)=>{game.onDown(h.x,h.y,1);game.onUp(h.x,h.y,1);};
const advance=(game,seconds=.55)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)game.update(.05);};
const canvas=new Proxy({}, {get(_obj,name){
 if(name==='createLinearGradient'||name==='createRadialGradient')return()=>({addColorStop(){}});
 if(name==='measureText')return value=>({width:String(value).length*6});
 return()=>{};
},set(){return true;}});

for(const stage of [4,26,220]){
 const game=Game.flat({setScore(){},end(){}},stage),st=game.state;
 if(stage===26){
  press(game,{x:240,y:26});assert.ok(st.view.zoom>1,'stage 26 has an accessible zoom button');
  press(game,{x:240,y:26});assert.equal(st.view.zoom,1);
 }
 const screw=st.level.screws.find(s=>Physics.canUnscrew(st.level,s));
 assert.ok(screw,`stage ${stage} has at least one physically removable screw`);
 const original=screw.hole,owner=st.level.plates[original.owner],pins=owner.pins.length;
 press(game,original);
 assert.equal(st.selected,screw.id,'first tap lifts the screw');
 assert.equal(st.moves,1,'the lift consumes one move');
 assert.equal(screw.hole,null,'the held screw is no longer on the board');
 assert.equal(original.screw,null);
 assert.equal(owner.pins.length,pins-1,'metal releases as soon as the screw is lifted');
 assert.ok(!st.physics.screwBodies.has(screw.id),'no invisible collision screw remains');
 assert.equal(st.pending.kind,'lift');
 assert.doesNotThrow(()=>game.draw(canvas));
 advance(game);
 assert.equal(st.pending,null);
 const other=st.level.screws.find(s=>s.hole&&Physics.canUnscrew(st.level,s));
 if(other){press(game,other.hole);assert.equal(st.selected,screw.id,'a second screw cannot be lifted simultaneously');}
 const target=st.level.holes.find(h=>h.owner===null&&Physics.canSeatScrew(st.level,h,screw));
 assert.ok(target,'every held screw can be placed into a free storage hole');
 st.moveLimit=1;
 press(game,target);
 assert.equal(st.pending.kind,'place','placement uses its own animation');
 advance(game);
 assert.equal(st.pending,null);
 assert.equal(st.selected,null);
 assert.equal(screw.hole,target);
 assert.equal(st.moves,1,'placing does not spend an extra move');
 assert.ok(st.physics.screwBodies.has(screw.id),'the seated screw physically blocks metal again');
 assert.doesNotThrow(()=>game.draw(canvas));
 game.destroy();
}

// The hand cannot act as a storage slot. Vacancies covered by another screw
// are unusable, while loose metal may uncover a destination on release.
{
 const game=Game.flat({setScore(){},end(){}},4),st=game.state;
 const screw=st.level.screws.find(s=>Physics.canUnscrew(st.level,s));
 const home=screw.hole,pins=st.level.plates[home.owner].pins.length;
 const free=st.level.holes.filter(h=>h.screw===null),original=free.map(h=>({h,x:h.x,y:h.y}));
 const blocker=st.level.screws.find(s=>s!==screw&&s.hole);
 assert.ok(free.length,'stage has spare holes to begin with');
 for(const h of free)h.screw=blocker.id;
 press(game,home);
 assert.equal(st.moves,0,'no free hole means no move is spent');
 assert.equal(st.selected,null,'no screw is held with all destinations occupied');
 assert.equal(screw.hole,home,'the physical pin remains attached');
 assert.equal(st.level.plates[home.owner].pins.length,pins,'the metal does not release');
 assert.match(st.message,/옮길 빈 구멍이 없어요/);
 game.onKey('ArrowRight');
 assert.equal(st.focus,null,'keyboard navigation does not select an impossible pickup');
 assert.doesNotThrow(()=>game.draw(canvas));
 for(const {h} of original){h.screw=null;h.x=blocker.hole.x;h.y=blocker.hole.y;}
 assert.ok(free.every(h=>!Physics.canSeatScrew(st.level,h,screw)),'empty holes obstructed by a fixed head cannot be occupied');
 press(game,home);
 assert.equal(st.selected,null,'even physically unavailable empty holes do not allow a pickup');
 assert.equal(st.moves,0);
 for(const {h,x,y} of original){h.x=x;h.y=y;}
 assert.ok(free.some(h=>Physics.canSeatScrew(st.level,h,screw)));
 press(game,home);
 assert.equal(st.moves,1,'the screw may lift when a usable place is restored');
 assert.equal(st.selected,screw.id);
 game.destroy();
}

{
 const game=Game.flat({setScore(){},end(){}},4),st=game.state;
 const screw=st.level.screws.find(s=>Physics.canUnscrew(st.level,s)),home=screw.hole;
 press(game,home);advance(game);
 const count=st.moves;
 game.onKey('Escape');
 if(Physics.canSeatScrew(st.level,home,screw)){
  assert.equal(screw.hole,home,'Escape returns an accessible screw to its original hole');
  assert.equal(st.selected,null);
 }else{
  assert.equal(screw.hole,null,'Escape does not teleport through a blocking plate');
  assert.equal(st.selected,screw.id);
 }
 assert.equal(st.moves,count,'Escape does not refund spent moves');
 press(game,{x:302,y:514});
 assert.equal(st.selected,null,'retry clears held selection');
 assert.equal(st.moves,0);
 assert.ok(st.level.screws.every(s=>s.hole!==null),'retry restores all screws');
 game.destroy();
}

(async()=>{
 let paidHoles=0;
 const wallet={getUserId:()=> 'test-user',getCoins:()=>10,setScore(){},end(){},
  buyScrew:async(kind,_receipt,stage,verify,attempt_id)=>{
   if(!verify&&kind==='flat_hole')paidHoles++;
   return kind==='flat_hole'?{ok:true,stage,attempt_id,count:paidHoles}:{ok:true,stage,attempt_id,count:0,extra_moves:0};
  }};
 const game=Game.flat(wallet,26),st=game.state;
 await new Promise(resolve=>setImmediate(resolve));
 const screw=st.level.screws.find(s=>Physics.canUnscrew(st.level,s));
 press(game,screw.hole);advance(game);
 assert.equal(st.selected,screw.id);
 press(game,{x:90,y:514});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(st.extraHoles,1,'an item adds a new hole');
 assert.equal(st.selected,screw.id,'buying an item preserves the screw in hand');
 const purchased=st.level.holes.find(h=>h.extra);
 assert.ok(Physics.canSeatScrew(st.level,purchased,screw));
 press(game,purchased);advance(game);
 assert.equal(screw.hole,purchased);
 assert.equal(st.moves,1);
 game.destroy();

 paidHoles=0;
 const stuck=Game.flat(wallet,4),state=stuck.state;
 await new Promise(resolve=>setImmediate(resolve));
 const waiting=state.level.screws.find(s=>Physics.canUnscrew(state.level,s));
 const obstruction=state.level.screws.find(s=>s!==waiting&&s.hole);
 for(const hole of state.level.holes)if(hole.screw===null)hole.screw=obstruction.id;
 press(stuck,waiting.hole);
 assert.equal(state.selected,null,'a full board prevents the original pickup');
 press(stuck,{x:90,y:514});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.extraHoles,1,'a purchased hole creates a real new destination');
 press(stuck,waiting.hole);
 assert.equal(state.selected,waiting.id,'the newly available slot permits the pickup');
 stuck.destroy();
 paidHoles=0;
 const crowded=Game.flat(wallet,1000),higher=crowded.state;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(higher.level.holes.filter(h=>h.owner===null).length,11);
 for(let i=0;i<3;i++){
  press(crowded,{x:90,y:514});
  await new Promise(resolve=>setImmediate(resolve));
 }
 assert.equal(higher.extraHoles,3);
 assert.equal(higher.level.holes.filter(h=>h.owner===null).length,14);
 assert.doesNotThrow(()=>crowded.draw(canvas),'all fourteen storage slots render');
 const example=higher.level.screws.find(s=>Physics.canMoveToSpare(higher.level,s));
 assert.ok(example);
 press(crowded,example.hole);advance(crowded);
 assert.equal(example.hole,null);
 const newHole=higher.level.holes.find(h=>h.extra&&Physics.canSeatScrew(higher.level,h,example));
 assert.ok(newHole,'a high-tier paid slot is physically usable');
 press(crowded,newHole);advance(crowded);
 assert.equal(example.hole,newHole);
 assert.deepEqual(higher.physics.screwBodies.get(example.id).position,{x:newHole.x,y:newHole.y});
 crowded.destroy();
 console.log('PASS: pickup requires another empty hole, releasing a pin consumes no phantom storage, zoom, Escape, retry, and purchased holes.');
})().catch(error=>{console.error(error);process.exitCode=1;});

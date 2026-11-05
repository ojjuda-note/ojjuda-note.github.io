const assert=require('node:assert/strict');
const Game=require('../screw-flat.js');
const Physics=require('../screw-flat-physics.js');
const store=new Map();
global.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
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
  buyScrew:async(kind,_receipt,stage,verify)=>{
   if(!verify&&kind==='flat_hole')paidHoles++;
   return kind==='flat_hole'?{ok:true,stage,count:paidHoles}:{ok:true,stage,count:0,extra_moves:0};
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
 console.log('PASS: lift-first interaction, physics release, collision re-seat, stage-26 zoom, occupied-screw guard, zero-move seat, Escape, retry, purchased hole while holding.');
})().catch(error=>{console.error(error);process.exitCode=1;});

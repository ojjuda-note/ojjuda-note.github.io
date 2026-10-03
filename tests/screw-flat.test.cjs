const assert = require('node:assert/strict');
const {flat,makeFlatLevel,canUnscrew,canAccessHole,plateCovers,screwPoint,STAGE_KEY}=require('../screw-flat.js');
const storage=new Map();
global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
const tick=(game,seconds=1.8)=>{for(let n=0;n<Math.ceil(seconds/.05);n++)game.update(.05);};
const press=(game,x,y)=>{game.onDown(x,y,1);game.onUp(x,y,1);};
const pressHole=(game,h)=>press(game,h.x,h.y);
const invariant=level=>{
 const occupied=level.holes.filter(h=>h.screw!==null);
 assert.equal(occupied.length,level.screws.length,'no screw is collected or discarded');
 assert.equal(new Set(occupied.map(h=>h.screw)).size,level.screws.length,'each hole holds at most one unique screw');
 for(const s of level.screws)assert.equal(s.hole.screw,s.id);
};
const relocate=(game,move)=>{
 const level=game.state.level,s=level.screws[move.screw],before=s.hole;
 assert.ok(canUnscrew(level,s),`stage ${game.state.L}, screw ${s.id} is reachable`);
 assert.ok(canAccessHole(level,level.holes[move.to]));assert.equal(level.holes[move.to].screw,null);
 pressHole(game,s.hole);assert.equal(game.state.selected,s.id);
 assert.equal(s.hole,before,'selecting does not move a screw');
 pressHole(game,level.holes[move.to]);assert.ok(game.state.pending);
 tick(game);assert.equal(s.hole.id,move.to);invariant(level);
};
let last=0;
for(let stage=1;stage<=500;stage++){
 const level=makeFlatLevel(stage);
 assert.ok(level.screws.length>=last);last=level.screws.length;
 assert.equal(level.screws.length,level.plates.length*2);
 assert.equal(level.holes.length-level.screws.length,stage<=3?3:2);
 if(stage<=3)assert.equal(level.plates.length,stage+2);
 assert.deepEqual(level.solution,makeFlatLevel(stage).solution,'retry restores the same puzzle');
 for(const move of level.solution){
  const s=level.screws[move.screw],target=level.holes[move.to];
  assert.ok(canUnscrew(level,s),`stage ${stage} has a legal complete solution`);
  assert.ok(canAccessHole(level,target));assert.equal(target.screw,null);
  const q=screwPoint(s);assert.ok(q.x>=37&&q.x<=323&&q.y>=156&&q.y<=477,'screw heads remain on the board');
  s.hole.screw=null;target.screw=s.id;s.hole=target;
  for(const p of level.plates)if(p.holeIds.every(id=>level.holes[id].screw===null))p.state='gone';
  invariant(level);
 }
 assert.ok(level.plates.every(p=>p.state==='gone'));
}
// Exact rounded outlines, rotation, and falling positions determine access.
const cover={id:1,x:0,y:0,w:100,h:40,radius:12,angle:0,state:'fixed',z:1};
assert.equal(plateCovers(cover,49,19),false);assert.equal(plateCovers(cover,35,0),true);
cover.angle=Math.PI/2;assert.equal(plateCovers(cover,0,35),true);assert.equal(plateCovers(cover,35,0),false);
const back={id:0,x:0,y:0,w:80,h:30,radius:10,angle:0,state:'fixed',z:0};
const hole={id:0,x:0,y:0,owner:0,screw:0},bolt={id:0,hole};
const level={plates:[back,cover],holes:[hole],screws:[bolt]};
cover.state='falling';assert.equal(canUnscrew(level,bolt),false,'falling metal still blocks');
assert.equal(canAccessHole(level,{...hole,screw:null}),false,'covered empty holes cannot receive a screw');
cover.y=100;assert.equal(canUnscrew(level,bolt),true,'moving covers leave no stale obstruction');
cover.y=0;cover.state='gone';assert.equal(canUnscrew(level,bolt),true);

let purchases=0,ends=0;
const api={setScore(){},end(){ends++;},buyScrew(){purchases++;}};
storage.set('ojjuda-screw-stage','37');
for(const stage of [1,2,3,4,10,30,100,500]){
 storage.set(STAGE_KEY,String(stage));const game=flat(api),order=game.state.level.solution.slice();
 for(const move of order){relocate(game,move);assert.equal(game.state.ended,false);}
 assert.equal(game.state.complete,true,`real relocation and falling motion completes stage ${stage}`);
 assert.equal(game.state.score,game.state.level.plates.length*10+stage*10);
 assert.equal(storage.get(STAGE_KEY),String(Math.min(500,stage+1)));
 assert.equal(storage.get('ojjuda-screw-stage'),'37','box progress is independent');
 if(stage<500){press(game,267,514);assert.equal(game.state.L,stage+1);}else{press(game,267,514);assert.equal(ends,1);}
}
assert.equal(purchases,0);
storage.set(STAGE_KEY,'1');const game=flat(api),st=game.state;
const first=st.level.solution[0],second=st.level.solution[1],s=st.level.screws[first.screw],original=s.hole;
const plate=st.level.plates[original.owner],q=screwPoint(s);
game.onDown(q.x,q.y,1);game.onCancel(1);game.onUp(q.x,q.y,1);assert.equal(st.selected,null);
game.onDown(q.x,q.y,1);game.onDown(q.x+10,q.y,2);game.onUp(q.x,q.y,1);game.onUp(q.x+10,q.y,2);assert.equal(st.selected,null);
game.onDown(q.x,q.y,1);game.onMove(q.x+30,q.y,1);game.onUp(q.x,q.y,1);assert.equal(st.selected,null,'dragging is not a tap');
pressHole(game,st.level.holes[first.to]);assert.equal(st.pending,null,'an empty hole needs a selected screw first');
relocate(game,first);assert.equal(plate.state,'fixed','one remaining screw still supports the plate');assert.equal(st.score,0,'arbitrary moves never farm points');
relocate(game,{screw:s.id,to:original.id});assert.equal(plate.state,'fixed','reinserting into a metal hole secures that plate again');
assert.equal(original.screw,s.id,'parked screws can be moved back');
relocate(game,first);relocate(game,second);assert.equal(plate.state,'gone','moving both supporting screws drops the plate');assert.equal(st.score,10);
press(game,82,514);assert.equal(plate.state,'fixed','undo restores a dropped plate');assert.equal(st.score,0);invariant(st.level);
pressHole(game,st.level.screws[second.screw].hole);pressHole(game,st.level.holes[second.to]);assert.ok(st.pending);
press(game,82,514);assert.equal(st.pending,null,'undo also cancels a screw in transit');invariant(st.level);
relocate(game,second);press(game,297,514);assert.equal(st.score,0,'retry rolls back this stage score');assert.equal(st.moves,0);
assert.equal(st.level.screws[first.screw].hole.id,original.id);
// Selecting another occupied hole switches the selection; it never overwrites it.
pressHole(game,st.level.screws[0].hole);pressHole(game,st.level.screws[1].hole);
assert.equal(st.selected,1);assert.equal(st.pending,null);invariant(st.level);
game.onKey('Escape');game.onKey('ArrowRight');game.onKey('Enter');assert.notEqual(st.selected,null);
game.onKey('ArrowRight');game.onKey('Enter');assert.ok(st.pending,'keyboard selects a screw then an empty hole');tick(game);invariant(st.level);
press(game,297,514);game.destroy();press(game,q.x,q.y);tick(game);assert.equal(st.selected,null,'closed games ignore input');
// Reject a covered hole at the input layer, including when a screw is selected.
storage.set(STAGE_KEY,'4');const blockedGame=flat(api),bl=blockedGame.state.level;
const hidden=bl.holes.find(h=>!canAccessHole(bl,h)),visible=bl.screws.find(s=>canUnscrew(bl,s));
assert.ok(hidden&&visible);const hiddenScrew=bl.screws[hidden.screw];
hiddenScrew.hole=bl.holes[0];bl.holes[0].screw=hiddenScrew.id;hidden.screw=null;
pressHole(blockedGame,visible.hole);pressHole(blockedGame,hidden);
assert.equal(blockedGame.state.pending,null);assert.equal(hidden.screw,null);invariant(bl);
console.log('PASS: 500 relocation solutions, 8 complete games, screw conservation, empty/covered targets, reinsertion, falling covers, undo, retry, keyboard, touch cancellation and independent progress.');

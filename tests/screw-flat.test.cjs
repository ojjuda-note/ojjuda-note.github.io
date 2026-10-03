const assert=require('node:assert/strict');
const G=require('../screw-flat.js'),P=require('../screw-flat-physics.js'),M=require('../vendor/matter-0.20.0.min.js');
const {STAGE_KEY}=G,storage=new Map();global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
const press=(game,h)=>{game.onDown(h.x,h.y,1);game.onUp(h.x,h.y,1);};
const tick=(game,seconds=3)=>{for(let n=0;n<Math.round(seconds/.05);n++)game.update(.05);};
const step=(sim,seconds,dt=1/60)=>{for(let n=0;n<Math.round(seconds/dt);n++)sim.step(dt);};
const invariant=level=>{
 const occupied=level.holes.filter(h=>h.screw!==null);
 assert.equal(occupied.length,level.screws.length,'screws are conserved');assert.equal(new Set(occupied.map(h=>h.screw)).size,level.screws.length);
 for(const s of level.screws)assert.equal(s.hole.screw,s.id);
 for(const p of level.plates)for(const pin of p.pins){
  const hole=level.holes[pin.hole],q=P.worldPoint(p,p.mounts[pin.mount]);
  assert.notEqual(hole.screw,null,'every physical joint has a board screw');
  assert.ok(Math.hypot(q.x-hole.x,q.y-hole.y)<1.5,'a remaining screw stays at its board anchor');
 }
};
const relocate=(game,id,target)=>{
 const st=game.state,s=st.level.screws[id];
 const to=target||st.level.holes.find(h=>h.screw===null&&G.bareHole(st.level,h));
 assert.ok(to,`stage ${st.L} has a bare destination for screw ${id}`);assert.ok(G.canUnscrew(st.level,s));
 const before=s.hole;press(game,before);assert.equal(st.selected,id);assert.equal(s.hole,before,'selection alone does not unscrew');
 press(game,to);assert.ok(st.pending);tick(game);assert.equal(s.hole,to);invariant(st.level);
};
let purchases=0,ends=0;const api={setScore(){},end(){ends++;},buyScrew(){purchases++;}};
storage.set('ojjuda-screw-stage','37');
let last=0;
// Solve every stage through real input, moving joints and collision steps.
for(let stage=1;stage<=500;stage++){
 storage.set(STAGE_KEY,String(stage));const game=G.flat(api),st=game.state;
 assert.ok(st.level.plates.length>=last);last=st.level.plates.length;
 assert.equal(st.level.holes.length-st.level.screws.length,stage<=3?3:2);
 assert.equal(st.level.screws.length,st.level.plates.length*2);
 for(const p of st.level.plates){assert.ok(M.Vertices.isConvex(p.vertices));assert.ok(p.vertices.length>=4,'plates are polygon pieces');}
 assert.deepEqual(st.level.holes,G.makeFlatLevel(stage).holes,'retry reproduces the puzzle');
 for(let i=0;i<st.level.order.length;i+=2){
  // Reuse bare holes below the cleared pieces to keep the top two holes free.
  for(const spare of st.level.holes.filter(h=>h.owner===null).slice(0,2))if(spare.screw!==null){
   const target=st.level.holes.find(h=>h.owner!==null&&h.screw===null&&G.bareHole(st.level,h));
   assert.ok(target,`stage ${stage} can free its spare holes`);relocate(game,spare.screw,target);
  }
  relocate(game,st.level.order[i],st.level.holes[0]);relocate(game,st.level.order[i+1],st.level.holes[1]);
 }
 assert.equal(st.complete,true,`stage ${stage} clears under actual gravity and plate collisions`);
 assert.equal(st.physics.bodies.size,0,'only plates that actually left the board are removed');
 assert.equal(st.score,st.level.plates.length*10+stage*10);
 assert.equal(storage.get(STAGE_KEY),String(Math.min(500,stage+1)));assert.equal(storage.get('ojjuda-screw-stage'),'37');
 if(stage===1){press(game,{x:267,y:514});assert.equal(st.L,2);}if(stage===500){press(game,{x:267,y:514});assert.equal(ends,1);}
 game.destroy();assert.equal(st.physics.engine.world.bodies.length,0);
}
assert.equal(purchases,0);
// A physical fixture with spare holes and two independent metal rectangles.
function fixture(lowerY=330){
 const holes=[40,110,180,250,320].map((x,id)=>({id,x,y:80,owner:null,screw:null})),screws=[],plates=[];
 for(const [id,x,y,w,h] of [[0,180,200,120,30],[1,180,lowerY,260,40]]){
  const p={id,z:id,x,y,angle:0,w,h,vertices:[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}],mounts:[{x:-w/2+20,y:0},{x:w/2-20,y:0}],pins:[],holeIds:[],state:'fixed',vx:0,vy:0,spin:0};
  plates.push(p);for(let mount=0;mount<2;mount++){
   const q=P.worldPoint(p,p.mounts[mount]),hole={id:holes.length,x:q.x,y:q.y,owner:id,screw:screws.length};holes.push(hole);p.holeIds.push(hole.id);p.pins.push({hole:hole.id,mount});screws.push({id:screws.length,hole,startHole:hole.id});
  }
 }
 return{plates,holes,screws};
}
let level=fixture(),sim=P.createPhysics(level),upper=level.plates[0],lower=level.plates[1];
step(sim,2);assert.equal(upper.x,180);assert.equal(upper.y,200);assert.equal(upper.angle,0,'two screws keep a plate fixed');
assert.ok(sim.move(level.screws[0],level.holes[0]));assert.ok(sim.move(level.screws[1],level.holes[1]));
step(sim,8);assert.equal(upper.state,'loose','a released plate remains when supported');
assert.equal(lower.state,'fixed');assert.ok(Math.abs((upper.y+15)-(lower.y-20))<.2,'falling metal rests on the lower metal edge');
assert.ok(sim.engine.pairs.list.some(pair=>pair.isActive),'the two plates have a real collision contact');
assert.ok(sim.move(level.screws[2],level.holes[2]));assert.ok(sim.move(level.screws[3],level.holes[3]));
step(sim,4);assert.equal(upper.state,'gone');assert.equal(lower.state,'gone','removing the support releases both plates');sim.destroy();

level=fixture(250);sim=P.createPhysics(level);upper=level.plates[0];
assert.ok(sim.move(level.screws[0],level.holes[0]));step(sim,3);
const blockedAngle=Math.abs(upper.angle);assert.ok(blockedAngle<.5,'a neighbouring plate blocks rotation');
assert.ok(sim.move(level.screws[2],level.holes[1]));assert.ok(sim.move(level.screws[3],level.holes[2]));step(sim,3);
assert.ok(Math.abs(upper.angle)>1,'the hinge swings further once the blocker drops');invariant(level);sim.destroy();

function pendulum(dt){const level=fixture();level.plates[1].state='gone';const sim=P.createPhysics(level);sim.move(level.screws[0],level.holes[0]);step(sim,2,dt);return{level,sim,p:level.plates[0]};}
const fast=pendulum(1/60),slow=pendulum(.05);
assert.ok(fast.p.angle<-.5&&fast.p.y>220,'gravity rotates a one-screw plate around the remaining screw');
assert.ok(Math.hypot(fast.p.x-slow.p.x,fast.p.y-slow.p.y)<1e-7,'fixed physics steps are independent of display frame rate');
invariant(fast.level);invariant(slow.level);
// An old board hole does not magically reattach a moved piece.
const old=fast.level.holes[fast.level.screws[0].startHole];assert.ok(P.bareHole(fast.level,old));
assert.ok(fast.sim.move(fast.level.screws[0],old));assert.equal(fast.p.pins.length,1);
// A board hole aligned with the moving piece can accept its second screw.
const q=P.worldPoint(fast.p,fast.p.mounts[0]);const aligned={id:fast.level.holes.length,...q,owner:null,screw:null};fast.level.holes.push(aligned);
assert.ok(fast.sim.move(fast.level.screws[0],aligned));assert.equal(fast.p.state,'fixed');
const held={x:fast.p.x,y:fast.p.y,a:fast.p.angle};step(fast.sim,1);assert.deepEqual({x:fast.p.x,y:fast.p.y,a:fast.p.angle},held);
const covered={id:fast.level.holes.length,x:fast.p.x,y:fast.p.y,owner:null,screw:null};fast.level.holes.push(covered);
assert.equal(P.canAccessHole(fast.level,covered),false);assert.equal(fast.sim.move(fast.level.screws[0],covered),false,'solid moving metal blocks a board hole');
fast.sim.destroy();slow.sim.destroy();

storage.set(STAGE_KEY,'1');const game=G.flat(api),st=game.state,first=st.level.order[0],second=st.level.order[1],initial=st.level.screws[first].hole;
press(game,st.level.holes[0]);assert.equal(st.pending,null,'select a screw before its empty destination');
game.onDown(initial.x,initial.y,1);game.onCancel(1);game.onUp(initial.x,initial.y,1);assert.equal(st.selected,null);
game.onDown(initial.x,initial.y,1);game.onDown(initial.x+10,initial.y,2);game.onUp(initial.x,initial.y,1);game.onUp(initial.x+10,initial.y,2);assert.equal(st.selected,null);
game.onDown(initial.x,initial.y,1);game.onMove(initial.x+30,initial.y,1);game.onUp(initial.x,initial.y,1);assert.equal(st.selected,null);
relocate(game,first);const plate=st.level.plates[initial.owner];assert.equal(plate.state,'hinged');assert.equal(st.score,0);
const before={x:plate.x,y:plate.y,angle:plate.angle,vx:plate.vx,vy:plate.vy,spin:plate.spin};
relocate(game,second);assert.equal(plate.state,'gone');assert.equal(st.score,10);
press(game,{x:82,y:514});assert.equal(plate.state,'hinged');assert.equal(st.score,0);
assert.deepEqual({x:plate.x,y:plate.y,angle:plate.angle,vx:plate.vx,vy:plate.vy,spin:plate.spin},before,'undo restores position, rotation and velocity');
invariant(st.level);assert.equal(st.physics.engine.world.constraints.length,1);
press(game,st.level.screws[second].hole);press(game,st.level.holes.find(h=>h.screw===null&&G.bareHole(st.level,h)));assert.ok(st.pending);
press(game,{x:82,y:514});assert.equal(st.pending,null);invariant(st.level);
press(game,{x:297,y:514});assert.equal(st.score,0);assert.equal(st.moves,0);assert.ok(st.level.plates.every(p=>p.pins.length===2));
press(game,st.level.screws[0].hole);press(game,st.level.screws[1].hole);assert.equal(st.selected,1);assert.equal(st.pending,null);invariant(st.level);
game.onKey('Escape');game.onKey('ArrowRight');game.onKey('Enter');assert.notEqual(st.selected,null);game.onKey('ArrowRight');game.onKey('Enter');assert.ok(st.pending);tick(game);invariant(st.level);
game.destroy();const poses=st.level.plates.map(p=>[p.x,p.y,p.angle]);press(game,initial);tick(game);assert.deepEqual(st.level.plates.map(p=>[p.x,p.y,p.angle]),poses);assert.equal(st.physics.engine.world.constraints.length,0);
console.log('PASS: all 500 stages finish with real collision physics; fixed screws, hinges, gravity, contact support, blocked rotation, cascading falls, aligned reinsertion, frame-rate stability, physical undo, input safety and independent progress.');

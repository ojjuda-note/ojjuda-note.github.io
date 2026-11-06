const assert=require('node:assert/strict');
const P=require('../games/screw/screw-flat-physics.js');
const advance=(sim,seconds)=>{for(let n=0;n<seconds*20;n++)sim.step(.05);};

// A routed/interlocked stage used to silently turn off board-parked heads.
// Keep this fixture in that exact mode, with no lower metal to hide the bug.
for(const radius of [13,6.5,2.2]){
 const holes=[60,140,220].map((x,id)=>({id,x,y:100,owner:null,screw:null}));
 const plate={id:0,z:0,x:180,y:210,angle:0,w:120,h:30,vertices:[{x:-60,y:-15},{x:60,y:-15},{x:60,y:15},{x:-60,y:15}],mounts:[{x:-40,y:0},{x:40,y:0}],pins:[],holeIds:[],state:'fixed'};
 const screws=[];
 for(let mount=0;mount<2;mount++){
  const v=plate.mounts[mount],h={id:holes.length,x:180+v.x,y:210,owner:0,screw:screws.length};holes.push(h);plate.holeIds.push(h.id);plate.pins.push({hole:h.id,mount});screws.push({id:h.screw,hole:h,startHole:h.id});
 }
 for(const x of [150,210]){const h={id:holes.length,x,y:300,owner:99,screw:screws.length};holes.push(h);screws.push({id:h.screw,hole:h,startHole:h.id});}
 const level={interlocked:true,route:[],screwRadius:radius,holes,screws,plates:[plate]},sim=P.createPhysics(level);
 assert.ok(sim.move(screws[0],holes[0]));assert.ok(sim.move(screws[1],holes[1]));advance(sim,8);
 assert.equal(plate.state,'loose','a parked screw must hold the falling plate, not let it pass');
 assert.ok(Math.abs(plate.y+15-(300-radius))<.7,'contact is at the rendered head radius, not a tiny shaft');
 for(const screw of screws.slice(2)){
  assert.equal(sim.screwBodies.get(screw.id).circleRadius,radius);
  assert.ok(sim.engine.pairs.list.some(pair=>pair.isActive&&[pair.bodyA.parent.label,pair.bodyB.parent.label].includes('screw-'+screw.id)));
  assert.ok(P.canUnscrew(level,screw),'visible supporting heads stay removable');
  assert.ok(P.screwDepth(level,screw.hole)>plate.z,'the visible head is drawn in front of the supported metal');
 }
 assert.ok(sim.move(screws[2],holes[2]));assert.ok(sim.move(screws[3],holes[3]));advance(sim,4);
 assert.equal(plate.state,'gone','moving the physical supports lets the plate fall');sim.destroy();
}

// Enlarged touch targets must not permit the actual screw heads to overlap.
{
 const holes=[{id:0,x:80,y:100,owner:null,screw:0},{id:1,x:180,y:100,owner:null,screw:1},{id:2,x:90,y:100,owner:null,screw:null},{id:3,x:220,y:100,owner:null,screw:null}],screws=holes.slice(0,2).map(h=>({id:h.screw,hole:h,startHole:h.id}));
 const level={interlocked:true,screwRadius:6.5,holes,screws,plates:[]},sim=P.createPhysics(level);
 assert.equal(P.canSeatScrew(level,holes[2],screws[1]),false);assert.equal(sim.move(screws[1],holes[2]),false);
 assert.equal(screws[1].hole,holes[1],'a rejected overlapping move preserves the original screw');
 assert.ok(sim.move(screws[0],holes[3]));assert.ok(sim.move(screws[1],holes[2]),'the target becomes usable when the neighbouring head moves');sim.destroy();
}

// Removing one screw does not require choosing an already-exposed target.
// The single held screw leaves both its pin and its solid collision body.
{
 const level=P.makeFlatLevel(26),sim=P.createPhysics(level),screw=level.screws[level.order[0]],from=screw.hole;
 assert.ok(sim.lift(screw));assert.equal(from.screw,null);assert.equal(screw.hole,null);assert.equal(screw.heldFrom,from.id);
 assert.equal(P.screwPoint(screw),null);assert.equal(sim.screwBodies.has(screw.id),false);
 assert.equal(level.holes.filter(h=>h.screw===null).length,4,'three original spare holes plus the vacated source while holding');
 const other=level.screws.find(s=>s.hole&&P.canUnscrew(level,s));assert.ok(other);
 assert.equal(sim.lift(other),false,'there is only one hand');assert.equal(sim.move(other,level.holes[0]),false,'the transfer API cannot bypass the one-held-screw rule');
 assert.ok(sim.move(screw,level.holes[0]));assert.equal(level.holes.filter(h=>h.screw===null).length,3);
 assert.equal(sim.screwBodies.get(screw.id).circleRadius,level.screwRadius);assert.equal(sim.screwBodies.get(screw.id).collisionFilter.mask,2);sim.destroy();
}
console.log('PASS: parked head contact matches drawing at three sizes; relocating support releases metal; overlapping transfers are rejected.');

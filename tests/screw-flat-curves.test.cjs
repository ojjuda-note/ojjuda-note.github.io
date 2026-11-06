const assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../vendor/matter-0.20.0.min.js'),P=require('../screw-flat-physics.js');
const Partitions=require('../screw-flat-partitions.js');
let count=0,concave=0;
for(let stage=1;stage<=1000;stage++){
 const level=P.makeFlatLevel(stage),sim=P.createPhysics(level);
 for(const p of level.plates){
  const body=sim.bodies.get(p.id),parts=body.parts.length>1?body.parts.slice(1):[body];
  assert.ok(Math.abs(parts.reduce((sum,part)=>sum+part.area,0)-M.Vertices.area(p.vertices))<.001,'the physical union has the exact sheet area');
  for(const v of p.vertices.map(v=>P.worldPoint(p,v)))assert.ok(parts.some(part=>part.vertices.some(b=>Math.hypot(b.x-v.x,b.y-v.y)<1e-5)),'every drawn boundary vertex belongs to a physical part');
  for(const v of p.mounts)assert.ok(P.polygonDistance(p.vertices,v.x,v.y)<0);
  if(body.parts.length>1)concave++;count++;
 }
 sim.destroy();
}
assert.ok(concave>1000,'curved partitions include real concave bodies');
for(const count of [2,7,12,25,50])for(const seed of [111,333,7934]){
 const panels=Partitions.build(count,seed);
 assert.equal(panels.length,count);
 assert.ok(Math.abs(panels.reduce((sum,p)=>sum+M.Vertices.area(p),0)-296*330)<.001,'shared edges partition the full rectangle without gaps or overlaps');
}
// A concave opening must remain empty in both the rotated drawing and contact engine.
for(const angle of [0,.7,-1.2]){
 const plate={id:0,x:180,y:280,angle,z:0,state:'loose',pins:[],mounts:[],vertices:[{x:-40,y:-40},{x:40,y:-40},{x:40,y:40},{x:15,y:40},{x:15,y:0},{x:-15,y:0},{x:-15,y:40},{x:-40,y:40}]};
 const sim=P.createPhysics({plates:[plate],holes:[],screws:[]}),body=sim.bodies.get(0);
 for(const [point,hit] of [[{x:0,y:20},false],[{x:30,y:20},true]]){
  const at=P.worldPoint(plate,point),head=M.Bodies.circle(at.x,at.y,3),metal=M.Bodies.rectangle(at.x,at.y,4,4);
  assert.equal(M.Query.collides(head,[body]).length>0,hit,'screws collide with concave metal, not its hull');
  assert.equal(M.Query.collides(metal,[body]).length>0,hit,'other sheets use that same concave boundary');
  assert.equal(P.plateCovers(plate,at.x,at.y),hit);
 }
 sim.destroy();
}
// Dense concave contacts must never pull a hinged sheet off its remaining pin.
{
 const level=P.makeFlatLevel(25),sim=P.createPhysics(level),proof=require('./helpers/flat-atomic-solution-search.cjs').certified(25);
 assert.equal(proof.reason,null);
 for(const move of proof.route){
  assert.ok(sim.move(level.screws[move.screw],level.holes[move.to]));
  for(let tick=0;tick<move.wait*120;tick++){
   sim.step(1/120);
   for(const plate of level.plates)for(const pin of plate.pins){
    const at=P.worldPoint(plate,plate.mounts[pin.mount]),hole=level.holes[pin.hole];
    assert.ok(Math.hypot(at.x-hole.x,at.y-hole.y)<2,'the remaining visible screw is a solid pivot at every physics tick');
   }
  }
 }
 sim.destroy();
}
const renderer=fs.readFileSync(require.resolve('../screw-flat.js'),'utf8');
assert.match(renderer,/function metalPath\(c,p\)\{c\.beginPath\(\);p\.vertices\.forEach/);

// Use real SAT and rigid-body contacts, both while flush and after rotation.
// The shoulder of the diamond hits a screw/other sheet; its empty corner falls past.
function diamond(angle=0){
 return {id:0,x:180,y:275,angle,z:1,vertices:[{x:-42,y:0},{x:0,y:-22},{x:42,y:0},{x:0,y:22}],
  mounts:[],pins:[],holeIds:[],state:'loose'};
}
for(const angle of [0,.72,-1.3]){
 for(const [tip,hit] of [[{x:39,y:0},true],[{x:39,y:17},false]]){
  const plate=diamond(angle),point=P.worldPoint(plate,tip);
  const h={id:0,owner:null,screw:0,...point},s={id:0,hole:h};
  const level={screwRadius:2,plates:[plate],holes:[h],screws:[s]},sim=P.createPhysics(level);
  const b=sim.bodies.get(0),head=sim.screwBodies.get(0);
  const neighbour=M.Bodies.rectangle(point.x,point.y,3,3,{angle});
  assert.equal(!!M.Collision.collides(b,head),hit,'the screw tests the actual tip');
  assert.equal(!!M.Collision.collides(b,neighbour),hit,'other metal tests the same shape');
  assert.equal(P.plateCovers(plate,point.x,point.y),hit,'tool access uses the physical shape at this rotation');
  sim.destroy();
 }
}
{
 const triangle=diamond(.55);
 triangle.vertices=[{x:-36,y:18},{x:0,y:-36},{x:36,y:18}];
 const level={screws:[],holes:[],plates:[triangle]};
 const sim=P.createPhysics(level),body=sim.bodies.get(0);
 for(const [q,hit] of [[{x:0,y:-35},true],[{x:30,y:-24},false]]){
  const at=P.worldPoint(triangle,q),head=M.Bodies.circle(at.x,at.y,2);
  assert.equal(!!M.Collision.collides(body,head),hit,'a rotated triangle catches a head only where metal reaches it');
 }
 sim.destroy();
}
function fallingContact(x){
 const plate=diamond(),h={id:0,x,y:319,owner:null,screw:0};
 const sim=P.createPhysics({screwRadius:4,plates:[plate],holes:[h],screws:[{id:0,hole:h}]});let touched=false;
 M.Events.on(sim.engine,'collisionStart',({pairs})=>{if(pairs.some(pair=>pair.bodyA.label.startsWith('screw-')||pair.bodyB.label.startsWith('screw-')))touched=true;});
 for(let i=0;i<75;i++)sim.step(.05);sim.destroy();return touched;
}
assert.equal(fallingContact(219),true,'gravity brings the outer tip into contact with a parked head');
assert.equal(fallingContact(228),false,'a head past the tip lets the loose sheet fall');
console.log('PASS:',count,'curved plates across 1000 levels, exact concave boundaries, complementary cuts, screw and sheet contacts.');

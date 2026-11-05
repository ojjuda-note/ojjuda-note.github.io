const assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../vendor/matter-0.20.0.min.js'),P=require('../screw-flat-physics.js');
const profiles=new Set(),sides=new Set();let count=0;
for(let stage=1;stage<=1000;stage++){
 const level=P.makeFlatLevel(stage),sim=P.createPhysics(level);
  assert.ok(level.plates.some(p=>p.profile),`stage ${stage} includes a whole-shaped plate`);
 for(const p of level.plates){
  const body=sim.bodies.get(p.id);
  assert.equal(body.vertices.length,p.vertices.length,`stage ${stage}: no hidden rectangle or extra rim`);
  const drawn=p.vertices.map(v=>P.worldPoint(p,v));
  for(const v of drawn)assert.ok(body.vertices.some(b=>Math.hypot(b.x-v.x,b.y-v.y)<1e-5),'the body uses the exact sheet boundary');
  for(const v of p.mounts)assert.ok(P.polygonDistance(p.vertices,v.x,v.y)<0,'screws stay on their own sheet');
  if(p.profile)profiles.add(p.profile);sides.add(p.vertices.length);count++;
 }
 sim.destroy();
}
assert.deepEqual([...profiles].sort(),['circle','diamond','oval','pentagon','rectangle','semicircle','trapezoid','triangle']);
assert.ok(sides.has(3)&&sides.has(4)&&sides.has(5));
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
console.log('PASS:',count,'whole plates across 1000 levels, eight silhouettes, matching render/physics, screw and sheet contacts.');

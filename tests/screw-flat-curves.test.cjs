const assert=require('node:assert/strict');
const fs=require('node:fs');
const Matter=require('../vendor/matter-0.20.0.min.js');
const Physics=require('../screw-flat-physics.js');

let curved=0,sharp=0,roundFaces=0,triangles=0,pentagons=0;
const curvedStages=new Set();
for(let stage=1;stage<=1000;stage++){
 const level=Physics.makeFlatLevel(stage);
 for(const plate of level.plates){
  const face=plate.displayVertices;
  assert.ok(Array.isArray(face)&&face.length>=3,`stage ${stage} plate ${plate.id} has a top face`);
  assert.ok(Matter.Vertices.isConvex(face),`stage ${stage} plate ${plate.id} remains convex`);
  for(const mount of plate.mounts){
   assert.ok(Physics.polygonDistance(face,mount.x,mount.y)<0,`stage ${stage} plate ${plate.id} keeps its real fasteners on the metal`);
  }
  if(face!==plate.vertices){curved++;curvedStages.add(stage);if(face.length>=20)roundFaces++;}
  else sharp++;
  if(plate.vertices.length===3)triangles++;
  if(plate.vertices.length===5)pentagons++;
 }
}
assert.ok(curved>5000&&sharp>5000,'round and straight-edged metal pieces are both common');
assert.ok(curvedStages.size>=900,'curved metal is spread across nearly all stages');
assert.ok(roundFaces>1000,'rounded and near-oval steel faces occur frequently');
assert.ok(triangles>500&&pentagons>1000,'the solid puzzle still has triangular and pentagonal pieces');
const renderer=fs.readFileSync(require.resolve('../screw-flat.js'),'utf8');
assert.match(renderer,/p\.displayVertices\|\|p\.vertices/,'the renderer uses the curved top face');
assert.match(renderer,/metalPath\(c,p,true\)/,'the underlying physical rim remains visible');
console.log(`PASS: ${curved} rounded and ${sharp} straight metal pieces, ${roundFaces} oval-like faces, triangulated/pentagonal diversity, and fasteners on solid metal across 1000 stages.`);

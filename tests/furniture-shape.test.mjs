import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkShape,distortionRatio,sourceWeights} from '../house-test/picture-quality.js';
import {projectMesh} from '../house-test/anchor-editor/mesh.js';
import {SOFA_V1} from '../house-test/sofa-v1-registration.js';

const source=[{x:0,y:0},{x:10,y:0},{x:0,y:10}];
const triangle=matrix=>({source,matrix});
for(const matrix of [[1,0,0,1],[0,3,-3,0],[.01,0,0,.01]])assert.equal(checkShape([triangle(matrix)]).ok,true,'rotation and uniform scale preserve shape');
for(const matrix of [[1,0,0,.1],[1,0,5,1],[1,0,0,0]])assert.equal(checkShape([triangle(matrix)]).ok,false,'flattening, shear and collapse must fail');
assert.equal(distortionRatio([1,0,0,.1]),10);
const pixels={width:20,height:10,data:new Uint8ClampedArray(20*10*4)};
for(let y=0;y<10;y++)for(let x=0;x<10;x++)pixels.data[(y*20+x)*4+3]=255;
const blank={source:source.map(p=>({...p,x:p.x+10})),matrix:[1,0,0,.01]};
const good=triangle([1,0,0,1]);
assert.equal(checkShape([good,blank],sourceWeights([good,blank],pixels)).ok,true,'transparent margins do not count as damaged artwork');
assert.equal(checkShape([triangle([1,0,0,.01]),{...blank,matrix:[1,0,0,1]}],sourceWeights([good,blank],pixels)).ok,false,'transparent margins cannot dilute a damaged painted region');
const runtime=id=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/'+id+'.runtime.json',import.meta.url)));
for(const id of ['pencil-cup-v1','table-plant-v1','table-books-v1'])for(const view of Object.values(runtime(id).views))assert.equal(checkShape(projectMesh(view.mesh,view.placement).triangles).ok,true,id+' preserves original proportions');
// Regression specimens: positive-area meshes used to pass even when they
// crushed the seat/pages. This test is deliberately not a visual approval.
for(const view of Object.values(runtime('open-book-v1').views))assert.equal(checkShape(projectMesh(view.mesh,view.placement).triangles).ok,false,'flattened book must not be exportable again');
for(const direction of ['left','right']){const v=SOFA_V1[direction];assert.equal(checkShape(projectMesh(v.mesh,{...v.placement,y:0}).triangles).ok,false,'compressed sofa side must be flagged');}
// The visible seat seam next to the left arm used to land in a 9x shear.
// A fixed point in the original PNG must stay in a moderate transform both
// near the back wall and at the authored pose; this fails on the old diagonal.
const sample={x:900,y:550},turn=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
for(const y of [0,3]){
 const v=SOFA_V1.left,triangles=projectMesh(v.mesh,{...v.placement,y}).triangles;
 const seat=triangles.find(t=>t.source.every((p,i)=>turn(p,t.source[(i+1)%3],sample)>=-1e-8));
 assert.ok(seat,'the original seat seam remains covered');
 assert.ok(distortionRatio(seat.matrix)<2.5,'left seat seam must not stretch into the near arm');
}
// The lower right arm must keep the original fabric proportions across its seam.
const rightArmSample={x:1000,y:950};
for(const y of [0,3]){
 const v=SOFA_V1.right,triangles=projectMesh(v.mesh,{...v.placement,y}).triangles;
 const arm=triangles.find(t=>t.source.every((p,i)=>turn(p,t.source[(i+1)%3],rightArmSample)>=-1e-8));
 assert.ok(arm,'the original lower right arm remains covered');
 assert.ok(distortionRatio(arm.matrix)<1.2,'the lower right arm fabric must retain its proportions');
}
console.log('Furniture shape guard PASS: rotation, scale, shear, collapse, transparency and known book/sofa regressions');

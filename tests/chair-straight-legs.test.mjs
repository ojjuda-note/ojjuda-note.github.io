import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {straightenChairLegs} from '../house-test/chair-straight-regions.js';
import {normalizeMesh,projectMesh,straightenProjectedMesh} from '../house-test/anchor-editor/mesh.js';

const original=JSON.parse(fs.readFileSync(new URL('../house-test/assets/chair-v1.runtime.json',import.meta.url)));
const fixed=straightenChairLegs(structuredClone(original));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const pointAt=(mesh,p)=>{
 const t=mesh.triangles.find(t=>t.source.every((a,i)=>cross(a,t.source[(i+1)%3],p)>=-1e-6));
 assert(t,'source point remains covered');const m=t.matrix;
 return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};
};
const bend=(mesh,r)=>{
 const a=pointAt(mesh,r.start),b=pointAt(mesh,r.end);let max=0;
 for(let i=1;i<40;i++){const t=i/40,p=pointAt(mesh,{x:r.start.x+t*(r.end.x-r.start.x),y:r.start.y+t*(r.end.y-r.start.y)});max=Math.max(max,Math.abs(cross(a,b,p))/Math.hypot(b.x-a.x,b.y-a.y));}
 return max;
};
test('rendering correction preserves approved PNGs, native geometry and all four contact feet',()=>{
 for(const [d,v]of Object.entries(fixed.views)){
  const stripped=structuredClone(v);delete stripped.mesh.straightRegions;assert.deepEqual(stripped,original.views[d]);
  for(const pose of [v.placement,{...v.placement,x:v.placement.x+.5}]){
   const p=projectMesh(v.mesh,pose),s=straightenProjectedMesh(p);
   assert.deepEqual(s.points,p.points);
   for(const a of p.points){const actual=pointAt(s,a.source);assert(Math.hypot(actual.x-a.target.x,actual.y-a.target.y)<1e-7,'registered anchor stays exactly on its room point');}
   assert(s.triangles.every(t=>cross(...t.target)>0),'no rendered triangle folds');
  }
 }
});
test('desk-linked legs remain straight across the old triangle edges in all directions',()=>{
 const poses={left:{x:8.3,y:4.825},center:{x:4.765,y:.5},right:{x:4,y:4.535}};
 for(const [d,v]of Object.entries(fixed.views)){
  const p=projectMesh(v.mesh,{...v.placement,...poses[d]}),s=straightenProjectedMesh(p);
  const before=Math.max(...v.mesh.straightRegions.map(r=>bend(p,r))),after=Math.max(...v.mesh.straightRegions.map(r=>bend(s,r)));
  console.log(d,{before,after,strength:s.straightStrength});
  assert(after<.7,`${d}: visible shaft bends less than 0.7 native room pixels`);
  if(before>1)assert(after<before*.25,'substantial existing kink is removed');
 }
});
test('ordinary furniture is unchanged; straight-region metadata validates and copies safely',()=>{
 const v=original.views.left,p=projectMesh(v.mesh,v.placement);assert.equal(straightenProjectedMesh(p),p);
 const normalized=normalizeMesh(fixed.views.left.mesh);normalized.straightRegions[0].start.x=0;
 assert.notEqual(normalizeMesh(fixed.views.left.mesh).straightRegions[0].start.x,0);
 assert.throws(()=>normalizeMesh({...v.mesh,straightRegions:[{start:{x:0,y:0},end:{x:1,y:1},radius:-1,feather:1}]}));
});

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
  const stripped=structuredClone(v);delete stripped.mesh.straightRegions;stripped.mesh.indices=original.views[d].mesh.indices;assert.deepEqual(stripped,original.views[d]);
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

test('left near rear leg follows its own seat-to-foot edge at the reported pose and while moving',async()=>{
 const {recoverKnownChairProject}=await import('../house-test/chair-straight-regions.js');
 const v=fixed.views.left,previous=structuredClone(v.mesh),added=[[3,7,6],[3,8,7]];
 previous.indices=previous.indices.filter(t=>!added.some(q=>q.every(i=>t.includes(i))));
 previous.indices.push([6,3,8],[7,6,8]);
 const r=v.mesh.straightRegions[1];
 let positions=0;
 for(let x=0;x<=8.5;x+=.5)for(let y=0;y<=5.5;y+=.5){
  const pose={...v.placement,x,y};let before;
  try{before=projectMesh(previous,pose);}catch{continue;}
  const after=projectMesh(v.mesh,pose),rendered=straightenProjectedMesh(after);
  positions++;
  assert.deepEqual(after.points,before.points,'registered anchors and all four feet stay fixed');
  assert(rendered.triangles.every(t=>cross(...t.target)>0),'the valid old placement stays unfolded');
  assert(bend(rendered,r)<.01,'the selected shaft has no middle hinge during movement');
 }
 assert(positions>100);
 const pose={...v.placement,x:4.5,y:5.5},before=straightenProjectedMesh(projectMesh(previous,pose)),after=straightenProjectedMesh(projectMesh(v.mesh,pose));
 assert(bend(before,r)>10);assert(bend(after,r)<.01);
 for(const i of [0,2,3])assert(Math.abs(bend(before,v.mesh.straightRegions[i])-bend(after,v.mesh.straightRegions[i]))<1e-7,'the other three shafts retain their current correction');
 const area=m=>projectMesh(m,pose).triangles.reduce((sum,t)=>sum+cross(...t.source)/2,0);
 assert(Math.abs(area(previous)-area(v.mesh))<1e-6,'the same source picture is fully covered');
 const oldSaved={name:'등받이 수정 후 저장한 의자',source:{data:v.drawings[0].data},placement:pose,mesh:previous};
 assert.deepEqual((await recoverKnownChairProject(oldSaved)).mesh,v.mesh,'previously saved backrest correction also receives the one-leg correction');
 console.log('one rear leg:',{positions,before:bend(before,r),after:bend(after,r)});
});

test('back posts use the back panel at the reported placement, with unchanged feet and source coverage',()=>{
 const axes={left:[[[151,350],[250,793]],[[215,369],[293,823]],[[251,383],[329,843]],[[288,401],[375,866]],[[318,267],[454,889]]],right:[[[806,350],[708,790]],[[598,272],[493,877]],[[635,390],[575,846]],[[676,375],[613,833]],[[719,357],[654,816]]]};
 for(const d of ['left','right']){
  const pose={...fixed.views[d].placement,x:d==='left'?4.5:5.5,y:5.5},before=projectMesh(original.views[d].mesh,pose),after=projectMesh(fixed.views[d].mesh,pose),rendered=straightenProjectedMesh(after);
  const rods=axes[d].map(([a,b])=>({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]}}));
  const previous=Math.max(...rods.map(r=>bend(before,r))),current=Math.max(...rods.map(r=>bend(rendered,r)));
  assert(previous>10);assert(current<1.6);assert(current<previous*.12,'seat-front points no longer introduce a hinge in the back');
  assert.deepEqual(after.points,before.points,'every physical and support anchor stays on its original room point');
  const area=m=>m.triangles.reduce((sum,t)=>sum+cross(...t.source)/2,0);
  assert(Math.abs(area(before)-area(after))<1e-6,'source triangle union still covers the same picture');
  assert(rendered.triangles.every(t=>cross(...t.target)>0));
 }
 const again=straightenChairLegs(structuredClone(fixed));assert.deepEqual(again.views.left.mesh,fixed.views.left.mesh,'reopen cannot append duplicate triangles');
});

test('studio recovery requires both the exact chair PNG and unchanged geometry',async()=>{
 const {recoverKnownChairProject}=await import('../house-test/chair-straight-regions.js');
 for(const d of ['left','center','right']){
  const v=original.views[d],p={name:'내 의자',source:{data:v.drawings[0].data},placement:{...v.placement,x:4.5},mesh:structuredClone(v.mesh)},snapshot=JSON.stringify(p);
  const recovered=await recoverKnownChairProject(p);assert.deepEqual(recovered.mesh,fixed.views[d].mesh);assert.deepEqual(recovered.placement,p.placement);assert.equal(JSON.stringify(p),snapshot,'input project is not mutated');
  assert.deepEqual(await recoverKnownChairProject(recovered),recovered,'save/reopen is idempotent');
  const edited=structuredClone(p);edited.mesh.anchors[0].world.x+=.01;assert.equal(await recoverKnownChairProject(edited),edited,'own edited geometry is preserved');
  const other=structuredClone(p);other.source.data='data:image/png;base64,AAAA';assert.equal(await recoverKnownChairProject(other),other,'a filename or similar chair is not sufficient');
 }
});

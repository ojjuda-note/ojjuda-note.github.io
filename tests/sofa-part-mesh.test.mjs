import assert from 'node:assert/strict';import fs from 'node:fs';
import {SOFA_V1} from '../house-test/sofa-v1-registration.js?v=20261006-sofaparts1';
import {validateSofaRegistration,installSofaRegistration} from '../house-test/sofa-registration-data.js';
import {sofaArtwork,sofaPoseValid,sofaForegroundLayers} from '../house-test/sofa-art.js';
import {projectMesh} from '../house-test/picture-mesh.js';
const data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v4.runtime.json',import.meta.url))),saved=structuredClone(SOFA_V1),item={width:3.5,depth:1.5,height:1.8};
const geometry=p=>{const size=p.direction==='center'?{w:3.5,d:1.5}:{w:1.5,d:3.5};return sofaArtwork(item,p,{x:p.x,y:p.y,...size},size);};
try{
 installSofaRegistration(validateSofaRegistration(data));
 const baseline={};
 for(const [direction,v]of Object.entries(data.views)){
  const g=geometry(v.placement);baseline[direction]=g;
  const triangles=projectMesh(v.mesh,v.placement).triangles.map(t=>({source:t.source.map(p=>[p.x,p.y]),target:t.target}));
  for(const layer of g.art.layers)assert.deepEqual(layer.triangles,triangles,'legacy registration renders identical triangles for every part');
 }
 const separate=structuredClone(data);separate.version=2;
 const near=separate.views.left.order[separate.views.left.order.indexOf('slot:surface')+1];assert.equal(near,'left-arm');
 separate.views.left.partMeshes={[near]:structuredClone(separate.views.left.mesh)};
 separate.views.left.partMeshes[near].anchors[12].world.z+=.01;
 installSofaRegistration(validateSofaRegistration(separate));
 const current=geometry(separate.views.left.placement);
 for(const layer of current.art.layers){const old=baseline.left.art.layers.find(x=>x.id===layer.id);if(layer.id===near)assert.notDeepEqual(layer.triangles,old.triangles);else assert.deepEqual(layer,old,'changing the near arm cannot warp the body or far arm');}
 assert.deepEqual(current.anchors,baseline.left.anchors,'feet stay on their original floor contacts');
 assert.deepEqual(sofaForegroundLayers(current,'left').find(x=>x.id===near),current.art.layers.find(x=>x.id===near),'cushion/blanket occlusion uses the corrected arm geometry');
 for(const direction of ['center','right'])assert.deepEqual(geometry(separate.views[direction].placement),baseline[direction]);
 for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...separate.views.left.placement,x,y};assert(sofaPoseValid(p,item));geometry(p);}
 // A fold in only the part must reject placement even if the shared mesh is valid.
 SOFA_V1.left.partMeshes[near].anchors[12].world.z=-10;
 assert.equal(sofaPoseValid(separate.views.left.placement,item),false);
 assert.throws(()=>geometry(separate.views.left.placement));
 installSofaRegistration(validateSofaRegistration(data));
 for(const mutate of [
  r=>r.version=1,
  r=>r.views.left.partMeshes.unknown=r.views.left.partMeshes[near],
  r=>r.views.left.partMeshes=null,
  r=>r.views.left.partMeshes=[],
  r=>r.views.left.partMeshes[near].anchors[12].source.x++,
  r=>r.views.left.partMeshes[near].anchors[0].world.z=.01,
  r=>r.views.left.partMeshes[near].referenceDimensions.width=4,
  r=>r.views.left.partMeshes[near].indices.pop(),
  r=>r.views.left.partMeshes[near].anchors[12].world.z=-10,
 ]){
  const bad=structuredClone(separate);mutate(bad);assert.throws(()=>installSofaRegistration(validateSofaRegistration(bad)));assert.deepEqual(SOFA_V1,data.views,'invalid data must not partially install');
 }
 installSofaRegistration(validateSofaRegistration(separate));installSofaRegistration(validateSofaRegistration(data));assert.equal(SOFA_V1.left.partMeshes,undefined,'returning to legacy data removes overrides');
 console.log('Sofa part meshes PASS: legacy compatibility, isolated rendering, shared feet, matching occlusion, 40 placements and atomic rejection');
}finally{installSofaRegistration(saved);}

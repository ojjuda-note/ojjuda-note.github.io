import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';
import {distortionRatio} from '../house-test/picture-quality.js';
import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v'+n+'.runtime.json',import.meta.url)));
const original=read(2),updated=read(3);validateSofaRegistration(updated);
const restored=structuredClone(updated);restored.views.left.mesh.anchors[37].world.z=original.views.left.mesh.anchors[37].world.z;assert.deepEqual(restored,original,'only one nonphysical contour support height changes');
assert.equal(updated.views.left.mesh.anchors[37].kind,'support');
let count=0,oldMax=0,newMax=0;
const before=original.views.left,after=updated.views.left;
for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...before.placement,x,y};let old;try{old=projectMesh(before.mesh,p);}catch{continue;}const cur=projectMesh(after.mesh,p);
 const affected=before.mesh.indices.map((t,i)=>t.includes(37)?i:-1).filter(i=>i>=0);
 const a=Math.max(...affected.map(i=>distortionRatio(old.triangles[i].matrix))),b=Math.max(...affected.map(i=>distortionRatio(cur.triangles[i].matrix)));
 assert(b<a,'worst local distortion improves in every formerly valid pose');assert(b<2.8);
 for(let i=0;i<old.triangles.length;i++)if(!affected.includes(i))assert.deepEqual(cur.triangles[i],old.triangles[i],'all other rendered triangles remain identical');
 oldMax=Math.max(oldMax,a);newMax=Math.max(newMax,b);count++;
}
assert.equal(count,40);console.log('Left sofa far-arm contour PASS',JSON.stringify({count,oldMax,newMax,physicalAnchorsUnchanged:true}));

import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';
import {distortionRatio} from '../house-test/picture-quality.js';
import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v'+n+'.runtime.json',import.meta.url)));
const original=read(3),updated=read(4);validateSofaRegistration(updated);
const restored=structuredClone(updated);restored.views.left.mesh.anchors[12].source=original.views.left.mesh.anchors[12].source;assert.deepEqual(restored,original,'only the source seam point changes; all world positions and other artwork remain identical');
let count=0,oldMax=0,newMax=0;const before=original.views.left,after=updated.views.left;
for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...before.placement,x,y};const old=projectMesh(before.mesh,p),cur=projectMesh(after.mesh,p);const a=distortionRatio(old.triangles[3].matrix),b=distortionRatio(cur.triangles[3].matrix);assert(b<a*.9,'near-arm top distortion decreases by more than 10% in all tested positions');
 for(let i=0;i<old.triangles.length;i++)if(!before.mesh.indices[i].includes(12))assert.deepEqual(cur.triangles[i],old.triangles[i]);
 oldMax=Math.max(oldMax,a);newMax=Math.max(newMax,b);count++;
}
assert.equal(count,40);console.log('Left sofa source seam PASS',JSON.stringify({count,oldMax,newMax,worldPositionsUnchanged:true}));

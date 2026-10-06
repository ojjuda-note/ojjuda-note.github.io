import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';
import {distortionRatio} from '../house-test/picture-quality.js';
import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v'+n+'.runtime.json',import.meta.url)));
const before=read(5),after=read(6);validateSofaRegistration(after);
const restored=structuredClone(after);restored.views.left.partMeshes['left-arm'].anchors[13].world.x=1.38;assert.deepEqual(restored,before,'only the near-arm front surface control changes');
const v=after.views.left,old=before.views.left.partMeshes['left-arm'],now=v.partMeshes['left-arm'];let oldMax=0,newMax=0,count=0;
for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...v.placement,x,y},a=projectMesh(old,p),b=projectMesh(now,p),ar=distortionRatio(a.triangles[6].matrix),br=distortionRatio(b.triangles[6].matrix);assert(br<ar);assert(br<3.6);for(let i=0;i<now.anchors.length;i++)if(now.anchors[i].kind==='physical'&&now.anchors[i].world.z===0)assert.deepEqual(a.points[i],b.points[i]);oldMax=Math.max(oldMax,ar);newMax=Math.max(newMax,br);count++;}
console.log('Arm front surface PASS',JSON.stringify({count,oldMax,newMax}));

import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';
import {distortionRatio} from '../house-test/picture-quality.js';
import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v'+n+'.runtime.json',import.meta.url)));
const previous=read(4),current=read(5);validateSofaRegistration(current);assert.equal(current.version,2);
const restored=structuredClone(current);restored.version=1;delete restored.views.left.partMeshes;assert.deepEqual(restored,previous,'body, other views, feet, source art and accessories keep the approved registration');
const v=current.views.left,part=v.partMeshes['left-arm'];assert.deepEqual(Object.keys(v.partMeshes),['left-arm']);
const same=structuredClone(part);for(const i of [3,12,24,25,26,27])same.anchors[i].world=v.mesh.anchors[i].world;assert.deepEqual(same,v.mesh,'only six arm world controls change');
let count=0,oldMax=0,newMax=0;
for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...v.placement,x,y},old=projectMesh(v.mesh,p),now=projectMesh(part,p),a=distortionRatio(old.triangles[3].matrix),b=distortionRatio(now.triangles[3].matrix);assert(b<a);assert(b<2.4,'painted near-arm top must no longer have severe stretching');for(let i=0;i<v.mesh.anchors.length;i++){const anchor=v.mesh.anchors[i];if(anchor.kind==='physical'&&anchor.world.z===0)assert.deepEqual(now.points[i],old.points[i]);}oldMax=Math.max(oldMax,a);newMax=Math.max(newMax,b);count++;}
assert.equal(count,40);console.log('Independent near-arm PASS',JSON.stringify({count,oldMax,newMax,bodyAndFeetUnchanged:true}));

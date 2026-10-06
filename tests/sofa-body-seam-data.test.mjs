import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';import {distortionRatio} from '../house-test/picture-quality.js';import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v'+n+'.runtime.json',import.meta.url))),before=read(6),after=read(7);validateSofaRegistration(after);
const restored=structuredClone(after);delete restored.views.left.partMeshes.body;assert.deepEqual(restored,before,'previous body mesh, arms, other views and sources remain unchanged');
const v=after.views.left,m=v.partMeshes.body,same=structuredClone(m);same.anchors[12].world=v.mesh.anchors[12].world;assert.deepEqual(same,v.mesh);assert.equal(m.anchors[12].world.z,v.mesh.anchors[12].world.z,'seat height is preserved');
let count=0;for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const p={...v.placement,x,y},a=projectMesh(v.mesh,p),b=projectMesh(m,p);for(const i of [3,55])assert(distortionRatio(b.triangles[i].matrix)<distortionRatio(a.triangles[i].matrix),'both seam triangles improve');for(let i=0;i<m.anchors.length;i++)if(m.anchors[i].kind==='physical'&&m.anchors[i].world.z===0)assert.deepEqual(a.points[i],b.points[i]);count++;}
console.log('Body seam PASS: '+count+' positions; feet, seat height and other parts preserved');

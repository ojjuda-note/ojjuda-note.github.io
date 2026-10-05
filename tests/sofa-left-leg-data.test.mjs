import assert from 'node:assert/strict';import fs from 'node:fs';
import {projectMesh} from '../house-test/picture-mesh.js';
import {validateSofaRegistration} from '../house-test/sofa-registration-data.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../house-test/assets/'+name,import.meta.url)));
const original=read('sofa-registration-v1.runtime.json'),updated=read('sofa-registration-v2.runtime.json');
validateSofaRegistration(updated);
assert.deepEqual(updated.views.center,original.views.center);assert.deepEqual(updated.views.right,original.views.right);
const before=original.views.left,after=updated.views.left,moved=[1,16,41,42];
const restored=structuredClone(after);for(const i of moved)restored.mesh.anchors[i]=original.views.left.mesh.anchors[i];assert.deepEqual(restored,before,'only the one foot and three local contour supports change');
assert.deepEqual(after.mesh.indices,before.mesh.indices);assert.equal(after.mesh.anchors[1].world.z,0);
for(const i of moved)assert.deepEqual(after.mesh.anchors[i].source,before.mesh.anchors[i].source);
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x),top={x:710,y:1040};
function offset(mesh){const t=mesh.triangles.find(t=>t.source.every((a,i)=>cross(a,t.source[(i+1)%3],top)>=-1e-6));assert(t);return Math.abs(t.matrix[0]*top.x+t.matrix[2]*top.y+t.matrix[4]-mesh.points[1].target.x);}
let count=0,oldMax=0,newMax=0;
for(let x=0;x<=2;x+=.5)for(let y=0;y<=3.5;y+=.5){const pose={...before.placement,x,y};let old;try{old=projectMesh(before.mesh,pose);}catch{continue;}
 const current=projectMesh(after.mesh,pose),a=offset(old),b=offset(current);assert(b<a);assert(b<.03);oldMax=Math.max(oldMax,a);newMax=Math.max(newMax,b);count++;
}
assert.equal(count,29);console.log('Left sofa front leg PASS',JSON.stringify({validPlacements:count,oldMax,newMax,physicalFootHeight:0,otherAnchorsUnchanged:true}));

import assert from 'node:assert/strict';
import {SOFA_V1} from '../house-test/sofa-v1-registration.js';
import {projectMesh} from '../house-test/picture-mesh.js';

// Samples measured on the original wooden shafts, not generated geometry.
const tops=[{x:87,y:693},{x:632,y:1122},{x:1172,y:1010}];
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const at=(mesh,p)=>{
 const t=mesh.triangles.find(t=>t.source.every((a,i)=>cross(a,t.source[(i+1)%3],p)>=-1e-6));
 assert(t,'the original shaft remains covered');const m=t.matrix;
 return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};
};
const v=SOFA_V1.right;
for(let i=0;i<3;i++){
 const foot=v.mesh.anchors[i].world;
 assert.equal(foot.z,0,'physical feet stay on the floor');
 assert(foot.x>=0&&foot.x<=1.5&&foot.y>=0&&foot.y<=3.5,'feet remain inside the reserved footprint');
}
let count=0;
for(let x=7.5;x<=8.5;x+=.5)for(let y=0;y<=3.5;y+=.5){
 const mesh=projectMesh(v.mesh,{...v.placement,x,y});
 for(let i=0;i<3;i++)assert(Math.abs(at(mesh,tops[i]).x-mesh.points[i].target.x)<4,'wooden shaft stays within four native room pixels of its foot');
 count++;
}
assert.equal(count,24);
console.log('Right sofa legs PASS: 24 unfolded placements, shaft alignment, floor contacts and footprint');

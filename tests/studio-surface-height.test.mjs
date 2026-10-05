import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMesh} from '../house-test/anchor-editor/mesh.js';
import {roomPoint,roomPlaneWorld} from '../house-test/anchor-editor/room-guide.js';
import {objectMetadata} from '../house-test/anchor-editor/object-metadata.js';
import {validateRuntime,runtimePoseValid} from '../house-test/anchor-editor/runtime.js';
const anchors=[
 {source:{x:0,y:0},world:{x:0,y:.4,z:1},kind:'physical'},
 {source:{x:100,y:0},world:{x:.5,y:.4,z:1},kind:'physical'},
 {source:{x:100,y:100},world:{x:.5,y:.4,z:0},kind:'physical'},
 {source:{x:0,y:100},world:{x:0,y:.4,z:0},kind:'physical'}];
const mesh={anchors,indices:[[0,1,2],[0,2,3]]};
const dimensions={width:1,depth:1,height:1};
const pixel='data:image/png;base64,AA==';
const fixture=()=>({format:'ojjuda-runtime-furniture',version:1,name:'탁상 소품',dimensions,layer:'surface',views:Object.fromEntries(['left','center','right'].map(direction=>[direction,{placement:{direction,x:4,y:3,...dimensions,elevation:1.4},mesh,layers:[],preview:pixel,drawings:[{data:pixel}]}]))});
test('surface elevation uses the same room projection and preserves local contact points',()=>{
 const pose={direction:'center',x:4,y:3,...dimensions,elevation:1.4},original=JSON.stringify(mesh),projected=projectMesh(mesh,pose);
 for(const [i,a]of anchors.entries()){assert.deepEqual(projected.points[i].target,roomPoint(4+a.world.x,3+a.world.y,1.4+a.world.z));assert.equal(projected.points[i].world.z,a.world.z);}
 assert.equal(JSON.stringify(mesh),original);
 assert.deepEqual(roomPlaneWorld({...pose,plane:'top'}).map(p=>p.z),[2.4,2.4,2.4,2.4]);
 const floor=projectMesh(mesh,{...pose,elevation:0});assert.deepEqual(floor,projectMesh(mesh,{...pose,elevation:undefined}));
});
test('studio metadata and runtime accept surface objects but reject invalid elevation',()=>{
 assert.equal(objectMetadata({objectType:'furniture',usage:'surface'}).usage,'surface');
 assert.equal(validateRuntime(fixture()).layer,'surface');
 for(const elevation of [NaN,Infinity,-.1,3.51]){const r=fixture();r.views.left.placement.elevation=elevation;assert.throws(()=>validateRuntime(r));assert.equal(runtimePoseValid(r,r.views.left.placement),false);}
 const r=fixture();r.layer='standing';assert.throws(()=>validateRuntime(r));
 for(const v of Object.values(r.views))delete v.placement.elevation;assert.equal(validateRuntime(r).layer,'standing');
});

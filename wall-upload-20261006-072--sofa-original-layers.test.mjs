import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSofaRegistration,installSofaRegistration} from '../house-test/sofa-registration-data.js?v=20261006-wall1';
import {sofaArtwork,sofaForegroundLayers,sofaPoseValid} from '../house-test/sofa-art.js?v=20261006-wall1';
import {floorPoint,roomPoint} from '../house-test/model.js?v=20261006-wall1';
const data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v10.runtime.json',import.meta.url)));
const item={width:3.5,depth:1.5,height:1.8};
installSofaRegistration(validateSofaRegistration(data));
for(const [x,y]of [[0,3],[.5,2.5],[2,1]]){
 const p={x,y,direction:'left'},size={w:1.5,d:3.5};assert(sofaPoseValid(p,item));
 const g=sofaArtwork(item,p,{x,y,...size},size);
 assert.deepEqual(g.art.layers.map(l=>l.id),['right-arm','body','left-arm']);
 assert.equal(new Set(g.art.layers.map(l=>l.image)).size,2,'both sides use the same original image');
 for(const layer of g.art.layers.filter(l=>l.id!=='body')){
  const [a,b,c]=layer.triangles[0].target;
  assert(Math.abs(a.y-b.y)<1e-8&&Math.abs(b.x-c.x)<1e-8,'the side pictures are not rotated or sheared');
 }
 assert.deepEqual(sofaForegroundLayers(g,'left'),[g.art.layers[2]],'the near panel also masks accessories');
 const {side}=data.views.left.originalLayers;
 const supportHeight=side.supportHeight??(side.feet[0][1]-side.supportY)/side.feet[0][1]*side.height;
 const supports=[y+3.5,y].map(depth=>roomPoint(x+1.5*.98,depth,supportHeight));
 g.art.supportLine.forEach((p,i)=>assert(Math.hypot(p.x-supports[i].x,p.y-supports[i].y)<1e-7,'the body bottom joins each wooden rail top'));
 const expected=[y,y+3.5].flatMap(depth=>side.feet.map(([sx])=>floorPoint(x+sx/side.size[0]*1.5,depth)));
 assert.deepEqual(g.anchors,expected,'all attached feet stay on the room floor');
}
for(const direction of ['center','right'])assert.equal(data.views[direction].originalLayers,undefined,'unprovided views retain their approved originals');
for(const mutate of [r=>r.version=2,r=>r.views.left.originalLayers.side.feet[0][1]=0,r=>r.views.left.originalLayers.side.image='../invalid.png',r=>r.views.left.originalLayers.body.topHeight=4,r=>r.views.right.originalLayers=r.views.left.originalLayers,r=>r.views.left.originalLayers.side.supportY=900,r=>r.views.left.originalLayers.body.supportAnchors[0][1]=-1]){
 const bad=structuredClone(data);mutate(bad);assert.throws(()=>validateSofaRegistration(bad));
}
console.log('Original sofa layers PASS: original sources, layer order, horizontal panels, four grounded feet, body-to-rail alignment, accessory mask, legacy views and invalid-data rejection.');

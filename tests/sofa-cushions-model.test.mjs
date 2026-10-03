import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalize,normalizePlacement,findPlacement,canPlaceFurniture,canDrawFurniture,ROOM,FLOOR} from '../house-test/model.js';
import {FURNITURE,itemSize,SOFA_ACCESSORIES} from '../house-test/furniture-catalog.js';
import {sofaAccessoryFromSofa,snapCushionToSofa,sofaAccessorySpec,resolveAccessoryDrag} from '../house-test/sofa-accessory-placement.js';
import {furnitureGeometry} from '../house-test/furniture.js';
const ids=SOFA_ACCESSORIES.filter(item=>item.id!=='blanket-sofa').map(item=>item.id),fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sofa-accessories-v11-geometry.json',import.meta.url)));
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const room=furniture=>({x:0,y:0,decor:true,curtains:false,shelf:null,furniture});

test('bringing each cushion to the sofa matches its approved seat in all three directions without attachment',()=>{
 const cushions=ids.filter(id=>id!=='blanket-sofa');
 for(const sofa of [{direction:'left',x:0,y:3},{direction:'center',x:3,y:4},{direction:'right',x:8.5,y:3}])for(const id of cushions){
  const candidate={direction:sofa.direction==='center'?'right':'center',x:sofa.x+.3,y:sofa.y+.3,elevation:0},before=structuredClone({candidate,sofa});
  const matched=snapCushionToSofa(id,candidate,sofa);
  assert.deepEqual(matched,sofaAccessoryFromSofa(id,sofa));assert.equal('attachedTo' in matched,false);
  assert.deepEqual({candidate,sofa},before,'snap suggestion must not mutate independent placements');
  const saved=normalize({version:12,rooms:[room({sofa,[id]:matched})]});
  assert.deepEqual(saved.rooms[0].furniture[id],matched);
  delete saved.rooms[0].furniture.sofa;assert.deepEqual(normalize(saved).rooms[0].furniture[id],matched,'removing the sofa does not remove or reposition a snapped cushion');
 }
});

test('cushion snap uses a small footprint margin and releases for independent movement',()=>{
 const sofa={direction:'center',x:3,y:3},id='sage-cushion',spec=sofaAccessorySpec(id);
 const near={direction:'center',x:sofa.x-spec.width-.34,y:3.4,elevation:2};
 assert.deepEqual(snapCushionToSofa(id,near,sofa),sofaAccessoryFromSofa(id,sofa),'nearby footprint, not height, triggers seat alignment');
 assert.equal(snapCushionToSofa(id,{...near,x:sofa.x-spec.width-.36},sofa),null,'moving away releases snapping');
 assert.equal(snapCushionToSofa(id,{direction:'center',x:0,y:0,elevation:0},sofa),null,'far cushions stay independent');
 assert.equal(snapCushionToSofa(id,{direction:'center',x:sofa.x-spec.width-.3,y:sofa.y-spec.depth-.3},sofa),null,'diagonal distance is not an expanded square');
 for(const excluded of ['blanket-sofa','blanket-floor','missing','__proto__'])assert.equal(snapCushionToSofa(excluded,near,sofa),null);
 for(const absent of [null,undefined,{direction:'back',x:3,y:3},{direction:'center',x:9,y:3}])assert.equal(snapCushionToSofa(id,near,absent),null);
 for(const candidate of [null,{direction:'back',x:3,y:3},{direction:'center',x:NaN,y:3}])assert.equal(snapCushionToSofa(id,candidate,sofa),null);
});

test('dragging cushions away sets them on the floor while explicit height edits stay independent',()=>{
 for(const sofa of [{direction:'left',x:0,y:3},{direction:'center',x:3,y:4},{direction:'right',x:8.5,y:3}])for(const id of ids){
  const seated=resolveAccessoryDrag(id,{direction:'center',x:sofa.x+.2,y:sofa.y+.2,elevation:0},sofa);
  assert.deepEqual(seated,sofaAccessoryFromSofa(id,sofa));
  const away={...seated,direction:'center',x:4,y:0},ground=resolveAccessoryDrag(id,away,sofa);
  assert.equal(ground.elevation,0);assert.equal(ground.x,away.x);assert.equal(ground.y,away.y);assert.equal('attachedTo' in ground,false);
  assert.equal(normalizePlacement(id,{...ground,elevation:1.1}).elevation,1.1,'only dragging resets height; an explicit height edit is retained');
 }
 const regular={direction:'center',x:3,y:3};assert.equal(resolveAccessoryDrag('desk',regular,null),regular);
});

test('v11 migration preserves approved PNG coordinates and visible positions in every direction',()=>{
 for(const [direction,record]of Object.entries(fixture.views)){
  const state=normalize({version:11,rooms:[room({sofa:record.sofa})]}),furniture=state.rooms[0].furniture;
  assert.deepEqual(furniture.sofa,normalizePlacement('sofa',record.sofa));assert.equal(state.version,12);
  for(const id of ids){
   assert.deepEqual(furniture[id],normalizePlacement(id,sofaAccessoryFromSofa(id,record.sofa)));
   const actual=furnitureGeometry(id,furniture[id]).art.layers,expected=record.accessories[id];assert.equal(actual.length,expected.length);
   for(let i=0;i<expected.length;i++){
    const label=direction+'/'+id+'/'+i;assert.equal(actual[i].image,expected[i].image,label);
    assert.equal(sha(actual[i].triangles.map(t=>t.source)),expected[i].sourceSha256,label+' source mesh');
    const targets=actual[i].triangles.map(t=>t.target);assert.equal(targets.length,expected[i].targets.length);
    targets.forEach((triangle,t)=>triangle.forEach((point,p)=>assert(Math.hypot(point.x-expected[i].targets[t][p].x,point.y-expected[i].targets[t][p].y)<1e-6,label+' approved screen position')));
   }
  }
  assert.deepEqual(normalize(state),state);
 }
});

test('hidden legacy props stay absent and independent placements or removals take precedence',()=>{
 const sofa={direction:'left',x:0,y:3,accessories:{'sage-cushion':false,'blanket-sofa':false}},independent=normalizePlacement('peach-cushion',{direction:'center',x:4,y:4,elevation:0});
 const next=normalize({version:11,rooms:[room({sofa,'peach-cushion':independent,'pink-check-cushion':null})]}),furniture=next.rooms[0].furniture;
 assert(furniture['cream-floral-cushion']);for(const id of ['sage-cushion','blanket-sofa','pink-check-cushion'])assert.equal(furniture[id],undefined);assert.deepEqual(furniture['peach-cushion'],independent);
 delete furniture.sofa;assert.deepEqual(normalize(next).rooms[0].furniture,furniture);
 delete furniture['cream-floral-cushion'];assert.equal(normalize(next).rooms[0].furniture['cream-floral-cushion'],undefined);
});

test('independent position, height and direction persist with intended surface and floor overlap',()=>{
 const sofa=findPlacement('sofa'),furniture={sofa};
 for(const id of ids){
  const p=normalizePlacement(id,{direction:'center',x:3.123456,y:3.654321,elevation:.7});assert.equal(p.x,3.123456);assert.equal(p.y,3.654321);assert.equal(p.elevation,.7);
  assert(canPlaceFurniture(id,p,[{id:'sofa',...sofa}]));assert(canPlaceFurniture('sofa',sofa,[{id,...p}]));furniture[id]=p;
  const high=normalizePlacement(id,{...p,elevation:100});assert(Math.abs(high.elevation-(ROOM.wallHeight-FURNITURE[id].height))<1e-6);assert.equal(canPlaceFurniture(id,{...p,elevation:100}),false);
  assert.equal(normalizePlacement(id,{...p,elevation:-1}).elevation,0);
 }
 assert.deepEqual(normalize({version:12,rooms:[room(furniture)]}).rooms[0].furniture,furniture);
 const right=normalizePlacement('sofa',{direction:'right',x:8.5,y:3});assert(canDrawFurniture('sofa',right));assert.equal(canPlaceFurniture('sofa',right,[{id:'desk',direction:'right',x:9,y:3.5}]),false);
 const floor=normalizePlacement('blanket-floor',{direction:'center',x:0,y:3});assert.equal(FURNITURE['blanket-floor'].layer,'floor');assert(canPlaceFurniture('blanket-floor',floor,[{id:'sofa',...sofa}]));assert(canPlaceFurniture('sofa',sofa,[{id:'blanket-floor',...floor}]));
});

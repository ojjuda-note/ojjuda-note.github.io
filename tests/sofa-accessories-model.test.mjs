import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalize,normalizePlacement,findPlacement,canPlaceFurniture,canDrawFurniture,ROOM,FLOOR} from '../house-test/model.js';
import {FURNITURE,itemSize,itemLayer,itemHeight,SOFA_ACCESSORIES} from '../house-test/furniture-catalog.js';
import {sofaAccessoryFromSofa,snapCushionToSofa,sofaAccessorySpec,resolveAccessoryDrag,isBlanket} from '../house-test/sofa-accessory-placement.js';
import {furnitureGeometry} from '../house-test/furniture.js';
const ids=SOFA_ACCESSORIES.map(item=>item.id),fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sofa-accessories-v11-geometry.json',import.meta.url)));
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
 for(const sofa of [{direction:'left',x:0,y:3},{direction:'center',x:3,y:4},{direction:'right',x:8.5,y:3}])for(const id of ids.filter(id=>!isBlanket(id))){
  const seated=resolveAccessoryDrag(id,{direction:'center',x:sofa.x+.2,y:sofa.y+.2,elevation:0},sofa);
  assert.deepEqual(seated,sofaAccessoryFromSofa(id,sofa));
  const away={...seated,direction:'center',x:4,y:0},ground=resolveAccessoryDrag(id,away,sofa);
  assert.equal(ground.elevation,0);assert.equal(ground.x,away.x);assert.equal(ground.y,away.y);assert.equal('attachedTo' in ground,false);
  assert.equal(normalizePlacement(id,{...ground,elevation:1.1}).elevation,1.1,'only dragging resets height; an explicit height edit is retained');
 }
 const regular={direction:'center',x:3,y:3};assert.equal(resolveAccessoryDrag('desk',regular,null),regular);
});

test('both saved blanket slots switch between the same floor and sofa forms in three directions',()=>{
 for(const id of ['blanket-floor','blanket-sofa'])for(const sofa of [{direction:'left',x:0,y:3},{direction:'center',x:3,y:4},{direction:'right',x:8.5,y:3}]){
  const candidate={direction:'center',x:sofa.x+.2,y:sofa.y+.2,mode:'floor',elevation:0};
  const onSofa=normalizePlacement(id,resolveAccessoryDrag(id,candidate,sofa));
  assert.deepEqual(onSofa,{...sofaAccessoryFromSofa(id,sofa),mode:'sofa'});assert.equal(itemLayer(id,onSofa),'surface');assert.equal(itemHeight(id,onSofa),1.015);
  assert.deepEqual(itemSize(id,sofa.direction,onSofa),sofa.direction==='center'?{w:1.6,d:1.1}:{w:1.1,d:1.6});
  assert(canPlaceFurniture(id,onSofa,[{id:'sofa',...sofa}]));
  const ground=normalizePlacement(id,resolveAccessoryDrag(id,{...onSofa,direction:'center',x:4,y:0},sofa));
  assert.deepEqual(ground,{direction:'center',x:4,y:0,elevation:0,mode:'floor'});assert.equal(itemLayer(id,ground),'floor');assert.equal(itemHeight(id,ground),.05);assert.deepEqual(itemSize(id,'center',ground),{w:2,d:1.5});
  const saved=normalize({version:13,rooms:[room({[id]:ground})]});assert.deepEqual(saved.rooms[0].furniture[id],ground);assert.deepEqual(normalize(saved),saved);
  assert.equal(canPlaceFurniture(id,ground,[{id:'carpet',direction:'center',x:3,y:0}]),false,'flat blankets use floor collision rules');
  assert(canPlaceFurniture(id,onSofa,[{id:'sage-cushion',...sofaAccessoryFromSofa('sage-cushion',sofa)}]),'draped blankets may share the sofa with cushions');
 }
 assert.equal(normalizePlacement('blanket-floor',{direction:'center',x:1,y:1,mode:'unknown'}),null);
 assert.equal(FURNITURE['blanket-sofa'].hiddenFromMenu,true);assert.notEqual(FURNITURE['blanket-floor'].hiddenFromMenu,true);
});

test('schema 13 preserves one or both old blankets and never recreates a removed slot',()=>{
 const sofa={direction:'left',x:0,y:3},oldFloor={direction:'center',x:4,y:0},oldSofa=sofaAccessoryFromSofa('blanket-sofa',sofa);
 for(const version of [11,12])for(const old of [{'blanket-floor':oldFloor},{'blanket-sofa':oldSofa},{'blanket-floor':oldFloor,'blanket-sofa':oldSofa}]){
  const saved=normalize({version,rooms:[room(old)]}),f=saved.rooms[0].furniture;
  assert.equal(saved.version,13);assert.deepEqual(Object.keys(f).sort(),Object.keys(old).sort(),'preserve the number and identity of placed blankets');
  for(const [id,pose]of Object.entries(old))assert.deepEqual(f[id],{...pose,elevation:pose.elevation??0,mode:id==='blanket-floor'?'floor':'sofa'});
  assert.deepEqual(normalize(saved),saved);
  for(const id of Object.keys(old)){const removed=structuredClone(saved);delete removed.rooms[0].furniture[id];assert.equal(normalize(removed).rooms[0].furniture[id],undefined);}
 }
 const attachedLegacy=normalize({version:11,rooms:[room({sofa,'blanket-floor':oldFloor})]}).rooms[0].furniture;
 assert.deepEqual(attachedLegacy['blanket-floor'],{...oldFloor,elevation:0,mode:'floor'});assert.deepEqual(attachedLegacy['blanket-sofa'],{...oldSofa,mode:'sofa'},'the embedded old sofa blanket and a separate floor blanket both survive');
});

test('draped blanket rejects reversed faces without dropping any valid legacy sofa placement',()=>{
 for(const placement of [{direction:'left',x:7,y:4.5,elevation:0},{direction:'right',x:1,y:4.5,elevation:0}])assert.equal(canDrawFurniture('blanket-sofa',placement),false);
 let checked=0;
 for(const direction of ['left','center','right']){
  const {w,d}=itemSize('sofa',direction);
  for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step){
   const sofa={direction,x,y};if(!canDrawFurniture('sofa',sofa))continue;
   const expected=normalizePlacement('blanket-sofa',sofaAccessoryFromSofa('blanket-sofa',sofa)),restored=normalize({version:11,rooms:[room({sofa})]}).rooms[0].furniture;
   assert.deepEqual(restored['blanket-sofa'],expected);checked++;
  }
 }
 assert(checked>100);
});

test('empty rooms stay empty, new sofas are bare and accessories require explicit placement',()=>{
 for(const version of [9,10,11,12]){const next=normalize({version,diary:'보존할 기록',rooms:[room({})]});assert.equal(next.version,13);assert.equal(next.diary,'보존할 기록');assert.deepEqual(next.rooms[0].furniture,{});}
 assert.deepEqual(Object.keys(normalize({version:8,rooms:[room({})]}).rooms[0].furniture),['desk']);
 assert.deepEqual(Object.keys(normalize(null).rooms[0].furniture),['desk']);
 const sofa=findPlacement('sofa');assert.equal('accessories' in sofa,false);
 const state=normalize({version:12,rooms:[room({sofa:{...sofa,accessories:Object.fromEntries(ids.map(id=>[id,true]))}})]});assert.deepEqual(Object.keys(state.rooms[0].furniture),['sofa']);assert.equal('accessories' in state.rooms[0].furniture.sofa,false);
 for(const id of ids){assert.equal(FURNITURE[id].autoPlace,false);assert.equal(itemLayer(id,{mode:'sofa'}),'surface');assert.equal(FURNITURE[id].picture,isBlanket(id)?'blanket':'sofa-accessory');assert(findPlacement(id));}
});

test('v11 migration preserves approved PNG coordinates and visible positions in every direction',()=>{
 for(const [direction,record]of Object.entries(fixture.views)){
  const state=normalize({version:11,rooms:[room({sofa:record.sofa})]}),furniture=state.rooms[0].furniture;
  assert.deepEqual(furniture.sofa,record.sofa);assert.equal(state.version,13);
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

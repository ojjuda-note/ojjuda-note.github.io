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

test('v12 rooms preserve all independent cushions while splitting only the visible attached blanket',()=>{
 for(const [direction,record]of Object.entries(fixture.views)){
  const cushions=Object.fromEntries(ids.filter(id=>!isBlanket(id)).map(id=>[id,normalizePlacement(id,sofaAccessoryFromSofa(id,record.sofa))]));
  for(const visible of [true,false]){
   const sofa={...record.sofa,accessories:Object.fromEntries(ids.map(id=>[id,id==='blanket-sofa'&&visible]))};
   const previous={version:12,rooms:[room({sofa,...cushions})],diary:'이미 배치한 쿠션을 보존해요.'};
   const next=normalize(previous),f=next.rooms[0].furniture;
   for(const [id,p]of Object.entries(cushions))assert.deepEqual(f[id],p,direction+'/'+id);
   assert.equal(!!f['blanket-sofa'],visible);assert.equal(next.diary,previous.diary);assert.deepEqual(normalize(next),next);
   const removed=normalize({...previous,rooms:[room({sofa,...cushions,'blanket-sofa':null})]});
   assert.equal(removed.rooms[0].furniture['blanket-sofa'],undefined,'explicit removal wins over an old enabled flag');
  }
 }
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
 const state=normalize({version:13,rooms:[room({sofa:{...sofa,accessories:Object.fromEntries(ids.map(id=>[id,true]))}})]});assert.deepEqual(Object.keys(state.rooms[0].furniture),['sofa']);assert.equal('accessories' in state.rooms[0].furniture.sofa,false);
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

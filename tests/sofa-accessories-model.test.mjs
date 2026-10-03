import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalize,normalizePlacement,findPlacement,canPlaceFurniture,canDrawFurniture,ROOM,FLOOR} from '../house-test/model.js';
import {FURNITURE,itemSize,SOFA_ACCESSORIES} from '../house-test/furniture-catalog.js';
import {sofaAccessoryFromSofa} from '../house-test/sofa-accessory-placement.js';
import {furnitureGeometry} from '../house-test/furniture.js';
const ids=SOFA_ACCESSORIES.map(item=>item.id),fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sofa-accessories-v11-geometry.json',import.meta.url)));
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const room=furniture=>({x:0,y:0,decor:true,curtains:false,shelf:null,furniture});

test('draped blanket rejects reversed faces without dropping any valid legacy sofa placement',()=>{
 for(const placement of [{direction:'left',x:7,y:4.5,elevation:0},{direction:'right',x:1,y:4.5,elevation:0}])assert.equal(canDrawFurniture('blanket-sofa',placement),false);
 let checked=0;
 for(const direction of ['left','center','right']){
  const {w,d}=itemSize('sofa',direction);
  for(let y=0;y<=FLOOR.depth-d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-w;x+=FLOOR.step){
   const sofa={direction,x,y};if(!canDrawFurniture('sofa',sofa))continue;
   const expected=sofaAccessoryFromSofa('blanket-sofa',sofa),restored=normalize({version:11,rooms:[room({sofa})]}).rooms[0].furniture;
   assert.deepEqual(restored['blanket-sofa'],expected);checked++;
  }
 }
 assert(checked>100);
});

test('empty rooms stay empty, new sofas are bare and accessories require explicit placement',()=>{
 for(const version of [9,10,11,12]){const next=normalize({version,diary:'보존할 기록',rooms:[room({})]});assert.equal(next.version,12);assert.equal(next.diary,'보존할 기록');assert.deepEqual(next.rooms[0].furniture,{});}
 assert.deepEqual(Object.keys(normalize({version:8,rooms:[room({})]}).rooms[0].furniture),['desk']);
 assert.deepEqual(Object.keys(normalize(null).rooms[0].furniture),['desk']);
 const sofa=findPlacement('sofa');assert.equal('accessories' in sofa,false);
 const state=normalize({version:12,rooms:[room({sofa:{...sofa,accessories:Object.fromEntries(ids.map(id=>[id,true]))}})]});assert.deepEqual(Object.keys(state.rooms[0].furniture),['sofa']);assert.equal('accessories' in state.rooms[0].furniture.sofa,false);
 for(const id of ids){assert.equal(FURNITURE[id].autoPlace,false);assert.equal(FURNITURE[id].layer,'surface');assert.equal(FURNITURE[id].picture,'sofa-accessory');assert(findPlacement(id));}
});

test('v11 migration preserves approved PNG coordinates and visible positions in every direction',()=>{
 for(const [direction,record]of Object.entries(fixture.views)){
  const state=normalize({version:11,rooms:[room({sofa:record.sofa})]}),furniture=state.rooms[0].furniture;
  assert.deepEqual(furniture.sofa,record.sofa);assert.equal(state.version,12);
  for(const id of ids){
   assert.deepEqual(furniture[id],sofaAccessoryFromSofa(id,record.sofa));
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

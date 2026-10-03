import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chairForDesk,isDeskChairPair,canPlaceGroup,findDeskChairPlacement,canPlaceFurniture,canDrawFurniture,normalizePlacement,normalize} from '../house-test/model.js?v=20261003-chairdesk1';
import {loadBuiltInItems} from '../house-test/custom-furniture.js?v=20261003-chairdesk1';
import {itemSize} from '../house-test/furniture-catalog.js?v=20261003-chairdesk1';

// Geometry tests use the real approved meshes. Image decoding alone is stubbed;
// painting and actual bitmap decoding remain covered by the built-in UI tests.
const previousImage=globalThis.Image,previousFetch=globalThis.fetch;
globalThis.Image=class{width=1;height=1;set src(value){queueMicrotask(()=>this.onload());}};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await fs.readFile(url,'utf8'))});
try{await loadBuiltInItems();}finally{globalThis.Image=previousImage;globalThis.fetch=previousFetch;}
const entries=pair=>[{id:'desk',...pair.desk},{id:'chair',...pair.chair}];
const saved=furniture=>({version:11,rooms:[{x:0,y:0,decor:true,curtains:false,shelf:null,furniture}],diary:'keep this diary'});
const preferred={direction:'right',x:9,y:3.5};

test('three directions reserve exactly half a floor cell in the desk knee space',()=>{
 const cases=[
  [{direction:'right',x:9,y:3.5},{direction:'left',x:8.3,y:4.825,attachedTo:'desk'}],
  [{direction:'left',x:2,y:3.5},{direction:'right',x:2.5,y:4.035,attachedTo:'desk'}],
  [{direction:'center',x:3.5,y:0},{direction:'center',x:4.765,y:.5,attachedTo:'desk'}]
 ];
 for(const [desk,expected]of cases){
  const chair=chairForDesk(desk),a=itemSize('desk',desk.direction),b=itemSize('chair',chair.direction);
  assert.deepEqual(chair,expected);assert.equal(isDeskChairPair(desk,chair),true);
  const axis=desk.direction==='center'?'y':'x',size=axis==='x'?'w':'d';
  const overlap=Math.min(desk[axis]+a[size],chair[axis]+b[size])-Math.max(desk[axis],chair[axis]);
  assert.ok(Math.abs(overlap-.5)<1e-9,'insertion depth is half a floor cell, independent of picture pixels');
  assert.deepEqual(normalizePlacement('chair',chair),chair,'attached offsets must not snap to half-cell grid');
  assert.equal(canPlaceGroup(entries({desk,chair})),true,'real registered meshes remain drawable');
 }
 assert.equal(chairForDesk({direction:'back',x:0,y:0}),null);
 assert.equal(chairForDesk({direction:'right',x:Infinity,y:0}),null);
 assert.equal(normalizePlacement('chair',{direction:'left',x:8.3,y:4.825}).x,8.5,'standalone furniture retains normal grid snapping');
});

test('only the exact linked pair may overlap and it still collides with other standing furniture',()=>{
 const pair={desk:preferred,chair:chairForDesk(preferred)},[desk,chair]=entries(pair);
 assert.equal(canPlaceFurniture('chair',pair.chair,[]),false,'no orphan attached child');
 assert.equal(canPlaceFurniture('chair',{...pair.chair,x:8.300001},[desk]),false,'no arbitrary off-grid overlap');
 assert.equal(canPlaceFurniture('chair',{...pair.chair,attachedTo:'sofa'},[desk]),false);
 assert.equal(canPlaceFurniture('chair',{...pair.chair,attachedTo:undefined},[desk]),false);
 assert.equal(canPlaceFurniture('desk',{...pair.desk,x:8.5},[chair]),false,'parent cannot leave its linked child behind');
 assert.equal(canPlaceGroup(entries(pair),[{id:'bookshelf',direction:'right',x:7.5,y:4.5}]),false,'child reservation participates in group collision checks');
 assert.equal(canPlaceGroup(entries(pair),[{id:'blanket-floor',direction:'center',x:8,y:4.5}]),true,'floor decor remains allowed beneath both members');
 assert.equal(canPlaceGroup([desk,desk]),false);assert.equal(canPlaceGroup(entries(pair),[desk]),false);
 const outside={direction:'right',x:.5,y:3.5};
 assert.equal(canPlaceGroup(entries({desk:outside,chair:chairForDesk(outside)})),false,'both members must remain within the room');
});

test('nearest placement preserves the chosen direction and the native folding guard',()=>{
 const pair=findDeskChairPlacement([],preferred);assert.deepEqual(pair,{desk:preferred,chair:chairForDesk(preferred)});
 const left={direction:'left',x:0,y:3.5};assert.equal(canDrawFurniture('chair',chairForDesk(left)),false,'left-wall pose really folds the approved right-view mesh');
 const moved=findDeskChairPlacement([],left);assert.deepEqual(moved.desk,{direction:'left',x:2,y:3.5});assert.equal(canPlaceGroup(entries(moved)),true);
 const blockers=[];for(let y=0;y<=5;y++)for(let x=0;x<=9;x++)blockers.push({id:'bookshelf',direction:'right',x,y});
 assert.equal(findDeskChairPlacement(blockers,preferred),null,'full rooms return no placement instead of bypassing collisions');
});

test('saved links derive from the restored parent while standalone and absent chairs stay unchanged',()=>{
 const plain=saved({desk:preferred,chair:{direction:'left',x:7.5,y:4.5}});
 assert.deepEqual(normalize(plain),plain,'loading an existing separate chair does not opt into linking');
 const noChair=saved({desk:preferred});assert.deepEqual(normalize(noChair),noChair,'loading a desk does not create a child');
 const desk={direction:'right',x:8.5,y:3.5},expected=saved({desk,chair:chairForDesk(desk)});
 const stale=saved({chair:{direction:'right',x:0,y:0,attachedTo:'desk'},desk});
 assert.deepEqual(normalize(stale),expected,'parent is restored first and determines all child coordinates');
 assert.deepEqual(normalize(normalize(stale)),expected,'round-trip normalization preserves the fractional child pose');
 assert.deepEqual(normalize(saved({chair:chairForDesk(preferred)})).rooms[0].furniture,{},'missing parents do not produce orphan children');
 const foldedDesk={direction:'left',x:0,y:3.5};
 assert.deepEqual(normalize(saved({desk:foldedDesk,chair:chairForDesk(foldedDesk)})).rooms[0].furniture,{desk:foldedDesk},'an undrawable child is discarded without moving a stored desk');
 const legacy={...saved({chair:{direction:'left',x:7.5,y:4.5}}),version:7};
 assert.equal(normalize(legacy).rooms[0].furniture.chair,undefined,'retired v7 chairs remain retired');
});

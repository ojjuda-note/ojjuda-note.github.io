import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,normalizePlacement,normalizeAccessories,findPlacement,canPlaceFurniture,canDrawFurniture} from '../house-test/model.js?v=20261006-assembly1';
import {FURNITURE,SOFA_ACCESSORIES} from '../house-test/furniture-catalog.js?v=20261006-assembly1';

test('existing rooms and deliberately empty rooms receive no new furniture',()=>{
 const old={version:9,diary:'보존할 기록',rooms:[{x:0,y:0,decor:true,curtains:false,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5}}},{x:1,y:0,decor:false,curtains:false,shelf:null,furniture:{}}]};
 const next=normalize(old);assert.equal(next.version,13);assert.equal(next.diary,old.diary);
 for(let i=0;i<old.rooms.length;i++){assert.deepEqual(next.rooms[i].furniture,old.rooms[i].furniture);assert.deepEqual(next.rooms[i].shelf,old.rooms[i].shelf);assert.equal(next.rooms[i].curtains,false);}
 for(const version of [9,10,11]){const empty=normalize({version,rooms:[{x:0,y:0,shelf:null,furniture:{},curtains:false}]});assert.deepEqual(empty.rooms[0].furniture,{});assert.equal(empty.rooms[0].shelf,null);}
 assert.deepEqual(Object.keys(normalize({version:8,rooms:[{x:0,y:0,shelf:null,furniture:{}}]}).rooms[0].furniture),['desk']);
 assert.deepEqual(Object.keys(normalize(null).rooms[0].furniture),['desk']);assert.equal(FURNITURE.chair.autoPlace,false,'approved chair is available without adding it to existing or new rooms');
});

test('v12 attached blanket visibility migrates once and stays independent of its sofa',()=>{
 const sofa=findPlacement('sofa');assert.equal('accessories' in sofa,false);
 const room=furniture=>({x:0,y:0,shelf:null,furniture,curtains:false});
 const hidden=normalize({version:12,rooms:[room({sofa:{...sofa,accessories:{'blanket-sofa':false}}})]});
 assert.equal(hidden.rooms[0].furniture['blanket-sofa'],undefined);
 const saved=normalize({version:12,rooms:[room({sofa:{...sofa,accessories:{'blanket-sofa':true}}})]});
 const blanket=saved.rooms[0].furniture['blanket-sofa'];assert.equal(blanket.mode,'sofa');
 assert(SOFA_ACCESSORIES.filter(v=>v.id!=='blanket-sofa').every(v=>saved.rooms[0].furniture[v.id]===undefined),'v12 cushions are never regenerated');
 delete saved.rooms[0].furniture.sofa;assert.deepEqual(normalize(saved).rooms[0].furniture['blanket-sofa'],blanket);
 delete saved.rooms[0].furniture['blanket-sofa'];assert.equal(normalize(saved).rooms[0].furniture['blanket-sofa'],undefined);
 const none=Object.fromEntries(SOFA_ACCESSORIES.map(v=>[v.id,false]));assert.deepEqual(normalizeAccessories(none),none);
});

test('floor blanket may sit below standing furniture; sofa still respects collision and drawable poses',()=>{
 const sofa=findPlacement('sofa'),floor=normalizePlacement('blanket-floor',{direction:'center',x:0,y:3});
 assert.equal(FURNITURE['blanket-floor'].layer,'floor');assert.ok(canPlaceFurniture('blanket-floor',floor,[{id:'sofa',...sofa}]));assert.ok(canPlaceFurniture('sofa',sofa,[{id:'blanket-floor',...floor}]));
 const right=normalizePlacement('sofa',{direction:'right',x:8.5,y:3});assert.ok(canDrawFurniture('sofa',right));assert.equal(canPlaceFurniture('sofa',right,[{id:'desk',direction:'right',x:9,y:3.5}]),false);
 assert.equal(canDrawFurniture('sofa',normalizePlacement('sofa',{...sofa,x:7,y:3})),false);
 const saved=normalize({version:11,rooms:[{x:0,y:0,shelf:null,furniture:{sofa,'blanket-floor':floor},curtains:false}]});assert.deepEqual(saved.rooms[0].furniture['blanket-floor'],floor);assert.deepEqual(saved.rooms[0].furniture.sofa,sofa);
});

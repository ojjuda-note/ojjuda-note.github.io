import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,copy,draw,move,visibleWasteCount,validateState,restoreWastePackets} from '../engine.js';
const c=(suit,rank,up=false)=>({id:`${suit}-${rank}`,suit,rank,up});
const fixture=()=>({stock:[c('clubs',1),c('hearts',1),c('spades',1),c('clubs',7),c('hearts',6),c('spades',5)],waste:[],wastePackets:[],tableau:[[],[],[],[],[],[],[]],foundations:[[],[],[],[]],drawCount:3,moves:0,score:0});
const use=(s,col)=>assert.ok(move(s,{type:'waste',col:0,index:s.waste.length-1},{type:'foundation',col}));
test('using a three-card fan leaves two then one, without filling from older cards',()=>{
 const s=fixture();draw(s);draw(s);assert.equal(visibleWasteCount(s),3);
 use(s,2);assert.equal(visibleWasteCount(s),2);assert.deepEqual(s.wastePackets,[3,2]);
 use(s,1);assert.equal(visibleWasteCount(s),1);assert.deepEqual(s.wastePackets,[3,1]);
 use(s,0);assert.equal(visibleWasteCount(s),3);assert.deepEqual(s.waste.map(c=>c.rank),[5,6,7]);
});
test('an earlier partial fan returns with its exact remaining count',()=>{
 const s=fixture();s.stock=[c('diamonds',1),c('clubs',2),c('hearts',2),c('clubs',1),c('spades',5),c('hearts',6)];s.foundations[1]=[c('hearts',1,true)];
 draw(s);use(s,2);assert.equal(visibleWasteCount(s),2);draw(s);assert.equal(visibleWasteCount(s),3);
 const saved=copy(s);use(s,3);assert.equal(visibleWasteCount(s),2);
 assert.equal(visibleWasteCount(saved),3);assert.deepEqual(saved.wastePackets,[2,3]);
 use(s,2);use(s,1);assert.equal(visibleWasteCount(s),2);assert.deepEqual(s.wastePackets,[2]);
});
test('a short last draw and recycle maintain packet boundaries',()=>{
 const s=fixture();s.stock=s.stock.slice(0,4);draw(s);draw(s);
 assert.deepEqual(s.wastePackets,[3,1]);assert.equal(visibleWasteCount(s),1);
 draw(s);assert.equal(visibleWasteCount(s),0);assert.deepEqual(s.wastePackets,[]);
 draw(s);assert.equal(visibleWasteCount(s),3);
});
test('using the only fan leaves zero visible cards',()=>{
 const s=fixture();s.stock=s.stock.slice(0,3);draw(s);
 use(s,2);use(s,1);use(s,0);assert.equal(visibleWasteCount(s),0);assert.deepEqual(s.wastePackets,[]);
});
test('save, reload, and undo preserve a partly used packet',()=>{
 const s=fixture();draw(s);draw(s);use(s,2);const before=copy(s);
 use(s,1);assert.equal(visibleWasteCount(s),1);
 const reloaded=JSON.parse(JSON.stringify(before));assert.equal(visibleWasteCount(reloaded),2);
});
test('legacy history recovers a full fan after an earlier partly used fan',()=>{
 const s=fixture();s.stock=[c('diamonds',1),c('clubs',2),c('hearts',2),c('clubs',1),c('spades',5),c('hearts',6)];
 const snapshots=[copy(s)];draw(s);snapshots.push(copy(s));use(s,2);snapshots.push(copy(s));draw(s);snapshots.push(copy(s));
 for(const item of snapshots)delete item.wastePackets;
 restoreWastePackets(snapshots);
 assert.deepEqual(snapshots.at(-1).wastePackets,[2,3]);assert.equal(visibleWasteCount(snapshots.at(-1)),3);
});
test('invalid packet metadata is rejected while old saves remain readable',()=>{
 const s=createGame(3);draw(s);assert.ok(validateState(s));
 s.wastePackets=[2];assert.equal(validateState(s),false);
 delete s.wastePackets;assert.ok(validateState(s));restoreWastePackets([s]);assert.ok(validateState(s));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {gestureSource} from '../gestures.js';
import {move,canMove,draw,createGame} from '../engine.js';
const card=(suit,rank,up=true)=>({id:`${suit}-${rank}`,suit,rank,up});
const fixture=()=>({tableau:[[card('clubs',8,false),card('spades',13),card('hearts',12),card('clubs',11)],[card('diamonds',12)],[],[],[],[],[]],foundations:[[],[],[],[]],waste:[],stock:[],moves:0,score:0,drawCount:1});
test('a quick gesture moves only the top card even when touching an exposed lower card',()=>{
  const s=fixture(),source=gestureSource(s,{type:'tableau',col:0,index:1});
  assert.equal(source.index,3);assert.ok(move(s,source,{type:'tableau',col:1}));assert.equal(s.tableau[0].length,3);assert.equal(s.tableau[1].length,2);
});
test('holding the top card selects its entire ordered face-up run',()=>{
  const s=fixture(),source=gestureSource(s,{type:'tableau',col:0,index:3},true);
  assert.equal(source.index,1);assert.ok(move(s,source,{type:'tableau',col:2}));assert.equal(s.tableau[2].length,3);assert.equal(s.tableau[0][0].up,true);
});
test('holding a middle card can select a smaller ordered run',()=>{
  assert.equal(gestureSource(fixture(),{type:'tableau',col:0,index:2},true).index,2);
});
test('waste and foundation gestures always select one card',()=>{
  const s=fixture();s.waste=[card('clubs',4),card('hearts',3)];assert.equal(gestureSource(s,{type:'waste',col:0,index:0},true).index,1);
});
test('auto mission move is legal only for the next rank in the same suit',()=>{
  const s=fixture();s.tableau[3]=[card('hearts',1)];const source=gestureSource(s,{type:'tableau',col:3,index:0});
  assert.equal(canMove(s,source,{type:'foundation',col:0}),false);assert.ok(move(s,source,{type:'foundation',col:1}));
  s.tableau[3]=[card('hearts',3)];assert.equal(canMove(s,source,{type:'foundation',col:1}),false);
});
test('beginner reveals one card and normal reveals three cards per stock action',()=>{
  for(const mode of [1,3]){const s=createGame(mode);draw(s);assert.equal(s.waste.length,mode);assert.equal(s.stock.length,24-mode);}
});

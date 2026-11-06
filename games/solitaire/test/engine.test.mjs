import test from 'node:test';
import assert from 'node:assert/strict';
import {SUITS,createGame,copy,canMove,move,draw,legalMoves,canFinish,isWon,validateState} from '../engine.js';
const card=(suit,rank,up=true)=>({id:`${suit}-${rank}`,suit,rank,up});
const empty=()=>({stock:[],waste:[],tableau:[[],[],[],[],[],[],[]],foundations:[[],[],[],[]],drawCount:1,moves:0,score:0});
const src=(col,index=0)=>({type:'tableau',col,index});
const dest=col=>({type:'tableau',col});
function random(seed){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
test('deal distributes all 52 cards with seven face-up cards and 24 in stock',()=>{
  const s=createGame(1,random(7));assert.equal(s.stock.length,24);assert.deepEqual(s.tableau.map(p=>p.length),[1,2,3,4,5,6,7]);assert.equal(s.tableau.flat().filter(c=>c.up).length,7);assert.ok(validateState(s));
});
test('tableau requires descending alternating colors, empty columns require kings',()=>{
  const s=empty();s.tableau[0]=[card('hearts',7),card('clubs',6)];s.tableau[1]=[card('spades',8)];s.tableau[2]=[card('diamonds',8)];
  assert.equal(canMove(s,src(0),dest(1)),true);assert.equal(canMove(s,src(0),dest(2)),false);assert.equal(canMove(s,src(0),dest(3)),false);
  s.tableau[3]=[card('spades',13),card('hearts',12)];assert.ok(canMove(s,src(3),dest(4)));s.tableau[3][1].up=false;assert.equal(canMove(s,src(3),dest(4)),false);
});
test('moving a stack flips its covered card and counts one move',()=>{
  const s=empty();s.tableau[0]=[card('clubs',4,false),card('hearts',7),card('clubs',6)];s.tableau[1]=[card('spades',8)];
  assert.ok(move(s,src(0,1),dest(1)));assert.equal(s.tableau[0][0].up,true);assert.equal(s.tableau[1].length,3);assert.equal(s.moves,1);assert.equal(s.score,5);
});
test('foundation accepts only matching suit in ascending order, permits moving back',()=>{
  const s=empty();s.waste=[card('hearts',1)];const w={type:'waste',col:0,index:0};
  assert.equal(canMove(s,w,{type:'foundation',col:0}),false);assert.ok(move(s,w,{type:'foundation',col:1}));assert.equal(s.score,10);
  s.tableau[0]=[card('clubs',2)];assert.ok(move(s,{type:'foundation',col:1,index:0},dest(0)));assert.equal(s.score,0);
});
test('draw three exposes only last card, recycling preserves draw order',()=>{
  const s=empty();s.drawCount=3;s.stock=[card('clubs',4,false),card('clubs',3,false),card('clubs',2,false),card('clubs',1,false)];
  draw(s);assert.deepEqual(s.waste.map(c=>c.rank),[1,2,3]);assert.equal(canMove(s,{type:'waste',col:0,index:0},{type:'foundation',col:2}),false);draw(s);assert.equal(s.waste.at(-1).rank,4);draw(s);assert.deepEqual(s.stock.map(c=>c.rank),[4,3,2,1]);draw(s);assert.deepEqual(s.waste.map(c=>c.rank),[1,2,3]);
});
test('snapshots restore the exact state after draw and card movement',()=>{
  const s=createGame(3,random(1)),before=copy(s);draw(s);assert.notDeepEqual(s,before);assert.ok(validateState(before));assert.equal(before.moves,0);
});
test('auto-finish eligibility and winning layout',()=>{
  const s=empty();SUITS.forEach((suit,i)=>{s.foundations[i]=Array.from({length:12},(_,j)=>card(suit,j+1));s.tableau[i]=[card(suit,13)];});
  assert.ok(validateState(s));assert.ok(canFinish(s));for(const col of [0,1,2,3])assert.ok(move(s,src(col),{type:'foundation',col}));assert.ok(isWon(s));assert.equal(canFinish(s),false);assert.ok(validateState(s));
});
test('invalid saved games are rejected',()=>{
  const s=createGame();s.stock[0]=copy(s.stock[1]);assert.equal(validateState(s),false);assert.equal(validateState({stock:[]}),false);const t=createGame();t.stock[0].up=true;assert.equal(validateState(t),false);
});
test('random play keeps all cards and valid piles across one- and three-card modes',()=>{
  for(let seed=1;seed<=30;seed++){
    const rng=random(seed),s=createGame(seed%2?1:3,rng);
    for(let i=0;i<300;i++){const moves=legalMoves(s);if(moves.length&&rng()>.25){const m=moves[Math.floor(rng()*moves.length)];assert.ok(move(s,m.source,m.target));}else draw(s);assert.ok(validateState(s),`seed ${seed} move ${i}`);}
  }
});

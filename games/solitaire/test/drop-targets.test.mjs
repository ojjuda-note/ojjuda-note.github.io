import test from 'node:test';
import assert from 'node:assert/strict';
import {overlappingTarget} from '../drop-targets.js';
import {canMove} from '../engine.js';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height});
const target=(id,r)=>({id,rect:r});
test('card edge overlap accepts a destination even with the finger outside it',()=>{
  const destination=target('next',rect(100,100,50,70));
  const dragged=rect(60,105,50,140); // A finger at x=70 does not enter the destination.
  assert.equal(overlappingTarget(dragged,[destination]),destination);
});
test('the lower card in a stack can touch the destination',()=>{
  const destination=target('next',rect(100,230,50,70));
  assert.equal(overlappingTarget(rect(90,100,50,150),[destination]),destination);
});
test('touching an edge counts but a gap does not',()=>{
  const destination=target('next',rect(100,100,50,70));
  assert.equal(overlappingTarget(rect(50,100,50,70),[destination]),destination);
  assert.equal(overlappingTarget(rect(49,100,50,70),[destination]),null);
});
test('overlapping several destinations chooses the greatest contact area',()=>{
  const a=target('a',rect(50,100,50,70)),b=target('b',rect(110,100,50,70));
  assert.equal(overlappingTarget(rect(90,100,50,70),[a,b]),b);
});
test('only legal moves enter collision detection',()=>{
  const c=(suit,rank)=>({suit,rank,up:true});
  const state={tableau:[[c('hearts',12),c('clubs',11)],[c('spades',13)],[c('diamonds',13)]],foundations:[[],[],[],[]]};
  const candidates=[1,2].map(col=>({target:{type:'tableau',col},rect:rect(100,100,50,70)}));
  const legal=candidates.filter(c=>canMove(state,{type:'tableau',col:0,index:0},c.target));
  assert.equal(overlappingTarget(rect(90,100,50,150),legal)?.target.col,1);
});
test('zoomed and scrolled viewport coordinates preserve overlap',()=>{
  const destination=target('next',rect(220,40,125,175));
  assert.equal(overlappingTarget(rect(110,-70,125,350),[destination]),destination);
});

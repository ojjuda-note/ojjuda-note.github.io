import test from 'node:test';
import assert from 'node:assert/strict';
import {createSolo,advanceSolo,soloNeedsMove,soloOptions,automaticOnline,visibleState} from '../games/bang/online-engine.js';
const rng=s=>()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
test('ranked solo accepts only supported setup options',()=>{
 const options={count:5,role:'sheriff',character:'bart'};
 assert.deepEqual(soloOptions({...options,winner:'sheriff'}),options);
 for(const bad of [{count:3},{count:'5'},{role:'deputy'},{character:'unknown'}])assert.throws(()=>soloOptions({...options,...bad}),/invalid_options/);
});
test('server bots stop at human choices, including responses, and finish all table sizes',()=>{
 for(let seed=1;seed<=16;seed++){
  const random=rng(seed);let state=createSolo('테스터','run',{count:4+seed%4,role:seed%2?'random':'sheriff',character:'random'},random);
  for(let step=0;step<1500&&!state.winner;step++){
   if(soloNeedsMove(state))state=advanceSolo(state,random);
   else{
    const before=structuredClone(state);assert.deepEqual(advanceSolo(state,random),before);
    assert.equal(state.pending?.player??state.current,0);
    // The human's decisions are simulated only in this isolated engine test.
    state=automaticOnline(state,random);
   }
  }
  assert.ok(state.winner);assert.equal(state.players.length,4+seed%4);
  assert.equal(state.players[0].name,'테스터');
 }
});
test('solo views hide bot hands and roles as well as the shuffled deck',()=>{
 const state=createSolo('나','run',{count:7,role:'sheriff',character:'bart'},rng(14)),view=visibleState(state,0);
 assert.deepEqual(view.players[0].hand,state.players[0].hand);
 assert.ok(view.players.slice(1).every(p=>p.hand.every(c=>c.hidden)&&p.role==='unknown'));
 assert.ok(view.deck.every(c=>c.hidden));
});

import assert from 'node:assert/strict';
import * as browser from '../games/matgo-engine.mjs';
import * as server from '../supabase/functions/matgo/engine.mjs';
import {tripleScenarios,setupTripleScenario} from './matgo-triple-fixtures.mjs';

for(const engine of [browser,server])for(const p of [0,1])for(const scenario of tripleScenarios){
  const events=[];
  const g=new engine.Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[0]});
  const {card,bomb}=setupTripleScenario(g,engine.CARDS,scenario,p);
  await g.play(p,card,bomb);
  assert.ok(events.some(e=>e.type===scenario.event),scenario.id);
  assert.deepEqual(events.filter(e=>e.type==='steal').map(e=>e.card.id),[49],scenario.id);
  assert.equal(engine.score(g.caps[1-p]).pv,0);
  assert.ok(g.caps[p].some(c=>c.id===49&&engine.piVal(c)===3));
  const cards=[...g.hand.flat(),...g.caps.flat(),...g.floor.flat(),...g.deck];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
}
console.log('PASS: whole triple-pi transfer for self/opponent ppuk by hand/flip, jjok, ttadak, sweep and bomb, both seats and both engines');

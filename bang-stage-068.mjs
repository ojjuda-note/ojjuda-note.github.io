import test from 'node:test';
import assert from 'node:assert/strict';
import {Tutorial,STEPS} from '../games/bang/tutorial.js';

function advance(t){const {action,value}=t.expected();assert.ok(t.act(action,value),`step ${t.step}: ${action}`);}
function allCards(t){const s=t.game.s;return [...s.deck,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.equipment])];}

test('guided practice completes every action through the real rules',()=>{
 const t=new Tutorial(),g=t.game;
 assert.equal(g.p(0).hand.length,7);assert.equal(g.p(0).hp,5);
 for(let i=0;i<STEPS.length-1;i++){
  assert.equal(t.step,i);advance(t);
  const cards=allCards(t);assert.equal(cards.length,80);assert.equal(new Set(cards.map(c=>c.id)).size,80);
  if(t.step===4){assert.equal(g.p(1).hp,3);assert.equal(g.s.bangs,1);assert.equal(g.p(0).hand.length,6);}
  if(t.step===6){assert.equal(g.s.phase,'discard');assert.equal(g.p(0).hp,5);}
  if(t.step===8){assert.equal(g.s.pending.kind,'defend');assert.equal(g.s.pending.player,0);assert.equal(g.p(0).hand.length,5);}
  if(t.step===9){assert.equal(g.p(0).hp,5);assert.equal(g.s.pending,null);}
  if(t.step===11){assert.equal(g.p(0).hp,4);assert.equal(g.s.pending,null);}
  if(t.step===12){assert.equal(g.s.current,0);assert.equal(g.s.turn,5);assert.equal(g.p(0).hand.length,6);assert.equal(g.s.bangs,0);}
  if(t.step===14){assert.equal(g.p(0).hp,5);}
  if(t.step===17){assert.equal(g.range(0),2);assert.equal(g.distance(0,2),2);}
 }
 assert.ok(t.done);assert.equal(g.p(2).hp,3);assert.equal(g.s.winner,null);assert.equal(g.s.phase,'play');
});

test('unrelated clicks cannot skip instructions, spend cards or advance the engine',()=>{
 const t=new Tutorial(),before=JSON.stringify(t.game.s);
 assert.equal(t.act('end'),false);assert.equal(t.act('card',t.cards.bang),false);assert.equal(JSON.stringify(t.game.s),before);
 advance(t);assert.equal(t.step,1);
 assert.equal(t.act('card',t.cards.beer),false);assert.equal(t.step,1);
 assert.ok(t.act('card',String(t.cards.bang)));assert.equal(t.step,2);
});

test('practice sessions restart deterministically and do not share game state',()=>{
 const a=new Tutorial(),b=new Tutorial();assert.deepEqual(a.game.s,b.game.s);
 for(let i=0;i<4;i++)advance(a);
 assert.equal(a.game.p(1).hp,3);assert.equal(b.game.p(1).hp,4);assert.equal(b.step,0);
});

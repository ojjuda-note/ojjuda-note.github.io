import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../games/bang/engine.js';
import {makeDeck} from '../games/bang/data.js';
import {recommend} from '../games/bang/hints.js';
import {visibleState,createOnline,automaticOnline,moveOnline} from '../games/bang/online-engine.js';

const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function fixture(types=['bang','missed'],seat=0){
 const g=new Game(null,rng(3));g.create({count:4});
 Object.assign(g.s,{current:seat,phase:'play',pending:null,queue:[],bangs:0,winner:null,deck:makeDeck(),discard:[]});
 g.s.players.forEach((p,i)=>Object.assign(p,{char:'bart',role:['sheriff','outlaw','renegade','outlaw'][i],hp:4,maxHp:4,hand:[],equipment:[],alive:true,suspicion:0}));
 for(const type of types){const i=g.s.deck.findIndex(c=>c.type===type);g.p(seat).hand.push(g.s.deck.splice(i,1)[0]);}
 return g;
}
const typeOf=(g,h)=>g.p(g.s.current).hand.find(c=>c.id===h.cardId)?.type;
test('urgent healing beats drawing and attacking; advice never mutates the game',()=>{
 const g=fixture(['bang','beer','wells']);g.p(0).hp=1;
 const before=structuredClone(g.s),h=recommend(g.s);
 assert.equal(typeOf(g,h),'beer');assert.match(h.reason,/生명|생명/);assert.deepEqual(g.s,before);
});
test('drawing, equipment upgrades and range-aware attacks are useful in order',()=>{
 const g=fixture(['bang','wells','barrel','remington']);
 assert.equal(typeOf(g,recommend(g.s)),'wells');
 g.p(0).hand=g.p(0).hand.filter(c=>c.type!=='wells');assert.equal(typeOf(g,recommend(g.s)),'barrel');
 g.p(0).hand=g.p(0).hand.filter(c=>c.type!=='barrel');assert.equal(typeOf(g,recommend(g.s)),'remington');
 g.p(0).hand=g.p(0).hand.filter(c=>c.type==='bang');g.p(2).suspicion=99;
 assert.notEqual(recommend(g.s).targetId,2,'a distant target is not recommended without range');
});
test('last defense, unusable beer and dangerous dynamite are handled sensibly',()=>{
 const g=fixture(['beer','dynamite','missed']);g.p(2).alive=false;g.p(3).alive=false;g.s.phase='discard';
 assert.equal(typeOf(g,recommend(g.s)),'beer');
 g.p(0).hand=g.p(0).hand.filter(c=>c.type!=='beer');assert.equal(typeOf(g,recommend(g.s)),'dynamite');
 g.s.phase='play';assert.equal(recommend(g.s).action,'end');
});
test('protect the sheriff as deputy or renegade until the final duel',()=>{
 for(const role of ['deputy','renegade']){
  const g=fixture(['bang','duel','gatling','indians'],1);g.p(1).role=role;g.p(0).hp=1;
  const h=recommend(g.s,1);assert.notEqual(h.targetId,0);assert.ok(!['gatling','indians'].includes(typeOf(g,h)));
 }
 const g=fixture(['bang'],1);g.p(1).role='renegade';g.p(2).alive=g.p(3).alive=false;
 assert.equal(recommend(g.s,1).targetId,0);
});
test('outlaws target the public sheriff and hidden targets remain explicitly uncertain',()=>{
 const g=fixture(['bang'],1);assert.equal(recommend(g.s,1).targetId,0);
 const s=fixture(['bang']);assert.match(recommend(s.s).reason,/미공개|추측/);
});
test('cannot recommend a second bang, downgrade or unsupported duel',()=>{
 const g=fixture(['bang','duel','schofield']);g.s.bangs=1;g.p(0).hp=1;
 g.p(0).equipment=[makeDeck().find(c=>c.type==='winchester')];
 g.s.players.slice(1).forEach(p=>{p.hand=[{hidden:true},{hidden:true}];});
 assert.equal(recommend(g.s).action,'end');
});
test('Janet can attack with missed and defend with bang',()=>{
 const g=fixture(['missed']);g.p(0).char='janet';assert.equal(recommend(g.s).action,'play');
 g.p(0).hand=[makeDeck().find(c=>c.type==='bang')];g.s.pending={kind:'defend',player:0,required:'missed',need:1,source:1};
 assert.equal(recommend(g.s).action,'respond');
});
test('defense accounts for required cards and supports any online seat',()=>{
 const g=fixture(['missed'],2);g.s.pending={kind:'defend',player:2,required:'missed',need:1,source:1};
 assert.equal(recommend(g.s,2).action,'respond');
 g.s.pending.need=2;assert.equal(recommend(g.s,2).action,'take');
 assert.equal(recommend(g.s,0).action,'wait');
});
test('dying players receive beer, Sid recovery or honest no-recovery advice',()=>{
 const g=fixture(['beer','missed']);g.p(0).hp=0;g.s.pending={kind:'dying',player:0};
 assert.equal(recommend(g.s).action,'saveBeer');
 g.p(2).alive=g.p(3).alive=false;assert.equal(recommend(g.s).action,'giveup');
 g.p(0).char='sid';const h=recommend(g.s);assert.equal(h.action,'sid');assert.equal(h.cardIds.length,2);
});
test('store, Kit, draw choices and stealing use only visible choices',()=>{
 const g=fixture(),cards=['dynamite','wells','missed'].map(type=>g.s.deck.find(c=>c.type===type));
 g.s.pending={kind:'kit',player:0,cards};assert.equal(recommend(g.s).cardId,cards[0].id);
 g.s.pending.kind='store';assert.equal(recommend(g.s).cardId,cards[1].id);
 g.s.pending={kind:'drawChoice',player:0,ability:'pedro'};g.s.discard=[cards[1]];
 assert.equal(recommend(g.s).action,'drawDiscard');g.s.discard=[];assert.equal(recommend(g.s).action,'drawDeck');
 g.s.pending={kind:'steal',player:0,target:1,steal:true};g.p(1).equipment=[cards[0]];g.p(1).hand=[{hidden:true}];
 assert.equal(recommend(g.s).action,'stealHand');
 const barrel=makeDeck().find(c=>c.type==='barrel');g.p(1).equipment.push(barrel);assert.equal(recommend(g.s).cardId,barrel.id);
});
test('secret roles, opponent hand contents and deck order cannot influence advice',()=>{
 const g=fixture(['bang','duel','cat','wells']);
 const original=recommend(g.s),redacted=recommend(visibleState(g.s,0));assert.deepEqual(original,redacted);
 for(const p of g.s.players.slice(1)){p.role=p.role==='outlaw'?'deputy':'outlaw';p.hand=[...p.hand].reverse();}
 g.s.deck.reverse();g.s.queue=[{type:'unknown'}];
 assert.deepEqual(recommend(g.s),original);
});
test('advice remains legal and private throughout complete 4–7 seat games',()=>{
 const choices={respond:'card',take:'take',choose:'choose',saveBeer:'beer',giveup:'giveup',drawDeck:'deck',drawDiscard:'discard',drawSteal:'steal',stealHand:'hand',stealEquip:'equipment'};
 for(let seed=1;seed<=8;seed++){
  const random=rng(seed);let s=createOnline(Array.from({length:4+seed%4},(_,i)=>'P'+i),'test',random);
  for(let step=0;step<2400&&!s.winner;step++){
   const actor=s.pending?.player??s.current,before=structuredClone(s),h=recommend(s,actor);
   assert.deepEqual(recommend(visibleState(s,actor),actor),h);assert.deepEqual(s,before);
   if(h&&h.action!=='wait'){
    const move=h.action==='play'?{type:'play',card:h.cardId,target:h.targetId}:h.action==='end'?{type:'end'}:h.action==='discard'?{type:'discard',card:h.cardId}:h.action==='sid'?{type:'heal',cards:h.cardIds}:{type:'choose',action:choices[h.action],value:h.action==='drawSteal'?h.targetId:h.cardId};
    assert.doesNotThrow(()=>moveOnline(s,actor,move,random),JSON.stringify(h));
   }
   s=automaticOnline(s,random);
  }
  assert.ok(s.winner);
 }
});

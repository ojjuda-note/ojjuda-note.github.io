import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../games/bang/engine.js';
import {makeDeck} from '../games/bang/data.js';

function fixture(count=5){
 const g=new Game(null,()=>.3);g.create({count});
 Object.assign(g.s,{deck:makeDeck(),discard:[],pending:null,queue:[],current:0,phase:'play',bangs:0,winner:null,store:null});
 g.s.players.forEach((p,i)=>Object.assign(p,{role:['sheriff','deputy','outlaw','renegade','outlaw','outlaw','deputy'][i],char:'bart',hand:[],equipment:[],hp:i===0?5:4,maxHp:i===0?5:4,alive:true}));return g;
}
function give(g,id,type,equip=false){const i=g.s.deck.findIndex(c=>c.type===type);assert.ok(i>=0,type);const c=g.s.deck.splice(i,1)[0];g.p(id)[equip?'equipment':'hand'].push(c);return c;}
function top(g,predicate){const i=g.s.deck.findIndex(predicate);assert.ok(i>=0);g.s.deck.push(g.s.deck.splice(i,1)[0]);}
function total(g){const s=g.s;return [...s.deck,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.equipment]),...(s.store?.cards||[]),...(s.pending?.kind==='kit'?s.pending.cards:[])];}

test('base deck has exactly 80 unique cards, 25 Bang and 12 Missed',()=>{
 const d=makeDeck();assert.equal(d.length,80);assert.equal(new Set(d.map(c=>c.id)).size,80);assert.equal(d.filter(c=>c.type==='bang').length,25);assert.equal(d.filter(c=>c.type==='missed').length,12);
});
test('distance follows living seats and stacks Mustang, Scope and characters',()=>{
 const g=fixture();assert.equal(g.distance(0,2),2);give(g,2,'mustang',true);assert.equal(g.distance(0,2),3);g.p(2).char='paul';assert.equal(g.distance(0,2),4);give(g,0,'scope',true);g.p(0).char='rose';assert.equal(g.distance(0,2),2);g.p(1).alive=false;assert.equal(g.distance(0,2),1);give(g,0,'winchester',true);assert.equal(g.distance(0,2),1);
});
test('one Bang per turn, with Willy, Volcanic and Janet exceptions',()=>{
 const g=fixture(),a=give(g,0,'bang'),b=give(g,0,'bang');assert.ok(g.play(0,a.id,1));g.choose('take');assert.match(g.canPlay(0,b),/이미/);g.p(0).char='willy';assert.equal(g.canPlay(0,b),'');g.p(0).char='bart';give(g,0,'volcanic',true);assert.equal(g.canPlay(0,b),'');g.p(0).char='janet';const m=give(g,0,'missed');assert.ok(g.bangType(0,m));
});
test('Slab needs two Missed effects; Gatling only one',()=>{
 const g=fixture();g.p(0).char='slab';const b=give(g,0,'bang'),m1=give(g,1,'missed'),m2=give(g,1,'missed');g.play(0,b.id,1);assert.equal(g.s.pending.need,2);g.choose('card',m1.id);assert.equal(g.s.pending.need,1);g.choose('card',m2.id);assert.equal(g.s.pending,null);assert.equal(g.p(1).hp,4);const gat=give(g,0,'gatling');g.play(0,gat.id);assert.equal(g.s.pending.need,1);
});
test('Barrel heart provides one defense and uses a real deck card',()=>{
 const g=fixture();g.p(0).char='slab';give(g,1,'barrel',true);const b=give(g,0,'bang');top(g,c=>c.suit==='H');g.play(0,b.id,1);assert.equal(g.s.pending.need,1);assert.equal(total(g).length,80);
});
test('Beer cannot rescue in the final two, Saloon still heals',()=>{
 const g=fixture();g.p(2).alive=false;g.p(3).alive=false;g.p(4).alive=false;g.p(0).hp=2;const b=give(g,0,'beer');assert.match(g.canPlay(0,b),/두 명/);g.damage(0,2,1,'뱅!');assert.equal(g.choose('beer'),false);g.s.pending=null;g.p(0).hp=2;const s=give(g,0,'saloon');assert.ok(g.play(0,s.id));assert.equal(g.p(0).hp,3);
});
test('Jail cannot target Sheriff; a failed judgment skips drawing',()=>{
 const g=fixture(),j=give(g,1,'jail');assert.ok(!g.targets(1,j).includes(0));give(g,0,'jail',true);top(g,c=>c.suit==='S');g.s.queue=[{type:'jail',player:0},{type:'draw',player:0}];g.s.phase='processing';g.p(1).char='bart';g.pump();assert.equal(g.s.current,1);assert.equal(g.p(0).hand.length,0);assert.ok(!g.has(0,'jail'));
});
test('Dynamite is checked before Jail, can be saved with multiple Beers',()=>{
 const g=fixture();g.p(0).char='willy';g.p(0).hp=2;give(g,0,'dynamite',true);give(g,0,'jail',true);give(g,0,'beer');give(g,0,'beer');top(g,c=>c.suit==='S'&&c.rank>=2&&c.rank<=9);g.s.queue=[{type:'begin',player:0}];g.pump();assert.equal(g.p(0).hp,-1);assert.equal(g.s.pending.kind,'dying');assert.ok(g.has(0,'jail'));g.choose('beer');assert.equal(g.p(0).hp,0);g.choose('beer');assert.ok(g.p(0).alive);assert.equal(g.p(0).hp,1);assert.ok(!g.has(0,'jail'));assert.equal(total(g).length,80);
});
test('Panic steals chosen equipment, Cat Balou discards it',()=>{
 const g=fixture();const w=give(g,1,'winchester',true),p=give(g,0,'panic');g.play(0,p.id,1);g.choose('equipment',w.id);assert.ok(g.p(0).hand.some(c=>c.id===w.id));assert.ok(!g.weapon(1));const scope=give(g,2,'scope',true),cat=give(g,0,'cat');g.play(0,cat.id,2);g.choose('equipment',scope.id);assert.ok(g.s.discard.some(c=>c.id===scope.id));
});
test('General Store picks clockwise and conserves all cards',()=>{
 const g=fixture();const c=give(g,0,'store');g.play(0,c.id);const order=[];while(g.s.pending?.kind==='store'){order.push(g.s.pending.player);g.choose('choose',g.s.pending.cards[0].id);}assert.deepEqual(order,[0,1,2,3,4]);assert.equal(g.s.store,null);assert.equal(total(g).length,80);
});
test('Vulture receives eliminated cards and killer earns Outlaw bounty',()=>{
 const g=fixture();g.p(1).char='vulture';const c=give(g,2,'bang'),w=give(g,2,'scope',true);g.eliminate(2,0);assert.ok(g.p(1).hand.some(x=>x.id===c.id));assert.ok(g.p(1).hand.some(x=>x.id===w.id));assert.equal(g.p(0).hand.length,3);
});
test('Sheriff loses all hand and equipment for eliminating Deputy',()=>{
 const g=fixture();give(g,0,'bang');give(g,0,'scope',true);g.eliminate(1,0);assert.equal(g.p(0).hand.length,0);assert.equal(g.p(0).equipment.length,0);
});
test('Sid can rescue by choosing two cards, including with two players left',()=>{
 const g=fixture();g.p(0).char='sid';g.p(0).hp=0;const a=give(g,0,'bang'),b=give(g,0,'missed');g.s.pending={kind:'dying',player:0,source:1};assert.ok(!g.healSid(0,[a.id,a.id]));assert.ok(g.healSid(0,[a.id,b.id]));assert.equal(g.p(0).hp,1);assert.equal(g.s.pending,null);
});
test('Win conditions distinguish Outlaw, Sheriff and lone Renegade',()=>{
 let g=fixture();g.eliminate(0,2);assert.equal(g.s.winner,'outlaw');g=fixture();g.p(2).alive=false;g.p(4).alive=false;g.eliminate(3,0);assert.equal(g.s.winner,'sheriff');g=fixture();for(const i of [1,2,4])g.p(i).alive=false;g.eliminate(0,3);assert.equal(g.s.winner,'renegade');
});
test('Pending defense survives JSON save and resume without losing cards',()=>{
 const g=fixture();const b=give(g,0,'bang'),m=give(g,1,'missed');g.play(0,b.id,1);const resumed=new Game(JSON.parse(JSON.stringify(g.s)),()=>.3);assert.ok(resumed.choose('card',m.id));assert.equal(resumed.s.pending,null);assert.equal(total(resumed).length,80);
});
test('Seeded games terminate with 80 unique cards conserved at every step',()=>{
 for(let seed=1;seed<=120;seed++){
  let r=seed;const random=()=>{r=(r*1664525+1013904223)>>>0;return r/4294967296;};const g=new Game(null,random);g.create({count:4+seed%4,role:'random'});let steps=0;
  while(!g.s.winner&&steps++<3000){const cards=total(g);assert.equal(cards.length,80);assert.equal(new Set(cards.map(c=>c.id)).size,80);assert.ok(g.aiAction(true));}
  assert.ok(g.s.winner,`seed ${seed} stalled`);
 }
});

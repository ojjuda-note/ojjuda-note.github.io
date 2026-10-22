import assert from 'node:assert/strict';
import {SevenPoker,evaluateFive,bestHand,compare,distributePots,aiView,chooseAI,restoreGame} from '../games/poker/engine.mjs';
const c=(r,s=0)=>s*13+r-2;
const hand=(...r)=>r.map((v,i)=>c(v,i%4));
const seed=n=>()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};
const cats=[
  [hand(14,11,8,4,2),0],[hand(9,9,14,7,2),1],[hand(9,9,4,4,2),2],
  [hand(9,9,9,7,2),3],[hand(4,5,6,7,8),4],[[2,5,8,11,13].map(r=>c(r,2)),5],
  [hand(9,9,9,2,2),6],[[c(9,0),c(9,1),c(9,2),c(9,3),c(2,0)],7],[[6,7,8,9,10].map(r=>c(r,3)),8]
];
for(const [cards,expected] of cats)assert.equal(evaluateFive(cards).category,expected);
assert.equal(bestHand([c(14,0),c(14,1),c(14,2),c(13,0),c(13,1),c(13,2),c(2,0)]).category,6,'two triples form a full house');
assert.equal(bestHand([c(2,3),c(5,3),c(8,3),c(11,3),c(13,3),c(14,1),c(14,2)]).category,5,'choose flush over a pair');
assert.ok(compare(bestHand(hand(14,2,3,4,5)).score,bestHand(hand(9,10,11,12,13)).score)>0,'Korean back straight outranks K-high');
assert.ok(compare(bestHand(hand(14,10,11,12,13)).score,bestHand(hand(14,2,3,4,5)).score)>0,'mountain outranks back straight');
assert.equal(bestHand(hand(12,13,14,2,3)).category,0,'ace cannot wrap a straight');
assert.ok(compare(bestHand([c(9,0),c(9,1),c(14,0),c(7,0),c(2,0)]).score,bestHand([c(9,2),c(9,3),c(13,3),c(8,3),c(2,3)]).score)>0,'kicker takes priority over pair suit');
const contributors=[
  {total:50,folded:false,cards:[10,11,12,13,14].map(r=>c(r,3))},
  {total:100,folded:false,cards:[c(9,0),c(9,1),c(9,2),c(9,3),c(2,0)]},
  {total:200,folded:false,cards:hand(7,7,7,4,4)},
  {total:200,folded:false,cards:hand(8,8,12,5,2)}
];
assert.deepEqual(distributePots(contributors).payouts,[200,150,200,0],'different all-in sizes form independent pots');
contributors[1].folded=true;
assert.deepEqual(distributePots(contributors).payouts,[200,0,350,0],'folded chips remain in their pots');
contributors[3].total=350;
assert.deepEqual(distributePots(contributors).payouts,[200,0,350,150],'unmatched excess returned');
const tie=[{total:101,folded:false,cards:hand(9,9,14,7,2)},{total:101,folded:false,cards:hand(9,9,14,7,2)},{total:1,folded:true,cards:hand(2,4,6,8,10)}];
assert.deepEqual(distributePots(tie,0).payouts,[101,102,0],'odd chip moves clockwise from dealer');

const short=new SevenPoker({stacks:[5000,5000,200,5000],random:seed(42)});short.discard(0);short.open(0);short.turn=0;
short.act('raise',100);short.act('call');short.act('allin');short.act('call');
assert.equal(short.turn,0);assert.equal(short.legal().need,50);assert.equal(short.legal().mayRaise,false,'short all-in does not reopen a prior full raise');
assert.throws(()=>short.act('raise',300));short.act('call');short.act('call');assert.equal(short.phase,'between');
const view=aiView(Object.assign(short,{phase:'betting',turn:1}));
short.players[0].cards=[51,50,49,48];short.deck.reverse();
assert.deepEqual(aiView(short),view,'AI view ignores opponents hidden cards and deck');
assert.deepEqual(chooseAI(aiView(short),seed(98)),chooseAI(view,seed(98)),'hidden changes cannot affect a decision');

// Behavioural samples: bluffing must exist without making every opponent
// aggressive, and easy play must leave more opportunities to the player.
const weak=hand(14,11,9,7,5,3,2),strong=hand(10,10,10,6,6,2,13);
const sample=(cards,seat=1,difficulty='normal',extra={})=>{
  const input={seat,raises:0,street:7,pot:1000,cards,opponents:[{up:hand(13,8,5,2),stack:5000}],stack:5000,bet:0,
    legal:{need:0,call:0,check:true,mayRaise:true,minTo:100,maxTo:5000,allIn:true},...extra};
  const rng=seed(782341),counts={raise:0,check:0,call:0,fold:0},sizes=new Set();
  for(let i=0;i<2000;i++){
    const action=chooseAI(input,rng,difficulty);counts[action.type]++;
    if(action.type==='raise'){
      assert.ok(action.to>=input.legal.minTo&&action.to<=input.legal.maxTo&&Number.isInteger(action.to),'all bets stay legal');
      sizes.add(action.to);
    }
  }
  return {...counts,sizes};
};
assert.equal(bestHand(weak).category,0);
const cautious=sample(weak,1),bold=sample(weak,2),good=sample(strong,1),easyGood=sample(strong,1,'easy');
assert.ok(cautious.raise>40&&cautious.raise<260,'a high-card hand can occasionally bluff without constant aggression');
assert.ok(bold.raise>cautious.raise*1.3,'Duri bluffs more often than Haru');
assert.ok(cautious.check>1600,'most weak hands still check');
assert.ok(good.raise>300&&good.raise<850&&good.check>1000,'strong hands mix value betting with slow play');
assert.ok(good.sizes.size>=3,'bet size no longer gives the same signal every turn');
assert.ok(easyGood.raise<good.raise*.8,'easy opponents press a strong hand less often');
assert.ok(Math.max(...easyGood.sizes)<Math.max(...good.sizes),'easy value bets are smaller');
const pressure={raises:1,legal:{need:100,call:100,check:false,mayRaise:true,minTo:200,maxTo:5000,allIn:true}};
const carefulCall=sample(weak,1,'normal',pressure),looseCall=sample(weak,3,'normal',pressure),easyCall=sample(weak,1,'easy',pressure);
assert.ok(looseCall.call>carefulCall.call*1.5,'Bori calls weak hands more loosely');
assert.ok(easyCall.call>carefulCall.call*1.4,'easy opponents make more loose calls');
assert.equal(looseCall.raise,0,'weak hands do not start a repeated bluffing war');
assert.equal(sample(weak,2,'normal',{stack:100,legal:{need:0,call:0,check:true,mayRaise:true,minTo:100,maxTo:100,allIn:true}}).raise,0,'bluffing never forces a short stack all-in');
console.log('Poker AI: bluff/slow-play mix, distinct styles, variable bets, easy pressure and hidden-card independence pass.');

for(const difficulty of ['easy','normal'])for(const seat of [1,2,3])for(const street of [4,5,6,7]){
  const counts=sample(weak.slice(0,street),seat,difficulty,{street,raises:2,pot:200,stack:80,
    legal:{need:1000,call:80,check:false,mayRaise:false,minTo:1100,maxTo:80,allIn:true}});
  if(street<=5){assert.equal(counts.fold,0,'computers never fold through fifth street');assert.equal(counts.call,2000,'a short stack legally calls all-in under early pressure');}
  else assert.ok(counts.fold>1000,'folding remains available from sixth street');
}
for(const [preset,part,label] of [['minimum',0,'삥'],['quarter',.25,'쿼터'],['half',.5,'하프']]){
  const g=new SevenPoker({random:seed(7)});g.discard(0);g.open(0);
  const l=g.legal(),p=g.players[g.turn],to=Math.min(l.maxTo,Math.max(l.minTo,p.bet+l.need+Math.floor((g.pot+l.need)*part)));
  g.act('raise',to,preset);assert.match(g.log.at(-1),new RegExp(' · '+label+' '),'server retains the exact selected call');
}
const mislabeled=new SevenPoker({random:seed(7)});mislabeled.discard(0);mislabeled.open(0);
mislabeled.act('raise',mislabeled.legal().minTo+10,'half');assert.match(mislabeled.log.at(-1),/ · 베팅 /,'a forged preset cannot mislabel a different amount');

let hands=0,allIns=0,early=0;
for(let trial=1;trial<=700;trial++){
  const rng=seed(trial),stacks=Array.from({length:4},()=>50+Math.floor(rng()*4500)),g=new SevenPoker({stacks,random:rng});
  const total=stacks.reduce((a,b)=>a+b,0);
  assert.equal(restoreGame(g,rng)?.phase,'discard');
  g.discard(Math.floor(rng()*4));g.open(Math.floor(rng()*3));
  let step=0;
  while(g.phase!=='finished'){
    assert.ok(++step<150,'every hand terminates');
    const restored=restoreGame(g,rng);assert.ok(restored,'valid in-flight snapshot restores');
    assert.equal(g.players.reduce((n,p)=>n+p.stack+p.total,0),total,'no gold created or destroyed during betting');
    const unique=[...g.deck,...g.discarded,...g.players.flatMap(p=>p.cards)];assert.equal(new Set(unique).size,52);
    if(g.phase==='between'||g.phase==='runout'){g.advance();continue;}
    const l=g.legal(),roll=rng();
    if(roll<.1){g.act('fold');}
    else if(roll<.2&&l.allIn){g.act('allin');allIns++;}
    else if(roll<.4&&l.mayRaise){g.act('raise',Math.min(l.maxTo,l.minTo+Math.floor(rng()*300)));}
    else{const move=chooseAI(aiView(g),rng,trial%2?'normal':'easy');g.act(move.type,move.to);}
    assert.ok(g.players.every(p=>Number.isSafeInteger(p.stack)&&p.stack>=0));
  }
  assert.equal(g.players.reduce((n,p)=>n+p.stack,0),total,'settlement conserves all gold');
  assert.equal(g.result.payouts.reduce((a,b)=>a+b,0),g.pot,'entire pot paid once');
  const before=g.players.map(p=>p.stack);g.finish();assert.deepEqual(g.players.map(p=>p.stack),before,'settlement idempotent');
  assert.equal(restoreGame(g,rng)?.phase,'finished');
  if(g.result.uncontested)early++;
  else for(const p of g.players.filter(p=>!p.folded))assert.equal(p.cards.length,7);
  hands++;
}
assert.ok(allIns>100);assert.ok(early>20);
assert.equal(restoreGame({phase:'betting'}),null,'corrupt snapshot rejected');
console.log(`PASS: poker ranks, hidden-card isolation, side pots, short all-ins, replay and ${hands} complete hands (${allIns} all-ins, ${early} fold wins)`);

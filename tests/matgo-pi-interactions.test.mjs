import assert from 'node:assert/strict';
import {Game,CARDS,score,piVal,seededRandom} from '../games/matgo-engine.mjs';
const stats={games:0,claims:0,withPi:0,withoutPi:0,doublePpuk:0,specialCaptures:0,bonuses:0,ordinaryTripleCaptures:0};
for(let seed=1;seed<=5000;seed++){
 const r=seededRandom(seed^0x9a61b38f);let events=[],g;
 g=new Game({event:async(type,data)=>events.push({type,...data}),choose:async(_p,ids)=>ids[Math.floor(r()*ids.length)],chooseGukjin:async()=>r()<.5?'pi':'yul',goStop:async()=>r()<.5?'go':'stop'});
 g.random=seededRandom(seed);g.roundCpuLevel=1;g.deal();
 for(let move=0;!g.over;move++){
  assert.ok(move<160);
  const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,'continue');continue;}
  const p=g.turn,hand=g.hand[p],card=hand[Math.floor(r()*hand.length)]??null;
  const stBefore=g.floor.map(st=>({cards:[...st],ppuk:st.ppuk,owner:st.ppukOwner}));
  const available=score(g.caps[1-p]).pv;events=[];
  const bomb=g.bombOption(p,card);await g.play(p,card,bomb&&r()<.7?bomb:null);
  const collected=stBefore.filter(st=>st.ppuk&&st.cards.every(c=>g.caps[p].includes(c)));
  const owed=collected.reduce((n,st)=>n+(st.owner===p?2:1),0);
  const claims=events.filter(e=>e.type==='ppukget');const steals=events.filter(e=>e.type==='steal');
  assert.equal(claims.reduce((n,e)=>n+e.count,0),owed,`seed ${seed}, move ${move}: ppuk reward omitted`);
  const due=owed+events.filter(e=>['bomb','sweep','ttadak','jjok'].includes(e.type)).length;
  let remaining=due;
  for(const ev of steals){assert.ok(remaining>0,'never take another card after the claim is paid');remaining-=piVal(ev.card);}
  assert.ok(remaining<=0||score(g.caps[1-p]).pv===0,`seed ${seed}, move ${move}: a payable pi claim was left unpaid`);
  for(const ev of events.filter(e=>['ppukget','sweep','ttadak','jjok'].includes(e.type)))assert.equal(ev.availablePi,available,'claim notice uses the pre-transfer balance');
  if(owed){stats.claims++;if(available){stats.withPi++;assert.ok(steals.length>0,`seed ${seed}, move ${move}: available pi not transferred`);}else stats.withoutPi++;}
  if(claims.length>1)stats.doublePpuk++;
  for(const ev of events)if(ev.type==='bomb'||ev.type==='sweep'||ev.type==='ttadak'||ev.type==='jjok')stats.specialCaptures++;
  stats.bonuses+=events.filter(e=>e.type==='bonusPlay'||e.type==='flipBonus').length;
  stats.ordinaryTripleCaptures+=stBefore.filter(st=>!st.ppuk&&st.cards.length===3&&st.cards.every(c=>g.caps[p].includes(c))).length;
  const cards=[...g.hand.flat(),...g.floor.flat(),...g.caps.flat(),...g.deck];assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
 }
 stats.games++;
}
assert.ok(stats.withPi>0&&stats.withoutPi>0&&stats.doublePpuk>0&&stats.specialCaptures>0);
console.log('PASS: 5,000 deterministic games; additive pi claims, available/empty pi, whole-card payment and card conservation '+JSON.stringify(stats));

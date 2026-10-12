const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const e=await import('../supabase/functions/marble/engine.mjs');
 const game=(n=3)=>e.newGame(Array.from({length:n},(_,i)=>'참가자'+i),{runId:'10000000-0000-0000-0000-000000000001',maxRound:15});
 const fixed=(...values)=>max=>{assert.ok(values.length,'unexpected randomness');const n=values.shift();assert.ok(n>=0&&n<max);return n;};
 const choose=(g,value)=>e.advance(g,g.turn,{type:'choose',value});
 // Compare every property price/toll and total asset calculation with the original local rules.
 const html=fs.readFileSync(require('node:path').join(__dirname,'../games/ojjuda-tour/index.html'),'utf8');
 const board=html.slice(html.indexOf('const GC='),html.indexOf('const PIPS='));
 const maths=html.slice(html.indexOf('const costLv='),html.indexOf('function threats()'));
 for(let level=0;level<=4;level++){
  const g=game();e.tiles.forEach((t,i)=>{if(t.p){g.owner[i]=i%3;g.level[i]=t.t==='city'?level:0;g.fest[i]=i%4;}});
  const result=vm.runInNewContext(`const G=state;const r10=n=>Math.round(n/10)*10;const pid=p=>G.players.indexOf(p);const lvOf=i=>G.level[i]||0;const festOf=i=>G.fest[i]||0;${board}${maths};JSON.stringify({tiles:T.map((t,i)=>t.p?{value:value(i),toll:toll(i)}:null),assets:G.players.map(assets),mono:G.players.map((p,i)=>monoOf(i))})`,{state:g});
  const local=JSON.parse(result);e.tiles.forEach((t,i)=>{if(t.p){assert.equal(e.value(g,i),local.tiles[i].value);assert.equal(e.toll(g,i),local.tiles[i].toll);}});
  g.players.forEach((p,i)=>{assert.equal(e.assets(g,i),local.assets[i]);assert.equal(e.monopoly(g,i),local.mono[i]);});
 }
 let g=game();const initial=g,original=JSON.stringify(g);g=e.advance(g,0,{type:'roll',dice:[6,6]},fixed(0,1));
 assert.equal(g.players[0].pos,3);assert.equal(g.phase.kind,'buy');assert.equal(JSON.stringify(initial),original,'input snapshot remains immutable');
 g=choose(g,'yes');assert.equal(g.players[0].money,1940);g=choose(g,2);assert.equal(g.level[3],2);assert.equal(g.players[0].money,1860);assert.equal(g.turn,1);
 assert.throws(()=>e.advance(g,0,{type:'roll'}),/not_your_turn/);
 g=game();g.doubles=2;g=e.advance(g,0,{type:'roll'},fixed(0,0));assert.equal(g.players[0].pos,8);assert.equal(g.players[0].island,3);assert.equal(g.turn,1);
 g=game();g.players[0].money=-30;g.owner[1]=0;g.level[1]=0;e.settle(g,0);assert.equal(g.players[0].money,0);assert.equal(g.players[0].bankrupt,true,'last sale to exactly zero eliminates');
 g=game();g.players[0].money=0;g.owner[1]=0;e.settle(g,0);assert.equal(g.players[0].bankrupt,false,'zero with a sellable property stays');
 g=game();g.players[0].money=0;e.settle(g,0);assert.equal(g.players[0].bankrupt,true,'zero with no assets eliminates');
 g=game();g.players[0].money=-50;g.owner[1]=0;g.players[1].money=2050;e.settle(g,0,1);assert.equal(g.players[1].money,2030,'unpaid debt is not minted for the recipient');
 // All 14 chance outcomes remain playable, including destination and property selection.
 for(let card=0;card<14;card++){
  g=game();g.owner[3]=0;g.level[3]=1;g.owner[10]=1;g.level[10]=2;
  g=e.advance(g,0,{type:'roll'},fixed(0,0,card));
  assert.ok(g.log.some(s=>s.includes('찬스:')));assert.ok(g.over||e.prompt(g));
  if(card===0)assert.equal(g.players[0].angel,1);
  if(card===1)assert.equal(g.players[0].half,1);
  if(card===2)assert.equal(g.players[0].escape,1);
  if(card===3)assert.equal(g.players[0].travel,true);
  if(card===5){assert.equal(g.phase.kind,'swapOwn');g=choose(g,3);g=choose(g,10);assert.equal(g.owner[3],1);assert.equal(g.owner[10],0);}
  if(card===6){g=choose(g,10);assert.equal(g.level[10],1);}
  if(card===11)assert.equal(g.players[0].money,2200);
 }
 g=game();g.phase={kind:'bonus'};g.players[0].laps=1;g.owner[1]=0;g.level[1]=3;g=choose(g,1);assert.equal(g.level[1],4);assert.equal(g.players[0].money,2000);
 g=game();g.phase={kind:'quake'};g.owner[1]=1;g.level[1]=4;assert.ok(!e.prompt(g).tiles.includes(1));
 g=game();g.phase={kind:'travel'};g.players[0].pos=24;g=choose(g,3);assert.equal(g.players[0].laps,1);assert.equal(g.players[0].money,2280);assert.equal(g.phase.kind,'buy');
 g=game();g.phase={kind:'fest'};g.owner[1]=0;g.fest[1]=2;g=choose(g,1);assert.equal(g.fest[1],3);
 g=game();[1,3,4,5,6].forEach(i=>g.owner[i]=0);g.players[0].pos=7;g.phase={kind:'buy',tile:7};g=choose(g,'yes');assert.equal(g.reason,'라인독점');
 g=game();g.phase={kind:'swapOwn'};g.owner[1]=0;g.owner[3]=1;g=e.advance(g,1,{type:'surrender'});assert.equal(g.turn,2,'a removed swap target cannot leave a stuck prompt');
 assert.throws(()=>e.advance(g,1,{type:'roll'}),/not_your_turn/);
 for(const n of [2,3,8]){
  let seed=217+n,turns=0;const random=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};g=game(n);
  while(!g.over&&turns++<500)g=e.automaticTurn(g,random);
  assert.ok(g.over,`${n} players finish`);assert.ok(g.players.every(p=>p.money>=0));assert.equal(e.ranking(g).length,n);
 }
 console.log('PASS: online/local economics parity, server dice, all chance cards, doubles, travel, protected landmarks, exact-zero elimination, monopoly, surrender and complete 2/3/8-player games');
})().catch(e=>{console.error(e);process.exitCode=1;});

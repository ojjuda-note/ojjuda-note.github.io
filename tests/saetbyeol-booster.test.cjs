const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
const {game,read,owner}=require('./saetbyeol-fixture.cjs');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
 const db=new PGlite(),other=randomUUID(),poor=randomUUID(),banned=randomUUID();
 const migration=read('supabase/migrations/20261012210803_saetbyeol_booster.sql');
 const rpc=async(user,requestId,runId,stage=0,verify=false)=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec('set role authenticated');
  return (await db.query('select public.saetbyeol_booster_buy($1,$2,$3,$4) as v',[requestId,runId,stage,verify])).rows[0].v;
 };
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_note_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.is_banned(uuid) returns boolean language sql stable as $$select $1='${banned}'::uuid$$;
   create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0));
   create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid not null,kind text not null,coins integer not null,result jsonb not null);
   insert into user_private values('${owner}',60),('${other}',12),('${poor}',2),('${banned}',12);
   grant usage on schema public,auth to anon,authenticated;`);
  await db.exec(migration);
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select public.saetbyeol_booster_buy($1,$2,0)',[randomUUID(),randomUUID()]),/permission denied/);
  await assert.rejects(()=>rpc('',randomUUID(),randomUUID()),/not_signed_in/);
  assert.equal((await rpc(banned,randomUUID(),randomUUID())).reason,'banned');
  for(const stage of [-1,5,null])assert.equal((await rpc(owner,randomUUID(),randomUUID(),stage)).reason,'invalid');
  const receipt=randomUUID(),run=randomUUID();
  assert.equal((await rpc(owner,receipt,run,0,true)).reason,'not_found');
  let result=await rpc(owner,receipt,run);
  assert.deepEqual([result.ok,result.price,result.seconds,result.density,result.coins],[true,3,5,2,57]);
  assert.equal((await rpc(owner,receipt,run)).coins,57,'retry never spends twice');
  assert.equal((await rpc(owner,receipt,run,0,true)).coins,57,'verification recovers a paid receipt');
  assert.equal((await rpc(owner,receipt,randomUUID())).reason,'request_conflict');
  assert.equal((await rpc(owner,receipt,run,1)).reason,'request_conflict');
  assert.equal((await rpc(other,receipt,run)).reason,'request_conflict');
  assert.equal((await rpc(poor,randomUUID(),run)).reason,'coins');
  await db.exec('reset role');
  const permissions=(await db.query(`select
   has_function_privilege('authenticated','public.saetbyeol_booster_buy(uuid,uuid,integer,boolean)','execute') as member,
   has_function_privilege('anon','public.saetbyeol_booster_buy(uuid,uuid,integer,boolean)','execute') as anon,
   has_table_privilege('authenticated','public.user_private','update') as wallet_write`)).rows[0];
  assert.deepEqual(permissions,{member:true,anon:false,wallet_write:false});

  // Drive the actual iframe game, entry protocol and host against the migrated DB.
  const x=game({member:owner,saved:{stage:0,intro:true,lv:{h0b:3}}});
  const host=new JSDOM('<body></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only'}),w=host.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
  let authorized=true,loseResponse=true,charges=0,block=null,lastResult;
  try{
   w.eval(read('world-saetbyeol-game.js'));
   w.OjjudaSaetbyeolGame.open({owner,authorized:()=>authorized,onBooster:async(id,runId,stage)=>{
    charges++; if(block)await block;
    const value=await rpc(owner,id,runId,stage);lastResult=value;
    if(loseResponse){loseResponse=false;throw Error('response lost after commit');}
    return value;
   }});
   const frame=w.document.querySelector('iframe'),responses=[];
   frame.contentWindow.postMessage=data=>{responses.push(data);x.receive(data)};
   const receive=(data,origin=w.location.origin,sender=frame.contentWindow)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:sender,data:{source:'ojjuda-saetbyeol',...data}}));
   receive({type:'ojjuda-game-ready'});await settle();
   const f=x.w.fixture;x.$('#starStart').click();f.startRun(false);
   assert.equal(x.$('#top').lastElementChild.id,'boostBtn','small booster is the rightmost top control');
   assert.equal(x.$('#boostBtn').textContent,'부스터 -3ZU');
   assert.match(read('games/bulssi/entry.css'),/#boostBtn\{[^}]*font-size:11px/);
   const heat=f.run.heat,seconds=heat/f.liveStats.decay,light=f.state.cur.light;
   f.run.nodes=[];f.spawn('rock',true);f.spawn('star',true);f.spawn('ice',true);f.spawn('mem',true);
   f.run.bonusSeconds=8;
   x.$('#boostBtn').click();x.$('#boostBtn').click();
   let request=x.messages.find(m=>m.data.type==='ojjuda-game-booster').data;
   assert.equal(x.messages.filter(m=>m.data.type==='ojjuda-game-booster').length,1);
   assert.equal(f.run.boostPending,true);assert.equal(x.$('#setBtn').disabled,true);
   f.updateRun(4);assert.equal(f.run.heat,heat,'checkout pauses heat and movement');assert.equal(f.run.time,0);
   const initialRun=f.run;f.startRun(false);f.resetGame();assert.equal(f.run,initialRun,'pending checkout cannot discard the run');
   x.receive({type:'ojjuda-saetbyeol-exit-request'});
   assert.equal(x.messages.some(m=>m.data.type==='ojjuda-game-exit'),false);
   receive(request,'https://evil.test');receive(request,w.location.origin,w);receive({...request,demo:true});
   await settle();assert.equal(charges,0,'only this same-origin frame can buy');
   receive(request);receive(request);
   for(let i=0;i<20&&charges<1;i++)await settle();
   for(let i=0;i<20&&!responses.some(m=>m.result?.reason==='pending');i++)await settle();
   assert.equal(charges,1,'concurrent duplicate messages share the purchase');
   assert.equal(f.run.heat,heat,'an unconfirmed payment never grants a speculative effect');
   x.tick(12000);
   const retry=x.messages.filter(m=>m.data.type==='ojjuda-game-booster').at(-1).data;
   assert.equal(retry.requestId,request.requestId);receive(retry);
   for(let i=0;i<30&&f.run.boostPending;i++)await settle();
   assert.equal(f.run.boostPending,false);
   assert.equal(lastResult.coins,54,'lost response and retry cost exactly 3ZU');
   assert.ok(Math.abs(f.run.heat/f.liveStats.decay-seconds-5)<1e-9,'exactly five seconds even with cooling upgrades');
   assert.equal(f.run.bonusSeconds,8,'paid time is separate from the crystal cap');
   assert.equal(f.run.density,2);assert.equal(f.state.cur.light,light,'JU does not spend game light');
   const counts=kind=>f.run.nodes.filter(n=>n.t===kind).length;
   assert.deepEqual(['rock','star','ice','mem'].map(counts),[2,2,1,1]);
   assert.equal(x.$('#heat').style.width,'100%');assert.match(x.$('#timeBonus').textContent,/부스터 \+5초/);
   x.receive(responses.filter(m=>m.result?.ok).at(-1));await settle();
   assert.equal(f.run.paidSeconds,5,'duplicate responses never apply twice');

   // Repeated intentional uses extend time; density does not compound to 4x.
   const nodeCount=f.run.nodes.length,heatAfter=f.run.heat;
   x.$('#boostBtn').click();request=x.messages.filter(m=>m.data.type==='ojjuda-game-booster').at(-1).data;
   receive(request);for(let i=0;i<30&&f.run.boostPending;i++)await settle();
   assert.equal(f.run.paidSeconds,10);assert.equal(lastResult.coins,51);
   assert.ok(Math.abs(f.run.heat-heatAfter-5*f.liveStats.decay)<1e-9);
   assert.equal(f.run.nodes.length,nodeCount);assert.equal(f.run.density,2);
   assert.equal(f.encounters.recoverHeat(f.run,f.liveStats,f.types.ice),0);

   // Normal and boss fields both replenish at exactly twice the original rate/cap.
   for(const boss of [false,true]){
    if(boss){for(const u of f.upgrades.filter(u=>u.r===0))f.state.lv[u.id]=u.mx;}
    f.startRun(boss);f.run.nodes=[];f.run.tick=-100;f.run.nextHeatAt=1e6;
    f.pointer.has=true;f.pointer.x=-10000;f.pointer.y=-10000;
    f.run.spawnAcc=0;f.updateRun(.2);const base=f.run.spawnAcc;
    f.run.density=2;f.run.spawnAcc=0;f.updateRun(.2);assert.ok(Math.abs(f.run.spawnAcc-base*2)<1e-9);
    f.run.nodes=[];f.run.spawnAcc=1000;f.updateRun(.001);
    assert.equal(f.run.nodes.filter(n=>!n.dead).length,Math.min(48,Math.round(26*f.liveStats.spawn))*2);
   }
   f.startRun(false);assert.equal(f.run.density,1);assert.equal(f.run.paidSeconds,0);
   x.$('#boostBtn').click();request=x.messages.filter(m=>m.data.type==='ojjuda-game-booster').at(-1).data;
   const before=f.run.heat;
   x.receive({type:'ojjuda-saetbyeol-booster',requestId:request.requestId,runId:randomUUID(),result:{ok:true}});
   assert.equal(f.run.boostPending,true,'mismatched run responses are ignored');
   x.receive({type:'ojjuda-saetbyeol-booster',requestId:request.requestId,runId:request.runId,result:{ok:false,reason:'coins'}});
   await settle();assert.equal(f.run.boostPending,false);assert.equal(f.run.heat,before);assert.equal(f.run.density,1);
   assert.match(x.$('#toast').textContent,/부족/);
   const chargeCount=charges;authorized=false;receive({...request,requestId:randomUUID()});await settle();
   assert.equal(charges,chargeCount,'a switched account cannot spend through the old dialog');
  }finally{x.dom.window.close();w.close();}

  for(const demo of [false,true]){
   const x=game(demo?{member:owner,admin:true}:{});
   try{
    x.$('#starStart').click();if(demo)x.w.fixture.startDemo();x.w.fixture.startRun(false);x.$('#boostBtn').click();await settle();
    assert.equal(x.messages.some(m=>m.data.type==='ojjuda-game-booster'),false,'guest/demo never request a real charge');
    assert.equal(x.w.fixture.run.boostPending,false);assert.equal(x.w.fixture.run.paidSeconds,0);
   }finally{x.dom.window.close();}
  }
  console.log('PASS: 3ZU atomic receipts, auth/isolation, lost-response recovery, duplicate suppression, paused checkout, +5 actual seconds, immediate 2x fields, doubled spawn/cap, repeat use, crystal limits, reset, guest/demo and compact top-right control');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

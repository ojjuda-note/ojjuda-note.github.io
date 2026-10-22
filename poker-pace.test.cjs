const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./poker-online-fixture.cjs');
(async()=>{
 const {pollDelay}=await import('../games/poker/online-client.mjs');
 const now=100000,room={mode:'solo',status:'active',serverTime:now,receivedAt:now,deadline:new Date(now+450).toISOString(),game:{phase:'betting',turn:1}};
 assert.equal(pollDelay(room,{now}),500);
 assert.equal(pollDelay(room,{now:now+400}),100);
 assert.equal(pollDelay(room,{now:now+1000}),80,'overdue turns refresh promptly');
 assert.equal(pollDelay(room,{now,hidden:true}),5000);
 assert.equal(pollDelay(room,{now,failures:3}),9600,'connection errors back off instead of hammering the server');
 assert.equal(pollDelay({...room,game:{phase:'betting',turn:0}},{now}),1200);
 assert.equal(pollDelay({...room,mode:'online'},{now}),1200,'human opponents keep normal polling');
 assert.equal(pollDelay({...room,deadline:new Date(now+650).toISOString(),game:{phase:'between',turn:-1}},{now}),700);
 const f=await fixture(),actor=f.users[0];
 try{
  const call=async body=>{const data=await f.call(actor,body);assert.equal(data.ok,true,JSON.stringify(data));return data.room;};
  let r=await call({action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:4,title:'pace',difficulty:'normal'}});
  const move=async command=>{r=await call({action:'move',room_id:r.id,version:r.version,request_id:randomUUID(),command});};
  assert.ok(Date.parse(r.deadline)-r.serverTime>29000,'human selection keeps the 30-second limit');
  await move({type:'discard',index:0});await move({type:'open',index:0});
  const seen=new Set();
  for(let i=0;i<40&&seen.size<3;i++){
   const g=r.game,delay=Date.parse(r.deadline)-r.serverTime;
   if(g.phase==='between'||g.phase==='runout'){assert.ok(delay>0&&delay<=650,`street delay ${delay}`);seen.add('street');}
   else if(g.turn>0){assert.ok(delay>0&&delay<=450,`bot delay ${delay}`);seen.add('bot');}
   else {assert.ok(delay>29000&&delay<=30000,`human delay ${delay}`);seen.add('human');}
   if(g.phase==='betting'&&g.turn===0)await move({type:g.legal.check?'check':'call'});
   else {await f.db.query("update ojjuda_poker_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[r.id]);r=await call({action:'read',room_id:r.id});}
  }
  assert.deepEqual([...seen].sort(),['bot','human','street']);
  const access=await f.db.query("select has_function_privilege('anon','ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)','execute') anon, has_function_privilege('authenticated','ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb)','execute') member");
  assert.deepEqual(access.rows[0],{anon:false,member:false},'timing migration preserves service-only access');
  console.log('PASS: automatic deadline polling, error backoff, 450ms bot/650ms street waits, unchanged human clock and server permissions');
 }finally{await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

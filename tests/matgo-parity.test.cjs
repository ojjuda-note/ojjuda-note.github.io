const assert=require('node:assert/strict');
const {fixture,A,B,MINOR}=require('./arcade-rooms-fixture.cjs');
(async()=>{
 const f=await fixture(),{db}=f;
 const call=(actor,body)=>f.call(actor,{stakes_version:1,...body});
 const balance=(actor,gold)=>db.query('update ojjuda_matgo_internal.wallets set gold=$2 where user_id=$1',[actor,gold]);
 try{
  await call(A,{action:'status'});await call(B,{action:'status'});
  await balance(A,200000);await balance(B,300000);
  assert.equal((await call(A,{action:'online_create'})).error,'stake_offer_pending');
  await call(A,{action:'stake',rate:200,accept:true});await call(B,{action:'stake',rate:500,accept:true});
  const made=await f.arcade(A,'create',{p_kind:'matgo',p_title:'같은 방식',p_options:{request_id:crypto.randomUUID(),stakes_version:1}});
  await f.arcade(B,'join',{p_room:made.room.room_no,p_options:{stakes_version:1}});
  const id=made.room.match_id;
  const [a,b]=await Promise.all([call(A,{action:'online_read',room_id:id}),call(B,{action:'online_read',room_id:id})]);
  assert.equal(a.room.rate,200);assert.equal(b.room.rate,200,'both use the lower accepted rate');
  assert.equal((await f.call(A,{action:'online_read',room_id:id})).error,'client_update_required');
  assert.equal((await call(MINOR,{action:'online_read',room_id:id})).error,'adult_required');
  assert.equal('seed' in a.room,false);assert.equal('deck' in a.room.game,false);
  assert.equal((await call(A,{action:'online_create',rate:100000})).room.rate,200,'resuming cannot raise a live rate');
  const {automaticOnline,replayOnline}=await import('../supabase/functions/matgo/online.mjs');
  let raw=(await db.query('select * from ojjuda_matgo_internal.rooms where id=$1',[id])).rows[0],next;
  assert.equal((await replayOnline({...raw,rate:100000})).game.rate,200,'forged rate fields are ignored');
  for(let turn=0;turn<160&&!raw.result;turn++){next=await automaticOnline(raw);raw={...raw,...next};}
  assert.ok(raw.result);if(raw.result.total)assert.equal(raw.result.money,raw.result.total*200);
  await db.query('select public.matgo_online_service($1,$2,$3,null,null,$4,$5,$6)',[A,'commit',id,a.room.version,crypto.randomUUID(),next]);
  const ended=(await call(A,{action:'online_read',room_id:id})).room;
  assert.equal(ended.gold[0]+ended.gold[1],500000,'gold is conserved at the shared rate');
  await balance(A,400000);await balance(B,300000);
  await call(A,{action:'stake',rate:2000,accept:true});
  await call(A,{action:'online_ready',room_id:id});
  const rematch=await call(B,{action:'online_ready',room_id:id,rate:100000});
  assert.equal(rematch.room.rate,500);assert.equal(rematch.room.round,2);
  await db.query('update ojjuda_matgo_internal.wallets set stake_rate=100000 where user_id=$1',[A]);
  assert.equal((await call(A,{action:'online_read',room_id:id})).room.rate,500,'a round snapshot never changes');
  await call(A,{action:'online_leave',room_id:id});await call(B,{action:'online_leave',room_id:id});
  const old=await f.call(A,{action:'online_create',rate:100000});
  const mixed=await call(B,{action:'online_join',code:old.room.code,rate:100000});
  assert.equal(mixed.room.rate,100,'older clients keep their original 100G choice');
  const {advanceOnline}=await import('../supabase/functions/matgo/online.mjs');
  let shook=false;
  for(let seed=1;seed<=50&&!shook;seed++){
    const candidate={...raw,status:'active',actions:[],seed:seed.toString(16).padStart(64,'0'),first:0,carry:1};
    const before=await replayOnline(candidate),p=before.prompt?.p,g=before.game;
    if(before.prompt?.type!=='play')continue;
    const card=g.hand[p].find(c=>g.hand[p].filter(x=>x.m===c.m).length===3&&!g.bombOption(p,c));
    if(!card)continue;
    const next=await advanceOnline(candidate,p,{type:'play',card:card.id,shake:true});
    assert.deepEqual(next.actions.slice(0,2).map(a=>a.type),['shake','play'],'shaking plays the selected card in one action, just like solo');
    assert.equal((await replayOnline({...candidate,actions:next.actions})).game.hand[p].some(c=>c.id===card.id),false);shook=true;
  }
  assert.ok(shook);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'ojjuda_matgo_internal.online_service(uuid,text,uuid,text,text,integer,uuid,jsonb)','execute') ok",[role])).rows[0].ok,false);
  console.log('PASS: solo stake consent reused for public matches, both seats agree, server rate snapshot, conserved gold, rematch, legacy clients, private hands and access restrictions');
 }finally{await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

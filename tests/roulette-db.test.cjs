const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const ids=Array.from({length:7},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [A,B,C,D,MINOR,BANNED,ANON]=ids;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema fixture;create schema ojjuda_account_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table public.profiles(id uuid primary key,nickname text);
 create table public.user_private(user_id uuid primary key,coins integer default 20,banned_until timestamptz);
 create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
 create table fixture.blocks(a uuid,b uuid);
 create function public.blocked_between(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from fixture.blocks where (a=$1 and b=$2)or(a=$2 and b=$1))$$;
 create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable as $$select extract(year from age($2,$1))::integer$$;`);
 for(const [i,id]of ids.entries()){
  await db.query('insert into auth.users values($1,$2)',[id,id===ANON]);
  await db.query('insert into public.profiles values($1,$2)',[id,`회원${i+1}`]);
  await db.query("insert into public.user_private(user_id,banned_until)values($1,case when $2 then now()+interval '1 day' else null end)",[id,id===BANNED]);
  await db.query("insert into ojjuda_account_internal.member_identity values($1,current_date-make_interval(years=>$2))",[id,id===MINOR?18:25]);
 }
 const dir=path.join(__dirname,'../supabase/migrations');
 await db.exec(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('_roulette_multiplayer_core.sql'))),'utf8'));
 const call=async(actor,action,payload={})=>db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);
  await tx.exec('set local role authenticated');
  return (await tx.query('select public.roulette_action($1,$2) value',[action,payload])).rows[0].value;
 });
 return{db,call};
}
async function main(){
 const {db,call}=await fixture();let checks=0;
 const equal=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
 const fail=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
 const expire=async room=>db.query("update ojjuda_roulette_internal.rounds set started_at=clock_timestamp()-interval '31 seconds' where room_id=$1",[room]);
 const gold=async actor=>(await call(actor,'status')).wallet.gold;
 try{
  for(const actor of[null,ANON])await fail(()=>call(actor,'status'),/not_signed_in/);
  await fail(()=>call(MINOR,'status'),/adult_required/);await fail(()=>call(BANNED,'status'),/banned/);
  equal((await call(A,'status')).wallet,{coins:20,gold:10000,available:10000},'gold and ZU are separate');
  for(const role of['anon','authenticated','service_role'])for(const table of['wallets','rooms','players','entries','rounds']){
   equal((await db.query("select has_table_privilege($1,$2,'select,insert,update,delete') ok",[role,'ojjuda_roulette_internal.'+table])).rows[0].ok,false,'private tables never writable/readable');
  }
  equal((await db.query("select has_function_privilege('anon','public.roulette_action(text,jsonb)','execute') ok")).rows[0].ok,false);
  equal((await db.query("select has_function_privilege('authenticated','ojjuda_roulette_internal.settle(uuid,uuid,timestamptz)','execute') ok")).rows[0].ok,false);
  equal((await db.query('select count(*)::int n from ojjuda_roulette_internal.bet_catalog')).rows[0].n,131);
  const engine=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(path.join(__dirname,'../games/roulette/engine.js'),'utf8')));
  for(const [id,bet]of Object.entries(engine.BETS))for(let number=0;number<37;number++){
   const server=(await db.query('select ojjuda_roulette_internal.payout($1,$2) p',[{[id]:100},number])).rows[0].p,expected=engine.payout({[id]:100},number);
   equal({gross:server.gross,fee:server.fee,total:server.total},{gross:expected.gross,fee:expected.fee,total:expected.total},`${id}/${number} payout matches original`);
  }
  let r=(await call(A,'create',{capacity:4,request_id:'room-one'})).room;const code=r.code,id=r.id;
  equal((await call(A,'create',{capacity:4,request_id:'room-one'})).room.id,id,'create replay');
  equal((await call(B,'list')).rooms[0].code,code);
  await fail(()=>call(C,'read',{code}),/room_not_found/);
  await db.query('insert into fixture.blocks values($1,$2)',[A,D]);
  equal((await call(D,'list')).rooms.length,0);await fail(()=>call(D,'join',{code}),/room_not_found/);
  await call(B,'join',{code});
  await call(A,'bet',{code,bets:{n0:100,red:500}});
  r=(await call(B,'read',{code})).room;
  equal(r.players.find(p=>p.userId===A).bets,{n0:100,red:500},'members see draft chips');equal(await gold(A),10000,'draft never debits wallet');
  for(const bets of[{unknown:100},{red:-100},{red:101},{red:1e30},{red:50000,black:100},[],{red:'100'}])await fail(()=>call(A,'ready',{code,bets}),/invalid_bet/);
  await fail(()=>call(A,'ready',{code,bets:{red:20000}}),/insufficient_gold/);
  await call(A,'ready',{code,bets:{red:500},ready:true});equal(await gold(A),9500);
  await call(A,'ready',{code,bets:{red:500},ready:true});equal(await gold(A),9500,'ready replay reserves once');
  await call(A,'ready',{code,ready:false});equal(await gold(A),10000,'cancel returns reserved funds');
  await call(A,'ready',{code,bets:{red:500},ready:true});
  const started=await call(B,'start',{code,bets:{black:500}});r=started.room;
  equal(r.status,'spinning','last player consent starts automatically, without host click');
  const spin=r.spin,host=(await call(A,'read',{code})).room;
  equal([host.spin.id,host.spin.number,host.spin.duration,host.spin.variation],[spin.id,spin.number,spin.duration,spin.variation]);
  equal(host.spin.bets,{red:500},'spin bets are viewer-specific');equal((await call(A,'start',{code})).room.spin.id,spin.id,'start replay does not create a round');
  await fail(()=>call(A,'confirm',{code,roundId:spin.id}),/round_in_progress/);
  await fail(()=>call(A,'bet',{code,bets:{n0:500}}),/round_in_progress/);
  await expire(id);r=(await call(A,'read',{code})).room;equal(r.status,'finished');equal(await gold(A),9500,'watching a stopped ball never pays before confirmation');
  const payoutA=r.result.total;await call(A,'confirm',{code,roundId:spin.id});equal(await gold(A),9500+payoutA);
  await call(A,'confirm',{code,roundId:spin.id});equal(await gold(A),9500+payoutA,'duplicate confirmation settles once');
  const payoutB=(await call(B,'read',{code})).room.result.total;await call(B,'confirm',{code,roundId:spin.id});
  equal(await gold(B),9500+payoutB);equal((await call(A,'read',{code})).room.status,'betting');
  equal((await call(A,'read',{code})).room.me.bets,{},'next round never auto-bets');
  equal((await call(A,'status')).wallet.coins,20,'bets never spend ZU');
  // A ready player receives a refund on exit before the round starts.
  const before=await gold(A);await call(A,'ready',{code,bets:{red:100}});await call(A,'leave',{room_id:id});equal(await gold(A),before);
  await call(A,'leave',{room_id:id});equal(await gold(A),before,'late repeated leave is harmless');
  await call(A,'join',{code});
  const beforeA=await gold(A),beforeB=await gold(B);
  await call(A,'ready',{code,bets:{red:100}});r=(await call(B,'ready',{code,bets:{black:100}})).room;
  const round2=r.spin.id;
  const expected=(await db.query('select user_id,payout::text from ojjuda_roulette_internal.entries where round_id=$1',[round2])).rows;
  await call(A,'leave',{code});await call(B,'leave',{code});
  equal(await gold(A),beforeA-100+Number(expected.find(e=>e.user_id===A).payout));
  equal(await gold(B),beforeB-100+Number(expected.find(e=>e.user_id===B).payout),'both exits immediately settle immutable outcome');
  equal((await db.query('select bool_and(abandoned and settled_at is not null) ok from ojjuda_roulette_internal.entries where round_id=$1',[round2])).rows[0].ok,true,'left players are permanently excluded from ranking');
  // A missing client cannot keep a confirmed player waiting indefinitely.
  const fresh=(await call(A,'create')).room;await call(B,'join',{code:fresh.code});await call(A,'ready',{code:fresh.code,bets:{red:100}});r=(await call(B,'ready',{code:fresh.code,bets:{black:100}})).room;
  await expire(fresh.id);await call(A,'confirm',{code:fresh.code,roundId:r.spin.id});
  await db.query("update ojjuda_roulette_internal.players set last_seen=clock_timestamp()-interval '3 minutes' where room_id=$1 and user_id=$2",[fresh.id,B]);
  equal((await call(A,'read',{code:fresh.code})).room.status,'betting');
  equal((await db.query('select abandoned from ojjuda_roulette_internal.entries where round_id=$1 and user_id=$2',[r.spin.id,B])).rows[0].abandoned,true);
  console.log(`PASS: ${checks} roulette database checks, all 4,847 original bet/outcome combinations, permissions, adult access, blocked users, draft chips, atomic escrow, unanimous start, confirmations, duplicate actions, departures, timeout recovery, ZU isolation.`);
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

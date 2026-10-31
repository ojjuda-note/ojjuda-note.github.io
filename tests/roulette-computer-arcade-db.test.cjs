const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createFixture,read}=require('./monthly-game-rankings-fixture.cjs');
const ids=Array.from({length:4},(_,i)=>`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [A,B,C,D]=ids;

(async()=>{
 const {db,actor,claim,clock}=await createFixture();
 let checks=0;
 const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++};
 const fail=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
 try{
  await db.exec(`
   alter table public.user_private add column coins integer not null default 77;
   create schema ojjuda_arcade_internal;create schema ojjuda_matgo_internal;
   create table ojjuda_matgo_internal.rooms(host_id uuid,code text,status text);
   create table fixture.friends(a uuid,b uuid);
   create function public.is_friend(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from fixture.friends where (a=$1 and b=$2) or (a=$2 and b=$1))$$;
   grant usage on schema ojjuda_arcade_internal,ojjuda_poker_internal to authenticated;
   create function ojjuda_poker_internal.arcade_rooms() returns jsonb language sql as $$select '{"ok":true,"rooms":[{"kind":"poker"}]}'::jsonb$$;
   create function ojjuda_bang_internal.arcade_rooms() returns jsonb language sql as $$select '{"ok":true,"rooms":[{"kind":"bang"}]}'::jsonb$$;
  `);
  for(const file of ['20261009062933_arcade_friend_invites.sql','20261010134600_arcade_invite_popup.sql','20261018081035_tank_friend_invites.sql'])await db.exec(read(file));
  const migrations=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(file=>file.includes('_roulette_')).sort();
  assert.ok(migrations.some(file=>file.endsWith('_roulette_computer_mode.sql')));
  assert.ok(migrations.some(file=>file.endsWith('_roulette_computer_arcade_visibility.sql')));
  for(const file of migrations)await db.exec(read(file));
  const funcs=await db.query(`select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in('ojjuda_roulette_internal','ojjuda_ranking_internal','ojjuda_arcade_internal','ojjuda_guest_internal')`);
  for(const {definition}of funcs.rows){
   const patched=definition.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g,'fixture.clock()');
   if(patched!==definition)await db.exec(patched);
  }
  for(const [i,id]of ids.entries()){
   await actor(id,`회원${i+1}`);
   await db.query('insert into public.user_private(user_id) values($1)',[id]);
  }
  await db.query('insert into fixture.friends values($1,$3),($2,$3)',[A,B,C]);
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
  async function run(id,sql,args=[]){
   await claim(id);await db.exec('set role authenticated');
   try{return await value(sql,args)}finally{await db.exec('reset role')}
  }
  const call=(id,action,payload={})=>run(id,'select public.roulette_action($1,$2) value',[action,payload]);
  const feed=id=>run(id,'select public.arcade_extra_rooms() value');
  const invite=(id,action,to=null,code=null,inviteId=null)=>run(id,'select public.arcade_friend_invite($1,$2,$3,$4,$5) value',[action,to,code?'roulette':null,code,inviteId]);

  const solo=(await call(A,'create',{mode:'solo'})).room;
  const online=(await call(B,'create',{mode:'online'})).room;
  equal(solo.mode,'solo');equal(online.mode,'online');equal(solo.capacity,2);
  equal(solo.players.filter(p=>p.computer===true).map(p=>p.userId),['computer'],'computer exists only in the snapshot');
  equal(await value('select count(*)::integer value from auth.users'),ids.length,'no fake auth account is created');
  equal(await value('select count(*)::integer value from ojjuda_roulette_internal.players where room_id=$1',[solo.id]),1,'solo keeps one real participant row');
  for(const viewer of [A,B,C,D]){
   const rooms=(await feed(viewer)).rooms;
   equal(rooms.map(r=>r.kind),['poker','bang','roulette'],'other feed providers stay intact');
   equal(rooms.find(r=>r.kind==='roulette').match_id,online.id,'private solo room is hidden even from its owner in the shared feed');
  }
  equal((await call(C,'list')).rooms.map(r=>r.id),[online.id],'game lobby also omits private computer games');
  await fail(()=>call(C,'join',{code:solo.code}),/room_not_found|room_unavailable/);
  await fail(()=>call(D,'read',{code:solo.code}),/room_not_found|room_unavailable/);
  await fail(()=>invite(A,'send',C,solo.code),/room_unavailable/);
  equal(await value('select count(*)::integer value from public.arcade_friend_invites where sender_id=$1',[A]),0,'failed solo invitation writes no pending invitation');

  const valid=await invite(B,'send',C,online.code);
  const stale=(await db.query("insert into public.arcade_friend_invites(sender_id,recipient_id,kind,room_code,expires_at) values($1,$2,'roulette',$3,fixture.clock()+interval '1 minute') returning id",[A,C,solo.code])).rows[0].id;
  equal((await invite(C,'list')).invites.map(i=>i.id),[valid.id],'a stale solo invitation is hidden while the online invitation remains');
  await fail(()=>invite(C,'accept',null,null,stale),/room_unavailable/);
  equal(await value('select status value from public.arcade_friend_invites where id=$1',[stale]),'pending','rejected private invitation cannot become accepted');
  equal((await invite(C,'accept',null,null,valid.id)).code,online.code,'online invitation remains usable');

  // Every number is covered so the real server result has a deterministic
  // returned prize, independent of the cryptographic wheel number.
  const allNumbers=amount=>Object.fromEntries(Array.from({length:37},(_,n)=>['n'+n,amount]));
  const soloSpin=(await call(A,'start',{code:solo.code,bets:allNumbers(100)})).room.spin;
  assert.ok(soloSpin);checks++;
  await clock(new Date(soloSpin.startedAt+soloSpin.duration).toISOString());
  const paidSolo=await call(A,'confirm',{code:solo.code,roundId:soloSpin.id});
  equal(paidSolo.wallet.gold,9864,'only the real player stakes and receives the solo prize');
  equal(paidSolo.wallet.coins,77,'ZU is unchanged');
  equal(await value('select count(*)::integer value from ojjuda_roulette_internal.entries where room_id=$1',[solo.id]),1,'computer has no settlement entry');
  equal(await value('select user_id::text value from ojjuda_roulette_internal.entries where room_id=$1',[solo.id]),A);

  await call(C,'join',{code:online.code});
  await call(B,'start',{code:online.code,bets:allNumbers(200)});
  const onlineSpin=(await call(C,'ready',{code:online.code,bets:{}})).room.spin;
  await clock(new Date(onlineSpin.startedAt+onlineSpin.duration).toISOString());
  await call(B,'confirm',{code:online.code,roundId:onlineSpin.id});
  await call(C,'confirm',{code:online.code,roundId:onlineSpin.id});
  const rankings=await run(D,"select public.community_game_monthly_ranking('roulette') value");
  equal(rankings.map(r=>[r.nick,r.score]),[['회원2',7128],['회원1',3564]],'online and solo human payouts share the existing ranking; the computer never appears');
  equal(await value('select count(*)::integer value from auth.users'),ids.length,'playing both modes creates no bot identity');
  equal(await value('select count(*)::integer value from ojjuda_roulette_internal.wallets'),3,'only participating real members have game wallets');

  await db.query("update ojjuda_roulette_internal.players set last_seen=fixture.clock()-interval '3 minutes' where room_id=$1",[online.id]);
  equal((await feed(D)).rooms.map(r=>r.kind),['poker','bang'],'all-stale online rooms stay hidden');
  await db.query('update ojjuda_roulette_internal.players set last_seen=fixture.clock() where room_id=$1 and user_id=$2',[online.id,C]);
  equal((await feed(D)).rooms.filter(r=>r.kind==='roulette').map(r=>r.match_id),[online.id],'one fresh online participant restores discovery');
  equal(await value("select has_function_privilege('authenticated','ojjuda_roulette_internal.assert_invite_room(uuid,uuid,text,boolean)','execute') value"),false,'invitation validator remains private');
  equal(await value("select has_function_privilege('anon','ojjuda_roulette_internal.arcade_rooms()','execute') value"),false,'room feed stays member-only');
  console.log(`PASS: ${checks} computer/online arcade checks; private room discovery and invitations, online flow, actual solo/online payouts, human-only rankings and wallets, stale-room policy, unchanged permissions.`);
 }finally{await db.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

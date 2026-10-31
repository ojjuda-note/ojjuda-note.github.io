const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixture,read}=require('./monthly-game-rankings-fixture.cjs');
const root=path.join(__dirname,'..'),migration='20261031123640_roulette_arcade_integration.sql';
(async()=>{
 const {db,actor,claim}=await createFixture();
 try{
  await db.exec(`alter table public.user_private add column coins integer not null default 77;
   create schema ojjuda_arcade_internal;create schema ojjuda_matgo_internal;
   create table ojjuda_matgo_internal.rooms(host_id uuid,code text,status text);
   create table fixture.friends(a uuid,b uuid);
   create function public.is_friend(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from fixture.friends where (a=$1 and b=$2) or (a=$2 and b=$1))$$;
   grant usage on schema ojjuda_arcade_internal,ojjuda_poker_internal to authenticated;
   create function ojjuda_poker_internal.arcade_rooms() returns jsonb language sql as $$select '{"ok":true,"rooms":[{"kind":"poker"}]}'::jsonb$$;
   create function ojjuda_bang_internal.arcade_rooms() returns jsonb language sql as $$select '{"ok":true,"rooms":[{"kind":"bang"}]}'::jsonb$$;
   grant execute on function ojjuda_poker_internal.arcade_rooms(),ojjuda_bang_internal.arcade_rooms() to authenticated;
  `);
  await db.exec(read('20261009062933_arcade_friend_invites.sql'));
  await db.exec(read('20261010134600_arcade_invite_popup.sql'));
  await db.exec(read('20261018081035_tank_friend_invites.sql'));
  await db.exec(read('20261031123556_roulette_multiplayer_core.sql'));
  await db.exec(read(migration));
  const funcs=await db.query(`select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('ojjuda_roulette_internal','ojjuda_ranking_internal','ojjuda_arcade_internal')`);
  for(const {definition}of funcs.rows){const patched=definition.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g,'fixture.clock()');if(patched!==definition)await db.exec(patched)}
  const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',MINOR='00000000-0000-4000-8000-000000000004',BANNED='00000000-0000-4000-8000-000000000005';
  for(const [id,nick,birth]of [[A,'첫 회원'],[B,'둘째 회원'],[C,'다른 회원'],[MINOR,'미성년','2010-01-01'],[BANNED,'정지 회원']]){await actor(id,nick,birth);await db.query('insert into public.user_private(user_id) values($1)',[id])}
  await db.query("update public.user_private set banned_until='2027-01-01' where user_id=$1",[BANNED]);
  await db.query('insert into fixture.friends values($1,$2),($1,$3)',[A,B,MINOR]);
  const room=(await db.query("insert into ojjuda_roulette_internal.rooms(code,host_id,title,capacity) values('ABCD1234',$1,'룰렛 함께',4) returning id",[A])).rows[0].id;
  await db.query("insert into ojjuda_roulette_internal.players(room_id,user_id,name,last_seen) values($1,$2,'첫 회원',fixture.clock())",[room,A]);
  let round=0;
  async function entry(user,payout,stake=100,{abandoned=false,at='2026-10-31 11:00:00Z'}={}){
   const rid=(await db.query('insert into ojjuda_roulette_internal.rounds(room_id,round_no,number,duration_ms,variation) values($1,$2,17,20000,0.4) returning id',[room,++round])).rows[0].id;
   await db.query(`insert into ojjuda_roulette_internal.entries(round_id,room_id,user_id,bets,stake,gross,fee,payout,net,abandoned,settled_at) values($1,$2,$3,'{"n17":100}',$4,$5,0,$5,$5::bigint-$4::bigint,$6,$7)`,[rid,room,user,stake,payout,abandoned,at]);
  }
  await entry(A,3000,4000); // Larger returned prize despite negative net: user's explicit ranking policy.
  await entry(A,1000);await entry(B,2500);await entry(C,99999,100,{abandoned:true});
  await entry(MINOR,300000);await entry(BANNED,300000);await entry(C,100000,100,{at:null});
  await entry(C,0);await entry(C,888888,100,{at:'2026-09-10 00:00:00Z'});
  async function run(id,sql,args=[]){await claim(id);await db.exec('set role authenticated');try{return (await db.query(sql,args)).rows}finally{await db.exec('reset role')}}
  const leaders=async id=>(await run(id,"select public.community_game_monthly_leaders(array['roulette','poker','bang','mole']) value"))[0].value;
  const first=await leaders(A);assert.equal(first.roulette.score,3000);assert.equal(first.roulette.nick,'첫 회원');assert.equal(first.roulette.source,'best_round_gain');
  assert.ok(Object.hasOwn(first,'poker')&&Object.hasOwn(first,'bang'),'other game batch still works');
  assert.equal(Object.hasOwn(await leaders(MINOR),'roulette'),false,'minor cannot request roulette ranking');
  await assert.rejects(()=>run(MINOR,"select ojjuda_ranking_internal.current_rows('roulette')"),/permission denied|adult_required/);
  await db.query('insert into fixture.blocks values($1,$2)',[B,A]);assert.equal((await leaders(B)).roulette.score,2500);await db.exec('delete from fixture.blocks');
  const archived=(await db.query("select ojjuda_ranking_internal.visible_winners($1::jsonb,array['roulette'],$2) value",[JSON.stringify({roulette:{score:3000,nick:'첫 회원',_userId:A}}),B])).rows[0].value;assert.equal(archived.roulette.score,3000);
  await db.query('insert into fixture.blocks values($1,$2)',[B,A]);assert.equal((await db.query("select ojjuda_ranking_internal.visible_winners($1::jsonb,array['roulette'],$2) value",[JSON.stringify({roulette:{score:3000,_userId:A}}),B])).rows[0].value.roulette,null);await db.exec('delete from fixture.blocks');
  const feed=async id=>(await run(id,'select public.arcade_extra_rooms() value'))[0].value.rooms;
  let rooms=await feed(B);assert.deepEqual(rooms.map(x=>x.kind),['poker','bang','roulette']);assert.equal(rooms[2].code,'ABCD1234');assert.equal(rooms[2].players,1);assert.equal(rooms[2].status,'waiting');
  await db.query("insert into ojjuda_roulette_internal.players(room_id,user_id,name,last_seen) values($1,$2,'다른 회원',fixture.clock()-interval '3 minutes')",[room,C]);
  await db.query("update ojjuda_roulette_internal.players set last_seen=fixture.clock()-interval '3 minutes' where room_id=$1",[room]);
  assert.deepEqual((await feed(B)).map(x=>x.kind),['poker','bang'],'all-stale roulette room is hidden without changing existing feed providers');
  await db.query("update ojjuda_roulette_internal.players set last_seen=fixture.clock() where room_id=$1 and user_id=$2",[room,C]);
  assert.equal((await feed(B)).find(x=>x.kind==='roulette')?.code,'ABCD1234','one fresh participant keeps the room visible even if its host is stale');
  await db.query('delete from ojjuda_roulette_internal.players where room_id=$1 and user_id=$2',[room,C]);
  await db.query('update ojjuda_roulette_internal.players set last_seen=fixture.clock() where room_id=$1',[room]);
  assert.equal((await feed(MINOR)).some(x=>x.kind==='roulette'),false);
  await db.query('insert into fixture.blocks values($1,$2)',[B,A]);assert.equal((await feed(B)).some(x=>x.kind==='roulette'),false);await db.exec('delete from fixture.blocks');
  await db.query("update ojjuda_roulette_internal.rooms set status='spinning' where id=$1",[room]);assert.equal((await feed(B))[2].status,'playing');await db.query("update ojjuda_roulette_internal.rooms set status='betting' where id=$1",[room]);
  async function invite(id,action,to=null,kind=null,code=null,inviteId=null){return(await run(id,'select public.arcade_friend_invite($1,$2,$3,$4,$5) value',[action,to,kind,code,inviteId]))[0].value}
  await assert.rejects(()=>invite(A,'send',MINOR,'roulette','ABCD1234'),/adult_required/);
  await assert.rejects(()=>invite(B,'send',A,'roulette','ABCD1234'),/room_unavailable/);
  const sent=await invite(A,'send',B,'roulette','ABCD1234');assert.ok(sent.id);
  assert.equal((await invite(A,'send',B,'roulette','ABCD1234')).id,sent.id);
  assert.equal((await invite(B,'list')).invites[0].kind,'roulette');
  assert.equal((await invite(B,'accept',null,null,null,sent.id)).code,'ABCD1234');
  await db.query("update ojjuda_roulette_internal.rooms set status='spinning' where id=$1",[room]);await assert.rejects(()=>invite(A,'send',B,'roulette','ABCD1234'),/room_unavailable/);
  await assert.rejects(()=>run(A,'select * from ojjuda_roulette_internal.entries'),/permission denied/);
  await assert.rejects(()=>run(A,'select ojjuda_roulette_internal.arcade_eligible($1)',[A]),/permission denied/);
  const candidates=(await db.query("select pg_get_functiondef('ojjuda_ranking_internal.candidates(text,timestamptz,timestamptz)'::regprocedure) source")).rows[0].source;
  assert.ok(candidates.includes('board_participants')&&candidates.includes('bang_participants')&&candidates.includes('g.score between 1 and score_cap'),'existing highest streak / zero exclusion preserved');
  console.log('PASS: real core + integration migrations; payout ranking even negative net; abandonment/zero/pending/age/ban/month filters; blocked rows/history; existing batch/feed preserved; all-stale rooms hidden and fresh participants retained; room fields; secure friend invitations; private table/helper grants.');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
(async()=>{
 const db=new PGlite(),root=path.join(__dirname,'..');
 try {
  const member='10000000-0000-0000-0000-000000000001',banned='10000000-0000-0000-0000-000000000002';
  const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;
   create table public.profiles(id uuid primary key,nickname text);
   create table public.user_private(user_id uuid primary key,banned_until timestamptz,coins integer);
   create table public.game_scores(user_id uuid,game text,score integer,created_at timestamptz default now(),verified boolean default false);
   create schema ojjuda_game_internal;revoke all on schema ojjuda_game_internal from public;grant usage on schema ojjuda_game_internal to authenticated;
   create function ojjuda_game_internal.community_game_ranking(text) returns json language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception 'not_signed_in';end if;return '[{"source":"protected_day"}]'::json;end;$$;
   create function ojjuda_game_internal.community_game_monthly_ranking(text) returns json language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception 'not_signed_in';end if;return '[{"source":"protected_month"}]'::json;end;$$;
   revoke all on all functions in schema ojjuda_game_internal from public,anon;grant execute on all functions in schema ojjuda_game_internal to authenticated;
   insert into profiles values('${member}','회원'),('${banned}','제한 회원');
   insert into user_private values('${member}',null,37),('${banned}',now()+interval '1 day',99);
   insert into game_scores(user_id,game,score) values('${member}','runner',150),('${member}','runner',100),('${banned}','runner',40000);
   insert into game_scores(user_id,game,score,created_at) values('${member}','runner',40000,now()+interval '1 day'),('${member}','runner',30000,now()-interval '40 days');`);
  const migrations=path.join(root,'supabase/migrations');
  for(const suffix of ['_guest_game_rankings.sql','_guest_score_table_policy.sql','_batch_board_monthly_leaders.sql']) await db.exec(fs.readFileSync(path.join(migrations,fs.readdirSync(migrations).find(name=>name.endsWith(suffix))),'utf8'));
  const submit=async(token,score,id=randomUUID(),game='runner')=>(await db.query('select public.submit_guest_game_score($1,$2,$3,$4) as result',[game,score,token,id])).rows[0].result;
  const rank=async(token=null,period='day',game='runner')=>(await db.query('select public.guest_game_ranking($1,$2,$3) as result',[game,period,token])).rows[0].result;
  const count=async()=>{await db.exec('reset role');const n=(await db.query('select count(*)::int as n from ojjuda_guest_internal.scores')).rows[0].n;await db.exec('set role anon');return n;};
  const cool=async()=>{await db.exec("reset role;update ojjuda_guest_internal.scores set last_submitted_at=now()-interval '6 seconds';set role anon");};
  await db.exec('set role anon');
  assert.deepEqual(await rank(),[{nick:'회원',score:150,me:false,source:'member_record'}]);
  const id=randomUUID(),first=await submit(a,200,id);
  assert.deepEqual(first,{ok:true,guest:true,best:200,rank:null,reward:0,verified:false});
  assert.deepEqual(await submit(a,200,id),first,'same request is safe to retry');
  assert.equal((await submit(a,201,id)).reason,'request_conflict');
  assert.equal((await submit(a,250)).reason,'too_fast');
  assert.equal(await count(),1,'one best record per browser, game and KST day');
  assert.equal((await submit(b,300)).ok,true);
  let rows=await rank(a);
  assert.deepEqual(rows.map(r=>[r.nick,r.score,r.me]),[['손님',300,false],['손님',200,true],['회원',150,false]]);
  assert.deepEqual(Object.keys(rows[0]).sort(),['me','nick','score','source']);
  assert.ok(!JSON.stringify(rows).includes(a)&&!JSON.stringify(rows).includes(member),'identities and tokens stay private');
  assert.equal((await rank(b))[0].me,true,'different guests are distinct despite the same display name');
  await cool();assert.equal((await submit(a,350)).best,350);assert.equal(await count(),2);
  await cool();assert.equal((await submit(a,10)).best,350,'lower scores never replace the best');
  for(const [token,score,game] of [[a,-1,'runner'],[a,50001,'runner'],['short',1,'runner'],[null,1,'runner'],[a,1,'matgo'],[a,1,'photo_ttang'],[a,1,'chess'],[a,550001,'breakout']])
   assert.equal((await submit(token,score,randomUUID(),game)).reason,'invalid');
  assert.equal((await submit(c,0,randomUUID(),'mole')).ok,true,'zero remains a valid score');
  assert.equal((await submit(c,550000,randomUUID(),'breakout')).ok,true,'same Breakout upper bound as members');
  assert.deepEqual(await rank(a,'bad'),[]);assert.deepEqual(await rank(a,'day','matgo'),[]);
  for(const query of ['select * from ojjuda_guest_internal.scores','select * from game_scores',"update ojjuda_guest_internal.scores set score=99999", "select public.community_game_ranking('matgo')", "select public.community_game_monthly_ranking('photo_ttang')"])
   await assert.rejects(db.query(query),/permission denied/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${member}'`);
  const memberView=(await db.query("select public.community_game_ranking('runner') as result")).rows[0].result;
  assert.deepEqual(memberView.map(r=>[r.nick,r.score]),[['손님',350],['손님',300],['회원',150]]);
  assert.equal(memberView[2].me,true);
  assert.deepEqual((await db.query("select public.community_game_monthly_leaders(array['runner','photo_ttang']) as r")).rows[0].r,{runner:{nick:'손님',score:350,me:false,source:'guest_record'},photo_ttang:{source:'protected_month'}},'one batch preserves combined guest records and protected rankings');
  assert.deepEqual((await db.query("select public.community_game_ranking('matgo') as r")).rows[0].r,[{source:'protected_day'}]);
  assert.deepEqual((await db.query("select public.community_game_monthly_ranking('photo_ttang') as r")).rows[0].r,[{source:'protected_month'}]);
  await db.exec(`set request.jwt.claim.sub='${banned}'`);assert.equal((await submit(c,1)).reason,'banned');
  await db.exec("reset role;set request.jwt.claim.sub=''");
  await db.exec(`insert into ojjuda_guest_internal.scores values
   ((date_trunc('month',now() at time zone 'Asia/Seoul')-interval '1 day')::date,'runner',repeat('d',64),9999,(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 second',now(),gen_random_uuid(),9999),
   ((now() at time zone 'Asia/Seoul')::date+1,'runner',repeat('e',64),9998,now()+interval '1 day',now(),gen_random_uuid(),9998);set role anon;`);
  assert.deepEqual((await rank(a,'month')).map(r=>r.score),[350,300,150],'monthly includes valid guest/member bests, excluding future and previous month');
  assert.deepEqual((await db.query("select public.community_game_monthly_ranking('runner') as r")).rows[0].r.map(r=>r.score),[350,300,150]);
  await db.exec('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='ojjuda_guest_internal.scores'::regclass")).rows[0].relrowsecurity,true);
  const exposed=await db.query("select bool_or(prosecdef) as definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('submit_guest_game_score','guest_game_ranking','community_game_ranking','community_game_monthly_ranking')");
  assert.equal(exposed.rows[0].definer,false,'public endpoints run as caller');
  assert.deepEqual((await db.query('select coins from user_private order by user_id')).rows.map(r=>r.coins),[37,99],'guest scores never touch wallets');
  assert.equal((await db.query('select count(*)::int as n from game_scores')).rows[0].n,5,'member records are untouched');
  console.log('PASS: guest/member daily and monthly rankings, fixed guest names, browser separation, best-only/idempotent writes, limits, cooldown, private tables and protected rankings');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

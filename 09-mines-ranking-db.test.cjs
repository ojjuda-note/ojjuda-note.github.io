const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
// Reuse the deployed member-score fixture already exercised by Breakout's tests.
const memberSubmit=read('tests/breakout-score-db.test.cjs').match(/const submitBefore=`([\s\S]*?)`;/)[1].replace("'breakout' THEN 20000","'breakout' THEN 550000");
(async()=>{
 const db=new PGlite();
 try {
  const member='10000000-0000-0000-0000-000000000001',banned='10000000-0000-0000-0000-000000000002';
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_game_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;
   grant usage on schema ojjuda_game_internal to authenticated;
   create table public.profiles(id uuid primary key,nickname text);
   create table public.user_private(user_id uuid primary key,nickname text,coins integer,banned_until timestamptz);
   create table public.game_scores(user_id uuid,nick text,game text,score integer,reward integer,verified boolean default false,created_at timestamptz default now(),
    constraint game_scores_game_check check(game=any(array['ttang','mole','runner','stacker','breakout','snake','screw','screw_box','screw_flat','spot','carom4','carom3','pool8','janggi','chess','matgo'])));
   alter table public.game_scores enable row level security;
   create function public.is_banned(uuid) returns boolean language sql stable as $$select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
   create function ojjuda_game_internal.community_game_ranking(text) returns json language sql as $$select '[]'::json$$;
   create function ojjuda_game_internal.community_game_monthly_ranking(text) returns json language sql as $$select '[]'::json$$;
   insert into profiles values('${member}','여행친구'),('${banned}','제한회원');
   insert into user_private(user_id,coins,banned_until) values('${member}',37,null),('${banned}',99,now()+interval '1 day');`);
  await db.exec(memberSubmit);
  await db.exec(`revoke all on function ojjuda_game_internal.submit_score(text,integer) from public,anon;
   grant execute on function ojjuda_game_internal.submit_score(text,integer) to authenticated;
   create function public.submit_score(p_game text,p_score integer) returns json language sql security invoker set search_path='' as $$select ojjuda_game_internal.submit_score(p_game,p_score)$$;
   revoke all on function public.submit_score(text,integer) from public,anon;grant execute on function public.submit_score(text,integer) to authenticated;`);
  for(const name of ['20261006164811_guest_game_rankings.sql','20261006165024_guest_score_table_policy.sql','20261009051516_batch_board_monthly_leaders.sql'])await db.exec(read('supabase/migrations/'+name));
  const metadata=async()=>(await db.query(`select proname,prosecdef,proconfig,proacl::text from pg_proc where (pronamespace='ojjuda_game_internal'::regnamespace and proname='submit_score') or (pronamespace='ojjuda_guest_internal'::regnamespace and proname='score_limit') order by proname`)).rows;
  await db.exec(read('supabase/migrations/20261011134216_tour_game_rankings.sql'));
  await db.exec(read('supabase/migrations/20261012153542_saetbyeol_game_rankings.sql'));
  const before=await metadata(),migration=read('supabase/migrations/20261012162013_mines_game_rankings.sql');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual(await metadata(),before,'idempotent migration preserves permissions and search paths');
  const memberSave=async(score,game='mines')=>(await db.query('select public.submit_score($1,$2) value',[game,score])).rows[0].value;
  const rank=async()=>(await db.query("select public.community_game_monthly_ranking('mines') value")).rows[0].value;
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${member}'`);
  const result=await memberSave(39955);
  assert.equal(result.ok,true);assert.equal(result.verified,false);assert.equal(result.reward,0);assert.equal(result.coins,37);
  assert.equal((await memberSave(39000)).reason,'too_fast');
  for(const score of [-1,90000,null])assert.equal((await memberSave(score)).reason,'invalid');
  assert.equal((await memberSave(50001,'runner')).reason,'invalid');
  await assert.rejects(db.query('select * from public.game_scores'),/permission denied/);
  await db.exec("reset role;update public.game_scores set created_at=now()-interval '10 seconds'");
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${member}'`);
  assert.equal((await memberSave(30000)).ok,true,'a slower valid win remains recordable');
  assert.equal((await rank())[0].score,39955,'a lower result never replaces a higher monthly best');
  const leaders=(await db.query("select public.community_game_monthly_leaders(array['mines','runner']) value")).rows[0].value;
  assert.equal(leaders.mines.nick,'여행친구');assert.equal(leaders.mines.score,39955);
  await db.exec(`set request.jwt.claim.sub='${banned}'`);
  assert.equal((await memberSave(9999)).reason,'banned');
  await db.exec("set request.jwt.claim.sub='';set role anon");
  await assert.rejects(memberSave(1000),/permission denied/);
  const token='a'.repeat(64),id=randomUUID();
  const guestSave=async(score)=>(await db.query("select public.submit_guest_game_score('mines',$1,$2,$3) value",[score,token,id])).rows[0].value;
  assert.equal((await guestSave(49950)).ok,true);assert.equal((await guestSave(49950)).ok,true);
  assert.equal((await guestSave(49951)).reason,'request_conflict');
  assert.equal((await guestSave(90000)).reason,'invalid');
  assert.deepEqual((await rank()).map(row=>[row.nick,row.score]),[['손님',49950],['여행친구',39955]]);
  await db.exec(`reset role;
   insert into game_scores(user_id,nick,game,score,created_at) values
    ('${banned}','제한회원','mines',89000,now()),('${member}','여행친구','mines',88000,now()+interval '1 day'),('${member}','여행친구','mines',87000,now()-interval '40 days');`);
  assert.deepEqual((await rank()).map(row=>row.score),[49950,39955],'banned, old and future records stay excluded');
  assert.equal((await db.query('select coins from user_private where user_id=$1',[member])).rows[0].coins,37);
  assert.equal((await db.query('select count(*)::int n from game_scores where verified or reward>0')).rows[0].n,0);
  const first='10000000-0000-0000-0000-000000000003';
  await db.exec(`insert into profiles values('${first}','먼저 달성');
   insert into game_scores(user_id,nick,game,score,created_at) values('${first}','먼저 달성','mines',49950,now()-interval '30 seconds');`);
  assert.equal((await rank())[0].nick,'먼저 달성','equal difficulty and time rank the earlier achievement first');
  await db.exec(`insert into game_scores(user_id,nick,game,score,created_at) values
   ('${member}','여행친구','mines',69940,now()),('${first}','먼저 달성','mines',19990,now());`);
  assert.equal((await rank())[0].nick,'여행친구','advanced 60 seconds outranks beginner 10 seconds');
  console.log('PASS: Minesweeper member/guest records, lower scores, monthly best, bounds, bans, permissions and zero rewards');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

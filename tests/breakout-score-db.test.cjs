const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
// The deployed score function before this migration; no production member data.
const submitBefore=`CREATE OR REPLACE FUNCTION ojjuda_game_internal.submit_score(p_game text, p_score integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();v_limit integer;v_nick text;v_balance integer;v_best integer;
 v_now timestamptz;v_day_start timestamptz;v_day_end timestamptz;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE='42501';END IF;
 IF public.is_banned(v_actor) THEN RETURN json_build_object('ok',false,'reason','banned');END IF;
 v_limit:=CASE p_game
  WHEN 'mole' THEN 200 WHEN 'runner' THEN 50000 WHEN 'stacker' THEN 300
  WHEN 'breakout' THEN 20000 WHEN 'snake' THEN 300
  WHEN 'screw' THEN 1000000 WHEN 'screw_box' THEN 1000000 WHEN 'screw_flat' THEN 1000000
  WHEN 'ttang' THEN 1000 WHEN 'spot' THEN 6 WHEN 'carom4' THEN 1000 WHEN 'carom3' THEN 1000
  WHEN 'pool8' THEN 8 WHEN 'janggi' THEN 1 WHEN 'chess' THEN 1 WHEN 'matgo' THEN 1000000
 END;
 IF v_limit IS NULL OR p_score IS NULL OR p_score<0 OR p_score>v_limit THEN
  RETURN json_build_object('ok',false,'reason','invalid');
 END IF;
 -- Serialize this member/game pair, without locking or updating the wallet.
 PERFORM pg_advisory_xact_lock(hashtextextended('ojjuda-personal-score:'||v_actor::text||':'||p_game,0));
 SELECT p.nickname,u.coins INTO v_nick,v_balance
 FROM public.profiles p JOIN public.user_private u ON u.user_id=p.id WHERE p.id=v_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_account' USING ERRCODE='42501';END IF;
 IF public.is_banned(v_actor) THEN RETURN json_build_object('ok',false,'reason','banned');END IF;
 v_now:=clock_timestamp();
 v_day_start:=date_trunc('day',v_now AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
 v_day_end:=(date_trunc('day',v_now AT TIME ZONE 'Asia/Seoul')+interval '1 day') AT TIME ZONE 'Asia/Seoul';
 IF EXISTS(SELECT 1 FROM public.game_scores g
  WHERE g.user_id=v_actor AND g.game=p_game AND g.created_at>v_now-interval '5 seconds') THEN
  RETURN json_build_object('ok',false,'reason','too_fast');
 END IF;
 INSERT INTO public.game_scores(user_id,nick,game,score,reward,verified,created_at)
 VALUES(v_actor,v_nick,p_game,p_score,0,false,v_now);
 SELECT max(g.score) INTO v_best FROM public.game_scores g
 WHERE g.user_id=v_actor AND g.game=p_game AND g.created_at>=v_day_start AND g.created_at<v_day_end;
 RETURN json_build_object('ok',true,'reward',0,'coins',v_balance,'best',v_best,'rank',null,'left',0,'verified',false);
END;$function$
`;
(async()=>{const db=new PGlite();try{
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_game_internal;create schema ojjuda_matgo_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,nickname text);
 create table public.user_private(user_id uuid primary key,coins integer,banned_until timestamptz);
 create function public.is_banned(uuid) returns boolean language sql stable as $$select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
 create table public.board_games(id uuid primary key,kind text,p1 uuid,p2 uuid,status text,result text,updated_at timestamptz);
 create table public.game_scores(user_id uuid,nick text,game text,score integer,reward integer,verified boolean default false,created_at timestamptz default now());
 create table ojjuda_matgo_internal.wallets(user_id uuid,gold bigint,updated_at timestamptz);
 insert into profiles values('${a}','첫 회원'),('${b}','다른 회원');
 insert into user_private values('${a}',100,null),('${b}',200,null);
 grant usage on schema auth,public,ojjuda_game_internal to authenticated;
 insert into game_scores(user_id,nick,game,score,reward,created_at) values('${b}','다른 회원','breakout',504100,0,now()-interval '10 seconds');`);
 const read=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
 await db.exec(read('20261005050053_community_game_ranking.sql'));
 await db.exec(read('20261005053032_current_game_win_streaks.sql'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/board_monthly_ranking.sql'),'utf8'));
 await db.exec(submitBefore);
 await db.exec(`revoke all on function ojjuda_game_internal.submit_score(text,integer) from public,anon;
 grant execute on function ojjuda_game_internal.submit_score(text,integer) to authenticated;
 create function public.submit_score(p_game text,p_score integer) returns json language sql security invoker set search_path='' as $$select ojjuda_game_internal.submit_score(p_game,p_score)$$;
 revoke all on function public.submit_score(text,integer) from public,anon;
 grant execute on function public.submit_score(text,integer) to authenticated;
 set role authenticated;set request.jwt.claim.sub='${a}';`);
 const save=async(game,score)=>(await db.query('select public.submit_score($1,$2) value',[game,score])).rows[0].value;
 const rank=async(monthly=false)=>(await db.query('select public.'+(monthly?'community_game_monthly_ranking':'community_game_ranking')+"('breakout') value")).rows[0].value;
 assert.equal((await save('breakout',504100)).reason,'invalid');assert.deepEqual(await rank(),[]);assert.deepEqual(await rank(true),[]);
 await db.exec('reset role');
 const metadata=async()=>(await db.query("select proname,prosecdef,proconfig,proacl::text grants from pg_proc where pronamespace='ojjuda_game_internal'::regnamespace and proname in ('submit_score','community_game_ranking','community_game_monthly_ranking') order by proname")).rows;
 await db.exec(read('20261006060121_breakout_100_stage_score_limit.sql'));
 const before=await metadata(),migration=read('20261006064010_breakout_thousand_bricks_score_limit.sql');
 await db.exec(migration);await db.exec(migration);assert.deepEqual(await metadata(),before,'the change is idempotent and preserves security mode, search path and grants');
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
 const result=await save('breakout',504100);assert.equal(result.ok,true);assert.equal(result.best,504100);assert.equal(result.reward,0);assert.equal(result.coins,100);assert.equal(result.verified,false);
 assert.deepEqual((await rank()).map(r=>r.score),[504100,504100]);assert.deepEqual((await rank(true)).map(r=>r.score),[504100,504100]);
 assert.equal((await save('breakout',504100)).reason,'too_fast','existing per-game submission throttle remains');
 for(const score of [550001,-1,null])assert.equal((await save('breakout',score)).reason,'invalid');
 assert.equal((await save('runner',50001)).reason,'invalid');assert.equal((await save('runner',50000)).ok,true,'another game keeps its existing limit');
 await assert.rejects(db.query('select * from public.game_scores'),/permission denied/);
 await db.exec('reset role');await db.exec(`update game_scores set created_at=now()-interval '6 seconds' where user_id='${a}' and game='breakout';set role authenticated`);
 assert.equal((await save('breakout',550000)).ok,true,'the new upper boundary is accepted');
 await db.exec("set request.jwt.claim.sub=''");await assert.rejects(save('breakout',10),/not_signed_in/);
 await db.exec('set role anon');await assert.rejects(save('breakout',10),/permission denied/);await assert.rejects(rank(),/permission denied/);
 await db.exec('reset role');assert.deepEqual((await db.query('select coins from public.user_private order by user_id')).rows.map(r=>r.coins),[100,200]);
 assert.equal((await db.query('select bool_or(verified) value from game_scores')).rows[0].value,false);
 console.log('PASS: 504,100-point full-run submission and daily/monthly rankings, 550,000 boundary, unchanged wallet/reward/other-game limits, auth, throttle, privacy, grants and idempotence');
}finally{await db.close()}})().catch(error=>{console.error(error);process.exitCode=1});

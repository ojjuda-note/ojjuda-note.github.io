const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{const db=new PGlite();try{
 const a=randomUUID(),b=randomUUID(),minor=randomUUID(),banned=randomUUID();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema ojjuda_game_internal;create schema ojjuda_guest_internal;
 create schema ojjuda_matgo_internal;create schema ojjuda_poker_internal;create schema ojjuda_marble_internal;
 create schema ojjuda_tank_internal;create schema ojjuda_account_internal;create schema ojjuda_rewards_internal;
 grant usage on schema public,auth,ojjuda_guest_internal to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nickname text);
 create table user_private(user_id uuid primary key,banned_until timestamptz);
 create table ojjuda_account_internal.member_identity(user_id uuid,birth_date date);
 create function public.is_banned(uuid) returns boolean language sql stable as $$select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
 create function public.blocked_between(uuid,uuid) returns boolean language sql stable as $$select false$$;
 create function ojjuda_account_internal.age_on(date,date) returns int language sql immutable as $$select extract(year from age($2,$1))::int$$;
 create function ojjuda_poker_internal.check_member(uuid) returns void language plpgsql as $$begin
  if $1 is null or not exists(select 1 from ojjuda_account_internal.member_identity where user_id=$1 and birth_date<=current_date-interval '19 years') then raise exception 'adult_required';end if;
 end$$;
 create table public.board_games(id uuid,p1 uuid,p2 uuid,kind text,status text,result text,updated_at timestamptz);
 create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,game text,difficulty text,outcome text,created_at timestamptz);
 create table ojjuda_matgo_internal.wallets(user_id uuid primary key,gold bigint,round_id uuid,last_round uuid);
 create table ojjuda_matgo_internal.rooms(id uuid,host_id uuid,guest_id uuid,status text,result jsonb,round_no int,created_at timestamptz);
 create table ojjuda_poker_internal.rooms(id uuid,members uuid[],round int,settled_round int,state jsonb,mode text,created_at timestamptz);
 create table ojjuda_marble_internal.rooms(id uuid,members uuid[],ranked_at timestamptz,state jsonb);
 create table ojjuda_tank_internal.rooms(id uuid,members uuid[],status text,mode text,state jsonb);
 create function public.community_game_ranking(p_game text) returns json language plpgsql as $$begin return '[{"nick":"untouched","score":7}]'::json;end$$;
 create function public.community_game_monthly_ranking(p_game text) returns json language plpgsql as $$begin return '[{"nick":"untouched","score":7}]'::json;end$$;
 create function ojjuda_guest_internal.ranking(text,text,text) returns json language sql as $$select '[]'::json$$;
 create function public.guest_game_ranking(p_game text,p_period text default 'day',p_guest_token text default null) returns json language sql as $$select '[]'::json$$;
 create function ojjuda_rewards_internal.monthly_candidates(p_as_of timestamptz default now())
 returns table(game text,user_id uuid,identity_key text,nickname text,score bigint,tie_at timestamptz) language sql as $$
 select 'runner','${a}'::uuid,'member:${a}','A',7::bigint,p_as_of union all
 select 'matgo','${a}'::uuid,'member:${a}','A',999999::bigint,p_as_of$$;
 insert into profiles values('${a}','A'),('${b}','B'),('${minor}','minor'),('${banned}','banned');
 insert into user_private values('${banned}',now()+interval '1 day');
 insert into ojjuda_account_internal.member_identity values('${a}','1990-01-01'),('${b}','1990-01-01'),('${minor}','2015-01-01'),('${banned}','1990-01-01');`);
 await db.exec(read('supabase/migrations/20261022121120_game_ranking_criteria.sql'));

 await db.exec(`create table ojjuda_matgo_internal.fun_purchases(user_id uuid,kind text,reference_id uuid);
 create function ojjuda_matgo_internal.ranked_settle(p_actor uuid,p_round uuid,p_gold bigint,p_first smallint,p_carry integer,p_outcome text)
 returns jsonb language plpgsql as $$declare v_count boolean;begin
 v_count:=p_outcome<>'draw' and not exists(select 1 from ojjuda_matgo_internal.fun_purchases
    where user_id=p_actor and kind='tazza' and reference_id=p_round);
 return jsonb_build_object('counted',v_count);end;$$;`);
 await db.exec(read('supabase/migrations/20261022130306_multiplayer_ranking_details.sql'));
 const rank=async game=>(await db.query('select public.community_game_monthly_ranking($1) value',[game])).rows[0].value;
 const claims=async id=>db.exec(`set request.jwt.claim.sub='${id||''}'`);
 await claims(a);
 const tank=async(user,opponents,won,{mode='solo',other=null,draw=false,closed=false}={})=>{
  const id=randomUUID(),members=other?[user,other]:[user],tanks=Array.from({length:opponents+1},(_,i)=>({hp:(draw?false:won?i===0:i===1)?30:0}));
  await db.query("insert into ojjuda_tank_internal.rooms values($1,$2,'active',$3,$4)",[id,members,mode,{tanks}]);
  await db.query("update ojjuda_tank_internal.rooms set status=$2 where id=$1",[id,closed?'closed':'finished']);
  return id;
 };
 for(let i=0;i<5;i++)await tank(a,4,true);
 const big=await tank(b,11,true);
 assert.deepEqual((await rank('tank')).map(x=>[x.nick,x.opponents,x.score]),[['B',11,1],['A',4,5]],'11 opponents beat five wins against four');
 await tank(a,11,true);
 assert.equal((await rank('tank'))[0].nick,'B','equal count and streak: earlier achiever first');
 await tank(a,11,true);
 assert.equal((await rank('tank'))[0].score,2,'same opponent field sorts by streak');
 await tank(a,11,false);
 assert.deepEqual((await rank('tank')).map(x=>[x.nick,x.opponents,x.score]),[['B',11,1],['A',4,5]],'loss breaks only that field, no mixing easier wins');
 await tank(b,11,false,{draw:true});assert.equal((await rank('tank'))[0].nick,'A');
 await tank(a,4,false,{closed:true});assert.deepEqual(await rank('tank'),[],'leaving resets the correct opponent group');
 const paid=await tank(a,11,true);
 await db.query("update ojjuda_tank_internal.rooms set state=state||$2::jsonb where id=$1",[paid,{paid:true,weapon:9}]);
 await db.query("update ojjuda_tank_internal.rooms set status='finished' where id=$1",[paid]);
 assert.equal((await rank('tank'))[0].score,1,'paid games count, duplicate finish does not');
 await tank(b,11,true,{mode:'local'});assert.equal((await rank('tank')).length,1,'same-device seats have no member attribution');
 await tank(banned,11,true);assert.equal((await rank('tank')).length,1,'banned users excluded');
 // Shared territory round ID; member/guest records are separate and idempotent.
 const territory=async(user,won,token=null,round=randomUUID())=>{await claims(user);return (await db.query('select public.record_ttang_result($1,$2,$3) v',[round,won,token])).rows[0].v;};
 const shared=randomUUID();assert.equal((await territory(a,true,null,shared)).ok,true);
 assert.equal((await territory(a,true,null,shared)).duplicate,true);
 assert.equal((await territory(a,false,null,shared)).reason,'request_conflict');
 assert.equal((await territory(b,false,null,shared)).ok,true);
 await claims(a);assert.deepEqual((await rank('ttang')).map(x=>[x.nick,x.score]),[['A',1]]);
 await db.exec("update ojjuda_guest_internal.round_records set achieved_at=now()-interval '6 seconds' where game='ttang'");
 await territory(a,false);assert.deepEqual(await rank('ttang'),[]);
 await territory(null,true,'a'.repeat(64));
 await db.exec('set role anon');
 assert.ok((await db.query("select public.guest_game_ranking('ttang','month',$1) v",['a'.repeat(64)])).rows[0].v.some(x=>x.me&&x.score===1));
 await assert.rejects(db.query('insert into ojjuda_guest_internal.round_records(game) values($1)',['ttang']),/permission denied/);
 await db.exec('reset role');
 // Picture records count distinct completed stages, never partial spot points.
 const picture=async(user,stage,token=null)=>{await claims(user);return (await db.query('select public.record_spot_clear($1,$2) v',[stage,token])).rows[0].v;};
 assert.equal((await picture(a,1)).score,1);assert.equal((await picture(a,1)).duplicate,true);
 assert.equal((await picture(a,2)).score,2);await picture(b,1);
 assert.deepEqual((await rank('spot')).map(x=>[x.nick,x.score]),[['A',2],['B',1]]);
 await picture(b,2);assert.equal((await rank('spot'))[0].nick,'A');
 assert.equal((await picture(b,49)).reason,'invalid');assert.equal((await picture(banned,3)).reason,'banned');
 assert.equal((await picture(null,3)).reason,'invalid');assert.equal((await picture(null,3,'a'.repeat(64))).score,1);
 await db.exec('set role anon');await assert.rejects(db.query('select * from ojjuda_guest_internal.spot_clears'),/permission denied/);await db.exec('reset role');
 const older=randomUUID();await db.query("insert into ojjuda_matgo_internal.fun_purchases values($1,'tazza',$2)",[a,older]);
 const paidResult=(await db.query("select ojjuda_matgo_internal.ranked_settle($1,$2,6000,0::smallint,1,'win') v",[a,older])).rows[0].v;
 assert.equal(paidResult.counted,true,'legacy paid Matgo victories included');
 const awards=(await db.query('select * from ojjuda_rewards_internal.monthly_candidates(now())')).rows;
 assert.equal(awards.filter(x=>x.game==='tank').length,1);assert.equal(awards.find(x=>x.game==='tank').nickname,'A');
 assert.equal(awards.find(x=>x.game==='spot'&&x.user_id===a).score,2);
 assert.equal(awards.find(x=>x.game==='ttang').score,1);
 // Production privacy helpers stay caller-scoped even inside a definer RPC.
 // A permissive stub/root-only test misses the whole-board failure for members.
 await tank(b,11,true);
 await db.exec('create table public.blocks(blocker uuid,blocked uuid)');
 const helperSource=read('supabase/migrations/20260930231544_scope_world_privacy_helpers.sql');
 await db.exec('drop function public.is_banned(uuid);drop function public.blocked_between(uuid,uuid)');
 for(const name of ['is_banned','blocked_between']){
  const start=helperSource.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  const end=helperSource.indexOf('$function$;',start)+'$function$;'.length;
  await db.exec(helperSource.slice(start,end));
 }
 await db.exec(`revoke execute on function public.is_banned(uuid),public.blocked_between(uuid,uuid) from public,anon;
 grant execute on function public.is_banned(uuid),public.blocked_between(uuid,uuid) to authenticated,service_role;`);
 await db.exec(read('supabase/migrations/20261009051516_batch_board_monthly_leaders.sql'));
 await claims(a);await db.exec('set role authenticated');
 await assert.rejects(rank('tank'),/helper_scope_denied/,'reproduce another participant breaking tank ranking');
 await assert.rejects(rank('spot'),/helper_scope_denied/,'reproduce member/guest picture ranking failure');
 const board=async()=>(await db.query("select public.community_game_monthly_leaders(array['tank','spot','runner']) v")).rows[0].v;
 await assert.rejects(board(),/helper_scope_denied/,'one scoped helper error breaks the entire batch');
 await db.exec('reset role');
 const privacyBefore=(await db.query("select pg_get_functiondef('public.is_banned(uuid)'::regprocedure) value")).rows[0].value;
 await db.exec(read('supabase/migrations/20261024090740_ranking_member_visibility.sql'));
 assert.equal((await db.query("select pg_get_functiondef('public.is_banned(uuid)'::regprocedure) value")).rows[0].value,privacyBefore);
 await db.exec('set role authenticated');
 assert.ok((await rank('tank')).some(x=>x.nick==='B'),'ordinary members can load another eligible participant');
 assert.equal((await rank('tank')).some(x=>x.nick==='banned'),false,'banned candidates remain excluded');
 assert.deepEqual((await rank('spot')).map(x=>[x.nick,x.score]),[['A',2],['B',2],['손님',1]]);
 assert.deepEqual(Object.keys(await board()).sort(),['runner','spot','tank']);
 await assert.rejects(db.query('select public.is_banned($1)',[b]),/helper_scope_denied/,'the direct privacy RPC remains restricted');
 await assert.rejects(db.query('select * from public.user_private'),/permission denied/);
 await db.exec('reset role');await db.query('insert into public.blocks values($1,$2)',[a,b]);await db.exec('set role authenticated');
 assert.equal((await rank('tank')).some(x=>x.nick==='B'),false,'block filtering remains active');
 await claims(minor);await assert.rejects(rank('matgo'),/adult_required/);
 await claims(null);await db.exec('reset role;set role anon');
 const guest=(await db.query("select public.guest_game_ranking('spot','month',$1) v",['a'.repeat(64)])).rows[0].v;
 assert.ok(guest.some(x=>x.nick==='손님'&&x.me&&x.score===1),'existing guest picture rankings still work');
 await assert.rejects(rank('tank'),/not_signed_in/);
 await assert.rejects(board(),/permission denied/);
 await db.exec('reset role');
 await db.exec("update ojjuda_guest_internal.spot_clears set achieved_at=now()-interval '40 days'");await claims(a);assert.deepEqual(await rank('spot'),[]);
 console.log('PASS: tank opponent priority, streaks, ties, actual field, losses, draws, paid results, territory round isolation, picture counts, duplicates, month boundaries and reward criteria');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});

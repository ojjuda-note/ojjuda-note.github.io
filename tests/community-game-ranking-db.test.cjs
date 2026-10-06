const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002',blocked='10000000-0000-0000-0000-000000000003';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nickname text);
 create schema ojjuda_matgo_internal;
 create table ojjuda_matgo_internal.wallets(user_id uuid primary key,gold bigint,updated_at timestamptz);
 insert into ojjuda_matgo_internal.wallets values('${a}',9000,now()-interval '3 days'),('${b}',100,now()),('${blocked}',999999,now());
 create table game_scores(user_id uuid,game text,score int,verified boolean default false,created_at timestamptz default now());
 create table public.user_private(user_id uuid primary key,banned_until timestamptz);
 insert into user_private values('${blocked}',now()+interval '1 day');
 create function public.is_banned(uuid) returns boolean language plpgsql stable as $$begin if auth.uid() is distinct from $1 then raise exception 'helper_scope_denied';end if;return $1='${blocked}'::uuid;end$$;
 grant usage on schema auth,public to authenticated,anon;
 insert into profiles values('${a}','첫 회원'),('${b}','다른 회원'),('${blocked}','제한 회원');
 insert into game_scores(user_id,game,score) values('${a}','runner',100),('${a}','runner',120),('${b}','runner',250),('${blocked}','runner',999),('${a}','runner',999999),('${b}','screw_flat',99),('${a}','stacker',0);
 insert into game_scores(user_id,game,score,created_at) values('${a}','runner',50000,now()-interval '2 days'),('${b}','runner',49999,now()+interval '2 days');`);
 const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005050053_community_game_ranking.sql'),'utf8');await db.exec(migration);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005050738_fix_community_ranking_member_scope.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261005051907_current_gold_matgo_ranking.sql'),'utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
 const ranking=async game=>(await db.query('select public.community_game_ranking($1) as value',[game])).rows[0].value;
 const gold=await ranking('matgo');
 assert.deepEqual(gold,[{nick:'첫 회원',score:9000,me:true,source:'current_gold'},{nick:'다른 회원',score:100,me:false,source:'current_gold'}],'current gold includes old wallets and excludes banned members');
 await assert.rejects(db.query('select * from ojjuda_matgo_internal.wallets'),/permission denied/,'wallet details remain private');
 await db.exec(`reset role;update ojjuda_matgo_internal.wallets set gold=2000000 where user_id='${b}';set role authenticated`);
 assert.equal((await ranking('matgo'))[0].score,2000000,'new balance, beyond the former score cap, changes the winner');
 await db.exec(`reset role;update ojjuda_matgo_internal.wallets set gold=0 where user_id='${b}';set role authenticated`);
 assert.deepEqual((await ranking('matgo')).map(r=>r.score),[9000,0],'spending gold lowers ranking and zero remains visible');
 const first=await ranking('runner');
 assert.deepEqual(first,[{nick:'다른 회원',score:250,me:false,source:'member_record'},{nick:'첫 회원',score:120,me:true,source:'member_record'}]);
 assert.deepEqual(Object.keys(first[0]).sort(),['me','nick','score','source'],'no member ids or personal information exposed');
 await db.exec(`set request.jwt.claim.sub='${b}'`);
 assert.deepEqual((await ranking('matgo')).map(({me,...r})=>r),gold.map(({me,...r})=>({...r,score:r.nick==='다른 회원'?0:r.score})), 'members see the same gold balances');
 const second=await ranking('runner');
 assert.deepEqual(second.map(({me,...row})=>row),first.map(({me,...row})=>row),'all members see identical ranking');
 assert.equal(second[0].me,true);assert.equal((await ranking('stacker'))[0].score,0);
 assert.equal((await ranking('screw_flat'))[0].score,99);assert.deepEqual(await ranking('screw_box'),[]);
 assert.deepEqual(await ranking('unknown'),[]);
 await assert.rejects(db.query('select * from game_scores'),/permission denied/,'raw score rows stay private');
 await db.exec("set request.jwt.claim.sub=''");await assert.rejects(ranking('runner'),/not_signed_in/);
 await db.exec('set role anon');await assert.rejects(ranking('runner'),/permission denied/);
 await db.exec('reset role');
 assert.equal((await db.query('select bool_or(verified) as value from game_scores')).rows[0].value,false,'public display never marks submitted scores as verified');
 assert.equal((await db.query("select prosecdef from pg_proc where oid='public.community_game_ranking(text)'::regprocedure")).rows[0].prosecdef,false);
 await db.exec(`create table public.board_games(id uuid,p1 uuid,p2 uuid,result text,updated_at timestamptz,kind text,status text);
 create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,created_at timestamptz,game text,difficulty text,outcome text);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/board_monthly_ranking.sql'),'utf8'));
 await db.exec(`delete from game_scores;
 insert into game_scores(user_id,game,score,created_at) values
 ('${a}','runner',400,date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 ('${b}','runner',300,now()),
 ('${b}','runner',49999,(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 second'),
 ('${b}','runner',49998,now()+interval '1 second'),
 ('${blocked}','runner',50000,now());
 update ojjuda_matgo_internal.wallets set updated_at=now();
 update ojjuda_matgo_internal.wallets set updated_at=(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 second' where user_id='${b}';
 insert into ojjuda_game_internal.practice_results values
 ('${a}','20000000-0000-0000-0000-000000000001',(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 second','chess','easy','win'),
 ('${a}','20000000-0000-0000-0000-000000000002',now(),'chess','easy','win');
 set role authenticated;set request.jwt.claim.sub='${a}';`);
 const monthly=async game=>(await db.query('select public.community_game_monthly_ranking($1) as value',[game])).rows[0].value;
 assert.deepEqual((await monthly('runner')).map(r=>r.score),[400,300],'KST month start inclusive, previous month/future/banned excluded');
 assert.deepEqual((await monthly('matgo')).map(r=>r.score),[9000],'only wallets updated this month participate');
 assert.equal((await monthly('chess_easy'))[0].score,1,'streak starts again each month');
 assert.deepEqual(await monthly('unknown'),[]);
 await db.exec("set request.jwt.claim.sub=''");await assert.rejects(monthly('runner'),/not_signed_in/);
 await db.exec('set role anon');await assert.rejects(monthly('runner'),/permission denied/);
 console.log('PASS: KST monthly score/streak/wallet bounds, future/banned exclusion, authorization and existing arcade behavior');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1});

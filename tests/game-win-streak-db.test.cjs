const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
 const id=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_game_internal;create schema ojjuda_matgo_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,nickname text);
 create table public.user_private(user_id uuid primary key,banned_until timestamptz);
 create function public.is_banned(uuid) returns boolean language sql stable as $$select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
 create table public.board_games(id uuid primary key,kind text,p1 uuid,p2 uuid,status text,result text,updated_at timestamptz);
 create table public.game_scores(user_id uuid,game text,score int,created_at timestamptz);
 create table ojjuda_matgo_internal.wallets(user_id uuid,gold bigint);
 insert into profiles values('${a}','첫 회원'),('${b}','다른 회원');
 grant usage on schema auth,public,ojjuda_game_internal to authenticated;
 insert into board_games values
 ('${id(1)}','chess','${a}','${b}','done','p1',now()-interval '4 days'),
 ('${id(2)}','chess','${a}','${b}','done','p1',now()-interval '3 days'),
 ('${id(3)}','chess','${a}','${b}','playing',null,now());`);
 const read=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/'+name),'utf8');
 await db.exec(read('20261005050053_community_game_ranking.sql'));
 await db.exec(read('20261005053032_current_game_win_streaks.sql'));
 const login=async who=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${who}'`);
 const rank=async game=>(await db.query('select public.community_game_ranking($1) value',[game])).rows[0].value;
 const save=async(game,n,outcome,difficulty='normal')=>db.query('select public.record_practice_game_result($1,$2,$3,$4)',[game,id(n),outcome,difficulty]);
 await login(a);
 assert.deepEqual(await rank('chess'),[{nick:'첫 회원',score:2,me:true,source:'current_streak'}],'online wins persist across days; unfinished matches do not count');
 await login(b);assert.equal((await rank('chess'))[0].score,2);assert.equal((await rank('chess'))[0].me,false);
 await login(a);
 await save('chess',4,'win');await save('chess',4,'win');assert.equal((await rank('chess_normal'))[0].score,1,'practice outcome counts once');assert.equal((await rank('chess_online'))[0].score,2,'online wins stay separate');
 await assert.rejects(save('chess',4,'loss'),/result_already_recorded/);
 await assert.rejects(save('chess',1,'win'),/online_result_is_server_owned/);
 await save('chess',5,'loss');assert.deepEqual(await rank('chess_normal'),[],'loss clears current streak');
 await save('chess',6,'win');assert.equal((await rank('chess_normal'))[0].score,1);
 await save('chess',8,'win','hard');await save('chess',9,'win','hard');assert.equal((await rank('chess_hard'))[0].score,2,'difficulty streaks are independent');
 await save('chess',7,'draw');assert.deepEqual(await rank('chess_normal'),[],'draw breaks consecutive wins');
 for(const [i,game] of ['carom4','carom3','pool8','janggi'].entries()){
  await save(game,10+i,'win');assert.equal((await rank(game+'_normal'))[0].score,1,game+' saves independently');
 }
 await save('pool8',20,'loss');assert.deepEqual(await rank('pool8_normal'),[]);assert.equal((await rank('carom4_normal'))[0].score,1);
 await assert.rejects(save('chess',21,'win','invalid'),/invalid_difficulty/);
 await assert.rejects(save('mole',21,'win'),/invalid_result/);await assert.rejects(save('chess',21,'made_up'),/invalid_result/);
 await assert.rejects(db.query('select * from ojjuda_game_internal.practice_results'),/permission denied/);
 await assert.rejects(db.query("update ojjuda_game_internal.practice_results set outcome='win'"),/permission denied/);
 await db.exec(`reset role;update board_games set status='done',result='p2',updated_at=clock_timestamp() where id='${id(3)}'`);
 await login(a);assert.deepEqual((await rank('chess')).map(({me,...r})=>r),[{nick:'다른 회원',score:1,source:'current_streak'}],'server final result updates both players without client submission');
 await db.exec(`reset role;insert into user_private values('${a}',now()+interval '1 day')`);
 await login(a);await assert.rejects(save('chess',22,'win'),/banned/);assert.deepEqual(await rank('carom4_normal'),[]);
 await db.exec("set request.jwt.claim.sub=''");await assert.rejects(rank('chess'),/not_signed_in/);await assert.rejects(save('chess',23,'win'),/not_signed_in/);
 await db.exec('reset role;set role anon');await assert.rejects(rank('chess'),/permission denied/);await assert.rejects(save('chess',23,'win'),/permission denied/);
 console.log('PASS: persistent current streaks, online/practice results, loss/draw reset, per-game isolation, duplicate protection, server-owned online results and private-row access');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1});

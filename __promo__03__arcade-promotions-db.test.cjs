const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;grant usage on schema auth to anon,authenticated;
 create table public.profiles(id uuid primary key);create table public.game_scores(game text,created_at timestamptz);
 create table public.board_games(kind text,status text,result text,updated_at timestamptz,p1 uuid,p2 uuid);
 create schema ojjuda_guest_internal;create table ojjuda_guest_internal.scores(day date,game text,guest_hash text,last_request_id uuid,last_submitted_at timestamptz,primary key(day,game,guest_hash));
 create table ojjuda_guest_internal.round_records(game text,achieved_at timestamptz,source text);
 create table ojjuda_guest_internal.spot_clears(achieved_at timestamptz);
 create schema ojjuda_game_internal;create table ojjuda_game_internal.practice_results(game text,created_at timestamptz);
 create schema ojjuda_photo_internal;create table ojjuda_photo_internal.game_clears(cleared_at timestamptz);
 create schema ojjuda_bang_internal;create table ojjuda_bang_internal.results(achieved_at timestamptz);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261029084007_arcade_popularity.sql'),'utf8'));
 const folder=path.join(__dirname,'../supabase/migrations');await db.exec(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(f=>f.endsWith('_arcade_popularity_photo.sql'))),'utf8'));
 await db.exec(`begin;
 insert into public.game_scores values ('runner',now()-interval '30 days'),('runner',now()-interval '30 days 1 second'),('runner',now()+interval '1 second'),('screw_box',now()),('screw_flat',now()),('sacheonseong_1',now()),('sacheonseong_15',now()),('unlisted_game',now());
 insert into ojjuda_guest_internal.scores values(current_date,'runner','test','00000000-0000-4000-8000-000000000001',now());
 update ojjuda_guest_internal.scores set last_request_id='00000000-0000-4000-8000-000000000002',last_submitted_at=now();
 update ojjuda_guest_internal.scores set last_request_id='00000000-0000-4000-8000-000000000002';
 insert into ojjuda_guest_internal.round_records values('poker',now(),'solo'),('poker',now(),'recovered'),('tour',now(),'online');
 insert into public.board_games values('carom3','done','draw',now(),'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),('chess','playing',null,now(),null,null);
 insert into ojjuda_game_internal.practice_results values('pool8',now());insert into ojjuda_bang_internal.results values(now());insert into ojjuda_guest_internal.spot_clears values(now());
 insert into ojjuda_photo_internal.game_clears values(now()),(now()-interval '31 days');
 set local role anon;`);
 const data=(await db.query('select public.arcade_popularity() data')).rows[0].data;
 const counts=Object.fromEntries(data.games.map(row=>[row.game,row.plays]));
 assert.deepEqual(counts,{bang:1,billiards:3,photo_ttang:1,poker:1,runner:3,sacheonseong:2,screw:2,spot:1,tour:1});
 assert.deepEqual(Object.keys(data.games[0]).sort(),['game','plays']);
 assert.equal((Date.parse(data.generated_at)-Date.parse(data.window_started_at))/86400000,30);
 await db.exec('commit');await db.exec('set role anon');
 await assert.rejects(()=>db.query('select * from ojjuda_popularity_internal.guest_plays'),/permission denied/);
 console.log('PASS: 30-day boundary, future exclusion, variant grouping, guest retries, completed games, recovered exclusion and anonymous aggregate-only access');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000010';
(async()=>{
 const {verifyAction,verifyComputerAction}=await import('../supabase/functions/game-action/rules.mjs');
 const {createHandler}=await import('../supabase/functions/game-action/handler.mjs');
 const fresh=kind=>({id,kind,p1:a,p2:b,status:'playing',moves:[],turn:'p1',computer_seats:['p1'],rank_excluded:['p1'],janggi_layout:{c:'eheh',h:'hehe'}});
 const timings={};
 for(const kind of ['chess','janggi','carom4','carom3','pool8']){
  const game=fresh(kind),before=JSON.stringify(game),started=performance.now(),action=verifyComputerAction(game,b);
  timings[kind]=Math.round(performance.now()-started);
  assert(action?.move);assert.equal(JSON.stringify(game),before,'AI planning does not mutate the stored snapshot');
  const expected=verifyAction({...game,computer_seats:[]},a,{action:kind==='chess'||kind==='janggi'?'game_move':'game_shot',p_ply:0,p_move:action.move});
  assert.deepEqual(action,expected,'AI actions pass the same authoritative board/physics validation');
  assert.throws(()=>verifyComputerAction(game,a),/player_left/);
  assert.throws(()=>verifyComputerAction(game,other),/not_a_player/);
  assert.equal(verifyComputerAction({...game,computer_seats:[]},b),null);
  const human=verifyAction({...game,computer_seats:[]},a,{action:['chess','janggi'].includes(kind)?'game_move':'game_shot',p_ply:0,p_move:kind==='chess'?{f:52,t:36}:kind==='janggi'?{f:54,t:45}:{s:[0,-1,120,0,0]}});
  const second={...game,moves:[human.move],turn:human.turn,verified_state:human.state,computer_seats:['p2'],rank_excluded:['p2']};
  assert.equal(second.turn,'p2');assert(verifyComputerAction(second,a)?.move,'the second seat also takes over the existing mid-game state');

 }
 const db=new PGlite();
 const scalar=async(q,p=[])=>(await db.query(q,p)).rows[0]?.value;
 const row=async()=>scalar('select to_jsonb(g) value from public.board_games g where id=$1',[id]);
 const login=async actor=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);await db.exec('set role '+(actor?'authenticated':'anon'));};
 const reset=async(kind='chess')=>{await db.exec('reset role');await db.exec('truncate public.board_games,ojjuda_arcade_internal.rooms');await db.query("insert into public.board_games(id,kind,p1,p2,status,turn) values($1,$2,$3,$4,'playing','p1')",[id,kind,a,b]);await db.query("insert into ojjuda_arcade_internal.rooms values($1,'playing',$2)",[id,kind]);};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema ojjuda_arcade_internal;create schema ojjuda_game_internal;create schema ojjuda_guest_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create table public.board_games(id uuid primary key,kind text not null,p1 uuid not null,p2 uuid not null,p1_nick text default '',p2_nick text default '',status text not null default 'invited',moves jsonb not null default '[]',result text,reason text,created_at timestamptz default now(),updated_at timestamptz not null default now(),turn text not null default 'p1',janggi_layout jsonb not null default '{"c":"eheh","h":"hehe"}',undo_requested_by uuid,undo_requested_ply int,undo_p1_count int default 0,undo_p2_count int default 0,verified_state jsonb);
   alter table public.board_games enable row level security;
   create policy board_games_select on public.board_games for select to authenticated using(p1=(select auth.uid()) or p2=(select auth.uid()));
   grant select,insert,update,delete on public.board_games to authenticated;
   create table ojjuda_arcade_internal.rooms(match_id uuid,status text,kind text);
   create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,game text,difficulty text,outcome text,created_at timestamptz);
   create function public.game_verified_commit(p_id uuid,p_actor uuid,p_ply int,p_updated_at timestamptz,p_move jsonb,p_turn text,p_result text,p_reason text,p_state jsonb) returns void language sql as $$select$$;
   revoke all on function public.game_verified_commit(uuid,uuid,int,timestamptz,jsonb,text,text,text,jsonb) from public,anon,authenticated;
   grant execute on function public.game_verified_commit(uuid,uuid,int,timestamptz,jsonb,text,text,text,jsonb) to service_role;`);
  const migrations=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(name=>name.endsWith('_board_computer_takeover.sql'));
  assert.equal(migrations.length,1,'exactly one board takeover migration is present');
  await db.exec(read('supabase/migrations/'+migrations[0]));
  await reset();await login(other);await assert.rejects(()=>db.query('select public.game_leave($1)',[id]),/not_a_player/);
  await login(null);await assert.rejects(()=>db.query('select public.game_leave($1)',[id]),/permission denied/);
  await login(a);await db.query('select public.game_leave($1)',[id]);
  assert.equal(await scalar('select count(*)::int value from board_games'),0,'the departed member cannot retrieve the old playing board through RLS');
  await db.query('select public.game_leave($1)',[id]);
  await db.query('select public.game_resign($1)',[id]);
  await login(b);assert.equal(await scalar('select count(*)::int value from board_games'),1);
  await assert.rejects(()=>db.query('select public.game_undo_request($1)',[id]),/computer_opponent/);
  assert.equal((await db.query("update board_games set computer_seats='{}' where id=$1 returning id",[id])).rows.length,0,'client table writes cannot reclaim an AI seat');
  await db.exec('reset role');let game=await row();
  assert.equal(game.status,'playing');assert.deepEqual(game.moves,[]);assert.deepEqual(game.computer_seats,['p1']);assert.deepEqual(game.rank_excluded,['p1']);
  assert.equal(await scalar('select status value from ojjuda_arcade_internal.rooms'),'closed','the old public room no longer blocks a fresh room');
  for(const role of ['anon','authenticated'])for(const fn of ['game_verified_commit','game_computer_commit'])assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') value',[role,`${fn}(uuid,uuid,int,timestamptz,jsonb,text,text,text,jsonb)`]),false);
  const commit=(name,g,actor,action)=>db.query(`select public.${name}($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[g.id,actor,g.moves.length,g.updated_at,JSON.stringify(action.move),action.turn,action.result,action.reason,JSON.stringify(action.state)]);
  await assert.rejects(()=>commit('game_verified_commit',game,a,verifyComputerAction(game,b)),/player_left/);
  await assert.rejects(()=>commit('game_computer_commit',game,a,verifyComputerAction(game,b)),/not_a_player/);
  let actor=b,commits=0;
  const handler=createHandler({env:key=>({SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public'})[key],fetchImpl:async(url,options)=>{
   if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:actor}));
   if(url.includes('/board_games?')){const current=await row(),seat=current?.p1===actor?'p1':'p2';return new Response(JSON.stringify(current&&[current.p1,current.p2].includes(actor)&&!(current.status==='playing'&&current.computer_seats.includes(seat))?[current]:[]));}
   const body=JSON.parse(options.body);assert.equal(body.p_actor,actor);assert.equal(options.headers.apikey,'server-secret');
   commits++;
   try{await db.query(`select public.${url.endsWith('game_computer_commit')?'game_computer_commit':'game_verified_commit'}($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[body.p_id,body.p_actor,body.p_ply,body.p_updated_at,JSON.stringify(body.p_move),body.p_turn,body.p_result,body.p_reason,JSON.stringify(body.p_state)]);return new Response('null');}
   catch(error){return new Response(JSON.stringify({message:error.message}),{status:409});}
  }});
  const request=body=>handler(new Request('https://edge.test',{method:'POST',headers:{Origin:'https://ojjuda.kr',Authorization:'Bearer member'},body:JSON.stringify(body)}));
  const duplicate=await Promise.all([request({action:'game_tick',p_id:id,p_ply:0,p_move:{f:0,t:63},p_actor:a}),request({action:'game_tick',p_id:id,p_ply:0})]);
  for(const result of duplicate){assert.equal(result.status,200);const payload=await result.json();assert(payload.game);assert.equal(payload.game.moves.length,1);assert.equal(JSON.stringify(payload).includes('server-secret'),false);}
  assert.equal((await row()).moves.length,1,'concurrent computer ticks append exactly once');
  const previousCommits=commits;assert.equal((await request({action:'game_tick',p_id:id,p_ply:0})).status,200);assert.equal(commits,previousCommits,'late duplicate ply is a no-op');
  assert.equal((await request({action:'game_move',p_id:id,p_ply:1,p_move:{f:12,t:28}})).status,200,'the remaining human keeps their real turn');
  actor=a;assert.equal((await request({action:'game_tick',p_id:id,p_ply:2})).status,403);
  actor=b;game=await row();const planned=verifyComputerAction(game,b);
  await login(b);await db.query('select public.game_leave($1)',[id]);await db.exec('reset role');
  assert.equal((await row()).status,'done');assert.deepEqual((await row()).rank_excluded,['p1','p2']);
  await assert.rejects(()=>commit('game_computer_commit',game,b,planned),/not_playing/,'a second departure invalidates an in-flight AI action');
  // Historical wins remain. A handed-off losing seat contributes no streak
  // break, while the real player who stays receives the result normally.
  await reset();await db.query("update board_games set status='done',result='p1',updated_at=now()-interval '1 day'");
  await login(a);await db.query('select public.game_leave($1)',[id]);await db.exec('reset role');assert.deepEqual((await row()).rank_excluded,[],'leaving a completed game never erases an earned result');
  const next='00000000-0000-4000-8000-000000000011';
  await db.query("insert into board_games(id,kind,p1,p2,status,result,computer_seats,rank_excluded) values($1,'chess',$2,$3,'done','p2',array['p1'],array['p1'])",[next,a,b]);
  const ranks=(await db.query("select * from ojjuda_guest_internal.streak_candidates('chess',now()-interval '2 days',now()+interval '1 day')")).rows;
  assert.equal(Number(ranks.find(r=>r.user_id===a)?.score),1,'the departed player keeps only their prior earned win');
  assert.equal(Number(ranks.find(r=>r.user_id===b)?.score),1,'the opponent who stayed earns the new win');
  await db.query("insert into board_games(id,kind,p1,p2,status,result,computer_seats,rank_excluded,updated_at) values('00000000-0000-4000-8000-000000000012','chess',$1,$2,'done','p1',array['p2'],array['p2'],now()+interval '1 second')",[a,b]);
  const mirrored=(await db.query("select * from ojjuda_guest_internal.streak_candidates('chess',now()-interval '2 days',now()+interval '1 day')")).rows;
  assert.equal(Number(mirrored.find(r=>r.user_id===a)?.score),2,'the first seat gets its real win when the second seat is handed off');
  assert.equal(Number(mirrored.find(r=>r.user_id===b)?.score),1,"a second-seat AI loss does not alter that member\'s prior streak");

  await reset();await login(a);await db.query('select public.game_resign($1)',[id]);await db.exec('reset role');assert.equal((await row()).result,'p2');assert.deepEqual((await row()).rank_excluded,[],'explicit resign keeps its existing scoring rule');
  console.log('PASS: server AI for chess/janggi/three billiards modes; leave, RLS, duplicate/stale ticks, human turns, both departures, service-only commits and per-seat historical ranking preservation',JSON.stringify(timings));
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

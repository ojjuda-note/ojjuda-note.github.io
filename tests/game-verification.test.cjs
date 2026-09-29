const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
  const {verifyAction}=await import('../supabase/functions/game-action/rules.mjs');
  const {createHandler}=await import('../supabase/functions/game-action/handler.mjs');
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000010';
  const fresh=kind=>({id,kind,p1:a,p2:b,status:'playing',moves:[],turn:'p1',updated_at:'2026-09-29T00:00:00Z',janggi_layout:{c:'eheh',h:'hehe'}});
  const move=(game,user,p_move)=>verifyAction(game,user,{action:'game_move',p_ply:game.moves.length,p_move});
  const chess=fresh('chess');
  assert.throws(()=>move(chess,b,{f:52,t:36}),/not_your_turn/);
  assert.throws(()=>move(chess,a,{f:56,t:0}),/illegal_move/);
  assert.throws(()=>move(chess,'outsider',{f:52,t:36}),/not_a_player/);
  assert.throws(()=>move(chess,a,{f:null,t:36}),/bad_move/);
  // Fool's mate must be determined by the server's board state, not by a claim.
  let result;
  for(const [user,input] of [[a,{f:53,t:45}],[b,{f:12,t:28}],[a,{f:54,t:38}],[b,{f:3,t:39}]]){
    result=move(chess,user,input);chess.moves.push(result.move);
  }
  assert.equal(result.result,'p2');assert.equal(result.reason,'checkmate');
  const janggi=fresh('janggi');
  result=move(janggi,a,{f:54,t:45});assert.deepEqual(result.move,{f:54,t:45});
  assert.throws(()=>move({...janggi,janggi_layout:{c:'eheh'}},a,{pass:1}),/layout_not_ready/);
  assert.throws(()=>move({...janggi,undo_requested_by:b},a,{pass:1}),/undo_pending/);
  const shot=(game,user,s,extra={})=>verifyAction(game,user,{action:'game_shot',p_ply:game.moves.length,p_move:{s,...extra}});
  for(const kind of ['carom4','carom3','pool8']){
    const game=fresh(kind);
    const good=shot(game,a,[0,-1,1000,0,0]);
    const forged=shot(game,a,[0,-1,1000,0,0],{sc:[999,0],o:'p1',n:'p1',f:[]});
    assert.deepEqual(forged,good,'browser score/winner/positions cannot affect the server result');
    game.moves.push(good.move);game.verified_state=good.state;game.turn=good.turn;
    const next=shot(game,game.turn==='p1'?a:b,[0,-1,120,0,0]);
    assert.equal(next.state.shots,2);
    for(const invalid of [[0,-10,1000,0,0],[0,-1,999999,0,0],[0,-1,1000,2,0],[NaN,-1,1000,0,0],[0,-1,1000,0,0,-10,-10]])
      assert.throws(()=>shot(fresh(kind),a,invalid),/bad_shot|illegal_placement/);
  }
  const calls=[];
  const handler=createHandler({env:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only',SUPABASE_ANON_KEY:'public'})[k],fetchImpl:async(url,options)=>{
    calls.push({url,...options});
    return new Response(JSON.stringify(url.endsWith('/user')?{id:a}:url.includes('/board_games')?[fresh('chess')]:null));
  }});
  const request=body=>handler(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer member-session',Origin:'https://ojjuda.kr'},body:JSON.stringify(body)}));
  const response=await request({action:'game_move',p_id:id,p_ply:0,p_move:{f:52,t:36},user_id:b});
  assert.equal(response.status,200);
  assert.equal(JSON.parse(calls.at(-1).body).p_actor,a,'target identity comes from Auth');
  assert.equal(calls[1].headers.authorization,'Bearer member-session','RLS must use the verified member session');
  assert.equal(JSON.stringify(await response.json()).includes('server-only'),false);
  calls.length=0;
  assert.equal((await request({action:'game_finish',p_id:id,p_result:'p1'})).status,400);
  assert.equal(calls.length,0);
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.board_games(id uuid primary key,kind text,status text,p1 uuid,p2 uuid,turn text,moves jsonb default '[]',updated_at timestamptz default now(),result text,reason text,undo_requested_by uuid);
      create table public.game_scores(user_id uuid,nick text,game text,score int,reward int,created_at timestamptz default now());
      create table public.user_private(user_id uuid primary key,coins int);create table public.profiles(id uuid,nickname text);
      create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
      create function public.game_move(uuid,integer,jsonb) returns void language sql as $$select$$;
      create function public.game_shot(uuid,integer,jsonb,text) returns void language sql as $$select$$;
      create function public.game_finish(uuid,text,text) returns void language sql as $$select$$;
      grant usage on schema public,auth to anon,authenticated,service_role;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260929050842_verified_game_results.sql'),'utf8'));
    const value=async(q,p=[])=> (await db.query(q,p)).rows[0].value;
    for(const role of ['anon','authenticated'])for(const fn of ['game_move(uuid,integer,jsonb)','game_shot(uuid,integer,jsonb,text)','game_finish(uuid,text,text)','game_verified_commit(uuid,uuid,integer,timestamptz,jsonb,text,text,text,jsonb)'])
      assert.equal(await value('select has_function_privilege($1,$2,\'execute\') value',[role,fn]),false);
    await db.query("insert into board_games(id,kind,status,p1,p2,turn) values($1,'chess','playing',$2,$3,'p1')",[id,a,b]);
    const timestamp=await value('select updated_at::text value from board_games where id=$1',[id]);
    const commit="select public.game_verified_commit($1,$2,0,$3,'{\"f\":52,\"t\":36}','p2',null,null,null)";
    await db.exec('set role service_role');
    await db.query(commit,[id,a,timestamp]);
    await assert.rejects(()=>db.query(commit,[id,a,timestamp]),/out_of_sync/);
    await db.exec('reset role');
    await db.query("insert into game_scores(user_id,nick,game,score,reward,verified) values($1,'forged','snake',300,0,false)",[a]);
    assert.deepEqual(await value("select public.game_ranking('snake') value"),[]);
  }finally{await db.close();}
  console.log('PASS: legal chess/janggi moves, checkmate, billiards server physics, forged results, live identity, service-only commit, stale-write rejection and unverified ranking exclusion');
})().catch(error=>{console.error(error);process.exitCode=1});

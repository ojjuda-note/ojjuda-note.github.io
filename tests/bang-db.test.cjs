const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
test('BANG rooms, authorization, settlement, monthly streaks and ties',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema ojjuda_poker_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table public.profiles(id uuid primary key,nickname text);create table public.user_private(user_id uuid,banned_until timestamptz);
 create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
 create function public.blocked_between(uuid,uuid) returns boolean language sql as $$select false$$;
 create function ojjuda_poker_internal.arcade_rooms() returns jsonb language sql as $$select '{"ok":true,"rooms":[]}'::jsonb$$;
 create function public.arcade_extra_rooms() returns jsonb language sql as $$select ojjuda_poker_internal.arcade_rooms()$$;
 create function public.community_game_ranking(p_game text) returns json language plpgsql as $$begin
 return '[{"nick":"unchanged","score":7}]'::json;end$$;
 create function public.community_game_monthly_ranking(p_game text) returns json language plpgsql as $$begin
 return '[{"nick":"unchanged","score":7}]'::json;end$$;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261029033602_bang_multiplayer_streaks.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261029072338_bang_solo_streaks.sql'),'utf8'));
 const users=Array.from({length:5},()=>randomUUID());for(let i=0;i<5;i++){await db.query('insert into auth.users(id) values($1)',[users[i]]);await db.query('insert into public.profiles values($1,$2)',[users[i],'P'+i]);}
 const rpc=async(actor,action,room=null,code=null,request=null,options={},version=null,next=null)=>(await db.query('select public.bang_online_service($1,$2,$3,$4,$5,$6,$7,$8) v',[actor,action,room,code,request,options,version,next])).rows[0].v;
 const request=randomUUID();let c=await rpc(users[0],'create',null,null,request,{capacity:4,title:'TEST'});const room=c.room.id;
 assert.equal((await rpc(users[0],'create',null,null,request,{capacity:4})).room.id,room);
 await assert.rejects(rpc(users[4],'read',room),/room_not_found/);
 for(let i=1;i<4;i++)c=await rpc(users[i],'join',null,c.room.code);
 await assert.rejects(rpc(users[4],'join',null,c.room.code),/room_full/);
 const {createOnline}=await import('../games/bang/online-engine.js');let state=createOnline(c.room.names,room,()=>0.51);
 c=await rpc(users[0],'start',room,null,randomUUID(),{},c.room.version,{state});
 await assert.rejects(rpc(users[1],'commit',room,null,randomUUID(),{},c.room.version-1,{state}),/state_conflict/);
 state.forfeited=[1];c=await rpc(users[1],'commit',room,null,randomUUID(),{},c.room.version,{state});
 assert.equal((await db.query('select won from ojjuda_bang_internal.results where user_id=$1',[users[1]])).rows[0].won,false);
 state.winner='sheriff';const final=randomUUID();c=await rpc(users[0],'commit',room,null,final,{},c.room.version,{state});
 const count=async()=>(await db.query('select count(*)::int n from ojjuda_bang_internal.results')).rows[0].n;
 assert.equal(await count(),4);await rpc(users[0],'commit',room,null,final,{},c.room.version-1,{state});assert.equal(await count(),4);
 await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',users[0]]);
 assert.equal((await db.query("select public.community_game_monthly_ranking('other') v")).rows[0].v[0].score,7);
 // Run the deployed HTTP handler against the same real local PostgreSQL migration.
 const previousFetch=globalThis.fetch,previousDeno=globalThis.Deno;let handle;
 globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://fixture.invalid':'fixture-service'},serve:fn=>{handle=fn;}};
 globalThis.fetch=async(url,init)=>{
  if(url.endsWith('/auth/v1/user')){const id=init.headers.Authorization.replace('Bearer ','');return Response.json(users.includes(id)?{id,is_anonymous:false}:{error:'unauthorized'},{status:users.includes(id)?200:401});}
  assert.ok(url.endsWith('/rest/v1/rpc/bang_online_service'));assert.equal(init.headers.Authorization,'Bearer fixture-service');
  const b=JSON.parse(init.body);try{return Response.json(await rpc(b.p_actor,b.p_action,b.p_room??null,b.p_code??null,b.p_request??null,b.p_options??{},b.p_expected??null,b.p_next??null));}
  catch(e){return Response.json({message:e.message},{status:400});}
 };
 try{
  await import('../supabase/functions/bang/index.ts');
  const call=async(user,body)=>{const res=await handle(new Request('https://fixture.invalid/bang',{method:'POST',headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:res.status,...await res.json()};};
  assert.equal((await call('invalid',{action:'mine'})).status,401);
  let live=await call(users[0],{action:'create',request_id:randomUUID(),options:{capacity:4,title:'HTTP test'}});assert.equal(live.ok,true);const liveId=live.room.id;
  assert.equal((await call(users[0],{action:'start',room_id:liveId,version:0,request_id:randomUUID()})).error,'need_players');
  for(let i=1;i<4;i++)live=await call(users[i],{action:'join',code:live.room.code});
  assert.equal((await call(users[4],{action:'read',room_id:liveId})).error,'room_not_found');
  live=await call(users[0],{action:'start',room_id:liveId,version:live.room.version,request_id:randomUUID()});assert.equal(live.ok,true);assert.equal(live.room.members,undefined);
  for(let seat=0;seat<4;seat++){const view=await call(users[seat],{action:'read',room_id:liveId});assert.equal(view.room.seat,seat);for(const p of view.room.state.players)if(p.id!==seat)assert.ok(p.hand.every(x=>x.hidden));}
  for(let turn=0;turn<1500&&live.room.status!=='finished';turn++){
   await db.query("update ojjuda_bang_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[liveId]);
   live=await call(users[0],{action:'read',room_id:liveId});assert.equal(live.ok,true,live.error);
  }
  assert.equal(live.room.status,'finished');assert.equal((await db.query('select count(*)::int n from ojjuda_bang_internal.results where room_id=$1',[liveId])).rows[0].n,4);

  // Real HTTP -> Edge -> SQL path for ranked solo games. No production data is used.
  await db.exec('delete from ojjuda_bang_internal.results');
  const soloOptions={count:4,role:'sheriff',character:'bart'};
  const startSolo=async()=>{
   const request=randomUUID();const result=await call(users[0],{action:'solo',request_id:request,options:soloOptions});
   assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.room.mode,'solo');assert.equal(result.room.status,'active');
   const retry=await call(users[0],{action:'solo',request_id:request,options:soloOptions});assert.equal(retry.room.id,result.room.id);
   assert.equal((await call(users[1],{action:'join',code:result.room.code})).error,'room_unavailable');
   assert.equal((await call(users[1],{action:'read',room_id:result.room.id})).error,'room_not_found');
   assert.equal((await db.query('select public.arcade_extra_rooms() v')).rows[0].v.rooms.some(x=>x.match_id===result.room.id),false);
   return result;
  };
  const {Game}=await import('../games/bang/engine.js');
  const {makeDeck}=await import('../games/bang/data.js');
  const nearWin=async(room)=>{
   const game=new Game(null,()=>.42);game.create(soloOptions);const state=game.s;
   Object.assign(state,{runId:room.id,online:true,forfeited:[],current:0,phase:'play',pending:null,queue:[],bangs:0});
   state.players.forEach((p,i)=>Object.assign(p,{name:'P'+i,char:'bart',role:['sheriff','renegade','outlaw','outlaw'][i],hp:i===0?5:i===1?1:0,maxHp:i===0?5:4,alive:i<2,equipment:[],hand:[]}));
   const bang=makeDeck().find(c=>c.type==='bang');state.players[0].hand=[bang];state.deck=makeDeck().filter(c=>c.id!==bang.id);state.discard=[];
   await db.query('update ojjuda_bang_internal.rooms set state=$2 where id=$1',[room.id,JSON.stringify(state)]);
   return bang.id;
  };
  for(let expected=1;expected<=2;expected++){
   let solo=await startSolo();const card=await nearWin(solo.room),request=randomUUID();
   // Even after 45 seconds, a solo game waits for the human instead of auto-playing.
   await db.query("update ojjuda_bang_internal.rooms set deadline=now()-interval '1 minute' where id=$1",[solo.room.id]);
   const read=await call(users[0],{action:'read',room_id:solo.room.id});assert.equal(read.room.version,solo.room.version);
   const body={action:'move',room_id:solo.room.id,version:solo.room.version,request_id:request,move:{type:'play',card,target:1}};
   solo=await call(users[0],body);assert.equal(solo.ok,true);assert.equal(solo.room.status,'finished');
   assert.equal(solo.room.record.saved,true);assert.equal(solo.room.record.won,true);assert.equal(solo.room.record.streak,expected);
   assert.equal((await call(users[0],body)).room.record.streak,expected);
   assert.equal((await db.query('select count(*)::int n from ojjuda_bang_internal.results where room_id=$1',[solo.room.id])).rows[0].n,1);
   const board=(await db.query("select public.community_game_monthly_ranking('bang') v")).rows[0].v;
   assert.equal(board[0].score,expected);assert.equal(board[0].me,true);
  }
  let solo=await startSolo();
  assert.equal((await call(users[0],{action:'solo',request_id:randomUUID(),options:soloOptions})).error,'room_in_progress');
  assert.equal((await call(users[0],{action:'leave',room_id:solo.room.id})).error,'use_surrender');
  assert.equal((await call(users[0],{action:'move',room_id:solo.room.id,version:solo.room.version,request_id:randomUUID(),move:{type:'win',winner:'sheriff'}})).error,'invalid_action');
  assert.equal((await call(users[0],{action:'mine'})).room.id,solo.room.id);
  solo=await call(users[0],{action:'surrender',room_id:solo.room.id,version:solo.room.version,request_id:randomUUID()});
  assert.equal(solo.room.record.won,false);assert.equal(solo.room.record.streak,0);
  assert.deepEqual((await db.query("select public.community_game_monthly_ranking('bang') v")).rows[0].v,[]);
  await db.exec("update ojjuda_bang_internal.rooms set created_at=now()-interval '2 minutes'");
  solo=await startSolo();await db.query("update ojjuda_bang_internal.rooms set expires_at=now()-interval '1 minute' where id=$1",[solo.room.id]);
  assert.equal((await call(users[0],{action:'mine'})).room,null);
  assert.equal((await db.query('select won from ojjuda_bang_internal.results where room_id=$1',[solo.room.id])).rows[0].won,false);
  // Complete a full game through HTTP: bots run only on the server; the fixture chooses human moves.
  solo=await startSolo();
  for(let step=0;step<1000&&solo.room.status==='active';step++){
   const raw=(await db.query('select state from ojjuda_bang_internal.rooms where id=$1',[solo.room.id])).rows[0].state;
   if((raw.pending?.player??raw.current)!==0){solo=await call(users[0],{action:'read',room_id:solo.room.id});continue;}
   const chooser=new Game(raw);let move;
   chooser.play=(seat,card,target)=>{move={type:'play',card,target};return true;};
   chooser.choose=(action,value)=>{move={type:'choose',action,value};return true;};
   chooser.endTurn=()=>{move={type:'end'};return true;};
   chooser.discardCard=(seat,card)=>{move={type:'discard',card};return true;};
   chooser.healSid=(seat,cards)=>{move={type:'heal',cards};return true;};
   assert.equal(chooser.aiAction(true),true);assert.ok(move);
   solo=await call(users[0],{action:'move',room_id:solo.room.id,version:solo.room.version,request_id:randomUUID(),move});assert.equal(solo.ok,true,JSON.stringify(solo));
  }
  assert.equal(solo.room.status,'finished');assert.equal(solo.room.record.saved,true);
  assert.equal((await db.query('select count(*)::int n from ojjuda_bang_internal.results where room_id=$1',[solo.room.id])).rows[0].n,1);
  assert.equal((await call(users[0],{action:'solo',request_id:randomUUID(),options:{...soloOptions,count:3}})).error,'invalid_options');
  assert.equal((await call('invalid',{action:'solo',request_id:randomUUID(),options:soloOptions})).status,401);
 }finally{globalThis.fetch=previousFetch;globalThis.Deno=previousDeno;}
 // Isolate streak fixtures: synthetic records are only in this disposable local DB.
 await db.exec('delete from ojjuda_bang_internal.results');
 const add=async(u,win,ago)=>{let id=randomUUID();await db.query("insert into ojjuda_bang_internal.rooms(id,code,host_id,members,names,title,capacity,create_request,status) values($1,$2,$3,array[$3::uuid],array['P'],'test',4,$1,'finished')",[id,id.slice(0,8),u]);await db.query("insert into ojjuda_bang_internal.results values($1,$2,$3,now()-make_interval(secs=>$4))",[id,u,win,ago]);};
 await add(users[0],true,300);await add(users[0],false,240);await add(users[0],true,120);
 await add(users[1],true,200);await add(users[1],true,180);
 const rank=async()=>(await db.query("select public.community_game_monthly_ranking('bang') v")).rows[0].v;
 assert.deepEqual((await rank()).map(x=>[x.nick,x.score]),[['P1',2],['P0',1]]);
 await add(users[1],false,60);assert.deepEqual((await rank()).map(x=>[x.nick,x.score]),[['P0',1]]);
 await add(users[2],true,150);assert.equal((await rank())[0].nick,'P2');
 await add(users[3],true,40*86400);assert.ok(!(await rank()).some(x=>x.nick==='P3'));
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from ojjuda_bang_internal.rooms'),/permission denied/);await assert.rejects(rpc(users[0],'read',room),/permission denied/);await assert.rejects(db.query("insert into ojjuda_bang_internal.results values(gen_random_uuid(),gen_random_uuid(),true,now())"),/permission denied/);
 assert.equal((await rank())[0].score,1);await db.exec('reset role');await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub','']);await assert.rejects(rank(),/not_signed_in/);
 }finally{await db.close();}
});

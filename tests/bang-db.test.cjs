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

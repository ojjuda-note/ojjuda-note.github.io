const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ids=Array.from({length:14},(_,i)=>`a0000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,is_anonymous boolean default false);
  create table public.profiles(id uuid primary key,nickname text);
  create table public.bans(id uuid primary key);create table public.blocks(a uuid,b uuid);
  create function public.is_banned(uuid) returns boolean language sql stable as $$select exists(select 1 from public.bans where id=$1)$$;
  create function public.blocked_between(uuid,uuid) returns boolean language sql stable as $$select exists(select 1 from public.blocks where (a=$1 and b=$2) or (b=$1 and a=$2))$$;
  create schema ojjuda_note_internal; create table public.user_private(user_id uuid primary key,coins integer not null); create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb); create table public.game_scores(id bigint generated always as identity primary key,user_id uuid,nick text,game text,score integer,reward integer,verified boolean,created_at timestamptz default now());
  grant usage on schema public to service_role,anon,authenticated;`);
 for(let i=0;i<ids.length;i++){
  await db.query('insert into auth.users(id) values($1)',[ids[i]]); await db.query('insert into public.user_private values($1,100)',[ids[i]]);
  await db.query('insert into public.profiles values($1,$2)',[ids[i],i===0?'민준':i===1?'여행친구':'참가자'+(i+1)]);
 }
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018061119_tank_online_rooms.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018063442_tank_solo_mode.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018072709_tank_healing_shell.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018084329_tank_same_device_mode.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018090311_tank_homing_shell.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018141945_tank_steel_rain.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261018163208_tank_nuclear_restore_price.sql'),'utf8'));
 const {createHandler}=await import(path.join(root,'supabase/functions/tank/handler.mjs'));
 let roll=[],holdDeadlines=false;
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/auth/v1/user')){
   const id=options.headers.authorization.replace('Bearer fixture-','');
   const u=(await db.query('select * from auth.users where id=$1',[ids.includes(id)?id:null])).rows[0];
   return new Response(JSON.stringify(u||{}),{status:u?200:401});
  }
  if(!url.endsWith('/rest/v1/rpc/tank_online_service'))throw Error('unexpected endpoint');
  const v=JSON.parse(options.body);
  try{
   const result=await db.transaction(async tx=>{
    // UI rendering and screenshots must not consume a scripted player's turn.
    // Timeout-specific tests leave this off and exercise the real 45-second rule.
    if(holdDeadlines)await tx.exec("update ojjuda_tank_internal.rooms set deadline=clock_timestamp()+interval '45 seconds' where status='active'");
    await tx.exec('set local role service_role');
    return tx.query('select public.tank_online_service($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as data',[v.p_actor,v.p_action,v.p_room??null,v.p_code??null,v.p_request??null,v.p_expected??null,JSON.stringify(v.p_options??{}),v.p_next===undefined?null:JSON.stringify(v.p_next)]);
   });
   return new Response(JSON.stringify(result.rows[0].data));
  }catch(e){return new Response(JSON.stringify({message:e.message}),{status:400});}
 };
 const handler=createHandler({env:n=>({SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'service-fixture',SUPABASE_ANON_KEY:'anon-fixture'})[n],fetchImpl,seed:()=>123456});
 const request=(actor,body,extra={})=>new Request('https://edge.test/tank',{method:'POST',headers:{'content-type':'application/json',origin:'https://ojjuda.kr',...(actor?{authorization:'Bearer fixture-'+actor}:{}),...extra},body:JSON.stringify(body)});
 const call=async(actor,body)=>{const res=await handler(request(actor,body));return {status:res.status,...await res.json()};};
 const create=(actor,capacity=4)=>call(actor,{action:'create',request_id:randomUUID(),options:{capacity,title:'함께 세계여행'}});
 const join=(actor,room)=>call(actor,{action:'join',code:room.code});
 const start=(actor,room)=>call(actor,{action:'start',room_id:room.id,version:room.version,request_id:randomUUID()});
 const move=(actor,room,command,request_id=randomUUID())=>call(actor,{action:'fire',room_id:room.id,version:room.version,request_id,command});
 return {db,call,handler,request,create,join,start,move,dice(...v){roll=v;},holdDeadlines(value){holdDeadlines=value;},close:()=>db.close()};
}
module.exports={fixture,ids};

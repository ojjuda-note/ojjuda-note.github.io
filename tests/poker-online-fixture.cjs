const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const users=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema ojjuda_account_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table public.user_private(user_id uuid primary key,coins integer default 20,updated_at timestamptz default now(),banned_until timestamptz);
 create schema ojjuda_tank_internal;create schema ojjuda_marble_internal;create schema ojjuda_arcade_internal;
 create table ojjuda_tank_internal.rooms(id uuid,code text,title text,host_id uuid,members uuid[],capacity integer,status text,mode text,created_at timestamptz,expires_at timestamptz);
 create table ojjuda_marble_internal.rooms(id uuid,code text,title text,host_id uuid,members uuid[],capacity integer,status text,public_lobby boolean,created_at timestamptz,expires_at timestamptz);
 create table ojjuda_arcade_internal.ttang_rooms(id uuid,title text,host_id uuid,guest_id uuid,status text,created_at timestamptz,expires_at timestamptz);
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table public.profiles(id uuid primary key,nickname text);
 create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
 create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
 create function public.blocked_between(uuid,uuid) returns boolean language sql as $$select false$$;
 create function ojjuda_account_internal.age_on(date,date) returns integer language sql as $$select extract(year from age($2,$1))::integer$$;
 grant usage on schema public to anon,authenticated,service_role;`);
 for(const [i,id] of users.entries()){
  await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query('insert into public.user_private(user_id) values($1)',[id]);
  await db.query('insert into public.profiles values($1,$2)',[id,['열아홉','둘째','셋째','넷째','열여덟','외부인'][i]]);
  await db.query("insert into ojjuda_account_internal.member_identity values($1,(clock_timestamp() at time zone 'Asia/Seoul')::date-make_interval(years=>$2))",[id,i===4?18:i===0?19:25]);
 }
 const dir=path.join(__dirname,'../supabase/migrations');
 await db.exec(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('_poker_online_rooms.sql'))),'utf8'));
 await db.exec(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('_poker_wallet_ranking_lobby.sql'))),'utf8'));
 const {createHandler}=await import('../supabase/functions/poker/handler.mjs');let seed=123456;
 const handler=createHandler({env:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'})[n],random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user')){const id=options.headers.authorization.slice(7);return new Response(JSON.stringify({id}),{status:users.includes(id)?200:401});}
  const p=JSON.parse(options.body);
  try{const r=await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query('select public.poker_online_service($1,$2,$3,$4,$5,$6,$7,$8) value',[p.p_actor,p.p_action,p.p_room??null,p.p_code??null,p.p_request??null,p.p_expected??null,p.p_options??{},p.p_next??null]);});return new Response(JSON.stringify(r.rows[0].value));}
  catch(e){return new Response(JSON.stringify({message:e.message}),{status:400});}
 }});
 async function call(id,body){const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer '+id,origin:'https://ojjuda.kr'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}
 async function publicRpc(actor,fn,args=[]){return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');return (await tx.query('select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;});}
 return {db,call,users,handler,publicRpc,close:()=>db.close()};
}
module.exports={fixture,users};

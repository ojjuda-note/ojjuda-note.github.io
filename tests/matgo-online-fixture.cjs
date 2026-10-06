const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',MINOR='00000000-0000-4000-8000-000000000004';
async function fixture(fixtureOptions={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema ojjuda_account_internal;
    create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key,nickname text);
    create table public.user_private(user_id uuid primary key,coins int,updated_at timestamptz);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
    create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
    create function ojjuda_account_internal.age_on(p_birth date,p_today date) returns integer language sql as $$select extract(year from age(p_today,p_birth))::integer$$;
    grant usage on schema public to anon,authenticated,service_role;`);
  for(const suffix of ['_matgo_gold_wallet.sql','_matgo_online_matches.sql','_matgo_quick_cpu_fallback.sql']){
    const dir=path.join(__dirname,'../supabase/migrations'),file=fs.readdirSync(dir).find(n=>n.endsWith(suffix));
    await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
  }
  for(const [id,nickname,birth] of [[A,'봄고래','2000-01-01'],[B,'별토끼','2000-01-01'],[C,'세번째','2000-01-01'],[MINOR,'미성년','2015-01-01']]){
    await db.query('insert into auth.users values($1)',[id]);
    await db.query('insert into public.profiles values($1,$2)',[id,nickname]);
    await db.query('insert into public.user_private values($1,20,now())',[id]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)',[id,birth]);
  }
  if(fixtureOptions.stakes){
    await db.exec('alter table public.user_private add column banned_until timestamptz');
    const dir=path.join(__dirname,'../supabase/migrations'),file=fs.readdirSync(dir).find(n=>n.endsWith('_matgo_solo_stakes.sql'));
    await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
    const shared=fs.readdirSync(dir).find(n=>n.endsWith('_matgo_shared_stakes.sql')&&!n.endsWith('_arcade_matgo_shared_stakes.sql'));
    await db.exec(fs.readFileSync(path.join(dir,shared),'utf8'));
  }
  const {createHandler}=await import('../supabase/functions/matgo/handler.mjs');
  const calls=[];
  const handler=createHandler({env:n=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'})[n],fetchImpl:async(url,options)=>{
    if(url.endsWith('/auth/v1/user')){
      const actor=options.headers.authorization?.slice(7);
      return new Response(JSON.stringify({id:actor}),{status:[A,B,C,MINOR].includes(actor)?200:401});
    }
    const p=JSON.parse(options.body);if(p.p_seed)p.p_seed=fixtureOptions.seed||'11'.repeat(32);calls.push(p);
    try{
      let result;
      if(url.endsWith('/matgo_online_fallback'))result=await db.query('select public.matgo_online_fallback($1,$2) value',[p.p_actor,p.p_room]);
      else if(url.endsWith('/matgo_online_service'))result=await db.query('select public.matgo_online_service($1,$2,$3,$4,$5,$6,$7,$8) value',[p.p_actor,p.p_action,p.p_room??null,p.p_code??null,p.p_seed??null,p.p_expected??null,p.p_request??null,p.p_next??null]);
      else if(url.endsWith('/matgo_stake_service'))result=await db.query('select public.matgo_stake_service($1,$2,$3) value',[p.p_actor,p.p_rate,p.p_accept]);
      else if(url.endsWith('/matgo_wallet_service'))result=await db.query('select public.matgo_wallet_service($1,$2,$3,$4,$5,$6,$7::smallint,$8) value',[p.p_actor,p.p_action,p.p_request??null,p.p_paid??false,p.p_round??null,p.p_gold??null,p.p_first??null,p.p_carry??null]);
      else throw Error('unexpected RPC');
      return new Response(JSON.stringify(result.rows[0].value));
    }catch(error){return new Response(JSON.stringify({message:error.message}),{status:400});}
  }});
  async function call(actor,body){
    const res=await handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer '+actor,origin:'https://ojjuda.kr'},body:JSON.stringify(body)}));
    return {status:res.status,...await res.json()};
  }
  return {db,call,calls,close:()=>db.close(),A,B,C,MINOR};
}
module.exports={fixture,A,B,C,MINOR};

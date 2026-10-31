const fs=require('node:fs'),path=require('node:path');
const {fixture:tankFixture,ids}=require('./tank-online-fixture.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations'),read=name=>fs.readFileSync(path.join(dir,name),'utf8');
function sqlFunction(source,name){const start=source.indexOf('create function '+name+'(');if(start<0)throw Error('missing SQL function '+name);return source.slice(start,source.indexOf('$$;',start)+3);}
async function fixture({migrate=true}={}){
 const f=await tankFixture({handoff:false}),db=f.db;
 try{
  await db.exec(`create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   alter table public.user_private add column banned_until timestamptz,add column updated_at timestamptz default now();
   alter table ojjuda_note_internal.spend_requests add column target_id uuid,add column created_at timestamptz default now();
   create schema ojjuda_account_internal;create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
   create function ojjuda_account_internal.age_on(date,date) returns integer language sql as $$select extract(year from age($2,$1))::integer$$;
   create schema ojjuda_arcade_internal;create table ojjuda_arcade_internal.ttang_rooms(id uuid,title text,host_id uuid,guest_id uuid,status text,created_at timestamptz,expires_at timestamptz);
   create schema ojjuda_guest_internal;create schema ojjuda_game_internal;`);
  await db.exec("insert into ojjuda_account_internal.member_identity select id,date '1990-01-01' from auth.users");
  await db.exec(read('20261012024936_marble_online_rooms.sql'));
  await db.exec('alter table ojjuda_marble_internal.rooms add column public_lobby boolean default false');
  for(const name of ['20261021004126_poker_online_rooms.sql','20261021015125_poker_wallet_ranking_lobby.sql','20261022105411_poker_faster_turns.sql','20261029033602_bang_multiplayer_streaks.sql','20261029072338_bang_solo_streaks.sql','20261029162439_bang_paid_hints_random_roles.sql'])await db.exec(read(name));
  // Use the actual current settlement trigger and ranking query, not a wallet-
  // balance stub. Unrelated games' setup/backfill are intentionally omitted.
  const criteria=read('20261022121120_game_ranking_criteria.sql');
  await db.exec(criteria.slice(0,criteria.indexOf('-- One row per game.')));
  await db.exec(sqlFunction(criteria,'ojjuda_guest_internal.criteria_ranking'));
  await db.exec(sqlFunction(criteria,'ojjuda_game_internal.capture_ranked_round'));
  await db.exec('revoke all on function ojjuda_game_internal.capture_ranked_round() from public,anon,authenticated');
  const triggers=criteria.slice(criteria.indexOf('create trigger ranking_poker'),criteria.indexOf('-- Backfill'));
  for(const game of ['poker','tank','marble']){
   const start=triggers.indexOf('create trigger ranking_'+game),end=triggers.indexOf(';',start)+1;await db.exec(triggers.slice(start,end));
  }
  const details=read('20261022130306_multiplayer_ranking_details.sql');
  await db.exec(details.slice(0,details.indexOf('-- One distinct picture')));
  const latestPoker=criteria.slice(criteria.indexOf('create or replace function ojjuda_poker_internal.ranking('));
  await db.exec(latestPoker.slice(0,latestPoker.indexOf('$$;')+3));
  if(migrate)await db.exec(read(fs.readdirSync(dir).find(name=>name.endsWith('_fresh_multiplayer_entries.sql'))));
  const handlers={};
  for(const kind of ['marble','poker']){
   const {createHandler}=await import(path.join(root,'supabase/functions',kind,'handler.mjs'));
   handlers[kind]=createHandler({env:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server'})[key],random:()=>.42,fetchImpl:async(url,options)=>{
    if(url.endsWith('/auth/v1/user')){const actor=options.headers.authorization.slice(7);return Response.json({id:actor,is_anonymous:false},{status:ids.includes(actor)?200:401});}
    const b=JSON.parse(options.body);
    try{return Response.json((await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(`select public.${kind}_online_service($1,$2,$3,$4,$5,$6,$7,$8) data`,[b.p_actor,b.p_action,b.p_room??null,b.p_code??null,b.p_request??null,b.p_expected??null,b.p_options??{},b.p_next??null]);})).rows[0].data);}
    catch(error){return Response.json({message:error.message},{status:400});}
   }});
  }
  const bangEngine=await import(path.join(root,'supabase/functions/bang/online-engine.js'));
  const bangSource=require('node:module').stripTypeScriptTypes(fs.readFileSync(path.join(root,'supabase/functions/bang/index.ts'),'utf8')).replace(/^import \{([^}]+)\} from '[^']+';/,'const {$1}=__engine;');
  require('node:vm').runInNewContext(bangSource,{__engine:bangEngine,crypto:globalThis.crypto,Response,Request,structuredClone,
   Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://fixture.invalid':'service'},serve:handler=>handlers.bang=handler},
   fetch:async(url,options)=>{
    if(url.endsWith('/auth/v1/user')){const actor=options.headers.Authorization.slice(7);return Response.json({id:actor,is_anonymous:false},{status:ids.includes(actor)?200:401});}
    const b=JSON.parse(options.body);
    try{return Response.json((await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query('select public.bang_online_service($1,$2,$3,$4,$5,$6,$7,$8) data',[b.p_actor,b.p_action,b.p_room??null,b.p_code??null,b.p_request??null,b.p_options??{},b.p_expected??null,b.p_next??null]);})).rows[0].data);}
    catch(error){return Response.json({message:error.message},{status:400});}
   }
  });
  const call=async(kind,actor,body)=>{
   if(kind==='tank')return f.call(actor,body);
   const response=await handlers[kind](new Request('https://fixture.invalid/'+kind,{method:'POST',headers:{authorization:'Bearer '+actor,origin:'https://ojjuda.kr','content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};
  };
  return {...f,callGame:call,ids};
 }catch(error){delete error.query;await f.close();throw error;}
}
module.exports={fixture,ids,read,sqlFunction};

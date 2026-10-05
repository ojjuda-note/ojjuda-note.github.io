const fs=require('node:fs'),path=require('node:path');
const {fixture:matgoFixture,A,B,C,MINOR}=require('./matgo-online-fixture.cjs');
async function fixture(){
  const base=await matgoFixture(),{db}=base;
  await db.exec(`alter table auth.users add column is_anonymous boolean default false;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    alter table public.user_private add column banned_until timestamptz;
    create table public.blocks(blocker uuid,blocked uuid);
    create schema extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab',$1),'hex')$$;
    create table public.board_games(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('chess','janggi','carom4','carom3','pool8')),
      p1 uuid references public.profiles(id),p2 uuid references public.profiles(id),p1_nick text,p2_nick text,status text default 'invited' check(status in ('invited','playing','done','declined','canceled')),
      moves jsonb default '[]',turn text default 'p1',janggi_layout jsonb,verified_state jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.board_games enable row level security;`);
  const migrations=path.join(__dirname,'../supabase/migrations');
  // Use the actual scoped helpers. Permissive stubs hide cross-member 403 errors.
  const privacy=fs.readFileSync(path.join(migrations,'20260930231544_scope_world_privacy_helpers.sql'),'utf8');
  for(const name of ['blocked_between','is_banned']){
    const start=privacy.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
    await db.exec(privacy.slice(start,privacy.indexOf('$function$;',start)+11));
  }
  const migration=fs.readdirSync(migrations).find(n=>n.endsWith('_arcade_public_rooms.sql'));
  await db.exec(fs.readFileSync(path.join(migrations,migration),'utf8'));
  const visibility=fs.readdirSync(migrations).find(n=>n.endsWith('_arcade_room_host_visibility.sql'));
  await db.exec(fs.readFileSync(path.join(migrations,visibility),'utf8'));
  async function arcade(actor,action,params={}){
    return db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);
      await tx.exec('set local role authenticated');
      const result=await tx.query('select public.arcade_room_service($1,$2,$3,$4,$5) value',[action,params.p_room??null,params.p_kind??null,params.p_title??null,JSON.stringify(params.p_options??{})]);
      return result.rows[0].value;
    });
  }
  async function roomRpc(actor,params){try{return {data:await arcade(actor,params.p_action,params),error:null};}catch(error){return {data:null,error:{message:error.message}};}}
  return {...base,arcade,roomRpc};
}
module.exports={fixture,A,B,C,MINOR};

const fs=require('node:fs'),path=require('node:path');
const {fixture:matgoFixture,A,B,C,MINOR}=require('./matgo-online-fixture.cjs');
async function fixture(){
  const base=await matgoFixture(),{db}=base;
  await db.exec(`alter table auth.users add column is_anonymous boolean default false;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.fixture_bans(id uuid primary key);
    create table public.fixture_blocks(a uuid,b uuid);
    create or replace function public.is_banned(uuid) returns boolean language sql security definer as $$select exists(select 1 from public.fixture_bans where id=$1)$$;
    create function public.blocked_between(uuid,uuid) returns boolean language sql security definer as $$select exists(select 1 from public.fixture_blocks where (a=$1 and b=$2) or (a=$2 and b=$1))$$;
    create schema extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab',$1),'hex')$$;
    create table public.board_games(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('chess','janggi','carom4','carom3','pool8')),
      p1 uuid references public.profiles(id),p2 uuid references public.profiles(id),p1_nick text,p2_nick text,status text default 'invited' check(status in ('invited','playing','done','declined','canceled')),
      moves jsonb default '[]',turn text default 'p1',janggi_layout jsonb,verified_state jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table public.board_games enable row level security;`);
  const migration=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_arcade_public_rooms.sql'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
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

const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const users=Array.from({length:12},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function fixture(){
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema fixture; create schema ojjuda_arcade_internal;
    grant usage on schema public,auth,ojjuda_arcade_internal to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create table public.profiles(id uuid primary key,nickname text);
    create table fixture.bans(id uuid primary key);
    create table fixture.blocks(a uuid,b uuid);
    create function public.is_banned(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from fixture.bans where id=$1)$$;
    create function public.blocked_between(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from fixture.blocks where a=$1 and b=$2 or a=$2 and b=$1)$$;
    create function public.mask_banned(text) returns text language sql immutable as $$select replace($1,'badword','❤️❤️')$$;
    create sequence ojjuda_arcade_internal.rooms_room_no_seq start 1001;
    create function ojjuda_arcade_internal.onecard_rooms() returns jsonb language sql stable as $$select '{"ok":true,"rooms":[{"kind":"onecard","room_no":9994}]}'::jsonb$$;
  `);
  for(const [i,game] of ['poker','bang','roulette'].entries())await db.exec(`
    create schema ojjuda_${game}_internal; grant usage on schema ojjuda_${game}_internal to authenticated;
    create function ojjuda_${game}_internal.arcade_rooms() returns jsonb language sql stable as $$select '{"ok":true,"rooms":[{"kind":"${game}","room_no":${9991+i}}]}'::jsonb$$;
  `);
  for(const [i,id] of users.entries()){
    await db.query('insert into auth.users values($1,$2)',[id,i===11]);
    await db.query('insert into public.profiles values($1,$2)',[id,i===0?'하나 badword':'회원 '+(i+1)]);
  }
  await db.query('insert into fixture.bans values($1)',[users[10]]);
  const directory=path.join(__dirname,'../supabase/migrations');
  const migration=fs.readdirSync(directory).find(name=>name.endsWith('_yut_public_multiplayer_rooms.sql'));
  await db.exec(fs.readFileSync(path.join(directory,migration),'utf8'));
  async function as(actor,query,params=[],role='authenticated'){
    return db.transaction(async tx=>{
      if(!['authenticated','anon'].includes(role))throw Error('invalid test role');
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);
      return tx.query(query,params);
    });
  }
  const call=async(actor,action,room=null,options={},role)=>
    (await as(actor,'select public.yut_room_service($1,$2,$3) value',[action,room,options],role)).rows[0].value;
  const list=async actor=>(await as(actor,'select public.arcade_general_extra_rooms() value')).rows[0].value.rooms;
  return {db,users,call,as,list,close:()=>db.close()};
}
module.exports={fixture,users};

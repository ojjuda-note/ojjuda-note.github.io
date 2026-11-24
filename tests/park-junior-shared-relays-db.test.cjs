const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

const dispatchers=['marble_online_service','matgo_abandon_round','matgo_fun_service','matgo_online_fallback',
  'matgo_online_service','matgo_ranked_settle','matgo_stake_service','matgo_wallet_service',
  'onecard_online_service','tank_online_service'];
const writers=['bang_online_service','flat_drill_verified_clear','game_computer_commit','game_verified_commit'];
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261125042500_park_junior_shared_relays.sql'),'utf8');

test('service credentials on existing game relays cannot act for a restricted Park account',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;create schema relay_internal;
    create table auth.users(id uuid primary key,role text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    create table relay_internal.actions(actor uuid not null,action text not null);
    grant usage on schema relay_internal to service_role;
    create function relay_internal.run(p_actor uuid,p_action text) returns uuid
    language plpgsql security definer set search_path='' as $$
    begin insert into relay_internal.actions values(p_actor,p_action); return p_actor; end $$;
  `);
  for(const name of [...dispatchers,...writers]){
    const actor=name==='flat_drill_verified_clear'?'p_user':'p_actor';
    const language=dispatchers.includes(name)?'sql':'plpgsql';
    const body=language==='sql'?`select relay_internal.run(${actor},p_action)`:
      `declare value uuid; begin select relay_internal.run(${actor},p_action) into value; return value; end`;
    await db.exec(`create function public.${name}(${actor} uuid,p_action text default 'play')
      returns uuid language ${language} security ${language==='sql'?'invoker':'definer'} set search_path='' as $$${body}$$;
      revoke all on function public.${name}(uuid,text) from public;
      grant execute on function public.${name}(uuid,text) to service_role;`);
  }
  const regular=randomUUID(),roleOnly=randomUUID(),appMarkerOnly=randomUUID();
  await db.query(`insert into auth.users values($1,'authenticated','{}','{"park_guardian_account":true}'),
    ($2,'park_junior','{}','{"role":"authenticated"}'),
    ($3,'authenticated','{"park_guardian_account":true}','{"park_guardian_account":false}')`,[regular,roleOnly,appMarkerOnly]);
  await db.exec(migration);
  await db.exec('set role service_role');
  for(const name of [...dispatchers,...writers]){
    const invoke=id=>db.query(`select public.${name}($1) as result`,[id]);
    assert.equal((await invoke(regular)).rows[0].result,regular);
    for(const id of [roleOnly,appMarkerOnly]){
      await assert.rejects(()=>invoke(id),e=>e.code==='42501'&&e.message.includes('park_service_only'),name);
    }
  }
  await db.exec('reset role');
  assert.deepEqual((await db.query('select actor,count(*)::int as count from relay_internal.actions group by actor')).rows,
    [{actor:regular,count:dispatchers.length+writers.length}]);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(()=>db.query('select public.park_require_shared_relay_actor($1)',[regular]),{code:'42501'});
    await assert.rejects(()=>db.query('select public.onecard_online_service($1)',[regular]),{code:'42501'});
    await db.exec('reset role');
  }
});

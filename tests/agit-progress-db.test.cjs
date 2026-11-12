const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const hub = require('../features/home/agit-hub.js');
const migrations = path.join(__dirname, '../supabase/migrations');
const matches = fs.readdirSync(migrations).filter(name => name.endsWith('_preserve_agit_daily_progress.sql'));
assert.equal(matches.length, 1, 'exactly one Agit progress preservation migration is required');
const sql = fs.readFileSync(path.join(migrations, matches[0]), 'utf8');
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
const all = ['park', 'baseball', 'quiz', 'recommend', 'visit'];
const dayAt = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const sorted = ids => [...ids].sort();

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key);
      create table public.user_private(
        user_id uuid primary key references auth.users(id) on delete cascade,
        coins integer not null default 20, data jsonb not null default '{}',
        last_checkin date, updated_at timestamptz not null default now()
      );
      alter table public.user_private enable row level security;
      create policy own_data on public.user_private to authenticated
        using (user_id = auth.uid()) with check (user_id = auth.uid());
      grant usage on schema public, auth to authenticated;
      grant select on public.user_private to authenticated;
      grant insert(user_id, data), update(data, updated_at) on public.user_private to authenticated;
      insert into auth.users values ('${A}'), ('${B}'), ('${C}');
    `);
    const today = (await db.query("select to_char((statement_timestamp() at time zone 'Asia/Seoul')::date,'YYYY-MM-DD') as day")).rows[0].day;
    const yesterday = dayAt(today, -1), tomorrow = dayAt(today, 1);
    const read = async id => (await db.query("select coins, data, to_char(last_checkin,'YYYY-MM-DD') as last_checkin from public.user_private where user_id=$1", [id])).rows[0];
    const as = async (actor, query, args = []) => db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await tx.exec('set local role authenticated');
      return tx.query(query, args);
    });
    const write = (actor, data, target = actor) => as(actor,
      'update public.user_private set data=$1::jsonb,updated_at=now() where user_id=$2 returning user_id', [JSON.stringify(data), target]);
    const restored = {sent:['old'], settings:{theme:'old', notify:{sound:true}, agitHub:{
      stamps:[dayAt(today,-3),dayAt(today,-2),yesterday,today],
      completed:{[yesterday]:all, [today]:all}, guesses:{[today]:[{guess:'123',strike:3,ball:0}]}
    }}};
    const stale = structuredClone(restored);
    stale.sent = ['new']; stale.settings.theme = 'new'; stale.settings.notify.sound = false;
    stale.settings.agitHub.stamps.pop();
    stale.settings.agitHub.completed[today] = ['park','baseball'];
    await db.query('insert into public.user_private(user_id,coins,data,last_checkin) values($1,119655,$2::jsonb,$3::date)', [A,JSON.stringify(restored),yesterday]);

    // Prove the existing whole-document write can erase repaired progress.
    await write(A,stale);
    assert.deepEqual((await read(A)).data.settings.agitHub.completed[today],['park','baseball']);
    assert.equal((await read(A)).data.settings.agitHub.stamps.includes(today),false);
    await write(A,restored);
    const beforeInstall = await read(A);
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual(await read(A),beforeInstall,'installation/retry does not rewrite existing records');

    // The actual authenticated writer needs no access to the internal function.
    await write(A,stale);
    let result = await read(A);
    assert.equal(result.coins,119655); assert.equal(result.last_checkin,yesterday);
    assert.deepEqual(result.data.settings.agitHub.stamps,restored.settings.agitHub.stamps);
    assert.deepEqual(result.data.settings.agitHub.completed[today],sorted(all));
    const expected = structuredClone(stale);
    expected.settings.agitHub.stamps = restored.settings.agitHub.stamps;
    expected.settings.agitHub.completed = {[yesterday]:sorted(all),[today]:sorted(all)};
    assert.deepEqual(result.data,expected,'only stamps/completed merge; all other data is the new input');
    await write(A,stale);
    assert.deepEqual(await read(A),result,'repeating the same stale payload is harmless');
    const other = await write(A,{settings:{}},B);
    assert.equal(other.rows.length,0,'the trigger does not expand RLS access to another account');
    await assert.rejects(as(A,'update public.user_private set coins=0 where user_id=$1',[A]),/permission denied/);

    // New signups remain empty. Two independent stale tab payloads accumulate.
    await as(B,'insert into public.user_private(user_id,data) values($1,$2::jsonb)',[B,JSON.stringify({settings:{theme:'spring'}})]);
    assert.deepEqual((await read(B)).data,{settings:{theme:'spring'}});
    await write(B,{settings:{theme:'summer'}});
    assert.deepEqual((await read(B)).data,{settings:{theme:'summer'}},'unrelated settings do not create history');
    const first = {settings:{theme:'summer',agitHub:{stamps:[today],completed:{[today]:['park']}}}};
    const second = {settings:{theme:'autumn',agitHub:{stamps:[],completed:{[today]:['quiz']}}}};
    await write(B,first); await write(B,second);
    result = await read(B);
    assert.deepEqual(result.data.settings.agitHub.stamps,[today]);
    assert.deepEqual(result.data.settings.agitHub.completed[today],['park','quiz']);
    assert.equal(result.data.settings.theme,'autumn'); assert.equal(result.coins,20);
    second.settings.agitHub.completed[today].push('recommend');
    await write(B,second);
    assert.deepEqual((await read(B)).data.settings.agitHub.completed[today],['park','quiz','recommend']);

    // Yesterday remains completed without granting today's or tomorrow's tasks.
    await as(C,'insert into public.user_private(user_id,data) values($1,$2::jsonb)',[C,JSON.stringify({settings:{agitHub:{stamps:[yesterday],completed:{[yesterday]:all}}}})]);
    await write(C,{settings:{theme:'winter'}});
    result = await read(C);
    assert.deepEqual(result.data.settings.agitHub.completed[yesterday],sorted(all));
    assert.equal(result.data.settings.agitHub.completed[today],undefined);
    for (const mission of all) {
      assert.equal(hub.isComplete(result.data.settings,mission,today),false);
      assert.equal(hub.isComplete(result.data.settings,mission,tomorrow),false);
    }
    await write(C,{settings:{agitHub:{stamps:[today,tomorrow],completed:{[today]:['visit'],[tomorrow]:all}}}});
    result = await read(C);
    assert.deepEqual(result.data.settings.agitHub.stamps,[yesterday,today]);
    assert.deepEqual(result.data.settings.agitHub.completed[today],['visit']);
    assert.equal(result.data.settings.agitHub.completed[tomorrow],undefined);

    // Same retention as the UI: latest 120 stamps; dates today-35 through today.
    const history = {settings:{agitHub:{
      stamps:Array.from({length:130},(_,i)=>dayAt(today,-i)),
      completed:{[dayAt(today,-36)]:all,[dayAt(today,-35)]:['baseball'],[today]:['park','park','unknown',{},null]},
      guesses:{keep:'submitted history is not altered by this guard'}
    }}};
    history.settings.agitHub.stamps.push(today,tomorrow,'2026-02-31','bad',null,{},55);
    history.settings.agitHub.completed['bad'] = all;
    history.settings.agitHub.completed['2026-02-31'] = all;
    history.settings.agitHub.completed[yesterday] = null;
    await write(C,history);
    result = await read(C);
    assert.equal(result.data.settings.agitHub.stamps.length,120);
    assert.equal(result.data.settings.agitHub.stamps[0],dayAt(today,-119));
    assert.equal(result.data.settings.agitHub.stamps.at(-1),today);
    assert.equal(result.data.settings.agitHub.completed[dayAt(today,-36)],undefined);
    assert.deepEqual(result.data.settings.agitHub.completed[dayAt(today,-35)],['baseball']);
    assert.deepEqual(result.data.settings.agitHub.completed[today],['park','visit']);
    assert.equal(result.data.settings.agitHub.completed.bad,undefined);
    assert.equal(result.data.settings.agitHub.completed['2026-02-31'],undefined);
    assert.deepEqual(result.data.settings.agitHub.guesses,history.settings.agitHub.guesses);
    const kept = structuredClone(result.data.settings.agitHub);
    for (const data of [{settings:{agitHub:{stamps:null,completed:[]}}},{settings:null},{settings:{agitHub:'bad'}},null,[]]) {
      await write(C,data);
      result = await read(C);
      assert.deepEqual(result.data.settings.agitHub.stamps,kept.stamps);
      assert.deepEqual(result.data.settings.agitHub.completed,kept.completed);
    }

    const privileges = (await db.query(`select prosecdef,proconfig,
      has_function_privilege('anon',oid,'execute') as anon,
      has_function_privilege('authenticated',oid,'execute') as member,
      has_function_privilege('service_role',oid,'execute') as service
      from pg_proc where oid='ojjuda_agit_internal.preserve_daily_progress()'::regprocedure`)).rows[0];
    assert.equal(privileges.prosecdef,false);
    assert.ok(privileges.proconfig.includes('search_path=""'));
    assert.equal(privileges.anon,false); assert.equal(privileges.member,false); assert.equal(privileges.service,false);
    await assert.rejects(as(A,'select ojjuda_agit_internal.preserve_daily_progress()'),/permission denied/);
    await db.exec("set datestyle='SQL, DMY'; set timezone='America/New_York'");
    await write(A,stale);
    assert.deepEqual((await read(A)).data.settings.agitHub.completed[today],sorted(all),'date/session formatting never changes the KST key');
    await db.query('delete from auth.users where id=$1',[C]);
    assert.equal(await read(C),undefined,'account deletion still removes the account and its progress');
    console.log('PASS: stale-tab regression, authenticated/RLS writes, distinct tab merges, new signup, daily boundaries, retention, malformed JSON, unrelated data/wallet preservation, no direct function access, and account deletion');
  } finally { await db.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});

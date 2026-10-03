const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder = path.join(__dirname, '../supabase/migrations');
const sql = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(name => name.endsWith('_shared_ju_charge_catalog.sql'))), 'utf8');
const bonusSql = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(name => name.endsWith('_ju_charge_bonus_packages.sql'))), 'utf8');
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
(async () => {
  const db = new PGlite();
  const value = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
  const login = async id => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;
      create table public.app_config(key text primary key,value jsonb);
      create table public.user_private(user_id uuid primary key,coins integer not null);
      create table public.coin_charges(user_id uuid,pack text,coins integer,won integer,free boolean,created_at timestamptz default now());
      alter table public.user_private enable row level security;
      alter table public.coin_charges enable row level security;
      alter table public.app_config enable row level security;
      create policy account on user_private for select to authenticated using(user_id=(select auth.uid()));
      create policy receipts on coin_charges for select to authenticated using(user_id=(select auth.uid()));
      create policy settings on app_config for select to authenticated using(true);
      grant select on user_private,coin_charges,app_config to authenticated;
      insert into app_config values('beta_free_charge','true'),('beta_charge_daily_limit','5');
      insert into user_private values('${alice}',7),('${bob}',11);`);
    await db.exec(sql);
    await db.exec(bonusSql);
    for (const signature of ['beta_charge(text)', 'beta_charge_status()']) {
      assert.equal(await value('select has_function_privilege($1,$2,$3) as value', ['anon', signature, 'execute']), false);
      assert.equal(await value('select has_function_privilege($1,$2,$3) as value', ['authenticated', signature, 'execute']), true);
    }
    for (const [won, base, bonus] of [[1000,10,0],[3000,30,0],[5000,50,5],[10000,100,10],[30000,300,35],[50000,500,50]]) {
      const coins = base + bonus;
      await db.exec('reset role; truncate coin_charges');
      await login(alice);
      const before = await value('select beta_charge_status() as value');
      const result = await value('select beta_charge($1) as value', ['p' + won]);
      assert.deepEqual([result.base, result.bonus], [base, bonus]);
      assert.deepEqual([result.ok, result.added, result.coins, result.left], [true, coins, before.coins + coins, 4]);
      const row = (await db.query('select * from coin_charges')).rows[0];
      assert.deepEqual([row.coins, row.won, row.free], [coins, won, true]);
    }
    await db.exec('reset role; truncate coin_charges');
    // Yesterday's KST receipts and another member's receipts do not use Alice's quota.
    await db.exec(`insert into coin_charges(user_id,pack,coins,won,free,created_at) values
      ('${alice}','p1000',10,1000,true,(date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-interval '1 second'),
      ('${bob}','p1000',10,1000,true,now());`);
    await login(alice);
    assert.equal((await value('select beta_charge_status() as value')).left, 5);
    for (let i = 0; i < 5; i++) assert.equal((await value("select beta_charge('p50000') as value")).left, 4 - i);
    const exhausted = await value('select beta_charge_status() as value');
    assert.deepEqual([exhausted.used, exhausted.left], [5, 0]);
    assert.equal((await value("select beta_charge('p1000') as value")).reason, 'limit');
    assert.equal((await value('select beta_charge_status() as value')).coins, exhausted.coins);
    await login(bob);
    assert.equal((await value('select beta_charge_status() as value')).left, 4);
    assert.equal((await value("select beta_charge('p999999') as value")).reason, 'unknown');
    assert.equal((await value('select beta_charge_status() as value')).coins, 11);
    await db.exec("reset role; update app_config set value='false' where key='beta_free_charge'");
    await login(bob);
    assert.equal((await value("select beta_charge('p1000') as value")).reason, 'closed');
    assert.equal((await value('select beta_charge_status() as value')).enabled, false);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','','false')");
    assert.equal((await value("select beta_charge('p1000') as value")).reason, 'no_account');
    assert.equal((await value('select beta_charge_status() as value')).reason, 'no_account');
    console.log('PASS: six fixed products, authenticated credits, shared five-per-KST-day quota, exhaustion, isolation and closed mode');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

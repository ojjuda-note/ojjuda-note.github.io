const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');

// All accounts, wallets and fingerprints are synthetic in an in-memory database.
test('biorhythm five-ju purchases, 24-hour access and administrator receipts', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const directory = path.join(__dirname, '../supabase/migrations');
  const read = suffix => {
    const matches = fs.readdirSync(directory).filter(name => name.endsWith(suffix));
    assert.equal(matches.length, 1, suffix);
    return fs.readFileSync(path.join(directory, matches[0]), 'utf8');
  };
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const key = text => createHash('sha256').update(`synthetic-biorhythm:${text}`).digest('hex');
  const birthday = key('first'), otherBirthday = key('second');
  let actor = null, role = null;
  async function login(user, nextRole = user ? 'authenticated' : 'anon') {
    await db.exec('reset role');
    await value("select set_config('request.jwt.claim.sub',$1,false) as value", [user || '']);
    await db.exec(`set role ${nextRole}`);
    actor = user; role = nextRole;
  }
  async function owner(work) {
    const previous = [actor, role];
    await db.exec('reset role');
    try { return await work(); }
    finally { if (previous[1]) await login(...previous); }
  }
  const clock = time => owner(() => value("select set_config('test.biorhythm_now',$1,false) as value", [time]));
  const member = async ({coins = 20, anonymous = false, wallet = true, profile = true, admin = false, nickname = 'Synthetic member'} = {}) => owner(async () => {
    const id = randomUUID();
    await db.query('insert into auth.users(id,is_anonymous,is_admin) values($1,$2,$3)', [id, anonymous, admin]);
    if (wallet) await db.query('insert into public.user_private(user_id,coins) values($1,$2)', [id, coins]);
    if (profile) await db.query('insert into public.profiles(id,nickname) values($1,$2)', [id, nickname]);
    return id;
  });
  const status = (birthKey = birthday) => value('select public.biorhythm_status_v1($1) as value', [birthKey]);
  const buy = ({id = randomUUID(), birthKey = birthday, expectedUser = actor, expectedCharge = 5, verify = false} = {}) =>
    value('select public.biorhythm_buy_v1($1,$2,$3,$4,$5) as value', [id, birthKey, expectedUser, expectedCharge, verify]);
  const state = user => owner(() => value(`select jsonb_build_object(
    'coins',(select coins from public.user_private where user_id=$1),
    'entitlements',(select count(*) from ojjuda_biorhythm_internal.entitlements where user_id=$1),
    'requests',(select count(*) from ojjuda_note_internal.spend_requests where user_id=$1 and kind='biorhythm_reading_v1'),
    'spent',(select coalesce(sum(coins),0) from ojjuda_note_internal.spend_requests where user_id=$1 and kind='biorhythm_reading_v1')
  ) as value`, [user]));
  const ledger = id => owner(() => value('select to_jsonb(s) as value from ojjuda_note_internal.spend_requests s where request_id=$1', [id]));
  const history = ({product = 'all', query = '', from = null, to = null, limit = 30, offset = 0} = {}) =>
    value('select public.admin_fortune_purchases($1,$2,$3,$4,$5,$6) as value', [product, query, from, to, limit, offset]);
  function receipt(item, charged) {
    assert.equal(item.ok, true); assert.equal(item.entitled, true);
    assert.equal(item.product, 'biorhythm'); assert.equal(item.topic, 'rhythm');
    assert.equal(item.title, '오늘의 바이오리듬'); assert.equal(item.price, 5);
    assert.equal(item.charged, charged); assert.equal(item.replayed, charged === 0);
    assert.equal(item.access_hours, 24); assert.equal(item.access_version, 1); assert.equal(item.entitlement_version, 1);
    assert.match(item.birth_key, /^[0-9a-f]{64}$/);
    assert.equal(Date.parse(item.expires_at) - Date.parse(item.paid_at), 86400000);
    assert.ok(Date.parse(item.server_now) < Date.parse(item.expires_at));
    for (const field of ['birth_date', 'target_date', 'name', 'results', 'year']) assert.equal(Object.hasOwn(item, field), false);
  }

  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_note_internal; create schema ojjuda_admin_internal;
    create table auth.users(id uuid primary key,is_anonymous boolean,is_admin boolean not null default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text);
    create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,coins integer not null,banned_until timestamptz);
    alter table public.user_private enable row level security;
    create policy wallet_read on public.user_private for select to authenticated using(user_id=auth.uid());
    grant select on public.user_private to authenticated;
    create function public.is_banned(u uuid) returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from public.user_private where user_id=u and banned_until>now())$$;
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from auth.users where id=auth.uid() and is_admin=true)$$;
    create table ojjuda_note_internal.spend_requests(
      request_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
      kind text not null check(char_length(kind) between 1 and 60),target_id uuid,
      coins integer not null check(coins>=0),result jsonb not null default '{}',created_at timestamptz not null default now()
    );
    create function public.biorhythm_test_clock() returns timestamptz language sql stable as
      $$select current_setting('test.biorhythm_now')::timestamptz$$;
    select set_config('test.biorhythm_now','2026-11-13T03:00:00Z',false);
    grant usage on schema public,auth to anon,authenticated;
    revoke all on schema ojjuda_admin_internal from public,anon;
    grant usage on schema ojjuda_admin_internal to authenticated;
  `);
  for (const suffix of ['_saju_reading_ten_ju_entitlement.sql', '_saju_purchase_account_guard.sql', '_saju_category_purchases_v2.sql', '_saju_all_purchases_v3.sql', '_saju_twenty_four_hour_access_v4.sql', '_admin_fortune_purchase_history.sql', '_saju_compatibility_ten_ju_24h_v1.sql']) await db.exec(read(suffix));
  const oldDefinitions = await db.query(`select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_saju_internal' or (n.nspname='public' and p.proname like 'saju_%') order by name`);
  await db.exec(read('_biorhythm_five_ju_24h_v1.sql').replaceAll('pg_catalog.clock_timestamp()', 'public.biorhythm_test_clock()'));

  await t.test('private data, helper permissions, fixed search paths and foreign-key indexes are explicit', async () => {
    const table = await value(`select jsonb_build_object('rls',c.relrowsecurity,
      'anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
      'member',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
      'service',has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as value
      from pg_class c where c.oid='ojjuda_biorhythm_internal.entitlements'::regclass`);
    assert.deepEqual(table, {rls: true, anon: false, member: false, service: false});
    const functions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') member,
      has_function_privilege('service_role',p.oid,'EXECUTE') service
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='ojjuda_biorhythm_internal' or (n.nspname='public' and p.proname like 'biorhythm_%' and p.proname<>'biorhythm_test_clock')`)).rows;
    assert.equal(functions.length, 5);
    for (const fn of functions) {
      assert.equal(fn.anon, false); assert.equal(fn.service, false);
      assert.equal(fn.member, fn.proname !== 'receipt_v1');
      assert.equal(fn.prosecdef, fn.nspname === 'ojjuda_biorhythm_internal' && fn.proname !== 'receipt_v1');
      assert.ok(fn.proconfig.includes('search_path=""'));
    }
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='ojjuda_biorhythm_internal' and table_name='entitlements' order by ordinal_position")).rows.map(row => row.column_name);
    assert.deepEqual(columns, ['user_id', 'birth_key', 'request_id', 'price', 'purchased_at']);
    const indexes = (await db.query("select indexdef from pg_indexes where schemaname='ojjuda_biorhythm_internal' and tablename='entitlements'")).rows.map(row => row.indexdef).join('\n');
    assert.match(indexes, /\(user_id, birth_key\)/); assert.match(indexes, /\(request_id\)/);
  });

  await t.test('existing saju and compatibility functions are byte-for-byte unchanged', async () => {
    const after = await db.query(`select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='ojjuda_saju_internal' or (n.nspname='public' and p.proname like 'saju_%') order by name`);
    assert.deepEqual(after.rows, oldDefinitions.rows);
  });

  await t.test('one purchase costs five; exact retries and active access do not debit or extend the deadline', async () => {
    const user = await member(); await login(user);
    assert.equal((await status(null)).price, 5); assert.equal((await status()).entitlement, null);
    const id = randomUUID(), first = await buy({id}); receipt(first, 5);
    const original = await ledger(id);
    assert.equal(first.coins, 15);
    const replay = await buy({id}); receipt(replay, 0);
    assert.equal(replay.entitlement_replayed, false);
    const secondClick = await buy({expectedCharge: 0}); receipt(secondClick, 0);
    assert.equal(secondClick.request_id, id); assert.equal(secondClick.entitlement_replayed, true);
    assert.equal(secondClick.expires_at, first.expires_at);
    receipt((await status()).entitlement, 0);
    assert.deepEqual(await ledger(id), original);
    assert.deepEqual(await state(user), {coins: 15, entitlements: 1, requests: 1, spent: 5});
  });

  await t.test('both stale quotes fail closed and different birthday keys remain separate purchases', async () => {
    const user = await member(); await login(user);
    const tooLow = await buy({expectedCharge: 0}); assert.equal(tooLow.reason, 'price_changed'); assert.equal(tooLow.required, 5);
    await buy();
    const tooHigh = await buy(); assert.equal(tooHigh.reason, 'price_changed'); assert.equal(tooHigh.required, 0);
    assert.deepEqual(await state(user), {coins: 15, entitlements: 1, requests: 1, spent: 5});
    receipt(await buy({birthKey: otherBirthday}), 5);
    assert.deepEqual(await state(user), {coins: 10, entitlements: 2, requests: 2, spent: 10});
  });

  await t.test('A then B then A costs ten total and each birthday keeps its own unextended expiry', async () => {
    const user = await member(); await login(user);
    const initialTime = '2026-11-13T03:00:00Z';
    try {
      await clock(initialTime);
      const first = await buy({birthKey: birthday}); receipt(first, 5);
      await clock('2026-11-13T04:00:00Z');
      const second = await buy({birthKey: otherBirthday}); receipt(second, 5);
      assert.notEqual(first.request_id, second.request_id);
      assert.equal(Date.parse(second.paid_at) - Date.parse(first.paid_at), 3600000);
      assert.equal(Date.parse(second.expires_at) - Date.parse(first.expires_at), 3600000);
      const originalA = await ledger(first.request_id), originalB = await ledger(second.request_id);
      const twoPurchases = {coins: 10, entitlements: 2, requests: 2, spent: 10};

      await clock('2026-11-13T05:00:00Z');
      const returnA = await buy({birthKey: birthday, expectedCharge: 0}); receipt(returnA, 0);
      assert.equal(returnA.request_id, first.request_id);
      assert.equal(returnA.paid_at, first.paid_at); assert.equal(returnA.expires_at, first.expires_at);
      for (const original of [first, second]) {
        const current = (await status(original.birth_key)).entitlement; receipt(current, 0);
        assert.equal(current.request_id, original.request_id);
        assert.equal(current.paid_at, original.paid_at); assert.equal(current.expires_at, original.expires_at);
      }
      assert.deepEqual(await state(user), twoPurchases);

      await clock(first.expires_at);
      assert.equal((await status(birthday)).entitlement, null);
      assert.equal((await buy({id: first.request_id, birthKey: birthday})).reason, 'access_expired');
      const expiredQuote = await buy({birthKey: birthday, expectedCharge: 0});
      assert.equal(expiredQuote.reason, 'price_changed'); assert.equal(expiredQuote.required, 5);
      const returnB = await buy({birthKey: otherBirthday, expectedCharge: 0}); receipt(returnB, 0);
      assert.equal(returnB.request_id, second.request_id);
      assert.equal(returnB.paid_at, second.paid_at); assert.equal(returnB.expires_at, second.expires_at);
      assert.deepEqual(await state(user), twoPurchases);

      await clock(second.expires_at);
      assert.equal((await status(birthday)).entitlement, null);
      assert.equal((await status(otherBirthday)).entitlement, null);
      assert.equal((await buy({id: second.request_id, birthKey: otherBirthday})).reason, 'access_expired');
      assert.deepEqual(await ledger(first.request_id), originalA);
      assert.deepEqual(await ledger(second.request_id), originalB);
      assert.deepEqual(await state(user), twoPurchases);
    } finally {
      await clock(initialTime);
    }
  });

  await t.test('exact expiry removes access; an old request cannot renew and a new explicit purchase preserves both debits', async () => {
    const user = await member(); await login(user);
    const id = randomUUID(), first = await buy({id}); const original = await ledger(id);
    await clock(first.expires_at);
    assert.equal((await status()).entitlement, null);
    assert.equal((await buy({id})).reason, 'access_expired');
    assert.equal((await buy({expectedCharge: 0})).required, 5);
    const renewed = await buy(); receipt(renewed, 5);
    assert.notEqual(renewed.request_id, id);
    assert.equal(Date.parse(renewed.paid_at), Date.parse(first.expires_at));
    assert.equal((await buy({id})).reason, 'access_expired');
    assert.deepEqual(await ledger(id), original);
    assert.deepEqual(await state(user), {coins: 10, entitlements: 1, requests: 2, spent: 10});
    await clock('2026-11-13T03:00:00Z');
  });

  await t.test('status and recovery are read-only and cannot create a missing purchase', async () => {
    const user = await member(); await login(user);
    const id = randomUUID();
    await db.exec('begin read only');
    try { assert.equal((await status()).entitlement, null); assert.equal((await buy({id, verify: true})).reason, 'not_found'); }
    finally { await db.exec('rollback'); }
    assert.deepEqual(await state(user), {coins: 20, entitlements: 0, requests: 0, spent: 0});
    await buy({id});
    const before = await state(user);
    await db.exec('begin read only');
    try { receipt((await status()).entitlement, 0); receipt(await buy({id, verify: true}), 0); receipt(await buy({verify: true}), 0); }
    finally { await db.exec('rollback'); }
    assert.deepEqual(await state(user), before);
  });

  await t.test('request UUIDs cannot be reused for another key, account or product', async () => {
    const user = await member(), other = await member(); await login(user);
    const id = randomUUID(); await buy({id});
    assert.equal((await buy({id, birthKey: otherBirthday})).reason, 'request_conflict');
    assert.equal((await buy({expectedUser: other})).reason, 'account_changed');
    await login(other);
    assert.equal((await status()).entitlement, null);
    assert.equal((await buy({id})).reason, 'request_conflict');
    assert.deepEqual(await state(other), {coins: 20, entitlements: 0, requests: 0, spent: 0});
    await owner(() => db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'tarot_reading_v1',10,'{\"ok\":true}')", [randomUUID(), other]));
    const previous = await owner(() => value("select request_id as value from ojjuda_note_internal.spend_requests where user_id=$1 and kind='tarot_reading_v1'", [other]));
    assert.equal((await buy({id: previous})).reason, 'request_conflict');
  });

  await t.test('signed-out, anonymous, deleted, banned, profileless and walletless accounts cannot buy', async () => {
    await login(null); await assert.rejects(() => status(), /permission denied/); await assert.rejects(() => buy(), /permission denied/);
    for (const [options, reason] of [[{anonymous: true}, 'member_required'], [{wallet: false}, 'wallet_unavailable'], [{profile: false}, 'profile_unavailable']]) {
      const user = await member(options); await login(user);
      assert.equal((await status()).reason, reason); assert.equal((await buy()).reason, reason);
      assert.equal((await state(user)).requests, 0);
    }
    const banned = await member(); await owner(() => db.query("update public.user_private set banned_until='infinity' where user_id=$1", [banned])); await login(banned);
    assert.equal((await status()).reason, 'banned'); assert.equal((await buy()).reason, 'banned'); assert.equal((await state(banned)).coins, 20);
    const deleted = await member(); await owner(() => db.query('delete from auth.users where id=$1', [deleted])); await login(deleted);
    assert.equal((await status()).reason, 'member_required'); assert.equal((await buy()).reason, 'member_required');
  });

  await t.test('invalid inputs and insufficient balance never change wallet or ledger', async () => {
    const user = await member({coins: 4}); await login(user);
    for (const options of [{id: null}, {birthKey: null}, {birthKey: '1990-01-01'}, {birthKey: 'x'.repeat(64)}, {expectedCharge: null}, {expectedCharge: 10}, {verify: null}]) assert.equal((await buy(options)).reason, 'invalid');
    const poor = await buy(); assert.equal(poor.reason, 'coins'); assert.equal(poor.required, 5); assert.equal(poor.coins, 4);
    assert.deepEqual(await state(user), {coins: 4, entitlements: 0, requests: 0, spent: 0});
  });

  await t.test('a damaged ledger fails closed and does not cause a second debit', async () => {
    const user = await member(); await login(user); const first = await buy();
    await owner(() => db.query('update ojjuda_note_internal.spend_requests set coins=4 where request_id=$1', [first.request_id]));
    const before = await state(user);
    assert.equal((await status()).reason, 'receipt_unavailable'); assert.equal((await buy()).reason, 'receipt_unavailable');
    assert.deepEqual(await state(user), before);
  });

  await t.test('ledger and entitlement insert failures roll back the entire debit', async () => {
    const user = await member(); await login(user);
    await owner(() => db.exec("create function public.reject_biorhythm_test_insert() returns trigger language plpgsql as $$begin raise exception 'synthetic_insert_failure'; end$$;"));
    for (const table of ['ojjuda_note_internal.spend_requests', 'ojjuda_biorhythm_internal.entitlements']) {
      await owner(() => db.exec(`create trigger reject_biorhythm_insert before insert on ${table} for each row execute function public.reject_biorhythm_test_insert()`));
      await assert.rejects(() => buy(), /synthetic_insert_failure/);
      assert.deepEqual(await state(user), {coins: 20, entitlements: 0, requests: 0, spent: 0});
      await owner(() => db.exec(`drop trigger reject_biorhythm_insert on ${table}`));
    }
    receipt(await buy(), 5);
  });

  await t.test('admin history includes five-ju debits, preserves other products and omits fingerprints', async () => {
    const user = await member({nickname: 'Synthetic 100%_member'}), admin = await member({admin: true});
    await login(user); const paid = await buy(); await buy({expectedCharge: 0});
    await owner(async () => {
      for (const [kind, coins, result] of [
        ['tarot_reading_v1', 30, {ok: true, topic: 'overall'}],
        ['saju_reading_v1', 10, {ok: true}],
        ['saju_reading_v2', 10, {ok: true, topic: 'annual', year: 2026}],
        ['saju_compatibility_v1', 10, {ok: true, topic: 'compatibility'}],
        ['biorhythm_reading_v1', 0, {ok: true, topic: 'rhythm'}],
        ['biorhythm_reading_v1', 5, {ok: false, topic: 'rhythm'}],
      ]) await db.query('insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at) values($1,$2,$3,$4,$5,$6)', [randomUUID(), user, kind, coins, JSON.stringify(result), '2026-11-13T03:00:00Z']);
    });
    await assert.rejects(() => history(), /admin_required/); await login(admin);
    const all = await history({query: user});
    assert.equal(all.total_count, 5); assert.equal(all.total_ju, 65);
    assert.equal(all.tarot_count, 1); assert.equal(all.saju_count, 3); assert.equal(all.biorhythm_count, 1);
    const item = all.items.find(row => row.request_id === paid.request_id);
    assert.equal(item.product, 'biorhythm'); assert.equal(item.topic, 'rhythm'); assert.equal(item.topic_title, '오늘의 바이오리듬'); assert.equal(item.year, null); assert.equal(item.coins, 5);
    assert.doesNotMatch(JSON.stringify(all), /birth_key|birth_date|paid_at|expires_at|synthetic-biorhythm/);
    assert.equal((await history({query: '100%_', product: 'biorhythm'})).total_count, 1);
    assert.equal((await history({query: user, product: 'saju'})).total_count, 3);
    assert.equal((await history({query: user, product: 'tarot'})).total_count, 1);
    const page = await history({query: user, limit: 2, offset: 5}); assert.equal(page.items.length, 0); assert.equal(page.total_count, 5); assert.equal(page.biorhythm_count, 1);
    const before = await owner(() => value('select jsonb_agg(to_jsonb(s) order by request_id) as value from ojjuda_note_internal.spend_requests s where user_id=$1', [user]));
    await history({query: user});
    assert.deepEqual(await owner(() => value('select jsonb_agg(to_jsonb(s) order by request_id) as value from ojjuda_note_internal.spend_requests s where user_id=$1', [user])), before);
  });

  await t.test('history keeps inclusive Korean date boundaries and rejects invalid filters', async () => {
    const user = await member(), admin = await member({admin: true});
    const entries = ['2026-11-12T14:59:59Z', '2026-11-12T15:00:00Z', '2026-11-13T14:59:59Z', '2026-11-13T15:00:00Z'];
    await owner(async () => { for (const at of entries) await db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at) values($1,$2,'biorhythm_reading_v1',5,'{\"ok\":true}', $3)", [randomUUID(), user, at]); });
    await login(admin); await db.exec("set timezone='America/Los_Angeles'");
    const result = await history({product: 'biorhythm', query: user, from: '2026-11-13', to: '2026-11-13'});
    assert.equal(result.total_count, 2); assert.equal(result.total_ju, 10); assert.equal(result.biorhythm_count, 2);
    assert.deepEqual(result.items.map(row => Date.parse(row.created_at)).sort(), entries.slice(1, 3).map(Date.parse).sort());
    await assert.rejects(() => history({product: 'birth-key'}), /invalid_fortune_page/);
    await assert.rejects(() => history({limit: 101}), /invalid_fortune_page/);
  });
});

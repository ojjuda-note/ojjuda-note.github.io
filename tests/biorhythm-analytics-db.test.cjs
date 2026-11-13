const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');

test('biorhythm visits extend the current administrator analytics without reconstructing history', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '00000000-0000-4000-8000-000000000001';
  const member = '00000000-0000-4000-8000-000000000002';
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from public.app_admins where user_id=auth.uid())$$;
    create function public.biorhythm_visit_clock() returns timestamptz language sql stable as $$select current_setting('test.clock')::timestamptz$$;
    select set_config('test.clock','2026-11-11T15:00:00Z',false);
    create table public.user_private(user_id uuid primary key,coins integer);
    insert into public.user_private values('${member}',123);
    create schema ojjuda_note_internal;
    create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb,created_at timestamptz);
    insert into ojjuda_note_internal.spend_requests values
      ('10000000-0000-4000-8000-000000000001','${member}','tarot_reading_v1',30,'{"ok":true,"topic":"overall"}','2026-11-01T00:00:00Z');
  `);
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const clock = now => value("select set_config('test.clock',$1,false) as value", [now]);
  const headers = object => value("select set_config('request.headers',$1,false) as value", [JSON.stringify(object)]);
  const as = async (actor, work, role = actor ? 'authenticated' : 'anon') => {
    await value("select set_config('request.jwt.claim.sub',$1,false) as value", [actor || '']);
    await db.exec(`set role ${role}`);
    try { return await work(); } finally { await db.exec('reset role'); }
  };
  const record = (id, feature = 'biorhythm') => value('select public.record_site_usage($1,$2,$3,$4) as value', [id, 'feature', feature, null]);
  const report = () => value('select public.admin_site_usage_stats() as value');
  const adminReport = () => as(admin, report);
  const directory = path.join(__dirname, '../supabase/migrations');
  const load = suffix => {
    const matches = fs.readdirSync(directory).filter(name => name.endsWith(suffix));
    assert.equal(matches.length, 1, suffix);
    return fs.readFileSync(path.join(directory, matches[0]), 'utf8')
      .replaceAll('statement_timestamp()', 'public.biorhythm_visit_clock()')
      .replaceAll('now()', 'public.biorhythm_visit_clock()');
  };
  for (const suffix of ['_site_usage_analytics.sql', '_guest_popularity.sql', '_feature_detail_breakdown.sql', '_fortune_visit_analytics.sql']) await db.exec(load(suffix));
  const normalHeaders = {origin: 'https://ojjuda.kr', 'user-agent': 'Mozilla/5.0'};
  await headers(normalHeaders);
  const previousVisitor = randomUUID();
  await as(null, async () => {
    await value('select public.record_site_usage($1,$2,$3,$4) as value', [previousVisitor, 'visit', null, 'direct']);
    for (const feature of ['tarot', 'saju', 'park', 'game_stacker']) await record(previousVisitor, feature);
    await value('select public.record_site_detail($1,$2) as value', [previousVisitor, 'agit_stamp']);
    await assert.rejects(() => record(previousVisitor), /invalid_insight_feature/);
  });
  const billing = () => value(`select jsonb_build_object(
    'wallet',(select jsonb_agg(to_jsonb(w) order by user_id) from public.user_private w),
    'ledger',(select jsonb_agg(to_jsonb(s) order by request_id) from ojjuda_note_internal.spend_requests s)
  ) as value`);
  const aggregates = () => value(`select jsonb_build_object(
    'settings',(select jsonb_build_object('started_at',started_at,'fortune_started_at',fortune_started_at,'salt',salt) from ojjuda_insights.settings),
    'visits',(select jsonb_agg(to_jsonb(v) order by visit_day,visit_hour,source) from ojjuda_insights.visit_totals v),
    'features',(select jsonb_agg(to_jsonb(f) order by visit_day,feature) from ojjuda_insights.feature_totals f),
    'guests',(select jsonb_agg(to_jsonb(g) order by visit_day,feature) from ojjuda_insights.guest_feature_totals g),
    'details',(select jsonb_agg(to_jsonb(d) order by visit_day,detail) from ojjuda_insights.detail_totals d),
    'seen',(select jsonb_agg(to_jsonb(s) order by visit_day,browser_hash,event_key) from ojjuda_insights.seen s),
    'limits',(select jsonb_agg(to_jsonb(l) order by hour_start) from ojjuda_insights.hour_limits l)
  ) as value`);
  const originalBilling = await billing(), originalAggregates = await aggregates();
  await clock('2026-11-13T03:00:00Z');
  const originalReport = await adminReport();
  await db.exec(load('_biorhythm_visit_analytics.sql'));

  await t.test('new collection has its own exact start and uses null before collection without altering old statistics', async () => {
    const result = await adminReport();
    assert.equal(Date.parse(result.fortune_visits.started_at), Date.parse('2026-11-11T15:00:00Z'));
    assert.equal(Date.parse(result.fortune_visits.biorhythm_started_at), Date.parse('2026-11-13T03:00:00Z'));
    assert.equal(result.fortune_visits.daily.length, 30);
    for (const row of result.fortune_visits.daily.slice(0, -1)) assert.equal(row.biorhythm, null);
    assert.deepEqual(result.fortune_visits.daily.at(-1), {period: '2026-11-13', tarot: 0, saju: 0, biorhythm: 0});
    assert.deepEqual(result.fortune_visits.daily.at(-2), {period: '2026-11-12', tarot: 1, saju: 1, biorhythm: null});
    const {biorhythm_started_at, daily, ...unchangedFortune} = result.fortune_visits;
    const oldShape = {...result, fortune_visits: {...unchangedFortune, daily: daily.map(({biorhythm, ...rest}) => rest)}};
    assert.deepEqual(oldShape, originalReport);
    assert.deepEqual(await billing(), originalBilling);
    assert.deepEqual(await aggregates(), originalAggregates);
  });

  await t.test('admin-only reporting remains read-only and raw tables stay inaccessible', async () => {
    await assert.rejects(() => as(null, report), /permission denied/);
    await assert.rejects(() => as(member, report), /admin_required/);
    await assert.rejects(() => as(member, () => value('select ojjuda_insights.admin_fortune_visits() as value')), /admin_required/);
    await assert.rejects(() => as(admin, () => db.query('select * from ojjuda_insights.feature_totals')), /permission denied/);
    await as(admin, async () => { await db.exec('begin read only'); try { assert.ok((await report()).fortune_visits); } finally { await db.exec('rollback'); } });
    for (const signature of ['public.admin_site_usage_stats()', 'ojjuda_insights.admin_fortune_visits()']) {
      assert.equal(await value('select has_function_privilege($1,$2,$3) as value', ['anon', signature, 'EXECUTE']), false);
      assert.equal(await value('select has_function_privilege($1,$2,$3) as value', ['service_role', signature, 'EXECUTE']), false);
    }
  });

  let countedVisitor;
  await t.test('anonymous and member page entries count once per browser, day and product', async () => {
    countedVisitor = randomUUID();
    await as(null, async () => { await record(countedVisitor); await record(countedVisitor); await record(countedVisitor, 'tarot'); });
    await as(member, async () => { await record(countedVisitor); await record(randomUUID()); await record(countedVisitor, 'saju'); });
    const result = await adminReport();
    assert.deepEqual(result.fortune_visits.daily.at(-1), {period: '2026-11-13', tarot: 1, saju: 1, biorhythm: 2});
    assert.ok(result.features.every(item => !['tarot', 'saju', 'biorhythm'].includes(item.feature)));
    assert.equal(result.total, originalReport.total, 'feature entries do not fabricate site visits');
    assert.deepEqual(result.guest_games, originalReport.guest_games);
    assert.deepEqual(result.guest_boards, originalReport.guest_boards);
    assert.deepEqual(await billing(), originalBilling);
  });

  await t.test('DNT, GPC, bots, invalid origins and invalid UUIDs cannot increase the count', async () => {
    const before = await aggregates();
    for (const protectedHeaders of [{...normalHeaders, dnt: '1'}, {...normalHeaders, 'sec-gpc': '1'}, {...normalHeaders, 'user-agent': 'SearchBot crawler'}]) {
      await headers(protectedHeaders); assert.equal((await as(null, () => record(randomUUID()))).ok, true);
    }
    for (const origin of ['https://malicious.example', 'null', '', 'https://ojjuda.kr.evil.example']) {
      await headers({...normalHeaders, origin}); await assert.rejects(() => as(null, () => record(randomUUID())), /invalid_visit_origin/);
    }
    await headers(normalHeaders);
    for (const id of [null, '00000000-0000-0000-0000-000000000000']) await assert.rejects(() => as(null, () => record(id)), /invalid_visit_id/);
    await assert.rejects(() => as(null, () => record(randomUUID(), 'biorhythm_1990-01-01')), /invalid_insight_feature/);
    assert.deepEqual(await aggregates(), before);
  });

  await t.test('Korean midnight starts a new dedup period without changing the collection start', async () => {
    await clock('2026-11-13T14:59:59Z'); await as(null, () => record(countedVisitor));
    assert.equal((await adminReport()).fortune_visits.daily.at(-1).biorhythm, 2);
    await clock('2026-11-13T15:00:00Z'); await as(null, () => record(countedVisitor));
    const result = await adminReport();
    assert.deepEqual(result.fortune_visits.daily.at(-2), {period: '2026-11-13', tarot: 1, saju: 1, biorhythm: 2});
    assert.deepEqual(result.fortune_visits.daily.at(-1), {period: '2026-11-14', tarot: 0, saju: 0, biorhythm: 1});
    assert.equal(Date.parse(result.fortune_visits.biorhythm_started_at), Date.parse('2026-11-13T03:00:00Z'));
    await db.exec("set timezone='America/Los_Angeles'");
    try {
      const shifted = (await adminReport()).fortune_visits;
      assert.deepEqual(shifted.daily, result.fortune_visits.daily);
      assert.equal(Date.parse(shifted.started_at), Date.parse(result.fortune_visits.started_at));
      assert.equal(Date.parse(shifted.biorhythm_started_at), Date.parse(result.fortune_visits.biorhythm_started_at));
    } finally { await db.exec("set timezone='UTC'"); }
  });

  await t.test('the existing hourly cap preserves duplicate suppression and rejects only new events', async () => {
    await db.query("update ojjuda_insights.hour_limits set events=20000 where hour_start=date_trunc('hour',public.biorhythm_visit_clock())");
    const before = await aggregates();
    assert.equal((await as(null, () => record(countedVisitor))).ok, true);
    assert.deepEqual(await as(null, () => record(randomUUID())), {ok: false, reason: 'rate_limited'});
    assert.deepEqual(await aggregates(), before);
  });

  await t.test('the rolling chart contains only chronological counts and exposes no identities or birthday keys', async () => {
    await clock('2026-12-13T03:00:00Z');
    await as(null, () => record(randomUUID()));
    const result = await adminReport();
    assert.equal(result.fortune_visits.daily.length, 30);
    assert.equal(result.fortune_visits.daily[0].period, '2026-11-14');
    assert.equal(result.fortune_visits.daily.at(-1).period, '2026-12-13');
    assert.equal(result.fortune_visits.daily.at(-1).biorhythm, 1);
    assert.ok(result.fortune_visits.daily.every(row => Number.isInteger(row.biorhythm) && row.biorhythm >= 0));
    assert.deepEqual(Object.keys(result.fortune_visits).sort(), ['biorhythm_started_at', 'daily', 'started_at']);
    assert.ok(result.fortune_visits.daily.every(row => Object.keys(row).sort().join(',') === 'biorhythm,period,saju,tarot'));
    assert.doesNotMatch(JSON.stringify(result), /birth_key|birth_date|browser_hash|request_id|user_id|salt|Mozilla/);
    assert.deepEqual(await billing(), originalBilling);
  });
});

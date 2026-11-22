const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');

test('Pajang visits extend private administrator analytics without altering older clients or history', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '00000000-0000-4000-8000-000000000001';
  const member = '00000000-0000-4000-8000-000000000002';
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${admin}');
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from public.app_admins where user_id=auth.uid())$$;
    create function public.pajang_visit_clock() returns timestamptz language sql stable as
      $$select current_setting('test.clock')::timestamptz$$;
    select set_config('test.clock','2026-11-20T14:50:00Z',false);
  `);
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const clock = now => value("select set_config('test.clock',$1,false) as value", [now]);
  const headers = object => value("select set_config('request.headers',$1,false) as value", [JSON.stringify(object)]);
  const as = async (actor, work) => {
    await value("select set_config('request.jwt.claim.sub',$1,false) as value", [actor || '']);
    await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
    try { return await work(); } finally { await db.exec('reset role'); }
  };
  const record = (id, feature = 'pajang') => value(
    'select public.record_site_usage($1,$2,$3,$4) as value', [id, 'feature', feature, null]);
  const report = () => value('select public.admin_site_usage_stats() as value');
  const adminReport = () => as(admin, report);
  const directory = path.join(__dirname, '../supabase/migrations');
  const load = suffix => {
    const matches = fs.readdirSync(directory).filter(name => name.endsWith(suffix));
    assert.equal(matches.length, 1, suffix);
    return fs.readFileSync(path.join(directory, matches[0]), 'utf8')
      .replaceAll('statement_timestamp()', 'public.pajang_visit_clock()')
      .replaceAll('now()', 'public.pajang_visit_clock()');
  };
  for (const suffix of ['_site_usage_analytics.sql', '_guest_popularity.sql', '_feature_detail_breakdown.sql',
    '_fortune_visit_analytics.sql', '_biorhythm_visit_analytics.sql']) await db.exec(load(suffix));
  const normalHeaders = {origin: 'https://ojjuda.kr', 'user-agent': 'Mozilla/5.0'};
  await headers(normalHeaders);
  await as(null, async () => {
    const id = randomUUID();
    await value('select public.record_site_usage($1,$2,$3,$4) as value', [id, 'visit', null, 'direct']);
    for (const feature of ['tarot', 'saju', 'biorhythm', 'park', 'game_stacker']) await record(id, feature);
    await value('select public.record_site_detail($1,$2) as value', [id, 'agit_stamp']);
    await assert.rejects(() => record(id), /invalid_insight_feature/);
  });
  const storedData = () => value(`select jsonb_build_object(
    'settings',(select to_jsonb(s)-'pajang_started_at' from ojjuda_insights.settings s),
    'visits',(select jsonb_agg(to_jsonb(v) order by visit_day,visit_hour,source) from ojjuda_insights.visit_totals v),
    'features',(select jsonb_agg(to_jsonb(f) order by visit_day,feature) from ojjuda_insights.feature_totals f),
    'guests',(select jsonb_agg(to_jsonb(g) order by visit_day,feature) from ojjuda_insights.guest_feature_totals g),
    'details',(select jsonb_agg(to_jsonb(d) order by visit_day,detail) from ojjuda_insights.detail_totals d),
    'seen',(select jsonb_agg(to_jsonb(s) order by visit_day,browser_hash,event_key) from ojjuda_insights.seen s),
    'limits',(select jsonb_agg(to_jsonb(l) order by hour_start) from ojjuda_insights.hour_limits l)
  ) as value`);
  const guards = () => value(`select jsonb_agg(jsonb_build_object(
      'function',p.oid::regprocedure::text,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig)
      order by p.oid::regprocedure::text) as value
    from pg_proc p where p.oid in (
      'public.record_site_usage(uuid,text,text,text)'::regprocedure,
      'public.admin_site_usage_stats()'::regprocedure,
      'ojjuda_insights.record_event(uuid,text,text,text)'::regprocedure,
      'ojjuda_insights.admin_stats()'::regprocedure)`);
  const originalData = await storedData(), originalGuards = await guards();
  const originalWrapper = await value("select pg_get_functiondef('public.admin_site_usage_stats()'::regprocedure) as value");
  await clock('2026-11-20T14:59:00Z');
  const originalReport = await adminReport();
  await db.exec(load('_pajang_visit_analytics.sql'));

  await t.test('migration leaves prior data, access controls and the public report contract intact', async () => {
    assert.deepEqual(await storedData(), originalData);
    assert.deepEqual(await guards(), originalGuards);
    assert.equal(await value("select pg_get_functiondef('public.admin_site_usage_stats()'::regprocedure) as value"), originalWrapper);
    const {pajang_visits, ...legacy} = await adminReport();
    assert.deepEqual(legacy, originalReport);
    assert.equal(Date.parse(pajang_visits.started_at), Date.parse('2026-11-20T14:59:00Z'));
    assert.equal(pajang_visits.uses, 0, 'no historical visits are reconstructed');
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['settings', 'visit_totals', 'feature_totals', 'seen', 'hour_limits']) {
        for (const privilege of ['select', 'insert', 'update', 'delete']) {
          assert.equal(await value(`select has_table_privilege('${role}','ojjuda_insights.${table}','${privilege}') as value`), false);
        }
      }
    }
    assert.equal(await value("select bool_and(relrowsecurity) as value from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ojjuda_insights' and c.relkind='r'"), true);
    await assert.rejects(() => as(null, report), /permission denied/);
    await assert.rejects(() => as(member, report), /admin_required/);
  });

  await t.test('the same browser counts once across refreshes and login, with a new count after Korean midnight', async () => {
    const id = randomUUID();
    await as(null, async () => { await record(id); await record(id); });
    await as(member, () => record(id));
    assert.equal((await adminReport()).pajang_visits.uses, 1);
    await as(member, () => record(randomUUID()));
    assert.equal((await adminReport()).pajang_visits.uses, 2);
    await clock('2026-11-20T15:00:00Z');
    const afterMidnight = await as(member, () => record(id));
    assert.equal(afterMidnight.day, '2026-11-21');
    assert.equal((await adminReport()).pajang_visits.uses, 3);
    assert.equal(await value("select count(*)::integer as value from ojjuda_insights.seen where event_key='pajang'"), 3);
    assert.equal(await value('select sum(visits)::integer as value from ojjuda_insights.visit_totals'), 1,
      'feature entries do not inflate the existing site visit count');
  });

  await t.test('origin, bots, privacy choices and invalid features keep the existing protections', async () => {
    const before = await storedData();
    await headers({origin: 'https://untrusted.example', 'user-agent': 'Mozilla/5.0'});
    await assert.rejects(() => as(null, () => record(randomUUID())), /invalid_visit_origin/);
    for (const overrides of [{'user-agent': 'Googlebot'}, {dnt: '1'}, {'sec-gpc': '1'}]) {
      await headers({...normalHeaders, ...overrides});
      assert.equal((await as(null, () => record(randomUUID()))).ok, true);
    }
    await headers(normalHeaders);
    await assert.rejects(() => as(null, () => record(randomUUID(), 'pajang_private_answer')), /invalid_insight_feature/);
    assert.deepEqual(await storedData(), before);
  });

  await t.test('Pajang stays separate from the old top twelve and the report uses a bounded thirty-day window', async () => {
    const features = ['agit', 'arcade', 'park', 'settings', 'portal', 'group', 'fanpages', 'restaurants',
      'festival', 'game_chacha_rush', 'game_solitaire', 'game_archery', 'game_sacheonseong'];
    await as(member, async () => {
      const id = randomUUID();
      for (const feature of features) await record(id, feature);
    });
    const current = await adminReport();
    assert.equal(current.features.length, 12);
    assert.ok(current.features.every(row => row.feature !== 'pajang'));
    assert.deepEqual(Object.keys(current.pajang_visits).sort(), ['started_at', 'uses']);
    assert.equal(current.pajang_visits.uses, 3);
    await clock('2026-12-19T15:00:00Z'); // December 20 KST: November 21 is included, November 20 is outside.
    assert.equal((await adminReport()).pajang_visits.uses, 1);
    await clock('2026-12-20T15:00:00Z');
    assert.equal((await adminReport()).pajang_visits.uses, 0);
    assert.equal(await value("select sum(uses)::integer as value from ojjuda_insights.feature_totals where feature='pajang'"), 3,
      'windowing does not delete older totals');
  });
});

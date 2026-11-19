const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const { fuzzystrmatch } = require('@electric-sql/pglite/contrib/fuzzystrmatch');

const root = path.join(__dirname, '..', 'supabase');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'migrations'));
const inviteMigration = migrations.filter(name => name.endsWith('_signup_invite_referral.sql'));
assert.equal(inviteMigration.length, 1, 'load the reviewed invite migration regardless of its applied timestamp');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('invite signup attribution uses the existing private, one-time referral and reward records', async t => {
  const db = new PGlite({ extensions: { fuzzystrmatch } });
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const value = async (sql, args = []) => (await rows(sql, args))[0]?.value;
  const asRole = async (role, action) => {
    assert.ok(['anon', 'authenticated', 'unrelated_client'].includes(role));
    await db.exec(`set role ${role}`);
    try { return await action(); } finally { await db.exec('reset role'); }
  };
  const resolve = code => rows('select * from public.resolve_signup_referrer($1)', [code]);
  const signup = (n, metadata = {}, confirmed = true, age = 0) => db.query(`
    insert into auth.users(id,email,created_at,raw_user_meta_data,email_confirmed_at)
    values($1,$2,now()-make_interval(days=>$5),$3,case when $4 then now() else null end)`,
    [uuid(n), `synthetic-${n}@example.invalid`, metadata, confirmed, age]);
  const record = n => rows('select user_id,referrer_id,confirmed_at from ojjuda_referral_internal.signups where user_id=$1', [uuid(n)]);
  const rejectedSignup = async (n, metadata) => {
    await assert.rejects(() => signup(n, metadata), error => error.code === '22023' && error.message === 'invalid_signup_referrer');
    assert.equal(await value('select count(*)::int as value from auth.users where id=$1', [uuid(n)]), 0,
      'failed referral validation rolls back the new account too');
  };
  const protectedState = async () => ({
    functions: await rows(`select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,p.proacl::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('ojjuda_rewards_internal','ojjuda_referral_internal')
        and p.proname not in ('capture_signup','resolve_candidate') order by 1`),
    capturePrivileges: await rows(`select p.prosecdef,p.proconfig,p.proacl::text,pg_get_userbyid(p.proowner) as owner
      from pg_proc p where p.oid='ojjuda_referral_internal.capture_signup()'::regprocedure`),
    tables: await rows(`select c.oid::regclass::text as name,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname in ('auth','public','ojjuda_account_deletion','ojjuda_referral_internal','ojjuda_rewards_internal') order by 1`),
    triggers: await rows(`select t.tgname,pg_get_triggerdef(t.oid) as definition,t.tgenabled
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname in ('auth','public','ojjuda_referral_internal','ojjuda_rewards_internal') order by 1`),
    constraints: await rows(`select c.conrelid::regclass::text as table_name,c.conname,pg_get_constraintdef(c.oid) as definition
      from pg_constraint c join pg_namespace n on n.oid=c.connamespace
      where n.nspname in ('ojjuda_referral_internal','ojjuda_rewards_internal') order by 1,2`),
    policy: await rows('select * from ojjuda_rewards_internal.policy')
  });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create role unrelated_client;
      create schema auth; create schema extensions; create schema ojjuda_account_deletion; create schema ojjuda_account_internal;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),
        email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',
        is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text unique);
      create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,
        banned_until timestamptz,last_checkin date,last_seen_at timestamptz,coins integer default 43);
      create table public.app_admins(user_id uuid primary key references auth.users(id) on delete cascade);
      create table public.game_scores(user_id uuid);
      create table ojjuda_account_deletion.requests(user_id uuid primary key references auth.users(id) on delete cascade,requested_at timestamptz default now());
      create table ojjuda_account_internal.member_identity(user_id uuid primary key references auth.users(id) on delete cascade,phone_number text);
      create function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.app_admins where user_id=auth.uid()) $$;
      create function public.is_banned(u uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.user_private where user_id=u and banned_until>now()) $$;
      alter table ojjuda_account_deletion.requests enable row level security;
      alter default privileges in schema public grant execute on functions to service_role;
    `);
    await db.exec(read('migrations/20261021071516_signup_referrals.sql'));
    // Use the real reward tables, guards, eligibility, and settlement rather than
    // inventing an immediate signup bonus for this link feature.
    await db.exec(read('scripts/rewards/rewards_core.sql'));
    await db.exec(read('scripts/rewards/rewards_referrals.sql'));
    await db.exec(read('migrations/20261031161559_reward_coupon_recipient_eligibility.sql'));
    const before = await protectedState();
    await db.exec(read(`migrations/${inviteMigration[0]}`));

    await t.test('migration preserves existing rewards, one-time constraints, triggers, and permissions', async () => {
      assert.deepEqual(await protectedState(), before);
      const permissions = await rows(`select
        has_function_privilege('anon','public.resolve_signup_referrer(text)','execute') as anon,
        has_function_privilege('authenticated','public.resolve_signup_referrer(text)','execute') as authenticated,
        has_function_privilege('unrelated_client','public.resolve_signup_referrer(text)','execute') as other,
        has_function_privilege('service_role','public.resolve_signup_referrer(text)','execute') as service_role,
        p.prosecdef,p.proconfig from pg_proc p where p.oid='public.resolve_signup_referrer(text)'::regprocedure`);
      assert.deepEqual(permissions, [{ anon: true, authenticated: true, other: false, service_role: false, prosecdef: false, proconfig: ['search_path=""'] }]);
      assert.deepEqual(await rows(`select p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated,
        has_function_privilege('unrelated_client',p.oid,'execute') as other
        from pg_proc p where p.oid='ojjuda_referral_internal.resolve_candidate(text)'::regprocedure`),
        [{ prosecdef: true, proconfig: ['search_path=""'], anon: true, authenticated: true, other: false }]);
      await asRole('unrelated_client', () => assert.rejects(() => resolve(uuid(1)), /permission denied/));
    });

    for (let n = 1; n <= 15; n++) {
      await signup(n, {}, n !== 3);
      if (n !== 2) await db.query('insert into public.profiles values($1,$2)', [uuid(n), `회원${n}`]);
      await db.query('insert into public.user_private(user_id) values($1)', [uuid(n)]);
    }
    await db.query('update auth.users set is_anonymous=true where id=$1', [uuid(4)]);
    await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1", [uuid(5)]);
    await db.query("update public.user_private set banned_until='infinity' where user_id=$1", [uuid(6)]);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [uuid(7)]);
    await db.query("update auth.users set banned_until='infinity' where id=$1", [uuid(8)]);
    await db.query('update auth.users set deleted_at=now() where id=$1', [uuid(9)]);
    await db.query('insert into ojjuda_account_deletion.requests(user_id) values($1)', [uuid(10)]);
    await db.query("update public.user_private set banned_until=now()-interval '1 second' where user_id=$1", [uuid(11)]);
    await db.query("update auth.users set banned_until=now()-interval '1 second' where id=$1", [uuid(11)]);
    await db.query('delete from auth.users where id=$1', [uuid(15)]);

    await t.test('anonymous exact lookup returns only a currently eligible public ID and nickname', async () => {
      await asRole('anon', async () => {
        assert.deepEqual(await resolve(uuid(1)), [{ id: uuid(1), nickname: '회원1' }]);
        assert.equal((await resolve(` ${uuid(1).toUpperCase()} `))[0].id, uuid(1));
        assert.equal((await resolve(uuid(11)))[0].id, uuid(11), 'expired suspensions remain eligible');
        for (const code of [null, '', ' ', 'bad', uuid(1).slice(1), uuid(1) + '?x=1', "x';select 1--", uuid(999)])
          assert.deepEqual(await resolve(code), [], `invalid exact lookup is empty: ${code}`);
        for (const n of [2,3,4,5,6,7,8,9,10,15]) assert.deepEqual(await resolve(uuid(n)), [], `ineligible fixture ${n}`);
        await assert.rejects(() => rows('select * from ojjuda_referral_internal.signups'), /permission denied/);
        await assert.rejects(() => rows('select * from auth.users'), /permission denied/);
      });
    });

    await t.test('signup revalidates invalid, unavailable, self, and mixed claims atomically', async () => {
      for (const n of [2,3,4,5,6,7,8,9,10,15,999]) await rejectedSignup(100, { referrer_code: uuid(n) });
      for (const code of ['invalid', 'f'.repeat(1000), { id: uuid(1) }, [uuid(1)], uuid(100)])
        await rejectedSignup(100, { referrer_code: code });
      await rejectedSignup(100, { referrer_code: uuid(1), referrer_id: uuid(1), referrer_nickname: '회원1' });
      await rejectedSignup(100, { referrer_code: uuid(1), referrer_id: uuid(12) });
      assert.equal((await resolve(uuid(12))).length, 1, 'preview was valid before the suspension');
      await db.query("update public.user_private set banned_until='infinity' where user_id=$1", [uuid(12)]);
      await rejectedSignup(100, { referrer_code: uuid(12) });
      await rejectedSignup(100, { referrer_id: uuid(12), referrer_nickname: '회원12' });
      await db.query('update public.user_private set banned_until=null where user_id=$1', [uuid(12)]);
      assert.equal(await value('select count(*)::int as value from ojjuda_referral_internal.signups'), 0);
    });

    await t.test('link signup survives nickname changes and strips only attribution metadata', async () => {
      assert.equal((await resolve(uuid(1)))[0].nickname, '회원1');
      const nickname = '가'.repeat(10) + '❤️❤️';
      await db.query('update public.profiles set nickname=$2 where id=$1', [uuid(1), nickname]);
      assert.deepEqual(await resolve(uuid(1)), [{ id: uuid(1), nickname }], 'canonical heart expansion is not a stale nickname check');
      await signup(200, { referrer_code: uuid(1), terms_version: 'fixture', nickname: '초대회원' }, false);
      assert.deepEqual(await record(200), [{ user_id: uuid(200), referrer_id: uuid(1), confirmed_at: null }]);
      assert.deepEqual(await value('select raw_user_meta_data as value from auth.users where id=$1', [uuid(200)]),
        { terms_version: 'fixture', nickname: '초대회원' });
      await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uuid(200)]);
      const confirmed = (await record(200))[0].confirmed_at;
      await db.query("update auth.users set email_confirmed_at=now()+interval '1 minute' where id=$1", [uuid(200)]);
      assert.deepEqual((await record(200))[0].confirmed_at, confirmed, 'confirmation is counted once');
      assert.equal(await value('select count(*)::int as value from ojjuda_rewards_internal.awards'), 0, 'signup does not immediately create a reward');
    });

    await t.test('manual selection remains exact and existing accounts cannot gain or change a referrer', async () => {
      await rejectedSignup(201, { referrer_id: uuid(1), referrer_nickname: '회원1' });
      await signup(201, { referrer_id: uuid(12), referrer_nickname: '회원12' });
      assert.equal((await record(201))[0].referrer_id, uuid(12));
      assert.deepEqual(await value('select raw_user_meta_data as value from auth.users where id=$1', [uuid(201)]), {});
      await signup(202);
      for (const n of [200,202]) await db.query('update auth.users set raw_user_meta_data=$2 where id=$1', [uuid(n), { referrer_code: uuid(12) }]);
      assert.equal((await record(200))[0].referrer_id, uuid(1));
      assert.deepEqual(await record(202), []);
      await assert.rejects(() => db.query('insert into ojjuda_referral_internal.signups(user_id,referrer_id) values($1,$2)', [uuid(200), uuid(12)]), /duplicate key/);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(202)]);
      await asRole('authenticated', async () => {
        assert.equal((await resolve(uuid(12)))[0].id, uuid(12));
        await assert.rejects(() => db.query('insert into ojjuda_referral_internal.signups(user_id,referrer_id) values($1,$2)', [uuid(202), uuid(12)]), /permission denied/);
        await assert.rejects(() => db.query('update ojjuda_referral_internal.signups set referrer_id=$1', [uuid(12)]), /permission denied/);
        await assert.rejects(() => db.query('select ojjuda_referral_internal.capture_signup()'), /permission denied/);
      });
    });

    await t.test('link referrals use the unchanged 10-member reward, observation, and phone deduplication rules', async () => {
      await db.exec("update ojjuda_rewards_internal.policy set starts_at=now()-interval '30 days'");
      await signup(400, {}, true, 20);
      await db.query('insert into public.profiles values($1,$2)', [uuid(400), '보상추천인']);
      await db.query('insert into public.user_private(user_id) values($1)', [uuid(400)]);
      const phone = n => '010' + String(n).padStart(8, '0');
      await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)', [uuid(400), phone(400)]);
      for (let n = 401; n <= 414; n++) {
        await signup(n, { referrer_code: uuid(400) }, true, n === 414 ? 13 : 20);
        await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)',
          [uuid(n), phone(n === 411 ? 401 : n === 412 ? 400 : n)]);
        await db.query(`insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
          select $1,(created_at at time zone 'Asia/Seoul')::date+d
          from auth.users cross join generate_series(0,$2) d where id=$1`, [uuid(n), n === 413 ? 5 : 6]);
      }
      assert.equal(await value('select count(*)::int as value from ojjuda_rewards_internal.awards'), 0);
      const first = await value('select ojjuda_rewards_internal.settle_referrals() as value');
      assert.equal(first.new_qualified_members, 10);
      assert.equal(first.new_awards, 1);
      assert.equal(first.referral_amount_reserved, 5000);
      assert.equal(await value('select count(*)::int as value from ojjuda_rewards_internal.qualifications where user_id=any($1::uuid[])',
        [[411,412,413,414].map(uuid)]), 0, 'duplicate phone, same-person referral, six active days, and early settlement remain excluded');
      const again = await value('select ojjuda_rewards_internal.settle_referrals() as value');
      assert.equal(again.new_qualified_members, 0);
      assert.equal(again.new_awards, 0);
      assert.equal(again.referral_amount_reserved, 5000);
      assert.equal(await value('select coins as value from public.user_private where user_id=$1', [uuid(400)]), 43, 'link attribution does not change ZU');
      await asRole('authenticated', () => assert.rejects(() => db.query('select ojjuda_rewards_internal.settle_referrals()'), /permission denied/));
    });
  } finally { await db.close(); }
});

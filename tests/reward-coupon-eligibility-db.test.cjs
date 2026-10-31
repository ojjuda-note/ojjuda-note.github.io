const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'supabase', file), 'utf8');
const core = read('rewards_core.sql');
const admin = read('rewards_admin.sql');
const delivery = read('rewards_message_delivery.sql');
const scoped = read('migrations/20260930231544_scope_world_privacy_helpers.sql');
const messages = read('migrations/20261020222420_friend_messages.sql');
const migration = read('migrations/20261031161559_reward_coupon_recipient_eligibility.sql');

function definition(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = source.search(new RegExp('create(?: or replace)? function ' + escaped + '\\(', 'i'));
  assert.ok(start >= 0, 'missing real function: ' + name);
  const text = source.slice(start), tag = text.match(/\bas\s+(\$[a-z_]*\$)/i)?.[1];
  assert.ok(tag, 'missing function delimiter: ' + name);
  const end = text.indexOf(tag, text.indexOf(tag) + tag.length);
  return text.slice(0, end + tag.length) + ';';
}

(async () => {
  const db = new PGlite();
  const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const users = Object.fromEntries([
    'admin', 'eligible', 'banned', 'expired', 'blocked', 'otherAdmin',
    'excludedUser', 'excludedPhone', 'anonymous', 'unconfirmed', 'missingPhone', 'reverseBlocked'
  ].map((name, i) => [name, uuid(i + 1)]));
  const awardIds = Object.fromEntries(Object.keys(users).map((name, i) => [name, uuid(100 + i)]));
  const value = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
  const signIn = async (id, role = id ? 'authenticated' : 'anon') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    assert.ok(['authenticated', 'anon'].includes(role));
    await db.exec('set role ' + role);
  };
  const denied = (query, args = [], message = null) => assert.rejects(
    () => db.query(query, args), error => error.code === '42501' && (!message || message.test(error.message))
  );
  const uploadPath = name => users.admin + '/' + awardIds[name] + '/' + uuid(999) + '.png';
  const summary = () => value('select public.admin_reward_summary() as value');
  const upload = name => value('select ojjuda_rewards_internal.coupon_upload_allowed($1) as value', [uploadPath(name)]);
  const privileges = async () => ({
    functions: (await db.query(`select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig,p.proacl::text,
      pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','ojjuda_rewards_internal') order by 1`)).rows,
    schemas: (await db.query(`select nspname,nspacl::text from pg_namespace
      where nspname in ('public','ojjuda_rewards_internal') order by 1`)).rows,
    tables: (await db.query(`select c.oid::regclass::text name,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname in ('public','ojjuda_rewards_internal') order by 1`)).rows,
    policies: (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows
  });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema ojjuda_account_internal;
      create schema ojjuda_account_deletion; create schema ojjuda_note_internal; create schema fixture;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create table public.profiles(id uuid primary key,nickname text not null);
      create table public.app_admins(user_id uuid primary key);
      create table public.user_private(user_id uuid primary key,banned_until timestamptz,last_checkin date,last_seen_at timestamptz);
      create table public.game_scores(user_id uuid);
      create table public.blocks(blocker uuid,blocked uuid);
      create table ojjuda_account_internal.member_identity(user_id uuid primary key,phone_number text);
      create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
      create table ojjuda_note_internal.friend_messages(id uuid primary key);
      create table fixture.pending_deletions(user_id uuid primary key);
      create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.app_admins where user_id=auth.uid());
      $$;
      create function ojjuda_account_deletion.pending() returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from fixture.pending_deletions where user_id=auth.uid());
      $$;
      alter table public.user_private enable row level security;
      create policy own_private on public.user_private for select to authenticated using(user_id=auth.uid());
    `);
    await db.exec(definition(scoped, 'public.is_banned'));
    await db.exec(`revoke all on function public.is_banned(uuid),public.is_admin() from public,anon;
      grant execute on function public.is_banned(uuid),public.is_admin() to authenticated,service_role;`);
    await db.exec(core);
    await db.exec(admin.slice(0, admin.indexOf('-- Independently idempotent jobs.')));
    await db.exec(delivery.slice(0, delivery.indexOf('create function ojjuda_rewards_internal.active_admin()')));
    await db.exec(definition(messages, 'ojjuda_note_internal.friend_message_blocked'));
    await db.exec('revoke all on function ojjuda_note_internal.friend_message_blocked(uuid) from public,anon,authenticated');
    for (const name of ['ojjuda_rewards_internal.active_admin', 'ojjuda_rewards_internal.coupon_upload_allowed',
      'ojjuda_rewards_internal.coupon_admin_summary', 'public.admin_reward_summary']) {
      await db.exec(definition(delivery, name));
    }
    await db.exec(`revoke all on function ojjuda_rewards_internal.active_admin(),
      ojjuda_rewards_internal.coupon_upload_allowed(text),ojjuda_rewards_internal.coupon_admin_summary() from public,anon,authenticated;
      grant execute on function ojjuda_rewards_internal.active_admin(),
      ojjuda_rewards_internal.coupon_upload_allowed(text),ojjuda_rewards_internal.coupon_admin_summary() to authenticated;`);

    for (const [i, [name, id]] of Object.entries(users).entries()) {
      const phone = name === 'missingPhone' ? null : '010' + String(i + 1).padStart(8, '0');
      await db.query('insert into auth.users values($1,case when $2 then null else now() end,$3)', [id, name === 'unconfirmed', name === 'anonymous']);
      await db.query('insert into public.profiles values($1,$2)', [id, name]);
      await db.query(`insert into public.user_private(user_id,banned_until) values($1,
        case $2::text when 'banned' then now()+interval '1 day' when 'expired' then now()-interval '1 day' end)`, [id, name]);
      await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)', [id, phone]);
      await db.query(`insert into ojjuda_rewards_internal.awards
        (id,award_key,kind,recipient_id,recipient_phone_hash,amount,game,month_start,status)
        values($1,$2,'monthly_game',$3,coalesce(ojjuda_rewards_internal.phone_hash($4),'missing'),5000,$2,'2026-10-01','awaiting_coupon')`,
      [awardIds[name], name, id, phone]);
    }
    await db.query('insert into public.app_admins values($1),($2)', [users.admin, users.otherAdmin]);
    await db.query("insert into ojjuda_rewards_internal.excluded_users values($1,'fixture excluded',now())", [users.excludedUser]);
    await db.query(`insert into ojjuda_rewards_internal.excluded_phones(phone_hash,reason)
      select ojjuda_rewards_internal.phone_hash(phone_number),'fixture excluded' from ojjuda_account_internal.member_identity where user_id=$1`, [users.excludedPhone]);
    await db.query('insert into public.blocks values($1,$2)', [users.admin, users.blocked]);
    await db.query('insert into ojjuda_note_internal.blocks values($1,$2)', [users.reverseBlocked, users.admin]);

    // The API role, not just the JWT, is essential: a postgres session would
    // bypass the self-only helper and conceal the production failure.
    await signIn(users.admin);
    assert.equal(await value('select current_user as value'), 'authenticated');
    await denied('select public.admin_reward_summary()', [], /helper_scope_denied/);
    await denied('select ojjuda_rewards_internal.coupon_upload_allowed($1)', [uploadPath('eligible')], /helper_scope_denied/);
    await denied('select ojjuda_rewards_internal.exclusion_reason($1)', [users.eligible], /permission denied/);
    await db.exec('reset role');
    const before = await privileges();
    const banDefinition = await value("select pg_get_functiondef('public.is_banned(uuid)'::regprocedure) as value");
    await db.exec(migration);
    assert.deepEqual(await privileges(), before, 'function/schema/table ACLs, security modes, RLS and policies stay unchanged');
    assert.equal(await value("select pg_get_functiondef('public.is_banned(uuid)'::regprocedure) as value"), banDefinition,
      'the public self-only ban helper is unchanged');

    await signIn(users.admin);
    const result = await summary();
    const reasons = Object.fromEntries(result.monthly_pending.map(row => [row.nickname, row.blocked_reason]));
    assert.deepEqual(reasons, {
      admin: 'admin_excluded', eligible: null, banned: 'banned', expired: null,
      blocked: 'recipient_blocked', otherAdmin: 'admin_excluded', excludedUser: 'admin_excluded',
      excludedPhone: 'admin_phone_excluded', anonymous: 'unconfirmed_member',
      unconfirmed: 'unconfirmed_member', missingPhone: 'missing_phone', reverseBlocked: 'recipient_blocked'
    });
    assert.equal(result.monthly_pending.find(row => row.nickname === 'eligible').id, awardIds.eligible,
      'a real authenticated administrator can inspect another eligible winner');
    assert.equal(await upload('eligible'), true);
    assert.equal(await upload('expired'), true, 'an expired ban does not exclude a winner');
    for (const name of ['banned', 'otherAdmin', 'excludedUser', 'excludedPhone', 'anonymous', 'unconfirmed', 'missingPhone']) {
      assert.equal(await upload(name), false, name + ' remains ineligible for a coupon upload');
    }
    assert.equal(await value('select ojjuda_rewards_internal.coupon_upload_allowed($1) as value',
      [uploadPath('eligible').replace(users.admin, users.eligible)]), false, 'upload paths remain bound to the current administrator');
    await denied('select public.is_banned($1)', [users.eligible], /helper_scope_denied/);
    await denied('select ojjuda_rewards_internal.exclusion_reason($1)', [users.eligible], /permission denied/);
    assert.equal(await value('select public.is_banned($1) as value', [users.admin]), false);

    for (const id of [users.eligible, users.anonymous]) {
      await signIn(id);
      await denied('select public.admin_reward_summary()', [], /not_admin/);
      await denied('select ojjuda_rewards_internal.coupon_admin_summary()', [], /not_admin/);
      await denied('select ojjuda_rewards_internal.exclusion_reason($1)', [users.eligible], /permission denied/);
      await denied('select public.is_banned($1)', [users.banned], /helper_scope_denied/);
      assert.equal(await upload('eligible'), false, 'ordinary and anonymous members cannot upload admin coupons');
    }
    await signIn(null);
    await denied('select public.admin_reward_summary()', [], /permission denied/);
    await denied('select ojjuda_rewards_internal.exclusion_reason($1)', [users.eligible], /permission denied/);
    await denied('select ojjuda_rewards_internal.coupon_upload_allowed($1)', [uploadPath('eligible')], /permission denied/);
    await signIn(null, 'authenticated');
    await denied('select public.admin_reward_summary()', [], /not_admin/);

    await db.exec('reset role');
    await db.query("update public.user_private set banned_until=now()+interval '1 day' where user_id=$1", [users.admin]);
    await signIn(users.admin);
    await denied('select public.admin_reward_summary()', [], /not_admin/);
    assert.equal(await upload('eligible'), false, 'a banned administrator cannot upload coupons');
    console.log('PASS: authenticated-admin scope failure reproduced and repaired; actual summary/upload functions, recipient eligibility, expired bans, both block directions, private ACLs, unchanged scoped helpers, and non-admin/anonymous/banned-admin denials');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth,ojjuda_note to anon,authenticated;
    create table auth.users(id uuid primary key, email text, encrypted_password text,
      raw_user_meta_data jsonb, banned_until timestamptz, created_at timestamptz not null default now());
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text);
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create table public.app_admins(user_id uuid primary key references auth.users(id));
    create table public.admin_log(admin_id uuid,action text,target_user uuid,target text,detail jsonb,created_at timestamptz default now());
    create function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid());
    $$;
    create function public.admin_note(p_action text,p_user uuid,p_target text,p_detail jsonb)
    returns void language sql security definer set search_path=pg_catalog as $$
      insert into public.admin_log(admin_id,action,target_user,target,detail) values(auth.uid(),p_action,p_user,p_target,p_detail);
    $$;
    create table ojjuda_note.cards(id uuid primary key,author_id uuid references auth.users(id));
    create table ojjuda_note_internal.member_gender(user_id uuid primary key references auth.users(id),gender text,updated_at timestamptz);
    create table ojjuda_note_internal.card_gender(card_id uuid primary key references ojjuda_note.cards(id),gender text);
    alter table ojjuda_note_internal.member_gender enable row level security;
    alter table ojjuda_note_internal.card_gender enable row level security;
    insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000003','existing@example.invalid');
    insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000004','older@example.invalid');
  `);
  for (const name of ['20260928151422_member_identity_and_card_gender.sql', '20260928154555_member_phone_edit.sql',
    '20260928154916_member_admin_identity_edit.sql', '20260928155858_retain_withdrawn_member_accounts_one_month.sql',
    '20260929025624_unique_phone_and_verified_recovery.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8'));
  }
  const value = async (query, params = []) => (await db.query(query, params)).rows[0]?.value;
  const first = '00000000-0000-4000-8000-000000000001', second = '00000000-0000-4000-8000-000000000002';
  const existing = '00000000-0000-4000-8000-000000000003';
  const meta = { birth_yymmdd: '000229', gender_code: '3', phone_number: '010-1234-5678', age_15_to_69: true, terms_version: '2026-09-29' };
  const signup = (id, phone) => db.query('insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values($1,$2,$3,$4)',
    [id, `${id}@example.invalid`, 'synthetic-non-login-hash', { ...meta, phone_number: phone }]);
  await signup(first, meta.phone_number);
  for (const phone of ['01012345678', '010-1234-5678', '+82 10-1234-5678']) {
    await assert.rejects(() => signup(second, phone), /phone_already_registered/);
  }
  assert.equal(await value('select count(*)::int as value from auth.users where id=$1', [second]), 0, 'duplicate signup must roll back the Auth user');
  await signup(second, '010-2345-6789');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [second]);
  await db.exec('set role authenticated');
  await assert.rejects(() => value("select public.update_my_phone_number('+82 10-1234-5678') as value"), /phone_already_registered/);
  assert.equal((await value('select public.get_my_member_identity() as value')).phone_number, '01023456789');
  await value("select public.update_my_phone_number('010-2345-6789') as value");
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [existing]);
  await db.exec('set role authenticated');
  await assert.rejects(() => value("select public.complete_my_member_identity('000229','3','01012345678',true) as value"), /phone_already_registered/);
  await db.exec('reset role');
  await db.query('insert into public.app_admins values($1)', [first]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [first]);
  await db.exec('set role authenticated');
  await assert.rejects(() => value("select public.admin_update_member_identity($1,'2000-02-29','male','01012345678') as value", [second]), /phone_already_registered/);
  await db.exec('reset role');

  const signature = 'public.check_member_recovery(text,text,text,text,text,text)';
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, signature]), false);
    assert.equal(await value("select has_table_privilege($1,'ojjuda_account_internal.recovery_attempts','select') as value", [role]), false);
  }
  assert.equal(await value('select has_function_privilege(\'service_role\',$1,\'execute\') as value', [signature]), true);
  const hash = text => createHash('sha256').update(text).digest('hex');
  const matching = [`${first}@example.invalid`, '+82 10-1234-5678', '2000-02-29', 'male'];
  const check = (details = matching, ip = 'ip', emailHash = details[0]) => value('select public.check_member_recovery($1,$2,$3,$4,$5,$6) as value', [...details, hash(ip), hash(emailHash)]);
  const clear = () => db.exec('truncate ojjuda_account_internal.recovery_attempts');
  await db.exec('set role service_role');
  assert.equal(await check(), 'matched');
  await db.exec('reset role');
  for (const [field, wrong] of [[0, 'missing@example.invalid'], [1, '01099999999'], [2, '2001-02-28'], [3, 'female'], [2, '2000-02-30'], [1, 'bad'], [3, null]]) {
    await clear(); const details = [...matching]; details[field] = wrong;
    assert.equal(await check(details), 'unmatched', `mismatched field ${field} must not authorize recovery`);
  }
  await clear();
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [first]);
  assert.equal(await check(), 'unmatched');
  await db.query('update auth.users set banned_until=null where id=$1', [first]);
  await clear();
  for (let i = 0; i < 5; i++) assert.equal(await check(), 'matched');
  assert.equal(await check(), 'limited');
  assert.equal(await check(), 'limited', 'a denied request must retain its counter');
  await db.exec("update ojjuda_account_internal.recovery_attempts set window_started=clock_timestamp()-interval '16 minutes'");
  assert.equal(await check(), 'matched');
  await clear();
  for (let i = 0; i < 20; i++) assert.equal(await check(matching, 'same-ip', `different-email-${i}`), 'matched');
  assert.equal(await check(matching, 'same-ip', 'different-email-21'), 'limited');
  await clear();
  for (let i = 0; i < 200; i++) assert.equal(await check(matching, `ip-${i}`, `email-${i}`), 'matched');
  assert.equal(await check(matching, 'new-ip', 'new-email'), 'limited');
  assert.equal(await value("select count(*)::int as value from ojjuda_account_internal.recovery_attempts"), 401, 'global limit bounds storage');
  await db.exec("update ojjuda_account_internal.recovery_attempts set window_started=clock_timestamp()-interval '2 days'");
  assert.equal(await check(), 'matched');
  assert.equal(await value('select count(*)::int as value from ojjuda_account_internal.recovery_attempts'), 3, 'expired hashes are purged');
  await db.close();
  console.log('PASS: normalized phone uniqueness on signup/self/admin/legacy paths, private identity comparison, permissions, rate limits and expiry');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261110131054_admin_member_visit_history.sql'), 'utf8');
const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema ojjuda_account_internal; create schema ojjuda_rewards_internal;
      grant usage on schema auth, ojjuda_account_internal to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      create table auth.users(id uuid primary key,email text,created_at timestamptz,last_sign_in_at timestamptz);
      create table public.profiles(id uuid primary key,nickname text,created_at timestamptz,updated_at timestamptz);
      create table public.user_private(user_id uuid primary key,coins integer,banned_until timestamptz,last_seen_at timestamptz);
      create table public.app_admins(user_id uuid primary key);
      create function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.app_admins where user_id=auth.uid());
      $$;
      create table ojjuda_rewards_internal.activity_days(user_id uuid);
      create table public.diaries(user_id uuid,created_at timestamptz);
      create table public.guestbook(author_id uuid,created_at timestamptz);
      create table public.intros(author_id uuid,created_at timestamptz);
      create table public.media(user_id uuid,created_at timestamptz);
      create table public.media_comments(author_id uuid,created_at timestamptz);
      create table public.place_messages(author_id uuid,created_at timestamptz);
      create table public.game_scores(id bigint generated always as identity,user_id uuid,created_at timestamptz,game text);
      create table public.house_posts(user_id uuid,created_at timestamptz,deleted_at timestamptz);
    `);
    await db.query('insert into auth.users(id,email,created_at,last_sign_in_at) values($1,$2,now(),now()),($3,$4,now(),now())', [admin,'admin@example.invalid',member,'member@example.invalid']);
    await db.query('insert into public.profiles values($1,$2,now(),now()),($3,$4,now(),now())', [admin,'관리자',member,'회원']);
    await db.query('insert into public.app_admins values($1)', [admin]);
    await db.query("insert into public.game_scores(user_id,created_at,game) values($1,now()-interval '1 hour','screw_box')", [member]);
    await db.exec(sql);
    await db.exec(`
      create function public.admin_list_member_accounts(
        p_query text default '',p_filter text default 'all',p_offset integer default 0,
        p_limit integer default 20,p_sort text default 'created_at')
      returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
        select ojjuda_account_internal.admin_list_member_accounts(p_query,p_filter,p_offset,p_limit,p_sort);
      $$;
      grant execute on function public.admin_list_member_accounts(text,text,integer,integer,text) to authenticated;
    `);
    const claim = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const value = async (query, params=[]) => (await db.query(query, params)).rows[0]?.value;
    await db.exec('set role anon');
    await assert.rejects(() => db.query("select public.record_member_navigation('page','world:hub','아지트 홈')"), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await claim(member);
    await db.query("select public.record_member_navigation('page','world:arcade','오락실')");
    await db.query("select public.record_member_navigation('page','world:arcade','오락실')");
    await assert.rejects(() => db.query('select * from ojjuda_account_internal.member_navigation_history'), /permission denied/);
    await assert.rejects(() => value('select public.admin_member_navigation_history($1) as value',[member]), /not_admin/);
    await assert.rejects(() => db.query("select public.record_member_navigation('page','invalid%key','잘못된 기록')"), /invalid_navigation_event/);
    await claim(admin);
    const history = await value('select public.admin_member_navigation_history($1) as value',[member]);
    assert.equal(history.total,1,'duplicate click + page load is deduplicated');
    assert.equal(history.items[0].title,'오락실');
    const directory = await value('select public.admin_list_member_accounts() as value');
    const record = directory.items.find(item=>item.id===member);
    assert.equal(record.last_active_kind,'page');
    assert.equal(record.last_active_title,'오락실');
    assert.equal((await value('select public.admin_member_navigation_history($1,1,1) as value',[member])).items.length,0);
    assert.equal(await value("select has_function_privilege('anon','public.admin_member_navigation_history(uuid,integer,integer)','execute') as value"),false);
    console.log('PASS: administrator-only member navigation, duplicate suppression, named page and game activity');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

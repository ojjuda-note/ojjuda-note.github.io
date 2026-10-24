const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const uid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

(async () => {
  const db = new PGlite();
  try {
    // Baseline column names match the primary project's read-only schema check.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal;
      create schema cron;
      create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema auth,ojjuda_note to anon,authenticated;
      create table auth.users(id uuid primary key,email text,encrypted_password text,
        raw_user_meta_data jsonb,created_at timestamptz not null,last_sign_in_at timestamptz);
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,
        nickname text,created_at timestamptz,updated_at timestamptz);
      create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,
        coins integer,banned_until timestamptz,last_seen_at timestamptz);
      create table public.app_admins(user_id uuid primary key references auth.users(id));
      create function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.app_admins where user_id=auth.uid());
      $$;
      create table public.diaries(user_id uuid,created_at timestamptz);
      create table public.guestbook(author_id uuid,created_at timestamptz);
      create table public.intros(author_id uuid,created_at timestamptz);
      create table public.media(user_id uuid,created_at timestamptz);
      create table public.media_comments(author_id uuid,created_at timestamptz);
      create table public.place_messages(author_id uuid,created_at timestamptz);
      create table public.game_scores(user_id uuid,created_at timestamptz);
      create table public.house_posts(id text primary key,user_id uuid,created_at timestamptz,deleted_at timestamptz);
      insert into auth.users(id,email,created_at,last_sign_in_at)
        select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
          'member'||i||'@example.invalid',
          (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
            +case when i=61 then interval '-1 second' when i=62 then interval '0 seconds'
              when i=63 then interval '1 second' when i=64 then interval '1 day'
              else interval '-2 days'-i*interval '1 minute' end,
          now()-interval '5 hours'
        from generate_series(1,64) i;
      insert into public.profiles select id,'회원'||right(id::text,2),created_at,created_at from auth.users
        where id<>'00000000-0000-4000-8000-000000000059';
      insert into public.user_private select id,123,null,null from auth.users
        where id<>'00000000-0000-4000-8000-000000000060';
      update public.user_private set last_seen_at=now()-interval '2 hours'
        where user_id='00000000-0000-4000-8000-000000000001';
      update public.user_private set banned_until=now()+interval '1 day'
        where user_id in ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
      update public.user_private set banned_until=now()-interval '1 second'
        where user_id='00000000-0000-4000-8000-000000000005';
      insert into public.app_admins values
        ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
      update public.profiles set updated_at=created_at+interval '1 minute'
        where id='00000000-0000-4000-8000-000000000002';
      insert into public.diaries select id,created_at+interval '1 minute' from public.profiles
        where id='00000000-0000-4000-8000-000000000002';
      insert into public.place_messages values ('00000000-0000-4000-8000-000000000001',now()-interval '3 hours');
      insert into public.game_scores values ('00000000-0000-4000-8000-000000000001',now()-interval '1 hour');
    `);
    await db.query('update public.profiles set nickname=$1 where id=$2', ['100%_\\회원', uid(3)]);
    await db.query('update auth.users set email=$1 where id=$2', ['Mixed.Case+tag@Example.invalid', uid(3)]);
    // Load the actual private identity/archive schema rather than a permissive replacement.
    for (const name of [
      '20260928151422_member_identity_and_card_gender.sql',
      '20260928154555_member_phone_edit.sql',
      '20260928155858_retain_withdrawn_member_accounts_one_month.sql',
      '20261004080709_admin_account_directories.sql'
    ]) await db.exec(migration(name));

    await db.exec(`
      insert into ojjuda_account_internal.withdrawn_member_accounts
        (user_id,email,nickname,birth_date,gender,phone_number,age_at_signup,
          account_created_at,withdrawn_at,expires_at)
      select ('00000000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,
        'withdrawn'||i||'@example.invalid','탈퇴'||i,'2000-01-01','male','01012345678',20,
        now()-interval '2 years',now()-interval '1 day'-i*interval '1 minute',
        case when i<=52 then now()+interval '1 day' else now()-interval '1 second' end
      from generate_series(1,54) i;
    `);
    await db.query('update ojjuda_account_internal.withdrawn_member_accounts set email=$1,nickname=$2 where user_id=$3',
      ['Hidden.Person+tag@Example.invalid', '탈퇴%_\\회원', uid(101)]);
    await db.query('update ojjuda_account_internal.withdrawn_member_accounts set email=$1 where user_id=$2', ['a@tiny.invalid', uid(102)]);
    await db.query('update ojjuda_account_internal.withdrawn_member_accounts set email=$1 where user_id=$2', [null, uid(103)]);
    await db.query('update ojjuda_account_internal.withdrawn_member_accounts set email=$1 where user_id=$2', ['not-an-email', uid(104)]);

    const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
    const members = (query = '', filter = 'all', offset = 0, limit = 20, schema = 'public') =>
      value(`select ${schema}.admin_list_member_accounts($1,$2,$3,$4) as value`, [query, filter, offset, limit]);
    const withdrawn = (query = '', offset = 0, limit = 20, schema = 'public') =>
      value(`select ${schema}.admin_list_withdrawn_accounts($1,$2,$3) as value`, [query, offset, limit]);
    const claim = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    const memberKeys = ['id','nickname','email','coins','created_at','last_seen','seen_by_login',
      'last_active','last_active_kind','banned_until','is_admin'].sort();
    const withdrawnKeys = ['id','nickname','email_masked','account_created_at','withdrawn_at','expires_at'].sort();

    for (const schema of ['public', 'ojjuda_account_internal']) {
      for (const signature of ['admin_list_member_accounts(text,text,integer,integer)', 'admin_list_withdrawn_accounts(text,integer,integer)']) {
        assert.equal(await value("select has_function_privilege('anon',$1,'execute') as value", [`${schema}.${signature}`]), false);
        assert.equal(await value("select has_function_privilege('authenticated',$1,'execute') as value", [`${schema}.${signature}`]), true);
      }
      const functions = (await db.query(`select p.prosecdef,p.proconfig from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname=$1 and p.proname in ('admin_list_member_accounts','admin_list_withdrawn_accounts')`, [schema])).rows;
      assert.equal(functions.length, 2);
      functions.forEach(row => {
        assert.equal(row.prosecdef, schema === 'ojjuda_account_internal');
        assert.deepEqual(row.proconfig, ['search_path=pg_catalog']);
      });
    }
    await db.exec('set role anon');
    await assert.rejects(() => members(), /permission denied/);
    await assert.rejects(() => withdrawn(), /permission denied/);
    await db.exec('reset role; set role authenticated');
    for (const id of [null, uid(3)]) {
      await claim(id);
      for (const schema of ['public', 'ojjuda_account_internal']) {
        await assert.rejects(() => members('', 'all', 0, 20, schema), /not_admin/);
        await assert.rejects(() => withdrawn('', 0, 20, schema), /not_admin/);
      }
    }
    await claim(uid(1));
    await assert.rejects(() => db.query('select * from ojjuda_account_internal.withdrawn_member_accounts'), /permission denied/);
    await assert.rejects(() => db.query('select * from ojjuda_account_internal.member_identity'), /permission denied/);

    const first = await value('select public.admin_list_member_accounts() as value');
    assert.deepEqual(Object.keys(first).sort(), ['items','limit','offset','total']);
    assert.equal(first.total, 64); assert.equal(first.limit, 20); assert.equal(first.offset, 0); assert.equal(first.items.length, 20);
    first.items.forEach(item => assert.deepEqual(Object.keys(item).sort(), memberKeys));
    const pages = [first, await members('', 'all', 20), await members('', 'all', 40), await members('', 'all', 60)];
    assert.deepEqual(pages.map(page => page.items.length), [20,20,20,4]);
    assert.equal(new Set(pages.flatMap(page => page.items.map(item => item.id))).size, 64);
    assert.ok(pages.every(page => page.total === 64));
    assert.deepEqual((await members('', 'all', 100)).items, []);
    assert.equal((await members('', 'all', 100)).total, 64);
    assert.equal((await members('', 'all', 0, 999)).items.length, 50);
    assert.equal((await members('', 'all', -5, 0)).limit, 1);
    assert.equal((await members('', 'all', -5, 0)).offset, 0);
    assert.equal((await members(null, null, null, null)).limit, 20);
    assert.equal((await members('does not exist')).total, 0);
    for (const search of ['%', '_', '\\', '%_\\', ' MIXED.case+TAG@ ']) {
      const result = await members(search);
      assert.equal(result.total, 1, `literal, case-insensitive member search: ${search}`);
      assert.equal(result.items[0].id, uid(3));
    }
    assert.equal((await members("' OR true --")).total, 0);
    assert.deepEqual((await members('', 'today')).items.map(item => item.id), [uid(63),uid(62)], 'KST midnight is inclusive; following midnight is excluded');
    const banned = await members('', 'banned');
    assert.equal(banned.total, 2); assert.deepEqual(banned.items.map(item => item.id), [uid(3),uid(4)]);
    assert.equal((await members('mixed', 'banned')).total, 1);
    const admins = await members('', 'admin');
    assert.equal(admins.total, 2); assert.ok(admins.items.every(item => item.is_admin));
    const activeAdmin = admins.items.find(item => item.id === uid(1));
    assert.equal(activeAdmin.seen_by_login, false); assert.equal(activeAdmin.last_active_kind, 'game');
    const newAdmin = admins.items.find(item => item.id === uid(2));
    assert.equal(newAdmin.seen_by_login, true); assert.equal(newAdmin.last_active, null, 'signup room update and welcome diary are not activity');
    await db.exec('reset role');
    await db.query(`insert into public.house_posts(id,user_id,created_at,deleted_at) values
      ('active-post',$1,now()-interval '30 minutes',null),
      ('deleted-post',$1,now()-interval '1 minute',now()),
      ('only-deleted-post',$2,now()-interval '1 minute',now())`, [uid(1),uid(2)]);
    const activePostTime = await value("select to_jsonb(created_at) as value from public.house_posts where id='active-post'");
    await db.exec('set role authenticated');
    const houseActivity = (await members('', 'admin')).items;
    assert.equal(houseActivity.find(item => item.id === uid(1)).last_active_kind, 'house_post', 'newer active house post wins over the game event');
    assert.equal(houseActivity.find(item => item.id === uid(1)).last_active, activePostTime, 'newer deleted post does not replace the active post time');
    assert.equal(houseActivity.find(item => item.id === uid(2)).last_active, null, 'deleted house posts do not count as activity');
    assert.equal((await members('member59@')).items[0].nickname, null, 'an account missing its World profile still appears');
    assert.equal((await members('member60@')).items[0].coins, null, 'missing wallet does not remove an account');
    await assert.rejects(() => members('', 'unknown'), /invalid_account_filter/);

    // The filter must not change when the DB session timezone changes.
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Seoul']) {
      await db.query("select set_config('TimeZone',$1,false)", [timezone]);
      assert.deepEqual((await members('', 'today')).items.map(item => item.id), [uid(63),uid(62)]);
    }

    const left = await value('select public.admin_list_withdrawn_accounts() as value');
    assert.deepEqual(Object.keys(left).sort(), ['items','limit','offset','total']);
    assert.equal(left.total, 52); assert.equal(left.items.length, 20); assert.equal(left.offset, 0); assert.equal(left.limit, 20);
    const leftPages = [left, await withdrawn('',20), await withdrawn('',40)];
    assert.deepEqual(leftPages.map(page => page.items.length), [20,20,12]);
    assert.equal(new Set(leftPages.flatMap(page => page.items.map(item => item.id))).size, 52);
    leftPages.flatMap(page => page.items).forEach(item => assert.deepEqual(Object.keys(item).sort(), withdrawnKeys));
    assert.equal(left.items[0].email_masked, 'H***@Example.invalid');
    assert.equal(left.items[1].email_masked, 'a***@tiny.invalid');
    assert.equal(left.items[2].email_masked, null); assert.equal(left.items[3].email_masked, '***');
    for (const sensitive of ['Hidden.Person+tag', '01012345678', '2000-01-01', 'birth_date', 'phone_number', 'age_at_signup', '"gender"']) {
      assert.equal(JSON.stringify(leftPages).includes(sensitive), false, `withdrawn directory excludes ${sensitive}`);
    }
    for (const search of ['%', '_', '\\', ' hidden.person+TAG@ ', 'h***@example.invalid']) {
      const result = await withdrawn(search);
      assert.equal(result.total, 1, `literal, case-insensitive withdrawal search: ${search}`);
      assert.equal(result.items[0].id, uid(101));
    }
    assert.equal((await withdrawn('withdrawn53@')).total, 0, 'expired archive remains hidden before purge');
    assert.equal((await withdrawn('does not exist')).total, 0);
    assert.equal((await withdrawn('',0,999)).limit, 50);
    assert.equal((await withdrawn('',0,999)).items.length, 50);
    assert.equal((await withdrawn('',-5,-1)).offset, 0); assert.equal((await withdrawn('',-5,-1)).limit, 1);
    assert.equal((await withdrawn(null,null,null)).limit, 20);
    assert.equal((await withdrawn('',100)).total, 52); assert.deepEqual((await withdrawn('',100)).items, []);

    // Upgrade the real RPC: all sorting happens before pagination, including visit totals.
    await db.exec(`reset role;
      create schema ojjuda_rewards_internal;
      create table ojjuda_rewards_internal.activity_days (
        user_id uuid not null references auth.users(id) on delete cascade,
        active_day date not null, first_seen_at timestamptz not null default now(),
        primary key(user_id,active_day));
      alter table ojjuda_rewards_internal.activity_days enable row level security;
      insert into ojjuda_rewards_internal.activity_days(user_id,active_day)
        select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
          date '2026-10-01'+d
        from generate_series(1,64) i
        cross join lateral generate_series(1,case when i in (40,50) then 12 when i=1 then 2 else i%5 end) d;
      update auth.users set last_sign_in_at=null;
      update public.user_private set last_seen_at=null;
      update public.user_private set last_seen_at=timestamptz '2026-10-23 12:00Z'
        where user_id in ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000050');
      update auth.users set created_at=timestamptz '2026-09-01 12:00Z'
        where id in ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000050');
      update auth.users set last_sign_in_at=timestamptz '2026-10-24 12:00Z'
        where id='00000000-0000-4000-8000-000000000055';
      update public.user_private set last_seen_at=timestamptz '2026-10-20 12:00Z'
        where user_id='00000000-0000-4000-8000-000000000055';
      update auth.users set last_sign_in_at=timestamptz '2026-10-22 12:00Z'
        where id='00000000-0000-4000-8000-000000000060';
    `);
    await db.exec(migration('20261024090159_admin_account_sorting.sql'));
    const sortedMembers = (sort, query = '', filter = 'all', offset = 0, limit = 20, schema = 'public') =>
      value(`select ${schema}.admin_list_member_accounts($1,$2,$3,$4,$5) as value`, [query,filter,offset,limit,sort]);
    for (const schema of ['public','ojjuda_account_internal']) {
      const signatures = (await db.query(`select p.pronargs,p.pronargdefaults,p.prosecdef,p.proconfig
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname=$1 and p.proname='admin_list_member_accounts'`, [schema])).rows;
      assert.equal(signatures.length, 1, 'one signature avoids ambiguous PostgREST RPC dispatch');
      assert.equal(signatures[0].pronargs, 5); assert.equal(signatures[0].pronargdefaults, 5);
      assert.equal(signatures[0].prosecdef, schema === 'ojjuda_account_internal');
      assert.deepEqual(signatures[0].proconfig, ['search_path=pg_catalog']);
      const signature = `${schema}.admin_list_member_accounts(text,text,integer,integer,text)`;
      assert.equal(await value("select has_function_privilege('anon',$1,'execute') as value", [signature]), false);
      assert.equal(await value("select has_function_privilege('authenticated',$1,'execute') as value", [signature]), true);
    }
    await db.exec('set role anon');
    await assert.rejects(() => sortedMembers('visit_count'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    for (const id of [null,uid(3)]) {
      await claim(id);
      for (const schema of ['public','ojjuda_account_internal']) {
        await assert.rejects(() => sortedMembers('visit_count','','all',0,20,schema), /not_admin/);
      }
    }
    await claim(uid(1));
    await assert.rejects(() => db.query('select * from ojjuda_rewards_internal.activity_days'), /permission denied/);
    for (const sort of ['last_seen','created_at','visit_count']) {
      const orderedPages = await Promise.all([0,20,40,60].map(offset => sortedMembers(sort,'','all',offset)));
      const rows = orderedPages.flatMap(page => page.items);
      assert.equal(rows.length, 64); assert.equal(new Set(rows.map(row => row.id)).size, 64);
      assert.ok(orderedPages.every(page => page.total === 64));
      assert.deepEqual(rows.map(row => row.id), [...rows].sort((a,b) => {
        const time = value => value ? Date.parse(value) : -Infinity;
        if (sort === 'visit_count' && a.visit_count !== b.visit_count) return b.visit_count-a.visit_count;
        if (sort !== 'created_at' && time(a.last_seen) !== time(b.last_seen)) return time(b.last_seen)-time(a.last_seen);
        if (time(a.created_at) !== time(b.created_at)) return time(b.created_at)-time(a.created_at);
        return a.id.localeCompare(b.id);
      }).map(row => row.id), `${sort} sorts globally with deterministic null/tie handling`);
      rows.forEach(row => assert.deepEqual(Object.keys(row).sort(), [...memberKeys,'visit_count'].sort()));
      assert.deepEqual((await sortedMembers(sort)).items, orderedPages[0].items, 'repeat reads are stable');
    }
    const byVisits = await sortedMembers('visit_count');
    assert.deepEqual(byVisits.items.slice(0,2).map(row => [row.id,row.visit_count]), [[uid(40),12],[uid(50),12]]);
    const recent = await sortedMembers('last_seen');
    assert.equal(recent.items[0].id, uid(55), 'a newer login wins over an older last_seen timestamp');
    assert.equal(recent.items[0].seen_by_login, true);
    assert.equal(recent.items.find(row => row.id === uid(60)).coins, null, 'missing wallet still uses login visit');
    assert.equal((await sortedMembers('visit_count','member55@')).items[0].visit_count, 0, 'no daily records means zero, not invented history');
    assert.equal((await sortedMembers('visit_count','mixed','banned')).total, 1);
    assert.equal((await sortedMembers('visit_count','','banned')).total, 2);
    assert.deepEqual((await sortedMembers('created_at','','today')).items.map(row => row.id), [uid(63),uid(62)]);
    assert.deepEqual((await members()).items, (await sortedMembers('created_at')).items, 'old four-argument clients retain their ordering');
    assert.deepEqual((await value('select public.admin_list_member_accounts() as value')).items, (await members()).items);
    assert.deepEqual((await sortedMembers(null)).items, (await members()).items);
    assert.equal((await sortedMembers('visit_count','','all',100)).items.length, 0);
    await assert.rejects(() => sortedMembers('visit_count;drop table auth.users'), /invalid_account_sort/);

    // Archive expiration and current administrator membership are checked on every call.
    await db.exec('reset role');
    await db.query('update ojjuda_account_internal.withdrawn_member_accounts set expires_at=now() where user_id=$1', [uid(101)]);
    await db.exec('set role authenticated');
    assert.equal((await withdrawn()).total, 51);
    await db.exec('reset role');
    await db.query('delete from public.app_admins where user_id=$1', [uid(1)]);
    await db.exec('set role authenticated');
    await assert.rejects(() => members(), /not_admin/);
    await assert.rejects(() => sortedMembers('last_seen'), /not_admin/);
    await assert.rejects(() => withdrawn(), /not_admin/);
    console.log('PASS: account directory permissions, all three global sorts, visit totals, stable pagination, legacy RPC compatibility, literal searches, KST filters, activity compatibility, archive expiry and masked fields');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

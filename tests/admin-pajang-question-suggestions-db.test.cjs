const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261119041945_pajang_question_suggestions_admin.sql'), 'utf8');
const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const blankProfile = '00000000-0000-4000-8000-000000000003';
const missingProfile = '00000000-0000-4000-8000-000000000004';
const inquiryId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const prefix = '[파장 · 오늘의 질문 제안]\n';

test('the Pajang question queue reads existing inquiries with server-side filtering and administrator-only access', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal;
    grant usage on schema auth,ojjuda_note,ojjuda_note_internal to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable set search_path='' as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table public.app_admins(user_id uuid primary key);
    create table public.profiles(id uuid primary key,nickname text,email text,phone text);
    create function ojjuda_note_internal.is_note_moderator() returns boolean
      language sql stable security definer set search_path='' as $$
      select case when current_setting('test.null_admin',true)='true' then null else
        auth.uid() is not null and exists(select from public.app_admins where user_id=auth.uid()) end;
    $$;
    create table ojjuda_note_internal.inquiries(
      id uuid primary key,user_id uuid not null,request_id uuid not null,body text not null,
      status text not null default 'open' check(status in('open','resolved')),
      reply text not null default '',replied_by uuid,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
      unique(user_id,request_id)
    );
    alter table ojjuda_note_internal.inquiries enable row level security;
    -- Reproduce the deployed inquiry list and its API wrapper. The new queue
    -- must not replace this query or remove suggestions from the general inbox.
    create function ojjuda_note_internal.admin_inquiries(
      p_status text default 'all',p_limit integer default 50,p_offset integer default 0
    ) returns table(id uuid,user_id uuid,body text,status text,reply text,created_at timestamptz,updated_at timestamptz)
      language plpgsql stable security definer set search_path='' as $$
    begin
      if not ojjuda_note_internal.is_note_moderator() then
        raise exception 'Note moderator required' using errcode='42501';
      end if;
      if p_status is null or p_status not in('all','open','resolved')
        or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
        raise exception 'Invalid page' using errcode='22023';
      end if;
      return query select i.id,i.user_id,i.body,i.status,i.reply,i.created_at,i.updated_at
        from ojjuda_note_internal.inquiries i where p_status='all' or i.status=p_status
        order by i.created_at desc,i.id limit p_limit offset p_offset;
    end $$;
    create function ojjuda_note.admin_inquiries(
      p_status text default 'all',p_limit integer default 50,p_offset integer default 0
    ) returns table(id uuid,user_id uuid,body text,status text,reply text,created_at timestamptz,updated_at timestamptz)
      language sql stable security invoker set search_path='' as $$
      select * from ojjuda_note_internal.admin_inquiries(p_status,p_limit,p_offset);
    $$;
    revoke all on all functions in schema ojjuda_note,ojjuda_note_internal from public,anon,authenticated,service_role;
    grant execute on all functions in schema ojjuda_note,ojjuda_note_internal to authenticated;
    insert into public.app_admins values('${admin}');
    insert into public.profiles values
      ('${member}','합성 작성자','private@example.invalid','01000000000'),
      ('${blankProfile}','  ','hidden@example.invalid','01011111111');
    -- A permissive default must not make the new functions public APIs for guests.
    alter default privileges grant execute on functions to anon,authenticated,service_role;
  `);

  const suggestions = Array.from({ length: 65 }, (_, index) => {
    const n = index + 1;
    const created = new Date(Date.UTC(2026, 10, 1, 0, 0, Math.floor(n / 2))).toISOString();
    const resolved = n % 3 === 0;
    return {
      id: inquiryId(n), user_id: n === 64 ? blankProfile : n === 65 ? missingProfile : member,
      request_id: inquiryId(1000 + n), body: prefix + '기존 합성 제안 ' + n,
      status: resolved ? 'resolved' : 'open', reply: resolved ? '기존 합성 답변 ' + n : '',
      replied_by: resolved ? admin : null, created_at: created,
      updated_at: resolved ? '2026-11-02T00:00:00.000Z' : created
    };
  });
  const similarBodies = [
    '[파장 · 오늘의 질문 제안]줄바꿈 없음',
    '[파장 · 오늘의 질문 제안]\r\n다른 줄바꿈',
    '[파장 · 오늘의 질문 제안]\\n문자 그대로의 이스케이프',
    '[파장 · 오늘의 질문 제안 ]\n다른 표제',
    '[파장·오늘의 질문 제안]\n다른 공백',
    '앞쪽의 문의 ' + prefix + '중간에 있는 표시',
    ' ' + prefix + '선행 공백'
  ];
  const otherInquiries = Array.from({ length: 45 }, (_, index) => ({
    id: inquiryId(100 + index), user_id: member, request_id: inquiryId(2000 + index),
    body: similarBodies[index] || '더 최근의 일반 문의 ' + index,
    status: index % 2 ? 'open' : 'resolved', reply: '', replied_by: null,
    created_at: '2026-11-19T00:00:00.000Z', updated_at: '2026-11-19T00:00:00.000Z'
  }));
  await db.query(`insert into ojjuda_note_internal.inquiries
    select * from jsonb_to_recordset($1::jsonb) as i(
      id uuid,user_id uuid,request_id uuid,body text,status text,reply text,replied_by uuid,
      created_at timestamptz,updated_at timestamptz)`, [JSON.stringify([...suggestions, ...otherInquiries])]);

  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const as = async (actor, operation, role = 'authenticated') => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']);
    await db.exec('set role ' + role);
    try { return await operation(); } finally { await db.exec('reset role'); }
  };
  const query = async (schema, name, args = []) => (await db.query(
    `select * from ${schema}.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows;
  const list = (...args) => as(admin, () => query('ojjuda_note', 'admin_pajang_question_suggestions', args));
  const originalList = (...args) => as(admin, () => query('ojjuda_note', 'admin_inquiries', args));
  const originalDefinitions = async () => (await db.query(`select n.nspname,p.proname,p.proacl,
    pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in('ojjuda_note','ojjuda_note_internal') and p.proname in('admin_inquiries','is_note_moderator')
    order by n.nspname,p.proname`)).rows;
  const records = () => value('select jsonb_agg(to_jsonb(i) order by id) as value from ojjuda_note_internal.inquiries i');
  const priorDefinitions = await originalDefinitions(), priorRecords = await records();
  const priorList = await originalList('all', 100);
  await db.exec(migration);
  const expected = suggestions.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));

  await t.test('filters exact existing prefixes before pagination, with stable ordering across tied timestamps', async () => {
    assert.ok(priorList.slice(0, 30).every(row => !row.body.startsWith(prefix)), 'the first general-inquiry page contains no suggestions');
    const first = await list(), second = await list('all', 30, 30), third = await list('all', 30, 60);
    assert.equal(first.length, 30); assert.equal(second.length, 30); assert.equal(third.length, 5);
    assert.deepEqual([...first, ...second, ...third].map(row => row.id), expected.map(row => row.id));
    assert.equal(new Set([...first, ...second, ...third].map(row => row.id)).size, 65);
    assert.ok(first.every(row => row.body.startsWith(prefix)), 'the raw prefix and original text remain available to the UI');
    assert.deepEqual((await list('all', 2, 1)).map(row => row.id), expected.slice(1, 3).map(row => row.id));
    assert.deepEqual(await list('all', 30, 65), []);
  });

  await t.test('applies status filters before paging and returns only the requested author and inquiry fields', async () => {
    for (const status of ['open', 'resolved']) {
      const rows = await list(status, 100);
      assert.deepEqual(rows.map(row => row.id), expected.filter(row => row.status === status).map(row => row.id));
      assert.deepEqual((await list(status, 2, 1)).map(row => row.id), rows.slice(1, 3).map(row => row.id));
    }
    const rows = await list('all', 100);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['id','user_id','nickname','body','status','reply','created_at','updated_at'].sort());
    assert.equal(rows.find(row => row.user_id === member).nickname, '합성 작성자');
    assert.equal(rows.find(row => row.user_id === blankProfile).nickname, '회원');
    assert.equal(rows.find(row => row.user_id === missingProfile).nickname, '회원', 'missing profile metadata must not hide an inquiry');
    assert.equal(rows.find(row => row.status === 'resolved').reply, expected.find(row => row.status === 'resolved').reply);
    assert.ok(!JSON.stringify(rows).includes('private@example.invalid') && !JSON.stringify(rows).includes('01000000000'));
  });

  await t.test('denies anonymous, regular, absent, null and revoked administrators on both entry points', async () => {
    for (const schema of ['ojjuda_note', 'ojjuda_note_internal']) {
      const read = () => query(schema, 'admin_pajang_question_suggestions');
      for (const [actor, role] of [[null, 'authenticated'], [member, 'authenticated'], [admin, 'anon'], [admin, 'service_role']]) {
        await assert.rejects(() => as(actor, read, role), error => error.code === '42501');
      }
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ user_metadata: { is_admin: true }, app_metadata: { role: 'admin' } })]);
      await assert.rejects(() => as(member, read), error => error.code === '42501');
      await db.exec("set test.null_admin='true'");
      await assert.rejects(() => as(admin, read), error => error.code === '42501');
      await db.exec("set test.null_admin='false'");
      await db.query('delete from public.app_admins where user_id=$1', [admin]);
      await assert.rejects(() => as(admin, read), error => error.code === '42501');
      await db.query('insert into public.app_admins values($1)', [admin]);
    }
  });

  await t.test('rejects invalid pagination and checks authorization before disclosing validation details', async () => {
    for (const args of [[null], ['other'], ['all', null], ['all', 0], ['all', 101], ['all', 30, null], ['all', 30, -1]]) {
      await assert.rejects(() => list(...args), error => error.code === '22023');
      await assert.rejects(() => as(member, () => query('ojjuda_note', 'admin_pajang_question_suggestions', args)), error => error.code === '42501');
    }
    assert.deepEqual(await list('all', 100, 2147483647), []);
  });

  await t.test('uses the private definer and public invoker pattern without granting access to private tables', async () => {
    const functions = (await db.query(`select n.nspname,p.prosecdef,p.proconfig,p.provolatile,p.oid::regprocedure::text as signature
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in('ojjuda_note','ojjuda_note_internal') and p.proname='admin_pajang_question_suggestions'`)).rows;
    assert.equal(functions.length, 2);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, fn.nspname === 'ojjuda_note_internal');
      assert.ok(fn.proconfig.includes('search_path=""')); assert.equal(fn.provolatile, 's');
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await value("select has_function_privilege($1,$2,'execute') as value", [role, fn.signature]), role === 'authenticated');
      }
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of ['ojjuda_note_internal.inquiries', 'public.profiles']) {
        assert.equal(await value("select has_table_privilege($1,$2,'select') as value", [role, table]), false);
        await assert.rejects(() => as(admin, () => db.query('select * from ' + table), role), error => error.code === '42501');
      }
    }
  });

  await t.test('preserves the general inquiry list, function grants and originals, including repeat application', async () => {
    assert.deepEqual(await originalList('all', 100), priorList);
    assert.deepEqual(await originalDefinitions(), priorDefinitions);
    assert.deepEqual(await records(), priorRecords);
    await db.exec(migration);
    assert.equal((await list('all', 100)).length, 65);
    assert.deepEqual(await originalList('all', 100), priorList);
    assert.deepEqual(await originalDefinitions(), priorDefinitions);
    assert.deepEqual(await records(), priorRecords);
  });
});

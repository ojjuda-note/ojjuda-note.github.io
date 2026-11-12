const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('retired meeting cannot start work or expose archived data', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const admin = '00000000-0000-4000-8000-000000000001';
  const otherAdmin = '00000000-0000-4000-8000-000000000002';
  const thirdAdmin = '00000000-0000-4000-8000-000000000003';
  const member = '00000000-0000-4000-8000-000000000004';
  const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema net; create schema extensions; create schema storage;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema net to public;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${admin}'),('${otherAdmin}'),('${thirdAdmin}'),('${member}');
    create table public.app_admins(user_id uuid primary key references auth.users(id));
    insert into public.app_admins values ('${admin}'),('${otherAdmin}'),('${thirdAdmin}');
    create function public.is_admin() returns boolean language sql stable security definer
      set search_path='' as $$
      select exists(select 1 from public.app_admins where user_id=auth.uid());
    $$;
    create table public.profiles(id uuid primary key, nickname text);
    insert into public.profiles select id,'테스트 회원' from auth.users;
    create table public.feedback(
      id bigint generated always as identity primary key,
      user_id uuid default auth.uid() references auth.users(id) on delete set null,
      kind text not null check(kind in ('bug','idea','other')),
      body text not null check(char_length(body) between 1 and 2000),
      screen text check(char_length(screen)<=40),
      app_version text check(char_length(app_version)<=40),
      user_agent text check(char_length(user_agent)<=400),
      status text not null default 'open' check(status in ('open','done')),
      created_at timestamptz not null default now()
    );
    alter table public.feedback enable row level security;
    grant insert,select on public.feedback to authenticated;
    grant usage on sequence public.feedback_id_seq to authenticated;
    create policy feedback_insert on public.feedback for insert to authenticated
      with check(user_id=auth.uid());
    create policy feedback_select on public.feedback for select to authenticated
      using(user_id=auth.uid());
    create table storage.buckets(
      id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]
    );
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create table net.http_request_queue(
      id bigint generated always as identity primary key,url text,body jsonb,headers jsonb
    );
    create table net._http_response(id bigint);
    grant all on net.http_request_queue,net._http_response to anon,authenticated;
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',
      headers jsonb default '{"Content-Type":"application/json"}',timeout_milliseconds int default 2000)
    returns bigint language plpgsql security definer set search_path='' as $$
    declare request_id bigint;
    begin
      if current_setting('test.net_fail',true)='true' then
        raise exception 'sensitive-network-error-must-not-leak';
      end if;
      insert into net.http_request_queue(url,body,headers)
        values(url,body,headers) returning id into request_id;
      return request_id;
    end $$;
  `);
  await db.exec(migration('20260929082930_feedback_codex_queue.sql'));
  const dispatch = migration('20260929085320_feedback_codex_dispatch.sql');
  const extension = 'create extension if not exists pg_net with schema extensions;';
  assert.equal(dispatch.split(extension).length, 2);
  // Only pg_net is replaced: the real trigger, quotas, nonce and lease functions run.
  await db.exec(dispatch.replace(extension, ''));
  await db.exec(migration('20260929123326_feedback_recent_diagnostics.sql'));
  await db.exec(migration('20261109052631_admin_ai_meeting.sql'));
  // Simulate permissive table defaults to verify the new explicit revocations.
  await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role');
  await db.exec(migration('20261112042123_admin_ai_meeting_tasks.sql'));
  await db.exec(migration('20261112043809_admin_ai_meeting_auto_dispatch.sql'));


  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const as = async (actor, fn, role = 'authenticated') => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const denied = fn => assert.rejects(fn, error => error.code === '42501');
  await db.exec(`
    alter role service_role bypassrls;
    grant all on public.ai_meeting_messages,public.ai_meeting_tasks to anon,authenticated,service_role;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    alter table storage.objects enable row level security;
    create policy legacy_cross_bucket_access on storage.objects for all to public
      using(true) with check(true);
    update ojjuda_ops.feedback_codex_config set enabled=true;
  `);
  const messageId = await value(`insert into public.ai_meeting_messages
    (created_by,sender_kind,sender_role,content) values ($1,'human','representative','기존 회의 지시')
    returning id as value`, [admin]);
  const oldTask = await as(admin, () => value(
    'select public.admin_ai_meeting_create_task($1,$2) as value', [messageId,'bug']));
  await db.query(`insert into storage.objects(bucket_id,name) values
    ('ai-meeting-files',$1),('other-feature','keep.txt')`, [`${admin}/attachment.pdf`]);
  const snapshot = () => value(`select jsonb_build_object(
    'messages',(select jsonb_agg(to_jsonb(m)) from public.ai_meeting_messages m),
    'tasks',(select jsonb_agg(to_jsonb(t)) from public.ai_meeting_tasks t),
    'feedback',(select jsonb_agg(to_jsonb(f)) from public.feedback f),
    'jobs',(select jsonb_agg(to_jsonb(j)) from public.feedback_ai_jobs j),
    'files',(select jsonb_agg(to_jsonb(o) order by name) from storage.objects o)
  ) as value`);
  const archived = await snapshot();
  const sharedFunctions = await value(`select jsonb_agg(jsonb_build_object(
    'name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)
  ) order by p.oid) as value from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='ojjuda_ops' or (n.nspname='public' and p.proname='feedback_codex_bridge')`);
  await db.exec(migration('20261112231656_retire_admin_ai_meeting.sql'));

  await t.test('history and shared worker definitions survive retirement unchanged', async () => {
    assert.deepEqual(await snapshot(), archived);
    assert.equal(await value('select enabled as value from ojjuda_ops.feedback_codex_config'), true);
    assert.deepEqual(await value(`select jsonb_agg(jsonb_build_object(
      'name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)
    ) order by p.oid) as value from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_ops' or (n.nspname='public' and p.proname='feedback_codex_bridge')`), sharedFunctions);
  });

  await t.test('public and private meeting RPCs no longer exist', async () => {
    for (const signature of ['public.admin_ai_meeting_create_task(uuid,text)',
      'public.admin_ai_meeting_tasks(integer)','public.admin_ai_meeting_task(uuid)']) {
      assert.equal(await value('select to_regprocedure($1)::text as value',[signature]), null);
    }
    assert.equal(await value("select to_regnamespace('ojjuda_meeting_internal')::text as value"), null);
    await assert.rejects(() => as(admin, () => value(
      'select public.admin_ai_meeting_create_task($1,$2) as value',[messageId,'bug'])),
      error => error.code === '42883');
  });

  await t.test('all former table access is revoked even for a bypass-RLS service role', async () => {
    for (const table of ['public.ai_meeting_messages','public.ai_meeting_tasks']) {
      assert.equal(await value('select relrowsecurity as value from pg_class where oid=$1::regclass',[table]),true);
      for (const role of ['anon','authenticated','service_role']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
          assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,table,privilege]),false);
        }
        await denied(() => as(admin, () => value(`select count(*) as value from ${table}`),role));
      }
    }
    await denied(() => as(admin, () => value(`insert into public.ai_meeting_messages
      (created_by,sender_kind,sender_role,content) values ($1,'human','representative','stale request')
      returning id as value`,[admin])));
  });

  await t.test('archived attachments stay inaccessible despite broad legacy storage policies', async () => {
    for (const role of ['anon','authenticated']) {
      const visible=await as(admin, () => db.query('select bucket_id from storage.objects order by bucket_id'),role);
      assert.deepEqual(visible.rows,[{bucket_id:'other-feature'}]);
      await denied(() => as(admin, () => db.query(`insert into storage.objects(bucket_id,name)
        values ('ai-meeting-files',$1)`,[`${admin}/new.pdf`]),role));
      assert.equal((await as(admin, () => db.query("delete from storage.objects where bucket_id='ai-meeting-files' returning id"),role)).rows.length,0);
      assert.equal((await as(admin, () => db.query("update storage.objects set name='changed.pdf' where bucket_id='ai-meeting-files' returning id"),role)).rows.length,0);
      await denied(() => as(admin, () => db.query("update storage.objects set bucket_id='ai-meeting-files' where bucket_id='other-feature'"),role));
    }
    assert.deepEqual(await snapshot(), archived);
  });

  await t.test('other storage buckets retain their existing read and write behavior', async () => {
    const file=await as(member, () => value("insert into storage.objects(bucket_id,name) values ('other-feature','new.txt') returning id as value"));
    assert.equal(await as(member, () => value('update storage.objects set name=$1 where id=$2 returning name as value',['renamed.txt',file])),'renamed.txt');
    assert.equal(await as(member, () => value('delete from storage.objects where id=$1 returning id as value',[file])),file);
  });

  await t.test('ordinary member feedback still enters the existing repair queue', async () => {
    const id=await as(member, () => value(`insert into public.feedback(user_id,kind,body,screen)
      values ($1,'bug','일반 기능 오류 신고','world') returning id as value`,[member]));
    assert.notEqual(id,oldTask.feedback_id);
    assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs where feedback_id=$1',[id]),1);
    assert.equal(await value('select count(*)::int as value from net.http_request_queue'),2);
    assert.equal(await value('select count(*)::int as value from public.ai_meeting_tasks'),1);
  });
});

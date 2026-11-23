const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const migrationDirectory = path.join(__dirname, '../supabase/migrations');
const read = name => fs.readFileSync(path.join(migrationDirectory, name), 'utf8');
const migration = read('20261119002758_pajang_admin_moderation.sql');
const admin = '00000000-0000-4000-8000-000000000001';
const users = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c'];
const people = ['10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000c'];
const messageId = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = '2026-11-19';

test('Pajang moderation protects member reads and preserves original records and permissions', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create table public.app_admins(user_id uuid primary key);
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select case when current_setting('test.null_admin',true)='true' then null
        else exists(select from public.app_admins where user_id=auth.uid()) end;
    $$;
    create table public.profiles(id uuid primary key,nickname text);
    create table public.admin_log(
      id bigint generated always as identity primary key,admin_id uuid not null,action text not null,
      target_user uuid,target text,detail jsonb not null default '{}',created_at timestamptz not null default now()
    );
    create schema ojjuda_note_internal;
    create table ojjuda_note_internal.moderation_actions(
      action_id uuid primary key,card_id uuid,report_id uuid,moderator_id uuid,subject_user_id uuid,
      action text,reason text,detail jsonb,created_at timestamptz
    );
    create schema ojjuda_account_internal;
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date,gender text);
    create schema ojjuda_restaurants_internal;
    create function ojjuda_restaurants_internal.require_member() returns uuid
      language plpgsql security definer set search_path='' as $$
      begin
        if auth.uid() is null then raise exception 'member_required' using errcode='42501'; end if;
        return auth.uid();
      end;
    $$;
    create function public.ojjuda_location_preference(
      p_enabled boolean default null,p_expected_version bigint default null,p_account_id uuid default null
    ) returns jsonb language sql as $$select '{"enabled":false,"version":0}'::jsonb$$;
    insert into auth.users values('${admin}'),${users.map(id => `('${id}')`).join(',')};
    insert into public.app_admins values('${admin}');
    insert into public.profiles values('${admin}','운영자'),('${users[0]}','달100%_님'),('${users[1]}','ALICE'),('${users[2]}','셋째');
    insert into ojjuda_account_internal.member_identity values
      ('${users[0]}','1990-01-01','female'),('${users[1]}','1990-01-01','male'),('${users[2]}','1990-01-01',null);
  `);
  const members = read('20261117060900_pajang_members.sql');
  await db.exec(members.slice(0, members.indexOf('insert into storage.buckets')));
  await db.exec(`
    alter table pajang_private.people alter column age drop not null;
    alter table pajang_private.people add column location_enabled boolean not null default false,
      add column location_version bigint not null default 0;
    alter table pajang_private.answers add column slot text not null default 'am',
      drop constraint answers_pkey, add primary key(person,day,slot);
    create table pajang_private.region_choices(region text primary key);
    create table pajang_private.discovery_gender_opt_ins(person uuid primary key);
    create function pajang_private.answer_window(timestamptz) returns table(day date,slot text,next_at timestamptz)
      language sql as $$select date '${today}','am'::text,timestamptz '${today} 03:00:00+00'$$;
    create function pajang_private.question_for_window(date,text) returns jsonb
      language sql as $$select '{"id":"synthetic-question","q":["검사용 질문"]}'::jsonb$$;
  `);
  const feed = read('20261117180000_pajang_answer_feed.sql');
  await db.exec(feed.slice(0, feed.indexOf('create or replace function public.pajang_member')));
  await db.exec(read('20261118093216_pajang_answer_history_one_year.sql'));
  // Model the deployed per-answer 30/365-day publication fix, absent from older files.
  // The new migration must preserve it rather than reinstalling a stale function.
  await db.exec(`
    alter table pajang_private.answers add column publication_window_days smallint not null default 30;
    create function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
      returns boolean language sql immutable as $$
      select $1 between $4-(case when $6=365 then 365 else 30 end-1) and $4
        and (($1=$4 and $2=$5) or ($3 and ($1<$4 or ($2='am' and $5='pm'))));
    $$;
  `);
  const latestMemberFile = read('20261118084120_shared_park_pajang_location.sql');
  const latestMember = latestMemberFile.slice(latestMemberFile.indexOf('CREATE OR REPLACE FUNCTION public.pajang_member'),
    latestMemberFile.indexOf('-- An older Park tab'));
  const addPublicationWindow = sql => sql
    .replaceAll('a.archived,today,current_slot)', 'a.archived,today,current_slot,a.publication_window_days)')
    .replaceAll('a.archived,today,active_window.slot)', 'a.archived,today,active_window.slot,a.publication_window_days)');
  await db.exec(addPublicationWindow(latestMember));
  await db.exec(addPublicationWindow(read('20261118012000_pajang_owner_answer_history.sql')));
  await db.exec(`
    revoke all on function public.pajang_answer_feed(jsonb),public.pajang_discovery_feed(jsonb,text,text,text)
      from public,anon,authenticated;
    grant execute on function public.pajang_answer_feed(jsonb),public.pajang_discovery_feed(jsonb,text,text,text) to authenticated;
    insert into pajang_private.people(id,owner_id,name,region,interest) values
      ('${people[0]}','${users[0]}','달100%_님','서울특별시','coffee'),
      ('${people[1]}','${users[1]}','ALICE','서울특별시','coffee'),
      ('${people[2]}','${users[2]}','셋째','서울특별시','walk');
    insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days) values
      ('${people[0]}','${today}','am','숨김 대상 원문 100%_',600,'검사용 질문',false,30),
      ('${people[1]}','${today}','am','다른 회원 현재 답변',500,'검사용 질문',false,30),
      ('${people[0]}',date '${today}'-40,'pm','공개 기간 지난 답변',400,'옛 질문',true,30),
      ('${people[0]}',date '${today}'-40,'am','1년 공개 답변',300,'옛 질문',true,365),
      ('${people[1]}',date '${today}'-1,'pm','해당 시간만 공개한 답변',200,'옛 질문',false,30);
    insert into pajang_private.signals values
      ('${people[0]}','${people[1]}','${today}','',1),('${people[1]}','${people[0]}','${today}','',2);
    insert into pajang_private.messages values
      ('${messageId(1)}','${people[0]}','${people[1]}','숨김 대상 채팅',1000),
      ('${messageId(2)}','${people[1]}','${people[0]}','보이는 답장 100%_',1001),
      ('${messageId(3)}','${people[0]}','${people[1]}','다음 메시지',1001),
      ('${messageId(4)}','${people[2]}','${people[1]}','다른 대화',999);
  `);
  const trash = read('20261021091337_admin_trash_one_month.sql');
  await db.exec(trash.slice(0, trash.indexOf('create function ojjuda_trash_internal.capture(')));
  await db.exec(read('20261004080923_admin_activity_history.sql'));
  // A permissive installation default must not leak any newly added table/function.
  await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role; alter default privileges grant all on tables to anon,authenticated,service_role;');

  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const as = async (actor, fn, role = 'authenticated') => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']);
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const sourceDefinitions = () => db.query(`select p.oid::regprocedure::text as name,pg_get_functiondef(p.oid) as definition,p.proacl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in('pajang_member','pajang_answer_feed','pajang_discovery_feed','pajang_my_answers'))
      or (n.nspname='pajang_private' and p.proname='answer_is_visible') order by p.oid::regprocedure::text`);
  const beforeDefinitions = (await sourceDefinitions()).rows;
  await db.exec(migration);
  const query = (name, args = []) => value(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`, args);
  const listAnswers = (...args) => as(admin, () => query('admin_pajang_answers', args));
  const listChats = (...args) => as(admin, () => query('admin_pajang_chats', args));
  const messages = (...args) => as(admin, () => query('admin_pajang_chat_messages', args.length ? args : [people[0], people[1]]));
  const moderateAnswer = (action = 'hide', person = people[0], day = today, slot = 'am', reason = '검토 결과') =>
    as(admin, () => query('admin_pajang_moderate', ['answer', action, person, day, slot, null, reason]));
  const moderateMessage = (action = 'hide', id = messageId(1), reason = '검토 결과') =>
    as(admin, () => query('admin_pajang_moderate', ['message', action, null, null, null, id, reason]));
  const member = (user, action = 'state', data = {}) => as(user, () => query('pajang_member', [action, data]));
  const answerFeed = user => as(user, () => query('pajang_answer_feed'));
  const discovery = user => as(user, () => query('pajang_discovery_feed', [null, 'all', 'latest', 'all']));
  const snapshot = () => value(`select jsonb_build_object(
    'answers',(select jsonb_agg(to_jsonb(a) order by person,day,slot) from pajang_private.answers a),
    'messages',(select jsonb_agg(to_jsonb(m) order by id) from pajang_private.messages m),
    'people',(select jsonb_agg(to_jsonb(p) order by id) from pajang_private.people p)) as value`);
  const baseline = await snapshot();

  await t.test('patches only the audited read references and preserves deployed publication logic and ACLs', async () => {
    const after = (await sourceDefinitions()).rows;
    assert.deepEqual(after, beforeDefinitions.map(row => ({ ...row, definition: row.definition
      .replace(/\b(from|join)(\s+)pajang_private\.answers\b/gi, '$1$2pajang_private.visible_answers')
      .replace(/\b(from|join)(\s+)pajang_private\.messages\b/gi, '$1$2pajang_private.visible_messages') })));
    const memberDefinition = after.find(row => row.name.startsWith('pajang_member(')).definition;
    assert.match(memberDefinition, /insert into pajang_private\.answers\(/);
    assert.match(memberDefinition, /insert into pajang_private\.messages values/);
    const visible = await answerFeed(users[2]);
    assert.ok(visible.items.some(item => item.body === '1년 공개 답변'));
    assert.ok(!visible.items.some(item => item.body === '공개 기간 지난 답변' || item.body === '해당 시간만 공개한 답변'));
  });

  await t.test('requires a current administrator for public and internal entrypoints, including revoked/null authorization', async () => {
    const operations = [
      ['admin_pajang_answers', []], ['admin_pajang_chats', []],
      ['admin_activity_list', ['world']],
      ['admin_pajang_chat_messages', [people[0], people[1]]],
      ['admin_pajang_moderate', ['answer', 'hide', people[0], today, 'am', null, '검토 사유']]
    ];
    const auditBefore = await value('select count(*)::integer as value from ojjuda_trash_internal.access_log');
    for (const [actor, role] of [[null, 'authenticated'], [users[0], 'authenticated'], [admin, 'anon'], [admin, 'service_role']]) {
      for (const [name, args] of operations) await assert.rejects(() => as(actor, () => query(name, args), role), error => error.code === '42501');
    }
    for (const [name, args] of operations) {
      const internalName = name.replace('admin_', '');
      await assert.rejects(() => as(users[0], () => value(`select ojjuda_admin_internal.${internalName}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args)), error => error.code === '42501');
    }
    await db.exec("set test.null_admin='true'");
    await assert.rejects(() => listAnswers(), error => error.code === '42501');
    await db.exec("set test.null_admin='false'");
    await db.query('delete from public.app_admins where user_id=$1', [admin]);
    await assert.rejects(() => listChats(), error => error.code === '42501');
    await db.query('insert into public.app_admins values($1)', [admin]);
    assert.equal(await value('select count(*)::integer as value from ojjuda_trash_internal.access_log'), auditBefore);
    for (const relation of ['ojjuda_admin_internal.pajang_answer_moderation', 'ojjuda_admin_internal.pajang_message_moderation', 'pajang_private.visible_answers', 'pajang_private.visible_messages', 'ojjuda_trash_internal.access_log', 'public.admin_log']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await value('select has_table_privilege($1,$2,\'select\') as value', [role, relation]), false);
        await assert.rejects(() => as(admin, () => value(`select count(*) as value from ${relation}`), role), error => error.code === '42501');
      }
    }
    const functions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,p.oid::regprocedure::text as signature
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in('admin_pajang_answers','admin_pajang_chats','admin_pajang_chat_messages','admin_pajang_moderate',
        'pajang_answers','pajang_chats','pajang_chat_messages','pajang_moderate')`)).rows;
    assert.equal(functions.length, 8);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, fn.nspname === 'ojjuda_admin_internal');
      assert.ok(fn.proconfig.includes('search_path=""'));
      for (const role of ['anon', 'service_role']) assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, fn.signature]), false);
    }
  });

  await t.test('bounded literal searches and stable pages expose only the requested administrative fields', async () => {
    const all = await listAnswers();
    assert.equal(all.total_count, 5);
    assert.equal((await listAnswers('%')).total_count, 3);
    assert.equal((await listAnswers('  alice  ')).total_count, 2);
    assert.equal((await listAnswers(people[0])).total_count, 3);
    assert.equal((await listAnswers("' OR true --")).total_count, 0);
    const one = await listAnswers('', 'all', 1, 0), two = await listAnswers('', 'all', 1, 1);
    assert.notEqual(one.items[0].person, two.items[0].person);
    assert.equal(one.total_count, 5); assert.equal(two.total_count, 5);
    assert.deepEqual(await listAnswers('', 'all', 2, 100), { items: [], total_count: 5 });
    assert.deepEqual(Object.keys(all.items[0]).sort(), ['person','day','slot','name','question','body','at','archived','publication_window_days','hidden','hidden_at','reason'].sort());
    assert.equal(all.items[0].hidden, false); assert.equal(all.items[0].hidden_at, null); assert.equal(all.items[0].reason, '');
    assert.equal(typeof all.items[0].at, 'number');
    const chats = await listChats();
    assert.equal(chats.total_count, 2); assert.equal(chats.items[0].message_count, 3);
    assert.equal((await listChats('숨김 대상 채팅')).total_count, 1);
    const thread = await messages(people[1], people[0], 2, 0);
    assert.equal(thread.first_person, people[0]); assert.equal(thread.second_person, people[1]);
    assert.deepEqual(thread.items.map(row => row.id), [messageId(3), messageId(2)]);
    assert.equal(thread.total_count, 3);
    assert.deepEqual(Object.keys(thread.items[0]).sort(), ['id','src','dst','body','at','hidden','hidden_at','reason'].sort());
    assert.deepEqual(await snapshot(), baseline);
  });

  await t.test('answer hide removes the body from every member route, while restore keeps the author publication rules', async () => {
    assert.deepEqual(await moderateAnswer(), { ok: true, kind: 'answer', hidden: true });
    const hidden = await listAnswers('', 'hidden');
    assert.equal(hidden.total_count, 1); assert.equal(hidden.items[0].body, '숨김 대상 원문 100%_');
    assert.equal(hidden.items[0].archived, false); assert.equal(hidden.items[0].reason, '검토 결과');
    assert.ok(Number.isFinite(Date.parse(hidden.items[0].hidden_at)));
    await moderateAnswer();
    assert.equal((await listAnswers('', 'hidden')).items[0].hidden_at, hidden.items[0].hidden_at, 'a retried hide does not reset its timestamp');
    for (const user of users) {
      for (const result of [await member(user, 'entry'), await member(user), await answerFeed(user), await discovery(user), await as(user, () => query('pajang_my_answers'))]) {
        assert.ok(!JSON.stringify(result).includes('숨김 대상 원문'), 'ordinary and owner endpoints omit a moderated original');
      }
    }
    await assert.rejects(() => member(users[2], 'signal', { peer: people[0], day: today, slot: 'am', answerDay: today, answerSlot: 'am' }), error => error.code === 'PT409');
    assert.equal((await listAnswers('', 'visible')).total_count, 4);
    assert.deepEqual(await snapshot(), baseline, 'moderation never rewrites the answer, publication preference, or timestamps');
    await moderateAnswer('restore');
    await moderateAnswer('restore');
    assert.equal((await member(users[0], 'entry')).body, '숨김 대상 원문 100%_');
    assert.ok((await answerFeed(users[2])).items.some(item => item.body === '숨김 대상 원문 100%_'));
    await moderateAnswer('hide', people[0], '2026-10-10', 'pm');
    await moderateAnswer('restore', people[0], '2026-10-10', 'pm');
    assert.ok(!(await answerFeed(users[2])).items.some(item => item.body === '공개 기간 지난 답변'));
    assert.deepEqual(await snapshot(), baseline);
  });

  await t.test('chat hide removes both participants access, survives send retries, and remains reviewable by administrators', async () => {
    await moderateMessage();
    for (const [user, peer] of [[users[0], people[1]], [users[1], people[0]]]) {
      const thread = await member(user, 'thread', { peer });
      assert.deepEqual(thread.map(row => row.id), [messageId(2), messageId(3)]);
      assert.ok(!JSON.stringify(thread).includes('숨김 대상 채팅'));
    }
    await assert.rejects(() => member(users[0], 'message', { peer: people[1], id: messageId(1), body: '숨김 대상 채팅' }), /메시지를 다시 보내/);
    const thread = await messages();
    assert.equal(thread.items.find(row => row.id === messageId(1)).hidden, true);
    assert.equal(thread.items.find(row => row.id === messageId(1)).body, '숨김 대상 채팅');
    const hiddenChats = await listChats('', 'hidden');
    assert.equal(hiddenChats.total_count, 1); assert.equal(hiddenChats.items[0].hidden_count, 1);
    assert.equal((await listChats('', 'visible')).total_count, 2);
    assert.deepEqual(await snapshot(), baseline);
    await moderateMessage('restore');
    await moderateMessage('restore');
    assert.equal((await member(users[0], 'thread', { peer: people[1] })).length, 3);
    assert.deepEqual(await snapshot(), baseline);
  });

  await t.test('invalid pages, targets and reasons fail without moderation or audit writes', async () => {
    const auditBefore = await value('select count(*)::integer as value from ojjuda_trash_internal.access_log');
    const activityBefore = await value('select count(*)::integer as value from public.admin_log');
    for (const args of [[null], ['x'.repeat(101)], ['', null], ['', 'other'], ['', 'all', 0], ['', 'all', 101], ['', 'all', null], ['', 'all', 30, -1], ['', 'all', 30, 100001], ['', 'all', 30, null]]) {
      await assert.rejects(() => listAnswers(...args), error => error.code === '22023');
      await assert.rejects(() => listChats(...args), error => error.code === '22023');
    }
    await assert.rejects(() => messages(people[0], people[0]), error => error.code === '22023');
    await assert.rejects(() => messages(null, people[1]), error => error.code === '22023');
    for (const reason of ['', ' ', '한', 'x'.repeat(201), null]) {
      await assert.rejects(() => moderateAnswer('hide', people[0], today, 'am', reason), error => error.code === '22023');
      await assert.rejects(() => moderateMessage('restore', messageId(1), reason), error => error.code === '22023');
    }
    for (const args of [
      ['other', 'hide', people[0], today, 'am', null, '검토 사유'],
      ['answer', 'delete', people[0], today, 'am', null, '검토 사유'],
      ['answer', 'hide', people[0], today, 'am', messageId(1), '검토 사유'],
      ['answer', 'hide', people[0], 'infinity', 'am', null, '검토 사유'],
      ['answer', 'hide', people[0], today, 'other', null, '검토 사유'],
      ['message', 'hide', people[0], null, null, messageId(1), '검토 사유']
    ]) await assert.rejects(() => as(admin, () => query('admin_pajang_moderate', args)), error => error.code === '22023');
    assert.equal(await value('select count(*)::integer as value from ojjuda_trash_internal.access_log'), auditBefore);
    assert.equal(await value('select count(*)::integer as value from public.admin_log'), activityBefore);
    assert.deepEqual(await snapshot(), baseline);
  });

  await t.test('actual changes appear once in the existing common activity API without answer or chat copies', async () => {
    const history = await as(admin, () => query('admin_activity_list', ['world']));
    assert.equal(history.total_count, 6, 'repeated hide/restore requests do not duplicate completed work');
    assert.deepEqual(history.actions, [
      { action: 'pajang_answer_hide', count: 2 }, { action: 'pajang_answer_restore', count: 2 },
      { action: 'pajang_message_hide', count: 1 }, { action: 'pajang_message_restore', count: 1 }
    ]);
    for (const item of history.items) {
      assert.equal(item.source, 'world'); assert.equal(item.admin_id, admin); assert.equal(item.admin_nick, '운영자');
      assert.equal(item.target_user, null); assert.equal(item.reason, '검토 결과');
      assert.equal(item.detail.service, 'pajang');
      assert.equal(item.detail.kind, item.action.includes('_answer_') ? 'answer' : 'message');
      assert.equal(item.detail.hidden, item.action.endsWith('_hide'));
      assert.match(item.target, /^pajang:(answer|message):/);
      assert.deepEqual(Object.keys(item.detail).sort(), ['service', 'kind', 'hidden', 'reason'].sort());
    }
    assert.ok(!JSON.stringify(history).includes('숨김 대상 원문') && !JSON.stringify(history).includes('숨김 대상 채팅'));
    const filtered = await as(admin, () => query('admin_activity_list', ['world', 'pajang_answer_hide', 1, 1]));
    assert.equal(filtered.total_count, 2); assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].action, 'pajang_answer_hide');
    assert.deepEqual(await as(admin, () => query('admin_activity_list', ['park'])), { items: [], actions: [], total_count: 0 },
      'the existing card/reply source remains separate');
    assert.deepEqual(await snapshot(), baseline);
  });

  await t.test('the existing private log records reads and moderation without copying originals or queries', async () => {
    const logs = (await db.query('select * from ojjuda_trash_internal.access_log order by id')).rows;
    assert.ok(logs.some(row => row.action === 'read'));
    assert.ok(logs.some(row => row.action === 'hide' && row.reason === '검토 결과'));
    assert.ok(logs.some(row => row.action === 'restore' && row.reason === '검토 결과'));
    assert.ok(logs.every(row => row.admin_id === admin && row.item_ids.every(id => id.startsWith('pajang:'))));
    assert.ok(logs.every(row => new Date(row.expires_at) > new Date(row.created_at)));
    assert.ok(!JSON.stringify(logs).includes('숨김 대상 원문') && !JSON.stringify(logs).includes('숨김 대상 채팅'));
  });

  await t.test('deleting originals or leaving Pajang cascades moderation and can never be undone by restore', async () => {
    await moderateAnswer(); await moderateMessage();
    await db.query('delete from pajang_private.answers where person=$1 and day=$2 and slot=$3', [people[0], today, 'am']);
    await assert.rejects(() => moderateAnswer('restore'), error => error.code === 'P0002');
    assert.equal(await value('select count(*)::integer as value from ojjuda_admin_internal.pajang_answer_moderation'), 0);
    await member(users[0], 'delete');
    await assert.rejects(() => moderateMessage('restore'), error => error.code === 'P0002');
    assert.equal(await value('select count(*)::integer as value from ojjuda_admin_internal.pajang_message_moderation'), 0);
    assert.equal(await value('select count(*)::integer as value from pajang_private.messages where id=$1', [messageId(1)]), 0);
    await assert.rejects(() => messages(), error => error.code === 'P0002');
  });
});

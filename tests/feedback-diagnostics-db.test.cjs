const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const member = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema net; create schema extensions;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema net to public;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function public.is_admin() returns boolean language sql stable as $$ select false $$;
    create table public.profiles(id uuid primary key, nickname text);
    create table public.feedback(id bigint generated always as identity primary key,
      user_id uuid default auth.uid(),kind text not null,body text not null,
      screen text,app_version text,user_agent text,status text not null default 'open',
      created_at timestamptz not null default now());
    alter table public.feedback enable row level security;
    grant all on public.feedback to anon,authenticated,service_role;
    grant usage on sequence public.feedback_id_seq to authenticated;
    create policy feedback_insert on public.feedback for insert to authenticated
      with check(user_id=(select auth.uid()));
    create policy feedback_select on public.feedback for select to authenticated
      using(user_id=(select auth.uid()));
    insert into public.feedback(user_id,kind,body) values('${member}','bug','migration must not dispatch old reports');
    create table net.http_request_queue(id bigint generated always as identity primary key,url text,body jsonb,headers jsonb);
    create table net._http_response(id bigint);
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',
      headers jsonb default '{"Content-Type":"application/json"}',timeout_milliseconds int default 2000)
      returns bigint language plpgsql security definer set search_path='' as $$
    declare request_id bigint;
    begin
      insert into net.http_request_queue(url,body,headers) values(url,body,headers) returning id into request_id;
      return request_id;
    end $$;
  `);
  const read = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
  await db.exec(read('20260929082930_feedback_codex_queue.sql'));
  await db.exec(read('20260929085320_feedback_codex_dispatch.sql')
    .replace('create extension if not exists pg_net with schema extensions;', ''));
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const boundary = async () => ({
    rls: await value("select relrowsecurity as value from pg_class where oid='public.feedback'::regclass"),
    policies: (await db.query("select policyname,roles,cmd,qual,with_check from pg_policies where tablename='feedback' order by policyname")).rows,
    grants: (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='feedback' order by grantee,privilege_type")).rows,
    dispatch: await value("select pg_get_triggerdef(oid) as value from pg_trigger where tgname='feedback_enqueue_codex'")
  });
  const before = await boundary();
  const migration = read('20260929123326_feedback_recent_diagnostics.sql');
  assert.doesNotMatch(migration, /cron\.|schedule\(|http_post|create policy|grant .*on (?:table )?public\.feedback\b/i);
  await db.exec(migration);
  await db.exec(read('20260929144128_feedback_app_notification_diagnostics.sql'));
  assert.deepEqual(await boundary(), before);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'), 0);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 0);
  assert.equal(await value('select diagnostics as value from public.feedback where id=1'), null);

  const { sanitizeFeedbackDiagnostics } = await import(pathToFileURL(path.join(__dirname, '../supabase/functions/feedback-codex/handler.mjs')));
  const normalize = (data, kind = 'bug') => value('select ojjuda_ops.sanitize_feedback_diagnostics($1::jsonb,$2) as value',
    [JSON.stringify(data), kind]);
  const sample = () => ({ version: 1, window_ms: 300000,
    context: { source: 'note', online: true, width: 360, height: 780 },
    events: [{ type: 'error', age_ms: 1234, name: 'TypeError', code: 'UNDEFINED_PROPERTY',
      path: '/note/navigation.js', line: 230, column: 17 },
    { type: 'http', age_ms: 300000, code: 'HTTP_FAILURE', path: '/rest/v1/rpc/list_cards', status: 503 }] });
  assert.deepEqual(await normalize(sample()), sample());
  for (const operation of ['list_app_notifications', 'app_notification_unread_count', 'mark_app_notifications_read']) {
    const input = sample();
    input.events = [{ type: 'http', age_ms: 0, code: 'HTTP_FAILURE', path: '/rest/v1/rpc/' + operation, status: 503 }];
    assert.deepEqual(await normalize(input), input, `${operation} survives database normalization`);
    assert.deepEqual(sanitizeFeedbackDiagnostics(input), input, `${operation} survives the gateway`);
  }
  for (const kind of ['idea', 'other', null]) assert.equal(await normalize(sample(), kind), null);
  const invalid = [null, [], '', false, 42, {}, { ...sample(), version: 2 }, { ...sample(), window_ms: 300001 },
    { ...sample(), events: {} }, { ...sample(), context: null }, { ...sample(), secret: '가'.repeat(5500) },
    ...[0, -1, 10001, 2.5, '360', 1e100, null].map(width => ({ ...sample(), context: { ...sample().context, width } })),
    { ...sample(), context: { ...sample().context, online: 'true' } },
    { ...sample(), context: { ...sample().context, source: '/note/?token=SECRET' } }];
  for (const data of invalid) {
    assert.equal(await normalize(data), null);
    assert.equal(sanitizeFeedbackDiagnostics(data), null);
  }
  const malicious = sample();
  malicious.password = 'PRIVATE_PASSWORD';
  malicious.context.email = 'private@example.com';
  malicious.events[0] = { ...malicious.events[0], name: 'private@example.com', code: 'BEARER_SECRET',
    path: '/note/navigation.js?access_token=PRIVATE_TOKEN', message: 'PRIVATE_MESSAGE', stack: 'PRIVATE_STACK',
    headers: { authorization: 'PRIVATE_AUTH' }, line: 1.2, column: 1000001, status: 600 };
  const expected = { ...sample(), events: [{ type: 'error', age_ms: 1234 }, sample().events[1]] };
  assert.deepEqual(await normalize(malicious), expected);
  assert.deepEqual(sanitizeFeedbackDiagnostics(malicious), expected);
  assert.doesNotMatch(JSON.stringify(expected), /PRIVATE_|private@/);
  for (const unsafePath of ['/rest/v1/rpc/member_secret', '/auth/v1/token', '/storage/v1/object/123',
    '/note/private@example.com.js', '/note/navigation.js#PRIVATE', '/note/%6Eavigation.js',
    'https://ojjuda.kr/note/navigation.js', '//ojjuda.kr/note/navigation.js', '/rest/v1/rpc/list_cards?user=123']) {
    const data = sample(); data.events = [{ type: 'network', age_ms: 0, path: unsafePath }];
    const clean = await normalize(data);
    assert.deepEqual(clean.events, [{ type: 'network', age_ms: 0 }]);
    assert.deepEqual(sanitizeFeedbackDiagnostics(data), clean);
  }
  const limits = sample(); limits.events = Array.from({ length: 50 }, (_, i) => ({ type: 'resource', age_ms: i,
    line: 1000000, column: 0, status: 599, code: 'RESOURCE_FAILURE', path: '/world.html' }));
  assert.equal((await normalize(limits)).events.length, 40);
  assert.deepEqual(await normalize(limits), sanitizeFeedbackDiagnostics(limits));
  const dirtyEvents = sample(); dirtyEvents.events = [null, {}, [], 'PRIVATE',
    ...[-1, 300001, 0.5, '1', 1e100].map(age_ms => ({ type: 'error', age_ms })),
    { type: 'PRIVATE', age_ms: 0 }, { type: 'rejection', age_ms: 0, name: 'DOMException', code: 'TIMEOUT', status: 0 }];
  assert.deepEqual((await normalize(dirtyEvents)).events, [dirtyEvents.events.at(-1)]);
  assert.deepEqual(await normalize(dirtyEvents), sanitizeFeedbackDiagnostics(dirtyEvents));
  const arbitraryEvents = sample(); arbitraryEvents.events = [{ type: 'error', age_ms: 0,
    name: {}, code: [], path: {}, line: {}, column: [], status: null }];
  assert.deepEqual((await normalize(arbitraryEvents)).events, [{ type: 'error', age_ms: 0 }]);

  const login = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  const insert = async (diagnostics, kind = 'bug', user = member) => {
    await login(member); await db.exec('set role authenticated');
    try {
      return await value('insert into public.feedback(user_id,kind,body,diagnostics) values($1,$2,$3,$4::jsonb) returning id as value',
        [user, kind, 'synthetic bug report', JSON.stringify(diagnostics)]);
    } finally { await db.exec('reset role'); }
  };
  const stored = id => value('select diagnostics as value from public.feedback where id=$1', [id]);
  await db.exec('update ojjuda_ops.feedback_codex_config set enabled=true');
  const id = await insert(malicious);
  assert.deepEqual(await stored(id), expected);
  assert.equal(await stored(await insert({ broken: true })), null);
  assert.equal(await stored(await insert(sample(), 'idea')), null);
  await assert.rejects(() => insert(sample(), 'bug', other), error => error.code === '42501');
  await login(other); await db.exec('set role authenticated');
  assert.equal(await value('select count(*)::int as value from public.feedback'), 0);
  assert.equal((await db.query('update public.feedback set diagnostics=$1::jsonb where id=$2 returning id', [JSON.stringify(sample()), id])).rows.length, 0);
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const signature of ['ojjuda_ops.sanitize_feedback_diagnostics(jsonb,text)', 'ojjuda_ops.normalize_feedback_diagnostics()',
      'ojjuda_ops.claim_feedback_ai(bigint)'])
      assert.equal(await value("select has_function_privilege($1,$2,'execute') as value", [role, signature]), false);
  }
  await db.exec('set role anon');
  assert.equal(await value('select count(*)::int as value from public.feedback'), 0);
  await db.exec('reset role');
  const state = await value('select to_json(j) as value from public.feedback_ai_jobs j where feedback_id=$1', [id]);
  const event = await value('select body as value from net.http_request_queue where id=$1', [state.dispatch_request_id]);
  assert.deepEqual(event, { action: 'dispatch', feedback_id: id, dispatch_nonce: state.dispatch_nonce });
  const payload = { feedback_id: id, dispatch_nonce: state.dispatch_nonce };
  const bridge = async (action, data) => {
    await db.exec('set role service_role');
    try { return await value('select public.feedback_codex_bridge($1,$2::jsonb) as value', [action, JSON.stringify(data)]); }
    finally { await db.exec('reset role'); }
  };
  await bridge('dispatch_claim', payload);
  await bridge('dispatch_finish', { ...payload, status: 'dispatched', run_id: '500' });
  const claimed = await bridge('worker_claim', { ...payload, run_id: '500' });
  assert.deepEqual(claimed.diagnostics, expected);
  assert.equal(claimed.feedback_id, id);
  assert.equal(claimed.body, 'synthetic bug report');
  assert.ok(claimed.lease_token);
  assert.equal(await bridge('worker_claim', { ...payload, run_id: '500' }), null);
  const requestCount = await value('select count(*)::int as value from net.http_request_queue');
  await db.query("update public.feedback set kind='idea', diagnostics=$1::jsonb where id=$2", [JSON.stringify(sample()), id]);
  assert.equal(await stored(id), null);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'), requestCount);
  await db.close();
  console.log('PASS: bounded safe diagnostics, malformed-report preservation, gateway parity, unchanged feedback RLS/grants, nonce-bound claim, and insert-only dispatch');
})().catch(error => { console.error(error.message, error.code, error.position); process.exit(1); });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const member = '00000000-0000-4000-8000-000000000001';
  const admin = '00000000-0000-4000-8000-000000000002';
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function public.is_admin() returns boolean language sql stable as $$
      select case current_setting('test.admin', true)
        when 'null' then null when 'true' then true else auth.uid() = '${admin}'::uuid end;
    $$;
    create table public.profiles(id uuid primary key, nickname text);
    insert into public.profiles values('${member}', '회원'), ('${admin}', '관리자');
    create table public.feedback(id bigint generated always as identity primary key,
      user_id uuid default auth.uid(), kind text not null, body text not null,
      screen text, app_version text, user_agent text,
      status text not null default 'open', created_at timestamptz not null default now());
    alter table public.feedback enable row level security;
    grant insert,select on public.feedback to authenticated;
    grant usage on sequence public.feedback_id_seq to authenticated;
    create policy feedback_insert on public.feedback for insert to authenticated
      with check (user_id = auth.uid());
    create policy feedback_select on public.feedback for select to authenticated
      using (user_id = auth.uid());
    insert into public.feedback(user_id,kind,body) values('${member}','bug','이전 의견 하나'),('${member}','idea','이전 의견 둘');
    create function public.admin_set_feedback(feedback_id bigint, st text)
    returns void language plpgsql security definer set search_path = public as $$
    begin
      if not public.is_admin() then raise exception 'not_admin'; end if;
      update feedback set status = st where id = feedback_id and st in ('open', 'done');
    end $$;
  `);
  const previousAck = (await db.query("select pg_get_functiondef('public.admin_set_feedback(bigint,text)'::regprocedure) as value")).rows[0].value;
  await db.exec(fs.readFileSync(path.join(__dirname,
    '../supabase/migrations/20260929082930_feedback_codex_queue.sql'), 'utf8'));
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const login = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  const reject = (fn, code) => assert.rejects(fn, error => error.code === code);
  const insert = (body = '사진을 선택하면 화면이 닫힙니다.', status = 'open') => value(`
    insert into public.feedback(user_id,kind,body,screen,app_version,user_agent,status)
    values($1,'bug',$2,'note:home','1.0','test browser',$3) returning id as value`, [member, body, status]);
  const claim = id => value('select ojjuda_ops.claim_feedback_ai($1) as value', [id]);
  const renew = job => value('select ojjuda_ops.renew_feedback_ai($1,$2) as value', [job.feedback_id, job.lease_token]);
  const finish = (job, status = 'needs_review', extra = {}) => value(`
    select ojjuda_ops.finish_feedback_ai($1,$2,$3,$4,$5,$6,$7,$8) as value`, [
    job.feedback_id, job.lease_token, status,
    Object.hasOwn(extra, 'summary') ? extra.summary : '확인한 의견',
    Object.hasOwn(extra, 'result') ? extra.result : '화면에서 재현 여부를 확인했습니다.',
    Object.hasOwn(extra, 'priority') ? extra.priority : 'normal',
    extra.evidence ?? null, extra.retry ?? null
  ]);
  const reset = () => db.exec('truncate public.feedback restart identity cascade');
  const evidence = 'https://github.com/ojjuda-note/ojjuda-note.github.io/commit/' + 'a'.repeat(40);

  // Migration and unknown IDs never sweep old feedback into the queue.
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 0);
  assert.equal(await claim(999), null);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 0);
  await reject(() => claim(null), '22023');
  await reject(() => value('select ojjuda_ops.claim_feedback_ai() as value'), '42883');
  assert.equal((await claim(2)).feedback_id, 2);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 1);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs where feedback_id=1'), 0);
  await reset();

  // Neither guests nor members can inspect jobs or invoke the privileged worker.
  const permissionId = await insert();
  assert.equal(await value("select relrowsecurity as value from pg_class where oid='public.feedback_ai_jobs'::regclass"), true);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await value('select has_table_privilege($1,$2,\'select\') as value', [role, 'public.feedback_ai_jobs']), false);
    assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, 'ojjuda_ops.claim_feedback_ai(bigint)']), false);
    assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, 'ojjuda_ops.enqueue_feedback_ai()']), false);
    assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, 'ojjuda_ops.renew_feedback_ai(bigint,uuid)']), false);
    assert.equal(await value('select has_function_privilege($1,$2,\'execute\') as value', [role, 'ojjuda_ops.finish_feedback_ai(bigint,uuid,text,text,text,text,text,timestamptz)']), false);
  }
  for (const role of ['anon', 'authenticated']) {
    await login(role === 'anon' ? '' : member);
    await db.exec(`set role ${role}`);
    await reject(() => value('select count(*) as value from public.feedback_ai_jobs'), '42501');
    await reject(() => claim(permissionId), '42501');
    await reject(() => value('select ojjuda_ops.enqueue_feedback_ai() as value'), '42501');
    await reject(() => value("select public.admin_feedback('open') as value"), '42501');
    await db.exec('reset role');
  }
  // RLS remains a second barrier even if a future migration accidentally grants SELECT.
  await claim(permissionId);
  await db.exec('grant select on public.feedback_ai_jobs to authenticated; set role authenticated');
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 0);
  await db.exec('reset role; revoke select on public.feedback_ai_jobs from authenticated');

  await login(admin);
  await db.exec('set role authenticated');
  let list = await value("select public.admin_feedback('open') as value");
  assert.equal(list[0].nickname, '회원');
  assert.equal(list[0].ai.status, 'running');
  assert.equal(Object.hasOwn(list[0].ai, 'lease_token'), false);
  await db.exec("select set_config('test.admin','null',false)");
  await reject(() => value("select public.admin_feedback('open') as value"), '42501');
  await login('');
  await db.exec("select set_config('test.admin','true',false)");
  await reject(() => value("select public.admin_feedback('open') as value"), '42501');
  await db.exec("reset role; select set_config('test.admin','',false)");
  await login(admin);
  assert.equal(await value("select pg_get_functiondef('public.admin_set_feedback(bigint,text)'::regprocedure) as value"), previousAck);

  // A member's submission queues only its own ID. Read/seen state is independent.
  await reset();
  await login(member);
  await db.exec('set role authenticated');
  const id = await insert();
  const seenId = await insert('이미 확인한 의견', 'done');
  await db.exec('begin');
  await insert('취소된 제출');
  await db.exec('rollback');
  await db.exec('reset role');
  await login(admin);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 2);
  assert.equal((await value("select public.admin_feedback('open') as value"))[0].ai.status, 'queued');
  let job = await claim(id);
  assert.equal(job.feedback_id, id);
  assert.equal(job.attempts, 1);
  assert.equal(job.screen, 'note:home');
  const seenJob = await claim(seenId);
  assert.equal(seenJob.feedback_id, seenId);
  await finish(seenJob);
  assert.equal(await claim(seenId), null);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 2);
  await value('select public.admin_set_feedback($1,\'done\') as value', [id]);
  const rawText = '<img src=x onerror=alert(1)> & 사용자 입력';
  await finish(job, 'needs_review', {summary: rawText, result: rawText});
  list = await value("select public.admin_feedback('done') as value");
  assert.equal(list.find(row => row.id === id).ai.summary, rawText);
  assert.equal(list.find(row => row.id === id).status, 'done');
  assert.equal(await claim(id), null);

  // Duplicate events claim only once; a target ID cannot consume another submission.
  await reset();
  const ids = await Promise.all([insert('첫 의견'), insert('둘째 의견'), insert('셋째 의견')]);
  const duplicateClaims = await Promise.all([claim(ids[2]), claim(ids[2]), claim(ids[2])]);
  assert.equal(duplicateClaims.filter(Boolean).length, 1);
  assert.equal(duplicateClaims.find(Boolean).feedback_id, ids[2]);
  assert.equal(await value("select count(*)::int as value from public.feedback_ai_jobs where status='queued'"), 2);
  const jobs = [await claim(ids[0]), await claim(ids[1]), duplicateClaims.find(Boolean)];
  assert.equal(new Set(jobs.map(item => item.feedback_id)).size, 3);
  assert.equal(new Set(jobs.map(item => item.lease_token)).size, 3);
  assert.equal(await claim(ids[0]), null);
  assert.equal(await renew(jobs[0]), true);
  await finish(jobs[0], 'blocked');
  await finish(jobs[1], 'needs_review');
  await finish(jobs[2], 'resolved', {evidence});
  for (const feedbackId of ids) assert.equal(await claim(feedbackId), null);
  assert.equal(await value("select count(*)::int as value from public.feedback where status='open'"), 3);
  await reject(() => finish(jobs[2], 'resolved', {evidence}), '55000');

  // Expired leases rotate tokens; three interrupted attempts stop automatically.
  await reset();
  const expiredId = await insert();
  job = await claim(expiredId);
  for (let attempt = 2; attempt <= 3; attempt++) {
    await db.query("update public.feedback_ai_jobs set claimed_at=clock_timestamp()-interval '121 minutes' where feedback_id=$1", [job.feedback_id]);
    assert.equal(await renew(job), false);
    await reject(() => finish(job), '55000');
    const next = await claim(expiredId);
    assert.equal(next.feedback_id, job.feedback_id);
    assert.equal(next.attempts, attempt);
    assert.notEqual(next.lease_token, job.lease_token);
    await reject(() => finish(job), '55000');
    assert.equal(await renew(job), false);
    job = next;
  }
  const unrelatedId = await insert('다른 제출의 만료된 작업');
  await claim(unrelatedId);
  await db.exec("update public.feedback_ai_jobs set attempts=3, claimed_at=clock_timestamp()-interval '121 minutes'");
  assert.equal(await claim(expiredId), null);
  assert.equal(await value('select status as value from public.feedback_ai_jobs where feedback_id=$1', [expiredId]), 'blocked');
  assert.equal(await value('select retry_after as value from public.feedback_ai_jobs where feedback_id=$1', [expiredId]), null);
  assert.equal(await value('select status as value from public.feedback_ai_jobs where feedback_id=$1', [unrelatedId]), 'running');
  await reject(() => finish(job), '55000');

  // Retry time is eligibility only: reprocessing still requires a call with that ID.
  await reset();
  const retryId = await insert();
  job = await claim(retryId);
  await finish(job, 'blocked', {retry: '2099-01-01T00:00:00Z'});
  assert.equal(await claim(retryId), null);
  await db.exec("update public.feedback_ai_jobs set retry_after=clock_timestamp()-interval '1 second'");
  assert.equal(await claim(999), null);
  assert.equal(await value('select status as value from public.feedback_ai_jobs'), 'blocked');
  job = await claim(retryId);
  assert.equal(job.attempts, 2);
  await finish(job, 'blocked', {retry: '2099-01-01T00:00:00Z'});
  await db.exec("update public.feedback_ai_jobs set retry_after=clock_timestamp()-interval '1 second'");
  job = await claim(retryId);
  assert.equal(job.attempts, 3);
  await finish(job, 'blocked', {retry: '2099-01-01T00:00:00Z'});
  assert.equal(await value('select retry_after as value from public.feedback_ai_jobs'), null);
  assert.equal(await claim(retryId), null);

  // Invalid results cannot consume a lease or inject untrusted evidence links.
  await reset();
  job = await claim(await insert());
  for (const status of [null, '', 'queued', 'running', 'done', 'invalid']) {
    await reject(() => finish(job, status), '22023');
  }
  for (const extra of [
    {priority: null}, {priority: 'urgent'}, {summary: null}, {summary: '  '},
    {summary: 'x'.repeat(1201)}, {result: ''}, {result: 'x'.repeat(12001)},
    {evidence: 'javascript:alert(1)'}, {evidence: evidence + '?redirect=evil'},
    {evidence: evidence + '\n'}, {evidence: evidence.replace('ojjuda-note/', 'other/')},
    {retry: '2099-01-01T00:00:00Z'}
  ]) await reject(() => finish(job, 'needs_review', extra), '22023');
  await reject(() => finish(job, 'resolved'), '22023');
  await reject(() => finish(job, 'resolved', {evidence: 'https://github.com/ojjuda-note/ojjuda-note.github.io/pull/1'}), '22023');
  await reject(() => finish(job, 'resolved', {evidence: 'https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/1'}), '22023');
  await reject(() => finish(job, 'blocked', {retry: '2000-01-01T00:00:00Z'}), '22023');
  await reject(() => finish(job, 'blocked', {retry: 'infinity'}), '22023');
  await reject(() => finish({...job, lease_token: '00000000-0000-4000-8000-000000000099'}), '55000');
  assert.equal(await value('select status as value from public.feedback_ai_jobs'), 'running');
  await finish(job, 'resolved', {evidence, priority: 'high'});
  assert.equal(await value('select status as value from public.feedback'), 'open');
  for (const suffix of ['pull/1', 'actions/runs/1']) {
    await finish(await claim(await insert()), 'needs_review', {
      evidence: 'https://github.com/ojjuda-note/ojjuda-note.github.io/' + suffix
    });
  }
  await db.exec('delete from public.feedback');
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'), 0);
  await db.close();
  console.log('PASS: submission-only queue, required target ID, no scanning, admin-only results, duplicate event claims, stale lease rejection, bounded retries, validated evidence and independent acknowledgement');
})().catch(error => { console.error(error.message, error.code, error.position); process.exit(1); });

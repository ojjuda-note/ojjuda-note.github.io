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
    create schema auth; create schema net; create schema extensions;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema net to public;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create function public.is_admin() returns boolean language sql stable as $$
      select auth.uid() = '${admin}'::uuid;
    $$;
    create table public.profiles(id uuid primary key, nickname text);
    insert into public.profiles values('${member}','회원'),('${admin}','관리자');
    create table public.feedback(id bigint generated always as identity primary key,
      user_id uuid default auth.uid(),kind text not null,body text not null,
      screen text,app_version text,user_agent text,status text not null default 'open',
      created_at timestamptz not null default now());
    alter table public.feedback enable row level security;
    grant insert,select on public.feedback to authenticated;
    grant usage on sequence public.feedback_id_seq to authenticated;
    create policy feedback_insert on public.feedback for insert to authenticated with check(user_id=auth.uid());
    create policy feedback_select on public.feedback for select to authenticated using(user_id=auth.uid());
    create table net.http_request_queue(id bigint generated always as identity primary key,url text,body jsonb,headers jsonb);
    create table net._http_response(id bigint);
    grant all on net.http_request_queue,net._http_response to anon,authenticated;
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',
      headers jsonb default '{"Content-Type":"application/json"}',timeout_milliseconds int default 2000)
      returns bigint language plpgsql security definer set search_path='' as $$
    declare request_id bigint;
    begin
      if current_setting('test.net_fail',true)='true' then
        raise exception 'secret-that-must-never-be-stored';
      end if;
      insert into net.http_request_queue(url,body,headers) values(url,body,headers) returning id into request_id;
      return request_id;
    end $$;
  `);
  const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
  await db.exec(migration('20260929082930_feedback_codex_queue.sql'));
  const dispatchSql = migration('20260929085320_feedback_codex_dispatch.sql');
  const extension = 'create extension if not exists pg_net with schema extensions;';
  assert.equal(dispatchSql.split(extension).length, 2);
  const quotaClock = "(clock_timestamp() at time zone 'Asia/Seoul')::date";
  assert.equal(dispatchSql.split(quotaClock).length, 2);
  // The production migration has no caller-controlled clock. This test-only
  // substitution makes midnight exact; PGlite also uses the transactional net stub.
  await db.exec(dispatchSql.replace(extension, '').replace(quotaClock,
    "(coalesce(nullif(current_setting('test.dispatch_now', true), '')::timestamptz, clock_timestamp()) at time zone 'Asia/Seoul')::date"));
  const value = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const reject = (fn,code) => assert.rejects(fn,error=>error.code===code);
  const login = id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const insert = async (body, user=member) => {
    await login(user); await db.exec('set role authenticated');
    try { return await value("insert into public.feedback(kind,body,screen) values('bug',$1,'note:home') returning id as value",[body]); }
    finally { await db.exec('reset role'); }
  };
  const job = id => value('select to_json(j) as value from public.feedback_ai_jobs j where feedback_id=$1',[id]);
  const payload = state => ({feedback_id: state.feedback_id,dispatch_nonce:state.dispatch_nonce});
  const quotaError='오늘 자동처리 한도에 도달했습니다. 의견은 정상적으로 저장되었으며 관리자가 확인할 수 있습니다.';
  const setDispatchClock = instant => db.query("select set_config('test.dispatch_now',$1,false)",[instant]);
  const usage = async () => ({
    global:(await db.query('select usage_day::text,dispatch_count from ojjuda_ops.feedback_codex_daily_usage order by usage_day')).rows,
    users:(await db.query('select usage_day::text,user_id,dispatch_count from ojjuda_ops.feedback_codex_user_daily_usage order by usage_day,user_id')).rows
  });
  await setDispatchClock('2026-09-29T00:00:00Z');
  const bridge = async (action,data) => {
    await db.exec('set role service_role');
    try { return await value('select public.feedback_codex_bridge($1,$2::jsonb) as value',[action,JSON.stringify(data)]); }
    finally { await db.exec('reset role'); }
  };
  const complete = (state,lease,extra={}) => bridge('worker_finish',{
    ...payload(state),run_id:state.dispatch_run_id,lease_token:lease,
    status:'needs_review',summary:'수정안 검증',result:'비공개 실행기에서 수정안을 검증했습니다.',priority:'normal',
    evidence_url:'https://github.com/ojjuda-note/ojjuda-codex-worker/actions/runs/'+state.dispatch_run_id,...extra
  });

  // Disabled by default; no outbound activity, no historical scan, and no exposed nonce.
  assert.equal(await value('select enabled as value from ojjuda_ops.feedback_codex_config'),false);
  assert.equal(await value('select per_user_daily_limit as value from ojjuda_ops.feedback_codex_config'),10);
  assert.equal(await value('select global_daily_limit as value from ojjuda_ops.feedback_codex_config'),100);
  const disabledId=await insert('아직 연결 전 의견');
  assert.equal((await job(disabledId)).dispatch_status,'pending');
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),0);
  assert.deepEqual(await usage(),{global:[],users:[]});
  for (const table of ['feedback_codex_config','feedback_codex_daily_usage','feedback_codex_user_daily_usage']) {
    assert.equal(await value('select relrowsecurity as value from pg_class where oid=$1::regclass',['ojjuda_ops.'+table]),true);
    for (const role of ['anon','authenticated','service_role']) {
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])
        assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,'ojjuda_ops.'+table,privilege]),false);
      await db.exec(`set role ${role}`);
      await reject(()=>value('select count(*) as value from ojjuda_ops.'+table),'42501');
      await db.exec('reset role');
    }
  }
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await reject(()=>value("select public.feedback_codex_bridge('dispatch_claim','{}') as value"),'42501');
    await reject(()=>value('select count(*) as value from public.feedback_ai_jobs'),'42501');
    await reject(()=>value('select count(*) as value from net.http_request_queue'),'42501');
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await reject(()=>value('select count(*) as value from public.feedback_ai_jobs'),'42501');
  await db.exec('reset role');

  await db.exec('update ojjuda_ops.feedback_codex_config set enabled=true');
  const id=await insert('사진을 열면 닫히는 문제');
  let state=await job(id);
  assert.equal(state.status,'queued');
  assert.equal(state.dispatch_status,'pending');
  assert.ok(state.dispatch_request_id);
  const event=await value('select to_json(q) as value from net.http_request_queue q where id=$1',[state.dispatch_request_id]);
  assert.equal(event.url,'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/feedback-codex');
  assert.deepEqual(event.body,{action:'dispatch',...payload(state)});
  assert.equal(Object.keys(event.body).length,3);
  assert.deepEqual(await usage(),{
    global:[{usage_day:'2026-09-29',dispatch_count:1}],
    users:[{usage_day:'2026-09-29',user_id:member,dispatch_count:1}]
  });
  assert.equal(await bridge('dispatch_claim',payload(await job(disabledId))),null);
  // The opinion and HTTP enqueue roll back together; pg_net delivers after commit.
  const before=await value('select count(*)::int as value from net.http_request_queue');
  const usageBefore=await usage();
  await db.exec('begin'); await insert('롤백할 의견'); await db.exec('rollback');
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),before);
  assert.equal(await value('select count(*)::int as value from public.feedback_ai_jobs'),2);
  assert.deepEqual(await usage(),usageBefore);
  assert.equal((await job(disabledId)).dispatch_request_id,null);
  await db.exec("select set_config('test.net_fail','true',false)");
  const failedId=await insert('외부 실행 오류가 나도 접수 보존');
  await db.exec("select set_config('test.net_fail','false',false)");
  const failed=await job(failedId);
  assert.equal(failed.status,'queued'); assert.equal(failed.dispatch_status,'failed');
  assert.ok(failed.dispatch_error); assert.ok(!failed.dispatch_error.includes('secret'));
  assert.equal(await value('select count(*)::int as value from public.feedback where id=$1',[failedId]),1);
  assert.deepEqual(await usage(),usageBefore);
  assert.equal(await bridge('dispatch_claim',payload(failed)),null);

  // Failure after net.http_post and the global increment also rolls everything
  // outbound back, while preserving the original opinion and its failed job.
  await db.exec('alter table ojjuda_ops.feedback_codex_user_daily_usage add constraint test_usage_write_fail check(dispatch_count < 2) not valid');
  const counterFailId=await insert('사용량 갱신 실패에도 의견 저장');
  await db.exec('alter table ojjuda_ops.feedback_codex_user_daily_usage drop constraint test_usage_write_fail');
  assert.equal((await job(counterFailId)).dispatch_status,'failed');
  assert.equal((await job(counterFailId)).dispatch_request_id,null);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),before);
  assert.deepEqual(await usage(),usageBefore);
  assert.equal(await value('select count(*)::int as value from public.feedback where id=$1',[counterFailId]),1);

  const nullUserId=await value("insert into public.feedback(user_id,kind,body) values(null,'bug','회원 정보 없는 서버 제출') returning id as value");
  const nullUserJob=await job(nullUserId);
  assert.equal(nullUserJob.dispatch_status,'failed');
  assert.equal(nullUserJob.dispatch_request_id,null);
  assert.match(nullUserJob.dispatch_error,/회원 정보/);
  assert.equal(await bridge('dispatch_claim',payload(nullUserJob)),null);
  assert.deepEqual(await usage(),usageBefore);

  await login(admin); await db.exec('set role authenticated');
  const publicResults=await value("select public.admin_feedback('open') as value");
  assert.equal(publicResults.find(row=>row.id===failedId).ai.dispatch_status,'failed');
  for (const row of publicResults) {
    for (const field of ['dispatch_nonce','dispatch_request_id','dispatch_run_id','worker_run_id','lease_token'])
      assert.equal(Object.hasOwn(row.ai,field),false);
  }
  await db.exec('reset role');

  // Wrong nonces and unknown IDs cannot dispatch, claim, renew, or complete.
  const wrong={...payload(state),dispatch_nonce:'00000000-0000-4000-8000-000000000099'};
  for (const action of ['dispatch_claim','dispatch_finish','worker_claim','worker_renew','worker_finish'])
    assert.equal(await bridge(action,wrong),null);
  await reject(()=>bridge('unknown',payload(state)),'22023');
  await reject(()=>bridge('dispatch_claim',{...payload(state),feedback_id:'1; select 1'}),'22023');
  assert.deepEqual(await bridge('dispatch_claim',payload(state)),payload(state));
  assert.equal(await bridge('dispatch_claim',payload(state)),null);
  assert.equal(await bridge('worker_claim',{...payload(state),run_id:'100'}),null);
  await reject(()=>bridge('dispatch_finish',{...payload(state),status:'dispatched'}),'22023');
  assert.deepEqual(await bridge('dispatch_finish',{...payload(state),status:'dispatched',run_id:'100'}),{feedback_id:id,dispatch_status:'dispatched'});
  assert.equal(await bridge('dispatch_finish',{...payload(state),status:'failed',error_code:'github_rejected'}),null);
  state=await job(id);
  assert.equal(state.dispatch_run_id,'100');
  assert.equal(await bridge('worker_claim',{...payload(state),run_id:'101'}),null);
  const claimed=await bridge('worker_claim',{...payload(state),run_id:'100'});
  assert.equal(claimed.body,'사진을 열면 닫히는 문제');
  assert.equal(claimed.run_id,'100'); assert.ok(claimed.lease_token);
  assert.equal(await bridge('worker_claim',{...payload(state),run_id:'100'}),null);
  assert.equal((await job(id)).attempts,1);
  assert.equal(await bridge('worker_renew',{...payload(state),run_id:'100',lease_token:claimed.lease_token}),true);
  assert.equal(await complete(state,claimed.lease_token,{run_id:'101'}),null);
  assert.equal(await complete(state,'00000000-0000-4000-8000-000000000099'),null);
  await reject(()=>complete(state,claimed.lease_token,{evidence_url:'https://github.com/ojjuda-note/ojjuda-codex-worker/actions/runs/101'}),'22023');
  await reject(()=>complete(state,claimed.lease_token,{status:'resolved'}),'22023');
  await reject(()=>complete(state,claimed.lease_token,{status:'resolved',evidence_url:'https://github.com/ojjuda-note/ojjuda-note.github.io/pull/1'}),'22023');
  assert.equal((await complete(state,claimed.lease_token)).status,'needs_review');
  assert.equal(await complete(state,claimed.lease_token),null);
  assert.equal(await value('select status as value from public.feedback where id=$1',[id]),'open');

  // A run cannot bind to another opinion; dispatch errors are fixed messages only.
  const secondId=await insert('다른 제출'); const second=await job(secondId);
  await bridge('dispatch_claim',payload(second));
  assert.equal(await bridge('dispatch_finish',{...payload(second),status:'dispatched',run_id:'100'}),null);
  await bridge('dispatch_finish',{...payload(second),status:'failed',error_code:'raw-api-key-is-not-a-message'});
  assert.equal((await job(secondId)).dispatch_status,'failed');
  assert.ok(!(await job(secondId)).dispatch_error.includes('api-key'));
  assert.equal((await job(secondId)).status,'queued');
  assert.equal(await bridge('dispatch_claim',payload(second)),null);

  // The service bridge preserves the current lease expiry boundary.
  const expiredId=await insert('만료 확인'); const expired=await job(expiredId);
  await bridge('dispatch_claim',payload(expired));
  await bridge('dispatch_finish',{...payload(expired),status:'dispatched',run_id:'200'});
  const expClaim=await bridge('worker_claim',{...payload(expired),run_id:'200'});
  await db.query("update public.feedback_ai_jobs set claimed_at=clock_timestamp()-interval '121 minutes' where feedback_id=$1",[expiredId]);
  assert.equal(await bridge('worker_renew',{...payload(expired),run_id:'200',lease_token:expClaim.lease_token}),false);
  await reject(()=>complete({...expired,dispatch_run_id:'200'},expClaim.lease_token),'55000');

  // PGlite has one backend, so overlapping client calls exercise dispatch
  // pressure and multi-row handling, not an independent-backend lock scheduler.
  // The migration's fixed config FOR UPDATE lock provides cross-session ordering.
  const resetUsage = () => db.exec('truncate ojjuda_ops.feedback_codex_daily_usage,ojjuda_ops.feedback_codex_user_daily_usage,net.http_request_queue');
  await resetUsage();
  await login(member); await db.exec('set role authenticated');
  let concurrent;
  try {
    concurrent=await Promise.allSettled(Array.from({length:14},(_,i)=>
      value("insert into public.feedback(kind,body) values('bug',$1) returning id as value",['동시 한도 제출 '+i])));
  } finally { await db.exec('reset role'); }
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,14);
  const concurrentJobs=await Promise.all(concurrent.map(result=>job(result.value)));
  assert.equal(concurrentJobs.filter(row=>row.dispatch_request_id!==null).length,10);
  assert.equal(concurrentJobs.filter(row=>row.dispatch_status==='failed').length,4);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),10);
  for (const row of concurrentJobs.filter(row=>row.dispatch_status==='failed')) {
    assert.equal(row.status,'queued'); assert.equal(row.dispatch_error,quotaError);
    assert.equal(await bridge('dispatch_claim',payload(row)),null);
  }
  assert.deepEqual(await usage(),{
    global:[{usage_day:'2026-09-29',dispatch_count:10}],
    users:[{usage_day:'2026-09-29',user_id:member,dispatch_count:10}]
  });
  const otherMemberId=await insert('다른 회원의 한도는 독립',admin);
  assert.ok((await job(otherMemberId)).dispatch_request_id);

  // Client timestamps, deleting feedback and disabled submissions cannot reset
  // quota. All opinions, including the ones over quota, remain insertable.
  await login(member); await db.exec('set role authenticated');
  const spoofedDateId=await value("insert into public.feedback(kind,body,created_at) values('bug','사용자 지정 과거 시각','2000-01-01T00:00:00Z') returning id as value");
  await db.exec('reset role');
  assert.equal((await job(spoofedDateId)).dispatch_error,quotaError);
  await db.query('delete from public.feedback where id=any($1::bigint[])',[concurrent.map(result=>result.value)]);
  const afterDeleteId=await insert('삭제로 자동처리 한도를 돌려받을 수 없음');
  assert.equal((await job(afterDeleteId)).dispatch_error,quotaError);
  const beforeDisabled=await usage();
  await db.exec('update ojjuda_ops.feedback_codex_config set enabled=false');
  const quotaDisabledId=await insert('한도 이후 비활성 제출');
  assert.equal((await job(quotaDisabledId)).dispatch_status,'pending');
  assert.deepEqual(await usage(),beforeDisabled);
  await db.exec('update ojjuda_ops.feedback_codex_config set enabled=true');
  assert.equal(await bridge('dispatch_claim',payload(await job(quotaDisabledId))),null);

  // The default global 100 cap also covers distinct members and bulk REST-style
  // inserts. The 101st through 110th opinions are saved without HTTP requests.
  await resetUsage();
  const globalIds=[];
  for (let index=0;index<11;index++) {
    const user='00000000-0000-4000-8000-'+String(100+index).padStart(12,'0');
    await db.query('insert into public.profiles values($1,$2)',[user,'한도 회원 '+index]);
    await login(user); await db.exec('set role authenticated');
    try {
      const rows=await db.query("insert into public.feedback(kind,body) select 'bug','전역 한도 '||i from generate_series(1,10) i returning id");
      globalIds.push(...rows.rows.map(row=>row.id));
    } finally { await db.exec('reset role'); }
  }
  const globalJobs=await Promise.all(globalIds.map(job));
  assert.equal(globalJobs.length,110);
  assert.equal(globalJobs.filter(row=>row.dispatch_request_id!==null).length,100);
  assert.equal(globalJobs.filter(row=>row.dispatch_error===quotaError).length,10);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),100);
  assert.equal((await usage()).global[0].dispatch_count,100);
  assert.equal((await usage()).users.length,10);
  const globalHeld=globalJobs.find(row=>row.dispatch_status==='failed');
  assert.equal(await bridge('dispatch_claim',payload(globalHeld)),null);

  // Calendar KST midnight, not UTC midnight, transaction start, session zone or
  // the supplied feedback timestamp, starts a new quota bucket without a timer.
  await resetUsage();
  await db.exec("update ojjuda_ops.feedback_codex_config set per_user_daily_limit=1,global_daily_limit=2; set timezone='Pacific/Honolulu'");
  await setDispatchClock('2026-09-29T14:59:59.999999Z');
  const beforeMidnightId=await insert('한국 자정 직전');
  assert.ok((await job(beforeMidnightId)).dispatch_request_id);
  assert.equal((await job(await insert('한국 자정 직전 추가'))).dispatch_error,quotaError);
  await db.exec('begin');
  await setDispatchClock('2026-09-29T15:00:00Z');
  const afterMidnightId=await insert('같은 UTC 날짜의 한국 자정');
  await db.exec('commit');
  assert.ok((await job(afterMidnightId)).dispatch_request_id);
  await db.exec("set timezone='Pacific/Kiritimati'");
  assert.equal((await job(await insert('연결 시간대 변경 불가'))).dispatch_error,quotaError);
  assert.deepEqual((await usage()).global,[
    {usage_day:'2026-09-29',dispatch_count:1},
    {usage_day:'2026-09-30',dispatch_count:1}
  ]);
  assert.ok((await job(await insert('새 한국 날짜 다른 회원',admin))).dispatch_request_id);
  assert.equal((await usage()).global[1].dispatch_count,2);
  assert.equal((await job(await insert('새 한국 날짜 한도 초과',admin))).dispatch_error,quotaError);

  // First reservation of a new day is fully refundable on transaction rollback.
  const beforeDayRollback=await usage();
  const beforeDayRequests=await value('select count(*)::int as value from net.http_request_queue');
  await setDispatchClock('2026-09-30T15:00:00Z');
  await db.exec('begin');
  const rolledBackDayId=await insert('새 날짜 롤백');
  await db.exec('rollback');
  assert.equal(await job(rolledBackDayId),undefined);
  assert.deepEqual(await usage(),beforeDayRollback);
  assert.equal(await value('select count(*)::int as value from net.http_request_queue'),beforeDayRequests);
  assert.ok((await job(await insert('롤백 후 남은 한도'))).dispatch_request_id);
  await db.exec('update ojjuda_ops.feedback_codex_config set per_user_daily_limit=0');
  assert.equal((await job(await insert('회원 자동처리 한도 0',admin))).dispatch_error,quotaError);
  await db.exec('update ojjuda_ops.feedback_codex_config set per_user_daily_limit=10,global_daily_limit=0');
  assert.equal((await job(await insert('전체 자동처리 한도 0',admin))).dispatch_error,quotaError);
  await db.close();
  console.log('PASS: dispatch and lease contracts, private default-off config, per-member/global KST daily quotas, overlapping/bulk submissions, failure/rollback preservation, no timestamp/deletion bypass, reserved-event-only dispatch');
})().catch(error=>{console.error(error.message,error.code,error.position);process.exit(1);});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';

const ADMIN = 'f1c1b4a0-7c2f-4d45-897c-6c34acb62001';
const MESSAGE = '08ef9d48-ef85-49f0-94e8-860460923302';
const WHEN = '2026-11-09T14:30:00.000Z';
const env = name => ({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  OPENAI_API_KEY: 'sk-test-only-not-real'
})[name];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function request({ origin = 'https://ojjuda.kr', token = 'member-session', body = { message_id: MESSAGE } } = {}) {
  return new Request('https://project.supabase.co/functions/v1/ai-meeting', {
    method: 'POST', headers: { origin, authorization: `Bearer ${token}`,
      'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

function setup({
  admin = true, existing = false, reply = null, intent = 'none', target = 'quality', tasks = [], taskStatus = 200,
  content = '로그인 오류를 살펴보자', historyRows = [], existingTask = null, lookupStatus = 200,
  createStatus = 200, createError = 'service_unavailable', loseCreateResponse = false,
  persistBeforeLoss = true, failReplyWriteOnce = false, throwReplyWrite = false, conflictTask = null,
  missingAiKey = false, createdAt = WHEN
} = {}) {
  const calls = [];
  let storedTask = existingTask, failedWrite = false;
  const modelReply = reply || { execution: intent, replies: [{ role: 'quality', text: '로그인 오류부터 재현하겠습니다.' }] };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return json({ id: ADMIN, is_anonymous: false });
    if (url.includes('/rest/v1/app_admins')) return json(admin ? [{ user_id: ADMIN }] : []);
    if (url.includes('/rest/v1/ai_meeting_messages?select=id,room')) {
      return json([{ id: MESSAGE, room: 'hq', created_by: ADMIN, sender_kind: 'human',
        sender_role: 'representative', reply_to: null, target_role: target, content, created_at: createdAt }]);
    }
    if (url.includes('reply_to=eq.')) return json(existing ? [{ id: MESSAGE }] : []);
    if (url.includes('sender_kind=eq.human')) return json([{ id: MESSAGE }]);
    if (url.endsWith('/rest/v1/rpc/admin_ai_meeting_task')) return json(storedTask, lookupStatus);
    if (url.endsWith('/rest/v1/rpc/admin_ai_meeting_create_task')) {
      const kind = JSON.parse(options.body).p_kind;
      const task = { message_id: MESSAGE, feedback_id: 42, kind, content,
        status: 'queued', dispatch_status: 'pending', created_at: WHEN };
      if (conflictTask) { storedTask = conflictTask; return json({ message: 'task_kind_conflict' }, 400); }
      if (loseCreateResponse) {
        if (persistBeforeLoss) storedTask = task;
        throw new Error('connection_closed_after_submit');
      }
      if (createStatus !== 200) return json({ message: createError }, createStatus);
      storedTask = task;
      return json(task);
    }
    if (url.endsWith('/rest/v1/rpc/admin_ai_meeting_tasks')) return json(tasks, taskStatus);
    if (url.includes('order=created_at.desc')) {
      return json(historyRows);
    }
    if (url === 'https://api.openai.com/v1/responses') {
      return json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(modelReply) }] }] });
    }
    if (url.endsWith('/rest/v1/ai_meeting_messages') && options.method === 'POST') {
      if (failReplyWriteOnce && !failedWrite) {
        failedWrite = true;
        if (throwReplyWrite) throw new Error('connection_closed_during_reply');
        return json({ error: 'write_failed' }, 503);
      }
      return json(JSON.parse(options.body));
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  return { calls, handler: createHandler({
    env: name => missingAiKey && name === 'OPENAI_API_KEY' ? undefined : env(name),
    fetchImpl, now: () => Date.parse(WHEN) + 1500
  }), task: () => storedTask };
}

test('blocks requests without a bearer token', async () => {
  const { handler, calls } = setup();
  const result = await handler(new Request('https://project.supabase.co/functions/v1/ai-meeting', {
    method: 'POST', headers: { origin: 'https://ojjuda.kr' }, body: JSON.stringify({ message_id: MESSAGE })
  }));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test('rejects disallowed origins before reading messages', async () => {
  const { handler, calls } = setup();
  const result = await handler(request({ origin: 'https://other.example' }));
  assert.equal(result.status, 403);
  assert.equal(calls.length, 0);
});

test('non-admins cannot call the AI', async () => {
  const { handler, calls } = setup({ admin: false });
  const result = await handler(request());
  assert.equal(result.status, 403);
  assert.equal(calls.filter(item => item.url.includes('api.openai.com')).length, 0);
});

test('already answered messages do not trigger another API call', async () => {
  const { handler, calls } = setup({ existing: true });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).already_answered, true);
  assert.equal(calls.filter(item => item.url.includes('api.openai.com')).length, 0);
});

test('verified AI reply is saved under the selected role', async () => {
  const { handler, calls } = setup();
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).replies, 1);
  const openai = calls.find(item => item.url === 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(openai.options.body).store, false);
  const insert = calls.find(item => item.url.endsWith('/rest/v1/ai_meeting_messages') && item.options.method === 'POST');
  const [saved] = JSON.parse(insert.options.body);
  assert.equal(saved.sender_kind, 'ai');
  assert.equal(saved.sender_role, 'quality');
  assert.equal(saved.reply_to, MESSAGE);
});

test('rejects an AI role that was not requested', async () => {
  const { handler, calls } = setup({ reply: { execution: 'none', replies: [{ role: 'marketing', text: '광고를 집행했습니다.' }] } });
  const result = await handler(request());
  assert.equal(result.status, 502);
  assert.equal(calls.some(item => item.options.method === 'POST' && item.url.endsWith('ai_meeting_messages')), false);
});

test('whole-team meeting requires director and another specialist', async () => {
  const { handler } = setup({ target: 'all', reply: { execution: 'none', replies: [
    { role: 'director', text: '우선 품질 문제를 점검하겠습니다.' },
    { role: 'quality', text: '오류 재현부터 진행하겠습니다.' }
  ] } });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).replies, 2);
});

test('missing server-side AI key reports configuration status without exposing a secret', async () => {
  const { handler } = setup({ missingAiKey: true });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, 'ai_not_configured');
});

test('AI receives actual task status and evidence without dispatch credentials', async () => {
  const evidence = 'https://github.com/ojjuda-note/ojjuda-note.github.io/commit/' + 'a'.repeat(40);
  const { handler, calls } = setup({ tasks: [{
    feedback_id: 12, content: '로그인 오류 수정', status: 'resolved', dispatch_status: 'dispatched',
    summary: '수정과 배포 검증 완료', result: '가입 흐름 정상', evidence_url: evidence,
    dispatch_nonce: 'never-send-nonce', lease_token: 'never-send-lease', requested_by: 'private-actor'
  }] });
  assert.equal((await handler(request())).status, 200);
  const taskRead = calls.find(item => item.url.endsWith('/rest/v1/rpc/admin_ai_meeting_tasks'));
  assert.equal(taskRead.options.headers.Authorization, 'Bearer member-session');
  assert.deepEqual(JSON.parse(taskRead.options.body), { p_limit: 5 });
  const payload = JSON.parse(calls.find(item => item.url === 'https://api.openai.com/v1/responses').options.body);
  assert.match(payload.input, /"verified":true/);
  assert.match(payload.input, /"status":"resolved"/);
  assert.ok(payload.input.includes(evidence));
  assert.doesNotMatch(payload.input, /never-send|private-actor|dispatch_nonce|lease_token/);
  assert.match(payload.instructions, /dispatched.*완료가 아니다/);
  assert.equal(payload.tools, undefined);
  assert.equal(calls.some(item => item.url.includes('create_task') || item.url.includes('feedback-codex')), false);
});

test('failed task lookup preserves chat and explicitly marks execution state unavailable', async () => {
  const { handler, calls } = setup({ taskStatus: 503, tasks: { error: 'unavailable' } });
  assert.equal((await handler(request())).status, 200);
  const payload = JSON.parse(calls.find(item => item.url === 'https://api.openai.com/v1/responses').options.body);
  assert.match(payload.input, /"verified":false,"tasks":\[\]/);
  assert.match(payload.instructions, /현재 작업 상태를 확인하지 못했다고/);
});

test('unrecognized task states and external evidence links cannot become verified completion evidence', async () => {
  const { handler, calls } = setup({ tasks: [{
    feedback_id: 13, content: 'x'.repeat(2000), status: 'completed', dispatch_status: 'done',
    evidence_url: 'https://example.invalid/pretend-success', summary: 'y'.repeat(2000)
  }] });
  assert.equal((await handler(request())).status, 200);
  const payload = JSON.parse(calls.find(item => item.url === 'https://api.openai.com/v1/responses').options.body);
  assert.match(payload.input, /"status":"unknown"/);
  assert.match(payload.input, /"evidence_url":null/);
  assert.doesNotMatch(payload.input, /example\.invalid/);
  assert.ok(!payload.input.includes('x'.repeat(501)));
  assert.ok(!payload.input.includes('y'.repeat(501)));
});

test('a new bug instruction is automatically submitted before any AI reply is saved', async () => {
  const { handler, calls } = setup({ intent: 'bug', content: '로그인 버튼 오류를 고쳐줘.' });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).execution.status, 'submitted');
  const createIndex = calls.findIndex(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task'));
  const writeIndex = calls.findIndex(item => item.url.endsWith('/rest/v1/ai_meeting_messages'));
  assert.ok(createIndex >= 0 && createIndex < writeIndex);
  assert.deepEqual(JSON.parse(calls[createIndex].options.body), { p_message_id: MESSAGE, p_kind: 'bug' });
  assert.equal(calls[createIndex].options.headers.Authorization, 'Bearer member-session');
  assert.match(JSON.parse(calls[writeIndex].options.body)[0].content, /자동으로 접수/);
});

test('an improvement directive uses the same automatic pipeline without a browser approval flag', async () => {
  const { handler, calls } = setup({ intent: 'idea', content: '관리자 화면에 검색 기능 추가해줘.' });
  assert.equal((await handler(request())).status, 200);
  const submitted = calls.find(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task'));
  assert.deepEqual(JSON.parse(submitted.options.body), { p_message_id: MESSAGE, p_kind: 'idea' });
});

test('dialogue never creates work even if a caller adds an execute flag', async () => {
  const { handler, calls } = setup({ content: '어떤 방식으로 고칠 수 있어?', intent: 'none' });
  const result = await handler(request({ body: { message_id: MESSAGE, execute: true, kind: 'bug' } }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).execution.status, 'none');
  assert.equal(calls.some(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')), false);
});

test('missing or unsupported execution decisions cannot cause side effects', async () => {
  for (const execution of [undefined, 'send_email', { kind: 'bug' }]) {
    const { handler, calls } = setup({ reply: { execution, replies: [{ role: 'quality', text: '처리하겠습니다.' }] } });
    assert.equal((await handler(request())).status, 502);
    assert.equal(calls.some(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')), false);
    assert.equal(calls.some(item => item.url.endsWith('/rest/v1/ai_meeting_messages')), false);
  }
});

test('the model gets the exact current request and only this authors earlier context', async () => {
  const before = '2026-11-09T14:29:00.000Z';
  const { handler, calls } = setup({ content: '그대로 해줘', intent: 'idea', historyRows: [
    { id: '0aef9d48-ef85-49f0-94e8-860460923301', created_by: ADMIN, created_at: '2026-11-09T14:31:00.000Z', sender_kind: 'human', content: 'future-instruction-secret' },
    { id: '01ef9d48-ef85-49f0-94e8-860460923301', created_by: 'another-admin', created_at: before, sender_kind: 'human', content: 'other-admin-instruction-secret' },
    { id: '02ef9d48-ef85-49f0-94e8-860460923301', created_by: ADMIN, created_at: before, sender_kind: 'ai', sender_role: 'quality', content: '관리자 검색창을 추가하는 개선안입니다.' }
  ] });
  assert.equal((await handler(request())).status, 200);
  const historyCall = calls.find(item => item.url.includes('order=created_at.desc'));
  assert.ok(historyCall.url.includes(`created_by=eq.${ADMIN}`));
  assert.ok(historyCall.url.includes('created_at=lte.'));
  const payload = JSON.parse(calls.find(item => item.url === 'https://api.openai.com/v1/responses').options.body);
  assert.ok(payload.input.includes(JSON.stringify({ id: MESSAGE, content: '그대로 해줘', target_role: 'quality' })));
  assert.match(payload.input, /관리자 검색창/);
  assert.doesNotMatch(payload.input, /future-instruction-secret|other-admin-instruction-secret/);
  assert.match(payload.instructions, /실행하지 말라는 메시지는 none/);
  assert.match(payload.instructions, /추가 실행 버튼이나 재승인 없이/);
});

test('an existing task is recovered without another model call or job submission', async () => {
  const { handler, calls } = setup({ existingTask: {
    message_id: MESSAGE, feedback_id: 42, kind: 'bug', status: 'running', dispatch_status: 'dispatched'
  }, intent: 'idea', missingAiKey: true, createdAt: '2026-11-09T12:30:00.000Z' });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).execution.status, 'already_submitted');
  assert.equal(calls.some(item => item.url.includes('api.openai.com') || item.url.endsWith('/rpc/admin_ai_meeting_create_task')), false);
  const saved = JSON.parse(calls.find(item => item.url.endsWith('/rest/v1/ai_meeting_messages')).options.body);
  assert.match(saved[0].content, /이미 자동 접수/);
  assert.match(saved[0].content, /수정·검증을 진행/);
});

test('old instructions without an existing task cannot start new work', async () => {
  const { handler, calls } = setup({ intent: 'bug', createdAt: '2026-11-09T12:30:00.000Z' });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'message_expired');
  assert.equal(calls.some(item => item.url.includes('api.openai.com') || item.url.endsWith('/rpc/admin_ai_meeting_create_task')), false);
});

test('a lost task acceptance response is reconciled by the original message key', async () => {
  const { handler, calls } = setup({ intent: 'bug', loseCreateResponse: true });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).execution.status, 'submitted');
  assert.equal(calls.filter(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')).length, 1);
  assert.equal(calls.filter(item => item.url.endsWith('/rpc/admin_ai_meeting_task')).length, 2);
});

test('unconfirmed submission never leaves an answered marker that would block retry', async () => {
  const { handler, calls } = setup({ intent: 'bug', loseCreateResponse: true, persistBeforeLoss: false });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'task_submission_unconfirmed');
  assert.equal(calls.some(item => item.url.endsWith('/rest/v1/ai_meeting_messages')), false);
});

test('reply-write failure after task creation recovers without a second job or model request', async () => {
  for (const throwReplyWrite of [false, true]) {
    const { handler, calls } = setup({ intent: 'bug', failReplyWriteOnce: true, throwReplyWrite });
    const first = await handler(request());
    assert.equal(first.status, 503);
    assert.equal((await first.json()).error, 'task_submission_unconfirmed');
    const second = await handler(request());
    assert.equal(second.status, 200);
    assert.equal((await second.json()).execution.status, 'already_submitted');
    assert.equal(calls.filter(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')).length, 1);
    assert.equal(calls.filter(item => item.url.includes('api.openai.com')).length, 1);
  }
});

test('a concurrent classification conflict recovers the one authoritative task', async () => {
  const { handler, calls } = setup({ intent: 'idea', conflictTask: {
    message_id: MESSAGE, feedback_id: 99, kind: 'bug', status: 'running', dispatch_status: 'dispatched'
  } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).execution.feedback_id, 99);
  assert.equal(calls.filter(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')).length, 1);
});

test('unavailable task state, revoked privileges and disabled executor cannot become a successful answer', async () => {
  for (const settings of [
    { lookupStatus: 503 },
    { createStatus: 403, createError: 'not_admin', intent: 'bug' },
    { createStatus: 400, createError: 'executor_unavailable', intent: 'bug' }
  ]) {
    const { handler, calls } = setup(settings);
    const response = await handler(request());
    assert.ok(response.status === 503 || response.status === 403);
    assert.equal(calls.some(item => item.url.endsWith('/rest/v1/ai_meeting_messages')), false);
  }
});

test('overlong or attachment-only task requests are rejected without truncation or job creation', async () => {
  for (const [content, error] of [['가'.repeat(2001), 'task_request_too_long'], ['첨부파일을 공유했어요.', 'task_request_needs_details']]) {
    const { handler, calls } = setup({ intent: 'bug', content });
    const response = await handler(request());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, error);
    assert.equal(calls.some(item => item.url.endsWith('/rpc/admin_ai_meeting_create_task')), false);
  }
});

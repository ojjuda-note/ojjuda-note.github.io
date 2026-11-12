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

function setup({ admin = true, existing = false, reply = { replies: [{ role: 'quality', text: '로그인 오류부터 재현하겠습니다.' }] }, target = 'quality', tasks = [], taskStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return json({ id: ADMIN, is_anonymous: false });
    if (url.includes('/rest/v1/app_admins')) return json(admin ? [{ user_id: ADMIN }] : []);
    if (url.includes('/rest/v1/ai_meeting_messages?select=id,room')) {
      return json([{ id: MESSAGE, room: 'hq', created_by: ADMIN, sender_kind: 'human',
        target_role: target, content: '로그인 오류를 살펴보자', created_at: WHEN }]);
    }
    if (url.includes('reply_to=eq.')) return json(existing ? [{ id: MESSAGE }] : []);
    if (url.includes('sender_kind=eq.human')) return json([{ id: MESSAGE }]);
    if (url.endsWith('/rest/v1/rpc/admin_ai_meeting_tasks')) return json(tasks, taskStatus);
    if (url.includes('order=created_at.desc')) {
      return json([{ sender_kind: 'human', sender_role: 'representative', content: '로그인 오류를 살펴보자' }]);
    }
    if (url === 'https://api.openai.com/v1/responses') {
      return json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] });
    }
    if (url.endsWith('/rest/v1/ai_meeting_messages') && options.method === 'POST') {
      return json(JSON.parse(options.body));
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  return { calls, handler: createHandler({ env, fetchImpl, now: () => Date.parse(WHEN) + 1500 }) };
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
  const { handler, calls } = setup({ reply: { replies: [{ role: 'marketing', text: '광고를 집행했습니다.' }] } });
  const result = await handler(request());
  assert.equal(result.status, 502);
  assert.equal(calls.some(item => item.options.method === 'POST' && item.url.endsWith('ai_meeting_messages')), false);
});

test('whole-team meeting requires director and another specialist', async () => {
  const { handler } = setup({ target: 'all', reply: { replies: [
    { role: 'director', text: '우선 품질 문제를 점검하겠습니다.' },
    { role: 'quality', text: '오류 재현부터 진행하겠습니다.' }
  ] } });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).replies, 2);
});

test('missing server-side AI key reports configuration status without exposing a secret', async () => {
  const { calls } = setup();
  const handler = createHandler({
    env: name => name === 'OPENAI_API_KEY' ? undefined : env(name),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return json({ id: ADMIN });
      if (url.includes('/rest/v1/app_admins')) return json([{ user_id: ADMIN }]);
      throw new Error('Unexpected call');
    }
  });
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

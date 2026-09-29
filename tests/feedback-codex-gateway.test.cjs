const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePromise = import(pathToFileURL(path.join(__dirname, '../supabase/functions/feedback-codex/handler.mjs')));
const NOW = 1790670000000;
const NONCE = 'ea0b572e-87b0-4cac-9000-600000000001';
const LEASE = 'ea0b572e-87b0-4cac-9000-600000000002';
const RUN = '36540001234';
const URL = 'https://example.supabase.co';
const REPO = 'ojjuda-note/ojjuda-codex-worker';
const ENV = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVER_CREDENTIAL',
  FEEDBACK_GITHUB_TOKEN: 'TEST_DISPATCH_CREDENTIAL', FEEDBACK_WORKER_REPOSITORY_ID: '90012345' };
const base = { feedback_id: '42', dispatch_nonce: NONCE };
const worker = { ...base, run_id: RUN };
function claims(overrides = {}) {
  return { iss: 'https://token.actions.githubusercontent.com', aud: `${URL}/functions/v1/feedback-codex`,
    sub: 'repo:ojjuda-note@123/ojjuda-codex-worker@90012345:ref:refs/heads/main',
    repository: REPO, repository_id: ENV.FEEDBACK_WORKER_REPOSITORY_ID, repository_visibility: 'private',
    workflow_ref: `${REPO}/.github/workflows/codex-feedback.yml@refs/heads/main`,
    ref: 'refs/heads/main', event_name: 'workflow_dispatch', run_id: RUN, run_attempt: '1',
    iat: NOW / 1000 - 10, nbf: NOW / 1000 - 10, exp: NOW / 1000 + 290, ...overrides };
}
function request(body, headers = {}) {
  return new Request(`${URL}/functions/v1/feedback-codex`, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function workerRequest(body) { return request(body, { authorization: 'Bearer test.payload.signature' }); }
async function fixture({ jwt = claims(), env = {}, rpc, github, verifier, production = false } = {}) {
  const calls = [];
  const { createHandler, pinnedWorkerEnv } = await modulePromise;
  const readEnv = name => ({ ...ENV, ...env })[name];
  const handler = createHandler({ env: production ? pinnedWorkerEnv(readEnv) : readEnv, now: () => NOW,
    verifyOidc: verifier || (async () => jwt),
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, options, body });
      if (url.startsWith(`${URL}/rest/`)) {
        const value = rpc ? await rpc(body.p_action, body.p_payload) : null;
        return Response.json(value);
      }
      if (github) return github(url, options, body);
      return Response.json({ workflow_run_id: Number(RUN),
        run_url: `https://api.github.com/repos/${REPO}/actions/runs/${RUN}`,
        html_url: `https://github.com/${REPO}/actions/runs/${RUN}` });
    } });
  return { handler, calls };
}

test('dispatch binds the returned run ID and sends only opaque job inputs', async () => {
  const f = await fixture({ rpc: action => action === 'dispatch_claim' ? base : { feedback_id: '42', dispatch_status: 'dispatched' } });
  const response = await f.handler(request({ action: 'dispatch', ...base, body: 'never forward this' }));
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(f.calls.length, 3);
  const dispatch = f.calls[1];
  assert.equal(dispatch.url, `https://api.github.com/repos/${REPO}/actions/workflows/codex-feedback.yml/dispatches`);
  assert.deepEqual(dispatch.body, { ref: 'main', inputs: base });
  assert.equal(dispatch.options.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(dispatch.options.redirect, 'error');
  assert.deepEqual(f.calls[2].body, { p_action: 'dispatch_finish', p_payload: { ...base, status: 'dispatched', run_id: RUN } });
});

test('duplicate events and wrong nonces reveal nothing and do not dispatch', async () => {
  for (const nonce of [NONCE, 'ea0b572e-87b0-4cac-9000-600000000003']) {
    const f = await fixture();
    const response = await f.handler(request({ action: 'dispatch', ...base, dispatch_nonce: nonce }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
    assert.equal(f.calls.length, 1);
  }
});

test('dispatch timeout is not retried and stores only a fixed error code', async () => {
  const f = await fixture({ rpc: action => action === 'dispatch_claim' ? base : { feedback_id: '42', dispatch_status: 'failed' },
    github: () => { throw new Error('TEST_DISPATCH_CREDENTIAL raw provider error'); } });
  const response = await f.handler(request({ action: 'dispatch', ...base }));
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[2].body.p_payload, { ...base, status: 'failed', error_code: 'github_unavailable' });
});

test('unexpected GitHub success response cannot authorize an unbound run', async () => {
  for (const github of [() => new Response(null, { status: 204 }), () => Response.json({ workflow_run_id: Number(RUN),
    html_url: `https://github.com/wrong/repo/actions/runs/${RUN}`, run_url: 'https://example.com' })]) {
    const f = await fixture({ rpc: action => action === 'dispatch_claim' ? base : { feedback_id: '42', dispatch_status: 'failed' }, github });
    await f.handler(request({ action: 'dispatch', ...base }));
    assert.equal(f.calls[2].body.p_payload.status, 'failed');
    assert.equal(f.calls[2].body.p_payload.run_id, undefined);
  }
});

test('upstream errors and missing credentials are sanitized', async () => {
  for (const [status, code] of [[401, 'github_unauthorized'], [429, 'github_rate_limited'], [422, 'github_rejected'], [500, 'github_unavailable']]) {
    const f = await fixture({ rpc: action => action === 'dispatch_claim' ? base : { feedback_id: '42', dispatch_status: 'failed' },
      github: () => new Response('TEST_DISPATCH_CREDENTIAL private feedback', { status }) });
    const response = await f.handler(request({ action: 'dispatch', ...base }));
    assert.deepEqual(await response.json(), { accepted: true });
    assert.equal(f.calls[2].body.p_payload.error_code, code);
  }
  const f = await fixture({ env: { FEEDBACK_GITHUB_TOKEN: undefined },
    rpc: action => action === 'dispatch_claim' ? base : { feedback_id: '42', dispatch_status: 'failed' } });
  await f.handler(request({ action: 'dispatch', ...base }));
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.p_payload.error_code, 'worker_unconfigured');
});

test('dispatch cannot report acceptance when run binding was not saved', async () => {
  for (const bad of [null, { feedback_id: '43', dispatch_status: 'dispatched' }, { feedback_id: '42', dispatch_status: 'failed' }]) {
    const f = await fixture({ rpc: action => action === 'dispatch_claim' ? base : bad });
    const response = await f.handler(request({ action: 'dispatch', ...base }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'worker_unavailable' });
  }
});

test('malformed IDs, nonce, oversized UTF-8, and wrong methods never call services', async () => {
  const f = await fixture();
  for (const bad of [{ ...base, feedback_id: 0 }, { ...base, feedback_id: '42 OR 1=1' },
    { ...base, feedback_id: Number.MAX_SAFE_INTEGER + 1 }, { ...base, feedback_id: '9223372036854775808' },
    { ...base, dispatch_nonce: 'not-a-nonce' }, { ...base, extra: '가'.repeat(40000) }]) {
    assert.equal((await f.handler(request({ action: 'dispatch', ...bad }))).status, 400);
  }
  assert.equal((await f.handler(new Request(URL))).status, 405);
  assert.equal(f.calls.length, 0);
});

test('missing configuration fails closed', async () => {
  const f = await fixture({ env: { FEEDBACK_WORKER_REPOSITORY_ID: undefined } });
  assert.equal((await f.handler(workerRequest({ action: 'claim', ...worker }))).status, 503);
  assert.equal(f.calls.length, 0);
});

test('deployed repository identity is pinned without a manual environment setting', async () => {
  const { WORKER_REPOSITORY_ID } = await modulePromise;
  for (const configuredId of [undefined, '90012345']) {
    const f = await fixture({ production: true, env: { FEEDBACK_WORKER_REPOSITORY_ID: configuredId },
      jwt: claims({ repository_id: WORKER_REPOSITORY_ID }),
      rpc: () => ({ ...worker, lease_token: LEASE, kind: 'bug', body: '화면이 겹쳐요' }) });
    assert.equal((await f.handler(workerRequest({ action: 'claim', ...worker }))).status, 200);
    assert.equal(f.calls.length, 1);
  }
  const wrong = await fixture({ production: true, jwt: claims({ repository_id: '90012345' }) });
  assert.equal((await wrong.handler(workerRequest({ action: 'claim', ...worker }))).status, 401);
  assert.equal(wrong.calls.length, 0);
});

test('invalid signatures cannot reach privileged RPC or private feedback', async () => {
  const f = await fixture({ verifier: async () => { throw new Error('forged JWT'); } });
  const response = await f.handler(workerRequest({ action: 'claim', ...worker }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
  assert.equal(f.calls.length, 0);
});

test('repository, workflow, audience, run, lifetime, and event claims are mandatory', async () => {
  const invalid = [
    { iss: 'https://attacker.example' }, { aud: 'https://other.example' }, { aud: [`${URL}/functions/v1/feedback-codex`] },
    { sub: '' }, { repository_id: 'wrong' }, { repository: 'other/repo' }, { repository_visibility: 'public' },
    { workflow_ref: `${REPO}/.github/workflows/other.yml@refs/heads/main` }, { ref: 'refs/heads/other' },
    { event_name: 'pull_request' }, { run_id: '999' }, { run_attempt: '2' },
    { exp: NOW / 1000 }, { exp: undefined }, { nbf: NOW / 1000 + 1 }, { nbf: undefined },
    { iat: NOW / 1000 + 1 }, { exp: NOW / 1000 + 1000 },
  ];
  for (const changed of invalid) {
    const f = await fixture({ jwt: claims(changed) });
    assert.equal((await f.handler(workerRequest({ action: 'claim', ...worker }))).status, 401, JSON.stringify(changed));
    assert.equal(f.calls.length, 0);
  }
});

test('authenticated claim returns only this job and never identities or server keys', async () => {
  const f = await fixture({ rpc: (action, payload) => {
    assert.equal(action, 'worker_claim');
    assert.deepEqual(payload, worker);
    return { ...worker, lease_token: LEASE, kind: 'bug', body: '화면이 겹쳐요', screen: 'note:main',
      app_version: 'test', user_agent: 'test browser', user_id: 'private-user', email: 'private@example.com', attempts: 1 };
  } });
  const response = await f.handler(workerRequest({ action: 'claim', ...worker }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, lease_token: LEASE,
    feedback: { id: '42', kind: 'bug', body: '화면이 겹쳐요', screen: 'note:main', app_version: 'test', user_agent: 'test browser' } });
});

test('claim replay and wrong job binding fail without returning private data', async () => {
  const f = await fixture();
  const response = await f.handler(workerRequest({ action: 'claim', ...worker }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'job_unavailable' });
  const wrong = await fixture({ rpc: () => ({ ...worker, feedback_id: '43', lease_token: LEASE, kind: 'bug', body: 'private' }) });
  const bad = await wrong.handler(workerRequest({ action: 'claim', ...worker }));
  assert.equal(bad.status, 503);
  assert.equal((await bad.text()).includes('private'), false);
});

test('completion is lease-bound and gateway generates the only allowed evidence URL', async () => {
  const completion = { action: 'complete', ...worker, lease_token: LEASE, status: 'needs_review',
    summary: '수정안 준비', result: '재현과 검사를 완료했습니다.', priority: 'normal', evidence_url: 'https://attacker.example' };
  const f = await fixture({ rpc: (action, payload) => {
    assert.equal(action, 'worker_finish');
    assert.equal(payload.lease_token, LEASE);
    assert.equal(payload.evidence_url, `https://github.com/${REPO}/actions/runs/${RUN}`);
    assert.equal(payload.retry_after, undefined);
    return { feedback_id: '42', status: 'needs_review' };
  } });
  assert.deepEqual(await (await f.handler(workerRequest(completion))).json(), { ok: true });
  const duplicate = await fixture();
  assert.equal((await duplicate.handler(workerRequest(completion))).status, 409);
});

test('completion cannot declare deployed, omit lease, exceed limits, or schedule retries', async () => {
  const f = await fixture();
  const completion = { action: 'complete', ...worker, lease_token: LEASE, status: 'needs_review',
    summary: '수정안', result: '검증 결과', priority: 'normal' };
  for (const bad of [{ status: 'resolved' }, { lease_token: undefined }, { status: 'running' }, { priority: 'critical' },
    { summary: '가'.repeat(1201) }, { result: '가'.repeat(12001) }, { result: ' ' }]) {
    assert.equal((await f.handler(workerRequest({ ...completion, ...bad }))).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('database faults are not reflected to callers', async () => {
  const f = await fixture({ rpc: () => { throw new Error('TEST_SERVER_CREDENTIAL secret SQL'); } });
  const response = await f.handler(workerRequest({ action: 'claim', ...worker }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'worker_unavailable' });
});

const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');

(async () => {
  const { createHandler } = await import('../supabase/functions/member-recovery/handler.mjs');
  const details = { action: 'check', email: 'Member@Example.invalid', phone: '01012345678', birth_date: '2000-02-29', gender: 'male' };
  const target = '00000000-0000-4000-8000-000000000001', token = 'f'.repeat(64);
  const passwordBody = { action: 'reset', token, password: 'new-password', password_confirmation: 'new-password', user_id: 'attacker-supplied-target' };
  const setup = ({ result = { status: 'matched' }, rpcStatus = 200, updateStatus = 200, expired = false, throwUpdate = false } = {}) => {
    const calls = []; let used = expired;
    const handler = createHandler({
      env: key => ({ SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret',
        SUPABASE_PUBLISHABLE_KEYS: '{"default":"test-public"}' })[key],
      cryptoImpl: webcrypto, delay: async () => {},
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options, body: JSON.parse(options.body) });
        if (url.endsWith('/begin_member_password_recovery')) return new Response(JSON.stringify(result), { status: rpcStatus });
        if (url.endsWith('/consume_member_password_recovery')) {
          const id = used ? null : target; used = true;
          return new Response(JSON.stringify(id), { status: rpcStatus });
        }
        if (throwUpdate) throw new Error('network');
        return new Response('{}', { status: updateStatus });
      }
    });
    const request = (body = details, headers = {}, method = 'POST') => handler(new Request('https://edge.example.invalid', {
      method, headers: { apikey: 'test-public', Origin: 'https://ojjuda.kr', 'Content-Type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
    }));
    return { calls, request };
  };
  const success = setup(), checked = await success.request(), grant = await checked.json();
  assert.equal(checked.status, 200); assert.equal(grant.verified, true); assert.equal(grant.expires_in, 300);
  assert.match(grant.reset_token, /^[a-f0-9]{64}$/); assert.equal('user_id' in grant, false);
  assert.equal(success.calls.length, 1, 'checking details never changes a password or sends email');
  const sent = success.calls[0];
  assert.equal(sent.body.p_email, 'member@example.invalid');
  assert.match(sent.body.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.match(sent.body.p_email_hash, /^[a-f0-9]{64}$/);
  assert.equal(sent.body.p_token_hash, createHash('sha256').update(grant.reset_token).digest('hex'));
  assert.notEqual(sent.body.p_token_hash, grant.reset_token);
  assert.equal(sent.headers.apikey, 'test-server-secret');
  const mismatch = setup({ result: { status: 'unmatched' } }), denied = await mismatch.request();
  assert.equal(denied.status, 200); assert.deepEqual(await denied.json(), { verified: false });
  assert.equal(mismatch.calls.length, 1);
  for (const [options, status, error] of [
    [{ result: { status: 'limited' } }, 429, 'recovery_rate_limited'],
    [{ rpcStatus: 500 }, 503, 'recovery_unavailable'],
    [{ result: null }, 503, 'recovery_unavailable']
  ]) {
    const app = setup(options), response = await app.request();
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
    assert.equal(app.calls.length, 1);
  }
  for (const body of [null, {}, { ...details, gender: 'unknown' }, { ...details, email: 'bad' }, { ...details, phone: '1'.repeat(5000) },
    { ...passwordBody, password: 'short' }, { ...passwordBody, password_confirmation: 'different' }, { ...passwordBody, password: '한'.repeat(25) }]) {
    const app = setup(); assert.equal((await app.request(body)).status, 400); assert.equal(app.calls.length, 0);
  }
  const app = setup(), changed = await app.request(passwordBody);
  assert.equal(changed.status, 200); assert.deepEqual(await changed.json(), { reset: true });
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[0].body.p_token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(app.calls[1].url, `https://auth.example.invalid/auth/v1/admin/users/${target}`);
  assert.equal(app.calls[1].method, 'PUT'); assert.equal(app.calls[1].headers.apikey, 'test-server-secret');
  assert.deepEqual(app.calls[1].body, { password: passwordBody.password });
  assert.equal((await app.request(passwordBody)).status, 410);
  assert.equal(app.calls.filter(call => call.method === 'PUT').length, 1, 'replay must not update the password');
  const race = setup();
  const racers = await Promise.all([race.request(passwordBody), race.request(passwordBody)]);
  assert.deepEqual(racers.map(r => r.status).sort(), [200, 410]);
  for (const options of [{ updateStatus: 500 }, { throwUpdate: true }]) {
    const failed = setup(options), response = await failed.request(passwordBody);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'recovery_restart_required' });
    assert.equal((await failed.request(passwordBody)).status, 410, 'failed attempts do not release the consumed grant');
  }
  const invalid = setup({ expired: true });
  assert.equal((await invalid.request(passwordBody)).status, 410);
  assert.equal(invalid.calls.length, 1);
  const blocked = setup();
  assert.equal((await blocked.request({ ...passwordBody, token: '' })).status, 410);
  assert.equal((await blocked.request(details, { apikey: 'wrong' })).status, 401);
  assert.equal((await blocked.request(details, { Origin: 'https://other.example.invalid' })).status, 403);
  assert.equal((await blocked.request(null, {}, 'GET')).status, 405);
  const preflight = await blocked.request(null, {}, 'OPTIONS');
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://ojjuda.kr');
  assert.equal(blocked.calls.length, 0);
  console.log('PASS: identity check, hashed grants, password confirmation, server-derived target, expiry, replay/concurrency protection, no email and failed-update handling');
})().catch(error => { console.error(error); process.exitCode = 1; });

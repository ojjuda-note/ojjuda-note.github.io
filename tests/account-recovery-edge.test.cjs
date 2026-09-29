const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

(async () => {
  const { createHandler } = await import('../supabase/functions/member-recovery/handler.mjs');
  const details = { email: 'Member@Example.invalid', phone: '01012345678', birth_date: '2000-02-29', gender: 'male' };
  const setup = ({ result = 'matched', rpcStatus = 200, mailStatus = 200 } = {}) => {
    const calls = [];
    const handler = createHandler({
      env: key => ({ SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret',
        SUPABASE_PUBLISHABLE_KEYS: '{"default":"test-public"}' })[key],
      cryptoImpl: webcrypto, delay: async () => {},
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options, body: JSON.parse(options.body) });
        return url.includes('/rpc/') ? new Response(JSON.stringify(result), { status: rpcStatus })
          : new Response('{}', { status: mailStatus });
      }
    });
    const request = (body = details, headers = {}, method = 'POST') => handler(new Request('https://edge.example.invalid', {
      method, headers: { apikey: 'test-public', Origin: 'https://ojjuda.kr', 'Content-Type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
    }));
    return { calls, request };
  };
  const success = setup(), sent = await success.request();
  assert.equal(sent.status, 202); assert.deepEqual(await sent.json(), { accepted: true });
  assert.equal(success.calls.length, 2);
  assert.equal(success.calls[0].body.p_email, 'member@example.invalid');
  assert.match(success.calls[0].body.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.match(success.calls[0].body.p_email_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(success.calls[0].body.p_ip_hash, success.calls[0].body.p_email_hash);
  assert.equal(success.calls[0].headers.apikey, 'test-server-secret');
  assert.equal(success.calls[1].headers.apikey, 'test-public');
  assert.equal(new URL(success.calls[1].url).searchParams.get('redirect_to'), 'https://ojjuda.kr/?reset=1');
  assert.deepEqual(success.calls[1].body, { email: 'member@example.invalid' });
  const mismatch = setup({ result: 'unmatched' }), notSent = await mismatch.request();
  assert.equal(notSent.status, 202); assert.deepEqual(await notSent.json(), { accepted: true });
  assert.equal(mismatch.calls.length, 1, 'an identity mismatch must never send mail');
  for (const [options, status, error] of [
    [{ result: 'limited' }, 429, 'recovery_rate_limited'],
    [{ mailStatus: 500 }, 503, 'recovery_mail_failed'],
    [{ mailStatus: 429 }, 429, 'recovery_rate_limited'],
    [{ rpcStatus: 500 }, 503, 'recovery_unavailable'],
    [{ result: null }, 503, 'recovery_unavailable']
  ]) {
    const app = setup(options), response = await app.request();
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
    if (!options.mailStatus) assert.equal(app.calls.length, 1);
  }
  for (const body of [null, {}, { ...details, gender: 'unknown' }, { ...details, email: 'bad' }, { ...details, phone: '1'.repeat(5000) }]) {
    const app = setup(); assert.equal((await app.request(body)).status, 400); assert.equal(app.calls.length, 0);
  }
  const blocked = setup();
  assert.equal((await blocked.request(details, { apikey: 'wrong' })).status, 401);
  assert.equal((await blocked.request(details, { Origin: 'https://other.example.invalid' })).status, 403);
  assert.equal((await blocked.request(null, {}, 'GET')).status, 405);
  const preflight = await blocked.request(null, {}, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://ojjuda.kr');
  assert.equal(blocked.calls.length, 0);
  console.log('PASS: recovery edge validation, key isolation, identity gate, indistinguishable success, mail failures and rate limits');
})().catch(error => { console.error(error); process.exitCode = 1; });

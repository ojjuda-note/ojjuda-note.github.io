import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, randomBytes } from 'node:crypto';
import { deviceHash, pushSubscription, checkSignature, verifyIdentity, jsonBody, ORIGINS } from '../supabase/functions/byeolcheonji/security.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
function jwt(claims = { sub: A, session_id: SESSION }) {
  return `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.verified-by-auth-fixture`;
}
function request(headers = {}, method = 'GET', body) {
  return new Request('https://ziezbdjofcugznowiuda.supabase.co/functions/v1/byeolcheonji/status', {
    headers, method, ...(body === undefined ? {} : { body }),
  });
}
function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/device-fixture') {
  const ec = createECDH('prime256v1'); ec.generateKeys();
  return { endpoint, keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}

test('membership requires Auth verification, nonanonymous identity, matching subject and real session identifier', async () => {
  const token = jwt();
  const args = { authUrl: 'https://ziezbdjofcugznowiuda.supabase.co', key: 'publishable-fixture', fetcher: async (url, init) => {
    assert.equal(url, 'https://ziezbdjofcugznowiuda.supabase.co/auth/v1/user');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(new URL(url).search, '');
    return Response.json({ id: A, is_anonymous: false });
  } };
  assert.deepEqual(await verifyIdentity(request({ Authorization: `Bearer ${token}` }), args), { userId: A, sessionId: SESSION });
  for (const user of [{ id: A, is_anonymous: true }, { id: A }, { id: B, is_anonymous: false }, { id: 'invalid', is_anonymous: false }]) {
    await assert.rejects(() => verifyIdentity(request({ Authorization: `Bearer ${token}` }), { ...args, fetcher: async () => Response.json(user) }), { status: 401, code: 'member_required' });
  }
  for (const claims of [{ sub: A }, { sub: A, session_id: 'fake' }, { sub: B, session_id: SESSION }]) {
    await assert.rejects(() => verifyIdentity(request({ Authorization: `Bearer ${jwt(claims)}` }), { ...args,
      fetcher: async () => Response.json({ id: A, is_anonymous: false }) }), { status: 401 });
  }
});

test('guest and revoked credentials fail closed, auth outages do not become guest sessions', async () => {
  let called = false;
  const args = { authUrl: 'https://auth.example', key: 'fixture', fetcher: async () => { called = true; return Response.json({}); } };
  await assert.rejects(() => verifyIdentity(request(), args), { status: 401 }); assert.equal(called, false);
  await assert.rejects(() => verifyIdentity(request({ Authorization: 'Bearer x y' }), args), { status: 401 }); assert.equal(called, false);
  for (const status of [401, 403]) await assert.rejects(() => verifyIdentity(request({ Authorization: `Bearer ${jwt()}` }), { ...args,
    fetcher: async () => new Response('', { status }) }), { status: 401 });
  for (const fetcher of [async () => new Response('', { status: 500 }), async () => { throw new Error('network'); }]) {
    await assert.rejects(() => verifyIdentity(request({ Authorization: `Bearer ${jwt()}` }), { ...args, fetcher }), { status: 503, code: 'auth_unavailable' });
  }
});

test('user metadata never authorizes an anonymous account', async () => {
  await assert.rejects(() => verifyIdentity(request({ Authorization: `Bearer ${jwt()}` }), {
    authUrl: 'https://auth.example', key: 'fixture', fetcher: async () => Response.json({ id: A, is_anonymous: true,
      user_metadata: { is_member: true, is_admin: true, role: 'owner' } }),
  }), { status: 401 });
});

test('device capability is independent of Authorization and only canonical 256-bit tokens are accepted', () => {
  const capability = randomBytes(32).toString('base64url');
  const hash = deviceHash(request({ 'X-Device-Token': capability, Authorization: `Bearer ${jwt()}` }));
  assert.match(hash, /^[a-f0-9]{64}$/); assert.notEqual(hash, capability);
  assert.equal(deviceHash(request(), true), null);
  assert.throws(() => deviceHash(request({ Authorization: `Bearer ${jwt()}` })), { status: 401 });
  for (const value of ['short', capability + '=', randomBytes(33).toString('base64url'), 'a'.repeat(43)]) {
    assert.throws(() => deviceHash(request({ 'X-Device-Token': value })), { status: 401 });
  }
});

test('push endpoints cannot target arbitrary HTTP/internal services or redirect through credentials', () => {
  const valid = subscription();
  assert.deepEqual(pushSubscription(valid), valid);
  for (const endpoint of ['http://fcm.googleapis.com/device', 'https://localhost/device', 'https://127.0.0.1/device',
    'https://fcm.googleapis.com.evil.test/device', 'https://user:password@fcm.googleapis.com/device', 'https://fcm.googleapis.com:8443/device',
    'https://fcm.googleapis.com/device#fragment', 'https://fcm.googleapis.com/', 'file:///etc/passwd']) {
    assert.throws(() => pushSubscription({ ...valid, endpoint }), { status: 400 });
  }
  for (const endpoint of ['https://web.push.apple.com/device', 'https://updates.push.services.mozilla.com/device',
    'https://notify123.notify.windows.com/device']) assert.equal(pushSubscription({ ...valid, endpoint }).endpoint, endpoint);
  assert.throws(() => pushSubscription({ ...valid, keys: { ...valid.keys, auth: 'x'.repeat(22) } }), { status: 400 });
  assert.throws(() => pushSubscription({ ...valid, keys: { ...valid.keys, p256dh: 'A'.repeat(87) } }), { status: 400 });
});

test('scheduler signature binds timestamp nonce and probe mode with short expiry', () => {
  const secret = 'scheduler-test-fixture', time = '1793782800', now = Number(time) * 1000;
  const nonce = '44444444-4444-4444-8444-444444444444';
  const headers = { 'X-Byeol-Time': time, 'X-Byeol-Nonce': nonce,
    'X-Byeol-Signature': createHmac('sha256', secret).update(`${time}:${nonce}:scan`).digest('hex') };
  assert.deepEqual(checkSignature(request(headers), secret, now), { nonce, probe: false });
  assert.throws(() => checkSignature(request({ ...headers, 'X-Byeol-Probe': '1' }), secret, now), { status: 401 });
  assert.throws(() => checkSignature(request(headers), 'other-secret', now), { status: 401 });
  assert.throws(() => checkSignature(request(headers), secret, now + 121000), { status: 401 });
  assert.throws(() => checkSignature(request(headers), secret, now - 31000), { status: 401 });
  assert.throws(() => checkSignature(request({ ...headers, 'X-Byeol-Nonce': 'bad' }), secret, now), { status: 401 });
  assert.throws(() => checkSignature(request(headers), null, now), { status: 401 });
});

test('body limit and CORS are narrow; unsupported payloads cannot enter storage', async () => {
  assert.deepEqual([...ORIGINS], ['https://ojjuda.kr', 'https://www.ojjuda.kr']);
  assert.equal(ORIGINS.has('https://ojjuda.kr.attacker.test'), false);
  assert.deepEqual(await jsonBody(request({ 'Content-Type': 'application/json' }, 'POST', '{"filters":{"guests":4}}')), { filters: { guests: 4 } });
  await assert.rejects(() => jsonBody(request({}, 'POST', '{}')), { status: 415 });
  await assert.rejects(() => jsonBody(request({ 'Content-Type': 'application/json' }, 'POST', '[]')), { status: 400 });
  await assert.rejects(() => jsonBody(request({ 'Content-Type': 'application/json' }, 'POST', 'null')), { status: 400 });
  await assert.rejects(() => jsonBody(request({ 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ tooLong: 'x'.repeat(9000) }))), { status: 413 });
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHandler } from '../supabase/functions/admin-ban/handler.mjs';

const require = createRequire(import.meta.url);
const identity = require('../shared/auth/signup-identity.js');

assert.equal(identity.validSignupEmail('member+1@gmail.com'), true);
assert.equal(identity.validSignupEmail('member@naver.com'), true);
for (const invalid of ['member@example.com', 'person@example.invalid', 'person@domain.test',
  'test@mailinator.com', 'name@x..com', 'name@-host.com',
  'name@host.c', '.name@host.com', 'name..last@host.com', 'noaddress']) {
  assert.equal(identity.validSignupEmail(invalid), false, invalid);
}
assert.equal(identity.normalizeSignupPhone('010-2345-6789'), '01023456789');
assert.equal(identity.normalizeSignupPhone('+82 10-2345-6789'), '01023456789');
for (const invalid of ['070-1234-5678', '010-1111-1111', '010-1234-5678', '010-123-4567']) {
  assert.throws(() => identity.normalizeSignupPhone(invalid), undefined, invalid);
}
assert.equal(identity.normalizePhone('02-1234-5678'), '0212345678'); // Legacy account edits/recovery stay valid.

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup({ admin = true, targetAdmin = false, authSuccess = true, rpcSuccess = true } = {}) {
  const calls = [];
  const mockFetch = async (url, options) => {
    const parsed = new URL(url); calls.push({ url: parsed.pathname, body: options.body, headers: options.headers });
    const data = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type':'application/json' } });
    if (parsed.pathname === '/auth/v1/user') return data({ id: actor, is_anonymous: false });
    if (parsed.pathname === '/rest/v1/app_admins') {
      const id = parsed.searchParams.get('user_id')?.replace('eq.', '');
      return data(id === actor && admin || id === target && targetAdmin ? [{ user_id: id }] : []);
    }
    if (parsed.pathname === '/rest/v1/rpc/admin_ban') return data(rpcSuccess ? 'infinity' : { message:'not_admin' }, rpcSuccess ? 200 : 403);
    if (parsed.pathname === `/auth/v1/admin/users/${target}`) return data(authSuccess ? { id: target } : { error:'failed' }, authSuccess ? 200 : 503);
    throw new Error(`Unexpected request: ${parsed.pathname}`);
  };
  const handler = createHandler({
    env: name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ-server-secret', SUPABASE_ANON_KEY: 'eyJ-public-key' })[name],
    fetchImpl: mockFetch
  });
  const call = (days, target_user = target, origin = 'https://ojjuda.kr') => handler(new Request('https://example.supabase.co/functions/v1/admin-ban', {
    method: 'POST', headers: { Origin: origin, authorization: 'Bearer user.jwt.token' },
    body: JSON.stringify({ days, target_user })
  }));
  return { calls, call, handler };
}

const noAdmin = setup({ admin:false });
assert.equal((await noAdmin.call(-1)).status, 403);
assert.equal(noAdmin.calls.some(call => call.url.endsWith('/admin_ban')), false);
const adminTarget = setup({ targetAdmin:true });
assert.equal((await adminTarget.call(-1)).status, 403);
assert.equal(adminTarget.calls.some(call => call.url.endsWith('/admin_ban')), false);
assert.equal((await setup().call(-1, actor)).status, 403);
assert.equal((await setup().call(12)).status, 400);

const permanent = setup();
assert.deepEqual(await (await permanent.call(-1)).json(), { ok:true, permanent:true, banned_until:'infinity' });
const authWrite = permanent.calls.find(call => call.url.includes('/auth/v1/admin/users/'));
assert.equal(JSON.parse(authWrite.body).ban_duration, '876000h');
assert.equal(authWrite.headers.apikey, 'eyJ-server-secret');
const rpcWrite = permanent.calls.find(call => call.url.endsWith('/admin_ban'));
assert.deepEqual(JSON.parse(rpcWrite.body), { target_user:target, days:-1 });
assert.equal(rpcWrite.headers.apikey, 'eyJ-public-key');

const unban = setup();
assert.equal((await unban.call(0)).status, 200);
assert.equal(JSON.parse(unban.calls.find(call => call.url.includes('/auth/v1/admin/users/')).body).ban_duration, 'none');
const partial = setup({ authSuccess:false });
assert.deepEqual(await (await partial.call(-1)).json(), { error:'ban_auth_sync_failed', restriction_applied:true });

console.log('Account signup and administrator-ban guardrails: OK');

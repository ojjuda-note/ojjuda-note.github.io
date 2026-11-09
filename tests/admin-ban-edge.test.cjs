const assert = require('node:assert/strict');
const {test} = require('node:test');

const actor = '00000000-0000-4000-8000-000000000001';
const target = '00000000-0000-4000-8000-000000000002';

async function setup({actorAdmin = true, targetAdmin = false, authValid = true} = {}) {
  const {createHandler} = await import('../supabase/functions/admin-ban/handler.mjs');
  const calls = [];
  const handler = createHandler({
    env: name => ({SUPABASE_URL:'https://auth.example.invalid',
      SUPABASE_SERVICE_ROLE_KEY:'test-server-secret', SUPABASE_ANON_KEY:'test-public-key'})[name],
    fetchImpl: async (url, options) => {
      calls.push({url, ...options});
      if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({id:actor}), {status:authValid?200:401});
      if (url.includes('/rest/v1/app_admins?')) {
        const isActor = url.includes(actor);
        const permitted = isActor ? actorAdmin : targetAdmin;
        return new Response(JSON.stringify(permitted ? [{user_id:isActor?actor:target}] : []));
      }
      if (url.endsWith('/rest/v1/rpc/admin_ban')) return new Response(JSON.stringify('2026-11-16T00:00:00Z'));
      if (url.endsWith(`/auth/v1/admin/users/${target}`)) return new Response('{}');
      throw new Error('unexpected network request');
    }
  });
  const request = (body = {target_user:target,days:7}, headers = {}) => handler(new Request('https://edge.example.invalid', {
    method:'POST',headers:{Origin:'https://ojjuda.kr',Authorization:'Bearer member-jwt','Content-Type':'application/json',...headers},
    body:JSON.stringify(body)
  }));
  return {calls, request};
}

test('non-admins and invalid sessions cannot ban or unban another member', async () => {
  for (const variant of [{actorAdmin:false},{authValid:false}]) {
    const app = await setup(variant), response = await app.request();
    assert.ok([401,403].includes(response.status));
    assert.equal(app.calls.some(call => call.url.includes('/rpc/admin_ban') || call.url.includes('/auth/v1/admin/users/')), false);
  }
  const app = await setup();
  assert.equal((await app.request(undefined,{Authorization:''})).status,401);
  assert.equal((await app.request(undefined,{Origin:'https://evil.example.invalid'})).status,403);
  assert.equal((await app.request({target_user:target,days:365})).status,400);
  assert.equal(app.calls.length,0);
});

test('self-bans and attempts to ban other administrators are blocked', async () => {
  const self = await setup();
  assert.equal((await self.request({target_user:actor,days:7})).status,403);
  const protectedAdmin = await setup({targetAdmin:true});
  assert.equal((await protectedAdmin.request()).status,403);
  assert.equal(protectedAdmin.calls.some(call => call.url.includes('/rpc/admin_ban')),false);
});

test('an authorized ban checks the caller and target before updating Auth', async () => {
  const app = await setup();
  const response = await app.request();
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
  const rpc = app.calls.find(call => call.url.endsWith('/rest/v1/rpc/admin_ban'));
  const auth = app.calls.find(call => call.url.endsWith(`/auth/v1/admin/users/${target}`));
  assert.ok(rpc && auth);
  assert.equal(rpc.headers.apikey,'test-public-key','database action uses the caller JWT');
  assert.equal(rpc.headers.Authorization,'Bearer member-jwt');
  assert.equal(auth.headers.apikey,'test-server-secret','server key stays on the edge');
  assert.equal(JSON.parse(auth.body).ban_duration,'168h');
});

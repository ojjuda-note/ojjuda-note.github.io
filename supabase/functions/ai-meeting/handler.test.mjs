import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';

// A stale browser must not spend AI tokens or start work after retirement.
test('cached meeting clients receive a terminal response without any upstream call', async t => {
  const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('retired endpoint must not call upstreams'); });
  const handler = createHandler();
  for (const method of ['POST', 'GET', 'PUT', 'DELETE']) {
    const response = await handler(new Request('https://project.supabase.co/functions/v1/ai-meeting', {
      method, headers: { origin: 'https://ojjuda.kr', authorization: 'Bearer old-admin-session' },
      ...(method === 'POST' ? { body: JSON.stringify({ message_id: '08ef9d48-ef85-49f0-94e8-860460923302' }) } : {})
    }));
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'ai_meeting_retired');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://ojjuda.kr');
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test('preflight remains readable and foreign origins remain rejected', async () => {
  const handler = createHandler();
  const preflight = await handler(new Request('https://project.supabase.co/functions/v1/ai-meeting', {
    method: 'OPTIONS', headers: { origin: 'https://ojjuda.kr' }
  }));
  assert.equal(preflight.status, 204);
  const foreign = await handler(new Request('https://project.supabase.co/functions/v1/ai-meeting', {
    method: 'POST', headers: { origin: 'https://other.example' }
  }));
  assert.equal(foreign.status, 403);
});

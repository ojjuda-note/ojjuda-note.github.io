const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../shared/activity/member-navigation.js'), 'utf8');

async function harness(signedIn = true, sharedClient = false) {
  const events = [], listeners = {};
  const location = new URL('https://ojjuda.kr/world.html?tab=arcade');
  const document = {
    readyState: 'complete', title: '오쭈다 아지트 | 오늘 하루 어땠나요',
    addEventListener(name, fn) { listeners[name] = fn; },
    head: { append() { throw Error('Supabase is already loaded'); } }
  };
  let creations = 0;
  const client = { auth: {
    onAuthStateChange() {},
    async getSession() { return { data: { session: signedIn ? { user: { id: 'user-1' }, access_token: 'signed-in-token' } : null } }; }
  } };
  const window = {
    OJJUDA_CONFIG: { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'public-test-key' },
    supabase: { createClient() { creations++; return client; } }
  };
  if (sharedClient) window.ojjudaSupabase = client;
  vm.runInNewContext(source, { window, document, location, URL, setTimeout, fetch: async (_url, options) => {
    events.push({ payload: JSON.parse(options.body), options }); return { ok: true };
  } });
  await new Promise(resolve => setImmediate(resolve));
  return { events, listeners, window, client, created: () => creations };
}

function click(listeners, action, href = null) {
  const element = action ? { disabled: false, dataset: action, getAttribute() { return null; } } : null;
  const link = href ? { href } : null;
  listeners.click({ target: { closest(selector) { return selector === '[data-act]' ? element : link; } } });
}

test('records the exact tab and game without URL query values', async () => {
  const { events, listeners } = await harness();
  assert.deepEqual(events[0].payload, { p_kind: 'page', p_key: 'world:arcade', p_title: '오락실' });
  click(listeners, { act: 'game-open', v: 'solitaire' });
  click(listeners, null, 'https://ojjuda.kr/features/fanpages/artist.html?group=rescene&token=private');
  assert.deepEqual(events[1].payload, { p_kind: 'game', p_key: 'solitaire', p_title: '솔리테어' });
  assert.deepEqual(events[2].payload, { p_kind: 'page', p_key: 'fanpage:rescene', p_title: '리센느 팬페이지' });
  assert.equal(JSON.stringify(events).includes('private'), false);
  assert.ok(events.every(entry => entry.options.keepalive));
});

test('does not report guest navigation', async () => {
  const { events, listeners } = await harness(false);
  click(listeners, { act: 'game-open', v: 'solitaire' });
  assert.equal(events.length, 0);
});

test('reuses the main authentication client and keeps one owner for fallback pages', async () => {
  const shared = await harness(true, true);
  assert.equal(shared.created(), 0, 'World must not create another GoTrueClient');
  assert.equal(shared.window.ojjudaSupabase, shared.client);
  assert.equal(shared.events.length, 1, 'navigation recording still works with the shared client');

  const standalone = await harness();
  assert.equal(standalone.created(), 1, 'standalone pages create at most one client');
  assert.equal(standalone.window.ojjudaSupabase, standalone.client, 'later modules reuse the fallback client');
});

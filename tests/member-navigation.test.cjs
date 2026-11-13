const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../shared/activity/member-navigation.js'), 'utf8');

async function harness(signedIn = true, sharedClient = false, options = {}) {
  const events = [], listeners = {};
  const location = new URL('https://ojjuda.kr' + (options.path || '/world.html?tab=arcade'));
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
  let helperCalls=0;
  if(options.sharedHelper)window.OjjudaGetClient=async()=>{helperCalls++;window.ojjudaSupabase=client;return client;};
  vm.runInNewContext(source, { window, document, location, URL, setTimeout, fetch: async (_url, options) => {
    events.push({ payload: JSON.parse(options.body), options }); return { ok: true };
  } });
  await new Promise(resolve => setImmediate(resolve));
  return { events, listeners, window, client, created: () => creations, helperCalls:()=>helperCalls };
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

test('biorhythm entry links and direct loads use the precise member-history title without private query values', async () => {
  const paths=['/features/biorhythm','/features/biorhythm/','/features/biorhythm/index.html'];
  const hub=await harness();
  for(const entry of paths) {
    click(hub.listeners,null,'https://ojjuda.kr'+entry+'?birth=PRIVATE-DOB&result=PRIVATE-RESULT');
    const direct=await harness(true,true,{path:entry+'?birth=PRIVATE-DOB'});
    assert.deepEqual(direct.events[0].payload,{p_kind:'page',p_key:'feature:biorhythm',p_title:'바이오리듬'});
    assert.match(direct.events[0].payload.p_key,/^[a-z0-9][a-z0-9_./:-]{0,119}$/,'the member-history server accepts the canonical key');
  }
  assert.deepEqual(hub.events.slice(1).map(entry=>entry.payload),[{p_kind:'page',p_key:'feature:biorhythm',p_title:'바이오리듬'}], 'route aliases share the same recent-entry deduplication key');
  assert.equal(JSON.stringify(hub.events).includes('PRIVATE'),false);
});

test('standalone member tracking waits for the shared lazy authentication client instead of creating its own', async () => {
  const fixture=await harness(true,false,{path:'/features/biorhythm/',sharedHelper:true});
  assert.equal(fixture.helperCalls(),1);
  assert.equal(fixture.created(),0);
  assert.equal(fixture.window.ojjudaSupabase,fixture.client);
  assert.equal(fixture.events[0].payload.p_title,'바이오리듬');
});

test('the config client helper coalesces concurrent SDK requests and reuses an existing client', async () => {
  const config=fs.readFileSync(path.join(__dirname,'../config.js'),'utf8');
  const scripts=[];
  const document={createElement(){return {remove(){}};},head:{append(script){scripts.push(script);}}};
  const window={};
  vm.runInNewContext(config,{window,document,location:new URL('https://ojjuda.kr/features/biorhythm/'),setTimeout,clearTimeout});
  const first=window.OjjudaGetClient(),second=window.OjjudaGetClient();
  assert.equal(first,second,'both callers wait on the same initialization');
  const sdk=scripts.filter(script=>script.src.includes('supabase-js'));
  assert.equal(sdk.length,1);
  let creations=0;
  const client={auth:{}};
  window.supabase={createClient(){creations++;return client;}};
  sdk[0].onload();
  assert.equal(await first,client);
  assert.equal(await second,client);
  assert.equal(await window.OjjudaGetClient(),client);
  assert.equal(creations,1);
  assert.match(scripts.find(script=>script.src.includes('member-navigation')).src,/20261113-biorhythm-paid1/);
});

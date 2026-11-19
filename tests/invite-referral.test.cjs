const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/auth/invite-referral.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(root, 'park/route.js'), 'utf8');
const key = 'ojjuda:signup-referral';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const tick = () => new Promise(resolve => setImmediate(resolve));
const member = id => ({ user: { id, is_anonymous: false }, access_token: 'never-share-this-token' });

function fixture(t, options = {}) {
  const dom = new JSDOM('<main><a id="signup" href="/?auth=signup&next=world" target="_blank">회원가입</a></main>', {
    url: 'https://ojjuda.kr' + (options.path || '/world.html?tab=hub'), runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  if (options.stored) window.sessionStorage.setItem(key, options.stored);
  if (options.noStorage) Object.defineProperty(window, 'sessionStorage', { get() { throw Error('storage blocked'); } });
  let current = options.session || null, listener, calls = 0;
  const client = { auth: {
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() {
      calls++;
      if (options.getSession) return options.getSession(calls);
      return { data: { session: current }, error: null };
    }
  } };
  window.OjjudaGetClient = async () => client;
  window.eval(source);
  return { window, document: window.document, api: window.OjjudaInvite, client,
    calls: () => calls,
    change(session, event = 'SIGNED_IN') { current = session; listener(event, session); }
  };
}

test('an incoming invitation survives reload and a later signup page in the same visit', async t => {
  const f = fixture(t, { path: '/world.html?place=park&ref=' + first });
  await f.api.ready();
  assert.equal(f.api.pending(), first);
  assert.equal(f.window.sessionStorage.getItem(key), first);
  const href = f.document.querySelector('#signup').getAttribute('href');
  assert.equal(href, '/?auth=signup&next=world&ref=' + first);
  const next = fixture(t, { path: '/?auth=signup&next=world', stored: f.window.sessionStorage.getItem(key) });
  await next.api.ready();
  assert.equal(next.api.pending(), first);
  assert.equal(new URL(next.api.withReferral('/?auth=login&next=pajang'), next.window.location.href).searchParams.get('ref'), first);
});

test('a new invitation replaces the previous visit reference', async t => {
  const f = fixture(t, { path: '/features/pajang/?ref=' + second, stored: first });
  await f.api.ready();
  assert.equal(f.api.pending(), second);
  assert.equal(f.window.sessionStorage.getItem(key), second);
});

for (const query of ['ref=not-a-member', 'ref=', 'ref=' + first + '&ref=' + second]) {
  test('an invalid or ambiguous invitation never reuses an older reference: ' + query, async t => {
    const f = fixture(t, { path: '/world.html?' + query, stored: first });
    await f.api.ready();
    assert.equal(f.api.pending(), null);
    assert.equal(f.window.sessionStorage.getItem(key), null);
    assert.equal(f.document.querySelector('#signup').getAttribute('href'), '/?auth=signup&next=world');
  });
}

test('storage restrictions still preserve a reference in dynamically created signup links', async t => {
  const f = fixture(t, { path: '/features/pajang/?ref=' + first, noStorage: true });
  await f.api.ready();
  const anchor = f.document.createElement('a');
  anchor.href = '/?auth=signup&next=pajang'; anchor.target = '_blank';
  f.document.querySelector('main').replaceChildren(anchor);
  await tick();
  assert.equal(anchor.getAttribute('href'), '/?auth=signup&next=pajang&ref=' + first);
  assert.equal(f.api.withReferral('https://outside.test/?auth=signup'), 'https://outside.test/?auth=signup');
  assert.equal(f.api.pending(), first);
});

test('a signup link clicked before the mutation observer runs still carries the invitation', async t => {
  const f = fixture(t, { path: '/world.html?ref=' + first });
  await f.api.ready();
  const anchor = f.document.createElement('a');
  anchor.href = '/?auth=signup&next=note'; anchor.innerHTML = '<span>가입</span>';
  f.document.body.append(anchor);
  anchor.addEventListener('click', event => event.preventDefault());
  anchor.firstElementChild.click();
  assert.equal(anchor.getAttribute('href'), '/?auth=signup&next=note&ref=' + first);
});

test('guest sharing does not turn the incoming inviter into the current sender', async t => {
  const f = fixture(t, { path: '/world.html?ref=' + first + '&access_token=private&code=secret#messages' });
  await f.api.ready();
  assert.equal(f.api.shareUrl('/world.html?tab=hub'), 'https://ojjuda.kr/world.html?tab=hub');
  assert.equal(f.api.pending(), first, 'the guest can still sign up using the original invitation');
});

test('member shares use their own ID and clear any received referral without writing an existing account', async t => {
  const f = fixture(t, { path: '/world.html?place=park&ref=' + first + '&code=secret#messages', session: member(second) });
  await f.api.ready();
  assert.equal(f.api.pending(), null);
  assert.equal(f.window.sessionStorage.getItem(key), null);
  assert.equal(new URL(f.window.location.href).searchParams.has('ref'), false);
  assert.equal(f.api.shareUrl('/world.html?place=park'), 'https://ojjuda.kr/world.html?place=park&ref=' + second);
  assert.equal(f.document.querySelector('#signup').getAttribute('href'), '/?auth=signup&next=world');
  assert.deepEqual(Object.keys(f.client).sort(), ['auth'], 'existing members need no referral-write RPC');
});

test('account switches and sign out immediately replace or remove the outgoing referrer', async t => {
  const f = fixture(t, { session: member(first) });
  await f.api.ready();
  assert.equal(new URL(f.api.shareUrl('/features/pajang/')).searchParams.get('ref'), first);
  f.change(member(second));
  assert.equal(new URL(f.api.shareUrl('/features/pajang/')).searchParams.get('ref'), second);
  f.change(null, 'SIGNED_OUT');
  assert.equal(f.api.shareUrl('/features/pajang/'), 'https://ojjuda.kr/features/pajang/');
});

test('an older session reply cannot overwrite an account change', async t => {
  let resolve;
  const f = fixture(t, { getSession: () => new Promise(done => { resolve = done; }) });
  await tick();
  f.change(member(second));
  resolve({ data: { session: member(first) }, error: null });
  await f.api.ready(); await tick();
  assert.equal(new URL(f.api.shareUrl('/world.html?tab=hub')).searchParams.get('ref'), second);
});

test('anonymous sessions never become referrers', async t => {
  const f = fixture(t, { path: '/world.html?ref=' + first, session: { user: { id: second, is_anonymous: true } } });
  await f.api.ready();
  assert.equal(f.api.shareUrl('/world.html?tab=hub'), 'https://ojjuda.kr/world.html?tab=hub');
  assert.equal(f.api.pending(), first);
});

test('restoring a frozen page replaces an unfinished auth read and ignores its old account', async t => {
  const replies = [];
  const f = fixture(t, { getSession: () => new Promise(resolve => { replies.push(resolve); }) });
  await tick();
  f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', { persisted: true }));
  await tick();
  assert.equal(f.calls(), 2, 'a restored page reads the current session again');
  replies[0]({ data: { session: member(first) }, error: null });
  await tick();
  assert.throws(() => f.api.shareUrl('/world.html?tab=hub'), /준비/);
  assert.equal(f.calls(), 2, 'an old finally cannot release the newer request lock');
  replies[1]({ data: { session: member(second) }, error: null });
  await f.api.ready();
  assert.equal(new URL(f.api.shareUrl('/world.html?tab=hub')).searchParams.get('ref'), second);
});

test('loading or failed auth cannot silently produce an unattributed member invitation', async t => {
  let resolve;
  const f = fixture(t, { getSession: calls => calls === 1 ? new Promise(done => { resolve = done; }) : Promise.resolve({ data: { session: member(first) }, error: null }) });
  assert.throws(() => f.api.shareUrl('/world.html?tab=hub'), /준비/);
  await tick();
  resolve({ data: { session: null }, error: { message: 'temporarily unavailable' } });
  assert.equal(await f.api.ready(), false);
  assert.throws(() => f.api.shareUrl('/world.html?tab=hub'), /불러오지 못했어요/);
  await f.api.ready();
  assert.equal(new URL(f.api.shareUrl('/world.html?tab=hub')).searchParams.get('ref'), first);
});

test('successful signup cleanup removes the invitation from storage, URL and links', async t => {
  const f = fixture(t, { path: '/?auth=signup&next=pajang&ref=' + first });
  await f.api.ready(); f.api.clear();
  assert.equal(f.api.pending(), null);
  assert.equal(f.window.sessionStorage.getItem(key), null);
  assert.equal(f.window.location.pathname + f.window.location.search, '/?auth=signup&next=pajang');
  assert.equal(f.api.withReferral('/?auth=signup&next=world&ref=' + first), '/?auth=signup&next=world');
});

test('loading the helper twice preserves one listener and its pending invitation', async t => {
  const f = fixture(t, { path: '/world.html?ref=' + first });
  await f.api.ready(); f.window.eval(source);
  assert.equal(f.window.OjjudaInvite, f.api);
  assert.equal(f.calls(), 1);
  assert.equal(f.api.pending(), first);
});

test('legacy Park entries forward only a valid invitation and their public route', () => {
  for (const query of ['ref=' + first, 'ref=invalid', 'ref=' + first + '&ref=' + second]) {
    const location = { href: 'https://ojjuda.kr/park/?' + query + '&access_token=private&card=abc#reply', origin: 'https://ojjuda.kr', replace(value) { this.result = value; } };
    const context = { URL, location }; context.window = context; context.parent = context;
    vm.runInNewContext(routeSource, context);
    const destination = new URL(location.result);
    assert.equal(destination.pathname, '/world.html');
    assert.equal(destination.searchParams.get('place'), 'park');
    assert.equal(destination.searchParams.get('card'), 'abc');
    assert.equal(destination.hash, '#reply');
    assert.equal(destination.searchParams.has('access_token'), false);
    assert.equal(destination.searchParams.get('ref'), query === 'ref=' + first ? first : null);
  }
});

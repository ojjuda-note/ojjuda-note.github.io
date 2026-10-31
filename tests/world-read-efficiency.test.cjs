const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(process.env.OJJUDA_WORLD_HTML || path.join(__dirname, '../world.html'), 'utf8');
const between = (start, end) => {
  const i = html.indexOf(start), j = html.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, start);
  return html.slice(i, j);
};
const accountSource = between('async function W1(', 'function U1(');
const pollSource = between(html.includes('var worldNewsPending=') ? 'var worldNewsPending=' : 'async function kc(', 'function fy(');
const friendCountSource = between('async function wd(', 'function syncWorldFriendOwner(');
const subscriptionSource = between('function fy(', 'var bm=');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const reads = [], subscriptions = [], errors = [];
  const state = { flushes: 0, renders: 0, friendRefreshes: 0, noticeRefreshes: 0, failures: new Set(), gate: null };
  const profile = { id: 'member-a', nickname: '회원', profile_photo_path: 'profile/photo.webp' };
  const priv = { user_id: 'member-a', coins: 210, data: { settings: { theme: 'dark' }, friends: [{ id: 'friend' }] } };
  const client = {
    from(table) {
      reads.push(table);
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, maybeSingle() { return query; },
        then(resolve, reject) {
          const data = table === 'profiles' ? profile : table === 'user_private' ? priv : table === 'friendships' ? [{ id: 'new-request' }] : [];
          return Promise.resolve(state.gate?.promise).then(() => ({ data, error: state.failures.has(table) ? Error('unavailable: ' + table) : null })).then(resolve, reject);
        }
      };
      return query;
    },
    channel() {
      const channel = { on(type, filter, callback) { subscriptions.push({ type, filter, callback }); return channel; }, subscribe() { return channel; } };
      return channel;
    }
  };
  const context = vm.createContext({
    S: client, D: { online: true, user: { id: 'member-a' } }, P: { incoming: [] }, wt: { notice: '' },
    document: { hidden: false }, console: { error: (...args) => errors.push(args) },
    je: () => context.D.user?.id,
    Wn: async () => { state.flushes++; },
    _d: async () => { reads.push('profiles', 'guestbook', 'intros'); await state.gate?.promise; return false; },
    Ls: async () => { reads.push('app_config'); await state.gate?.promise; return true; },
    K1() {}, ke: async () => { state.friendRefreshes++; context.P.incoming = [{ id: 'new-request' }]; },
    wc: () => true, H: () => { state.renders++; },
    worldNotifications: { refresh() { state.noticeRefreshes++; } }, Le: () => false,
    $: { settings: { notify: { friend: true, guestbook: true } } }, M() {}
  });
  vm.runInContext(accountSource + '\n' + friendCountSource + '\n' + pollSource + '\n' + subscriptionSource, context);
  return { context, reads, state, profile, priv, subscriptions, errors };
}

test('successful login reads only the two live account records', async t => {
  const f = fixture(); await f.context.W1('member-a');
  t.diagnostic('Account reads: ' + f.reads.length);
  assert.deepEqual(f.reads, ['profiles', 'user_private']);
});

test('login loads the two live account records without waiting on four retired tables', async () => {
  const f = fixture();
  for (const table of ['diaries', 'guestbook', 'intros', 'diary_likes']) f.state.failures.add(table);
  const account = await f.context.W1('member-a');
  assert.deepEqual(f.reads, ['profiles', 'user_private']);
  assert.equal(account.profile, f.profile);
  assert.equal(account.priv, f.priv, 'wallet, saved settings and friendships remain in the account data');
  for (const key of ['diaries', 'guestbook', 'intros', 'likes']) assert.equal(account[key].length, 0, key + ' remains compatible with the existing account mapper');
});

test('live profile/private read failures still fail login instead of silently using defaults', async () => {
  for (const table of ['profiles', 'user_private']) {
    const f = fixture(); f.state.failures.add(table);
    await assert.rejects(f.context.W1('member-a'), /unavailable/);
  }
});

test('ten concurrent news checks share one save and two live reads, and still refresh pending friends', async t => {
  const f = fixture(); f.state.gate = deferred();
  const pending = Array.from({ length: 10 }, () => f.context.kc());
  await tick();
  f.state.gate.resolve(); await Promise.all(pending);
  t.diagnostic('Reads for ten concurrent news checks: ' + f.reads.length);
  assert.deepEqual(f.reads.sort(), ['app_config', 'friendships']);
  assert.equal(f.state.flushes, 1, 'pending profile edits are still saved once');
  assert.equal(f.state.friendRefreshes, 1);
  assert.equal(f.state.renders, 1);
  assert.deepEqual(f.errors, []);
  await f.context.kc();
  assert.equal(f.reads.length, 4, 'the next scheduled check gets fresh data');
});

test('news checks stop in a hidden tab and reject old account/client responses', async () => {
  const hidden = fixture(); hidden.context.document.hidden = true; await hidden.context.kc();
  assert.equal(hidden.state.flushes, 0); assert.deepEqual(hidden.reads, []);
  for (const change of ['account', 'signout', 'client']) {
    const f = fixture(); f.state.gate = deferred(); const pending = f.context.kc(); await tick();
    if (change === 'account') f.context.D.user = { id: 'member-b' };
    if (change === 'signout') { f.context.D.online = false; f.context.D.user = null; }
    if (change === 'client') f.context.S = { ...f.context.S };
    f.state.gate.resolve(); await pending;
    assert.equal(f.state.friendRefreshes, 0, change + ' cannot apply an old pending count');
    assert.equal(f.state.renders, 0, change + ' cannot repaint the next session');
  }
});

test('live friend notifications remain subscribed without a retired guestbook subscription', async () => {
  const f = fixture(); f.context.fy();
  assert.deepEqual(f.subscriptions.map(entry => [entry.filter.table, entry.filter.event]), [['friendships', 'INSERT'], ['friendships', 'UPDATE']]);
  f.subscriptions[0].callback({ new: {} }); await tick();
  assert.equal(f.state.noticeRefreshes, 1); assert.equal(f.state.friendRefreshes, 1);
});

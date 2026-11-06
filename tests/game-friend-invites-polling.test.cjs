const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(process.env.OJJUDA_GAME_FRIEND_INVITES_JS || path.join(__dirname, '../shared/games/game-friend-invites.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function fixture(t, initiallyHidden = false) {
  const dom = new JSDOM('<div id="app"><main class="main"><div data-game-friend-invite-slot></div></main></div>', {
    url:'https://fixture.test/world.html', runScripts:'outside-only', pretendToBeVisual:true
  });
  const {window} = dom, requests = [], intervals = new Map(), timeouts = new Map();
  let now = Date.parse('2026-11-04T00:00:00Z'), hidden = initiallyHidden, uid = 'member-a', timerId = 0, binding;
  window.Date.now = () => now;
  Object.defineProperty(window.document, 'hidden', {get:() => hidden});
  window.setInterval = (callback, delay) => { const id = ++timerId; intervals.set(id, {callback, delay}); return id; };
  window.clearInterval = id => intervals.delete(id);
  window.setTimeout = (callback, delay) => { const id = ++timerId; timeouts.set(id, {callback, delay}); return id; };
  window.clearTimeout = id => timeouts.delete(id);

  function makeClient() {
    const client = {
      listeners:[], channels:[], removed:[],
      auth:{onAuthStateChange(callback) {
        const subscription = {callback, closed:false, unsubscribe() { this.closed = true; }};
        client.listeners.push(subscription);
        return {data:{subscription}};
      }},
      channel() {
        const value = {
          events:[],
          on(_type, filter, callback) { this.events.push({filter, callback}); return this; },
          subscribe(callback) { this.status = callback; return this; }
        };
        client.channels.push(value); return value;
      },
      removeChannel(value) { client.removed.push(value); },
      rpc(_name, args) {
        assert.equal(args.p_action, 'list', 'these checks only read the invitation list');
        return new Promise((resolve, reject) => requests.push({client, owner:uid, started:now, resolve, reject}));
      }
    };
    return client;
  }
  const client = makeClient();
  window.eval(source);
  function install(next = uid, nextClient = client) {
    uid = next;
    window.OjjudaFriendInvites.install({client:nextClient, user:() => uid, list:() => [], onJoin() {}});
    binding = {client:nextClient, auth:nextClient.listeners.at(-1), channel:nextClient.channels.at(-1)};
    return binding;
  }
  install();
  t.after(() => { window.OjjudaFriendInvites.stop(); window.close(); });
  await flush();
  return {
    window, requests, intervals, install, makeClient,
    get binding() { return binding; },
    row:() => window.document.querySelector('.game-friend-inline'),
    invite:(id, expires = now + 60000) => ({id, kind:'tank', sender_name:'친구', expires_at:new Date(expires).toISOString()}),
    async reply(index, invites = []) {
      const request = requests[index];
      request.resolve({data:{ok:true, invites, responses:[], server_now:new Date(request.started).toISOString()}});
      await flush();
    },
    async fail(index) { requests[index].reject(Error('offline')); await flush(); },
    async changed(count = 1, target = binding) {
      for (let i = 0; i < count; i++) target.channel.events[i % target.channel.events.length].callback();
      await flush();
    },
    async subscribed(target = binding) { target.channel.status('SUBSCRIBED'); await flush(); },
    async poll(ms = 10000) {
      now += ms;
      for (const timer of [...intervals.values()]) if (timer.delay === 10000) timer.callback();
      await flush();
    },
    async visibility(value) { hidden = value; window.document.dispatchEvent(new window.Event('visibilitychange')); await flush(); },
    async signOut() { uid = null; binding.auth.callback('SIGNED_OUT', null); await flush(); }
  };
}

test('initial subscription and polls share a slow read without discarding its successful invitation', async t => {
  const f = await fixture(t);
  assert.equal(f.requests.length, 1);
  const expires = f.requests[0].started + 60000;
  await f.subscribed(); await f.subscribed();
  await f.poll(); await f.poll();
  assert.equal(f.requests.length, 1, 'a response slower than two polling periods still has one RPC');
  await f.reply(0, [f.invite('slow', expires)]);
  assert.equal(f.row()?.dataset.invite, 'slow', 'polling cannot supersede the only pending response');
  assert.equal(f.row().querySelector('[data-seconds]').textContent, '40', 'network delay still counts against the original expiry');
  assert.equal(f.requests.length, 1, 'polling alone does not queue an unnecessary second read');
  await f.poll();
  assert.equal(f.requests.length, 2, 'the next poll after completion reads fresh data');
});

test('a burst of invitation changes queues one follow-up after the shared read', async t => {
  const f = await fixture(t);
  await f.changed(12); await f.poll();
  assert.equal(f.requests.length, 1);
  await f.reply(0, [f.invite('first')]);
  assert.equal(f.row()?.dataset.invite, 'first', 'the successful slow snapshot is usable while refreshing changes');
  assert.equal(f.requests.length, 2, 'all changes during the first read share one follow-up');
  await f.reply(1, [f.invite('latest')]);
  assert.equal(f.row()?.dataset.invite, 'latest');
  assert.equal(f.requests.length, 2);
});

test('hidden tabs defer reads and queued changes until the visible account resumes', async t => {
  const f = await fixture(t, true);
  await f.subscribed(); await f.changed(4); await f.poll();
  assert.equal(f.requests.length, 0, 'hidden installation, subscription and change events do not read');
  await f.visibility(false);
  assert.equal(f.requests.length, 1);
  await f.visibility(true); await f.changed(6);
  await f.reply(0, [f.invite('hidden')]);
  assert.equal(f.row(), null, 'a late response does not open an invitation in a hidden document');
  assert.equal(f.requests.length, 1, 'the queued read stays deferred while hidden');
  await f.visibility(false);
  assert.equal(f.requests.length, 2);
  await f.reply(1, [f.invite('visible')]);
  assert.equal(f.row()?.dataset.invite, 'visible');
});

test('a failed read releases the shared request and preserves one queued retry', async t => {
  const f = await fixture(t);
  await f.changed(5); await f.fail(0);
  assert.equal(f.requests.length, 2);
  await f.reply(1, [f.invite('recovered')]);
  assert.equal(f.row()?.dataset.invite, 'recovered');
  await f.poll(); await f.fail(2);
  assert.equal(f.requests.length, 3, 'a failure without new changes does not cause an immediate retry loop');
  await f.poll();
  assert.equal(f.requests.length, 4, 'the next scheduled check can recover');
});

test('sign-out drops a pending read and its queued follow-up', async t => {
  const f = await fixture(t), old = f.binding;
  await f.changed(); await f.signOut();
  await f.reply(0, [f.invite('signed-out')]);
  await f.changed(2, old); await f.subscribed(old); await f.visibility(false);
  assert.equal(f.row(), null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.window.OjjudaFriendInvites.available(), false);
  assert.equal(old.auth.closed, true);
  assert.ok(old.client.removed.includes(old.channel));
  assert.equal(f.intervals.size, 0);
});

for (const change of ['account', 'client']) {
  test('a previous ' + change + ' cannot overwrite or stop the current invitation session', async t => {
    const f = await fixture(t), old = f.binding;
    await f.changed(3);
    const next = change === 'account' ? 'member-b' : 'member-a';
    f.install(next, change === 'client' ? f.makeClient() : old.client);
    await flush();
    assert.equal(f.requests.length, 2, 'the new session starts its own read');
    old.auth.callback('SIGNED_OUT', null);
    await f.changed(4, old); await f.subscribed(old);
    assert.equal(f.window.OjjudaFriendInvites.available(), true, 'late callbacks from an unsubscribed listener cannot stop the new session');
    if (change === 'account') {
      await f.reply(0, [f.invite('obsolete')]);
      assert.equal(f.row(), null);
      await f.poll(0);
      assert.equal(f.requests.length, 2, 'completion of an old request cannot release the current pending read');
    }
    await f.reply(1, [f.invite('current')]);
    if (change === 'client') await f.reply(0, [f.invite('obsolete')]);
    assert.equal(f.row()?.dataset.invite, 'current');
    assert.equal(f.requests.length, 2, 'obsolete changes and the old queued follow-up cannot start another read');
  });
}

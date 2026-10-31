const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../game-friend-invites.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

async function fixture(onJoin, accept = async () => ({ok:true, kind:'tank', code:'A1B2C3D4'})) {
  const dom = new JSDOM('<div id="app"><main class="main"><div data-game-friend-invite-slot></div></main></div>', {url:'https://fixture.test/world.html', runScripts:'outside-only'});
  const {window} = dom, calls = [], subscriptions = [];
  let uid = 'me', inbox = [], authChanged, now = Date.now();
  window.Date.now = () => now;
  const channel = {on(_type, _filter, callback) { subscriptions.push(callback); return this; }, subscribe() { return this; }};
  const client = {
    auth:{onAuthStateChange(callback) { authChanged = callback; return {data:{subscription:{unsubscribe() {}}}}; }},
    channel:() => channel, removeChannel() {},
    async rpc(_name, args) {
      calls.push(args);
      if (args.p_action === 'list') return {data:{ok:true, invites:inbox.slice(), responses:[], server_now:new Date(now).toISOString()}};
      if (args.p_action === 'accept') { const data = await accept(); inbox = inbox.filter(item => item.id !== args.p_id); return {data}; }
      inbox = inbox.filter(item => item.id !== args.p_id);
      return {data:{ok:true}};
    }
  };
  window.eval(source);
  window.OjjudaFriendInvites.install({client, user:() => uid, list:() => [], onJoin});
  const refresh = async () => { subscriptions[0](); await flush(); };
  await flush();
  return {
    window, calls, refresh,
    row:() => window.document.querySelector('.game-friend-inline'),
    async receive(id) { inbox = [{id, kind:'tank', sender_name:'친구', expires_at:new Date(now + 60000).toISOString()}]; await refresh(); },
    async answer(action) { const button = window.document.querySelector('[data-answer="' + action + '"]'); assert.ok(button, action + ' button exists'); button.click(); await flush(); },
    async advance(ms) { now += ms; await refresh(); },
    async signOut() { uid = null; authChanged('SIGNED_OUT', null); await flush(); },
    close() { window.OjjudaFriendInvites.stop(); window.close(); }
  };
}

test('accepted invitation remains retryable after launch failure and original expiry', async () => {
  const joins = [];
  const f = await fixture(async (data, options) => {
    joins.push({data, signal:options?.signal});
    if (joins.length === 1) throw Error('game_asset_unavailable');
  });
  try {
    await f.receive('retry');
    await f.answer('accept');
    assert.ok(f.row(), 'failed game loading must leave a visible retry action');
    assert.equal(f.row().querySelector('[data-answer=accept]').textContent, '다시 시도');
    assert.equal(f.row().querySelector('[data-answer=decline]').textContent, '닫기');
    assert.equal(f.row().querySelector('.ge-inline-time').hidden, true);
    assert.match(f.row().querySelector('[data-invite-status]').textContent, /다시 시도/);
    await f.advance(61000);
    await f.receive('next');
    assert.equal(f.row().dataset.invite, 'retry', 'polling and newer invitations preserve accepted retry');
    await f.answer('accept');
    assert.equal(f.calls.filter(call => call.p_action === 'accept').length, 1, 'retry never accepts the consumed invitation twice');
    assert.equal(joins.length, 2);
    assert.deepEqual(joins.map(join => join.data.code), ['A1B2C3D4', 'A1B2C3D4']);
    assert.equal(joins[1].signal.aborted, false, 'successful launch is not cancelled while removing its invitation');
    assert.equal(f.row().dataset.invite, 'next');
  } finally { f.close(); }
});

for (const reject of [false, true]) {
  test('dismissal aborts loading and ignores its late ' + (reject ? 'failure' : 'success'), async () => {
    const loading = deferred(); let signal;
    const f = await fixture((_data, options) => { signal = options?.signal; return loading.promise; });
    try {
      await f.receive('loading'); await f.answer('accept');
      assert.ok(f.row());
      assert.equal(f.row().querySelector('[data-answer=decline]').disabled, false);
      await f.answer('decline');
      assert.equal(signal.aborted, true);
      assert.equal(f.calls.filter(call => call.p_action === 'decline').length, 0, 'dismissal never reverses server acceptance');
      await f.receive('newer');
      if (reject) loading.reject(Error('late loading failure')); else loading.resolve();
      await flush();
      assert.equal(f.row().dataset.invite, 'newer');
      assert.equal(f.row().querySelector('[data-invite-status]').textContent, '친구가 게임에 초대했습니다.');
    } finally { f.close(); }
  });

  test('acceptance can be dismissed before its late ' + (reject ? 'failure' : 'success'), async () => {
    const acceptance = deferred(); let joins = 0;
    const f = await fixture(() => { joins++; }, () => acceptance.promise);
    try {
      await f.receive('accepting'); await f.answer('accept');
      assert.equal(f.row().querySelector('[data-answer=decline]').disabled, false);
      await f.answer('decline'); await f.receive('newer');
      if (reject) acceptance.reject(Error('late acceptance failure'));
      else acceptance.resolve({ok:true, kind:'tank', code:'A1B2C3D4'});
      await flush();
      assert.equal(joins, 0, 'dismissed invitation must not open a game later');
      assert.equal(f.row().dataset.invite, 'newer');
      assert.equal(f.calls.filter(call => call.p_action === 'decline').length, 0);
    } finally { f.close(); }
  });
}

test('sign-out cancels an accepted launch and discards its retry state', async () => {
  const loading = deferred(); let signal;
  const f = await fixture((_data, options) => { signal = options?.signal; return loading.promise; });
  try {
    await f.receive('logout'); await f.answer('accept'); await f.signOut();
    assert.equal(signal.aborted, true);
    loading.reject(Error('late failure')); await flush();
    assert.equal(f.row(), null);
  } finally { f.close(); }
});

test('transient acceptance failure restores rejection and retries server acceptance', async () => {
  let accepts = 0, joins = 0;
  const f = await fixture(() => { joins++; }, async () => {
    if (++accepts === 1) throw Error('offline');
    return {ok:true, kind:'tank', code:'A1B2C3D4'};
  });
  try {
    await f.receive('rpc-retry'); await f.answer('accept');
    assert.equal(f.row().querySelector('[data-answer=accept]').disabled, false);
    assert.equal(f.row().querySelector('[data-answer=decline]').disabled, false);
    assert.equal(f.row().querySelector('[data-answer=decline]').textContent, '거부');
    assert.equal(f.row().querySelector('.ge-inline-time').hidden, false);
    assert.equal(f.row().querySelector('[data-invite-status]').hidden, false);
    await f.answer('accept');
    assert.equal(accepts, 2); assert.equal(joins, 1); assert.equal(f.row(), null);
  } finally { f.close(); }
});

test('failed acceptance keeps the original expiry and never sends a false rejection', async () => {
  const f = await fixture(() => assert.fail('failed acceptance cannot launch'), async () => { throw Error('offline'); });
  try {
    await f.receive('rpc-expiry'); await f.advance(40000); await f.answer('accept');
    assert.ok(f.row());
    await f.advance(21000);
    assert.equal(f.row(), null, 'failed acceptance does not restart the sixty-second deadline');
    assert.equal(f.calls.filter(call => call.p_action === 'decline').length, 0);
  } finally { f.close(); }
});

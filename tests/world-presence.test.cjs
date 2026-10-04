const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
function section(start, end) {
  const first = world.indexOf(start), last = world.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `production presence code: ${start}`);
  return world.slice(first, last);
}
const source = section('function B0(', 'function C0(') +
  section('async function Pa(', 'async function _0(');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const place = id => ({id, ch: 1, live: true, joined: false, npcs: [], me: {gx: 2, gy: 3}});

function fixture() {
  const timers = new Map(), channels = [], lobby = [], joined = [], people = [], removed = [];
  let clock = 0, sequence = 0; const reads = [];
  const context = {
    D: {user: {id: 'alice'}}, $: {me: {nick: 'Alice', mood: 'happy'}, avatar: {hair: 'short'}},
    Wo: null, Vo: 0, A0: null, Xr: true, console,
    Ze: {track(payload) { lobby.push(payload); return Promise.resolve('ok'); }},
    jt: {onJoined(room) { joined.push(room.id); }},
    M0: async () => {}, Jr: (id, ch) => `${id}-${ch}`, mh: () => 1,
    C0: room => people.push(room.id), Le: () => false,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, {at: clock + delay, callback}); return id; },
    clearTimeout(id) { timers.delete(id); },
    S: {
      channel(name) {
        const channel = {
          name, sent: [], events: [],
          on(kind, filter, callback) { this.events.push({kind, filter, callback}); return this; },
          subscribe(callback) { this.status = callback; return this; },
          track(payload) { this.sent.push(payload); return this.trackWait?.promise || Promise.resolve('ok'); },
          untrack() { return this.leaveWait?.promise || Promise.resolve('ok'); },
          presenceState() { return {}; }
        };
        channels.push(channel); return channel;
      },
      removeChannel(channel) { removed.push(channel); },
      from(table) {
        reads.push(table);
        const query = {select() { return this; }, eq() { return this; }, gt() { return this; },
          order() { return this; }, limit() { return Promise.resolve({data: [], error: null}); }};
        return query;
      }
    }
  };
  vm.createContext(context); vm.runInContext(source, context);
  const tick = ms => {
    clock += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) {
      timers.delete(id); timer.callback();
    }
  };
  return {context, timers, channels, lobby, joined, people, removed, tick, reads};
}

(async () => {
  // Park keeps presence, without subscribing to messages or fetching chat history.
  {
    const f=fixture(); await f.context.Pa(place('park'),1);
    assert.deepEqual(f.channels[0].events.map(event=>event.kind),['presence']);
    assert.deepEqual(f.reads,[]);
    await f.channels[0].status('SUBSCRIBED'); assert.deepEqual(f.joined,['park']);
    await f.context.Pa(place('cafe'),1);
    assert.deepEqual(f.channels[1].events.map(event=>event.kind),['presence','broadcast','postgres_changes']);
    assert.deepEqual(f.reads,['place_messages']);
  }
  // Coalescing still publishes the latest movement, without copying stale state.
  {
    const f = fixture(), room = place('cafe');
    await f.context.Pa(room, 1); const channel = f.channels[0];
    await channel.status('SUBSCRIBED'); channel.sent.length = 0;
    f.context.rn(room); f.tick(70); room.me.target = {gx: 7, gy: 6, lift: 18};
    f.context.rn(room); f.tick(119); assert.equal(channel.sent.length, 0);
    f.tick(1); assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0].uid, 'alice'); assert.equal(channel.sent[0].gx, 7);
    assert.equal(channel.sent[0].gy, 6); assert.equal(channel.sent[0].lift, 18);
    assert.equal(room.joined, true); assert.deepEqual(f.joined, ['cafe']);
  }
  for (const transition of ['leave', 'logout', 'account', 'channel']) {
    const f = fixture(), room = place('cafe');
    await f.context.Pa(room, 1); const old = f.channels[0];
    f.context.rn(room);
    if (transition === 'leave') await f.context.Vs();
    if (transition === 'logout') f.context.D.user = null;
    if (transition === 'account') f.context.D.user = {id: 'bob'};
    if (transition === 'channel') await f.context.Pa(place('park'), 2);
    assert.doesNotThrow(() => f.tick(120), transition + ': pending movement is harmless');
    assert.equal(old.sent.length, 0, transition + ': no stale track reaches the old channel');
  }
  // A pending initial track must not mark the old room joined or publish it to the lobby.
  for (const transition of ['leave', 'logout', 'account', 'channel']) {
    const f = fixture(), room = place('cafe');
    await f.context.Pa(room, 1); const old = f.channels[0];
    old.trackWait = deferred(); const completing = old.status('SUBSCRIBED');
    assert.equal(old.sent.length, 1);
    if (transition === 'leave') await f.context.Vs();
    if (transition === 'logout') f.context.D.user = null;
    if (transition === 'account') f.context.D.user = {id: 'bob'};
    if (transition === 'channel') {
      await f.context.Pa(place('park'), 2); await f.channels[1].status('SUBSCRIBED');
    }
    const before = JSON.stringify({lobby: f.lobby, joined: f.joined, people: f.people});
    old.trackWait.resolve('ok'); await completing;
    assert.equal(room.joined, false, transition + ': a stale completion cannot join');
    assert.equal(JSON.stringify({lobby: f.lobby, joined: f.joined, people: f.people}), before,
      transition + ': a stale completion cannot re-advertise the old room');
  }
  // Leaving an old channel may be slower than joining the new one.
  {
    const f = fixture(); await f.context.Pa(place('cafe'), 1);
    const old = f.channels[0]; old.leaveWait = deferred();
    const leaving = f.context.Vs();
    await f.context.Pa(place('park'), 2); await f.channels[1].status('SUBSCRIBED');
    old.leaveWait.resolve('ok'); await leaving;
    assert.equal(f.lobby.at(-1).place, 'park', 'old untrack cannot clear the newer lobby presence');
  }
  // An older join waiting for untrack must not supersede a newer join or new account.
  for (const transition of ['channel', 'logout', 'account']) {
    const f = fixture(); await f.context.Pa(place('cafe'), 1);
    const old = f.channels[0]; old.leaveWait = deferred();
    const pending = f.context.Pa(place('library'), 2);
    if (transition === 'channel') await f.context.Pa(place('park'), 3);
    if (transition === 'logout') f.context.D.user = null;
    if (transition === 'account') f.context.D.user = {id: 'bob'};
    old.leaveWait.resolve('ok'); await pending;
    assert.ok(!f.channels.some(channel => channel.name === 'place:library-2'),
      transition + ': superseded join is cancelled before channel creation');
  }
  console.log('PASS World presence: latest movement, leave/logout/account isolation, stale track completion and overlapping joins');
})().catch(error => { console.error(error); process.exitCode = 1; });

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
const source = section('async function M0(', 'var D0=') + section('function B0(', 'function C0(') +
  section('async function Pa(', 'async function _0(');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const place = id => ({id, ch: 1, live: true, joined: false, npcs: [], me: {gx: 2, gy: 3}});

function fixture() {
  const timers = new Map(), channels = [], lobby = [], joined = [], people = [], removed = [], connections = [], tokens = [];
  const auth = {session: {user: {id: 'alice'}, access_token: 'alice-token'}};
  let clock = 0, sequence = 0; const reads = [];
  const context = {
    D: {online: true, user: {id: 'alice'}}, $: {me: {nick: 'Alice', mood: 'happy'}, avatar: {hair: 'short'}},
    Wo: null, Vo: 0, A0: null, worldPresenceRetry: null, worldLobbyJoining: null, console,
    g: {place: null}, document: {hidden: false}, Event,
    window: {addEventListener() {}, dispatchEvent() {}}, en: {},
    Ze: {track(payload) { lobby.push(payload); return Promise.resolve('ok'); }},
    jt: {onJoined(room) { joined.push(room.id); }, onConnection(room) { connections.push(room.presenceStatus); }},
    mh: () => 1,
    C0: room => people.push(room.id), Le: () => false,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, {at: clock + delay, callback}); return id; },
    clearTimeout(id) { timers.delete(id); },
    S: {
      auth: {async getSession() { return auth.pending?.promise || {data: {session: auth.session}, error: auth.error}; }},
      realtime: {async setAuth(token) { tokens.push(token); }},
      channel(name, options) {
        const channel = {
          name, options, sent: [], events: [],
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
  return {context, timers, channels, lobby, joined, people, removed, tick, reads, auth, connections, tokens};
}
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };

(async () => {
  // A missing, failed or different account session must never join with the API key.
  for (const state of ['missing', 'error', 'different']) {
    const f=fixture(), room=place('arcade'); f.context.Ze=null;
    if (state==='missing') f.auth.session=null;
    if (state==='error') f.auth.error=new Error('network unavailable');
    if (state==='different') f.auth.session.user.id='bob';
    await f.context.Qs(); await f.context.Pa(room,1);
    assert.equal(f.channels.length,0,state+': no anonymous or wrong-account channel');
    assert.equal(f.tokens.length,0); assert.equal(room.presenceStatus,'auth');
    assert.equal(f.timers.size,1,'one delayed retry, no busy loop');
    f.auth.error=null; f.auth.session={user:{id:'alice'},access_token:'fresh-token'};
    f.tick(15000); await flush();
    assert.equal(f.channels.length,1); assert.equal(f.channels[0].options.config.private,true);
    assert.equal(f.tokens.at(-1),'fresh-token');
  }
  // Repeated failures stay private, recover without a popup, and cancel pending retries.
  {
    const f=fixture(), room=place('arcade'); await f.context.Pa(room,1);
    const channel=f.channels[0]; await channel.status('SUBSCRIBED');
    await channel.status('CHANNEL_ERROR',new Error('Unauthorized'));
    await channel.status('TIMED_OUT');
    assert.equal(room.joined,false); assert.equal(f.timers.size,1);
    assert.equal(f.channels.length,1,'SDK can retry without immediate duplicate subscriptions');
    assert.equal(channel.options.config.private,true,'auth failures never downgrade to public');
    await channel.status('SUBSCRIBED');
    assert.equal(room.joined,true); assert.equal(room.presenceStatus,'connected'); assert.equal(f.timers.size,0);
    await channel.status('CLOSED'); f.tick(15000); await flush();
    assert.equal(f.channels.length,2,'closed channel is replaced after backoff');
    assert.ok(f.removed.includes(channel));
  }
  // A rejected track is not treated as a successful presence join.
  {
    const f=fixture(), room=place('arcade'); await f.context.Pa(room,1);
    const channel=f.channels[0]; await channel.status('SUBSCRIBED'); f.auth.session=null;
    await channel.status('CHANNEL_ERROR',new Error('Unauthorized')); await flush();
    assert.equal(f.context.Wo,null,'lost session stops authenticated presence before anonymous SDK retries');
    assert.ok(f.removed.includes(channel)); assert.equal(room.presenceStatus,'auth');
    f.tick(15000); await flush(); assert.equal(f.channels.length,1,'missing session cannot recreate a channel');
    await f.context.Vs(); assert.equal(f.timers.size,0);
  }
  for (const transition of ['leave','logout','account']) {
    const f=fixture(); await f.context.Pa(place('arcade'),1);
    await f.channels[0].status('TIMED_OUT');
    if (transition==='leave') await f.context.Vs();
    if (transition==='logout') f.context.D.user=null;
    if (transition==='account') f.context.D.user={id:'bob'};
    f.tick(15000); await flush();
    assert.equal(f.channels.length,1,'delayed retry cannot rejoin after '+transition);
  }
  {
    const f=fixture(), room=place('arcade'); await f.context.Pa(room,1);
    f.channels[0].trackWait={promise:Promise.resolve('error')};
    await f.channels[0].status('SUBSCRIBED');
    assert.equal(room.joined,false); assert.deepEqual(f.joined,[]); assert.deepEqual(f.lobby,[]);
    assert.equal(f.timers.size,1);
    await f.context.Vs(); assert.equal(f.timers.size,0);
  }
  // The real UI callback changes only the room status; solo game state and toast stay untouched.
  {
    const f=fixture(), room=place('arcade'), label={textContent:''}, toasts=[];
    const game={kind:'janggi',mode:'ai',moves:12}; f.context.g.place=room; f.context.game=game;
    f.context.vf=false; f.context.z=selector=>selector==='#pcount'?label:null;
    f.context.M=message=>toasts.push(message);
    vm.runInContext(section('function bg(', 'function Sf('),f.context); f.context.bg();
    await f.context.Pa(room,1); await f.channels[0].status('CHANNEL_ERROR',new Error('Unauthorized'));
    assert.equal(label.textContent,'접속자 인증 확인 중'); assert.deepEqual(toasts,[]);
    assert.deepEqual(game,{kind:'janggi',mode:'ai',moves:12});
    const other=place('park'); f.context.worldPresenceChanged(other,'reconnecting');
    assert.equal(label.textContent,'접속자 인증 확인 중','old room cannot overwrite current status');
    f.context.worldPresenceChanged(room,'connected'); assert.equal(label.textContent,'지금 1명');
  }
  // Concurrent lobby startup produces one private channel, scoped to the account that started it.
  {
    const f=fixture(); f.context.Ze=null; f.auth.pending=deferred();
    const first=f.context.Qs(), second=f.context.Qs();
    f.auth.pending.resolve({data:{session:f.auth.session}}); await Promise.all([first,second]);
    assert.equal(f.channels.length,1); assert.equal(f.channels[0].options.config.private,true);
    f.context.D.user={id:'bob'};
    await f.channels[0].status('SUBSCRIBED'); assert.deepEqual(f.channels[0].sent,[]);
  }
  for (const transition of ['logout','account']) {
    const f=fixture(); f.context.Ze=null; f.auth.pending=deferred();
    const pending=f.context.Qs(); f.context.D.user=transition==='logout'?null:{id:'bob'};
    f.auth.pending.resolve({data:{session:f.auth.session}}); await pending;
    assert.equal(f.channels.length,0,'pending lobby join is cancelled on '+transition);
  }
  // Park and Arcade keep presence without messages, reactions or chat history.
  {
    const f=fixture(); await f.context.Pa(place('park'),1);
    assert.deepEqual(f.channels[0].events.map(event=>event.kind),['presence']);
    assert.deepEqual(f.reads,[]);
    await f.channels[0].status('SUBSCRIBED'); assert.deepEqual(f.joined,['park']);
    await f.context.Pa(place('arcade'),1);
    assert.deepEqual(f.channels[1].events.map(event=>event.kind),['presence']);
    assert.deepEqual(f.reads,[]);
  }
  // Coalescing still publishes the latest movement, without copying stale state.
  {
    const f = fixture(), room = place('arcade');
    await f.context.Pa(room, 1); const channel = f.channels[0];
    await channel.status('SUBSCRIBED'); channel.sent.length = 0;
    f.context.rn(room); f.tick(70); room.me.target = {gx: 7, gy: 6, lift: 18};
    f.context.rn(room); f.tick(119); assert.equal(channel.sent.length, 0);
    f.tick(1); assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0].uid, 'alice'); assert.equal(channel.sent[0].gx, 7);
    assert.equal(channel.sent[0].gy, 6); assert.equal(channel.sent[0].lift, 18);
    assert.equal(room.joined, true); assert.deepEqual(f.joined, ['arcade']);
  }
  for (const transition of ['leave', 'logout', 'account', 'channel']) {
    const f = fixture(), room = place('arcade');
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
    const f = fixture(), room = place('arcade');
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
    const f = fixture(); await f.context.Pa(place('arcade'), 1);
    const old = f.channels[0]; old.leaveWait = deferred();
    const leaving = f.context.Vs();
    await f.context.Pa(place('park'), 2); await f.channels[1].status('SUBSCRIBED');
    old.leaveWait.resolve('ok'); await leaving;
    assert.equal(f.lobby.at(-1).place, 'park', 'old untrack cannot clear the newer lobby presence');
  }
  // An older join waiting for untrack must not supersede a newer join or new account.
  for (const transition of ['channel', 'logout', 'account']) {
    const f = fixture(); await f.context.Pa(place('arcade'), 1);
    const old = f.channels[0]; old.leaveWait = deferred();
    const pending = f.context.Pa(place('arcade'), 2);
    if (transition === 'channel') await f.context.Pa(place('park'), 3);
    if (transition === 'logout') f.context.D.user = null;
    if (transition === 'account') f.context.D.user = {id: 'bob'};
    old.leaveWait.resolve('ok'); await pending;
    assert.ok(!f.channels.some(channel => channel.name === 'place:arcade-2'),
      transition + ': superseded join is cancelled before channel creation');
  }
  console.log('PASS World presence: session ownership, private auth, quiet recovery, track failures, solo game isolation, lobby races, movement and overlapping joins');
})().catch(error => { console.error(error); process.exitCode = 1; });

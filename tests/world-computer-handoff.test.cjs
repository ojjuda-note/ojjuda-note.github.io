const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const watches = source.slice(source.indexOf('function Uo('), source.indexOf('var R0=', source.indexOf('function Uo(')));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const game = (patch = {}) => ({ id: 'game-a', kind: 'chess', status: 'playing', p1: 'member-a', p2: 'member-b', p1_nick: '나', p2_nick: '친구', computer_seats: ['p2'], moves: [{ f: 52, t: 36 }], turn: 'p2', ...patch });

function fixture(t) {
  const dom = new JSDOM('<div id="bd-root"></div>', { runScripts: 'outside-only' }), w = dom.window;
  const timers = new Map(), channels = [], reads = [], computers = [], received = [], saved = [];
  let hidden = false, nextTimer = 0;
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  w.setInterval = callback => { const id = ++nextTimer; timers.set(id, callback); return id; };
  w.clearInterval = id => timers.delete(id);
  const client = {
    channel() { const channel = { on(_event, _filter, callback) { channel.receive = callback; return channel; }, subscribe() { return channel; } }; channels.push(channel); return channel; },
    removeChannel(channel) { channel.removed = true; },
    from() { return { select() { return this; }, eq(_key, id) { this.id = id; return this; }, maybeSingle() { const pending = deferred(); reads.push({ id: this.id, ...pending }); return pending.promise; } }; }
  };
  w.client = client;
  w.computer = (action, args) => { const pending = deferred(); computers.push({ action, args, ...pending }); return pending.promise; };
  w.receive = record => received.push(record);
  w.saved = owner => saved.push(owner);
  w.eval(`
    var D={online:true,user:{id:'member-a'}},S=window.client,E={mode:'online',owner:'member-a',online:{id:'game-a'}},k=null;
    var Ks=null,Ga=null,worldBoardWatch=0,worldBoardWake=null,worldBoardExitCleanup=null;
    function verifiedGameCall(action,args){return window.computer(action,args);}
    function notifyStreakSaved(owner){window.saved(owner);}
    ${watches}
  `);
  t.after(() => { w.Uo(); w.close(); });
  return { w, timers, channels, reads, computers, received, saved,
    start(record = game()) { w.cn(record.id, w.receive, () => !!w.E && !w.E.over, record); },
    async poll() { for (const callback of [...timers.values()]) callback(); await tick(); },
    async visibility(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await tick(); }
  };
}

test('an inherited opponent turn invokes one server AI action and accepts its authoritative board', async t => {
  const f = fixture(t); f.start();
  assert.equal(f.computers.length, 1); assert.equal(f.computers[0].action, 'game_tick');
  assert.equal(f.computers[0].args.p_ply, 1);
  assert.ok(f.w.E.pendingComputer, 'exit can wait for the AI commit already in flight');
  f.channels[0].receive({ new: game() }); f.channels[0].receive({ new: game() });
  assert.equal(f.computers.length, 1, 'duplicate realtime updates share one server operation');
  const next = game({ moves: [{ f: 52, t: 36 }, { f: 12, t: 28 }], turn: 'p1' });
  f.computers[0].resolve({ data: { ok: true, game: next }, error: null }); await tick();
  assert.equal(f.received.at(-1), next); assert.equal(f.w.E.pendingComputer, null);
  assert.equal(f.w.worldComputerName(next, 'p2'), '친구 · 컴퓨터');
  assert.equal(f.w.worldComputerName(next, 'p1'), '나');
  assert.equal(f.computers.length, 1, 'the human turn is never played automatically');
});

test('a normal human opponent never starts a takeover action', async t => {
  const f = fixture(t); f.start(game({ computer_seats: [] }));
  assert.equal(f.computers.length, 0);
  await f.poll(); f.reads[0].resolve({ data: game({ computer_seats: [] }), error: null }); await tick();
  assert.equal(f.computers.length, 0);
});

test('hidden games do no extra polling or AI work and refresh promptly on return', async t => {
  const f = fixture(t); await f.visibility(true); f.start(); await f.poll();
  assert.equal(f.reads.length, 0); assert.equal(f.computers.length, 0);
  await f.visibility(false); await f.visibility(false);
  assert.equal(f.reads.length, 1, 'return reads are single-flight');
  f.reads[0].resolve({ data: game(), error: null }); await tick();
  assert.equal(f.computers.length, 1);
  f.computers[0].resolve({ data: { ok: true }, error: null }); await tick();
});

for (const interruption of ['closing', 'account', 'new-game']) {
  test(interruption + ' discards an old AI result without reopening or moving the next game', async t => {
    const f = fixture(t); f.start();
    if (interruption === 'closing') f.w.E.closing = true;
    if (interruption === 'account') f.w.D.user.id = 'member-c';
    if (interruption === 'new-game') { f.w.Uo(); f.w.E = { mode: 'online', online: { id: 'game-b' } }; }
    f.computers[0].resolve({ data: { ok: true, game: game({ status: 'done' }) }, error: null }); await tick();
    assert.equal(f.received.length, 0); assert.equal(f.saved.length, 0);
  });
}

test('an old timer callback cannot dispose a newer game subscription', async t => {
  const f = fixture(t); f.start(game({ computer_seats: [] })); const obsolete = [...f.timers.values()][0];
  f.w.E = { mode: 'online', online: { id: 'game-b' } }; f.start(game({ id: 'game-b', computer_seats: [] }));
  obsolete(); await tick();
  assert.equal(f.timers.size, 1); assert.equal(f.channels[1].removed, undefined);
  await f.poll(); assert.equal(f.reads[0].id, 'game-b');
  f.reads[0].resolve({ data: game({ id: 'game-b', computer_seats: [] }), error: null }); await tick();
  assert.equal(f.received.at(-1).id, 'game-b');
});

test('a temporary AI request failure remains retryable without a tight retry loop', async t => {
  const f = fixture(t); f.start(); f.computers[0].resolve({ error: new Error('offline') }); await tick();
  assert.equal(f.computers.length, 1); assert.equal(f.w.E.pendingComputer, null);
  await f.poll(); f.reads[0].resolve({ data: game(), error: null }); await tick();
  assert.equal(f.computers.length, 2); f.computers[1].resolve({ data: { ok: true }, error: null }); await tick();
});

test('closing the page sends authenticated keepalive leave after its pending move', async t => {
  const f = fixture(t), pending = deferred(), sent = [];
  f.w.eval("var Pc='https://fixture.supabase.test',Nc='public-test-key';");
  f.w.S.auth = { getSession: async () => ({ data: { session: { user: { id: 'member-a' }, access_token: 'fixture-token' } } }) };
  f.w.fetch = (url, options) => { sent.push({ url, options }); return Promise.resolve({ ok: true }); };
  f.start(game({ computer_seats: [] })); f.w.E.pendingAction = pending.promise; await tick();
  f.w.dispatchEvent(new f.w.Event('pagehide')); await tick(); assert.equal(sent.length, 0);
  pending.resolve(); await tick();
  assert.equal(sent.length, 1); assert.equal(sent[0].options.keepalive, true);
  assert.equal(sent[0].url, 'https://fixture.supabase.test/rest/v1/rpc/game_leave');
  assert.deepEqual(JSON.parse(sent[0].options.body), { p_id: 'game-a' });
  assert.equal(sent[0].options.headers.Authorization, 'Bearer fixture-token');
});

test('a page-exit request cannot cross an account change or a disposed subscription', async t => {
  const f = fixture(t), sent = [];
  f.w.eval("var Pc='https://fixture.supabase.test',Nc='public-test-key';");
  f.w.S.auth = { getSession: async () => ({ data: { session: { user: { id: 'member-a' }, access_token: 'fixture-token' } } }) };
  f.w.fetch = (...args) => { sent.push(args); return Promise.resolve({ ok: true }); };
  f.start(game({ computer_seats: [] })); await tick();
  f.w.D.user.id = 'member-b'; f.w.dispatchEvent(new f.w.Event('pagehide')); await tick();
  assert.equal(sent.length, 0);
  f.w.D.user.id = 'member-a'; f.w.Uo(); f.w.dispatchEvent(new f.w.Event('pagehide')); await tick();
  assert.equal(sent.length, 0);
});

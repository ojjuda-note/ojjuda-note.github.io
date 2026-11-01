const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const rounds = world.slice(world.indexOf('async function _2(){'), world.indexOf('function z2('));
const closeStart = world.indexOf('function El(){');
const close = world.slice(closeStart, world.indexOf("window.addEventListener('pagehide'", closeStart));
const routing = world.slice(world.indexOf('var bm=null;var worldEntryRouted=false;'), world.indexOf('// Member rooms use their own account'));
const entrance = world.slice(world.indexOf('function Al('), world.indexOf('// User-requested exits'));
const controls = world.slice(world.indexOf('function M2('), world.indexOf('function D2('));
const preview = world.slice(world.indexOf('function D2('), world.indexOf('async function nf('));

function fixture(id = 'stacker', options = {}) {
  const events = [], records = [], screens = [], completions = [];
  const controls = { innerHTML: '' }, receipt = { innerHTML: '' };
  const game = { update() {}, draw() {} };
  const context = vm.createContext({
    console, Promise, performance, URL,
    window: { OjjudaGuestAccess: { canPlay: () => options.allowed !== false, finished(options) { events.push(['finished']); completions.push(options); } } },
    document: { getElementById: () => null, querySelector: () => null, body: { classList: { remove() {} } } },
    R: { id, running: false, loading: false, game: null, ctx: {}, ov: { querySelector: selector => selector === '#gres' ? receipt : controls, remove() { events.push(['closed']); } } },
    G2: { [id]: () => game }, _r: { [id]: { unit: id === 'stacker' ? '층' : '점' } },
    gt: { arcadeEnd() {} },
    worldGameAssetRequest: 0, worldClosingGames: null,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    worldRewardRequest: () => ({}), worldRewardCurrent: () => true,
    ti: html => screens.push(html), Ja() {}, nf() {}, w: value => String(value),
    tf: async (key, score) => { records.push({ key, score }); return { ok: true, best: score, rank: 1, guest: true }; }
  });
  context.window.removeEventListener = () => {};
  if (!options.missing) context.window.OjjudaGameChallenges = {
    onStart(game) { if (options.broken) throw Error('analytics unavailable'); events.push(['start', game]); },
    resultMarkup(game, score) { if (options.broken) throw Error('sharing unavailable'); events.push(['complete', game, score]); return '<button data-challenge-share>친구에게 도전</button>'; }
  };
  vm.runInContext(rounds + '\n' + close, context);
  return { context, events, records, screens, receipt, completions };
}

for (const game of ['stacker', 'mole']) {
  test(game + ': opening alone does not count a start; finishing preserves scoring and exposes sharing once', async () => {
    const f = fixture(game);
    assert.deepEqual(f.events, []);
    await f.context._2();
    await f.context._2();
    assert.equal(f.context.R.running, true);
    assert.deepEqual(f.events, [['start', game]], 'repeat clicks while running do not count another round');
    await f.context.S2(12);
    await f.context.S2(12);
    assert.deepEqual(f.records, [{ key: game, score: 12 }]);
    assert.deepEqual(f.events, [['start', game], ['finished'], ['complete', game, 12]]);
    assert.equal(f.completions[0].retainResult, true, 'only the shareable results retain the consumed trial');
    assert.match(f.screens.at(-1), /친구에게 도전/);
    assert.match(f.receipt.innerHTML, /손님으로 기록했어요/);
  });

  test(game + ': leaving a running game cannot create a challenge result or completion', async () => {
    const f = fixture(game);
    await f.context._2();
    f.context.El();
    assert.equal(f.context.R, null);
    assert.deepEqual(f.records, []);
    assert.deepEqual(f.events, [['start', game], ['closed']]);
  });
}

for (const option of ['missing', 'broken']) {
  test(option + ' sharing module cannot stop play, the result screen, or saved scores', async () => {
    const f = fixture('stacker', { [option]: true });
    await f.context._2();
    assert.equal(f.context.R.running, true);
    await f.context.S2(7);
    assert.deepEqual(f.records, [{ key: 'stacker', score: 7 }]);
    assert.match(f.screens.at(-1), /7층/);
    assert.doesNotMatch(f.screens.at(-1), /data-challenge-share/);
  });
}

test('existing guest play restrictions still run before a challenge round starts', async () => {
  const f = fixture('stacker', { allowed: false });
  await f.context._2();
  assert.equal(f.context.R.running, false);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.records, []);
});

test('unrelated solo games keep their existing result screen and score submission', async () => {
  const f = fixture('runner');
  await f.context._2(); await f.context.S2(20);
  assert.deepEqual(f.events, [['finished']]);
  assert.deepEqual(f.records, [{ key: 'runner', score: 20 }]);
  assert.equal(f.completions[0].retainResult, false, 'unrelated games keep the existing automatic login entry');
  assert.doesNotMatch(f.screens.at(-1), /data-challenge-share/);
});

for (const id of ['stacker', 'mole', 'poker', 'roulette', 'admin', '<script>']) {
  test('initial game link ' + id + ' opens only a supported entrance and only once', () => {
    const opened = [], tabs = [];
    const context = vm.createContext({
      URL, Promise, console, location: { href: 'https://ojjuda.com/world.html?guest=1&game=' + encodeURIComponent(id) },
      window: { OjjudaGameChallenges: { requestedGame: () => ['stacker', 'mole'].includes(id) ? id : null } },
      D: { online: false }, g: { tab: 'place', place: { id: 'arcade' } },
      py() {}, sr: { tab: route => tabs.push(route.tab) }, Al: game => opened.push(game), H() {},
      resolveWorldProfilePhoto() {}, worldParkNotes: null, m1() {}, x1: async () => {},
    });
    vm.runInContext(routing, context);
    context.my(); context.my();
    assert.deepEqual(opened, ['stacker', 'mole', 'poker', 'roulette'].includes(id) ? [id] : []);
    assert.deepEqual(tabs, ['arcade']);
  });
}

const guestSource = fs.readFileSync(path.join(__dirname, '../guest-access.js'), 'utf8');
const guestKey = 'ojjuda.guest-round-completed.v1';
function guestFixture({ guest = true, blockedStorage = false, storage = new Map() } = {}) {
  const navigations = [], timers = new Map(), listeners = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    window: {},
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw Error('blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw Error('blocked'); storage.set(key, value); }
    },
    location: { assign: url => navigations.push(url) },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (event, callback) => listeners.set(event, callback),
    document: { addEventListener: (event, callback) => listeners.set(event, callback) }
  });
  vm.runInContext(guestSource, context);
  const api = context.window.OjjudaGuestAccess;
  api.configure(() => guest);
  return { api, storage, timers, navigations, listeners };
}

test('a retained guest result consumes the trial immediately and replay still opens login', () => {
  const f = guestFixture();
  assert.equal(f.api.canPlay(), true);
  f.api.finished({ retainResult: true });
  assert.equal(f.storage.get(guestKey), '1');
  assert.equal(f.timers.size, 0, 'no timer can interrupt a share picker');
  assert.deepEqual(f.navigations, []);
  let stopped = false, prevented = false;
  f.listeners.get('click')({ target: { closest: () => ({}) }, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.equal(prevented, true); assert.equal(stopped, true);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
  assert.equal(f.api.canPlay(), false, 'another game entrance uses the same gate');
  assert.equal(f.navigations.length, 1, 'repeat requests do not duplicate navigation');
});

test('a reload after sharing retains the exhausted guest trial', () => {
  const storage = new Map(), first = guestFixture({ storage });
  first.api.finished({ retainResult: true });
  const reloaded = guestFixture({ storage });
  assert.equal(reloaded.api.canPlay(), false);
  assert.deepEqual(reloaded.navigations, ['/?auth=login&next=world']);
});

test('blocked browser storage still prevents a second guest round in the active page', () => {
  const f = guestFixture({ blockedStorage: true });
  f.api.finished({ retainResult: true });
  assert.equal(f.timers.size, 0);
  assert.equal(f.api.canPlay(), false);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});

for (const options of [undefined, { retainResult: false }, { retainResult: 'true' }]) {
  test('ordinary completion ' + JSON.stringify(options) + ' keeps the existing timed login', () => {
    const f = guestFixture();
    f.api.finished(options); f.api.finished(options);
    assert.equal(f.storage.get(guestKey), '1');
    assert.equal(f.timers.size, 1);
    const timer = [...f.timers.values()][0];
    assert.equal(timer.delay, 1600); timer.fn();
    assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
  });
}

test('member result retention leaves play and guest storage untouched', () => {
  const f = guestFixture({ guest: false });
  f.api.finished({ retainResult: true }); f.api.finished();
  assert.equal(f.storage.has(guestKey), false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.api.canPlay(), true);
  assert.deepEqual(f.navigations, []);
});

function overlayFixture(t, { shareModule = false } = {}) {
  const dom = new JSDOM('<main class="main"></main>', { url: 'https://ojjuda.kr/world.html?game=stacker&challenge=1&score=8', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, events = [], shared = [], counts = { canvasPointer: 0 };
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  w.requestAnimationFrame = () => 1; w.cancelAnimationFrame = () => {};
  w.__event = (...event) => events.push(event);
  w.eval(`
    var R=null,Z=360,he=540,D={online:false,user:null},g={tab:'place',place:{id:'arcade'}},S={};
    var worldGameAssetRequest=0,worldClosingGames=null;
    var _r={stacker:{name:'탑 쌓기',unit:'층',emoji:'🏗️',bg:'#fff'},mole:{name:'두더지 잡기',unit:'점',emoji:'🔨',bg:'#fff'},runner:{name:'달리기',unit:'점',emoji:'🏃',bg:'#fff'}};
    var G2=Object.fromEntries(Object.keys(_r).map(id=>[id,()=>({update(){},draw(){}})]));
    var gt={arcadeEnd(){}};
    function worldGameEntryGate(){return true;} function M(){} function Wi(){return false;} function w(s){return String(s);}
    function E2(){} function A2(){} function C2(){} function requestArcadeClose(){El();} function nf(){}
    function worldRewardRequest(){return {};} function worldRewardCurrent(){return true;}
    async function tf(game,score){return {ok:true,best:score,guest:true};}
    ${entrance}\n${controls}\n${preview}\n${rounds}\n${close}
  `);
  w.eval(guestSource); w.OjjudaGuestAccess.configure(() => true);
  if (shareModule) {
    Object.defineProperty(w.navigator, 'share', { configurable: true, value: async data => shared.push(data) });
    w.eval(fs.readFileSync(path.join(__dirname, '../game-challenges.js'), 'utf8'));
  } else {
    w.OjjudaGameChallenges = {
      onOpen: game => events.push(['visit', game]),
      onStart: game => events.push(['start', game]),
      resultMarkup: (game, score) => { events.push(['complete', game, score]); return ''; }
    };
  }
  return { w, events, shared, counts };
}

for (const game of ['stacker', 'mole']) {
  test(game + ': the real entrance counts a visit separately from its start button', async t => {
    const f = overlayFixture(t); f.w.Al(game);
    assert.ok(f.w.document.querySelector('.gov .gscreen .game-entry'));
    assert.equal(f.w.R.running, false);
    assert.deepEqual(f.events, [['visit', game]]);
    f.w.document.querySelector('[data-g="start"]').click();
    assert.equal(f.w.R.running, true);
    assert.deepEqual(f.events, [['visit', game], ['start', game]]);
    await f.w.S2(3);
    assert.deepEqual(f.events, [['visit', game], ['start', game], ['complete', game, 3]]);
  });
}

test('a finished guest can click the real share button through the game overlay without replaying', async t => {
  const f = overlayFixture(t, { shareModule: true });
  f.w.Al('stacker'); f.w.document.querySelector('[data-g="start"]').click();
  await f.w.S2(12);
  const button = f.w.document.querySelector('.gov .gscreen [data-challenge-share]');
  assert.ok(button, 'the sharing button is inside the actual result overlay');
  assert.equal(f.w.sessionStorage.getItem(guestKey), '1', 'the existing guest gate is already exhausted');
  const canvas = f.w.document.querySelector('#gcv');
  canvas.addEventListener('pointerdown', () => f.counts.canvasPointer++);
  button.dispatchEvent(new f.w.Event('pointerdown', { bubbles: true, cancelable: true }));
  button.click(); await Promise.resolve();
  assert.equal(f.counts.canvasPointer, 0, 'the canvas is a sibling of the result and receives no button pointer event');
  assert.equal(f.shared.length, 1, 'M2 and the guest capture gate allow the sharing click to reach its handler');
  assert.match(f.shared[0].text, /12층/);
  assert.equal(new URL(f.shared[0].url).searchParams.get('game'), 'stacker');
  assert.equal(f.w.R.running, false);
  assert.ok(f.w.document.querySelector('.gov'), 'the result stays open after sharing');
});

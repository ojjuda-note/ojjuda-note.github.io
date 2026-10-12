const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('games/bulssi/index.html');
const owner = '10000000-0000-0000-0000-000000000001';
function game({admin = false, member = 'guest', saved = null} = {}) {
  const dom = new JSDOM(source, {url:'https://fixture.test/games/bulssi/', runScripts:'outside-only'});
  const w = dom.window, messages = [], timers = new Map(); let timerId = 0;
  const parent = {postMessage:(data, origin) => messages.push({data, origin})};
  Object.defineProperty(w, 'parent', {value:parent});
  w.matchMedia = () => ({matches:false});
  w.requestAnimationFrame = () => 1;
  w.setTimeout = (fn, ms) => { timers.set(++timerId, {fn, ms}); return timerId; };
  w.clearTimeout = id => timers.delete(id);
  w.confirm = () => true;
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {get:(_, key) => key === 'measureText' ? () => ({width:20}) : () => {}});
  if (saved) w.localStorage.setItem('ojjuda.saetbyeol.save.v1:' + member, JSON.stringify(saved));
  w.eval(read('games/bulssi/entry.js'));
  w.eval(read('games/bulssi/growth.js'));
  const script = [...w.document.querySelectorAll('script:not([src])')][0].textContent;
  w.eval(script.replace('requestAnimationFrame(frame);\n})();', 'window.fixture={get state(){return S},get demo(){return DEMO},get mode(){return mode},upgrades:UP,growth:GROWTH,upgradeLock,refresh,selectDefault,cost,stats,save,startDemo,endDemo,resetGame,winBoss,finale,loadProgress};\nrequestAnimationFrame(frame);\n})();'));
  const receive = (data, origin = w.location.origin, sender = parent) => w.dispatchEvent(new w.MessageEvent('message', {origin, source:sender, data:{source:'ojjuda-world', ...data}}));
  const tick = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  receive({type:'ojjuda-saetbyeol-init', owner:member, admin});
  return {dom,w,messages,receive,tick,$:s => w.document.querySelector(s)};
}

// A normal player can start, save growth and retry a failed record, but cannot enter demo.
const x = game();
try {
  const {w,$,messages,receive,tick} = x;
  assert.equal(w.fixture.mode, 'entry');
  assert.equal($('#starStart').disabled, false);
  assert.equal($('#demoBtn').hidden, true);
  assert.equal($('#demoBtn').disabled, true);
  w.fixture.startDemo(); assert.equal(w.fixture.demo, null);
  $('#demoBtn').hidden = false; $('#demoBtn').disabled = false; $('#demoBtn').click();
  assert.equal(w.fixture.demo, null, 'unhiding the button does not enable demo');
  receive({type:'ojjuda-saetbyeol-init',owner,admin:true}, 'https://other.test');
  w.fixture.startDemo(); assert.equal(w.fixture.demo, null);
  $('#starStart').click(); assert.equal($('#starEntry').hidden, true);
  const state = w.fixture.state;
  state.stage = 1; state.lv.h0a = 2; state.mem = [3,0,0,0,0];
  w.fixture.save(); tick(600);
  let records = messages.filter(m => m.data.type === 'ojjuda-game-result');
  assert.equal(records.length, 1); assert.equal(records[0].data.score, 10320);
  assert.equal(records[0].data.demo, false);
  assert.ok(messages.every(m => m.origin === 'https://fixture.test'));
  const id = records[0].data.runId;
  receive({type:'ojjuda-saetbyeol-record',runId:id,ok:false});
  assert.equal($('#starRetry').hidden, false); $('#starRetry').click();
  records = messages.filter(m => m.data.type === 'ojjuda-game-result');
  assert.equal(records[1].data.runId, id, 'retry retains idempotency key');
  receive({type:'ojjuda-saetbyeol-record',runId:id,ok:true});
  assert.match($('#starRecordText').textContent, /등록 완료/);
  w.fixture.save(); tick(600);
  assert.equal(messages.filter(m => m.data.type === 'ojjuda-game-result').length, 2, 'same growth does not create duplicate records');
  assert.equal(JSON.parse(w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest')).stage, 1);
  receive({type:'ojjuda-saetbyeol-ranking',rows:[{nick:'<img src=x onerror=alert(1)>',score:10320}]});
  assert.equal($('#starRanking img'), null, 'ranking names are text');
  receive({type:'ojjuda-saetbyeol-exit-request'});
  assert.ok(messages.some(m => m.data.type === 'ojjuda-game-exit'));
} finally { x.dom.window.close(); }

// Admin-only demo never overwrites the normal game or produces a ranked score.
const a = game({admin:true, member:owner, saved:{stage:2,cur:{light:100},lv:{h0a:2},mem:[3,2,0,0,0],intro:true}});
try {
  const {w,$,messages,tick} = a;
  assert.equal($('#demoBtn').hidden, false); assert.equal($('#demoBtn').disabled, false);
  $('#starStart').click(); w.fixture.save(); tick(600);
  const before = w.localStorage.getItem('ojjuda.saetbyeol.save.v1:' + owner);
  const count = messages.filter(m => m.data.type === 'ojjuda-game-result').length;
  $('#demoBtn').click(); assert.ok(w.fixture.demo); assert.equal(w.fixture.state.stage, 4);
  w.fixture.save(); tick(600);
  assert.equal(messages.filter(m => m.data.type === 'ojjuda-game-result').length, count);
  assert.equal(w.localStorage.getItem('ojjuda.saetbyeol.save.v1:' + owner), before);
  w.fixture.resetGame(); assert.equal(w.fixture.demo, null); assert.equal(w.fixture.state.stage, 2);
  assert.equal(w.localStorage.getItem('ojjuda.saetbyeol.save.v1:guest'), null);
} finally { a.dom.window.close(); }

const forgedGuest = game({admin:true});
try { forgedGuest.w.fixture.startDemo(); assert.equal(forgedGuest.w.fixture.demo, null); }
finally { forgedGuest.dom.window.close(); }

// A branch stops at its checkpoint, including other upgrades in that branch.
// The last missing branch unlocks the next checkpoint without an extra action.
const balanced = game({saved:{stage:0,cur:{light:100000},intro:true}});
try {
  const {w,$} = balanced, f = w.fixture;
  $('#starStart').click();
  const select = id => { f.state.sel = id; f.refresh(); };
  const buy = (id, count = 1) => {
    for (let i = 0; i < count; i++) {
      select(id); assert.equal($('#buy').disabled, false, id + ' should be available'); $('#buy').click();
    }
  };
  assert.deepEqual(Array.from(f.growth.state(f.state.lv).targets), [3,3,2,3,1]);
  assert.equal(w.document.querySelectorAll('#growthBranches button').length, 5);
  buy('p0a', 3);
  assert.equal($('#buy').disabled, true);
  assert.match($('#uLock').textContent, /특수 1회/);
  assert.doesNotMatch($('#uLock').textContent, /화력/);
  const before = JSON.stringify(f.state);
  $('#buy').disabled = false; $('#buy').click();
  assert.equal(JSON.stringify(f.state), before, 'changing disabled cannot bypass the purchase guard');
  select('p0b'); assert.equal($('#buy').disabled, true);
  $('#buy').onclick(); assert.equal(f.state.lv.p0b || 0, 0, 'a sibling upgrade shares the same checkpoint');
  buy('h0a', 3); buy('r0a', 2); buy('v0a', 3);
  assert.equal(f.growth.state(f.state.lv).round, 1, 'four completed branches do not open the next round');
  select('p0a'); assert.equal($('#buy').disabled, true);
  $('#growthBranches [data-branch="4"]').click();
  assert.equal(f.state.sel, 'x0a', 'the missing-branch shortcut selects an available upgrade');
  $('#buy').click();
  assert.equal(f.growth.state(f.state.lv).round, 2);
  assert.match($('#growthTitle').textContent, /2 \/ 3구간/);
  buy('p0a'); assert.equal(f.state.lv.p0a, 4);
  select('h0a'); f.state.cur.light = 0; f.refresh();
  assert.equal($('#buy').disabled, true);
  $('#buy').onclick(); assert.equal(f.state.lv.h0a, 3, 'the balance gate does not bypass currency requirements');
  select('h1a');
  assert.match($('#uLock').textContent, /원시별로 진화/);
} finally { balanced.dom.window.close(); }

// Both purchase orders must be able to finish every tier despite unequal
// branch capacities and upgrades that depend on a parent being purchased.
for (const reverse of [false, true]) {
  const progression = game({saved:{stage:0,cur:{light:1e12,metal:1e12,mass:1e12},intro:true}});
  try {
    const {w,$} = progression, f = w.fixture, rounds = new Set();
    $('#starStart').click();
    let purchases = 0;
    for (let stage = 0; stage < 5; stage++) {
      f.state.stage = stage; f.refresh();
      for (;;) {
        const gate = f.growth.state(f.state.lv);
        if (gate.complete || gate.stage !== stage) break;
        rounds.add(`${gate.stage}:${gate.round}`);
        const available = Array.from(f.upgrades).filter(u => (f.state.lv[u.id] || 0) < u.mx && !f.upgradeLock(u, gate));
        assert.ok(available.length, `no deadlock at tier ${stage}, round ${gate.round}`);
        f.selectDefault(); assert.ok(available.some(u => u.id === f.state.sel), 'default selection respects the gate');
        const u = reverse ? available.at(-1) : available[0];
        f.state.sel = u.id; f.refresh();
        assert.equal($('#buy').disabled, false);
        const before = f.state.lv[u.id] || 0, funds = f.state.cur[u.k], price = f.cost(u);
        $('#buy').click(); purchases++;
        assert.equal(f.state.lv[u.id], before + 1);
        assert.equal(f.state.cur[u.k], funds - price);
        assert.ok(purchases < 200, 'progression should terminate');
      }
      for (const u of f.upgrades.filter(u => u.r === stage)) assert.equal(f.state.lv[u.id], u.mx);
      if (stage < 4) {
        const next = f.upgrades.find(u => u.r === stage + 1);
        f.state.sel = next.id; f.refresh();
        assert.equal(f.upgradeLock(next), 'evolution');
        assert.equal($('#buy').disabled, true);
        assert.equal($('#growthBranches').hidden, true);
        assert.match($('#growthHelp').textContent, /진화하면/);
      }
    }
    assert.equal(rounds.size, 15, 'all three checkpoints in all five stages were exercised');
    assert.equal(purchases, f.upgrades.reduce((total, u) => total + u.mx, 0));
    assert.equal(f.growth.state(f.state.lv).complete, true);
    assert.match($('#growthTitle').textContent, /다섯 영역 성장 완료/);
  } finally { progression.dom.window.close(); }
}

// Existing lopsided saves retain earned effects and can catch up without a reset.
const legacyLevels = {h0a:5,h0b:3,p0a:6,h1a:4,p1a:3,x2a:2};
const legacy = game({saved:{stage:2,cur:{light:1e12,metal:1e12},lv:legacyLevels,intro:true}});
try {
  const {w,$} = legacy, f = w.fixture;
  $('#starStart').click();
  for (const [id, level] of Object.entries(legacyLevels)) assert.equal(f.state.lv[id], level);
  assert.equal(f.stats().maxHeat, 45, 'existing late-tier upgrade effects remain active');
  f.state.sel = 'p1a'; f.refresh();
  assert.equal($('#buy').disabled, true);
  assert.match($('#uLock').textContent, /잿불 1구간 목표/);
  const funds = f.state.cur.light;
  $('#buy').onclick(); assert.equal(f.state.lv.p1a, 3); assert.equal(f.state.cur.light, funds);
  while (f.growth.state(f.state.lv).stage === 0) {
    f.selectDefault(); f.refresh();
    assert.equal($('#buy').disabled, false, 'a catch-up purchase remains available');
    $('#buy').click();
  }
  for (const [id, level] of Object.entries(legacyLevels)) assert.ok(f.state.lv[id] >= level);
  assert.equal(f.growth.state(f.state.lv).stage, 1);
} finally { legacy.dom.window.close(); }
assert.match(source, /<script src="\.\/growth\.js\?v=/);
console.log('PASS: balanced growth gates, shared branch caps, missing-branch shortcuts, all 15 checkpoints, evolution gates and existing-save catch-up');

// Arcade and board use the same game identifier, with no adult gate.
const world = read('world.html');
assert.match(world, /saetbyeol:\{name:"샛별키우기",emoji:"⭐",unit:"점"/);
assert.match(world, /return \{saetbyeol:_r.saetbyeol/);
assert.match(world, /OjjudaSaetbyeolGame\.open\(\{owner,client:S,authorized/);
assert.match(read('world-game-assets.js'), /saetbyeol:\[/);
assert.match(read('guest-game-scores.js'), /'saetbyeol'/);
console.log('PASS: Saetbyeol entry, growth scoring, retries, account isolation, admin-only demo and menu/ranking wiring');

(async () => {
  const dom = new JSDOM('<body></body>', {url:'https://fixture.test/world.html', runScripts:'outside-only'});
  const w = dom.window, sent = [], scores = [];
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  let authorized = true;
  const client = {from(table) {
    assert.equal(table, 'app_admins');
    return {select(column) { assert.equal(column,'user_id'); return this; }, eq(column,id) { assert.equal(id,owner); return this; },
      maybeSingle() { return {abortSignal:async () => ({data:{user_id:owner},error:null})}; }};
  }};
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    w.eval(read('world-saetbyeol-game.js'));
    w.OjjudaSaetbyeolGame.open({owner,client,authorized:()=>authorized,onScore:async (...args) => { scores.push(args); return {ok:true}; }});
    const frame = w.document.querySelector('iframe');
    frame.contentWindow.postMessage = data => sent.push(data);
    const receive = (data, origin = w.location.origin, sender = frame.contentWindow) => w.dispatchEvent(new w.MessageEvent('message',{origin,source:sender,data:{source:'ojjuda-saetbyeol',...data}}));
    receive({type:'ojjuda-game-ready'}); await settle();
    assert.equal(sent[0].admin, true, 'admin flag comes from the protected server table');
    const result = {type:'ojjuda-game-result',runId:'11111111-1111-4111-8111-111111111111',score:11000,demo:false};
    receive(result,'https://evil.test'); receive(result,w.location.origin,w);
    receive({...result,demo:true}); receive({...result,score:60001});
    await settle(); assert.equal(scores.length, 0);
    receive(result); receive(result); await settle();
    assert.equal(scores.length, 1, 'duplicate messages share a single submission');
    assert.ok(sent.some(m => m.type === 'ojjuda-saetbyeol-record' && m.ok));
    authorized = false; receive({...result,runId:'22222222-2222-4222-8222-222222222222'}); await settle();
    assert.equal(scores.length, 1, 'account change blocks further records');
    w.OjjudaSaetbyeolGame.close(); assert.equal(w.document.querySelector('dialog'), null);
    assert.equal(w.document.body.classList.contains('gaming'), false);
    console.log('PASS: Saetbyeol host admin lookup, message origin/source checks, duplicate suppression and account-change cleanup');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

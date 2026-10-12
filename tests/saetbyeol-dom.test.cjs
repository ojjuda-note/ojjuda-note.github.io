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
  const script = [...w.document.querySelectorAll('script:not([src])')][0].textContent;
  w.eval(script.replace('requestAnimationFrame(frame);\n})();', 'window.fixture={get state(){return S},get demo(){return DEMO},get mode(){return mode},save,startDemo,endDemo,resetGame,winBoss,finale,loadProgress};\nrequestAnimationFrame(frame);\n})();'));
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

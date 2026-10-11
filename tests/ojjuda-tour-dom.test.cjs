const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('games/ojjuda-tour/index.html');

function game(embedded = false) {
  const dom = new JSDOM(source, {url:'https://fixture.test/games/ojjuda-tour/', runScripts:'outside-only'});
  const w = dom.window;
  const messages = [];
  if (embedded) Object.defineProperty(w, 'parent', {value:{postMessage:(...args) => messages.push(args)}});
  w.confirm = () => true;
  for (const script of w.document.querySelectorAll('script:not([src])')) require('node:vm').runInContext(script.textContent, dom.getInternalVMContext());
  require('node:vm').runInContext(read('games/ojjuda-tour/tour-entry.js'), dom.getInternalVMContext());
  w.eval('sfx=()=>{}');
  return {dom, w, messages, $:selector => w.document.querySelector(selector)};
}

const x = game();
try {
  const {w, $} = x;
  assert.equal($('#cnt').textContent, '4');
  assert.equal($('#rows').children.length, 4);
  $('[data-tour-mode=together]').click();
  assert.equal(w.eval('setupP.slice(0,setupN).every(p=>p.human)'), true);
  for (let i = 0; i < 10; i++) $('#plus').click();
  assert.equal($('#cnt').textContent, '8');
  assert.equal($('#plus').disabled, true);
  assert.equal($('#rows').children.length, 8);
  for (let i = 0; i < 10; i++) $('#minus').click();
  assert.equal($('#cnt').textContent, '2');
  assert.equal($('#minus').disabled, true);
  $('[data-tour-mode=computer]').click();
  assert.equal(w.eval('setupP.slice(0,setupN).filter(p=>p.human).length'), 1);
  $('#rows input').value = '<img>&"여행친구';
  $('#rows input').dispatchEvent(new w.Event('input', {bubbles:true}));
  $('[data-r="15"]').click();
  assert.equal($('#rows img'), null);
  assert.equal(w.eval('setupP[0].name'), 'img여행친구');
  assert.equal($('[data-r="15"]').getAttribute('aria-pressed'), 'true');
  // Exercise real setup, save and resume handlers without mocking any game data.
  w.eval('begin=()=>{save();window.started=true}');
  $('#startBtn').click();
  assert.equal(w.started, true);
  assert.equal(w.eval('G.players.length'), 2);
  assert.equal(w.eval('G.maxRound'), 15);
  assert.equal(w.eval('G.players[0].money'), 2000);
  w.eval('G=null;renderSetup()');
  assert.equal($('#resumeBtn').classList.contains('hidden'), false);
  w.confirm = () => false;
  const checkpoint = w.localStorage.getItem('ojjuda-tour-save-v1:guest');
  $('#startBtn').click();
  assert.equal(w.localStorage.getItem('ojjuda-tour-save-v1:guest'), checkpoint);
  $('#resumeBtn').click();
  assert.equal(w.eval('G.players[0].name'), 'img여행친구');
} finally { x.dom.window.close(); }

const y = game(true);
try {
  const {w, $, messages} = y;
  assert.equal(messages[0][1], 'https://fixture.test');
  const init = (origin, parent, owner, nickname) => w.dispatchEvent(new w.MessageEvent('message', {
    origin, source:parent, data:{source:'ojjuda-world', type:'ojjuda-tour-init', owner, nickname}
  }));
  init('https://other.test', w.parent, 'wrong', '다른회원');
  assert.equal(w.eval('KEY'), 'ojjuda-tour-save-v1:guest');
  init('https://fixture.test', w, 'wrong', '다른회원');
  assert.equal(w.eval('KEY'), 'ojjuda-tour-save-v1:guest');
  init('https://fixture.test', w.parent, 'member-123', '<b>민준</b>');
  assert.equal(w.eval('KEY'), 'ojjuda-tour-save-v1:member-123');
  assert.equal($('#rows input').value.includes('<'), false);
  init('https://fixture.test', w.parent, 'member-456', '변경');
  assert.equal(w.eval('KEY'), 'ojjuda-tour-save-v1:member-123');
  $('#exitBtn').click();
  assert.equal(messages.at(-1)[0].type, 'ojjuda-game-exit');
  assert.equal(w.localStorage.getItem('ojjuda-tour-save-v1:member-123'), null);
} finally { y.dom.window.close(); }

const host = new JSDOM('<button id="opener">투어</button>', {url:'https://fixture.test/world.html', runScripts:'outside-only'});
try {
  const w = host.window;
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.eval(read('world-tour-game.js'));
  const opener = w.document.getElementById('opener');
  opener.focus();
  w.OjjudaTourGame.open({nickname:'민준', owner:'member-123'});
  w.OjjudaTourGame.open();
  assert.equal(w.document.querySelectorAll('dialog').length, 1);
  const frame = w.document.querySelector('iframe');
  const send = (origin, source, type) => w.dispatchEvent(new w.MessageEvent('message', {origin, source, data:{source:'ojjuda-tour', type}}));
  send('https://other.test', frame.contentWindow, 'ojjuda-game-exit');
  assert.equal(w.document.querySelectorAll('dialog').length, 1);
  send('https://fixture.test', w, 'ojjuda-game-exit');
  assert.equal(w.document.querySelectorAll('dialog').length, 1);
  send('https://fixture.test', frame.contentWindow, 'ojjuda-game-result');
  assert.equal(w.document.querySelectorAll('dialog').length, 1);
  send('https://fixture.test', frame.contentWindow, 'ojjuda-game-exit');
  assert.equal(w.document.querySelectorAll('dialog').length, 0);
  assert.equal(w.document.body.classList.contains('gaming'), false);
  assert.equal(w.document.activeElement, opener);
  w.OjjudaTourGame.open();
  w.document.querySelector('dialog').dispatchEvent(new w.Event('cancel', {cancelable:true}));
  assert.equal(w.document.querySelectorAll('dialog').length, 0);
} finally { host.window.close(); }

// Render the actual arcade menu function, so the entry cannot drift into solo games.
const world = read('world.html');
const menu = world.slice(world.indexOf('function Df(){'), world.indexOf('function eo(){'));
const {runInNewContext} = require('node:vm');
const markup = runInNewContext(menu + ';Df()', {
  g:{place:{id:'arcade', npcs:[]}}, Pt:{arcade:{chat:true,arcade:true}}, _r:{},
  worldMatgoButton:()=>'', window:{}, Mf:()=>''
});
const hub = new JSDOM(markup);
assert.equal(hub.window.document.querySelectorAll('[data-arcade-games=multi] [data-v=tour]').length, 1);
assert.equal(hub.window.document.querySelectorAll('[data-arcade-games=solo] [data-v=tour]').length, 0);
hub.window.close();
console.log('PASS: tour modes, 2–8 players, safe names, settings, save/resume, member scope, verified iframe exit, arcade placement');

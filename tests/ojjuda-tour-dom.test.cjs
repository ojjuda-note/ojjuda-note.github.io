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
function eliminationGame() {
  const fixture=game(), {w,$}=fixture;
  const timer=w.setTimeout.bind(w);w.setTimeout=fn=>timer(fn,0);w.notices=[];
  w.eval(`begin=()=>{};sync3D=()=>{};setFace=()=>{};camOver=()=>{};coinFly=()=>{};floatText=()=>{};
    openSheet=async(title,body,buttons)=>{window.notices.push({title,body,buttons});return buttons[0].k};`);
  $('#startBtn').click();
  return fixture;
}
(async()=>{
  const a=eliminationGame();
  try {
    const {w,$}=a;
    w.eval(`G.players[0].money=100;G.players[1].money=1000;
      window.city=T.findIndex(t=>t.t==='city');G.owner[city]=0;G.level[city]=4;G.fest[city]=2;
      window.proceeds=r10(T[city].p/2)+[1,2,3,4].reduce((sum,lv)=>sum+r10(costLv(city,lv)/2),0);`);
    await w.eval('pay(G.players[0],100+proceeds+10,G.players[1])');
    assert.equal(w.eval('G.players[0].bankrupt'),true,'negative after all liquidation eliminates');
    assert.equal(w.eval('owned(G.players[0]).length'),0);
    assert.equal(w.eval('Object.keys(G.level).length+Object.keys(G.fest).length'),0,'buildings and festivals removed');
    assert.equal(w.eval('G.players[1].money'),1100+w.proceeds,'creditor only receives available funds');
    assert.equal(w.notices.at(-1).title,'탈락');
    assert.equal(w.notices.at(-1).buttons[0].l,'관전하기');
    assert.match(w.notices.at(-1).body,/10만/);
    assert.equal($('#eliminationStatus').classList.contains('hidden'),false);
    assert.equal($('#players .out .m').textContent,'탈락');
    assert.equal($('#players .out .s').textContent,'관전 중');
    assert.equal($('#players .out').classList.contains('now'),false);
    assert.equal($('#quitBtn').classList.contains('hidden'),true);
    assert.equal(w.eval('spectating()'),true);
    w.eval('window.picked=false;pickResolve=()=>{window.picked=true};startHold()');
    $('#rollBtn').click();$('#seg [data-par="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('#quitBtn').click();
    assert.equal(w.picked,false,'eliminated player cannot pick or skip');
    assert.equal(w.eval('G.players[0].par'),0);
    assert.notEqual(w.eval('R.holding'),true,'eliminated player cannot roll');
    assert.equal($('#sheet2').classList.contains('hidden'),true,'spectator cannot end the remaining game');
    await w.eval('takeTurn(G.players[0]);pay(G.players[0],50,G.players[1])');
    assert.equal(w.eval('G.players[0].money'),0,'no more actions or payments after elimination');
    const saved=JSON.parse(w.localStorage.getItem('ojjuda-tour-save-v1:guest'));
    assert.equal(saved.players[0].bankrupt,true,'elimination saved before notice can be closed');
    w.eval('G=loadSave();render()');
    assert.equal(w.eval('spectating()'),true,'resume remains spectator');
    assert.match(w.eval('rankingHTML()'),/탈락/);
    w.turns=[];w.eval('takeTurn=async p=>{window.turns.push(pid(p));if(window.turns.length===3)throw STALE}');
    await w.eval('gameLoop()');
    assert.deepEqual(w.turns,[1,2,3],'remaining computers continue without an eliminated turn');
  }finally{a.dom.window.close()}
  const b=eliminationGame();
  try {
    const {w,$}=b;
    w.eval(`G.players[0].money=10;window.city=T.findIndex(t=>t.t==='city');G.owner[city]=0;G.level[city]=1;
      window.proceeds=r10(T[city].p/2)+r10(costLv(city,1)/2);`);
    await w.eval('pay(G.players[0],10+proceeds,null)');
    assert.equal(w.eval('G.players[0].money'),0);
    assert.equal(w.eval('G.players[0].bankrupt'),true,'zero cash and no sellable assets eliminates');
    assert.equal(w.eval('owned(G.players[0]).length'),0);
    assert.equal(w.eval('canControlTurn()'),false);
    assert.equal($('#eliminationStatus').classList.contains('hidden'),false);
    assert.match(w.notices.at(-1).body,/잔액이 0원이고 판매할 도시나 건물이 없어요/);
  }finally{b.dom.window.close()}
  for(const hasLand of [false,true]){
    const boundary=eliminationGame();
    try{
      const {w}=boundary;w.eval('G.players[0].money=10');
      if(hasLand)w.eval('G.owner[T.findIndex(t=>t.t===\'city\')]=0');
      await w.eval('pay(G.players[0],10,null)');
      assert.equal(w.eval('G.players[0].bankrupt'),!hasLand,'zero cash only survives with sellable property');
      assert.equal(w.eval('owned(G.players[0]).length'),hasLand?1:0,'zero balance does not force a sale');
    }finally{boundary.dom.window.close()}
  }
  const positive=eliminationGame();
  try{
    positive.w.eval('G.players[0].money=10');await positive.w.eval('pay(G.players[0],9,null)');
    assert.equal(positive.w.eval('G.players[0].bankrupt'),false,'positive cash without property survives');
  }finally{positive.dom.window.close()}
  const c=eliminationGame();
  try {
    const {w,$}=c;
    w.eval('G.players[1].human=true;G.players[0].money=-1');
    await w.eval('settle(G.players[0])');
    w.eval('G.turn=1;render()');
    assert.equal(w.eval('spectating()'),false,'another local human can still play');
    assert.equal(w.eval('canControlTurn()'),true);
    assert.equal($('#quitBtn').classList.contains('hidden'),false);
    $('#seg [data-par="1"]').click();
    assert.equal(w.eval('G.players[1].par'),1);
    w.eval('G.players[2].bankrupt=true;G.players[3].bankrupt=true;endScreen=(winner)=>{window.winner=pid(winner)}');
    await w.eval('gameLoop()');
    assert.equal(w.winner,1,'last survivor wins');
  }finally{c.dom.window.close()}
  const d=eliminationGame();
  try {
    const {w}=d;w.turns=[];
    w.eval('G.players[0].money=0;takeTurn=async p=>{window.turns.push(pid(p));throw STALE}');
    await w.eval('gameLoop()');
    assert.equal(w.eval('G.players[0].bankrupt'),true,'old zero-cash save without assets settles before playing');
    assert.deepEqual(w.turns,[1]);
  }finally{d.dom.window.close()}
  console.log('PASS: tour entry, liquidation, zero cash with and without assets, positive cash, elimination notice, spectator controls, persisted elimination and last survivor');
})().catch(error=>{console.error(error);process.exitCode=1});

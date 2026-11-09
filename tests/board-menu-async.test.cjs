const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'world.html'), 'utf8');
const modalSource = source.slice(source.indexOf('function ct('), source.indexOf('function Tt('));
const prefStart = source.indexOf('const arcadeDifficultyPrefix=');
const preferenceSource = source.slice(prefStart, source.indexOf('async function xn(', prefStart));
const menuStart = source.indexOf('async function Hp(');
const menuSource = source.slice(menuStart, source.indexOf('var Qp={', menuStart));
const boardActionsStart = source.indexOf('"bd-side"(t){');
const boardActions = source.slice(boardActionsStart, source.indexOf(',"bd-sq"(t)', boardActionsStart));
const boardSyncStart = source.indexOf('function Tp(t){');
const boardSync = source.slice(boardSyncStart, source.indexOf('var to=[]', boardSyncStart));

function fixture(savedPreferences = {}) {
  const dom = new JSDOM('<main id="modal-root"></main>', {runScripts: 'outside-only', url:'https://ojjuda.kr/world.html'});
  const win = dom.window;
  for (const [key, value] of Object.entries(savedPreferences)) win.localStorage.setItem(key, value);
  const requests = [];
  win.console.error = () => {};
  win.ln = kinds => new Promise((resolve, reject) => requests.push({kind: kinds[0], resolve, reject}));
  win.eval(`
    var D={online:true,user:{id:'member-a'}},g={},En={},worldBoardScreenStop=null;
    var Xe={chess:{name:'체스',emoji:'♟️',first:'w',second:'b',side:{w:'백',b:'흑'}},janggi:{name:'장기',emoji:'🀄',first:'c',second:'h',side:{c:'초',h:'한'}}};
    var Rp=[['easy','쉬움'],['normal','보통'],['hard','어려움']],JG_EXTRA_LEVELS=[['pro','프로'],['master','마스터'],['grandmaster','그랜드마스터']];
    var J0=[['easy','쉬움'],['normal','보통'],['hard','어려움']];
    var z=selector=>document.querySelector(selector),Pr=(selector,root)=>[...root.querySelectorAll(selector)],w=value=>String(value);
    function worldGameEntryGate(){return true;} function Sa(){} function Ui(){} function Uo(){} function dn(){} function jgChooser(){return '';}
    ${modalSource}
    ${preferenceSource}
    ${menuSource}
  `);
  return {
    win,
    requests,
    menu: () => win.document.getElementById('bd-menu'),
    marker: () => win.document.querySelector('[data-remote]')?.textContent,
    finish(index, label) {requests[index].resolve(`<p data-remote>${label}</p>`);},
    close: () => win.close(),
  };
}

test('janggi and chess restore their own saved difficulty on a new visit', async () => {
  const first = fixture();
  const key = 'ojjuda.arcade.difficulty.v1:member-a:';
  let saved;
  try {
    const button = first.win.document.createElement('button');
    button.dataset.act = 'bd-lv'; button.dataset.k = 'janggi'; button.dataset.v = 'pro';
    first.win.document.body.append(button); button.click();
    button.dataset.k = 'chess'; button.dataset.v = 'hard'; button.click();
    saved = {[key+'board:janggi']:first.win.localStorage.getItem(key+'board:janggi'), [key+'board:chess']:first.win.localStorage.getItem(key+'board:chess')};
    assert.equal(saved[key+'board:janggi'], 'pro');
    assert.equal(saved[key+'board:chess'], 'hard');
  } finally {first.close();}
  const second = fixture(saved);
  try {
    const janggi = second.win.vn('janggi'); second.finish(0, 'ready'); await janggi;
    assert.equal(second.win.g.bdLevel, 'pro');
    second.win.dt();
    const chess = second.win.vn('chess'); second.finish(1, 'ready'); await chess;
    assert.equal(second.win.g.bdLevel, 'hard');
    assert.equal(second.menu().querySelector('[data-act=bd-lv][aria-pressed=true]').dataset.v, 'hard');
  } finally {second.close();}
});

test('closing a loading board menu never reopens it after a delayed response', async () => {
  const f = fixture();
  try {
    const pending = f.win.vn('chess');
    assert.ok(f.menu());
    f.win.dt();
    f.finish(0, 'old chess');
    await pending;
    assert.equal(f.menu(), null);
    assert.equal(f.win.document.querySelector('[role=dialog]'), null);
  } finally {f.close();}
});

test('a delayed board response cannot replace another modal or an active game', async () => {
  const f = fixture();
  try {
    const pending = f.win.vn('chess');
    f.win.ct('<section id="other-view">다른 화면</section>', '다른 화면');
    f.finish(0, 'old chess');
    await pending;
    assert.equal(f.win.document.getElementById('other-view')?.textContent, '다른 화면');
    assert.equal(f.menu(), null);
  } finally {f.close();}
});

for (const next of ['chess', 'janggi']) {
  test(`a new ${next} entrance keeps its own data when an earlier chess request finishes last`, async () => {
    const f = fixture();
    try {
      const old = f.win.vn('chess');
      f.win.dt();
      const current = f.win.vn(next);
      f.finish(1, 'current entrance');
      await current;
      f.finish(0, 'old entrance');
      await old;
      assert.equal(f.marker(), 'current entrance');
      assert.equal(f.menu().querySelector('[data-entry-key]').dataset.entryKey, next);
      assert.equal(f.win.document.querySelectorAll('[role=dialog]').length, 1);
    } finally {f.close();}
  });
}

test('only the newest refresh may update an open entrance', async () => {
  const f = fixture();
  try {
    const opened = f.win.vn('chess');
    f.finish(0, 'initial');
    await opened;
    const node = f.menu();
    const first = f.win.k2();
    const second = f.win.k2();
    f.finish(2, 'latest invitations');
    await second;
    f.finish(1, 'outdated invitations');
    await first;
    assert.equal(f.menu(), node);
    assert.equal(f.marker(), 'latest invitations');
  } finally {f.close();}
});

for (const change of ['account', 'sign-out']) {
  test(`a response from before ${change} cannot populate the current entrance`, async () => {
    const f = fixture();
    try {
      const pending = f.win.vn('chess');
      if (change === 'account') f.win.D.user = {id: 'member-b'};
      else f.win.D.online = false;
      f.finish(0, 'member-a private invitations');
      await pending;
      assert.equal(f.marker(), undefined);
      const current = f.win.k2();
      f.finish(1, 'current access');
      await current;
      assert.equal(f.marker(), 'current access');
    } finally {f.close();}
  });
}

test('a current load failure stays dismissible and can be retried', async () => {
  const f = fixture();
  try {
    const pending = f.win.vn('janggi');
    assert.ok(f.menu().querySelector('[data-act=close]'), 'the loading entrance has a close button');
    f.requests[0].reject(new Error('temporary connection failure'));
    await pending;
    assert.match(f.menu().querySelector('[role=alert]').textContent, /다시 시도/);
    assert.ok(f.menu().querySelector('[data-act=close]'));
    const retry = f.menu().querySelector('[data-act=bd-open]');
    assert.equal(retry.dataset.v, 'janggi');
    const next = f.win.vn(retry.dataset.v);
    f.finish(1, 'loaded after retry');
    await next;
    assert.equal(f.marker(), 'loaded after retry');
    assert.equal(f.menu().querySelector('[role=alert]'), null);
  } finally {f.close();}
});

test('a dismissed failed request does not reopen a modal or reject its entry promise', async () => {
  const f = fixture();
  try {
    const pending = f.win.vn('chess');
    f.win.dt();
    f.requests[0].reject(new Error('late connection failure'));
    await assert.doesNotReject(pending);
    assert.equal(f.menu(), null);
  } finally {f.close();}
});

test('a failed old refresh cannot replace a newer successful result', async () => {
  const f = fixture();
  try {
    const opened = f.win.vn('chess');
    f.finish(0, 'initial');
    await opened;
    const old = f.win.k2();
    const current = f.win.k2();
    f.finish(2, 'latest success');
    await current;
    f.requests[1].reject(new Error('old failed refresh'));
    await assert.doesNotReject(old);
    assert.equal(f.marker(), 'latest success');
    assert.equal(f.menu().querySelector('[role=alert]'), null);
  } finally {f.close();}
});

test('janggi color choices set the actual computer-game side before starting', async () => {
  const f = fixture();
  try {
    f.win.eval(`
      function jgLayout(value){return value||'eheh';}
      function zp(kind,mode,options){window.started={kind,mode,options};}
      ${boardSync}
      var boardActions={${boardActions}};
    `);
    const opening = f.win.vn('janggi');
    f.finish(0, 'friends');
    await opening;
    const colors = [...f.menu().querySelectorAll('.jg-color-choices [data-act="bd-side"]')];
    assert.deepEqual(colors.map(button => button.textContent), ['파랑 · 초', '빨강 · 한']);
    assert.deepEqual(colors.map(button => button.getAttribute('aria-pressed')), ['true', 'false']);
    assert.equal(f.menu().querySelector('details')?.textContent.includes('순서 설정'), false);

    f.win.boardActions['bd-side']({v:'second',k:'janggi'});
    assert.deepEqual(colors.map(button => button.getAttribute('aria-pressed')), ['false', 'true']);
    f.win.boardActions['bd-start']({k:'janggi',mode:'ai'});
    assert.equal(f.win.started.options.me, 'h', 'red selects Han and lets the computer move first');

    f.win.boardActions['bd-side']({v:'first',k:'janggi'});
    f.win.boardActions['bd-start']({k:'janggi',mode:'ai'});
    assert.equal(f.win.started.options.me, 'c', 'blue selects Cho');

    const chessOpening = f.win.vn('chess');
    f.finish(1, 'friends');
    await chessOpening;
    assert.equal(f.menu().querySelector('.jg-color-choices'), null);
    assert.match(f.menu().textContent, /순서 설정/);
  } finally {f.close();}
});

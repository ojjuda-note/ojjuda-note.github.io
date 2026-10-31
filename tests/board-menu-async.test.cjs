const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'world.html'), 'utf8');
const modalSource = source.slice(source.indexOf('function ct('), source.indexOf('function Tt('));
const menuStart = source.indexOf('async function Hp(');
const menuSource = source.slice(menuStart, source.indexOf('var Qp={', menuStart));

function fixture() {
  const dom = new JSDOM('<main id="modal-root"></main>', {runScripts: 'outside-only'});
  const win = dom.window;
  const requests = [];
  win.console.error = () => {};
  win.ln = kinds => new Promise((resolve, reject) => requests.push({kind: kinds[0], resolve, reject}));
  win.eval(`
    var D={online:true,user:{id:'member-a'}},g={},En={};
    var Xe={chess:{name:'체스',emoji:'♟️',first:'w',second:'b',side:{w:'백',b:'흑'}},janggi:{name:'장기',emoji:'🀄',first:'c',second:'h',side:{c:'초',h:'한'}}};
    var Rp=[['normal','보통']];
    var z=selector=>document.querySelector(selector),Pr=(selector,root)=>[...root.querySelectorAll(selector)],w=value=>String(value);
    function worldGameEntryGate(){return true;} function Sa(){} function Ui(){} function Uo(){} function dn(){} function jgChooser(){return '';}
    ${modalSource}
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

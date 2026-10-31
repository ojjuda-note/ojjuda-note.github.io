const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'world.html'), 'utf8');
const modalSource = source.slice(source.indexOf('function ct('), source.indexOf('function Tt('));
const start = source.indexOf('async function pp(');
const menuSource = source.slice(start, source.indexOf('var fp=', start));

function fixture() {
  const dom = new JSDOM('<main id="modal-root"></main>', {runScripts: 'outside-only'});
  const win = dom.window, requests = [];
  win.console.error = () => {};
  win.ln = (_kinds, kind) => new Promise((resolve, reject) => requests.push({kind, resolve, reject}));
  win.eval(`
    var D={online:true,user:{id:'member-a'}},g={},hn={};
    var Zo={carom4:{name:'4구',rules:'4구 규칙'},carom3:{name:'3구',rules:'3구 규칙'},pool8:{name:'포켓볼',rules:'포켓볼 규칙'}};
    var J0=[['easy','쉬움'],['normal','보통'],['hard','어려움']];
    var z=selector=>document.querySelector(selector),Pr=(selector,root)=>[...root.querySelectorAll(selector)],w=value=>String(value);
    function worldGameEntryGate(){return true;} function Sa(){} function Ui(){} function Uo(){} function dn(){}
    ${modalSource}
    ${menuSource}
  `);
  return {
    win, requests,
    menu: () => win.document.getElementById('bd-menu'),
    marker: () => win.document.querySelector('[data-remote]')?.textContent,
    finish(index, label) {requests[index].resolve(`<p data-remote>${label}</p>`);},
    close: () => win.close(),
  };
}

for (const [setting, action, first, latest] of [
  ['blKind', 'bl-kind', 'pool8', 'carom3'],
  ['blLevel', 'bl-level', 'easy', 'hard'],
  ['blTarget', 'bl-target', 3, 10],
]) {
  test(`the newest billiards ${setting} remains selected when replies arrive backwards`, async () => {
    const f = fixture();
    try {
      const opened = f.win.xn('carom4');
      f.finish(0, 'initial');
      await opened;
      f.win.g[setting] = first;
      const older = f.win.fn();
      f.win.g[setting] = latest;
      const newer = f.win.fn();
      f.finish(2, 'current options');
      await newer;
      f.finish(1, 'old options');
      await older;
      assert.equal(f.marker(), 'current options');
      assert.equal(f.menu().querySelector(`[data-act="${action}"][aria-pressed=true]`).dataset.v, String(latest));
    } finally {f.close();}
  });
}

test('a delayed billiards response cannot reopen a closed entrance', async () => {
  const f = fixture();
  try {
    const pending = f.win.xn('pool8');
    f.win.dt();
    f.finish(0, 'old options');
    await pending;
    assert.equal(f.menu(), null);
    assert.equal(f.win.document.querySelector('[role=dialog]'), null);
  } finally {f.close();}
});

test('a delayed billiards response cannot replace another modal', async () => {
  const f = fixture();
  try {
    const pending = f.win.xn('carom4');
    f.win.ct('<section id="other-view">다른 화면</section>', '다른 화면');
    f.finish(0, 'old options');
    await pending;
    assert.equal(f.win.document.getElementById('other-view')?.textContent, '다른 화면');
    assert.equal(f.menu(), null);
  } finally {f.close();}
});

test('reopening billiards keeps the new entrance intact', async () => {
  const f = fixture();
  try {
    const old = f.win.xn('carom4');
    f.win.dt();
    const current = f.win.xn('pool8');
    f.finish(1, 'new pool entrance');
    await current;
    f.finish(0, 'old carom entrance');
    await old;
    assert.equal(f.marker(), 'new pool entrance');
    assert.equal(f.menu().querySelector('[data-act=bl-kind][aria-pressed=true]').dataset.v, 'pool8');
  } finally {f.close();}
});

for (const change of ['account', 'sign-out']) {
  test(`billiards ignores a response from before ${change}`, async () => {
    const f = fixture();
    try {
      const pending = f.win.xn('carom4');
      if (change === 'account') f.win.D.user = {id: 'member-b'};
      else f.win.D.online = false;
      f.finish(0, 'previous member invitations');
      await pending;
      assert.equal(f.marker(), undefined);
      const current = f.win.fn();
      f.finish(1, 'current access');
      await current;
      assert.equal(f.marker(), 'current access');
    } finally {f.close();}
  });
}

test('a failed billiards load remains dismissible and preserves its mode on retry', async () => {
  const f = fixture();
  try {
    const pending = f.win.xn('pool8');
    assert.ok(f.menu().querySelector('[data-act=close]'));
    f.requests[0].reject(new Error('temporary connection failure'));
    await pending;
    assert.match(f.menu().querySelector('[role=alert]').textContent, /다시 시도/);
    assert.ok(f.menu().querySelector('[data-act=bl-open]'));
    assert.ok(f.menu().querySelector('[data-act=close]'));
    const retry = f.win.xn();
    f.finish(1, 'retry succeeded');
    await retry;
    assert.equal(f.menu().querySelector('[data-act=bl-kind][aria-pressed=true]').dataset.v, 'pool8');
    assert.equal(f.marker(), 'retry succeeded');
  } finally {f.close();}
});

test('a rejected old billiards refresh cannot replace a newer successful refresh', async () => {
  const f = fixture();
  try {
    const opened = f.win.xn('carom4');
    f.finish(0, 'initial');
    await opened;
    const old = f.win.fn();
    const current = f.win.fn();
    f.finish(2, 'current options');
    await current;
    f.requests[1].reject(new Error('old failed request'));
    await assert.doesNotReject(old);
    assert.equal(f.marker(), 'current options');
    assert.equal(f.menu().querySelector('[role=alert]'), null);
  } finally {f.close();}
});

test('a rejected dismissed billiards load does not reopen the entrance', async () => {
  const f = fixture();
  try {
    const pending = f.win.xn('carom4');
    f.win.dt();
    f.requests[0].reject(new Error('old failed request'));
    await assert.doesNotReject(pending);
    assert.equal(f.menu(), null);
  } finally {f.close();}
});

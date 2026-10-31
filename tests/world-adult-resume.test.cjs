const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const start = world.indexOf('function worldMatgoButton(){');
const end = world.indexOf('var worldMemberEntry=null;', start);
assert.ok(start > 0 && end > start);
const catalogStart = world.indexOf('var _r=');
const catalogEnd = world.indexOf(',Z=360', catalogStart);
const menuStart = world.indexOf('function Df(){');
const menuEnd = world.indexOf('function eo(){', menuStart);
assert.ok(catalogStart > 0 && catalogEnd > catalogStart && menuStart > 0 && menuEnd > menuStart);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message, timeout = 2600) {
  const limit = Date.now() + timeout;
  while (!test() && Date.now() < limit) await wait(20);
  assert.ok(test(), message);
}
(async () => {
  const dom = new JSDOM('<main data-arcade-rank-root></main><div id="ppanel"></div>', {
    url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  try {
    const w = dom.window;
    w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} disconnect() {} };
    let hidden = false, callback, identityError = false, authError = false, age = 19, reads = 0;
    Object.defineProperty(w.document, 'hidden', { get: () => hidden });
    w.D = { online: true, user: { id: 'adult' } };
    w.g = { tab: 'place', place: { id: 'arcade', ch: 1 }, bdInvites: 0 };
    w.Pt = { arcade: { chat: true, arcade: true } };
    w.worldPlacePresenceText = () => '지금 1명';
    w.eval(fs.readFileSync(path.join(root, 'matgo-access.js'), 'utf8'));
    const access = w.OjjudaMatgoAccess;
    access.configure({
      auth: {
        getUser: async () => authError ? { error: { name: 'AuthRetryableFetchError', status: 0 } } : { data: { user: w.D.user } },
        onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; }
      },
      rpc: async () => { reads++; return identityError ? { error: { message: 'offline' } } : { data: { age, locked: true } }; }
    });
    const rankingReads = [], rankHost = w.document.querySelector('[data-arcade-rank-root]');
    const ordinaryGames = { tank: { name: '탱크게임', unit: '연승' }, chess: { name: '체스', unit: '연승' } };
    const adultGames = { matgo: { name: '맞고', unit: 'G' }, poker: { name: '세븐포커', unit: 'G' }, roulette: { name: '룰렛', unit: 'G' }, photo_ttang: { name: '포토땅따먹기', unit: '장' } };
    const getGames = () => ({ ...ordinaryGames, ...(access.visible() ? adultGames : {}) });
    const rankClient = { rpc: async (_name, args) => { rankingReads.push([...args.p_games]); return { data: { tank: { nick: '회원', score: 3 } } }; } };
    w.eval(fs.readFileSync(path.join(root, 'world-game-rankings.js'), 'utf8'));
    const rankRows = () => [...rankHost.querySelectorAll('[data-game]')].map(row => row.dataset.game);
    const mountRankings = () => { const owner = w.D.user?.id; w.OjjudaGameRankings.mount(rankHost, { client: rankClient, owner, games: getGames(), getGames, authorized: () => w.D.online && w.D.user?.id === owner }); };
    w.eval(world.slice(start, end));
    w.eval(world.slice(catalogStart, catalogEnd) + ';');
    w.eval(world.slice(menuStart, menuEnd));
    const panel = w.document.querySelector('#ppanel');
    panel.innerHTML = w.Df() + '<input id="pmsg">';
    const adultIds = Object.keys(adultGames);
    const buttonId = button => button.dataset.act === 'matgo-open' ? 'matgo' : button.dataset.v;
    const headings = host => [...host.querySelectorAll('h2')].map(heading => heading.textContent.trim());
    const adultSection = () => panel.querySelector('[data-arcade-adult]');
    const noAdultMenu = (host = panel) => {
      assert.equal(host.querySelector('[data-arcade-adult]'), null, 'access loss removes the complete adult section');
      assert.deepEqual(headings(host), ['나만의 플레이', '함께하는 플레이'], 'no orphan adult heading remains');
      assert.deepEqual([...host.querySelectorAll('[data-arcade-games]')].map(grid => grid.dataset.arcadeGames), ['solo', 'multi']);
      assert.equal([...host.querySelectorAll('.gbtn')].filter(button => adultIds.includes(buttonId(button))).length, 0, 'restricted games are absent from every category');
    };
    const completeAdultMenu = () => {
      assert.equal(panel.querySelectorAll('[data-arcade-adult]').length, 1);
      assert.deepEqual(headings(panel), ['나만의 플레이', '함께하는 플레이', '어른들 플레이']);
      assert.deepEqual([...panel.querySelectorAll('[data-arcade-games]')].map(grid => grid.dataset.arcadeGames), ['solo', 'multi', 'adult'], 'the adult section follows the multiplayer section');
      const section = adultSection();
      assert.equal(section.getAttribute('aria-label'), '어른들 플레이');
      assert.notEqual(w.getComputedStyle(section).display, 'none');
      assert.deepEqual([...section.querySelectorAll('.gbtn')].map(buttonId), adultIds, 'all four adult games keep their display order');
      for (const id of adultIds) {
        const buttons = [...panel.querySelectorAll('.gbtn')].filter(button => buttonId(button) === id);
        assert.equal(buttons.length, 1, id + ' has exactly one menu entry');
        assert.ok(section.contains(buttons[0]), id + ' belongs only to the adult section');
        assert.match(buttons[0].getAttribute('aria-label'), /만 19세 이상/);
      }
    };
    assert.deepEqual(['matgo', ...Object.entries(w._r).filter(([, game]) => game.age >= 19).map(([id]) => id)].sort(), [...adultIds].sort(), 'the adult section covers the real 19+ game catalog');
    const matgo = () => w.document.querySelector('[data-act="matgo-open"]');
    const photoVisible = () => { const button = panel.querySelector('[data-v="photo_ttang"]'); return !!button && w.getComputedStyle(button).display !== 'none'; };
    noAdultMenu();
    identityError = true; mountRankings();
    await until(() => reads > 0, 'the initial ranking age check runs');
    await wait(0); assert.deepEqual(rankRows(), Object.keys(ordinaryGames));
    identityError = false; await w.refreshWorldMatgoAccess();
    await until(() => Object.keys(adultGames).every(id => rankRows().includes(id)), 'successful retry restores all restricted ranking rows without navigation');
    assert.ok(matgo() && photoVisible());
    assert.equal(matgo().nextElementSibling?.dataset.v,'poker','poker refreshes beside Matgo');
    completeAdultMenu();
    // A cached age grant alone cannot render an offline or missing-user entry.
    const adultUser = w.D.user;
    for (const auth of [{ online: false, user: adultUser }, { online: true, user: null }]) {
      Object.assign(w.D, auth);
      const guest = w.document.createElement('div'); guest.innerHTML = w.Df();
      noAdultMenu(guest);
    }
    Object.assign(w.D, { online: true, user: adultUser });
    const draft = w.document.querySelector('#pmsg');
    draft.value = '작성 중인 대화'; draft.focus(); draft.setSelectionRange(2, 4);
    const ordinary = panel.querySelector('[data-arcade-games=solo] [data-v=mines]');
    const loadedRankingReads = rankingReads.length;
    await w.refreshWorldMatgoAccess();
    assert.equal(rankingReads.length, loadedRankingReads, 'unchanged access does not reload rankings');
    completeAdultMenu();

    // A check can fail while the phone is backgrounded. Returning restores the whole section.
    hidden = true;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    identityError = true;
    await assert.rejects(access.check());
    assert.ok(!matgo() && !photoVisible());
    noAdultMenu();
    assert.deepEqual(rankRows(), Object.keys(ordinaryGames), 'access loss removes only restricted ranking rows');
    identityError = false; hidden = false;
    const beforeResume = reads;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    w.dispatchEvent(new w.Event('focus'));
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    await until(() => matgo() && photoVisible(), 'returning restores the adult section without reload');
    await until(() => Object.keys(adultGames).every(id => rankRows().includes(id)), 'resume restores all restricted ranking rows in the same mount');
    assert.equal(reads, beforeResume + 1, 'resume events share one check');
    completeAdultMenu();
    assert.equal(matgo().nextElementSibling?.dataset.v,'poker','resume preserves the card game order');
    assert.equal(w.document.querySelectorAll('[data-v=poker]').length,1,'refresh cannot duplicate poker');
    assert.equal(draft.value, '작성 중인 대화');
    assert.equal(w.document.activeElement, draft);
    assert.equal(draft.selectionStart, 2);
    assert.equal(panel.querySelector('[data-arcade-games=solo] [data-v=mines]'), ordinary);

    // Auth may still be reconnecting when the first resume check runs.
    authError = true;
    w.dispatchEvent(new w.Event('focus'));
    await until(() => !access.visible(), 'temporary auth failure is denied');
    authError = false;
    await until(() => matgo() && photoVisible(), 'transient resume failure retries automatically');

    for (const event of [new w.Event('online'), new w.PageTransitionEvent('pageshow', { persisted: true })]) {
      identityError = true; await assert.rejects(access.check()); identityError = false;
      w.dispatchEvent(event);
      await until(() => matgo() && photoVisible(), 'network and page-cache return restore games');
    }

    age = 18; w.D.user = { id: 'minor' }; callback('SIGNED_IN', { user: w.D.user });
    assert.ok(!matgo() && !photoVisible(), 'account changes immediately hide adult games');
    noAdultMenu();
    w.dispatchEvent(new w.Event('focus'));
    const beforeMinor = reads;
    await until(() => reads > beforeMinor, 'minor is checked');
    await wait(1700);
    assert.equal(reads, beforeMinor + 1, 'underage results are not retried');
    assert.ok(!matgo() && !photoVisible());
    noAdultMenu();
    const minor = w.document.createElement('div'); minor.innerHTML = w.Df();
    noAdultMenu(minor);

    age = 19; w.D.user = { id: 'adult-again' }; callback('SIGNED_IN', { user: w.D.user });
    await w.refreshWorldMatgoAccess();
    completeAdultMenu();
    w.dispatchEvent(new w.Event('focus'));
    w.D.online = false; w.D.user = null; callback('SIGNED_OUT', null);
    const beforeLogout = reads;
    await wait(200);
    assert.equal(reads, beforeLogout, 'queued resume does not check after logout');
    assert.ok(!matgo() && !photoVisible());
    noAdultMenu();
    const beforeGuest = reads;
    await w.refreshWorldMatgoAccess();
    assert.equal(reads, beforeGuest, 'guests never fetch member identity');
    const guest = w.document.createElement('div'); guest.innerHTML = w.Df();
    noAdultMenu(guest);
    w.D.online = true; w.D.user = { id: 'anonymous-guest', is_anonymous: true };
    callback('SIGNED_IN', { user: w.D.user });
    await w.refreshWorldMatgoAccess();
    assert.equal(reads, beforeGuest, 'anonymous guests never fetch member identity');
    noAdultMenu();
    console.log('PASS: actual arcade catalog, one adult section after multiplayer, all four 19+ games, guest/minor denial, revoke/reauth, app return, reconnect retry and draft/focus preservation');
  } finally { dom.window.OjjudaGameRankings?.mount(null); dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

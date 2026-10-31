const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const start = world.indexOf('function worldMatgoButton(){');
const end = world.indexOf('var worldMemberEntry=null;', start);
assert.ok(start > 0 && end > start);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message, timeout = 2600) {
  const limit = Date.now() + timeout;
  while (!test() && Date.now() < limit) await wait(20);
  assert.ok(test(), message);
}
(async () => {
  const dom = new JSDOM('<main data-arcade-rank-root></main><div id="ppanel"><div class="bd-btns"><button data-act="game-open" data-v="photo_ttang">19+</button><button id="ordinary">일반 게임</button></div><input id="pmsg"></div>', {
    url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  try {
    const w = dom.window;
    w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} disconnect() {} };
    let hidden = false, callback, identityError = false, authError = false, age = 35, reads = 0;
    Object.defineProperty(w.document, 'hidden', { get: () => hidden });
    w.D = { online: true, user: { id: 'adult' } };
    w.g = { tab: 'place', place: { id: 'arcade' } };
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
    const adultGames = { matgo: { name: '맞고', unit: 'G' }, poker: { name: '세븐포커', unit: 'G' }, photo_ttang: { name: '포토땅따먹기', unit: '장' } };
    const getGames = () => ({ ...ordinaryGames, ...(access.visible() ? adultGames : {}) });
    const rankClient = { rpc: async (_name, args) => { rankingReads.push([...args.p_games]); return { data: { tank: { nick: '회원', score: 3 } } }; } };
    w.eval(fs.readFileSync(path.join(root, 'world-game-rankings.js'), 'utf8'));
    const rankRows = () => [...rankHost.querySelectorAll('[data-game]')].map(row => row.dataset.game);
    const mountRankings = () => { const owner = w.D.user?.id; w.OjjudaGameRankings.mount(rankHost, { client: rankClient, owner, games: getGames(), getGames, authorized: () => w.D.online && w.D.user?.id === owner }); };
    w.eval(world.slice(start, end));
    const matgo = () => w.document.querySelector('[data-act="matgo-open"]');
    const photoVisible = () => w.getComputedStyle(w.document.querySelector('[data-v="photo_ttang"]')).display !== 'none';
    identityError = true; mountRankings();
    await until(() => reads > 0, 'the initial ranking age check runs');
    await wait(0); assert.deepEqual(rankRows(), Object.keys(ordinaryGames));
    identityError = false; await w.refreshWorldMatgoAccess();
    await until(() => Object.keys(adultGames).every(id => rankRows().includes(id)), 'successful retry restores all restricted ranking rows without navigation');
    assert.ok(matgo() && photoVisible());
    assert.equal(matgo().nextElementSibling?.dataset.v,'poker','poker refreshes beside Matgo');
    const draft = w.document.querySelector('#pmsg');
    draft.value = '작성 중인 대화'; draft.focus(); draft.setSelectionRange(2, 4);
    const ordinary = w.document.querySelector('#ordinary');
    const loadedRankingReads = rankingReads.length;
    await w.refreshWorldMatgoAccess();
    assert.equal(rankingReads.length, loadedRankingReads, 'unchanged access does not reload rankings');

    // A check can fail while the phone is backgrounded. Returning must repair both games.
    hidden = true;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    identityError = true;
    await assert.rejects(access.check());
    assert.ok(!matgo() && !photoVisible());
    assert.deepEqual(rankRows(), Object.keys(ordinaryGames), 'access loss removes only restricted ranking rows');
    identityError = false; hidden = false;
    const beforeResume = reads;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    w.dispatchEvent(new w.Event('focus'));
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    await until(() => matgo() && photoVisible(), 'returning restores both adult games without reload');
    await until(() => Object.keys(adultGames).every(id => rankRows().includes(id)), 'resume restores all restricted ranking rows in the same mount');
    assert.equal(reads, beforeResume + 1, 'resume events share one check');
    assert.equal(matgo().nextElementSibling?.dataset.v,'poker','resume preserves the card game order');
    assert.equal(w.document.querySelectorAll('[data-v=poker]').length,1,'refresh cannot duplicate poker');
    assert.equal(draft.value, '작성 중인 대화');
    assert.equal(w.document.activeElement, draft);
    assert.equal(draft.selectionStart, 2);
    assert.equal(w.document.querySelector('#ordinary'), ordinary);

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
    w.dispatchEvent(new w.Event('focus'));
    const beforeMinor = reads;
    await until(() => reads > beforeMinor, 'minor is checked');
    await wait(1700);
    assert.equal(reads, beforeMinor + 1, 'underage results are not retried');
    assert.ok(!matgo() && !photoVisible());

    age = 35; w.D.user = { id: 'adult-again' }; callback('SIGNED_IN', { user: w.D.user });
    await w.refreshWorldMatgoAccess();
    w.dispatchEvent(new w.Event('focus'));
    w.D.online = false; w.D.user = null; callback('SIGNED_OUT', null);
    const beforeLogout = reads;
    await wait(200);
    assert.equal(reads, beforeLogout, 'queued resume does not check after logout');
    assert.ok(!matgo() && !photoVisible());
    console.log('PASS: app return, page cache, reconnect retry, both adult games, draft/focus preservation, minors and logout');
  } finally { dom.window.OjjudaGameRankings?.mount(null); dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

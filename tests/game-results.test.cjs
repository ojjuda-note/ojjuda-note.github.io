const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../game-results.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, options = {}) {
  const dom = new JSDOM('<button id="launcher">게임</button><main id="host"></main>', {
    url: options.url || 'https://ojjuda.kr/world.html?room=private&invite=secret&image=personal',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: !!options.reduced, addEventListener() {} });
  w.eval(source);
  t.after(() => w.close());
  const api = w.OjjudaGameResults, host = w.document.getElementById('host');
  const render = (options = {}) => { host.innerHTML = api.markup({ game: 'spot', outcome: 'success', ...options }); return host.firstElementChild; };
  return { w, api, host, render };
}
test('every game and mode shares a canonical game-only link without private session parameters', t => {
  const { api } = fixture(t);
  assert.equal(Object.keys(api.games).length, 26);
  for (const game of Object.keys(api.games)) {
    const data = api.shareData({ game, outcome: 'success' });
    assert.equal(data.url, 'https://ojjuda.kr/world.html?game=' + game);
    assert.deepEqual(Object.keys(data).sort(), ['text', 'title', 'url']);
    assert.doesNotMatch(JSON.stringify(data), /private|secret|personal|room=|invite=/);
  }
  for (const game of ['__proto__', 'constructor', 'unknown', 'spot&room=x']) assert.equal(api.shareData({ game }), null);
  assert.equal(api.shareData({ game: 'stacker', score: 13 }).url, 'https://ojjuda.kr/world.html?game=stacker&challenge=1&score=13');
  assert.equal(api.shareData({ game: 'mole', score: -1 }).url, 'https://ojjuda.kr/world.html?game=mole');
  assert.equal(api.shareData({ game: 'poker', score: 1000 }).url, 'https://ojjuda.kr/world.html?game=poker');
});
test('only one allowlisted game parameter can be requested', t => {
  for (const [query, expected] of [['?game=carom3', 'carom3'], ['?game=spot&game=spot', null], ['?game=admin', null], ['?game=constructor', null]]) {
    const { api } = fixture(t, { url: 'https://ojjuda.kr/world.html' + query });
    assert.equal(api.requestedGame(), expected);
  }
});
test('result text is escaped and pending settlements can hide sharing', t => {
  const { render } = fixture(t);
  const card = render({ title: '<img src=x onerror=alert(1)>', metric: '<b>100</b>', encouragement: '<script>bad</script>', key: '" onfocus="bad', share: false });
  assert.equal(card.querySelector('img'), null);
  assert.equal(card.querySelector('script'), null);
  assert.equal(card.querySelector('.game-result-metric').textContent, '<b>100</b>');
  assert.equal(card.querySelector('[data-game-result-share]'), null);
  assert.equal(card.dataset.resultKey, '" onfocus="bad');
});
test('decorate moves original stage and settlement controls without losing their handlers or disabled gate', t => {
  const { api, host, w } = fixture(t);
  host.innerHTML = '<dialog id="result"><p id="metric">9단계</p><div id="stages"><button id="prev">이전</button><button id="now">지금</button><button id="next" disabled>다음</button></div><p id="pending">정산 대기</p></dialog>';
  const dialog = host.firstElementChild, stages = w.document.getElementById('stages'), metric = w.document.getElementById('metric');
  const now = w.document.getElementById('now'), next = w.document.getElementById('next'); let clicks = 0;
  now.addEventListener('click', () => clicks++);
  const card = api.decorate(dialog, { game: 'spot', outcome: 'failure', metric, actions: [stages], extra: [w.document.getElementById('pending')] });
  now.click(); next.click();
  assert.equal(clicks, 1); assert.equal(card.querySelector('#now'), now); assert.equal(card.querySelector('#metric'), metric);
  assert.equal(card.querySelector('#next').disabled, true); assert.ok(dialog.classList.contains('game-result-dialog'));
  assert.equal(dialog.querySelectorAll('#stages').length, 1); assert.equal(dialog.hasAttribute('open'), false, 'decorate does not change the outer lifecycle');
  api.decorate(dialog, { game: 'spot', outcome: 'success', metric, actions: [stages] });
  now.click(); assert.equal(clicks, 2); assert.equal(dialog.querySelectorAll('[data-game-result-share]').length, 1);
});
test('native share is user initiated, deduplicated during the promise, and tracked only after success', async t => {
  const { w, render } = fixture(t); let resolve, calls = 0, tracked = 0, received;
  w.navigator.share = data => { calls++; received = data; return new Promise(done => { resolve = done; }); };
  w.OjjudaGameChallenges = { recordShare: () => tracked++ };
  const card = render({ game: 'mole', outcome: 'record', score: 51 }), button = card.querySelector('[data-game-result-share]');
  assert.equal(calls, 0); button.click(); button.click(); assert.equal(calls, 1); assert.equal(tracked, 0);
  assert.equal(received.url, 'https://ojjuda.kr/world.html?game=mole&challenge=1&score=51');
  resolve(); await tick(); assert.equal(tracked, 1); assert.equal(button.disabled, false);
});
test('cancelling the native share never copies, opens a fallback, or tracks a share', async t => {
  const { w, render } = fixture(t); let copies = 0, tracked = 0;
  w.navigator.share = async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); };
  w.navigator.clipboard = { writeText: async () => { copies++; } };
  w.OjjudaGameChallenges = { recordShare: () => tracked++ };
  const card = render(), button = card.querySelector('[data-game-result-share]'); button.click(); await tick();
  assert.equal(copies, 0); assert.equal(tracked, 0); assert.equal(card.querySelector('.game-result-copy').hidden, true); assert.equal(button.disabled, false);
});
test('unsupported sharing copies the canonical link; clipboard failure offers manual copy in the same card', async t => {
  const { w, render } = fixture(t); let copied;
  w.navigator.share = async () => { throw new Error('unsupported'); };
  w.navigator.clipboard = { writeText: async value => { copied = value; } };
  const card = render({ game: 'photo_ttang' }), button = card.querySelector('[data-game-result-share]');
  button.click(); await tick(); assert.match(copied, /https:\/\/ojjuda.kr\/world.html\?game=photo_ttang$/);
  assert.match(card.querySelector('[role=status]').textContent, /복사/);
  w.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  button.click(); await tick(); const input = card.querySelector('.game-result-copy input');
  assert.ok(input); assert.equal(input.value, 'https://ojjuda.kr/world.html?game=photo_ttang'); assert.equal(input.readOnly, true);
  assert.equal(w.document.querySelector('dialog'), null); assert.equal(w.document.activeElement, input);
});
test('a share rejected after the result was removed cannot open a fallback over the next game', async t => {
  const { w, render, host } = fixture(t); let reject, copies = 0;
  w.navigator.share = () => new Promise((_, fail) => { reject = fail; });
  w.navigator.clipboard = { writeText: async () => copies++ };
  render().querySelector('[data-game-result-share]').click(); host.replaceChildren(); reject(new Error('unsupported')); await tick();
  assert.equal(copies, 0); assert.equal(w.document.querySelector('.game-result-copy input'), null);
});
test('success, record, and gold gain celebrate once per round; failure and gold loss show sad motion', async t => {
  const { render, host } = fixture(t);
  for (const outcome of ['success', 'record', 'gold-gain', 'failure', 'gold-loss']) {
    const card = render({ outcome, key: outcome }); await tick();
    assert.ok(card.classList.contains(['failure', 'gold-loss'].includes(outcome) ? 'is-sad' : 'is-celebrating'));
    const count = card.querySelector('.game-result-effects').childElementCount; assert.ok(count > 0 && count <= 60);
    const button = card.querySelector('[data-game-result-share]'); assert.equal(button.disabled, false);
    const same = render({ outcome, key: outcome }); await tick(); assert.equal(same.querySelector('.game-result-effects').childElementCount, 0);
    host.replaceChildren(); await tick(); assert.equal(card.querySelector('.game-result-effects').childElementCount, 0, 'removed effects are cleaned up');
  }
});
test('ordinary score completion, draw and neutral gold never display victory effects', async t => {
  const { render } = fixture(t);
  for (const outcome of ['score', 'draw', 'gold-even', 'complete']) {
    const card = render({ outcome }); await tick(); assert.equal(card.querySelector('.game-result-effects').childElementCount, 0);
  }
});
test('reduced-motion preference suppresses decorative particles', async t => {
  const { render } = fixture(t, { reduced: true }); const card = render({ outcome: 'record' }); await tick();
  assert.equal(card.querySelector('.game-result-effects').childElementCount, 0); assert.equal(card.classList.contains('is-celebrating'), false);
});
test('a verified record update changes the result without replacing existing action callbacks', async t => {
  const { api, render, w } = fixture(t); let clicks = 0;
  const card = render({ game: 'runner', outcome: 'score', metric: '100점', key: 'round-1', actions: '<button id="retry">다시하기</button>' });
  const retry = w.document.getElementById('retry'); retry.addEventListener('click', () => clicks++); await tick();
  api.update(card, { outcome: 'record', metric: '100점 · 오늘 1등', encouragement: '멋진 기록이에요!' }); retry.click();
  assert.equal(card.querySelector('.game-result-title').textContent, '신기록'); assert.equal(clicks, 1);
  assert.equal(card.querySelector('#retry'), retry); assert.ok(card.classList.contains('is-celebrating'));
});
test('show keeps a declined action open, preserves disabled gates, and restores launch focus', async t => {
  const { api, w } = fixture(t); let selected = 0, closed = 0;
  const launcher = w.document.getElementById('launcher'); launcher.focus();
  const handle = api.show({ game: 'spot', outcome: 'failure', onClose: () => closed++, actions: [
    { label: '이전', disabled: true, onClick: () => selected++ },
    { id: 'continue', label: '지금', onClick: () => { selected++; return false; } },
    { id: 'done', label: '닫기' }
  ] });
  handle.element.querySelector('button:disabled').click(); assert.equal(selected, 0);
  w.document.getElementById('continue').click(); await tick(); assert.equal(selected, 1); assert.ok(handle.element.isConnected);
  w.document.getElementById('done').click(); await tick(); assert.equal(closed, 1); assert.equal(handle.element.isConnected, false); assert.equal(w.document.activeElement, launcher);
  handle.close(); assert.equal(closed, 1);
});
test('async actions cannot be double clicked or close a newer result', async t => {
  const { api, w } = fixture(t); let resolve, calls = 0;
  const first = api.show({ game: 'roulette', outcome: 'complete', actions: [{ id: 'settle', label: '확인', onClick: () => { calls++; return new Promise(done => { resolve = done; }); } }] });
  const settle = w.document.getElementById('settle'); settle.click(); settle.click(); assert.equal(calls, 1);
  assert.equal(first.card.querySelector('[data-game-result-share]').disabled, false, 'action work does not lock sharing');
  const second = api.show({ game: 'spot', outcome: 'success' }); resolve(); await tick(); assert.ok(second.element.isConnected);
  api.close(); assert.equal(second.element.isConnected, false);
});
test('dismissible false protects a required result action from Escape', t => {
  const { api, w } = fixture(t);
  const handle = api.show({ game: 'roulette', outcome: 'complete', dismissible: false, share: false });
  const event = new w.Event('cancel', { cancelable: true }); handle.element.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.ok(handle.element.isConnected); handle.close();
});
test('a retained guest result still gates replay while sharing and settlement controls remain usable', async t => {
  const { api, w } = fixture(t); let replays = 0, shares = 0, settlements = 0, gates = 0;
  w.OjjudaGuestAccess = { canPlay: () => { gates++; return false; } };
  w.navigator.share = async () => shares++;
  const handle = api.show({ game: 'spot', outcome: 'success', actions: [
    { id: 'play-again', label: '지금', requiresPlay: true, onClick: () => { replays++; return false; } },
    { id: 'verify', label: '확인', onClick: () => { settlements++; return false; } }
  ] });
  w.document.getElementById('play-again').click(); assert.equal(gates, 1); assert.equal(replays, 0);
  w.document.getElementById('verify').click(); await tick();
  handle.card.querySelector('[data-game-result-share]').click(); await tick();
  assert.equal(settlements, 1); assert.equal(shares, 1); assert.equal(gates, 1);
  handle.close();
});

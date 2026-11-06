/* Rating selection, persistence boundaries, and stale-session behavior. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { installRecommendedRestaurantsFixture, recommendation, deferred } = require('./helpers/recommended-restaurants-fixture.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'games/certified-restaurants/restaurant-ratings.js'), 'utf8');
const scores = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(check, message) {
  for (let count = 0; count < 100; count++) { if (check()) return; await pause(); }
  assert.fail(message);
}
function fixture(t) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><section id="rating"></section></body></html>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.eval(source);
  const f = { dom, window, document: window.document, api: window.OjjudaRestaurantRatings, container: window.document.querySelector('#rating') };
  t.after(() => { window.close(); assert.deepEqual(errors, [], 'no uncaught DOM errors'); });
  return f;
}
function summary(score = null, options = {}) { return { id: 'seoul-test', average: score, count: score === null ? 0 : 1, my_rating: score, ...options }; }
function transport() {
  let user = { id: 'member-one' }, current = summary(), handler;
  const calls = [], listeners = new Set();
  const client = {
    auth: { onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; } },
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (handler) return handler(name, parameters);
      if (name === 'get_restaurant_rating_summaries') return { data: parameters.p_ids.map(id => ({ ...current, id })), error: null };
      current = summary(parameters.p_score, { id: parameters.p_id });
      return { data: current, error: null };
    }
  };
  return {
    client, calls, getUser: () => user, setHandler: next => { handler = next; },
    change(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') { user = next; for (const callback of listeners) callback(event, next ? { user: next } : null); },
    listeners
  };
}
function choose(f, score) {
  const radio = f.container.querySelector('input[value="' + score + '"]');
  assert.ok(radio, 'requested half-step choice exists');
  radio.click();
  return radio;
}

test('service accepts exactly nine half-step scores and never sends a member identity', async t => {
  const f = fixture(t), rpc = transport(), service = f.api.create(rpc);
  t.after(() => service.destroy());
  for (const score of scores) {
    const result = await service.setRating('certified', 'blue-add-벽제갈비더청담', score);
    assert.equal(result.my_rating, score); assert.equal(result.count, 1);
    assert.deepEqual(Object.keys(rpc.calls.at(-1).parameters).sort(), ['p_id', 'p_kind', 'p_score']);
  }
  const previous = rpc.calls.length;
  for (const invalid of [null, 0.5, 1.25, 5.5, NaN, Infinity, '4.5']) await assert.rejects(service.setRating('certified', 'seoul-test', invalid), /rating_score_invalid/);
  await assert.rejects(service.getSummaries('certified', Array.from({ length: 101 }, (_, i) => 'place-' + i)), /targets_invalid/);
  assert.equal(rpc.calls.length, previous, 'bad inputs cannot reach the backend');
  const loaded = await service.getSummaries('certified', ['seoul-test', 'seoul-test']);
  assert.equal(loaded.length, 1); assert.equal(rpc.calls.at(-1).parameters.p_ids.length, 1);
});

test('signed-out, anonymous, changed, and destroyed sessions cannot obtain member rating results', async t => {
  const f = fixture(t), rpc = transport(), service = f.api.create(rpc);
  t.after(() => service.destroy());
  rpc.change(null);
  await assert.rejects(service.getSummaries('certified', ['seoul-test']), /sign_in_required/);
  rpc.change({ id: 'anonymous', is_anonymous: true });
  await assert.rejects(service.setRating('certified', 'seoul-test', 3), /sign_in_required/);
  assert.equal(rpc.calls.length, 0);
  rpc.change({ id: 'member-one' });
  const delayed = deferred(); rpc.setHandler(() => delayed.promise);
  const old = service.getSummaries('certified', ['seoul-test']);
  rpc.change(null); rpc.change({ id: 'member-one' });
  delayed.resolve({ data: [summary(4.5)], error: null });
  await assert.rejects(old, /rating_session_changed/, 'even a return to the same account invalidates old results');
  service.destroy(); assert.equal(rpc.listeners.size, 0);
  await assert.rejects(service.setRating('certified', 'seoul-test', 4), /sign_in_required/);
});

test('unexpected targets and malformed rating responses are rejected instead of becoming empty averages', async t => {
  const f = fixture(t), rpc = transport(), service = f.api.create(rpc);
  t.after(() => service.destroy());
  for (const data of [[summary(5, { id: 'not-requested' })], [summary(6)], [summary(null, { count: -1 })], [summary(3), summary(3)]]) {
    rpc.setHandler(() => ({ data, error: null }));
    await assert.rejects(service.getSummaries('certified', ['seoul-test']), /response_invalid/);
  }
});

test('summary separates loading, unavailable, zero votes, and a real aggregate', t => {
  const f = fixture(t);
  f.api.renderSummary(f.container, undefined); assert.match(f.container.textContent, /불러오는 중/);
  f.api.renderSummary(f.container, null); assert.match(f.container.textContent, /불러오지 못/); assert.doesNotMatch(f.container.textContent, /아직 별점/);
  f.api.renderSummary(f.container, summary()); assert.match(f.container.textContent, /아직 별점이 없어요/); assert.equal(f.container.querySelector('.orr-average'), null);
  f.api.renderSummary(f.container, summary(4.25, { count: 2, my_rating: 4.5 }));
  assert.equal(f.container.querySelector('.orr-average').textContent, '4.3');
  assert.equal(f.container.querySelector('.orr-stars-fill').style.width, '85%');
  assert.equal(f.container.getAttribute('aria-label'), '평균 별점 4.3점, 2명 참여');
});

test('editor saves 1.5, edits to 4.5, preserves one vote, and renders half stars', async t => {
  const f = fixture(t), rpc = transport(), service = f.api.create(rpc);
  const changed = [];
  const editor = f.api.mountEditor(f.container, { name: '한 끼 식당', load: async () => (await service.getSummaries('certified', ['seoul-test']))[0], save: value => service.setRating('certified', 'seoul-test', value), onChange: value => changed.push(value) });
  t.after(() => { editor.dispose(); service.destroy(); });
  await until(() => !f.container.querySelector('fieldset').disabled, 'rating choices finish loading');
  const radios = [...f.container.querySelectorAll('input[type=radio]')];
  assert.deepEqual(radios.map(radio => Number(radio.value)), scores);
  assert.deepEqual(radios.map(radio => radio.parentElement.textContent), scores.map(score => score + '점'));
  assert.equal(radios.some(radio => radio.checked), false, 'new members do not get a fabricated default score');
  const save = f.container.querySelector('[data-orr=save]'); assert.equal(save.disabled, true);
  choose(f, 1.5); assert.equal(f.container.querySelector('.orr-preview .orr-stars-fill').style.width, '30%');
  save.click(); assert.equal(f.container.querySelector('fieldset').disabled, true, 'selection freezes during save');
  await until(() => changed.length === 1, 'first score is confirmed');
  assert.equal(f.container.querySelector('.orr-average').textContent, '1.5'); assert.equal(f.container.querySelector('.orr-count').textContent, '· 1명');
  assert.equal(save.disabled, true); assert.equal(save.textContent, '별점 수정');
  choose(f, 4.5); assert.equal(f.container.querySelector('.orr-preview .orr-stars-fill').style.width, '90%'); save.click();
  await until(() => changed.length === 2, 'edited score is confirmed');
  assert.equal(f.container.querySelector('.orr-average').textContent, '4.5'); assert.equal(f.container.querySelector('.orr-count').textContent, '· 1명');
  assert.match(f.container.querySelector('.orr-selected').textContent, /4.5점 · 내 별점/);
  assert.match(f.container.querySelector('.orr-status').textContent, /4.5점으로 저장/);
});

test('load retry restores the saved score and a failed save keeps selection without fake success', async t => {
  const f = fixture(t); let loadCalls = 0, saveCalls = 0;
  const editor = f.api.mountEditor(f.container, {
    load: async () => { if (++loadCalls === 1) throw new Error('offline'); return summary(3); },
    save: async score => { if (++saveCalls === 1) throw new Error('offline'); return summary(score); }
  });
  t.after(() => editor.dispose());
  await until(() => !f.container.querySelector('[data-orr=retry]').hidden, 'failed initial load has a retry');
  assert.equal(f.container.querySelector('fieldset').disabled, true); assert.equal(f.container.querySelector('[data-orr=save]').disabled, true);
  f.container.querySelector('[data-orr=retry]').click();
  await until(() => !f.container.querySelector('fieldset').disabled, 'retry recovers existing score');
  assert.equal(f.container.querySelector('input[value="3"]').checked, true);
  choose(f, 2.5); f.container.querySelector('[data-orr=save]').click();
  await until(() => f.container.querySelector('.orr-error'), 'save failure is displayed');
  assert.equal(f.container.querySelector('input[value="2.5"]').checked, true);
  assert.equal(f.container.querySelector('.orr-average').textContent, '3.0', 'aggregate remains confirmed value');
  assert.doesNotMatch(f.container.querySelector('.orr-status').textContent, /저장했어요/);
  f.container.querySelector('[data-orr=save]').click();
  await until(() => f.container.querySelector('.orr-average').textContent === '2.5', 'same score retry succeeds');
});

test('a disposed or no-longer-current editor ignores late load/save results', async t => {
  const f = fixture(t), delayedLoad = deferred(); let current = true, changes = 0;
  const first = f.api.mountEditor(f.container, { load: () => delayedLoad.promise, save: async score => summary(score), onChange: () => changes++ });
  first.dispose(); delayedLoad.resolve(summary(5)); await pause();
  assert.equal(f.container.querySelector('.orr-average'), null);
  const delayedSave = deferred();
  const second = f.api.mountEditor(f.container, { load: async () => summary(2), save: () => delayedSave.promise, isCurrent: () => current, onChange: () => changes++ });
  t.after(() => second.dispose());
  await until(() => !f.container.querySelector('fieldset').disabled, 'second editor loads');
  choose(f, 4); f.container.querySelector('[data-orr=save]').click(); current = false;
  delayedSave.resolve(summary(4)); await pause();
  assert.equal(f.container.querySelector('.orr-average').textContent, '2.0'); assert.equal(changes, 0);
});

test('recommendation cards and details share the rating service and refresh after edits', async t => {
  const f = fixture(t), item = recommendation({ photos: [] });
  f.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  f.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const state = installRecommendedRestaurantsFixture(f.window, { rows: [item] });
  let value = 4.5;
  state.hooks.rpc.get_restaurant_rating_summaries = args => ({ data: args.p_ids.map(id => summary(value, { id, count: 2, my_rating: value })), error: null });
  state.hooks.rpc.set_restaurant_rating = args => { value = args.p_score; return { data: summary(value, { id: args.p_id, count: 2 }), error: null }; };
  f.window.eval(fs.readFileSync(path.join(root, 'games/certified-restaurants/recommended-restaurants.js'), 'utf8'));
  const ui = f.window.OjjudaRecommendedRestaurants.create({ client: state.client, getUser: state.getUser });
  t.after(() => ui.destroy());
  assert.equal(typeof ui.ratings.getSummaries, 'function', 'parent bridge can reuse the authenticated service');
  ui.open(); await until(() => f.document.querySelector('.rr-card .orr-average'), 'card aggregate loads');
  assert.equal(f.document.querySelector('.rr-card .orr-average').textContent, '4.5');
  f.document.querySelector('[data-rr=card]').click();
  await until(() => f.document.querySelector('.rr-detail-content .orr-fieldset:not(:disabled)'), 'detail rating controls load');
  f.container = f.document.querySelector('.orr-editor');
  choose(f, 1.5); f.container.querySelector('[data-orr=save]').click();
  await until(() => f.container.querySelector('.orr-average').textContent === '1.5', 'detail edit succeeds');
  f.document.querySelector('[data-rr=back]').click();
  await until(() => f.document.querySelector('.rr-card .orr-average')?.textContent === '1.5', 'returning list reloads edited aggregate');
  const writes = state.calls.filter(call => call.name === 'set_restaurant_rating');
  assert.equal(writes.length, 1); assert.equal(writes[0].parameters.p_kind, 'recommended');
  f.document.querySelector('[data-rr=card]').click();
  await until(() => f.document.querySelector('.orr-editor input[value="1.5"]')?.checked, 'reopening uses saved member score');
  state.setUser({ id: state.secondMember });
  await until(() => !ui.isOpen(), 'account switch closes member-specific ratings');
});

/* User-visible behavior tests. Image decoding/layout are covered by the Chromium suite. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { installRecommendedRestaurantsFixture, recommendation, deferred } = require('./helpers/recommended-restaurants-fixture.cjs');

const root = path.resolve(__dirname, '..');
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check, message) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (check()) return;
    await pause();
  }
  assert.fail(message);
}

function fixture(t, options = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body style="overflow:auto"><button id="world-entry">추천 맛집</button></body></html>', {
    url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const { window } = dom, document = window.document;
  const urls = new Map(), revoked = [], slowTimers = new Map();
  let urlSequence = 0, fileSequence = 0, timerSequence = 0;
  const nativeTimeout = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (Number(delay) >= 4000) {
      const id = --timerSequence;
      slowTimers.set(id, () => callback(...args));
      return id;
    }
    return nativeTimeout(callback, delay, ...args);
  };
  window.clearTimeout = id => slowTimers.delete(id) || nativeClear(id);
  window.URL.createObjectURL = blob => {
    const url = 'blob:https://fixture.test/restaurant-' + (++urlSequence);
    urls.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = url => { revoked.push(url); urls.delete(url); };
  window.matchMedia = query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
  window.createImageBitmap = async () => ({ width: 2400, height: 1200, close() {} });
  window.HTMLImageElement.prototype.decode = async function () {};
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 2400 });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 1200 });
  const originalSource = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
  Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return originalSource.get.call(this); },
    set(value) { originalSource.set.call(this, value); queueMicrotask(() => this.dispatchEvent(new window.Event('load'))); }
  });
  window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {}, clearRect() {}, setTransform() {} });
  window.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    queueMicrotask(() => callback(new window.Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217])], { type: type || 'image/jpeg' })));
  };
  const state = installRecommendedRestaurantsFixture(window, options);
  const pickers = [];
  window.OjjudaRestaurantLocationPicker = {
    open(settings) {
      const pending = deferred(), entry = { settings, resolve: pending.resolve, closeCount: 0 };
      const picker = { result: pending.promise, close() { entry.closeCount++; pending.resolve(null); } };
      entry.picker = picker; pickers.push(entry); return picker;
    }
  };
  window.eval(fs.readFileSync(path.join(root, 'recommended-restaurants.js'), 'utf8'));
  state.loginRequests = 0;
  const ui = window.OjjudaRecommendedRestaurants.create({ client: state.client, getUser: state.getUser, notify: state.notify, onLogin: () => { state.loginRequests++; } });
  const $ = selector => document.querySelector(selector);
  const rr = name => $('[data-rr="' + name + '"]');
  const calls = type => state.calls.filter(call => call.type === type);
  const rpc = name => calls('rpc').filter(call => call.name === name);
  const f = {
    dom, window, document, state, ui, $, rr, urls, revoked, errors, calls, rpc, pickers,
    click(selector) { const node = $(selector); assert.ok(node, selector + ' exists'); node.click(); },
    clickRR(name) { const node = rr(name); assert.ok(node, name + ' exists'); node.click(); },
    async open() { $('#world-entry').focus(); await ui.open(); await until(() => rr('list'), 'the member list opens'); },
    async compose() { f.clickRR('compose'); await until(() => rr('editor'), 'the composer opens'); },
    async detail(id) { const selector = '[data-rr="card"][data-id="' + id + '"]'; await until(() => $(selector), 'the requested card is loaded'); f.click(selector); await until(() => $('[data-rr="detail"] .rr-detail-name'), 'restaurant detail finishes loading'); },
    fill(name, value) { const node = rr('field-' + name); assert.ok(node, name + ' field exists'); node.value = value; node.dispatchEvent(new window.Event('input', { bubbles: true })); node.dispatchEvent(new window.Event('change', { bubbles: true })); },
    validFields() { for (const [name, value] of Object.entries({ name: '새 추천 국수집', category: '한식', region: '대전', address: '대전 중구 중교로 45-5', menu: '손칼국수', reason: '직접 먹어 보니 국물이 깔끔하고 면이 쫄깃했어요.' })) f.fill(name, value); },
    choose(count, settings = {}) {
      const input = rr('photo-input'); assert.ok(input, 'photo input exists');
      const files = Array.from({ length: count }, () => new window.File([
        new Uint8Array(settings.bytes || [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
      ], '회원사진-' + (++fileSequence) + (settings.extension || '.png'), { type: settings.type || 'image/png', lastModified: fileSequence }));
      Object.defineProperty(input, 'files', { configurable: true, value: files });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      return files;
    },
    photoCount() { return document.querySelectorAll('[data-rr="photo-remove"]').length; },
    async photos(count) { await until(() => f.photoCount() === count, 'photo count becomes ' + count); await pause(); },
    expireTimeouts() { const pending = [...slowTimers.values()]; slowTimers.clear(); pending.forEach(callback => callback()); },
    async settle() { await pause(); await pause(); }
  };
  t.after(async () => {
    ui.destroy();
    await f.settle();
    dom.window.close();
    assert.deepEqual(errors, [], 'no uncaught DOM errors');
  });
  return f;
}

test('signed-out and anonymous accounts see only a login prompt without querying member records', async t => {
  for (const user of [null, { id: '10000000-0000-4000-8000-000000000099', is_anonymous: true }]) {
    const f = fixture(t, { user });
    await f.ui.open(); await f.settle();
    assert.equal(f.ui.isOpen(), true);
    assert.ok(f.rr('dialog')); assert.ok(f.rr('login'));
    assert.equal(f.rr('list'), null); assert.equal(f.rr('editor'), null); assert.equal(f.rr('compose'), null);
    await assert.rejects(f.ui.getMapPage(), /sign_in_required/, 'map metadata uses the same membership boundary');
    assert.equal(f.calls('rpc').length, 0, 'member-only RPCs are never sent');
    assert.ok(f.state.notices.some(message => /로그인|회원/.test(message)));
    f.clickRR('login'); await f.settle();
    assert.equal(f.state.loginRequests, 1); assert.equal(f.ui.isOpen(), false);
  }
});

test('map pages include every eligible recommendation with only allowed metadata and no photo downloads', async t => {
  const rows = Array.from({ length: 53 }, (_, index) => recommendation({ id: '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), name: '추천 가게 ' + index, latitude: index === 0 ? 36.324 : null, longitude: index === 0 ? 127.427 : null }));
  const f = fixture(t, { rows });
  const first = await f.ui.getMapPage(), last = await f.ui.getMapPage({ offset: 50 });
  assert.equal(f.ui.isOpen(), false, 'the directory feed does not open a second dialog');
  assert.equal(first.rows.length, 50); assert.equal(first.total, 53); assert.equal(first.hasMore, true);
  assert.equal(last.rows.length, 3); assert.equal(last.hasMore, false);
  assert.deepEqual([...first.rows, ...last.rows].map(row => row.id), rows.map(row => row.id));
  assert.deepEqual(Object.keys(first.rows[0]).sort(), ['address', 'category', 'created_at', 'id', 'latitude', 'longitude', 'menu', 'name', 'region']);
  assert.equal(first.rows[0].latitude, 36.324); assert.equal(first.rows[0].longitude, 127.427);
  assert.equal(first.rows[0].created_at, rows[0].created_at, 'recent sorting receives the actual registration date');
  assert.equal(first.rows[1].latitude, null); assert.equal(first.rows[1].longitude, null);
  assert.equal(f.calls('download').length, 0, 'member photo paths and downloads stay in the recommendation detail');
  for (const options of [{ offset: -1 }, { offset: 10001 }, { offset: 0.5 }, { limit: 51 }, { limit: '50' }]) await assert.rejects(f.ui.getMapPage(options), /invalid_input/);
  assert.equal(f.rpc('list_restaurant_recommendations').length, 2, 'invalid page requests never reach the backend');
  f.state.hooks.rpc.list_restaurant_recommendations = () => ({ data: { rows: [rows[0]], total: 10051 }, error: null });
  await assert.rejects(f.ui.getMapPage(), /map_limit/, 'a feed larger than the backend range is reported, never silently truncated');
});

test('headless map reads reject account changes, sign-out and delayed responses without retaining member metadata', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  let pending = deferred();
  f.state.hooks.rpc.list_restaurant_recommendations = () => pending.promise;
  const read = f.ui.getMapPage(), rejected = assert.rejects(read, /session_changed/);
  f.state.setUser({ id: f.state.secondMember }); f.state.setUser({ id: f.state.member });
  pending.resolve({ data: { rows: [item], total: 1 }, error: null }); await rejected;
  pending = deferred();
  const timeout = assert.rejects(f.ui.getMapPage(), /연결이 지연/);
  f.expireTimeouts(); await timeout;
  pending.resolve({ data: { rows: [item], total: 1 }, error: null }); await f.settle();
  assert.equal(f.ui.isOpen(), false);
  pending = deferred();
  const cancelled = assert.rejects(f.ui.getMapPage(), /session_changed/);
  f.ui.cancelMapReads(); pending.resolve({ data: { rows: [item], total: 1 }, error: null }); await cancelled;
  f.state.setUser(null); await assert.rejects(f.ui.getMapPage(), /sign_in_required/);
  assert.equal(f.calls('download').length, 0);
});

test('a map marker opens the original recommendation detail while preserving an unfinished editor', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  assert.equal(await f.ui.openDetail('../private'), false); assert.equal(f.calls('rpc').length, 0);
  assert.equal(await f.ui.openDetail(item.id), true);
  await until(() => f.$('[data-rr="detail"] .rr-detail-name'), 'the marker opens the stored recommendation detail');
  assert.equal(f.rpc('list_restaurant_recommendations').length, 0, 'detail navigation does not load a hidden recommendation list');
  assert.equal(f.rpc('get_restaurant_recommendation')[0].parameters.p_id, item.id);
  f.clickRR('back'); await until(() => f.rr('list'), 'Back reaches the original recommendation list');
  await f.compose(); f.fill('name', '작성 중인 맛집');
  const cancelled = f.ui.openDetail(item.id);
  await until(() => f.rr('confirm-dialog'), 'marker navigation confirms an unfinished editor');
  f.clickRR('confirm-cancel'); assert.equal(await cancelled, false);
  assert.equal(f.rr('field-name').value, '작성 중인 맛집');
  const accepted = f.ui.openDetail(item.id);
  await until(() => f.rr('confirm-dialog'), 'the next marker navigation can be accepted');
  f.clickRR('confirm-accept'); assert.equal(await accepted, true);
  await until(() => f.$('[data-rr="detail"] .rr-detail-name'), 'accepted navigation opens the requested detail');
  assert.equal(f.document.querySelectorAll('[data-rr="dialog"]').length, 1);
});

test('an initial list failure offers a working reload without mounting duplicate dialogs', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  let failed = false;
  f.state.hooks.rpc.list_restaurant_recommendations = () => {
    if (!failed) { failed = true; return { data: null, error: { message: 'offline' } }; }
  };
  await f.open();
  await until(() => f.$('.rr-grid .rr-state [data-rr="reload"]'), 'failed load can be retried');
  f.clickRR('reload');
  await until(() => f.$('[data-rr="card"][data-id="' + item.id + '"]'), 'reload displays the recovered result');
  await f.ui.open();
  assert.equal(f.document.querySelectorAll('[data-rr="dialog"]').length, 1);
});

test('untrusted restaurant fields remain literal text in the list and detail', async t => {
  const payload = '<img src=x onerror="window.memberRestaurantInjected=1">';
  const item = recommendation({ name: payload, address: payload + ' 주소', menu: payload + ' 메뉴', reason: '<script>window.memberRestaurantInjected=1</script> 추천', author_name: payload });
  const f = fixture(t, { rows: [item] });
  await f.open();
  await until(() => f.rr('card'), 'the untrusted record renders');
  assert.ok(f.rr('list').textContent.includes(payload));
  assert.equal(f.rr('list').querySelector('[onerror],script'), null);
  await f.detail(item.id);
  assert.ok(f.rr('detail').textContent.includes(item.name));
  assert.ok(f.rr('detail').textContent.includes(item.reason));
  assert.equal(f.rr('detail').querySelector('[onerror],script'), null);
  assert.equal(f.window.memberRestaurantInjected, undefined);
});

test('edit and delete controls belong only to the current member, including after an account switch', async t => {
  const own = recommendation(), other = recommendation({ id: '20000000-0000-4000-8000-000000000002', owner_id: '10000000-0000-4000-8000-000000000002', name: '다른 회원 식당' });
  const f = fixture(t, { rows: [own, other] });
  await f.open(); await f.detail(other.id);
  assert.equal(f.rr('edit'), null); assert.equal(f.rr('delete'), null);
  f.clickRR('back'); await until(() => f.rr('list'), 'back returns to list'); await f.detail(own.id);
  assert.ok(f.rr('edit')); assert.ok(f.rr('delete'));
  f.state.setUser({ id: f.state.secondMember });
  await until(() => !f.ui.isOpen(), 'changing accounts closes the previous member view');
  await f.open(); await f.detail(own.id);
  assert.equal(f.rr('edit'), null); assert.equal(f.rr('delete'), null);
  assert.equal(f.rpc('delete_restaurant_recommendation').length, 0);
});

test('zero photos cannot save, removing the only photo restores that guard, and one photo saves', async t => {
  const f = fixture(t);
  let changes = 0; f.ui.subscribeChanges(() => { changes++; });
  await f.open(); await f.compose(); f.validFields();
  assert.match(f.$('.rr-photo-help').textContent, /1~12장/);
  assert.equal(f.rr('submit').disabled, true);
  f.$('form.rr-editor').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await f.settle();
  assert.equal(f.calls('upload').length, 0);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(changes, 0, 'an uncommitted draft does not invalidate the directory');
  assert.match(f.rr('form-status').textContent, /1~12장/);
  f.choose(1); await f.photos(1); assert.equal(f.rr('submit').disabled, false);
  f.clickRR('photo-remove'); await f.photos(0);
  assert.equal(f.rr('submit').disabled, true);
  assert.match(f.rr('form-status').textContent, /1장 이상/);
  f.$('form.rr-editor').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await f.settle();
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.calls('upload').length, 0);
  f.choose(1); await f.photos(1); f.clickRR('submit');
  await until(() => f.state.rows.length === 1, 'one photo can be saved');
  assert.equal(f.state.rows[0].photos.length, 1);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1);
  assert.equal(f.calls('upload').length, 1);
  assert.ok(f.calls('upload').every(call => call.mime === 'image/jpeg' && call.settings?.upsert === false));
  assert.ok(f.state.rows[0].photos.every(photo => photo.startsWith(f.state.member + '/' + f.state.rows[0].id + '/')));
  assert.equal(changes, 1, 'a confirmed save refreshes the directory feed');
});

test('twelve photos save and a thirteenth cumulative selection cannot exceed the limit', async t => {
  const f = fixture(t);
  await f.open(); await f.compose(); f.validFields();
  f.choose(3); await f.photos(3); f.choose(9); await f.photos(12);
  f.choose(1); await f.settle();
  assert.equal(f.photoCount(), 12);
  assert.match(f.rr('form-status').textContent, /최대 12장/);
  assert.equal(f.calls('upload').length, 0, 'selection alone never uploads');
  f.clickRR('submit'); await until(() => f.state.rows.length === 1, 'twelve-photo post is saved');
  assert.equal(f.state.rows[0].photos.length, 12);
  assert.equal(f.calls('upload').length, 12);
});

test('a thirteen-file picker batch keeps at most twelve valid photos and reports the limit', async t => {
  const f = fixture(t);
  await f.open(); await f.compose(); f.validFields(); f.choose(13); await f.photos(12);
  assert.match(f.rr('form-status').textContent, /최대 12장/);
  f.clickRR('submit'); await until(() => f.state.rows.length === 1, 'the bounded picker batch saves');
  assert.equal(f.state.rows[0].photos.length, 12);
  assert.equal(f.calls('upload').length, 12);
});

test('editing counts retained photos together with additions and removes only omitted photos', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'edit opens');
  await f.photos(3); f.clickRR('photo-remove'); f.clickRR('photo-remove'); await f.photos(1);
  assert.equal(f.rr('submit').disabled, false, 'one retained photo satisfies the minimum');
  f.choose(2); await f.photos(3); f.clickRR('submit');
  await until(() => f.rpc('save_restaurant_recommendation_with_location').length === 1 && f.state.rows[0].updated_at !== item.updated_at, 'retained plus added photos save as one edit');
  const request = f.rpc('save_restaurant_recommendation_with_location')[0].parameters;
  assert.equal(request.p_id, item.id);
  assert.equal(request.p_expected_updated_at, item.updated_at);
  assert.equal(f.calls('upload').length, 2, 'retained photographs are not uploaded again');
  assert.deepEqual(f.state.rows[0].photos.filter(photo => item.photos.includes(photo)), [item.photos[2]]);
  await until(() => f.calls('remove').length > 0, 'server-confirmed removed paths are cleaned up');
  const removed = f.calls('remove').flatMap(call => call.paths);
  assert.ok(removed.includes(item.photos[0]) && removed.includes(item.photos[1]));
  assert.ok(!removed.includes(item.photos[2]));
});

test('editing an eleven-photo post accepts only one additional photograph', async t => {
  const item = recommendation();
  item.photos = Array.from({ length: 11 }, (_, index) => item.owner_id + '/' + item.id + '/50000000-0000-4000-8000-' + String(index + 1).padStart(12, '0') + '.jpg');
  const f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'edit opens');
  await f.photos(11); f.choose(2); await f.photos(12);
  assert.match(f.rr('form-status').textContent, /최대 12장/);
  f.clickRR('submit');
  await until(() => f.state.rows[0].updated_at !== item.updated_at, 'twelve total photos save');
  assert.equal(f.state.rows[0].photos.length, 12);
  assert.equal(f.calls('upload').length, 1);
});

test('editing a one-photo post rejects zero photos and saves a replacement before cleaning up the original', async t => {
  const item = recommendation(); item.photos = item.photos.slice(0, 1);
  const f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'edit opens');
  await f.photos(1); assert.equal(f.rr('submit').disabled, false);
  f.clickRR('photo-remove'); await f.photos(0); assert.equal(f.rr('submit').disabled, true);
  f.$('form.rr-editor').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await f.settle();
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.calls('remove').length, 0, 'the saved original survives an unsaved empty draft');
  assert.ok(f.state.files.has(item.photos[0]));
  f.choose(1); await f.photos(1); f.clickRR('submit');
  await until(() => f.state.rows[0].updated_at !== item.updated_at, 'one replacement photo saves');
  assert.equal(f.state.rows[0].photos.length, 1);
  assert.equal(f.calls('upload').length, 1);
  assert.notEqual(f.state.rows[0].photos[0], item.photos[0]);
  await until(() => !f.state.files.has(item.photos[0]), 'the original is cleaned up only after replacement saves');
  assert.ok(f.state.files.has(f.state.rows[0].photos[0]));
});

test('an upload failure keeps a retryable draft and does not create a partial post', async t => {
  const f = fixture(t); let uploadAttempt = 0;
  f.state.hooks.storage.upload = () => {
    if (++uploadAttempt === 2) return { data: null, error: { message: 'temporary_upload_failure' } };
  };
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3); f.clickRR('submit');
  await until(() => uploadAttempt >= 2 && f.rr('submit') && !f.rr('submit').disabled, 'the failed upload releases retry');
  assert.equal(f.state.rows.length, 0); assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.photoCount(), 3); assert.equal(f.rr('field-name').value, '새 추천 국수집');
  f.clickRR('submit'); await until(() => f.state.rows.length === 1, 'retry completes the same draft');
  assert.equal(f.state.rows[0].photos.length, 3);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1);
  assert.equal(new Set(f.state.rows[0].photos).size, 3);
});

test('an unresolved save cannot be submitted twice and read-back recovers a late commit', async t => {
  const pending = deferred(), f = fixture(t);
  f.state.hooks.rpc.save_restaurant_recommendation_with_location = () => pending.promise;
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3); f.clickRR('submit');
  await until(() => f.rpc('save_restaurant_recommendation_with_location').length === 1, 'the save has reached the service');
  const request = f.rpc('save_restaurant_recommendation_with_location')[0].parameters;
  f.expireTimeouts();
  await until(() => f.rr('reconcile') && !f.rr('reconcile').hidden, 'the uncertain save offers read-back');
  assert.equal(f.rr('submit').disabled, true);
  f.clickRR('submit'); f.clickRR('reconcile'); await f.settle();
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1, 'an empty early read-back cannot resubmit an unresolved write');
  assert.equal(f.calls('remove').length, 0, 'photos needed by an in-flight write are preserved');
  assert.equal(f.rr('submit').disabled, true);
  pending.resolve(); await until(() => f.state.rows.length === 1, 'the original write eventually commits');
  if (f.rr('reconcile')) f.clickRR('reconcile');
  await until(() => !f.rr('editor'), 'the committed draft leaves edit mode after verification');
  assert.equal(f.state.rows[0].id, request.p_id);
  assert.equal(f.state.rows[0].request_id, request.p_request_id);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1);
  assert.ok(f.state.rows[0].photos.every(photo => f.state.files.has(photo)));
});

test('switching accounts during upload closes the draft and blocks later mutations', async t => {
  const pending = deferred(), f = fixture(t);
  f.state.hooks.storage.upload = () => pending.promise;
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3); f.clickRR('submit');
  await until(() => f.calls('upload').length === 1, 'the first upload is in flight');
  f.state.setUser({ id: f.state.secondMember });
  await until(() => !f.ui.isOpen(), 'account change closes the editor immediately');
  pending.resolve(); await f.settle();
  assert.equal(f.calls('upload').length, 1, 'the old draft cannot upload its remaining photos');
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.calls('remove').length, 0, 'the new account cannot issue cleanup for the old account');
  assert.equal(f.urls.size, 0, 'private preview URLs are released');
});

test('a late list response after closing cannot reopen or repopulate the dialog', async t => {
  const pending = deferred(), f = fixture(t);
  f.state.hooks.rpc.list_restaurant_recommendations = () => pending.promise;
  const opening = f.ui.open();
  await until(() => f.rpc('list_restaurant_recommendations').length === 1, 'list request starts');
  f.ui.close(true); pending.resolve({ data: { rows: [recommendation()], total: 1, offset: 0, limit: 20 }, error: null });
  await opening; await f.settle();
  assert.equal(f.ui.isOpen(), false); assert.equal(f.rr('dialog'), null);
});

test('discard confirmation preserves or releases the draft and restores the background', async t => {
  const f = fixture(t);
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3);
  assert.ok(f.urls.size >= 3);
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'closing a dirty draft asks for confirmation');
  f.clickRR('confirm-cancel'); await f.settle();
  assert.ok(f.rr('editor')); assert.equal(f.photoCount(), 3);
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'discard can be retried');
  f.clickRR('confirm-accept'); await until(() => !f.ui.isOpen(), 'discard closes the directory');
  assert.equal(f.urls.size, 0); assert.equal(f.document.body.style.overflow, 'auto');
  assert.equal(f.calls('upload').length, 0); assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.document.activeElement.id, 'world-entry');
});

test('deletion requires owner confirmation and removes only the confirmed post', async t => {
  const item = recommendation(), other = recommendation({ id: '20000000-0000-4000-8000-000000000002', owner_id: '10000000-0000-4000-8000-000000000002', name: '다른 회원 식당' });
  const f = fixture(t, { rows: [item, other] });
  let changes = 0; f.ui.subscribeChanges(() => { changes++; });
  await f.open(); await f.detail(item.id); f.clickRR('delete'); await until(() => f.rr('confirm-dialog'), 'delete asks for confirmation');
  f.clickRR('confirm-cancel'); await f.settle(); assert.equal(f.rpc('delete_restaurant_recommendation').length, 0);
  assert.equal(changes, 0);
  f.clickRR('delete'); await until(() => f.rr('confirm-dialog'), 'delete confirmation opens again'); f.clickRR('confirm-accept');
  await until(() => f.state.rows.length === 1, 'confirmed deletion completes');
  assert.equal(f.state.rows[0].id, other.id);
  assert.equal(f.rpc('delete_restaurant_recommendation').length, 1);
  assert.equal(f.rpc('delete_restaurant_recommendation')[0].parameters.p_expected_updated_at, item.updated_at);
  assert.equal(changes, 1, 'a confirmed deletion refreshes the directory feed');
});

test('a failed edit-photo cleanup is visible and retry removes only server-confirmed omitted photos', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  let cleanupFailed = true;
  f.state.hooks.storage.remove = () => cleanupFailed ? { data: null, error: { message: 'storage_unavailable' } } : undefined;
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'edit opens');
  await f.photos(3); f.clickRR('photo-remove'); await f.photos(2); f.choose(1); await f.photos(3); f.clickRR('submit');
  await until(() => f.rr('cleanup-retry') && !f.rr('cleanup-retry').disabled, 'cleanup failure exposes a retry');
  assert.equal(f.state.rows[0].photos.length, 3, 'the completed edit remains saved');
  assert.ok(!f.state.rows[0].photos.includes(item.photos[0]));
  assert.equal(f.state.files.has(item.photos[0]), true, 'the failed removal remains available for retry');
  assert.match(f.rr('cleanup-status').textContent, /정리/);
  assert.ok(f.calls('remove').every(call => call.owner === f.state.member && call.paths.length === 1 && call.paths[0] === item.photos[0]));
  cleanupFailed = false; f.clickRR('cleanup-retry');
  await until(() => !f.state.files.has(item.photos[0]), 'retry removes the confirmed old photo');
  await until(() => f.rr('cleanup-status').hidden, 'successful retry clears the pending warning');
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1, 'cleanup retry does not repeat the post mutation');
  assert.ok(f.state.rows[0].photos.every(photo => f.state.files.has(photo)), 'retained and new referenced photos survive cleanup');
});

test('failed delete-photo cleanup is retried only when the same member returns', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  let cleanupFailed = true;
  f.state.hooks.storage.remove = () => cleanupFailed ? { data: null, error: { message: 'storage_unavailable' } } : undefined;
  await f.open(); await f.detail(item.id); f.clickRR('delete'); await until(() => f.rr('confirm-dialog'), 'delete asks for confirmation');
  f.clickRR('confirm-accept');
  await until(() => f.state.rows.length === 0 && f.rr('cleanup-retry') && !f.rr('cleanup-retry').disabled, 'deleted post exposes its remaining photo cleanup');
  assert.ok(item.photos.every(photo => f.state.files.has(photo)));
  const initialRemovals = f.calls('remove').length;
  f.state.setUser({ id: f.state.secondMember }); await until(() => !f.ui.isOpen(), 'switch closes the previous session');
  await f.open(); await f.settle();
  assert.equal(f.calls('remove').length, initialRemovals, 'another member cannot retry the previous member cleanup');
  assert.equal(f.rr('cleanup-status').hidden, true);
  cleanupFailed = false; f.state.setUser({ id: f.state.member }); await until(() => !f.ui.isOpen(), 'returning account resets the session');
  await f.open(); await until(() => item.photos.every(photo => !f.state.files.has(photo)), 'returning member drains the confirmed cleanup queue');
  assert.ok(f.calls('remove').every(call => call.owner === f.state.member));
  assert.equal(f.rpc('delete_restaurant_recommendation').length, 1, 'cleanup never repeats deletion');
});

test('Back dismisses an open confirmation without discarding or navigating away from the editor', async t => {
  const f = fixture(t);
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3);
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'discard confirmation opens');
  await f.ui.back(); await until(() => !f.rr('confirm-dialog'), 'public Back cancels only the confirmation');
  assert.ok(f.rr('editor')); assert.equal(f.photoCount(), 3); assert.equal(f.rr('field-name').value, '새 추천 국수집');
  assert.equal(f.calls('upload').length, 0); assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'native cancel is checked on a new confirmation');
  f.rr('confirm-dialog').dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
  await until(() => !f.rr('confirm-dialog'), 'native cancel also keeps the draft');
  assert.ok(f.rr('editor')); assert.equal(f.photoCount(), 3);
});

test('a confirmed map location fills region and address, survives edits, and saves only its coordinate pair', async t => {
  const initial = { latitude: 36.3504, longitude: 127.3845 }, selected = { latitude: 37.5665, longitude: 126.978 };
  const address = '서울특별시 중구 세종대로 110', resolved = { ...selected, region: '서울', address: '  ' + address + '  ', addressStatus: 'resolved' };
  const item = recommendation(initial), f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'the edit form opens');
  f.fill('name', '지도와 함께 수정한 국수집');
  assert.match(f.rr('location-status').textContent, /선택 완료/);
  f.clickRR('location-open');
  assert.deepEqual(JSON.parse(JSON.stringify(f.pickers[0].settings.location)), initial, 'the existing pair is passed to the map for pin restoration');
  assert.equal(f.pickers[0].settings.name, '지도와 함께 수정한 국수집');
  f.pickers[0].picker.close(); await until(() => !f.rr('location-open').disabled, 'cancel returns control to the same editor');
  assert.equal(f.rr('field-name').value, '지도와 함께 수정한 국수집');
  assert.equal(f.rr('field-region').value, item.region); assert.equal(f.rr('field-address').value, item.address, 'cancelling leaves manual address fields unchanged');
  assert.equal(f.photoCount(), 3); assert.match(f.rr('location-status').textContent, /선택 완료/);
  f.rr('field-region').setCustomValidity('지역을 선택해 주세요.'); f.rr('field-address').setCustomValidity('주소를 입력해 주세요.');
  f.clickRR('location-open'); f.pickers[1].resolve(resolved);
  await until(() => !f.rr('location-open').disabled, 'a selected point returns to the form');
  assert.equal(f.rr('field-region').value, '서울'); assert.equal(f.rr('field-address').value, address);
  assert.equal(f.rr('field-region').validity.customError, false); assert.equal(f.rr('field-address').validity.customError, false);
  assert.match(f.rr('location-status').textContent, /지역·주소를 자동으로 입력/);
  f.fill('menu', '수정한 손칼국수'); f.choose(1); await f.photos(4);
  f.clickRR('submit');
  await until(() => f.state.rows[0].updated_at !== item.updated_at && !f.rr('editor'), 'photo, fields and location are saved together');
  const saved = f.state.rows[0], request = f.rpc('save_restaurant_recommendation_with_location')[0].parameters;
  assert.deepEqual({ latitude: saved.latitude, longitude: saved.longitude }, selected);
  assert.deepEqual(request.p_location, selected, 'address helper fields never enter the persisted coordinate object');
  assert.equal(request.p_region, '서울'); assert.equal(request.p_address, address);
  assert.equal(saved.region, '서울'); assert.equal(saved.address, address);
  assert.equal(saved.photos.length, 4); assert.equal(saved.menu, '수정한 손칼국수');
  assert.ok(f.$('.rr-map-link').href.endsWith(',' + selected.latitude + ',' + selected.longitude), 'detail opens the selected coordinates rather than another address search');
  f.clickRR('edit'); await until(() => f.rr('editor'), 'the saved record can be edited again'); f.clickRR('location-open');
  assert.deepEqual(JSON.parse(JSON.stringify(f.pickers[2].settings.location)), selected, 'reediting restores the saved point');
  await f.ui.back(); await until(() => !f.rr('location-open').disabled, 'Back closes the picker first');
  assert.ok(f.rr('editor')); assert.equal(f.rr('confirm-dialog'), null); assert.equal(f.photoCount(), 4);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 1, 'map cancellation and Back do not submit another write');
});

test('unavailable or partial map addresses preserve valid manual fields and allow manual correction', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  const point = { latitude: 37.5665, longitude: 126.978 };
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'the edit form opens');
  f.fill('address', '직접 입력한 대전 중구 주소 123, 2층');
  const manualAddress = f.rr('field-address').value;
  f.clickRR('location-open'); f.pickers.at(-1).resolve({ ...point, addressStatus: 'unavailable' });
  await until(() => !f.rr('location-open').disabled, 'a lookup failure still selects the coordinate');
  assert.equal(f.rr('field-region').value, item.region); assert.equal(f.rr('field-address').value, manualAddress);
  assert.match(f.rr('location-status').textContent, /지역·주소를 직접 입력/);
  assert.equal(f.rr('field-region').disabled, false); assert.equal(f.rr('field-address').disabled, false);

  f.rr('field-region').setCustomValidity('지역 확인'); f.rr('field-address').setCustomValidity('주소 확인');
  f.clickRR('location-open'); f.pickers.at(-1).resolve({ ...point, region: '서울', address: '   ', addressStatus: 'partial' });
  await until(() => !f.rr('location-open').disabled, 'a region-only lookup returns');
  assert.equal(f.rr('field-region').value, '서울'); assert.equal(f.rr('field-address').value, manualAddress);
  assert.equal(f.rr('field-region').validity.customError, false); assert.equal(f.rr('field-address').validity.customError, true, 'missing address data does not mask existing validation');
  assert.match(f.rr('form-status').textContent, /주소는 직접 입력/);

  f.clickRR('location-open'); f.pickers.at(-1).resolve({ ...point, region: '경기도', address: '경기도 수원시 팔달구 효원로 241', addressStatus: 'partial' });
  await until(() => !f.rr('location-open').disabled, 'an address-only lookup returns');
  assert.equal(f.rr('field-region').value, '서울', 'a noncanonical region cannot clear a valid selection');
  assert.equal(f.rr('field-address').value, '경기도 수원시 팔달구 효원로 241');
  assert.equal(f.rr('field-address').validity.customError, false);
  assert.match(f.rr('form-status').textContent, /지역은 직접 선택/);

  for (const address of ['서울', '가'.repeat(201)]) {
    f.clickRR('location-open'); f.pickers.at(-1).resolve({ ...point, region: '', address });
    await until(() => !f.rr('location-open').disabled, 'an invalid address leaves the previous input available');
    assert.equal(f.rr('field-region').value, '서울'); assert.equal(f.rr('field-address').value, '경기도 수원시 팔달구 효원로 241');
  }
  f.fill('region', '경기'); f.fill('address', '경기도 수원시 팔달구 효원로 241, 1층');
  assert.equal(f.rr('field-region').value, '경기'); assert.equal(f.rr('field-address').validity.valid, true);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0, 'selecting locations never auto-publishes the draft');
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'map selection keeps the editor dirty until explicitly saved');
  f.clickRR('confirm-cancel');
});

test('a map address resolving while its editor closes cannot change a replacement editor', async t => {
  const item = recommendation(), f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'the original editor opens');
  const region = f.rr('field-region'), address = f.rr('field-address');
  f.clickRR('location-open'); f.pickers[0].resolve({ latitude: 37.5665, longitude: 126.978, region: '서울', address: '서울특별시 중구 세종대로 110', addressStatus: 'resolved' });
  f.ui.close(true);
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'a replacement editor opens for the same member');
  assert.equal(region.value, item.region); assert.equal(address.value, item.address, 'detached fields ignore the late lookup result');
  assert.equal(f.rr('field-region').value, item.region); assert.equal(f.rr('field-address').value, item.address);
  assert.equal(f.rr('location-clear').hidden, true); assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
});

test('changing an existing mapped address removes the stale pin but keeps the member recommendation', async t => {
  const item = recommendation({ latitude: 36.3504, longitude: 127.3845 });
  const f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit');
  await until(() => f.rr('editor'), 'edit opens with the current map location');
  assert.match(f.rr('location-status').textContent, /선택 완료/);
  f.fill('address', '대전광역시 동구 대전로813번길 49, 1층');
  assert.equal(f.rr('location-clear').hidden, true, 'an edited address removes the old marker');
  assert.match(f.rr('form-status').textContent, /기존 지도 위치를 해제/);
  assert.match(f.rr('location-status').textContent, /거리순에서는 맨 뒤/);
  f.clickRR('submit');
  await until(() => f.state.rows[0].updated_at !== item.updated_at && !f.rr('editor'), 'the edit saves without a stale pin');
  const call = f.rpc('save_restaurant_recommendation_with_location')[0].parameters;
  assert.deepEqual(call.p_location, { latitude: null, longitude: null }, 'the old coordinates are never attached to the new address');
  assert.equal(f.state.rows[0].address, '대전광역시 동구 대전로813번길 49, 1층');
  assert.deepEqual(f.state.rows[0].photos, item.photos, 'photos are preserved');
});

test('clearing a map point explicitly saves a null pair while preserving the recommendation', async t => {
  const item = recommendation({ latitude: 36.3504, longitude: 127.3845 }), f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'the located record opens for editing');
  f.clickRR('location-clear'); assert.equal(f.rr('location-clear').hidden, true);
  f.clickRR('submit'); await until(() => f.state.rows[0].updated_at !== item.updated_at && !f.rr('editor'), 'cleared location saves');
  assert.deepEqual(f.rpc('save_restaurant_recommendation_with_location')[0].parameters.p_location, { latitude: null, longitude: null });
  assert.equal(f.state.rows[0].latitude, null); assert.equal(f.state.rows[0].longitude, null);
  assert.deepEqual(f.state.rows[0].photos, item.photos); assert.equal(f.state.rows[0].address, item.address);
  assert.equal(f.calls('upload').length, 0, 'clearing the pin never reuploads retained photos');
  assert.ok(f.$('.rr-map-link').href.startsWith('https://map.kakao.com/?q='), 'an unlocated record retains its address search fallback');
});

test('a map result resolving during an account change cannot repopulate or save the previous draft', async t => {
  const item = recommendation({ latitude: 36.3504, longitude: 127.3845 }), f = fixture(t, { rows: [item] });
  await f.open(); await f.detail(item.id); f.clickRR('edit'); await until(() => f.rr('editor'), 'the owner opens an edit');
  const region = f.rr('field-region'), address = f.rr('field-address');
  f.clickRR('location-open');
  f.pickers[0].resolve({ latitude: 37.5665, longitude: 126.978, region: '서울', address: '서울특별시 중구 세종대로 110', addressStatus: 'resolved' });
  f.state.setUser({ id: f.state.secondMember });
  await until(() => !f.ui.isOpen(), 'the account change closes the parent and picker'); await f.settle();
  assert.ok(f.pickers[0].closeCount > 0); assert.equal(f.rr('editor'), null);
  assert.equal(f.rpc('save_restaurant_recommendation_with_location').length, 0);
  assert.equal(f.state.rows[0].latitude, item.latitude); assert.equal(f.state.rows[0].longitude, item.longitude);
  assert.equal(region.value, item.region); assert.equal(address.value, item.address, 'the previous member fields never receive the lookup result');
  assert.equal(f.state.rows[0].region, item.region); assert.equal(f.state.rows[0].address, item.address);
  assert.equal(f.pickers[0].settings.isCurrent(), false, 'the stale map session loses authorization');
});

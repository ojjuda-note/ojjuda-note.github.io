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
  window.eval(fs.readFileSync(path.join(root, 'recommended-restaurants.js'), 'utf8'));
  state.loginRequests = 0;
  const ui = window.OjjudaRecommendedRestaurants.create({ client: state.client, getUser: state.getUser, notify: state.notify, onLogin: () => { state.loginRequests++; } });
  const $ = selector => document.querySelector(selector);
  const rr = name => $('[data-rr="' + name + '"]');
  const calls = type => state.calls.filter(call => call.type === type);
  const rpc = name => calls('rpc').filter(call => call.name === name);
  const f = {
    dom, window, document, state, ui, $, rr, urls, revoked, errors, calls, rpc,
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
    assert.equal(f.calls('rpc').length, 0, 'member-only RPCs are never sent');
    assert.ok(f.state.notices.some(message => /로그인|회원/.test(message)));
    f.clickRR('login'); await f.settle();
    assert.equal(f.state.loginRequests, 1); assert.equal(f.ui.isOpen(), false);
  }
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
  await f.open(); await f.compose(); f.validFields();
  assert.match(f.$('.rr-photo-help').textContent, /1~12장/);
  assert.equal(f.rr('submit').disabled, true);
  f.$('form.rr-editor').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await f.settle();
  assert.equal(f.calls('upload').length, 0);
  assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
  assert.match(f.rr('form-status').textContent, /1~12장/);
  f.choose(1); await f.photos(1); assert.equal(f.rr('submit').disabled, false);
  f.clickRR('photo-remove'); await f.photos(0);
  assert.equal(f.rr('submit').disabled, true);
  assert.match(f.rr('form-status').textContent, /1장 이상/);
  f.$('form.rr-editor').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await f.settle();
  assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
  assert.equal(f.calls('upload').length, 0);
  f.choose(1); await f.photos(1); f.clickRR('submit');
  await until(() => f.state.rows.length === 1, 'one photo can be saved');
  assert.equal(f.state.rows[0].photos.length, 1);
  assert.equal(f.rpc('save_restaurant_recommendation').length, 1);
  assert.equal(f.calls('upload').length, 1);
  assert.ok(f.calls('upload').every(call => call.mime === 'image/jpeg' && call.settings?.upsert === false));
  assert.ok(f.state.rows[0].photos.every(photo => photo.startsWith(f.state.member + '/' + f.state.rows[0].id + '/')));
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
  await until(() => f.rpc('save_restaurant_recommendation').length === 1 && f.state.rows[0].updated_at !== item.updated_at, 'retained plus added photos save as one edit');
  const request = f.rpc('save_restaurant_recommendation')[0].parameters;
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
  assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
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
  assert.equal(f.state.rows.length, 0); assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
  assert.equal(f.photoCount(), 3); assert.equal(f.rr('field-name').value, '새 추천 국수집');
  f.clickRR('submit'); await until(() => f.state.rows.length === 1, 'retry completes the same draft');
  assert.equal(f.state.rows[0].photos.length, 3);
  assert.equal(f.rpc('save_restaurant_recommendation').length, 1);
  assert.equal(new Set(f.state.rows[0].photos).size, 3);
});

test('an unresolved save cannot be submitted twice and read-back recovers a late commit', async t => {
  const pending = deferred(), f = fixture(t);
  f.state.hooks.rpc.save_restaurant_recommendation = () => pending.promise;
  await f.open(); await f.compose(); f.validFields(); f.choose(3); await f.photos(3); f.clickRR('submit');
  await until(() => f.rpc('save_restaurant_recommendation').length === 1, 'the save has reached the service');
  const request = f.rpc('save_restaurant_recommendation')[0].parameters;
  f.expireTimeouts();
  await until(() => f.rr('reconcile') && !f.rr('reconcile').hidden, 'the uncertain save offers read-back');
  assert.equal(f.rr('submit').disabled, true);
  f.clickRR('submit'); f.clickRR('reconcile'); await f.settle();
  assert.equal(f.rpc('save_restaurant_recommendation').length, 1, 'an empty early read-back cannot resubmit an unresolved write');
  assert.equal(f.calls('remove').length, 0, 'photos needed by an in-flight write are preserved');
  assert.equal(f.rr('submit').disabled, true);
  pending.resolve(); await until(() => f.state.rows.length === 1, 'the original write eventually commits');
  if (f.rr('reconcile')) f.clickRR('reconcile');
  await until(() => !f.rr('editor'), 'the committed draft leaves edit mode after verification');
  assert.equal(f.state.rows[0].id, request.p_id);
  assert.equal(f.state.rows[0].request_id, request.p_request_id);
  assert.equal(f.rpc('save_restaurant_recommendation').length, 1);
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
  assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
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
  assert.equal(f.calls('upload').length, 0); assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
  assert.equal(f.document.activeElement.id, 'world-entry');
});

test('deletion requires owner confirmation and removes only the confirmed post', async t => {
  const item = recommendation(), other = recommendation({ id: '20000000-0000-4000-8000-000000000002', owner_id: '10000000-0000-4000-8000-000000000002', name: '다른 회원 식당' });
  const f = fixture(t, { rows: [item, other] });
  await f.open(); await f.detail(item.id); f.clickRR('delete'); await until(() => f.rr('confirm-dialog'), 'delete asks for confirmation');
  f.clickRR('confirm-cancel'); await f.settle(); assert.equal(f.rpc('delete_restaurant_recommendation').length, 0);
  f.clickRR('delete'); await until(() => f.rr('confirm-dialog'), 'delete confirmation opens again'); f.clickRR('confirm-accept');
  await until(() => f.state.rows.length === 1, 'confirmed deletion completes');
  assert.equal(f.state.rows[0].id, other.id);
  assert.equal(f.rpc('delete_restaurant_recommendation').length, 1);
  assert.equal(f.rpc('delete_restaurant_recommendation')[0].parameters.p_expected_updated_at, item.updated_at);
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
  assert.equal(f.rpc('save_restaurant_recommendation').length, 1, 'cleanup retry does not repeat the post mutation');
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
  assert.equal(f.calls('upload').length, 0); assert.equal(f.rpc('save_restaurant_recommendation').length, 0);
  f.clickRR('close'); await until(() => f.rr('confirm-dialog'), 'native cancel is checked on a new confirmation');
  f.rr('confirm-dialog').dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
  await until(() => !f.rr('confirm-dialog'), 'native cancel also keeps the draft');
  assert.ok(f.rr('editor')); assert.equal(f.photoCount(), 3);
});

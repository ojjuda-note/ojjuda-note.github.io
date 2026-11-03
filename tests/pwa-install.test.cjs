const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'pwa-install.js'), 'utf8');
const ANDROID = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/144.0 Mobile Safari/537.36';
const buttons = '<button type="button" id="install" data-pwa-install><span data-pwa-label>앱 설치</span>' +
  '<span data-pwa-caption>홈 화면 아이콘으로 바로 열기</span></button>' +
  '<button type="button" id="dismiss" data-pwa-dismiss>닫기</button>';
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><html lang="ko"><body><main id="app">' + buttons + '</main></body></html>', {
    url: options.url || 'https://ojjuda.kr/world.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const { document } = window;
  t.after(() => window.close());
  // Let jsdom finish its own lifecycle before manually exercising registration.
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  }
  Object.defineProperty(document, 'readyState', { configurable: true, value: options.readyState || 'loading' });
  Object.defineProperty(window, 'isSecureContext', { value: options.secure !== false });
  Object.defineProperty(window.navigator, 'userAgent', { value: options.agent || ANDROID });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: options.touchPoints || 0 });
  Object.defineProperty(window.navigator, 'standalone', { value: options.iosStandalone || false });
  const media = new Map();
  window.matchMedia = (query) => {
    if (!media.has(query)) {
      const result = new window.EventTarget();
      result.media = query;
      result.matches = (query === '(display-mode: standalone)' && !!options.standalone) ||
        (query === '(display-mode: minimal-ui)' && !!options.minimal);
      media.set(query, result);
    }
    return media.get(query);
  };
  const registrations = [];
  let unregistrations = 0;
  if (options.serviceWorker !== false) {
    Object.defineProperty(window.navigator, 'serviceWorker', { value: {
      register(url, config) {
        registrations.push({ url, config: JSON.parse(JSON.stringify(config)) });
        return options.registrationFailure ? Promise.reject(new Error('storage disabled')) : Promise.resolve({});
      },
      getRegistrations() {
        return Promise.resolve([{ unregister() { unregistrations++; return Promise.resolve(true); } }]);
      }
    } });
  }
  const copies = [];
  if (options.clipboard !== false) {
    Object.defineProperty(window.navigator, 'clipboard', { value: {
      writeText(value) {
        copies.push(value);
        return options.clipboardFailure ? Promise.reject(new Error('clipboard denied')) : Promise.resolve();
      }
    } });
  }
  // jsdom has dialog elements but does not implement browser modal methods.
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  if (options.dismissed) window.sessionStorage.setItem('ojjuda:pwa:hide-banner', '1');
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.error || event.message));
  window.eval(source);
  t.after(() => assert.deepEqual(errors, [], 'installation interactions must not produce page errors'));
  return {
    window, document, root: document.documentElement, media, registrations, copies,
    unregistrations: () => unregistrations,
    install: () => document.querySelector('[data-pwa-install]'),
    dialog: () => document.querySelector('dialog'),
    load: () => window.dispatchEvent(new window.Event('load'))
  };
}

function offer(f, { outcome = 'dismissed', choice, reject = false } = {}) {
  let calls = 0;
  const event = new f.window.Event('beforeinstallprompt', { cancelable: true });
  event.prompt = () => {
    calls++;
    return reject ? Promise.reject(new Error('prompt unavailable')) : Promise.resolve();
  };
  event.userChoice = choice || Promise.resolve({ outcome });
  f.window.dispatchEvent(event);
  return { event, calls: () => calls };
}

test('native installation starts only on a click, prevents duplicate taps, and consumes each prompt once', async (t) => {
  const f = await fixture(t);
  let finish;
  const choice = new Promise((resolve) => { finish = resolve; });
  const first = offer(f, { choice });
  assert.equal(first.event.defaultPrevented, true);
  assert.equal(first.calls(), 0, 'advertising installability must never open a prompt by itself');
  f.install().click();
  assert.equal(first.calls(), 1, 'the native prompt is called synchronously from the gesture');
  assert.equal(f.install().disabled, true);
  f.install().dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }));
  assert.equal(first.calls(), 1, 'a second click while the prompt is open must be ignored');
  finish({ outcome: 'dismissed' });
  await settle();
  assert.equal(f.install().disabled, false);
  f.install().click();
  assert.equal(first.calls(), 1, 'a consumed prompt cannot be shown twice');
  assert.equal(f.dialog().open, true, 'manual installation instructions remain available');
  f.window.OjjudaPWA.close();
  const second = offer(f);
  f.install().click();
  await settle();
  assert.equal(second.calls(), 1, 'a new browser offer makes a later attempt possible');
});

test('accepting a prompt is a request; only appinstalled confirms installation', async (t) => {
  const f = await fixture(t);
  offer(f, { outcome: 'accepted' });
  f.install().click();
  await settle();
  assert.equal(f.root.dataset.pwaInstalled, 'false');
  assert.equal(f.root.dataset.pwaHideBanner, 'true');
  assert.equal(f.install().querySelector('[data-pwa-label]').textContent, '설치 확인');
  f.install().click();
  assert.match(f.dialog().textContent, /설치를 요청했어요/);
  f.window.dispatchEvent(new f.window.Event('appinstalled'));
  assert.equal(f.root.dataset.pwaInstalled, 'true');
  assert.equal(f.dialog().open, false);
  f.install().click();
  assert.match(f.dialog().textContent, /설치가 완료됐어요/);
  assert.equal(f.dialog().querySelector('[data-pwa-copy]').hidden, true);
});

test('a failed native prompt recovers to usable instructions and a later fresh attempt', async (t) => {
  const f = await fixture(t);
  const failed = offer(f, { reject: true });
  f.install().click();
  await settle();
  assert.equal(failed.calls(), 1);
  assert.equal(f.install().disabled, false);
  assert.equal(f.root.dataset.pwaInstalled, 'false');
  assert.equal(f.dialog().open, true);
  assert.match(f.dialog().textContent, /Chrome/);
  f.window.OjjudaPWA.close();
  const retry = offer(f);
  f.install().click();
  await settle();
  assert.equal(retry.calls(), 1);
});

test('installed display modes hide promotion and do not intercept another installation offer', async (t) => {
  for (const options of [{ standalone: true }, { minimal: true }, { iosStandalone: true }]) {
    const f = await fixture(t, options);
    assert.equal(f.root.dataset.pwaInstalled, 'true');
    assert.equal(f.root.dataset.pwaHideBanner, 'true');
    const extra = offer(f);
    assert.equal(extra.event.defaultPrevented, false);
    f.install().click();
    assert.equal(extra.calls(), 0);
    assert.match(f.dialog().textContent, /앱으로 사용 중/);
  }
});

test('display mode changes refresh installation state without recording a permanent installed flag', async (t) => {
  const f = await fixture(t);
  const mode = f.media.get('(display-mode: standalone)');
  mode.matches = true;
  mode.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.root.dataset.pwaInstalled, 'true');
  mode.matches = false;
  mode.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.root.dataset.pwaInstalled, 'false');
  assert.equal(f.root.dataset.pwaHideBanner, 'false');
  assert.equal(f.window.localStorage.length, 0);
});

test('delegated install and settings controls still work after World replaces its rendered shell', async (t) => {
  const f = await fixture(t);
  const prompt = offer(f);
  f.document.getElementById('app').innerHTML = buttons;
  f.install().querySelector('[data-pwa-label]').click();
  await settle();
  assert.equal(prompt.calls(), 1);
  f.window.dispatchEvent(new f.window.Event('appinstalled'));
  f.document.getElementById('app').innerHTML = buttons;
  f.window.OjjudaPWA.refresh();
  assert.equal(f.install().querySelector('[data-pwa-label]').textContent, '설치된 앱');
  f.install().click();
  assert.match(f.dialog().textContent, /설치가 완료됐어요/);
});

test('fallback guidance covers Android, embedded browsers, iPhone, touch iPad and desktop', async (t) => {
  const cases = [
    { agent: ANDROID, title: /홈 화면에 오쭈다 설치하기/, step: /설치 및 바로가기 만들기/ },
    { agent: ANDROID + ' KAKAOTALK/25.0', title: /Chrome에서 설치해 주세요/, step: /주소를 복사해 Chrome/ },
    { agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', title: /홈 화면에 오쭈다 추가하기/, step: /공유 버튼/ },
    { agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15', touchPoints: 5, title: /홈 화면에 오쭈다 추가하기/, step: /Safari/ },
    { agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/144.0', title: /오쭈다를 앱으로 설치하기/, step: /Chrome 또는 Edge/ }
  ];
  for (const item of cases) {
    const f = await fixture(t, item);
    f.install().click();
    assert.equal(f.dialog().open, true);
    assert.match(f.dialog().querySelector('h2').textContent, item.title);
    assert.match(f.dialog().textContent, item.step);
    assert.match(f.dialog().textContent, /인터넷 연결이 필요/);
  }
});

test('copying an installation address never includes login or recovery tokens', async (t) => {
  const f = await fixture(t, { url: 'https://ojjuda.kr/?auth=login&code=private-code#access_token=private-access&refresh_token=private-refresh' });
  f.install().click();
  f.dialog().querySelector('[data-pwa-copy]').click();
  await settle();
  assert.deepEqual(f.copies, ['https://ojjuda.kr/world.html']);
  assert.match(f.dialog().querySelector('[role="status"]').textContent, /주소를 복사했어요/);
  assert.doesNotMatch(f.dialog().textContent, /private-/);
});

test('copy failures still show a safe address without throwing or losing the guide', async (t) => {
  for (const options of [{ clipboard: false }, { clipboardFailure: true }]) {
    const f = await fixture(t, { ...options, url: 'https://ojjuda.kr/world.html?token=secret' });
    f.install().click();
    f.dialog().querySelector('[data-pwa-copy]').click();
    await settle();
    assert.equal(f.dialog().querySelector('[role="status"]').textContent, 'https://ojjuda.kr/world.html');
    assert.equal(f.dialog().open, true);
  }
});

test('closing instructions by button, Escape or World back restores focus to the initiating control', async (t) => {
  const f = await fixture(t);
  for (const action of ['button', 'escape', 'world-back']) {
    const trigger = f.install();
    trigger.focus();
    trigger.click();
    assert.equal(f.document.activeElement, f.dialog().querySelector('[data-pwa-close]'));
    if (action === 'button') f.dialog().querySelector('[data-pwa-close]').click();
    if (action === 'escape') f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    if (action === 'world-back') assert.equal(f.window.OjjudaPWA.close(), true);
    assert.equal(f.dialog().open, false);
    assert.equal(f.document.activeElement, trigger);
    assert.equal(f.window.OjjudaPWA.close(), false);
  }
});

test('banner dismissal persists for the session while settings installation stays available', async (t) => {
  const f = await fixture(t);
  f.document.getElementById('dismiss').click();
  assert.equal(f.root.dataset.pwaHideBanner, 'true');
  assert.equal(f.root.dataset.pwaInstalled, 'false');
  assert.equal(f.window.sessionStorage.getItem('ojjuda:pwa:hide-banner'), '1');
  f.document.getElementById('app').innerHTML = buttons;
  f.install().click();
  assert.equal(f.dialog().open, true);
  const restored = await fixture(t, { dismissed: true });
  assert.equal(restored.root.dataset.pwaHideBanner, 'true');
  restored.install().click();
  assert.equal(restored.dialog().open, true);
});

test('worker registration waits for load, runs once and leaves other workers intact', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.registrations, []);
  f.load();
  f.load();
  // Re-executing a duplicated script must not add handlers or registrations.
  f.window.eval(source);
  f.load();
  await settle();
  assert.deepEqual(f.registrations, [{ url: '/sw.js', config: { scope: '/', updateViaCache: 'none' } }]);
  assert.equal(f.unregistrations(), 0);
  const ready = await fixture(t, { readyState: 'complete' });
  assert.equal(ready.registrations.length, 1);
  ready.load();
  assert.equal(ready.registrations.length, 1);
});

test('unsupported or insecure contexts retain instructions without worker registration', async (t) => {
  for (const options of [{ secure: false }, { serviceWorker: false }]) {
    const f = await fixture(t, options);
    f.load();
    assert.deepEqual(f.registrations, []);
    f.install().click();
    assert.equal(f.dialog().open, true);
  }
});

test('a rejected worker registration does not break manual installation guidance', async (t) => {
  const f = await fixture(t, { registrationFailure: true });
  f.load();
  await settle();
  assert.equal(f.registrations.length, 1);
  f.install().click();
  assert.equal(f.dialog().open, true);
});

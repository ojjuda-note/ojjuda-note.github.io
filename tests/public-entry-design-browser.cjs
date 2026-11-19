// Public files and real UI renderers; every account and network response stays in this fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://public-entry.test';
const proof = process.env.PUBLIC_ENTRY_PROOF_DIR || path.join(__dirname, 'artifacts/pajang-discovery/entrances');
fs.mkdirSync(proof, { recursive: true });

// Use the existing world-design test's bootstrap seam, keeping the production
// shell, styles, hub renderer and navigation. Game services are outside this test.
function agitDocument() {
  let html = read('world.html')
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
    .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";', 'const screwGame={};');
  const helpers = [
    'shared/share/page-share.js',
    'features/home/agit-hub.js', 'features/home/agit-welcome.js',
    'park/world-park-notes.js', 'app/world/world-themes.js',
    'shared/games/world-game-rankings.js', 'shared/games/world-game-assets.js',
    'features/arcade/arcade-rooms.js'
  ].map(read).join('\n') + '\n' + read('app/world/world-navigation.js').split('/* World-only ambient audio;')[0];
  html = html.replace('</head>', () => `<script>${helpers}</script></head>`);
  const boot = html.indexOf('j1(()=>H());gm(');
  assert.ok(boot > 0, 'World exposes its existing startup seam');
  const end = html.indexOf('</script>', boot);
  assert.ok(end > boot);
  return html.slice(0, boot) + `
    $.me.nick='구경하는 이웃';$.me.bio='';$.coins=0;S=window.entryFixture.client;
    const parkEntry=new URL(location.href).searchParams.get('place')==='park';
    g.tab=parkEntry?'place':'hub';g.place=parkEntry?{id:'park',ch:1,count:0,log:[]}:null;
    D.online=false;D.parkGuest=true;D.user=null;H();gm(()=>{});
    window.entryWorld={
      member(value){D.online=value;D.parkGuest=!value;D.user=value?{id:'entry-member'}:null;$.coins=value?129447:0;H();},
      welcome(){OjjudaAgitWelcome.enter({member:false,owner:'entry-guest',settings:$.settings});}
    };
  ` + html.slice(end);
}

function installAccountFixture() {
  const member = new URL(location.href).searchParams.get('member') === '1';
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'entrance@example.invalid',
    is_anonymous: false, user_metadata: { nickname: '테스트 이웃' } };
  const callbacks = new Set();
  const state = window.entryFixture = { session: member ? { user, access_token: 'fixture-token' } : null,
    calls: [], logins: [], downloads: [], shares: [] };
  Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => {
    state.shares.push({ ...payload });
  } });
  const result = data => {
    const promise = Promise.resolve({ data, error: null });
    promise.abortSignal = promise.setHeader = () => promise;
    return promise;
  };
  const query = table => {
    const q = { then(resolve, reject) { return result([]).then(resolve, reject); },
      maybeSingle: () => result(table === 'user_private' ? { coins: 0 } : table === 'profiles' ? {id:user.id,nickname:user.user_metadata.nickname} : null), single: () => result(null) };
    for (const name of ['select', 'eq', 'neq', 'is', 'in', 'or', 'order', 'limit', 'range', 'gte', 'lte', 'gt', 'lt', 'abortSignal']) q[name] = () => q;
    return q;
  };
  const cards = Array.from({ length: 6 }, (_, i) => ({
    id: '12345678-1234-4123-8123-' + String(i + 1).padStart(12, '0'),
    kind: 'memo', body: ['느리게 걸어도 괜찮은 하루.', '오늘 만난 작은 다정함.', '잠깐 쉬어가는 마음.'][i % 3],
    background_key: String(10 + i), tags: [], created_at: '2026-11-19T01:00:00Z'
  }));
  const client = state.client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      getUser: async () => ({ data: { user: state.session?.user || null }, error: null }),
      onAuthStateChange(callback) { callbacks.add(callback); return { data: { subscription: { unsubscribe() { callbacks.delete(callback); } } } }; },
      async signInWithPassword(args) { state.logins.push(args); state.session = { user, access_token: 'fixture-token' }; return { data: { session: state.session, user }, error: null }; },
      async signUp() { return { data: { user, session: null }, error: null }; },
      async signOut() { state.setMember(false); return { error: null }; }
    },
    from: query,
    schema() { return client; },
    rpc(name, args) {
      state.calls.push({ name, args });
      if (name === 'list_cards') return result(cards);
      if (name === 'get_note_state') return result({});
      if (name === 'app_notification_summary') return result({ notifications: 0, retention: 0 });
      if (name === 'list_app_notifications') return result({ items: [], unread_count: 0, as_of: '2026-11-19T00:00:00Z', has_more: false, next_cursor: null });
      if (name === 'beta_charge_status') return result({ ok: true, enabled: true, coins: 0, left: 5, limit: 5 });
      if (name === 'mask_banned') return result(args.t);
      if (name === 'ensure_member_for_note') return result(true);
      if (name === 'pajang_member') {
        if (new URL(location.href).searchParams.has('blocked')) return Promise.resolve({ data: null, error: { code: '42501' } });
        return result({ authenticated: true, joined: false, body: '', nickname: '테스트 이웃',
          day: '2026-11-19', slot: 'am', nextAt: '2099-11-19T09:00:00Z', locationEnabled: false,
          question: { id: 'entry-fixture', q: ['오늘 나누고 싶은', '작은 이야기는 무엇인가요?'], answers: [] } });
      }
      return result([]);
    },
    functions: { invoke: async () => ({ data: { bucket: 'fixture', files: { 'station.js': '0'.repeat(64) } }, error: null }) },
    storage: { from: () => ({
      download: async file => { state.downloads.push(file); return { data: null, error: { message: 'No private bundle in the entrance fixture' } }; },
      getPublicUrl: file => ({ data: { publicUrl: location.origin + '/' + file } }),
      createSignedUrls: async () => ({ data: [], error: null }),
      createSignedUrl: async () => ({ data: null, error: null })
    }) },
    channel() { const channel = { on: () => channel, subscribe: () => channel, unsubscribe() {} }; return channel; },
    removeChannel: async () => {}
  };
  state.setMember = value => {
    state.session = value ? { user, access_token: 'fixture-token' } : null;
    for (const callback of callbacks) callback(value ? 'SIGNED_IN' : 'SIGNED_OUT', state.session);
  };
  window.OJJUDA_CONFIG = { supabaseUrl: location.origin, supabaseKey: 'fixture-key' };
  window.supabase = { createClient: () => client };
  window.ojjudaSupabase = client;
  window.OjjudaGetClient = async () => client;
}

const spaces = [
  { id: 'agit', url: '/world.html?tab=hub', selector: '.agit-guest-hero', title: '우리의 아지트', next: 'world',
    login: '.agit-entry-secondary', signup: '.agit-entry-primary' },
  { id: 'park', url: '/park/', selector: '#park-guest-entry', title: '공원', next: 'note',
    login: '#park-guest-entry a[href*="auth=login"]', signup: '#park-guest-entry a[href*="auth=signup"]' },
  { id: 'pajang', url: '/features/pajang/', selector: '#gate > .pajang-invitation', title: '오늘의 한마디.', next: 'pajang',
    login: '.pajang-invitation a[href*="auth=login"]', signup: '.pajang-invitation a[href*="auth=signup"]' }
];

async function fits(page, label, selectors = []) {
  const layout = await page.evaluate(selectors => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    controls: selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length).map(node => {
      const box = node.getBoundingClientRect();
      return { selector, left: box.left, right: box.right, width: box.width, height: box.height };
    }))
  }), selectors);
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: document overflows (${JSON.stringify(layout)})`);
  for (const box of layout.controls) {
    assert.ok(box.left >= -1 && box.right <= layout.width + 1, `${label}: clipped control ${JSON.stringify(box)}`);
    assert.ok(box.width >= 44 && box.height >= 44, `${label}: small account target ${JSON.stringify(box)}`);
  }
}

async function mainInvitation(page, service, label, share = true) {
  const names = { agit: '아지트', park: '공원', pajang: '파장' };
  const paths = { agit: '/world.html?tab=hub', park: '/world.html?place=park', pajang: '/features/pajang/' };
  const button = page.locator('.ojjuda-service-actions [data-share-page]:visible');
  assert.equal(await button.count(), 1, `${label}: exactly one visible main invitation`);
  assert.equal(await button.getAttribute('data-share-page'), service, `${label}: invitation matches the current service`);
  assert.equal(await button.innerText(), '초대', `${label}: invitation keeps its visible text`);
  assert.equal(await button.getAttribute('aria-label'), names[service] + ' 초대 링크 공유');
  const layout = await button.evaluate(invite => {
    const rect = node => { const { left, right, top, bottom, width, height } = node.getBoundingClientRect(); return { left, right, top, bottom, width, height }; };
    const visible = node => node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const actions = invite.closest('.ojjuda-service-actions');
    const brands = [...document.querySelectorAll('.ojjuda-service-brand')].filter(visible);
    const controls = [invite, actions.querySelector('[data-notifications-open]'), actions.querySelector('.ojjuda-service-balance')];
    const navigation = [...document.querySelectorAll('.sidenav,.station-nav')].filter(visible);
    const label = [...invite.querySelectorAll('span')].find(node => node.textContent.trim() === '초대') || invite;
    const range = document.createRange(); range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    return { width: innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      controls: controls.map(node => ({ visible: !!visible(node), box: node ? rect(node) : null })),
      regions: [...brands, actions, ...navigation].map(rect),
      brandCount: brands.length, text: { left: text.left, right: text.right, width: text.width, height: text.height } };
  });
  assert.equal(layout.brandCount, 1, `${label}: the main brand remains visible`);
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: no document overflow ${JSON.stringify(layout)}`);
  assert.ok(layout.controls.every(control => control.visible), `${label}: invitation, notifications and wallet remain visible`);
  const bounds = [...layout.regions, ...layout.controls.map(control => control.box)];
  assert.ok(bounds.every(box => box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= layout.width + 1), `${label}: header stays in the viewport ${JSON.stringify(layout)}`);
  const invite = layout.controls[0].box;
  assert.ok(layout.text.width > 5 && layout.text.height > 5 && layout.text.left >= invite.left - 1 && layout.text.right <= invite.right + 1, `${label}: invitation text is not clipped`);
  const overlaps = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  for (const boxes of [layout.regions, layout.controls.map(control => control.box)]) {
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      assert.equal(overlaps(boxes[i], boxes[j]), false, `${label}: header elements overlap ${JSON.stringify(layout)}`);
  }
  if (share) {
    const before = await page.evaluate(() => entryFixture.shares.length);
    await button.click();
    await page.waitForFunction(count => entryFixture.shares.length === count + 1, before);
    const payload = await page.evaluate(() => entryFixture.shares.at(-1));
    assert.equal(payload.url, origin + paths[service], `${label}: actual main button shares its clean public route`);
    assert.match(payload.title, new RegExp(names[service]));
  }
}

async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function openSpace(page, space) {
  await page.goto(origin + space.url);
  if (space.id !== 'park') return page;
  // Keep the real /park/ redirect and World iframe; screenshots include its actual chrome.
  await page.waitForURL(url => url.pathname === '/world.html' && url.searchParams.get('place') === 'park');
  await page.frameLocator('[data-park-app] iframe').locator('#park-guest-entry').waitFor({ state: 'visible' });
  const frame = page.frames().find(frame => new URL(frame.url()).pathname === '/park/');
  assert.ok(frame, 'Park is mounted in the real World host');
  return frame;
}

(async () => {
  const world = agitDocument();
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let page, checkpoint = 'startup';
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
      locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' });
    await context.addInitScript(installAccountFixture);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: '/* SDK supplied by the local account fixture. */' });
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: '/* Configuration supplied by the local account fixture. */' });
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      if (url.pathname === '/functions/v1/theme-weather') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ kind: null, expiresAt: Date.now() + 600000 }) });
      const file = path.resolve(root, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Missing test resource' });
      return route.fulfill({ path: file });
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-19T03:00:00+09:00'));

    for (const space of spaces) {
      for (const width of [320, 390, 750, 1080, 1280]) {
        checkpoint = `${space.id}-guest-${width}`;
        await page.setViewportSize({ width, height: width === 750 ? 750 : 844 });
        const surface = await openSpace(page, space);
        const gate = surface.locator(space.selector);
        await gate.waitFor({ state: 'visible' });
        assert.ok((await gate.innerText()).includes(space.title), `${space.id} explains the space`);
        for (const mode of ['login', 'signup']) {
          const link = surface.locator(space[mode]);
          assert.equal(await link.getAttribute('href'), `/?auth=${mode}&next=${space.next}`, `${space.id} preserves the return destination`);
          if (space.id !== 'agit') assert.equal(await link.getAttribute('target'), '_top');
        }
        if (space.id === 'agit') await page.waitForFunction(() => {
          const image = document.querySelector('.agit-guest-hero img'); return image?.complete && image.naturalWidth > 0;
        });
        if (space.id === 'park') await surface.locator('#feed-list article').first().waitFor();
        if (space.id === 'pajang') assert.equal(await page.locator('#welcome').isVisible(), false);
        await settled(surface);
        await fits(surface, checkpoint, [space.login, space.signup]);
        if (space.id === 'park') await fits(page, checkpoint + ' host');
        await mainInvitation(page, space.id, checkpoint);
        if (width === 390 || width === 750) await page.screenshot({ path: path.join(proof, checkpoint + '.png') });
        await page.screenshot({ path: path.join(proof, `${space.id}-invite-header-${width}.png`), clip: { x: 0, y: 0, width, height: 100 } });
        if (space.id !== 'pajang') {
          await page.evaluate(() => { entryWorld.member(true); entryWorld.member(false); entryWorld.member(true); });
          await settled(page);
          await mainInvitation(page, space.id, `${space.id}-member-${width}`);
        }
      }
      console.log('PASS guest entrance, main invitation and account targets:', space.id, '320/390/750/1080/1280');
    }

    checkpoint = 'agit-member-and-welcome';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + spaces[0].url);
    await page.waitForFunction(() => window.entryWorld);
    await page.evaluate(() => entryWorld.member(true));
    assert.equal(await page.locator('.agit-guest-hero').count(), 0, 'members retain the ordinary Agit hero');
    assert.equal(await page.locator('#agit-recommend').isVisible(), true);
    await page.evaluate(() => { entryWorld.member(false); entryWorld.welcome(); });
    await page.getByRole('button', { name: '가입 안내 닫기', exact: true }).waitFor();
    await settled(page);
    await page.screenshot({ path: path.join(proof, 'agit-guest-welcome-390.png') });
    await page.getByRole('button', { name: '가입 안내 닫기', exact: true }).click();
    assert.equal(await page.locator('.agit-guest-hero').isVisible(), true, 'closing the signup invitation restores the guest entrance');

    checkpoint = 'park-browse-and-membership';
    const parkFrame = await openSpace(page, spaces[1]);
    await parkFrame.locator('#feed-list article').first().waitFor();
    const feedBefore = await parkFrame.locator('#feed-list').evaluate(node => node.getBoundingClientRect().top);
    await parkFrame.locator('#park-entry-browse').click();
    await parkFrame.waitForFunction(before => document.getElementById('feed-list').getBoundingClientRect().top < before - 30, feedBefore);
    await parkFrame.evaluate(() => entryFixture.setMember(true));
    await parkFrame.locator('#park-guest-entry').waitFor({ state: 'hidden' });
    await parkFrame.evaluate(() => entryFixture.setMember(false));
    await parkFrame.locator('#park-guest-entry').waitFor({ state: 'visible' });
    await parkFrame.locator('#park-guest-entry a[href*="auth=login"]').click();
    await page.locator('#auth-dialog[open][data-entry-space="park"]').waitFor();
    assert.equal(page.frames().length, 1, 'embedded Park login leaves the host frame');

    checkpoint = 'pajang-membership';
    await page.goto(origin + '/features/pajang/?member=1');
    await page.locator('#welcome').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#gate').isVisible(), false, 'verified members enter the existing question flow');
    assert.deepEqual(await page.evaluate(() => entryFixture.downloads), [], 'the first question does not fetch the protected member program');
    await page.goto(origin + '/features/pajang/station.html');
    await page.locator('#gate > .pajang-invitation').waitFor({ state: 'visible' });
    await fits(page, 'direct Pajang station guest', [spaces[2].login, spaces[2].signup]);
    for (const width of [320, 390, 750, 1080]) {
      await page.setViewportSize({ width, height: 844 });
      await settled(page);
      await mainInvitation(page, 'pajang', `pajang-station-${width}`);
    }
    await page.goto(origin + '/features/pajang/?member=1&blocked=1');
    await page.locator('#gate').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#gate > .pajang-invitation').count(), 0, 'account restriction keeps its existing error gate');
    assert.equal(await page.locator('#gate a').getAttribute('href'), '/world.html');

    for (const space of spaces) {
      for (const mode of ['signup', 'login']) {
        checkpoint = `${space.id}-${mode}-route`;
        const surface = await openSpace(page, space);
        await surface.locator(space[mode]).click();
        await page.locator(`#auth-dialog[open][data-entry-space="${space.id}"]`).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('next'), space.next);
        assert.equal(await page.locator('#auth-title').innerText(), `오쭈다 ${space.id === 'agit' ? '아지트' : space.id === 'park' ? '공원' : '파장'}`);
        assert.equal(await page.locator(`#${mode}-tab`).getAttribute('aria-selected'), 'true');
        await page.locator(mode === 'login' ? '#signup-tab' : '#login-tab').click();
        assert.equal(await page.locator('#auth-dialog').getAttribute('data-entry-space'), space.id, 'switching auth mode retains the originating space');
      }
      for (const width of [320, 390, 750, 1280]) {
        checkpoint = `${space.id}-auth-${width}`;
        await page.setViewportSize({ width, height: width === 750 ? 750 : 844 });
        await page.goto(origin + `/?auth=login&next=${space.next}`);
        await page.locator('#auth-dialog[open]').waitFor();
        await settled(page);
        await fits(page, checkpoint, ['#auth-submit']);
        if (width === 390 || width === 750) await page.screenshot({ path: path.join(proof, checkpoint + '.png') });
      }
      await page.locator('#email').fill('entrance@example.invalid');
      await page.locator('#password').fill('fixture-password');
      await page.locator('#auth-submit').click();
      await page.waitForURL(url => space.next === 'pajang' ? url.pathname === '/features/pajang/'
        : url.pathname === '/world.html' && (space.next !== 'note' || url.searchParams.get('place') === 'park'));
      console.log('PASS originating auth context, mode switch and login return:', space.id);
    }
    assert.deepEqual(errors, [], 'entrance scripts have no uncaught errors');
    console.log('PASS public entrance screenshots, responsive controls, guest/member visibility and real auth routes');
    await context.close();
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(proof, 'failure-' + checkpoint + '.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

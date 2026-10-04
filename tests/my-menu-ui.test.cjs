const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const world = read('world.html');
const rendererStart = world.indexOf('function Yg()');
const rendererEnd = world.indexOf('}var Hf=', rendererStart) + 1;
assert.ok(rendererStart > 0 && rendererEnd > rendererStart, 'World My renderer is available');
const renderer = world.slice(rendererStart, rendererEnd);
const noteLinkRenderer = world.slice(rendererEnd, world.indexOf('function Zg()', rendererEnd));
const doorStart = world.indexOf('"door-toggle"(){');
const doorEnd = world.indexOf(',tab(t){', doorStart);
assert.ok(doorStart > 0 && doorEnd > doorStart, 'World door action is available');
const doorAction = `window.menuActions={${world.slice(doorStart, doorEnd)}};`;
const screenshotDirectory = process.env.MY_MENU_QA_DIR;
if (screenshotDirectory) fs.mkdirSync(screenshotDirectory, { recursive: true });

async function uniqueIds(page) {
  const duplicates = await page.locator('[id]').evaluateAll(nodes => {
    const counts = new Map();
    for (const node of nodes) counts.set(node.id, (counts.get(node.id) || 0) + 1);
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
  assert.deepEqual(duplicates, [], 'moving and grouping menus must not duplicate IDs');
}

async function fitsViewport(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    `${name} does not introduce horizontal scrolling`);
}

async function exerciseGroups(page, scope) {
  const groups = page.locator(`${scope} details.my-menu-group:visible`);
  assert.ok(await groups.count() >= 3, 'settings are grouped into a small set of sections');
  for (let index = 0; index < await groups.count(); index++) {
    const group = groups.nth(index);
    const summary = group.locator(':scope > summary');
    assert.equal(await summary.count(), 1, 'every section has one native disclosure control');
    await group.evaluate(node => { node.open = false; });
    const descendants = group.locator('button, input, a[href]');
    for (let item = 0; item < await descendants.count(); item++) {
      assert.equal(await descendants.nth(item).isVisible(), false, 'closed settings do not leak controls');
    }
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await group.evaluate(node => node.open), true, 'Enter expands a section');
    await page.keyboard.press('Space');
    assert.equal(await group.evaluate(node => node.open), false, 'Space collapses the same section');
    await summary.click();
    assert.equal(await group.evaluate(node => node.open), true, 'pointer activation expands a section');
  }
}

async function worldFixture(context, mobile, errors) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/favicon.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: read('favicon.svg') }));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><base href="https://ojjuda.test/"><main class="main" id="world-my"></main>');
  for (const match of world.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    await page.addStyleTag({ content: match[1] });
  }
  for (const file of ['note/notifications.css', 'guide-entry.css', 'my-menu.css']) {
    await page.addStyleTag({ content: read(file) });
  }
  // Execute the real renderer and door action with synthetic account data.
  // Replace persistence and confirmation boundaries; no remote writes run.
  await page.evaluate(() => {
    window.$ = { settings: { accent: 'pink', theme: 'light', defaultVis: 'friends',
      notify: { guestbook: true, friend: false } },
      me: { nick: '검사 회원', bio: '오늘도 좋은 하루', mood: '😊', moodText: '맑음' },
      album: [{ type: 'image' }, { type: 'video' }] };
    window.D = { online: true, isAdmin: false, mediaReady: true, doorReady: true,
      user: { email: 'synthetic-account-with-a-very-long-address@example.invalid' } };
    window.g = {};
    window.yi = ['😊', '😌', '😴'];
    window.Jn = [['all', '전체 공개'], ['friends', '친구 공개'], ['me', '나만 보기']];
    window.ce = { ready: true, list: [{ id: 'synthetic-blocked', nick: '검사 작성자' }] };
    window.Go = 'test';
    window.w = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    window.Xd = () => '/note/';
    window.Is = () => false;
    window.Os = () => '';
    window.renderMy = () => {
      document.getElementById('world-my').innerHTML = Yg();
      document.querySelector('[data-notifications-slot]').innerHTML = '<button class="btn nn-trigger" type="button">알림함 열기</button>';
    };
    window.menuSaves = 0;
    window.I = () => { menuSaves++; };
    window.H = () => renderMy();
    window.M = () => {};
    window.Tt = (title, label, accept) => {
      const dialog = document.createElement('dialog');
      const copy = document.createElement('p'); copy.textContent = title;
      const cancel = document.createElement('button'); cancel.textContent = '취소';
      const confirm = document.createElement('button'); confirm.textContent = label;
      cancel.onclick = () => dialog.remove();
      confirm.onclick = () => { dialog.remove(); accept(); };
      dialog.append(copy, cancel, confirm); document.body.append(dialog); dialog.showModal();
    };
    document.addEventListener('click', event => {
      if (event.target.closest('[data-act="door-toggle"]')) menuActions['door-toggle']();
    });
  });
  await page.addScriptTag({ content: read('world-park-notes.js') });
  await page.addScriptTag({ content: renderer + noteLinkRenderer });
  await page.addScriptTag({ content: doorAction });
  await page.evaluate(() => renderMy());
  assert.equal(await page.locator('[data-my-group="admin"]').count(), 0, 'member menu omits the administrator entry');
  assert.equal(await page.locator('.my-shortcuts > :first-child [data-notifications-slot]').count(), 1,
    'frequent notifications come before the cross-service shortcut');
  assert.equal(await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.my-hub [data-my-group]')].map(node => node.dataset.myGroup);
    return groups.indexOf('profile') < groups.indexOf('account') && groups.indexOf('display') < groups.indexOf('account')
      && groups.indexOf('account') < groups.indexOf('help');
  }), true, 'frequent settings precede account and help');
  assert.equal(await page.locator('details[open]').count(), 0, 'settings start closed to reduce clutter');
  await fitsViewport(page, 'closed World menu');
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `world-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });

  await exerciseGroups(page, '.my-hub');
  for (const id of ['p-nick', 'p-bio', 'p-mt', 'n-guestbook', 'n-friend']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `existing control ${id} stays reachable`);
  }
  for (const action of ['saved', 'mine', 'events', 'event-new', 'blocked', 'settings', 'glasses']) {
    assert.equal(await page.locator(`[data-park-action="${action}"]`).isVisible(), true, `${action} is available in the shared World menu`);
  }
  assert.equal(await page.locator('#p-nick').inputValue(), '검사 회원');
  assert.equal(await page.locator('#n-guestbook').isChecked(), true);
  assert.equal(await page.locator('#n-friend').isChecked(), false);
  const expectedActions = ['account-delete-open', 'accent', 'defvis', 'door-toggle', 'enter-place', 'logout', 'mood-pick', 'profile-save', 'pw-open', 'support-open', 'theme', 'unblock'].sort();
  assert.deepEqual(await page.locator('.my-hub [data-act]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.act))].sort()), expectedActions,
    'every existing account, display, privacy and support action keeps its dispatch key');
  for (const action of expectedActions) assert.equal(await page.locator(`[data-act="${action}"]`).first().isVisible(), true, `${action} remains reachable`);
  for (const href of ['/guide.html', 'terms.html', 'privacy.html', 'https://github.com/songys/Chatbot_data']) {
    assert.equal(await page.locator(`a[href="${href}"]`).isVisible(), true, `existing link ${href} stays reachable`);
  }
  assert.equal(await page.locator('[data-act="enter-place"][data-id="park"]').isVisible(), true, 'park shortcut stays within World');
  await uniqueIds(page);
  await fitsViewport(page, 'expanded World menu with a long email address');

  const door = page.locator('[data-act="door-toggle"]');
  assert.equal(await door.isEnabled(), true, 'members can reach the restored visit setting');
  assert.equal(await door.textContent(), '문 닫기');
  assert.equal(await door.getAttribute('aria-pressed'), 'false');
  assert.match(await page.locator('[data-my-group="privacy"]').textContent(), /현재 문이 열려 있어요\./);
  await door.click();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await door.getAttribute('aria-pressed'), 'false', 'canceling keeps the house open');
  assert.equal(await page.evaluate(() => menuSaves), 0);
  await door.click();
  await page.getByRole('dialog').getByRole('button', { name: '문 닫기', exact: true }).click();
  assert.equal(await door.getAttribute('aria-pressed'), 'true');
  assert.equal(await door.textContent(), '문 열기');
  assert.match(await page.locator('[data-my-group="privacy"]').textContent(), /현재 문이 닫혀 있어요\./);
  assert.equal(await page.evaluate(() => menuSaves), 1, 'confirmed closure saves once');
  await door.click();
  assert.equal(await door.getAttribute('aria-pressed'), 'false');
  assert.equal(await door.textContent(), '문 닫기');
  assert.equal(await page.evaluate(() => menuSaves), 2, 'opening the house saves once');
  assert.match(await page.locator('[data-my-group="account"]').textContent(), /생활의 주소록·가계부와 기기 보관 기록은 현재 브라우저에만 저장돼요/);
  await page.evaluate(() => { D.doorReady = false; renderMy(); });
  assert.equal(await door.isDisabled(), true, 'unavailable server settings cannot be changed');
  await page.evaluate(() => { D.doorReady = true; D.doorWritable = false; renderMy(); });
  assert.equal(await door.isDisabled(), true, 'unavailable update permission disables the setting');
  await page.evaluate(() => { D.doorWritable = true; renderMy(); });

  // Existing setting handlers rerender My; expanded sections must not snap shut.
  await page.evaluate(() => { $.settings.theme = 'dark'; renderMy(); });
  assert.equal(await page.locator('[data-my-group="display"]').evaluate(node => node.open), true,
    'a settings rerender preserves the expanded group');
  assert.equal(await page.locator('[data-act="theme"][data-v="dark"]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => { D.isAdmin = true; renderMy(); });
  await page.locator('[data-my-group="admin"] > summary').click();
  assert.equal(await page.locator('[data-act="tab"][data-tab="admin"]').isVisible(), true);
  await page.evaluate(() => { D.online = false; renderMy(); });
  assert.equal(await page.locator('[data-my-group="admin"]').count(), 0, 'offline mode cannot retain an administrator entry');
  assert.equal(await page.locator('[data-act="logout"], [data-act="pw-open"], [data-act="account-delete-open"], [data-act="unblock"], [data-act="door-toggle"]').count(), 0,
    'guest menus never reveal signed-in account actions');
  assert.equal(await page.locator('[data-act="reset"]').isVisible(), true, 'the existing offline reset action stays reachable');
  await uniqueIds(page);
  await page.close();
}

async function noteFixture(context, mobile, errors) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const html = read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  await page.route('https://ojjuda.test/note/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/favicon.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: read('favicon.svg') }));
  await page.goto('https://ojjuda.test/note/');
  for (const file of ['note/style.css', 'note/features.css', 'note/support.css', 'note/notifications.css', 'note/world-navigation.css', 'note/account.css', 'guide-entry.css', 'my-menu.css']) {
    await page.addStyleTag({ content: read(file) });
  }
  await page.evaluate(() => {
    // These are the same integration slots populated by installManagement,
    // support and notification modules after authentication finishes.
    document.getElementById('side-tools').innerHTML = '<div class="note-tools"><button id="note-member-info" class="button" hidden>내 회원정보</button><button id="note-blocks" class="button" hidden>차단 목록</button></div>';
    const admin = document.createElement('button'); admin.id = 'note-moderation'; admin.className = 'btn pri'; admin.hidden = true; admin.textContent = '관리자 모드 열기';
    document.getElementById('note-admin-entry').append(admin);
    document.querySelector('[data-notifications-slot]').innerHTML = '<button id="note-notifications" class="btn nn-trigger">알림함 열기<span id="note-notification-badge" hidden></span></button>';
    window.originalAccountMenu = document.getElementById('note-account-menu');
    window.originalNicknameButton = document.getElementById('note-change-nickname');
    window.nicknameClicks = 0;
    originalNicknameButton.addEventListener('click', () => { nicknameClicks++; });
    window.memberState = (signedIn, admin = false) => {
      document.getElementById('note-account-section').hidden = !signedIn;
      document.getElementById('note-member-info').hidden = !signedIn;
      document.getElementById('note-blocks').hidden = !signedIn;
      document.getElementById('note-admin-entry').hidden = !signedIn || !admin;
      document.getElementById('note-moderation').hidden = !signedIn || !admin;
      document.getElementById('note-account-name').textContent = signedIn ? '검사 회원' : '';
      document.getElementById('note-account-email').textContent = signedIn ? 'synthetic-account-with-a-very-long-address@example.invalid' : '';
      document.getElementById('account-status').textContent = signedIn ? '로그인됨' : '로그인해 주세요';
    };
  });
  await page.addScriptTag({ content: read('note/support.js') });
  await page.evaluate(() => OjjudaNoteSupport.install({
    client: { auth: { onAuthStateChange() {} } }, getUserId: () => null
  }));
  await page.addScriptTag({ content: read('note/navigation.js') });
  const myButton = () => page.locator('[data-note-my]:visible').first();
  await myButton().click();
  assert.equal(await page.locator('#note-my-screen').isVisible(), true);
  assert.equal(await page.locator('#note-account-section').isVisible(), false);
  assert.equal(await page.locator('#note-admin-entry').isVisible(), false);
  assert.equal(await page.locator('#note-moderation').isVisible(), false, 'guest never sees a hidden admin button');
  assert.equal(await page.locator('details.my-menu-group:has(#side-tools)').isVisible(), false,
    'guest has no empty member-information group');
  assert.equal(await page.locator('#note-my-screen .my-shortcuts > :first-child [data-notifications-slot]').count(), 1,
    'Note notifications come before the World shortcut');
  await page.evaluate(() => memberState(true));
  assert.equal(await page.locator('details.my-menu-group:has(#side-tools)').isVisible(), true,
    'the member-information group returns after sign-in');
  assert.equal(await page.evaluate(() => {
    const before = (first, second) => !!(document.querySelector(first).compareDocumentPosition(document.querySelector(second)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before('#note-events-title', '#note-account-title') && before('#note-tools-title', '#note-account-title')
      && before('#note-account-title', '#note-help-actions');
  }), true, 'activity and member information precede account and help');
  assert.equal(await page.locator('#note-admin-entry').isVisible(), false, 'ordinary members never see admin settings');
  assert.equal(await page.locator('#note-my-screen details[open]').count(), 0, 'Note settings start closed');
  await fitsViewport(page, 'closed Note menu');
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `note-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
  await exerciseGroups(page, '#note-my-screen');
  for (const id of ['event-start', 'note-change-nickname', 'note-change-password', 'note-logout', 'note-delete-account', 'note-member-info', 'note-blocks', 'note-notifications']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `existing Note action ${id} stays reachable`);
  }
  assert.equal(await page.locator('#note-my-screen [data-show="events"]').isVisible(), true);
  assert.equal(await page.locator('#note-my-screen a[href="/guide.html"]').isVisible(), true);
  assert.equal(await page.locator('#note-my-screen a[href="/world.html"]').isVisible(), true);
  assert.equal(await page.locator('#note-my-screen .support-entry').isVisible(), true);
  assert.equal(await page.locator('#note-help-actions .support-entry').count(), 1,
    'the real support module attaches its entry to Help after regrouping');
  await page.locator('#note-help-actions .support-entry').click();
  assert.equal(await page.getByRole('dialog', { name: '문의·의견' }).isVisible(), true,
    'the moved support entry retains its actual dialog action');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '문의·의견' }).isVisible(), false);
  await page.locator('#note-change-nickname').click();
  assert.equal(await page.evaluate(() => nicknameClicks), 1, 'moved buttons keep their original action listeners');
  await uniqueIds(page);
  await fitsViewport(page, 'expanded Note menu with a long email address');

  await page.evaluate(() => memberState(true, true));
  const adminGroup = page.locator('#note-admin-entry');
  await adminGroup.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#note-moderation').isVisible(), true, 'an allowed dynamic admin entry stays reachable');

  // The My/sidebar transition must move, never clone, account controls. This
  // catches lost listeners and hidden duplicated controls after desktop resize.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.evaluate(() => OjjudaNoteNavigation.leaveMy());
  await page.waitForFunction(() => originalAccountMenu.parentElement.id === 'note-sidebar-menu-slot');
  assert.equal(await page.evaluate(() => document.getElementById('note-change-nickname') === originalNicknameButton), true);
  await page.locator('#note-change-nickname').click();
  assert.equal(await page.evaluate(() => nicknameClicks), 2);
  await myButton().click();
  await page.waitForFunction(() => originalAccountMenu.parentElement.id === 'note-my-tools-slot');
  assert.equal(await page.locator('#note-change-nickname').isVisible(), true, 'expanded state survives moving into My');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => OjjudaNoteNavigation.leaveMy());
  await page.waitForFunction(() => originalAccountMenu.parentElement.id === 'note-my-tools-slot');
  assert.equal(await page.locator('#note-account-menu').isVisible(), false, 'mobile feed does not leak account controls');
  await myButton().click();
  await page.locator('#note-change-nickname').click();
  assert.equal(await page.evaluate(() => nicknameClicks), 3);
  await page.locator('#event-start').click();
  assert.equal(await page.locator('#note-my-screen').isVisible(), false, 'existing event navigation leaves My');
  await myButton().click();
  await page.evaluate(() => memberState(false));
  assert.equal(await page.locator('#note-account-section').isVisible(), false, 'signing out hides account controls even if their group was expanded');
  assert.equal(await page.locator('#note-admin-entry').isVisible(), false, 'signing out hides an expanded admin group');
  assert.equal(await page.locator('details.my-menu-group:has(#side-tools)').isVisible(), false,
    'signing out removes the newly empty member-information group');
  await uniqueIds(page);
  await fitsViewport(page, 'mobile Note after resize and account changes');
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 360 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
      await context.route('**/*', route => route.abort());
      const errors = [];
      await worldFixture(context, mobile, errors);
      await noteFixture(context, mobile, errors);
      assert.deepEqual(errors, []);
      console.log(`PASS: ${mobile ? 'mobile' : 'desktop'} My grouping, keyboard, reachable actions, account visibility, resize identity and overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

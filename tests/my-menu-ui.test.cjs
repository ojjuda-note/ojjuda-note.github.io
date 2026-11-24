const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const world = read('world.html');
const sectionRuntime = require('./helpers/world-section-runtime.cjs')(world);
const rendererStart = world.indexOf('function worldProfileAvatar(');
const rendererEnd = world.indexOf('}var Hf=', rendererStart) + 1;
assert.ok(rendererStart > 0 && rendererEnd > rendererStart, 'World My renderer is available');
const renderer = world.slice(rendererStart, rendererEnd);
const friendRenderer = world.slice(world.indexOf('function Ag('), world.indexOf('function Cg()'))
  + world.slice(world.indexOf('function Of()'), world.indexOf('function Il('));
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

async function settingsListLayout(page, name) {
  const layout = await page.locator('.world-settings-page').evaluate(root => {
    const box = node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      page: box(root),
      groups: [...root.querySelectorAll('.ojjuda-settings-group')].map(box),
      rows: [...root.querySelectorAll('.ojjuda-settings-row')].map(node => ({
        ...box(node),
        list: box(node.closest('.ojjuda-settings-list'))
      })),
      close: box(root.querySelector('.world-settings-close'))
    };
  });
  assert.ok(layout.page.width <= 751, `${name} stays within the 750px settings width`);
  assert.ok(layout.groups.length >= 5, `${name} retains all settings sections`);
  for (const [index, group] of layout.groups.entries()) {
    assert.ok(Math.abs(group.x - layout.groups[0].x) <= 1 && Math.abs(group.width - layout.groups[0].width) <= 1,
      `${name} aligns its sections in one column`);
    if (index) assert.ok(group.y >= layout.groups[index - 1].y + layout.groups[index - 1].height - 1,
      `${name} stacks its sections without overlapping`);
  }
  for (const row of layout.rows) {
    assert.ok(row.height >= 44 && row.width >= 44, `${name} keeps each settings row easy to tap`);
    assert.ok(Math.abs(row.x - row.list.x - 1) <= 1 && Math.abs(row.width - row.list.width + 2) <= 1,
      `${name} aligns each full-width row with its list border`);
  }
  assert.ok(layout.close.width >= 44 && layout.close.height >= 44, `${name} keeps the close button easy to tap`);
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
  await page.setContent('<html data-world-theme="autumn"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="https://ojjuda.test/"><body class="world-redesign"><main class="main" id="world-my"></main></body></html>');
  for (const match of world.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    await page.addStyleTag({ content: match[1] });
  }
  for (const file of ['note/notifications.css', 'features/guide/guide-entry.css', 'features/profile/my-menu.css', 'shared/pwa/pwa-install.css', 'app/world/world-design.css', 'app/world/world-themes.css', 'app/world/world-green.css', 'features/account/settings-list.css']) {
    await page.addStyleTag({ content: read(file) });
  }
  // Execute the real renderer and door action with synthetic account data.
  // Replace persistence and confirmation boundaries; no remote writes run.
  await page.evaluate(() => {
    window.$ = { settings: { accent: 'pink', theme: 'light', defaultVis: 'friends',
      notify: { guestbook: true, friend: false } },
      me: { nick: '검사 회원', bio: '오늘도 좋은 하루', mood: '😊', moodText: '맑음' },
      album: [{ type: 'image' }, { type: 'video' }] };
    window.D = { online: true, parkGuest: false, isAdmin: false, mediaReady: true, doorReady: true,
      user: { id: '00000000-0000-4000-8000-000000000001', is_anonymous: false,
        email: 'synthetic-account-with-a-very-long-address@example.invalid' } };
    window.g = {};
    window.P = { loaded: true, communityOpen: false, incoming: [{req:'request-a',p:{id:'friend-a',nickname:'새 친구',bio:'함께 게임해요'}}],
      outgoing: [], friends: [{id:'friend-b',nickname:'기존 친구',bio:'반가워요'}], results: null, q:'',
      rel: new Map([['friend-b',{id:'request-b',status:'accepted'}]]) };
    window.Il = () => '<span class="ini">나</span>';
    window.Le = () => false;
    window.Jn = [['all', '전체 공개'], ['friends', '친구 공개'], ['me', '나만 보기']];
    window.ce = { ready: true, list: [{ id: 'synthetic-blocked', nick: '검사 작성자' }] };
    window.Go = 'test';
    window.ie = () => '<svg></svg>';
    window.w = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    window.Xd = () => '/note/';
    window.Is = () => false;
    window.Os = () => '';
    window.renderMy = () => {
      document.getElementById('world-my').innerHTML = Yg();
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
  await page.addScriptTag({ content: read('park/world-park-notes.js') });
  await page.addScriptTag({ content: sectionRuntime + friendRenderer + renderer + noteLinkRenderer });
  await page.addScriptTag({ content: doorAction });
  await page.evaluate(() => renderMy());
  assert.equal(await page.locator('[data-my-group="admin"]').count(), 0, 'member menu omits the administrator entry');
  assert.equal(await page.locator('[data-notifications-slot]').count(), 0,
    'World menu omits the oversized notification shortcut');
  assert.deepEqual(await page.locator('.world-settings-page .ojjuda-settings-heading').allTextContents(),
    ['내 계정', '이용 설정', '이용 안내', '앱 다운로드', '계정 관리'], 'settings retain the Park-style section order');
  assert.equal(await page.locator('.world-settings-header h2').textContent(), '아지트 설정');
  assert.equal(await page.getByRole('button', { name: '설정 닫기', exact: true }).getAttribute('data-act'), 'navigation-back',
    'closing settings returns to the actual previous screen');
  assert.equal(await page.locator('details[open]').count(), 0, 'settings start closed to reduce clutter');
  await fitsViewport(page, 'closed World menu');
  await settingsListLayout(page, 'closed World menu');
  assert.equal(await page.locator('[data-my-group="profile"] > summary .ojjuda-settings-label').textContent(), '프로필·닉네임 변경');
  assert.equal(await page.locator('.ojjuda-settings-group[aria-label="내 계정"] > .ojjuda-settings-list > :first-child').getAttribute('data-act'), 'member-info-open',
    'personal information opens directly from the first account row');
  assert.equal(await page.locator('[data-my-group="profile"] [data-act="member-info-open"]').count(), 0);
  for (const action of ['member-info-open', 'pw-open', 'support-open', 'logout']) {
    assert.equal(await page.locator(`[data-act="${action}"]`).isVisible(), true, `${action} opens without expanding a section`);
  }
  assert.equal(await page.locator('.world-settings-page [data-act="account-delete-open"]').count(), 0,
    'withdrawal is reached from the support screen instead of the settings list');
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 844 });
    await settingsListLayout(page, '320px World menu');
    await fitsViewport(page, '320px World menu');
    await page.setViewportSize({ width: 360, height: 844 });
  }
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `world-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });

  await exerciseGroups(page, '.my-hub');
  assert.equal(await page.locator('[data-my-group="friends"] #fr-q').isVisible(), true);
  for (const action of ['fr-accept', 'fr-decline', 'fr-remove']) {
    assert.equal(await page.locator(`[data-my-group="friends"] [data-act="${action}"]`).isVisible(), true);
  }
  assert.equal(await page.locator('[data-my-group="friends"] [data-act="visit"]').count(), 0);
  for (const id of ['p-nick', 'p-bio', 'n-friend']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `existing control ${id} stays reachable`);
  }
  assert.equal(await page.locator('[data-park-action]').count(),0,'menu omits park activities');
  assert.equal(await page.locator('#p-nick').inputValue(), '검사 회원');
  assert.equal(await page.locator('#n-friend').isChecked(), false);
  assert.equal(await page.locator('#p-mt, [data-act="mood-pick"]').count(), 0, 'profile omits retired mood controls');
  const expectedActions = ['fr-accept', 'fr-decline', 'fr-remove', 'logout', 'member-info-open', 'navigation-back', 'profile-photo', 'profile-save', 'pw-open', 'support-open', 'unblock'].sort();
  assert.deepEqual(await page.locator('.my-hub [data-act]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.act))].sort()), expectedActions,
    'every existing account, notification, privacy and support action keeps its dispatch key');
  for (const action of expectedActions) assert.equal(await page.locator(`[data-act="${action}"]`).first().isVisible(), true, `${action} remains reachable`);
  // The guide uses a cache-version query; its visible, same-origin destination stays the contract.
  const guideLink = page.locator('[data-my-group="help"] .ojjuda-guide-entry a');
  assert.equal(await guideLink.isVisible(), true, 'the guide link stays reachable');
  const guideUrl = new URL(await guideLink.getAttribute('href'), 'https://ojjuda.test/');
  assert.equal(guideUrl.origin, 'https://ojjuda.test', 'the guide stays on the same site');
  assert.equal(guideUrl.pathname, '/guide.html', 'the guide keeps its exact destination path');
  for (const href of ['terms.html', 'privacy.html']) {
    assert.equal(await page.locator(`a[href="${href}?from=my"]`).isVisible(), true, `existing link ${href} returns to settings`);
  }
  assert.equal(await page.locator('[data-act="enter-place"][data-id="park"]').count(),0,'menu omits the park shortcut');
  await uniqueIds(page);
  await fitsViewport(page, 'expanded World menu with a long email address');
  await settingsListLayout(page, 'expanded World menu');

  assert.equal(await page.locator('[data-act="door-toggle"]').count(), 0);
  assert.equal(await page.locator('#n-guestbook').count(), 0);

  // Existing setting handlers rerender My; expanded sections must not snap shut.
  await page.evaluate(() => { $.settings.theme = 'dark'; document.documentElement.dataset.theme = 'dark'; renderMy(); });
  assert.equal(await page.locator('[data-my-group="notifications"]').evaluate(node => node.open), true,
    'a settings rerender preserves the expanded group');
  await fitsViewport(page, 'dark World settings');
  await settingsListLayout(page, 'dark World settings');
  assert.equal(await page.locator('[data-act="theme"],[data-act="accent"]').count(), 0, 'saved legacy choices do not restore manual appearance controls');
  await page.evaluate(() => { D.isAdmin = true; renderMy(); });
  await page.locator('[data-my-group="admin"] > summary').click();
  assert.equal(await page.locator('[data-act="tab"][data-tab="admin"]').isVisible(), true);
  await page.evaluate(() => { D.online = false; D.user = null; renderMy(); });
  assert.equal(await page.locator('[data-my-group="admin"]').count(), 0, 'offline mode cannot retain an administrator entry');
  assert.equal(await page.locator('[data-act="member-info-open"], [data-act="logout"], [data-act="pw-open"], [data-act="account-delete-open"], [data-act="unblock"], [data-act="door-toggle"]').count(), 0,
    'guest menus never reveal signed-in account actions');
  const guestAccount = page.locator('.ojjuda-settings-group[aria-label="내 계정"] [data-guest-account="agit"]');
  assert.equal(await guestAccount.count(), 1, 'guests receive one account entry in the existing account section');
  assert.deepEqual(await guestAccount.locator('a').allTextContents(), ['회원가입', '로그인']);
  for (const [name, href] of [['회원가입', '/?auth=signup&next=world'], ['로그인', '/?auth=login&next=world']]) {
    const entry = guestAccount.getByRole('link', { name, exact: true });
    assert.equal(await entry.isVisible(), true);
    assert.equal(await entry.getAttribute('href'), href, `${name} returns to Agit after authentication`);
  }
  assert.equal(await page.locator('[data-act="account-login"], [data-my-group="profile"], [data-my-group="friends"], [data-my-group="privacy"]').count(), 0,
    'guest account buttons replace the small login row and member-only account sections');
  await page.locator('[data-my-group="local"] > summary').click();
  assert.equal(await page.locator('[data-act="reset"]').isVisible(), true, 'the existing offline reset action stays reachable');
  await page.evaluate(() => {
    D.parkGuest = true; D.isAdmin = false; $.settings.theme = 'light';
    delete document.documentElement.dataset.theme;
    document.querySelectorAll('details.my-menu-group').forEach(node => { node.open = false; });
    renderMy();
  });
  assert.equal(await page.locator('[data-act="reset"], [data-act="logout"]').count(), 0, 'browsing guests have no local-reset or logout actions');
  for (const width of mobile ? [320, 360] : [1440]) {
    await page.setViewportSize({ width, height: 844 });
    const buttons = await guestAccount.locator('.ojjuda-guest-account-actions > a').evaluateAll(nodes => nodes.map(node => ({
      height: node.getBoundingClientRect().height,
      fontSize: parseFloat(getComputedStyle(node).fontSize),
      fits: node.scrollWidth <= node.clientWidth + 1
    })));
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(button => button.height >= 56 && button.fontSize >= 18 && button.fits),
      `guest account buttons stay large and readable at ${width}px`);
    await fitsViewport(page, `${width}px World guest settings`);
  }
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `world-guest-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
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
  for (const file of ['note/style.css', 'note/features.css', 'note/support.css', 'note/notifications.css', 'note/world-navigation.css', 'note/account.css', 'features/guide/guide-entry.css', 'features/profile/my-menu.css', 'app/world/world-design.css', 'app/world/world-themes.css']) {
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
    return before('#note-tools-title', '#note-account-title')
      && before('#note-account-title', '#note-help-actions');
  }), true, 'member information precedes account and help');
  assert.equal(await page.locator('#note-admin-entry').isVisible(), false, 'ordinary members never see admin settings');
  assert.equal(await page.locator('#note-my-screen details[open]').count(), 0, 'Note settings start closed');
  await fitsViewport(page, 'closed Note menu');
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `note-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
  await exerciseGroups(page, '#note-my-screen');
  for (const id of ['note-change-nickname', 'note-change-password', 'note-logout', 'note-member-info', 'note-blocks', 'note-notifications']) {
    assert.equal(await page.locator(`#${id}`).isVisible(), true, `existing Note action ${id} stays reachable`);
  }
  assert.equal(await page.locator('#note-delete-account').count(), 0,
    'the legacy Note settings no longer have a direct withdrawal button');
  assert.equal(await page.locator('#event-start, #note-my-screen [data-show="events"]').count(), 0);
  assert.equal(await page.locator('#note-my-screen a[href^="/world.html"]').count(), 0);
  // The Park menu keeps return/context parameters; assert real destinations, not bare hrefs.
  for (const [selector, destination] of [
    ['#note-my-screen a[href^="/guide.html"]', '/guide.html']
  ]) {
    const link = page.locator(selector).first();
    assert.equal(await link.isVisible(), true, `${destination} remains reachable`);
    const target = new URL(await link.getAttribute('href'), 'https://ojjuda.test/');
    assert.equal(target.origin, 'https://ojjuda.test', `${destination} stays same-origin`);
    assert.equal(target.pathname, destination, `${destination} keeps its actual destination`);
  }
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
  await page.locator('.bottomnav [data-show="feed"]').click();
  assert.equal(await page.locator('#note-my-screen').isVisible(), false, 'returning to cards leaves My');
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

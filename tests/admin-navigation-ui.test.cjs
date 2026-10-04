const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let world = read('world.html')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
world = world.replace('<script type="module">', `<script>${read('world-navigation.js')}</script><script>${read('note/admin.js')}\nwindow.actualNoteAdmin=window.OjjudaNoteAdmin;</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'replace only the live boot with a synthetic service fixture');

function fixtureBoot() {
  const fixture = window.fixture = {
    mounts: [], refreshes: [], options: {}, controllers: {}, archiveCalls: [], edits: [], editResult: null
  };
  function mount(name, options) {
    const host = options.container;
    fixture.mounts.push(name); fixture.options[name] = options;
    host.dataset.fixtureModule = name;
    const input = document.createElement('textarea'); input.setAttribute('aria-label', name + ' 합성 입력');
    host.replaceChildren(input);
    const controller = {
      pending: false,
      canLeave: () => !controller.pending,
      hasDraft: () => input.value !== input.defaultValue,
      getState: () => ({ text: input.value }),
      refresh() { fixture.refreshes.push(name); },
      destroy() { controller.destroyed = true; }
    };
    fixture.controllers[name] = controller;
    return controller;
  }
  window.OjjudaAdminAccounts = { mount: options => mount('accounts', options) };
  window.OjjudaAdminActivity = { mount: options => mount('activity', options) };
  window.OjjudaHouseContent = { mount: (container, options) => mount('house-content', { ...options, container }) };
  window.OjjudaConnections = { mount: options => mount('connections', options) };
  window.OjjudaOperations = {
    renderReports: async options => mount('reports', options),
    renderSupport: async options => mount('support', options)
  };
  window.OjjudaNoteAdmin = {
    getTabs: () => [{ id: 'cards', label: '전체 카드' }, { id: 'risk', label: '위험 신호' }],
    mount: (container, options) => mount('note', { ...options, container }),
    unmount() {},
    selectTab(id) { fixture.options.note.onTabChange(id); },
    canLeave: () => fixture.controllers.note?.canLeave() !== false,
    hasDraft: () => fixture.controllers.note?.hasDraft() === true,
    refresh: () => fixture.controllers.note?.refresh()
  };
  if (new URL(location.href).searchParams.has('actualNote')) {
    window.OjjudaNoteAdmin = window.actualNoteAdmin;
    S = {
      schema() { return this; },
      auth: {
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        async getSession() { return { data: { session: { user: { id: 'synthetic-admin' } } } }; }
      },
      async rpc(name, args) {
        if (name === 'is_note_moderator') return { data: true };
        if (name === 'admin_settings') return { data: { notice: fixture.notice ?? '오늘도 서로를 배려해 주세요.' } };
        if (name === 'admin_patch_service_settings') { fixture.notice = args.p_notice; return { data: {} }; }
        if (name === 'admin_spam_settings') return { data: { max_consecutive: 2, window_seconds: 60, max_posts: 2 } };
        if (['admin_cards', 'admin_risk_cards'].includes(name)) return { data: [{
          id: '10000000-0000-4000-8000-000000000001', author_id: '20000000-0000-4000-8000-000000000001',
          kind: 'card', body: '함께 걷는 이곳에 따뜻한 인사를 남겨요.', tags: [], total_count: 1, reply_count: 2,
          created_at: '2026-10-04T00:00:00Z'
        }] };
        throw new Error('Unexpected synthetic RPC: ' + name);
      }
    };
  }
  U.cleanupMedia = async () => { throw new Error('A navigation test must not delete media'); };
  U.overview = async () => ({ users: 12, users_today: 2, banned: 3 });
  U.contentFeed = async kind => kind === 'risk' ? [] : [{
    id: 'synthetic-post', kind: 'diary', title: '검증용 제목', body: '검증용 원문',
    author_nick: '합성 회원', author_id: 'synthetic-member', created_at: '2026-10-04T00:00:00Z'
  }];
  U.chatFeed = async () => [];
  U.findUsers = async () => [];
  U.reports = async () => [];
  U.feedback = async () => [];
  U.errors = async () => [];
  U.bannedList = async () => ({ words: [], allow: [], off: [], baseReady: true });
  U.quizStats = async () => ({});
  U.quizList = async () => [];
  U.archiveFeed = async (reason, offset) => {
    fixture.archiveCalls.push({ reason, offset });
    return { total: 20, items: offset ? [] : Array.from({ length: 20 }, (_, i) => ({
      id: 'archive-' + i, kind: 'diary', reason: 'admin', body: '보관 검증 글 ' + i,
      created_at: '2026-10-01T00:00:00Z', archived_at: '2026-10-04T00:00:00Z', purge_after: '2026-11-03T00:00:00Z'
    })) };
  };
  U.editItem = async (kind, id, title, body) => {
    fixture.edits.push({ kind, id, title, body });
    return new Promise(resolve => { fixture.editResult = resolve; });
  };
  window.worldTest = { state: g, auth: D, admin: L, config: wt, actions: sr, render: H, clear: clearWorldAdminView };
  gm(() => { g.tab = 'friends'; H(); });
  H(); D.online = true; D.user = { id: 'synthetic-admin' }; D.isAdmin = true;
  restoreWorldAdminView(new URL(location.href).searchParams.get('admin')); H();
}
world = world.slice(0, boot) + `(${fixtureBoot.toString()})();\n` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Serve source files locally; every request to a live service is blocked.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      const file = path.join(root, url.pathname);
      return file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
        ? route.fulfill({ path: file }) : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    let acceptDialogs = false, dialogCount = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogCount++; return acceptDialogs ? dialog.accept() : dialog.dismiss(); });
    const loaded = () => page.waitForFunction(() => window.worldTest?.auth.online);
    const current = () => page.evaluate(() => ({ area: worldTest.admin.area, tab: worldTest.admin.tab }));
    const area = id => page.locator(`[data-act="adm-area"][data-v="${id}"]`).click();
    const tab = id => page.locator(`[data-act="adm-tab"][data-v="${id}"]`).click();
    const mounted = name => page.waitForFunction(name => !!fixture.controllers[name], name);

    await page.goto('https://fixture.test/world.html?admin=overview'); await loaded();
    await page.getByText('정지 중', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('.adm-areas button').allTextContents(),
      ['계정', '콘텐츠', '신고·문의', '쭈', '운영']);
    assert.equal(await page.locator('.adm-areas').evaluate(node => node.scrollWidth <= node.clientWidth), true,
      'all five navigation groups fit the mobile width');
    await page.locator('.adm-stat').filter({ hasText: '정지 중' }).click();
    await mounted('accounts');
    assert.deepEqual(await current(), { area: 'account', tab: 'users' });
    assert.equal(await page.evaluate(() => fixture.options.accounts.view), 'members');
    assert.equal(await page.evaluate(() => fixture.options.accounts.initialFilter), 'banned',
      'the suspended-member statistic opens the suspended members filter');

    async function assertRefreshPreservesHost(name) {
      await mounted(name);
      await page.evaluate(name => { window.previousHost = fixture.options[name].container; }, name);
      const before = await page.evaluate(name => fixture.mounts.filter(value => value === name).length, name);
      await page.evaluate(async () => { await worldTest.actions['adm-refresh'](); });
      assert.equal(await page.evaluate(name => fixture.refreshes.at(-1) === name, name), true, name + ' owns its refresh');
      assert.equal(await page.evaluate(name => previousHost === fixture.options[name].container && previousHost.isConnected, name), true,
        name + ' refresh preserves the mounted host');
      assert.equal(await page.evaluate(name => fixture.mounts.filter(value => value === name).length, name), before);
    }
    await assertRefreshPreservesHost('accounts');

    // The host must honor a module's pending guard before changing any group.
    await page.evaluate(() => { fixture.controllers.accounts.pending = true; });
    await area('content');
    assert.deepEqual(await current(), { area: 'account', tab: 'users' });
    assert.match(await page.locator('#toast').textContent(), /저장 중/);
    await page.evaluate(() => { fixture.controllers.accounts.pending = false; });
    await page.getByLabel('accounts 합성 입력', { exact: true }).fill('저장되지 않은 변경');
    await area('content');
    assert.deepEqual(await current(), { area: 'account', tab: 'users' }, 'rejecting discard preserves the current group');
    assert.equal(await page.getByLabel('accounts 합성 입력', { exact: true }).inputValue(), '저장되지 않은 변경');
    acceptDialogs = true;
    await area('content');
    assert.deepEqual(await current(), { area: 'content', tab: 'house-content' }, 'accepting discard permits the requested group');
    assert.equal(await page.evaluate(() => fixture.controllers.accounts.destroyed), true);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const labels = await page.locator('.adm-tabs button').evaluateAll(buttons => buttons.map(button => ({
        text: button.textContent, width: button.clientWidth, content: button.scrollWidth,
        height: button.getBoundingClientRect().height
      })));
      for (const label of labels) {
        assert.ok(label.content <= label.width + 1, `submenu label fits its button at ${width}px: ${label.text}`);
        assert.ok(label.height >= 44, `submenu touch target at ${width}px: ${label.text}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await assertRefreshPreservesHost('house-content');
    await area('support'); await assertRefreshPreservesHost('reports');
    await tab('feedback'); await assertRefreshPreservesHost('support');
    await area('operations'); await tab('connections'); await assertRefreshPreservesHost('connections');
    await tab('activity'); await assertRefreshPreservesHost('activity');
    await area('content'); await tab('cards'); await assertRefreshPreservesHost('note');
    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'cards');
    await tab('risk');
    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'risk');
    assert.deepEqual(await current(), { area: 'content', tab: 'risk' });
    await page.locator('[data-act="adm-content-kind"][data-v="posts"]').click();
    assert.equal(await page.evaluate(() => worldTest.admin.pk), 'risk');
    assert.equal(await page.locator('#world-note-admin').count(), 0);
    await page.locator('[data-act="adm-content-kind"][data-v="chats"]').click();
    assert.equal(await page.evaluate(() => worldTest.admin.cr), '__risk__');
    await page.locator('[data-act="adm-content-kind"][data-v="cards"]').click();
    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'risk');
    await area('operations');
    assert.deepEqual(await current(), { area: 'operations', tab: 'notice' });
    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'settings');
    await tab('spam');
    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'spam');
    await page.locator('[data-act="adm-content-kind"][data-v="chats"]').click();
    assert.equal(await page.locator('#adm-notice').count(), 0, 'notice has one shared editor');
    await tab('activity');
    const selectedTab = await page.locator('.adm-tabs').evaluate(bar => {
      const active = bar.querySelector('[aria-pressed="true"]');
      const a = active.getBoundingClientRect(), b = bar.getBoundingClientRect();
      return { left: a.left, right: a.right, start: b.left, end: b.right };
    });
    assert.ok(selectedTab.left >= selectedTab.start && selectedTab.right <= selectedTab.end,
      'selected submenu stays visible after the containing view redraws');
    await area('payment');
    assert.deepEqual(await current(), { area: 'payment', tab: 'settings' });
    assert.equal(await page.locator('#adm-free').count(), 1);

    // The real legacy editor's asynchronous save uses the same global navigation guard.
    await area('content'); await tab('posts');
    await page.locator('[data-act="adm-edit"]').click();
    await page.locator('#ae-body').fill('수정 후 저장할 검증용 내용');
    await page.locator('[data-act="adm-edit-save"]').click();
    await page.waitForFunction(() => typeof fixture.editResult === 'function');
    await area('support');
    assert.deepEqual(await current(), { area: 'content', tab: 'posts' }, 'in-flight legacy save cannot be abandoned by group navigation');
    assert.equal(await page.locator('#ae-body').inputValue(), '수정 후 저장할 검증용 내용');
    await page.evaluate(() => fixture.editResult({ ok: true }));
    await page.waitForFunction(() => !document.getElementById('ae-body'));
    await area('support');
    assert.deepEqual(await current(), { area: 'support', tab: 'reports' }, 'navigation resumes after the save settles');

    // A disappearing final row must return to the last nonempty archive page.
    await area('content');
    await page.evaluate(() => { worldTest.admin.ao = 20; worldTest.admin.ar = 'all'; fixture.archiveCalls = []; });
    await tab('archive');
    await page.getByText('보관 검증 글 0', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => worldTest.admin.ao), 0);
    assert.deepEqual(await page.evaluate(() => fixture.archiveCalls), [{ reason: 'all', offset: 20 }, { reason: 'all', offset: 0 }]);
    assert.equal(await page.locator('[data-act="adm-archive-page"][data-v="prev"]').isDisabled(), true);
    assert.equal(await page.locator('[data-act="adm-archive-page"][data-v="next"]').isDisabled(), true);
    assert.equal(await page.getByText('1~20 / 20', { exact: true }).count(), 1, 'page range never remains 21~20');

    await page.goto('https://fixture.test/world.html?admin=note-actions'); await loaded(); await mounted('activity');
    assert.deepEqual(await current(), { area: 'operations', tab: 'activity' });
    assert.equal(await page.evaluate(() => fixture.options.activity.initialSource), 'park',
      'the legacy Note actions link opens Park activity in the new operations group');
    for (const [legacy, area, target, initialTab] of [
      ['note', 'content', 'cards', 'cards'], ['note-risk', 'content', 'risk', 'risk'],
      ['note-archive', 'content', 'archive', 'archive'], ['note-settings', 'operations', 'notice', 'settings'],
      ['notice', 'operations', 'notice', 'settings']
    ]) {
      await page.goto('https://fixture.test/world.html?admin=' + legacy); await loaded(); await mounted('note');
      assert.deepEqual(await current(), { area, tab: target }, legacy + ' maps to a functional menu');
      assert.equal(await page.evaluate(() => fixture.options.note.initialTab), initialTab);
    }
    assert.equal(await page.locator('.adm-site-links a').count(), 1);
    assert.equal(await page.locator('.adm-site-links a').textContent(), '월드로 돌아가기');
    // Exercise the real embedded editor with the host guard: discard is asked once.
    await page.goto('https://fixture.test/world.html?admin=notice&actualNote=1'); await loaded();
    await page.getByLabel(/^서비스 공지/).waitFor();
    assert.equal(await page.getByLabel(/^서비스 공지/).getAttribute('maxlength'), '1000');
    await page.getByLabel(/^서비스 공지/).fill('새로 저장한 서비스 공지');
    await page.getByLabel(/^처리 사유/).fill('합성 테스트 공지 갱신');
    await page.getByRole('button', { name: '공지 저장', exact: true }).click();
    await page.getByText('공지를 저장했어요.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => worldTest.config.notice), '새로 저장한 서비스 공지', 'a confirmed notice save updates the World config immediately');
    await page.getByLabel(/^서비스 공지/).fill('아직 저장하지 않은 공지');
    acceptDialogs = false;
    await tab('spam');
    assert.deepEqual(await current(), { area: 'operations', tab: 'notice' });
    assert.equal(await page.getByLabel(/^서비스 공지/).inputValue(), '아직 저장하지 않은 공지');
    acceptDialogs = true; const dialogsBefore = dialogCount;
    await tab('spam');
    await page.getByText('도배 방지 기준', { exact: true }).waitFor();
    assert.equal(dialogCount, dialogsBefore + 1, 'the host-approved Note tab transition asks to discard only once');
    await area('content'); await tab('risk');
    await page.getByText('함께 걷는 이곳에 따뜻한 인사를 남겨요.', { exact: true }).waitFor();
    await page.locator('.na-more-actions summary').click();
    await page.getByRole('button', { name: '이 작성자의 카드 모두 보기', exact: true }).click();
    await page.waitForFunction(() => worldTest.admin.tab === 'cards');
    assert.deepEqual(await current(), { area: 'content', tab: 'cards' }, 'a card action updates the functional host navigation');
    assert.equal(await page.locator('.adm-tabs [aria-pressed="true"]').textContent(), '카드');
    if (process.env.ADMIN_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.ADMIN_SCREENSHOT_DIR, { recursive: true });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(process.env.ADMIN_SCREENSHOT_DIR, 'admin-content-' + width + '.png'), fullPage: true });
        await area('operations');
        await page.getByLabel(/^서비스 공지/).waitFor();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(process.env.ADMIN_SCREENSHOT_DIR, 'admin-notice-' + width + '.png'), fullPage: true });
        await area('content'); await tab('cards');
        await page.getByText('함께 걷는 이곳에 따뜻한 인사를 남겨요.', { exact: true }).waitFor();
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: five functional admin groups and unified content/notice routes, suspended-member shortcut, seven module refresh hosts, pending and draft navigation guards, legacy Note activity link and last archive page recovery.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

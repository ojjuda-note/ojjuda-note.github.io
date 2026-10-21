const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const proof = process.env.WORLD_PROFILE_QA_DIR;
if (proof) fs.mkdirSync(proof, { recursive: true });

// Execute the real World shell, renderer and delegated click/input handlers.
// Only the boot/auth transport is replaced; no production account is contacted.
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
world = world.replace('</head>', () => '<script>' + fs.readFileSync(path.join(root, 'world-themes.js'), 'utf8') + '</script></head>');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'World boot is available');
world = world.slice(0, boot) + `
window.profileTest={model:$,auth:D,state:g,render:H,actions:sr,resolvePhoto:resolveWorldProfilePhoto,
  setPhotoApi(api){worldPhotoEditor=api;worldPhotoLoad=null;},
  switchAccount(id,profile){D.user={id};D.online=true;Object.assign($.me,profile);g.tab='my';H();}};
S={};D.online=true;D.user={id:'profile-owner-a'};D.isAdmin=false;D.doorReady=true;
Object.assign($.me,{nick:'저장한 이름',bio:'저장한 소개',moodText:'저장한 기분',mood:'😊'});
g.tab='my';H();
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      const file = path.join(root, url.pathname);
      if (!file.startsWith(root + path.sep) || !/\.(css|svg)$/.test(file) || !fs.existsSync(file)) return route.abort();
      return route.fulfill({ path: file });
    });
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.profileTest);

    const openGroup = async group => {
      const details = page.locator(`[data-my-group="${group}"]`);
      if (!(await details.evaluate(node => node.open))) await details.locator(':scope > summary').click();
    };
    const readProfile = () => page.evaluate(() => ({
      nick: document.querySelector('#p-nick').value,
      bio: document.querySelector('#p-bio').value
    }));
    const saved = { nick: '저장한 이름', bio: '저장한 소개' };
    const draft = { nick: '새로운 이름', bio: '아직 작성 중인 소개' };
    await openGroup('profile');
    assert.equal(await page.locator('#p-mt, [data-act="mood-pick"], .moods').count(), 0, 'retired mood fields are absent');
    assert.equal(await page.getByText('오늘의 기분', { exact: true }).count(), 0);
    assert.equal(await page.getByText('기분 한마디', { exact: true }).count(), 0);
    assert.equal(await page.locator('[data-act="profile-photo"]').isVisible(), true, 'profile photo remains editable');
    if (proof) {
      await page.locator('[data-my-group="profile"]').screenshot({ path: path.join(proof, 'profile-mobile.png') });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('[data-my-group="profile"]').screenshot({ path: path.join(proof, 'profile-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    for (const [id, value] of [['p-nick', draft.nick], ['p-bio', draft.bio]]) {
      await page.locator('#' + id).fill(value);
    }
    assert.deepEqual(await page.evaluate(() => {
      const { nick, bio } = profileTest.model.me;
      return { nick, bio };
    }), saved, 'typing does not commit the profile');

    await page.locator('#p-bio').focus();
    await page.locator('#p-bio').evaluate(input => input.setSelectionRange(3, 8, 'backward'));
    await page.evaluate(() => profileTest.render());
    assert.deepEqual(await readProfile(), draft, 'a World render must preserve the unsaved profile fields');
    assert.deepEqual(await page.evaluate(() => {
      const input = document.activeElement;
      return [input.id, input.selectionStart, input.selectionEnd, input.selectionDirection];
    }), ['p-bio', 3, 8, 'backward'], 'a background repaint preserves input focus and the selected text');
    await openGroup('notifications');
    await page.locator('#n-friend').uncheck();
    assert.deepEqual(await readProfile(), draft, 'changing notification preferences preserves every draft field');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.deepEqual(await readProfile(), draft, 'automatic screen mode preserves every draft field');
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(() => !document.documentElement.dataset.theme);
    await page.evaluate(() => { profileTest.model.coins += 10; profileTest.render(); });
    assert.deepEqual(await readProfile(), draft, 'a balance refresh cannot erase the profile being edited');

    await page.locator('.bottomnav [data-tab="arcade"]').click();
    assert.equal(await page.locator('#p-nick').count(), 0, 'the menu is actually unmounted');
    await page.locator('.bottomnav [data-tab="my"]').click();
    await openGroup('profile');
    assert.deepEqual(await readProfile(), draft, 'settings → arcade → settings restores the unsaved profile');

    for (const id of ['p-nick', 'p-bio']) await page.locator('#' + id).fill('');
    await page.evaluate(() => profileTest.render());
    const cleared = { nick: '', bio: '' };
    assert.deepEqual(await readProfile(), cleared, 'deliberately cleared draft fields do not fall back to the saved profile');
    await page.locator('[data-act="profile-save"]').click();
    assert.deepEqual(await readProfile(), cleared, 'nickname validation preserves the draft for correction');
    for (const [id, value] of [['p-nick', draft.nick], ['p-bio', draft.bio]]) {
      await page.locator('#' + id).fill(value);
    }

    // Saving should release the draft, so later fresh model data is visible.
    await page.locator('[data-act="profile-save"]').click();
    assert.deepEqual(await page.evaluate(() => {
      const { nick, bio } = profileTest.model.me;
      return { nick, bio };
    }), draft, 'profile-save commits nickname and bio without retired inputs');
    assert.deepEqual(await page.evaluate(() => {
      const { mood, moodText } = profileTest.model.me;
      return { mood, moodText };
    }), { mood: '😊', moodText: '저장한 기분' }, 'saving active fields preserves existing legacy profile data');
    const refreshed = { nick: '저장 후 이름', bio: '다른 기기에서 바꾼 소개' };
    await page.evaluate(profile => { Object.assign(profileTest.model.me, profile); profileTest.render(); }, refreshed);
    assert.deepEqual(await readProfile(), refreshed, 'a saved draft is cleared and does not mask subsequent model updates');

    await openGroup('profile');
    await page.locator('#p-nick').fill('A만의 비공개 초안');
    await page.locator('#p-bio').fill('A 계정에서 입력한 소개');
    await page.locator('#p-nick').focus();
    const other = { nick: '다른 계정 이름', bio: '다른 계정 소개' };
    await page.evaluate(profile => profileTest.switchAccount('profile-owner-b', profile), other);
    assert.deepEqual(await readProfile(), other, 'account B never receives account A’s profile draft');
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'p-nick', 'account B does not inherit account A’s input focus');
    await page.locator('.bottomnav [data-tab="arcade"]').click();
    await page.locator('.bottomnav [data-tab="my"]').click();
    assert.deepEqual(await readProfile(), other, 'account isolation survives another menu remount');
    // An initial signing failure cannot permanently hide the saved profile photo.
    await page.evaluate(async()=>{
      window.signCalls=0;profileTest.model.me.profilePhotoPath='saved-profile';profileTest.model.me.avatar_url=null;
      profileTest.setPhotoApi({getUrl:async()=>{if(++window.signCalls===1)throw new Error('temporary offline');return 'https://fixture.test/fresh-photo.jpg';}});
      await profileTest.resolvePhoto();
    });
    assert.equal(await page.evaluate(()=>profileTest.model.me.avatar_url),null);
    await page.evaluate(()=>profileTest.resolvePhoto());
    assert.deepEqual(await page.evaluate(()=>({calls:signCalls,url:profileTest.model.me.avatar_url})),{calls:2,url:'https://fixture.test/fresh-photo.jpg'},'reopening retries a failed signed URL request');
    assert.equal(await page.locator('[data-own-profile-photo] img').first().getAttribute('src'),'https://fixture.test/fresh-photo.jpg','a successful retry updates the visible profile photo');

    // The module owns URL expiry; returning to the menu must consult it even
    // when the World model still has a previously signed URL.
    await page.evaluate(()=>{
      profileTest.model.me.avatar_url='https://fixture.test/expired-photo.jpg';
      profileTest.setPhotoApi({getUrl:async()=>{window.signCalls++;return 'https://fixture.test/renewed-photo.jpg';}});
    });
    await page.locator('.bottomnav [data-tab="arcade"]').click();
    await page.locator('.bottomnav [data-tab="my"]').click();
    await page.waitForFunction(()=>profileTest.model.me.avatar_url==='https://fixture.test/renewed-photo.jpg');
    assert.equal(await page.evaluate(()=>signCalls),3,'a menu remount renews an expired signed URL');

    // Concurrent renders share a flight, but a result from a previous account
    // cannot replace the current account photo after the request resolves.
    await page.evaluate(()=>{
      window.signCalls=0;profileTest.model.me.avatar_url=null;
      profileTest.setPhotoApi({getUrl:()=>{window.signCalls++;return new Promise(resolve=>window.finishPhoto=resolve);}});
      window.photoFlights=Promise.all([profileTest.resolvePhoto(),profileTest.resolvePhoto()]);
    });
    assert.equal(await page.evaluate(()=>signCalls),1,'concurrent renders deduplicate the in-flight signing request');
    await page.evaluate(async()=>{profileTest.auth.user={id:'profile-owner-c'};profileTest.model.me.avatar_url='https://fixture.test/account-c-photo.jpg';finishPhoto('https://fixture.test/stale-account-b-photo.jpg');await photoFlights;});
    assert.equal(await page.evaluate(()=>profileTest.model.me.avatar_url),'https://fixture.test/account-c-photo.jpg','an old account response is ignored');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: unsaved World profile and caret survive render/notifications/system appearance/balance/tab changes, empty fields remain editable, saving clears the draft, accounts stay isolated, and profile photo signing retries/renews without stale account responses.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

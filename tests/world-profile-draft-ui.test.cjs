const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

// Execute the real World shell, renderer and delegated click/input handlers.
// Only the boot/auth transport is replaced; no production account is contacted.
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
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
    await page.route('**/*', route => new URL(route.request().url()).pathname === '/world.html'
      ? route.fulfill({ contentType: 'text/html', body: world }) : route.abort());
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.profileTest);

    const openGroup = async group => {
      const details = page.locator(`[data-my-group="${group}"]`);
      if (!(await details.evaluate(node => node.open))) await details.locator(':scope > summary').click();
    };
    const readProfile = () => page.evaluate(() => ({
      nick: document.querySelector('#p-nick').value,
      bio: document.querySelector('#p-bio').value,
      moodText: document.querySelector('#p-mt').value,
      mood: document.querySelector('[data-act="mood-pick"].on')?.dataset.v
    }));
    const saved = { nick: '저장한 이름', bio: '저장한 소개', moodText: '저장한 기분', mood: '😊' };
    const draft = { nick: '새로운 이름', bio: '아직 작성 중인 소개', moodText: '느긋한 오후', mood: '😴' };
    await openGroup('profile');
    for (const [id, value] of [['p-nick', draft.nick], ['p-bio', draft.bio], ['p-mt', draft.moodText]]) {
      await page.locator('#' + id).fill(value);
    }
    await page.locator(`[data-act="mood-pick"][data-v="${draft.mood}"]`).click();
    assert.deepEqual(await page.evaluate(() => {
      const { nick, bio, moodText, mood } = profileTest.model.me;
      return { nick, bio, moodText, mood };
    }), saved, 'typing and selecting a mood do not commit the profile');

    await page.locator('#p-bio').focus();
    await page.locator('#p-bio').evaluate(input => input.setSelectionRange(3, 8, 'backward'));
    await page.evaluate(() => profileTest.render());
    assert.deepEqual(await readProfile(), draft, 'a World render must preserve the unsaved profile fields and mood');
    assert.deepEqual(await page.evaluate(() => {
      const input = document.activeElement;
      return [input.id, input.selectionStart, input.selectionEnd, input.selectionDirection];
    }), ['p-bio', 3, 8, 'backward'], 'a background repaint preserves input focus and the selected text');
    await openGroup('display');
    await page.locator('[data-act="theme"][data-v="dark"]').click();
    assert.deepEqual(await readProfile(), draft, 'changing screen mode preserves every profile draft field');
    await page.locator('[data-act="accent"][data-v="mint"]').click();
    assert.deepEqual(await readProfile(), draft, 'changing the theme color preserves every profile draft field');
    await page.evaluate(() => { profileTest.model.coins += 10; profileTest.render(); });
    assert.deepEqual(await readProfile(), draft, 'a balance refresh cannot erase the profile being edited');

    await page.locator('.bottomnav [data-tab="life"]').click();
    assert.equal(await page.locator('#p-nick').count(), 0, 'the menu is actually unmounted');
    await page.locator('.bottomnav [data-tab="my"]').click();
    await openGroup('profile');
    assert.deepEqual(await readProfile(), draft, 'menu → life → menu restores the unsaved profile');

    for (const id of ['p-nick', 'p-bio', 'p-mt']) await page.locator('#' + id).fill('');
    await page.evaluate(() => profileTest.render());
    const cleared = { nick: '', bio: '', moodText: '', mood: draft.mood };
    assert.deepEqual(await readProfile(), cleared, 'deliberately cleared draft fields do not fall back to the saved profile');
    await page.locator('[data-act="profile-save"]').click();
    assert.deepEqual(await readProfile(), cleared, 'nickname validation preserves the draft for correction');
    for (const [id, value] of [['p-nick', draft.nick], ['p-bio', draft.bio], ['p-mt', draft.moodText]]) {
      await page.locator('#' + id).fill(value);
    }

    // Saving should release the draft, so later fresh model data is visible.
    await page.locator('[data-act="profile-save"]').click();
    assert.deepEqual(await page.evaluate(() => {
      const { nick, bio, moodText, mood } = profileTest.model.me;
      return { nick, bio, moodText, mood };
    }), draft, 'profile-save commits all four fields together');
    const refreshed = { nick: '저장 후 이름', bio: '다른 기기에서 바꾼 소개', moodText: '저장 후 기분', mood: '😊' };
    await page.evaluate(profile => { Object.assign(profileTest.model.me, profile); profileTest.render(); }, refreshed);
    assert.deepEqual(await readProfile(), refreshed, 'a saved draft is cleared and does not mask subsequent model updates');

    await openGroup('profile');
    await page.locator('#p-nick').fill('A만의 비공개 초안');
    await page.locator('#p-bio').fill('A 계정에서 입력한 소개');
    await page.locator('#p-mt').fill('A만의 기분');
    await page.locator(`[data-act="mood-pick"][data-v="${draft.mood}"]`).click();
    await page.locator('#p-nick').focus();
    const other = { nick: '다른 계정 이름', bio: '다른 계정 소개', moodText: '다른 계정 기분', mood: '😊' };
    await page.evaluate(profile => profileTest.switchAccount('profile-owner-b', profile), other);
    assert.deepEqual(await readProfile(), other, 'account B never receives account A’s profile draft or mood');
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'p-nick', 'account B does not inherit account A’s input focus');
    await page.locator('.bottomnav [data-tab="life"]').click();
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
    await page.locator('.bottomnav [data-tab="life"]').click();
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
    console.log('PASS: unsaved World profile and caret survive render/theme/accent/balance/tab changes, empty fields remain editable, saving clears the draft, accounts stay isolated, and profile photo signing retries/renews without stale account responses.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

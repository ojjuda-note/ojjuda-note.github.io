const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const trialKey = 'ojjuda-photo-ttang-demo-v1';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const errors = [];
  try {
    async function fixture({ member = null, identityError = false, identity = { age: 19, locked: true } } = {}) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.addInitScript(({ member, identityError, identity }) => {
        window.fixtureUser = member;
        window.fixtureIdentityError = identityError; window.fixtureIdentity = identity; window.fixtureReads = 0;
      }, { member, identityError, identity });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: `
          const subscribers=new Set();window.fixtureAuthChange=(event,user)=>{for(const fn of subscribers)fn(event,user?{user}:null)};
          window.supabase={createClient:()=>({
            auth:{getUser:async()=>window.fixtureIdentityError?{data:{user:null},error:{message:'unverified'}}:{data:{user:window.fixtureUser}},
              onAuthStateChange(fn){subscribers.add(fn);return{data:{subscription:{unsubscribe(){subscribers.delete(fn)}}}}}},
            from:()=>{const q={select(){return q},neq(){return q},eq(){return q},order(){return q},limit(){return q},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q},
            rpc:async name=>{if(name!=='get_my_member_identity')return{data:false};fixtureReads++;return{data:fixtureIdentity}}
          })};` });
        if (url.hostname !== 'fixture.test') return route.abort();
        if (url.pathname === '/config.js') return route.fulfill({ contentType: 'application/javascript', body: "window.OJJUDA_CONFIG={supabaseUrl:'https://example.invalid',supabaseKey:'fixture'};" });
        const file = path.join(root, url.pathname);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
        return route.fulfill({ contentType, path: file });
      });
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      const page = await context.newPage();
      await page.goto('https://fixture.test/photo-ttang.html');
      await page.waitForFunction(() => !document.getElementById('start-demo').disabled || !document.getElementById('continue-login').hidden || !!document.querySelector('iframe'));
      return { context, page };
    }
    async function start(page) {
      await page.getByRole('button', { name: '한 판 체험하기', exact: true }).click();
      await page.locator('#game-shell iframe').waitFor({ state: 'visible' });
      const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
      await frame.waitForFunction(() => mode === 'play' && photoImg.complete && photoImg.naturalWidth > 0);
      await frame.evaluate(() => { paused = true; sound = false; });
      assert.equal(await frame.evaluate(() => LIST.length), 1);
      assert.equal(await frame.evaluate(() => PUBLIC_DEMO), true);
      assert.ok(await frame.evaluate(() => VW > 200 && VH > 400), 'demo starts at the visible iframe size');
      assert.match(await frame.locator('.bar').textContent(), /\/ 90%/);
      assert.equal(await frame.locator('#uploadBtn').isVisible(), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), trialKey), '1');
      return frame;
    }

    // A completed demo reveals its photo, but neither retries nor the next stage.
    const win = await fixture();
    for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
      await win.page.setViewportSize({ width, height });
      assert.equal(await win.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await win.page.getByRole('button', { name: '한 판 체험하기', exact: true }).isVisible());
    }
    await win.page.setViewportSize({ width: 390, height: 844 });
    const winningFrame = await start(win.page);
    await winningFrame.evaluate(() => { startWait = 0; world.own.fill(me.id); world.step = () => {}; mobs = []; silTotal = 1000; mySil = 900; paused = false; });
    await winningFrame.locator('.fullimg').waitFor();
    assert.equal(await winningFrame.locator('.fullimg').evaluate(el => getComputedStyle(el).filter), 'none');
    const login = winningFrame.getByRole('link', { name: '로그인하고 계속하기', exact: true });
    assert.equal(await login.getAttribute('href'), '/?auth=login&next=photo');
    assert.equal(await login.getAttribute('target'), '_top');
    assert.equal(await winningFrame.getByRole('button', { name: '다음 사진', exact: true }).count(), 0);
    assert.equal(await winningFrame.evaluate(() => startStage(0)), false);
    assert.equal(await winningFrame.evaluate(() => over && paused), true);
    await win.page.reload();
    await win.page.getByRole('link', { name: '로그인하고 계속하기', exact: true }).waitFor();
    assert.equal(await win.page.locator('iframe').count(), 0, 'refresh cannot reset the used demo');
    assert.equal(await win.page.getByRole('button', { name: '한 판 체험하기', exact: true }).count(), 0);
    await win.page.goto('https://fixture.test/games/photo-ttang.html?demo=1');
    await win.page.waitForURL('https://fixture.test/photo-ttang.html');
    await win.page.getByRole('link', { name: '로그인하고 계속하기', exact: true }).waitFor();
    await win.context.close();

    // A time limit, all lives lost, or leaving also consumes the same single round.
    for (const outcome of ['timeout', 'death', 'leave', 'pause-list']) {
      const f = await fixture(), game = await start(f.page);
      if (outcome === 'timeout') {
        await game.evaluate(() => { startWait = 0; endAt = 0; paused = false; });
      } else if (outcome === 'death') {
        await game.evaluate(() => { lives = 1; world.events = [{ t: 'death', p: me, why: 'mob' }]; handleEvents(); });
      } else if (outcome === 'leave') {
        await f.page.getByRole('button', { name: '나가기 ✕', exact: true }).click();
      } else {
        await game.evaluate(() => { paused = false; });
        await game.getByRole('button', { name: '일시정지', exact: true }).click();
        await game.getByRole('button', { name: '사진 목록', exact: true }).click();
      }
      if (outcome !== 'leave') {
        await game.getByRole('link', { name: '로그인하고 계속하기', exact: true }).waitFor();
        assert.equal(await game.getByRole('button', { name: '다시 도전', exact: true }).count(), 0);
      }
      await f.page.reload();
      await f.page.getByRole('link', { name: '로그인하고 계속하기', exact: true }).waitFor();
      assert.equal(await f.page.locator('iframe').count(), 0);
      await f.context.close();
    }

    // Two open tabs cannot reserve two guest rounds.
    const tabs = await fixture();
    const second = await tabs.context.newPage();
    await second.goto('https://fixture.test/photo-ttang.html');
    await second.getByRole('button', { name: '한 판 체험하기', exact: true }).waitFor();
    await Promise.all([tabs.page, second].map(p => p.getByRole('button', { name: '한 판 체험하기', exact: true }).click()));
    const waitSettled = page => page.waitForFunction(() => document.body.classList.contains('playing') || (!document.getElementById('continue-login').hidden && !document.querySelector('iframe')));
    await Promise.all([tabs.page, second].map(waitSettled));
    const playing = await Promise.all([tabs.page, second].map(p => p.evaluate(() => document.body.classList.contains('playing'))));
    assert.equal(playing.filter(Boolean).length, 1);
    await tabs.context.close();

    // Full play uses a verified account, and is removed immediately on sign-out.
    const signed = await fixture({ member: { id: 'member-one', user_metadata: { nickname: '테스트' } } });
    await signed.page.locator('iframe').waitFor({ state: 'visible' });
    const full = await (await signed.page.locator('iframe').elementHandle()).contentFrame();
    await full.locator('#grid .cell').first().waitFor({ state: 'visible' });
    assert.equal(await full.locator('#grid .cell').count(), 20);
    assert.equal(await full.evaluate(() => PUBLIC_DEMO), false);
    await full.getByRole('button', { name: '1 ★', exact: true }).click();
    await full.waitForFunction(() => mode === 'play');
    assert.equal(await signed.page.evaluate(key => localStorage.getItem(key), trialKey), null, 'member play does not use the guest demo');
    await signed.page.evaluate(() => { fixtureUser = null; fixtureAuthChange('SIGNED_OUT', null); });
    await signed.page.getByRole('button', { name: '한 판 체험하기', exact: true }).waitFor();
    assert.equal(await signed.page.locator('iframe').count(), 0);
    await signed.context.close();

    const failed = await fixture({ member: { id: 'unverified' }, identityError: true });
    assert.equal(await failed.page.locator('iframe').count(), 0, 'failed identity lookup never enables full play');
    await failed.context.close();
    const anonymous = await fixture({ member: { id: 'anonymous', is_anonymous: true } });
    assert.equal(await anonymous.page.locator('iframe').count(), 0, 'anonymous Auth users have only the unrestricted one-round demo');
    await anonymous.context.close();
    // The public demo has no age restriction; signed-in full play does.
    for (const age of [14, 18]) {
      const minor = await fixture({ member: { id: 'minor', user_metadata: { age: 30, adult: true } }, identity: { age, locked: true } });
      await minor.page.waitForFunction(() => fixtureReads > 0 && !OjjudaMatgoAccess.allowed());
      assert.equal(await minor.page.locator('iframe').count(), 0, 'being signed in alone does not enable full play');
      const reads = await minor.page.evaluate(() => fixtureReads);
      const demo = await start(minor.page);
      assert.equal(await demo.evaluate(() => PUBLIC_DEMO), true, 'underage players may try the same single public round');
      assert.equal(await minor.page.evaluate(() => fixtureReads), reads, 'starting the demo does not check age');
      await minor.page.getByRole('button', { name: '나가기 ✕', exact: true }).click();
      await minor.page.getByText('본게임은 만 19세 생일부터 이용할 수 있어요.', { exact: true }).waitFor();
      assert.equal(await minor.page.locator('iframe').count(), 0);
      assert.equal(await minor.page.getByRole('link', { name: '로그인하고 계속하기', exact: true }).count(), 0, 'a signed-in minor is not asked to log in again');
      await minor.context.close();
    }
    const missing = await fixture({ member: { id: 'missing-birth' }, identity: null });
    await missing.page.waitForFunction(() => fixtureReads > 0);
    await start(missing.page);
    await missing.page.getByRole('button', { name: '나가기 ✕', exact: true }).click();
    await missing.page.getByRole('link', { name: '생년월일 등록', exact: true }).waitFor();
    await missing.page.evaluate(() => fixtureIdentity = { age: 19, locked: true });
    await missing.page.getByRole('button', { name: '다시 확인', exact: true }).click();
    await missing.page.locator('iframe[data-demo="0"]').waitFor({ state: 'visible' });
    const birthday = await (await missing.page.locator('iframe').elementHandle()).contentFrame();
    await birthday.locator('#grid .cell').first().waitFor();
    assert.equal(await birthday.locator('#grid .cell').count(), 20, 'the 19th birthday opens full play');
    await missing.page.evaluate(() => { fixtureUser = { id: 'younger' }; fixtureIdentity = { age: 18, locked: true }; fixtureAuthChange('SIGNED_IN', fixtureUser); });
    await missing.page.getByText('본게임은 만 19세 생일부터 이용할 수 있어요.', { exact: true }).waitFor();
    assert.equal(await missing.page.locator('iframe').count(), 0, 'switching to an underage account closes an active full game');
    await missing.context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: one guest round, 90% reveal, timeout/death/exit gates, refresh/direct-link/two-tab limits, 19+ verified member play, unrestricted minor demo, birth-date registration, account change and sign-out');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

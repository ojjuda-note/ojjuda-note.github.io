const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('note/preview.js');
const bootAt = source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(bootAt > 0);

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 844 },
        isMobile: mobile, hasTouch: mobile });
      const html = read('note/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
      await context.route('**/*', route => {
        if (route.request().url() === 'https://ojjuda.test/world.html') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>동네</title>'});
        return route.request().url() === 'https://ojjuda.test/note/'
          ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort();
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://ojjuda.test/note/');
      for (const file of ['style.css', 'features.css', 'pull-refresh.css', 'feed-swipe.css', 'world-navigation.css']) {
        await page.addStyleTag({ content: read(`note/${file}`) });
      }
      // Only data boundaries are replaced. Use real feed rendering, tab/search
      // handlers, pull-to-refresh, card clicks and browser-generated gestures.
      await page.evaluate(() => {
        window.OJJUDA_CONFIG = { supabaseUrl: 'https://test.supabase.co', supabaseKey: 'synthetic' };
        window.supabase = { createClient: () => ({ schema: () => ({ from: () => {
          const q = { select: () => q, eq: () => q, not: () => q, order: () => q,
            contains: () => q, lte: () => q, gte: () => q, or: () => q,
            limit: async () => ({ data: [], error: null }) }; return q;
        } }) }) };
      });
      await page.addScriptTag({ content: read('note/feed-swipe.js') });
      await page.addScriptTag({ content: source.slice(0, bootAt) });
      await page.addScriptTag({ content: read('note/pull-refresh.js') });
      await page.addScriptTag({ content: read('note/world-swipe.js') });
      await page.addScriptTag({ content: read('photo-protection.js') });
      await page.evaluate(async () => {
        window.cardOpens = 0; window.refreshes = 0; window.requests = []; window.delayRecent = 0;
        openCard = () => { window.cardOpens++; };
        positionIfAlreadyGranted = async () => null;
        noteRpc = async (name, params) => {
          if (name !== 'list_cards') return [];
          window.requests.push(params.p_sort);
          const sort = params.p_sort;
          if (sort === 'recent' && window.delayRecent) await new Promise(resolve => setTimeout(resolve, window.delayRecent));
          return Array.from({ length: 4 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`,
            kind: 'memo', body: sort === 'popular' ? '인기 카드' : '최신 카드', tags: ['응원'],
            background_key: 'plain', created_at: new Date().toISOString(), like_count: i }));
        };
        window.ojjudaRefreshFeed = async () => { window.refreshes++; return loadFeed(); };
        authKnown = true; await loadFeed();
      });
      const active = () => page.locator('.feed-sort-tabs .selected').getAttribute('data-sort');
      const idle = () => page.waitForFunction(() => !document.getElementById('feed').matches('.note-feed-dragging, .note-feed-settling'));
      const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: points.map(([x, y, id = 1]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 }))
      });
      const bounds = () => page.locator('.note-feed-viewport').boundingBox();
      const drag = async (direction, { distance = mobile ? 160 : 230, vertical = 0, cancel = false, hold = false } = {}) => {
        const box = await bounds();
        const x = box.x + box.width * (direction < 0 ? .76 : .24);
        const y = Math.max(200, box.y + 110);
        if (mobile) await touch('touchStart', [[x, y]]);
        else { await page.mouse.move(x, y); await page.mouse.down(); }
        for (let i = 1; i <= 6; i++) {
          const endX = x + direction * distance * i / 6, endY = y + vertical * i / 6;
          if (mobile) await touch('touchMove', [[endX, endY]]);
          else await page.mouse.move(endX, endY);
        }
        await frame();
        if (hold) return { x, y };
        if (mobile) await touch(cancel ? 'touchCancel' : 'touchEnd', []);
        else await page.mouse.up();
        await idle();
      };
      assert.equal(await active(), 'latest');
      await drag(-1, { hold: true });
      const during = await page.locator('.note-feed-page:not(.note-feed-ghost)').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
      assert.ok(during < -80, 'the actual card page follows the drag before release');
      assert.equal(await active(), 'latest', 'a held drag does not change data/filter');
      if (process.env.SWIPE_QA_DIR) await page.screenshot({ path: path.join(process.env.SWIPE_QA_DIR, mobile ? 'swipe-mobile.png' : 'swipe-desktop.png') });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'drag creates no horizontal page scrollbar');
      if (mobile) await touch('touchEnd', []); else await page.mouse.up();
      assert.equal(await active(), 'popular');
      assert.equal(await page.locator('.note-feed-ghost').count(), 1, 'outgoing and incoming pages slide together');
      assert.equal(await page.locator('#feed-list').count(), 1, 'the outgoing copy has no duplicate IDs');
      await idle();
      assert.match(await page.locator('#feed-list').textContent(), /인기 카드/);
      assert.equal(await page.evaluate(() => window.cardOpens), 0, 'swiping a card must not open it');

      await drag(-1); assert.equal(await active(), 'nearby');
      assert.match(await page.locator('#feed-list').textContent(), /위치 확인/);
      await drag(-1); assert.equal(await active(), 'tag');
      assert.equal(await page.locator('#note-tag-panel').isVisible(), true);
      assert.equal(await page.locator('#note-tag-panel input').evaluate(el => el === document.activeElement), false,
        'swiping to tags never opens the keyboard');
      await drag(-1, { distance: 18 }); assert.equal(await active(), 'tag', 'a short drag cannot leave Note');
      if (mobile) { await drag(-1, { cancel: true }); assert.equal(await active(), 'tag', 'cancelled touch cannot leave Note'); }
      await drag(1); assert.equal(await active(), 'nearby');
      await drag(1); assert.equal(await active(), 'popular');
      await drag(1); assert.equal(await active(), 'latest');
      await drag(1); assert.equal(await active(), 'latest', 'the first tab has a boundary');
      await drag(-1, { distance: 18 }); assert.equal(await active(), 'latest', 'a short drag snaps back');
      if (mobile) { await drag(-1, { cancel: true }); assert.equal(await active(), 'latest', 'cancelled touch cannot change tabs'); }

      // A normal tap remains a tap, including immediately after a short drag.
      await page.locator('#feed-list .photo-open').first().click();
      assert.equal(await page.evaluate(() => window.cardOpens), 1);
      await page.locator('[data-sort="tag"]').click(); await idle();
      assert.equal(await page.locator('#note-tag-panel input').evaluate(el => el === document.activeElement), true);
      await page.locator('#note-tag-panel input').fill('응원');
      await page.locator('.note-tag-form button').click();
      assert.equal(await page.evaluate(() => feedTerm), '응원');
      await page.locator('[data-sort="latest"]').click(); await idle();
      assert.equal(await page.evaluate(() => feedTerm), '', 'leaving tags clears the old search');

      // Scroll deep, then swipe: a short target page must appear at its top.
      await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
      await drag(-1); assert.equal(await active(), 'popular');
      assert.ok(await page.evaluate(() => scrollY < 150), 'new tab starts near the top after a deep-feed swipe');
      await page.locator('[data-sort="latest"]').click(); await idle();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

      if (mobile) {
        await drag(-1, { distance: 8, vertical: -150 });
        assert.equal(await active(), 'latest', 'vertical scrolling does not change tabs');
        assert.ok(await page.evaluate(() => scrollY > 20), 'native vertical scrolling still works');
        // Wait for native scrolling to stop before beginning a new pull at top.
        await page.evaluate(() => new Promise(resolve => {
          let last = scrollY, still = 0;
          const check = () => {
            still = scrollY === last ? still + 1 : 0; last = scrollY;
            if (still >= 12) resolve(); else requestAnimationFrame(check);
          }; requestAnimationFrame(check);
        }));
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await frame();
        await drag(1, { distance: 2, vertical: 130 });
        assert.equal(await active(), 'latest');
        assert.equal(await page.evaluate(() => refreshes), 1, 'pull-to-refresh remains functional');
        await page.waitForFunction(() => !document.getElementById('feed').classList.contains('note-pull-refreshing'));
        // Adding a second finger cancels an in-progress horizontal drag.
        const point = await drag(-1, { distance: 80, hold: true });
        await touch('touchStart', [[point.x - 80, point.y], [point.x, point.y + 60, 2]]);
        await touch('touchEnd', []); await idle();
        assert.equal(await active(), 'latest');
      }

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await drag(-1); assert.equal(await active(), 'popular');
      assert.equal(await page.locator('.note-feed-ghost').count(), 0, 'reduced motion skips settling animation');
      await page.locator('[data-sort="latest"]').focus(); await page.keyboard.press('Enter');
      assert.equal(await active(), 'latest', 'keyboard tab selection still works');
      assert.deepEqual(errors, []);
      await page.locator('[data-sort="tag"]').click();
      await drag(-1, { hold: true });
      assert.equal(await page.locator('.note-feed-peek').textContent(), '동네');
      if (mobile) await touch('touchEnd', []); else await page.mouse.up();
      await page.waitForURL('https://ojjuda.test/world.html');

      // App navigation is available outside the feed, without overriding its
      // filter swipes or allowing a swipe to discard an open composer.
      await page.goto('https://ojjuda.test/note/');
      for (const file of ['style.css', 'features.css', 'world-navigation.css']) await page.addStyleTag({content:read(`note/${file}`)});
      await page.addScriptTag({content:read('note/world-swipe.js')});
      const chromeDrag=async(selector,distance=150)=>{
        const box=await page.locator(selector).boundingBox();
        const x=box.x+box.width*.85,y=box.y+box.height/2;
        if(mobile)await touch('touchStart',[[x,y]]);
        else{await page.mouse.move(x,y);await page.mouse.down()}
        for(let i=1;i<=6;i++){
          if(mobile)await touch('touchMove',[[x-distance*i/6,y]]);
          else await page.mouse.move(x-distance*i/6,y);
        }
        if(mobile)await touch('touchEnd',[]);else await page.mouse.up();
      };
      const chrome=mobile?'.mobile-top':'.note-side-header';
      await chromeDrag(chrome,20);assert.equal(page.url(),'https://ojjuda.test/note/');
      await chromeDrag(chrome,-100);assert.equal(page.url(),'https://ojjuda.test/note/');
      await page.evaluate(()=>document.getElementById('composer-backdrop').hidden=false);
      await chromeDrag(chrome);assert.equal(page.url(),'https://ojjuda.test/note/','an open composer prevents app navigation');
      await page.evaluate(()=>document.getElementById('composer-backdrop').hidden=true);
      await chromeDrag(mobile?'.bottomnav':chrome);
      await page.waitForURL('https://ojjuda.test/world.html');
      assert.deepEqual(errors,[]);
      console.log(`PASS: ${mobile ? 'touch' : 'mouse'} feed filters, animation, scroll/search, refresh, composer protection and Note-to-World swipes`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

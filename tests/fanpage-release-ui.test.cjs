// Read-only release smoke test. Network images are never replaced with placeholders.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'artifacts/fanpage-release');
const live = process.env.FANPAGE_LIVE === 'true';
const base = live ? 'https://ojjuda.kr' : 'https://fan.test';
const group = 'rescene';
const newIds = ['EEMdvAl21pQ', 'n-rmTxbsjq0', 'mTaMFwEQdH4'];
const newFiles = ['RESCENE Woni 261103.jpg', 'RESCENE Liv 261103 (2).jpg', 'RESCENE Minami 261103.jpg', 'RESCENE May 261103.jpg', 'RESCENE Zena 261103 (1).jpg'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const report = { mode: live ? 'public-site' : 'PR-preview', group, checkedAt: new Date().toISOString(), screenshots: [], photos: [], videos: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/bin/chromium'), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Seoul' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (!live) await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin !== base) return (route.request().resourceType() === 'image' || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? route.continue() : route.abort();
      if (u.pathname.endsWith('/vendor/supabase.js')) return route.fulfill({ contentType: 'application/javascript', body: 'window.supabase={createClient:()=>({auth:{onAuthStateChange:()=>{}},from:()=>({select(){return this},order(){return this},range(){return this},abortSignal:async()=>({data:[],error:null})})})};' });
      const file = path.join(root, decodeURIComponent(u.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({ path: file, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' })[path.extname(file)] });
    });
    await page.goto(`${base}/features/fanpages/artist.html?group=${group}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#schedule');
    await page.evaluate(() => document.fonts.ready);
    const data = await page.evaluate(id => ({ artists: window.OJJUDA_FAN_ARTISTS.map(a => ({ id: a.id, name: a.name })), artist: window.OJJUDA_FAN_ARTISTS.find(a => a.id === id), videos: window.OJJUDA_FAN_VIDEOS[id] }), group);
    assert.equal(data.artists.length, 30);
    assert.equal(new Set(data.artists.map(a => a.id)).size, 30);
    assert.equal(new Set(data.artists.map(a => a.name)).size, 30);
    for (const id of newIds) assert.ok(data.videos.some(v => v.id === id), `missing video ${id}`);
    for (const file of newFiles) assert.ok(JSON.stringify(data.artist).includes(encodeURIComponent(file.replaceAll(' ', '_'))), `missing photo ${file}`);
    assert.ok(data.artist.appearances.some(e => e.date === '2026-11-22' && e.href === 'https://www.makestar.com/product/21557'));
    report.artistCount = data.artists.length;
    report.eventCount = data.artist.appearances.length;
    assert.equal(await page.locator('#video-viewer iframe').count(), 0, 'no eager iframe');
    for (const button of await page.locator('.content-reveal').all()) {
      if (await button.getAttribute('aria-expanded') !== 'true') {
        await button.click(); assert.equal(await button.getAttribute('aria-expanded'), 'true');
        await button.click(); assert.equal(await button.getAttribute('aria-expanded'), 'false');
        await button.click();
      }
    }
    for (const img of await page.locator('#photos img').all()) await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('#photos img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 60000 });
    report.photos = await page.locator('#photos img').evaluateAll(ns => ns.map(i => ({ src: i.currentSrc, width: i.naturalWidth, height: i.naturalHeight })));
    assert.ok(report.photos.length >= newFiles.length);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow ${width}`);
      for (const section of ['profile', 'schedule', 'photos', 'videos', 'news']) {
        const name = `${group}-${width}-${section}.png`;
        await page.locator('#' + section).screenshot({ path: path.join(out, name) });
        report.screenshots.push(name);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const photo of await page.locator('[data-photo-index]').all()) {
      await photo.click();
      await page.waitForFunction(() => { const i = document.querySelector('#photo-viewer-image'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 45000 });
      assert.equal(await page.locator('#photo-viewer').getAttribute('open'), '');
      assert.ok((await page.locator('#photo-viewer-source').getAttribute('href')).startsWith('https://'));
      await page.locator('.photo-viewer-close').click();
      await page.waitForFunction(() => !document.querySelector('#photo-viewer').open);
    }
    for (const video of await page.locator('[data-video-index]').all()) {
      await video.click();
      const original = await page.locator('#video-viewer-original').getAttribute('href');
      const embed = await page.locator('#video-viewer iframe').getAttribute('src');
      assert.ok(embed.includes(new URL(original).searchParams.get('v')));
      await page.locator('.video-viewer-close').click();
      await page.waitForFunction(() => document.querySelector('#video-viewer-player').childElementCount === 0);
      report.videos.push({ original, embed, mountedAndRemoved: true });
    }
    const links = await page.locator('#artist-root a[target="_blank"]').evaluateAll(ns => ns.map(a => ({ href: a.href, rel: a.rel })));
    for (const link of links) { assert.ok(link.href.startsWith('https://')); assert.match(link.rel, /noopener/); }
    report.linkCount = links.length;
    if (live) {
      report.deployedFiles = [];
      for (const file of ['artists.js', 'profiles.js', 'videos.js', 'artist.html', 'index.html']) {
        const response = await page.request.get(`${base}/features/fanpages/${file}`, { headers: { 'Cache-Control': 'no-cache' } });
        assert.equal(response.status(), 200);
        assert.equal(await response.text(), fs.readFileSync(path.join(root, 'features/fanpages', file), 'utf8'), `deployed source mismatch: ${file}`);
        report.deployedFiles.push(file);
      }
    }
    assert.deepEqual(errors, []);
    report.pageErrors = errors;
    report.result = 'passed';
    console.log(JSON.stringify(report, null, 2));
  } catch (e) { report.result = 'failed'; report.error = String(e.stack || e); throw e; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

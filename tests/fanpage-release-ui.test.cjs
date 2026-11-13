// Read-only release smoke test. Network images are never replaced with placeholders.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const live = process.env.FANPAGE_LIVE === 'true';
const out = path.join(__dirname, 'artifacts/fanpage-release', live ? 'public-site' : 'preview');
const base = live ? 'https://ojjuda.kr' : 'https://fan.test';
const group = process.env.FANPAGE_GROUP || 'rescene';
assert.match(group, /^[a-z0-9]+$/);
const context = vm.createContext({ window: {}, console });
for (const file of ['artists.js', 'artists-extra.js', 'videos.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'features/fanpages', file), 'utf8'), context, { filename: file });
}
const expectedArtist = context.window.OJJUDA_FAN_ARTISTS.find(a => a.id === group);
const expectedVideos = context.window.OJJUDA_FAN_VIDEOS[group] || [];
assert.ok(expectedArtist, 'group must exist in the reviewed checkout');
// Catalog cleaning fills absent fields and reorders properties; compare their facts.
const facts = (rows, keys) => (rows || []).map(row => Object.fromEntries(keys.map(key => [key, row[key] == null ? '' : String(row[key])])));
const videoFacts = rows => facts(rows, ['id', 'title', 'kind', 'source', 'file']);
// The licensed photo mirror emits canonical CC URLs without a trailing slash.
// Only that single optional slash is equivalent: author, version and license stay exact.
const canonicalLicenseUrl = value => /^https:\/\/creativecommons\.org\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)\/?$/.test(value) ? value.replace(/\/$/, '') : value;
const photoFacts = rows => facts(rows, ['href', 'label', 'meta', 'credit', 'license', 'licenseUrl']).map(row => ({ ...row, licenseUrl: canonicalLicenseUrl(row.licenseUrl) }));
assert.equal(canonicalLicenseUrl('https://creativecommons.org/licenses/by/1.0/'), canonicalLicenseUrl('https://creativecommons.org/licenses/by/1.0'));
for (const different of ['https://creativecommons.org/licenses/by/4.0/', 'https://creativecommons.org/licenses/by-sa/1.0/', 'http://creativecommons.org/licenses/by/1.0/', 'https://example.org/licenses/by/1.0/']) {
  assert.notEqual(canonicalLicenseUrl('https://creativecommons.org/licenses/by/1.0/'), canonicalLicenseUrl(different));
}
assert.notDeepEqual(photoFacts([{ credit: 'A' }]), photoFacts([{ credit: 'B' }]));
const eventFacts = rows => facts(rows, ['date', 'endDate', 'title', 'sub', 'href']);
assert.deepEqual(videoFacts([{ id: 'abcdefghijk', title: 'Test' }]), videoFacts([{ title: 'Test', id: 'abcdefghijk', file: '' }]));
assert.notDeepEqual(videoFacts([{ id: 'abcdefghijk' }]), videoFacts([{ id: '01234567890' }]));
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
    const data = await page.evaluate(id => {
      // Raw catalog values are pre-HTML-escaping, with the exact rendered catalogue overrides.
      const raw = window.OjjudaFanCatalog?.raw.get(id);
      return { artists: window.OJJUDA_FAN_ARTISTS.map(a => ({ id: a.id, name: a.name })), artist: raw?.artist || window.OJJUDA_FAN_ARTISTS.find(a => a.id === id), videos: raw?.videos || window.OJJUDA_FAN_VIDEOS[id] };
    }, group);
    assert.equal(data.artists.length, 30);
    assert.equal(new Set(data.artists.map(a => a.id)).size, 30);
    assert.equal(new Set(data.artists.map(a => a.name)).size, 30);
    assert.equal(JSON.stringify(videoFacts(data.videos)), JSON.stringify(videoFacts(expectedVideos)), 'rendered video data must match checkout');
    assert.equal(JSON.stringify(photoFacts(data.artist.photos)), JSON.stringify(photoFacts(expectedArtist.photos)), 'photo credits and original links must match checkout');
    assert.equal(JSON.stringify(eventFacts(data.artist.appearances)), JSON.stringify(eventFacts(expectedArtist.appearances)), 'event data must match checkout');
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
    assert.equal(report.photos.length, (expectedArtist.photos || []).length);
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
      for (const file of ['artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js', 'artist.html', 'index.html']) {
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

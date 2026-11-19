const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('note/preview.js');
const boot = source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(boot > 0, 'the production preview boot boundary exists');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1);
const cards = Array.from({ length: 12 }, (_, index) => ({
  id: id(20 + index), kind: index === 1 ? 'comment' : 'memo', body: '공원 산책에서 만난 작은 풍경',
  tags: ['공원에서산책해요', '오늘의풍경', '함께보는하루'], background_key: '42',
  created_at: '2026-11-20T00:00:00Z', is_mine: false, style: { font: 'default' }
}));
cards.push({ ...cards[0], id: id(40), body: '기존 사진도 그대로 보여요' });
const records = cards.map(card => ({ card_id: card.id, photo_path: `${user}/${card.id}.jpg`,
  video_path: card.id === id(40) ? null : `${user}/${card.id}.webm`, duration: 0.7, width: 160, height: 90 }));

function mockClient(records, user) {
  const calls = window.mediaCalls = { posters: [], videos: [] };
  const query = {};
  for (const method of ['select', 'eq', 'neq', 'is', 'not', 'in', 'contains', 'order', 'limit', 'lt', 'lte', 'gt', 'gte', 'or']) query[method] = () => query;
  query.maybeSingle = async () => ({ data: null });
  query.then = resolve => Promise.resolve({ data: [] }).then(resolve);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    rpc: async () => ({ data: null }), from: () => query,
    schema: () => ({ from: () => query, rpc: async (name, args) => ({
      data: name === 'card_media_paths' ? records.filter(record => args.p_ids.includes(record.card_id)) : []
    }) }),
    storage: { from(bucket) { return {
      async createSignedUrls(paths) {
        calls.posters.push({ bucket, paths });
        return { data: paths.map(value => ({ path: value, signedUrl: `https://media.test/posters/${value}` })) };
      },
      async createSignedUrl(value) {
        calls.videos.push({ bucket, path: value });
        return { data: { signedUrl: `https://media.test/videos/${value}` } };
      }
    }; } }
  };
  window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
  window.supabase = { createClient: () => client };
}

const setup = `
  authKnown = ready = true; session = { user: { id: ${JSON.stringify(user)} } };
  myIdentity = { gender: 'private' }; myIdentityReady = true; myGender = 'private';
  const fixtureCards = ${JSON.stringify(cards)};
  window.videoFixture = {
    async feed() {
      closePhotoLightbox(); feed.hidden = false; detail.hidden = true;
      document.getElementById('connection-status').hidden = true;
      list.replaceChildren(...fixtureCards.map(card => { cache.set(card.id, card); return cardElement(card); }));
      clearTimeout(cardPhotoTimer); await fetchCardPhotos();
    },
    detail() {
      closePhotoLightbox(); feed.hidden = true; detail.hidden = false;
      slot.replaceChildren(cardElement(fixtureCards[0], false, true));
      replies.replaceChildren(cardElement(fixtureCards[1], true));
      requestTagFit();
    }
  };
  window.videoFixture.feed();
`;
const html = read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</body>', () => `<script>(${mockClient})(${JSON.stringify(records)},${JSON.stringify(user)});\n${read('note/composer-tools.js')}\n${source.slice(0, boot)}\n${setup}</script></body>`);

// Create a tiny, playable fixture in Chromium itself. No real member upload or
// network service is used, and no opaque video binary needs to live in Git.
async function shortVideo(context) {
  const page = await context.newPage();
  try {
    return Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const paint = canvas.getContext('2d'), stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start();
      for (let frame = 0; frame < 8; frame++) {
        paint.fillStyle = frame % 2 ? '#347d83' : '#c3e2d1'; paint.fillRect(0, 0, 160, 90);
        paint.fillStyle = '#fff'; paint.fillRect(12 + frame * 13, 30, 20, 20);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    }));
  } finally { await page.close(); }
}

async function checkCircle(thumb, label) {
  await thumb.scrollIntoViewIfNeeded();
  const result = await thumb.evaluate(element => {
    const box = element.getBoundingClientRect(), frame = element.closest('.card-photo-frame').getBoundingClientRect();
    const tags = element.closest('article').querySelector('.card-tags'), tagBox = tags.getBoundingClientRect();
    const x = box.left + box.width / 2, top = Math.max(box.top, tagBox.top), bottom = Math.min(box.bottom, tagBox.bottom);
    const overlap = top < bottom && x >= tagBox.left && x <= tagBox.right;
    const hit = overlap ? document.elementFromPoint(x, (top + bottom) / 2) : null;
    return { width: box.width, height: box.height, right: frame.right - box.right, bottom: frame.bottom - box.bottom,
      lower: box.top > frame.top + frame.height / 2, radius: getComputedStyle(element).borderRadius,
      tagOffset: new DOMMatrix(getComputedStyle(tags).transform).m42, overlap,
      aboveTags: !!hit && (hit === element || element.contains(hit)) };
  });
  for (const [key, expected] of Object.entries({ width: 42, height: 42, right: 54, bottom: 12, tagOffset: 6 })) {
    assert.ok(Math.abs(result[key] - expected) <= 1, `${label}: ${key} ${JSON.stringify(result)}`);
  }
  assert.equal(result.lower, true, `${label}: the circle stays in the lower right`);
  assert.equal(result.radius, '50%', `${label}: attachment remains a circle`);
  assert.equal(result.overlap, true, `${label}: exercise the real overlapping tag row`);
  assert.equal(result.aboveTags, true, `${label}: the photo receives taps above the tags`);
}

test('Park video posters stay light, retain the lower-right circle and play only after a tap', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 850 }, hasTouch: true });
  const videoBytes = await shortVideo(context), requests = [];
  assert.ok(videoBytes.length > 100, 'the fixture contains an actual encoded video');
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'media.test') {
      requests.push(url.pathname);
      if (url.pathname.startsWith('/posters/')) return route.fulfill({ contentType: 'image/png', path: path.join(root, 'park/assets/icon-192.png') });
      if (url.pathname.startsWith('/videos/')) return route.fulfill({ contentType: 'video/webm', body: videoBytes });
    }
    if (url.hostname !== 'fixture.test') return route.abort();
    if (url.pathname === '/park/') return route.fulfill({ contentType: 'text/html', body: html });
    const file = path.resolve(root, `.${url.pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
    return route.fulfill({ path: file });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://fixture.test/park/?embedded=1');
  const first = page.locator(`#feed-list [data-photo-card="${id(20)}"]`);
  await first.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#feed-list .card-photo-thumb img')?.naturalWidth > 0);
  assert.equal(await page.locator('#feed-list video,#feed-list source').count(), 0);
  assert.equal(await page.locator('#feed-list [data-media-kind="video"] .card-video-badge').count(), 12);
  assert.equal(await page.locator('#feed-list [data-media-kind="photo"] .card-video-badge').count(), 0);
  assert.equal(await page.evaluate(() => mediaCalls.videos.length), 0);
  assert.equal(requests.filter(value => value.startsWith('/videos/')).length, 0, 'rendering a whole feed downloads no video bytes');

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await checkCircle(first, `${width}px feed`);
    await page.evaluate(() => videoFixture.detail());
    await checkCircle(page.locator('#detail-card-slot .card-photo-thumb'), `${width}px detail`);
    await checkCircle(page.locator('#reply-list .card-photo-thumb'), `${width}px compact reply`);
    await page.evaluate(() => videoFixture.feed());
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await first.click();
  const box = page.locator('.note-photo-lightbox'), video = box.locator('video');
  await video.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const video = document.querySelector('.note-photo-lightbox video');
    return video?.readyState >= 2 && video.currentTime > 0;
  });
  const active = await video.evaluate(element => ({ controls: element.controls, inline: element.playsInline,
    preload: element.preload, width: element.videoWidth, height: element.videoHeight }));
  assert.equal(active.controls, true); assert.equal(active.inline, true); assert.equal(active.preload, 'none');
  assert.equal(active.width, 160); assert.equal(active.height, 90);
  assert.deepEqual(await page.evaluate(() => mediaCalls.videos), [{ bucket: 'note-card-videos', path: records[0].video_path }]);
  assert.deepEqual([...new Set(requests.filter(value => value.startsWith('/videos/')))], [`/videos/${records[0].video_path}`]);
  await video.click({ position: { x: 24, y: 24 } });
  assert.equal(await box.isVisible(), true, 'using the native player does not dismiss the lightbox');
  if (process.env.PARK_VIDEO_PROOF_DIR) {
    fs.mkdirSync(process.env.PARK_VIDEO_PROOF_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.PARK_VIDEO_PROOF_DIR, 'video-player-390.png') });
  }
  await page.keyboard.press('Escape');
  assert.equal(await box.isVisible(), false);
  assert.deepEqual(await video.evaluate(element => ({ paused: element.paused, src: element.getAttribute('src'), poster: element.getAttribute('poster') })),
    { paused: true, src: null, poster: null });

  const videoRequestCount = requests.filter(value => value.startsWith('/videos/')).length;
  await page.locator(`#feed-list [data-photo-card="${id(40)}"]`).click();
  assert.equal(await box.locator('img').isVisible(), true, 'existing photo opens in the same viewer');
  assert.equal(await video.isVisible(), false);
  assert.equal(requests.filter(value => value.startsWith('/videos/')).length, videoRequestCount);
  await box.locator('button').click();
  assert.equal(await box.isVisible(), false);
  assert.deepEqual(errors, [], 'the real Park rendering and media lifecycle produce no page errors');
});

// Real browser codec tests. The fixtures are generated locally, never uploaded.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://park-video.test';

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 30_000, stdio: 'pipe' });
}

function rotateFixture(source, destination) {
  const help = execFileSync('ffmpeg', ['-hide_banner', '-h', 'full'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  ffmpeg(help.includes('-display_rotation')
    ? ['-display_rotation:v:0', '90', '-i', source, '-c', 'copy', destination]
    : ['-i', source, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', destination]);
}

async function prepare(page, fixture) {
  await page.locator('#pick').setInputFiles(fixture);
  return page.evaluate(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const events = [];
    try {
      const result = await window.cardVideo.prepareCardVideo(document.getElementById('pick').files[0], {
        signal: controller.signal, onProgress: event => events.push(event),
      });
      window.preparedVideo = result;
      const image = await createImageBitmap(result.posterBlob);
      const poster = { width: image.width, height: image.height, bytes: result.posterBlob.size, type: result.posterBlob.type };
      image.close();
      const media = await import('/note/vendor/mediabunny-1.66.2.mjs');
      const input = new media.Input({ source: new media.BlobSource(result.blob), formats: [media.MP4] });
      try {
        const video = await input.getPrimaryVideoTrack();
        const audio = await input.getPrimaryAudioTrack();
        const stats = await video.computePacketStats();
        return {
          width: result.width, height: result.height, duration: result.duration, bytes: result.blob.size,
          originalBytes: result.originalBytes, method: result.method, poster,
          hasAudio: result.hasAudio, videoCodec: await video.getCodec(),
          audioCodec: audio ? await audio.getCodec() : null,
          sampleRate: audio ? await audio.getSampleRate() : null,
          channels: audio ? await audio.getNumberOfChannels() : null,
          rotation: await video.getRotation(), frameRate: stats.averagePacketRate, events,
          remainingPosterElements: document.querySelectorAll('video').length,
        };
      } finally { input.dispose(); }
    } finally { clearTimeout(timeout); }
  });
}

async function decodeResult(page, dir, name) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(window.preparedVideo.blob);
      link.download = 'prepared.mp4';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }),
  ]);
  const filename = path.join(dir, name);
  await download.saveAs(filename);
  ffmpeg(['-i', filename, '-f', 'null', '-']);
}

function assertOutput(result) {
  assert.ok(result.duration > 0 && result.duration < 60);
  assert.ok(result.bytes <= 20 * 1024 * 1024);
  assert.ok(Math.max(result.width, result.height) <= 1280);
  assert.ok(Math.min(result.width, result.height) <= 720);
  assert.ok(result.frameRate <= 30.1, `unexpected frame rate ${result.frameRate}`);
  assert.equal(result.videoCodec, 'avc');
  assert.equal(result.hasAudio, true);
  assert.equal(result.audioCodec, 'aac');
  assert.ok(result.sampleRate <= 48000 && result.channels <= 2);
  assert.equal(result.poster.type, 'image/jpeg');
  assert.ok(result.poster.bytes > 100 && result.poster.bytes <= 512 * 1024);
  assert.ok(Math.max(result.poster.width, result.poster.height) <= 512);
  assert.equal(result.remainingPosterElements, 0, 'temporary decoder element must be removed');
  assert.equal(result.events.at(-1).phase, 'done');
  assert.equal(result.events.at(-1).progress, 1);
  assert.ok(result.events.every((event, index) => !index || event.progress >= result.events[index - 1].progress));
}

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'park-video-browser-'));
  let browser;
  try {
    const small = path.join(dir, 'small.mp4');
    const portrait = path.join(dir, 'portrait.mov');
    const large = path.join(dir, 'large.mp4');
    const webm = path.join(dir, 'opus.webm');
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1.25',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', small]);
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=60',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1.25',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', large]);
    rotateFixture(large, portrait);
    ffmpeg(['-i', small, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
      '-c:a', 'libopus', '-b:a', '80k', webm]);

    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ acceptDownloads: true });
    const requests = [];
    let forceAacFallback = false;
    await context.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      if (url.pathname === '/') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><input id="pick" type="file">' });
        return;
      }
      const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!filename.startsWith(root + path.sep)) { await route.fulfill({ status: 403, body: '' }); return; }
      try {
        let body = await fs.readFile(filename);
        if (forceAacFallback && url.pathname.endsWith('/card-video-worker.js')) {
          // Exercise the supported-browser/native-AAC-missing branch with real WASM.
          body = Buffer.concat([Buffer.from('self.AudioEncoder = undefined;\n'), body]);
        }
        await route.fulfill({ contentType: /\.m?js$/.test(filename) ? 'text/javascript' : 'application/octet-stream', body });
      } catch { await route.fulfill({ status: 404, body: 'not found' }); }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(70_000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin);
    await page.evaluate(async () => { window.cardVideo = await import('/note/card-video.js'); });
    assert.ok(!requests.some(url => url.includes('/vendor/')), 'importing helper must not load media libraries');

    const copied = await prepare(page, small);
    assertOutput(copied);
    assert.equal(copied.method, 'remux');
    assert.equal(copied.width, 640);
    assert.equal(copied.height, 360);
    assert.ok(!requests.some(url => url.includes('aac-encoder')), 'AAC copy must not fetch the fallback encoder');
    await decodeResult(page, dir, 'copied.mp4');

    const landscape = await prepare(page, large);
    assertOutput(landscape);
    assert.equal(landscape.method, 'transcode');
    assert.equal(landscape.width, 1280);
    assert.equal(landscape.height, 720);
    assert.ok(landscape.bytes < landscape.originalBytes, 'large high-rate source must get smaller');
    await decodeResult(page, dir, 'landscape.mp4');

    const tall = await prepare(page, portrait);
    assertOutput(tall);
    assert.equal(tall.method, 'transcode');
    assert.equal(tall.width, 720);
    assert.equal(tall.height, 1280);
    assert.equal(tall.rotation, 0, 'transcoded rotation is baked into the picture');
    assert.ok(tall.poster.width < tall.poster.height, 'poster keeps the visible phone orientation');
    await decodeResult(page, dir, 'portrait.mp4');

    forceAacFallback = true;
    const fallback = await prepare(page, webm);
    assertOutput(fallback);
    assert.equal(fallback.method, 'transcode');
    assert.ok(requests.some(url => url.includes('aac-encoder')), 'missing native AAC loads only the AAC fallback');
    await decodeResult(page, dir, 'fallback.mp4');
    forceAacFallback = false;

    await page.locator('#pick').setInputFiles(large);
    const cancelled = await page.evaluate(async () => {
      const controller = new AbortController();
      let done = false;
      try {
        await window.cardVideo.prepareCardVideo(document.getElementById('pick').files[0], {
          signal: controller.signal,
          onProgress(event) {
            if (event.phase === 'processing') controller.abort();
            if (event.phase === 'done') done = true;
          },
        });
        return { error: '', done };
      } catch (error) { return { error: error.name, done, videos: document.querySelectorAll('video').length }; }
    });
    assert.deepEqual(cancelled, { error: 'AbortError', done: false, videos: 0 });
    assert.deepEqual(pageErrors, []);
    console.log('Park real video: H.264 resize, 60→30fps, portrait rotation, AAC/Opus sound, AAC WASM fallback, JPEG poster, cancellation passed.');
  } finally {
    await browser?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

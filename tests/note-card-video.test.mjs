import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CARD_VIDEO_LIMITS, createCardVideoPlan, fitCardVideoDimensions,
  prepareCardVideo, prepareCardVideoData,
} from '../note/card-video.js';
import { Input, BlobSource, MP4 } from '../note/vendor/mediabunny-1.66.2.mjs';

const base = {
  duration: 20, width: 1280, height: 720, codedWidth: 1280, codedHeight: 720,
  videoCodec: 'avc', codecString: 'avc1.64001f', hdr: false,
  frameRate: 30, maxFrameRate: 30, bestGuessFrameRate: 30,
  hasAudio: true, audioCodec: 'aac', audioChannels: 2, audioSampleRate: 44100, audioBitrate: 128_000,
};

test('fits landscape, portrait, square and unusual ratios without enlarging or cropping', () => {
  assert.deepEqual(fitCardVideoDimensions(3840, 2160), { width: 1280, height: 720 });
  assert.deepEqual(fitCardVideoDimensions(2160, 3840), { width: 720, height: 1280 });
  assert.deepEqual(fitCardVideoDimensions(1080, 1080), { width: 720, height: 720 });
  assert.deepEqual(fitCardVideoDimensions(4096, 1024), { width: 1280, height: 320 });
  assert.deepEqual(fitCardVideoDimensions(320, 241), { width: 320, height: 240 });
  assert.throws(() => fitCardVideoDimensions(NaN, 400), { code: 'invalid_video' });
});

test('copies compatible H.264/AAC but encodes oversized, high-rate, HDR or incompatible codecs', () => {
  const copy = createCardVideoPlan(base, 4 * 1024 * 1024);
  assert.equal(copy.method, 'remux');
  for (const changes of [
    { width: 1920, height: 1080 }, { codedWidth: 1920, codedHeight: 1080 },
    { frameRate: 60, maxFrameRate: 60 }, { maxFrameRate: 60 },
    { videoCodec: 'hevc', codecString: 'hvc1.1.6.L93.B0' },
    { codecString: 'avc1.6e001f' }, { hdr: true },
  ]) {
    assert.equal(createCardVideoPlan({ ...base, ...changes }, 4 * 1024 * 1024).copyVideo, false);
  }
  assert.equal(createCardVideoPlan(base, 19 * 1024 * 1024).copyVideo, false, 'short high-bitrate videos must shrink too');
  const resize = createCardVideoPlan({ ...base, width: 2160, height: 3840 }, 4 * 1024 * 1024);
  assert.equal(resize.copyAudio, true, 'native AAC encoder is unnecessary when AAC can be copied');
  assert.equal(createCardVideoPlan({ ...base, audioCodec: 'opus' }, 4 * 1024 * 1024).copyAudio, false);
  assert.equal(createCardVideoPlan({ ...base, hasAudio: false }, 4 * 1024 * 1024).method, 'remux');
});

test('duration boundary is strictly below 60 seconds and invalid lengths fail clearly', () => {
  assert.equal(createCardVideoPlan({ ...base, duration: 59.999 }, 4 * 1024 * 1024).method, 'remux');
  for (const duration of [60, 60.001, 90]) {
    assert.throws(() => createCardVideoPlan({ ...base, duration }, 1000), { code: 'too_long' });
  }
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.throws(() => createCardVideoPlan({ ...base, duration }, 1000), { code: 'invalid_video' });
  }
});

test('oversized originals and already-cancelled work stop before loading codecs', async () => {
  await assert.rejects(prepareCardVideo({ size: CARD_VIDEO_LIMITS.maxInputBytes + 1, slice() {}, arrayBuffer() {} }),
    { code: 'input_too_large' });
  await assert.rejects(prepareCardVideo(new Blob()), { code: 'invalid_file' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(prepareCardVideo(new Blob(['video']), { signal: controller.signal }), { name: 'AbortError' });
});

test('cancelling worker preparation terminates codec work immediately', async () => {
  const oldWorker = globalThis.Worker;
  const oldCanvas = globalThis.OffscreenCanvas;
  let terminated = 0;
  class WorkerStub {
    postMessage() { queueMicrotask(() => this.onmessage({ data: { type: 'started' } })); }
    terminate() { terminated++; }
  }
  globalThis.Worker = WorkerStub;
  globalThis.OffscreenCanvas = class {};
  try {
    const controller = new AbortController();
    const job = prepareCardVideo(new Blob(['video']), { signal: controller.signal });
    controller.abort();
    await assert.rejects(job, { name: 'AbortError' });
    assert.equal(terminated, 1);
  } finally {
    if (oldWorker === undefined) delete globalThis.Worker; else globalThis.Worker = oldWorker;
    if (oldCanvas === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = oldCanvas;
  }
});

let hasFfmpeg = false;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); hasFfmpeg = true; } catch { /* Optional fixture generator. */ }

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 30_000, stdio: 'pipe' });
}

function rotateFixture(source, destination) {
  const help = execFileSync('ffmpeg', ['-hide_banner', '-h', 'full'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  // Older FFmpeg releases use the metadata form; recent releases use the explicit
  // input option. Feature detection avoids depending on the runner's apt version.
  runFfmpeg(help.includes('-display_rotation')
    ? ['-display_rotation:v:0', '90', '-i', source, '-c', 'copy', destination]
    : ['-i', source, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', destination]);
}

function topLevelBoxes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset);
    names.push(Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString('ascii'));
    assert.ok(size >= 8, 'short fixtures use ordinary bounded boxes');
    offset += size;
  }
  return names;
}

test('real MP4 remux is fast-start, retains sound and phone rotation, and removes source tags', { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'park-video-'));
  try {
    const originalPath = path.join(dir, 'original.mp4');
    const rotatedPath = path.join(dir, 'rotated.mp4');
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1.25',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-metadata', 'title=private-source-title',
      '-metadata', 'location=+37.0000+127.0000/', originalPath]);
    rotateFixture(originalPath, rotatedPath);
    const source = new Blob([await readFile(rotatedPath)], { type: 'video/mp4' });
    const progress = [];
    const result = await prepareCardVideoData(source, { onProgress: value => progress.push(value) });
    assert.equal(result.method, 'remux');
    assert.equal(result.mimeType, 'video/mp4');
    assert.equal(result.hasAudio, true);
    assert.equal(result.width, 360);
    assert.equal(result.height, 640);
    assert.ok(result.duration > 1.2 && result.duration < 1.35);
    assert.ok(result.blob.size < CARD_VIDEO_LIMITS.maxOutputBytes);
    assert.ok(progress.every((event, index) => index === 0 || event.progress >= progress[index - 1].progress));
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const boxes = topLevelBoxes(bytes);
    assert.ok(boxes.indexOf('moov') < boxes.indexOf('mdat'), 'MP4 index must precede media for fast playback');
    assert.ok(!boxes.includes('moof'), 'ordinary progressive MP4 is interoperable with native players');
    const input = new Input({ source: new BlobSource(result.blob), formats: [MP4] });
    const original = new Input({ source: new BlobSource(source), formats: [MP4] });
    try {
      const [video, oldVideo, audio] = await Promise.all([
        input.getPrimaryVideoTrack(), original.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(),
      ]);
      assert.equal(await video.getRotation(), await oldVideo.getRotation());
      assert.equal(await video.getCodec(), 'avc');
      assert.equal(await audio.getCodec(), 'aac');
      const tags = await input.getMetadataTags();
      assert.equal(tags.title, undefined);
      assert.ok(!JSON.stringify(tags).includes('37.0000'));
      const outputPath = path.join(dir, 'prepared.mp4');
      await writeFile(outputPath, bytes);
      runFfmpeg(['-i', outputPath, '-f', 'null', '-']); // Independently decode video + audio.
    } finally { input.dispose(); original.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real 60-second media and corrupt files cannot reach upload preparation', { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'park-video-limit-'));
  try {
    const fullMinute = path.join(dir, 'minute.mp4');
    runFfmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=1:d=60',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', fullMinute]);
    await assert.rejects(prepareCardVideoData(new Blob([await readFile(fullMinute)])), { code: 'too_long' });
    await assert.rejects(prepareCardVideoData(new Blob(['not a media file'], { type: 'video/mp4' })), { code: 'invalid_video' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

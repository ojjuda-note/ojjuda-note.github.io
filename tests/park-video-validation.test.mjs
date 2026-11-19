import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import * as mediabunny from '../note/vendor/mediabunny-1.66.2.mjs';
import { createVideoValidator, inspectJpeg, inspectMp4Structure, inspectTransform, inspectPosterAspect } from '../supabase/functions/park-video/validation.mjs';
import { generateParkVideoFixtures } from './generate-park-video-fixtures.mjs';

test('server validates real MP4 packets, AVC headers and private JPEG sidecars', async () => {
  const dir = await generateParkVideoFixtures(), validate = createVideoValidator(mediabunny);
  try {
    const bytes = name => readFile(join(dir, name));
    const valid = await bytes('valid.mp4'), poster = await bytes('poster.jpg');
    const result = await validate(valid, poster);
    assert.equal(result.width, 320); assert.equal(result.height, 180);
    assert.equal(result.duration, 1.25); assert.equal(result.bytes, valid.length);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    const portrait = await validate(await bytes('portrait.mp4'), await bytes('portrait.jpg'));
    assert.equal(portrait.width, 180); assert.equal(portrait.height, 320);
    for (const name of ['sixty-seconds.mp4', 'sixty-fps.mp4', 'two-video-tracks.mp4', 'hd.mp4'])
      await assert.rejects(validate(await bytes(name), poster), /video_duration|video_framerate|video_tracks|video_dimensions/);

    // Shrinking the container's avc1 dimensions does not hide the real SPS size.
    const forged = Buffer.from(valid), avc1 = forged.indexOf(Buffer.from('avc1'), forged.indexOf(Buffer.from('stsd')));
    assert.ok(avc1 > 0); forged.writeUInt16BE(160, avc1 + 28); forged.writeUInt16BE(90, avc1 + 30);
    await assert.rejects(validate(forged, poster), /avc_dimensions/);
    const scaled = Buffer.from(valid), tkhd = scaled.indexOf(Buffer.from('tkhd'));
    assert.ok(tkhd > 0); scaled.writeInt32BE(2 * 65536, tkhd + 44);
    await assert.rejects(validate(scaled, poster), /video_transform/);
    // A false mvhd duration cannot override packet timestamps/sample tables.
    const long = Buffer.from(await bytes('sixty-seconds.mp4')), mvhd = long.indexOf(Buffer.from('mvhd'));
    long.writeUInt32BE(1, mvhd + 20);
    await assert.rejects(validate(long, poster), /video_duration/);
    assert.throws(() => inspectMp4Structure(valid.subarray(0, 100)), /mp4_size/);
    assert.throws(() => inspectJpeg(new Uint8Array([255, 216, 255, 217])), /poster_type/);
    await assert.rejects(validate(valid, await bytes('portrait.jpg')), /poster_aspect/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('raw video matrices allow quarter turns/flips and reject hidden scale, shear and perspective', () => {
  for (const matrix of [[1, 0, 0, 0, 1, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 640, 0, 1], [-1, 0, 0, 0, 1, 0, 1280, 0, 1]])
    assert.doesNotThrow(() => inspectTransform(matrix));
  for (const matrix of [[2, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0.2, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0.001, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, Infinity, 0, 1],
    [Math.SQRT1_2, -Math.SQRT1_2, 0, Math.SQRT1_2, Math.SQRT1_2, 0, 0, 0, 1]])
    assert.throws(() => inspectTransform(matrix), /video_transform/);
});

test('poster matching tolerates integer pixels in panoramic and narrow videos', () => {
  assert.doesNotThrow(() => inspectPosterAspect({ width: 512, height: 43 }, 1280, 108));
  assert.doesNotThrow(() => inspectPosterAspect({ width: 1, height: 512 }, 2, 1280));
  assert.doesNotThrow(() => inspectPosterAspect({ width: 288, height: 512 }, 720, 1280));
  assert.throws(() => inspectPosterAspect({ width: 512, height: 48 }, 1280, 108), /poster_aspect/);
  assert.throws(() => inspectPosterAspect({ width: 512, height: 288 }, 720, 1280), /poster_aspect/);
});

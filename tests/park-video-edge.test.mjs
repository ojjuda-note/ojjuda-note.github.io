import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHandler } from '../supabase/functions/park-video/handler.mjs';
import { VideoValidationError } from '../supabase/functions/park-video/validation.mjs';

const user = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const photo = `${user}/${id}.jpg`, video = `${user}/${id}.mp4`;
const config = { SUPABASE_URL: 'https://project.example', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service-secret' };
const valid = { duration: 1.25, width: 320, height: 180, bytes: 3, sha256: 'a'.repeat(64) };
const request = (body = { poster_path: photo, video_path: video }, options = {}) => new Request('https://edge.example/park-video', {
  method: 'POST', headers: { authorization: 'Bearer user-token', origin: 'https://ojjuda.kr', 'content-type': 'application/json', ...options }, body: JSON.stringify(body) });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fixture({ authUser = user, invalid = false, changed = false, cached = false } = {}) {
  const calls = [], verified = { ok: true, photo_path: photo, video_path: video, ...valid };
  let validations = 0;
  const handler = createHandler({ env: key => config[key],
    validate: async (v, p) => { validations++; assert.deepEqual([...v], [1, 2, 3]); assert.deepEqual([...p], [4, 5]); if (invalid) throw new VideoValidationError('video_duration'); return valid; },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return json({ id: authUser });
      if (url.endsWith('/prepare_card_video_validation')) return json(cached ? { verified } : { photo_object_id: 'poster-id', video_object_id: 'video-id', photo_bytes: 2, video_bytes: 3 });
      if (url.includes('/object/authenticated/note-card-videos/')) return new Response(new Uint8Array([1, 2, 3]));
      if (url.includes('/object/authenticated/note-card-photos/')) return new Response(new Uint8Array([4, 5]));
      if (url.endsWith('/register_verified_card_video')) return changed ? json({ code: '40001' }, 409) : json(verified);
      throw new Error('unexpected request');
    } });
  return { handler, calls, validations: () => validations };
}

test('Edge authenticates before downloads; only service-authenticated binary result mints receipt', async () => {
  const f = fixture(), response = await f.handler(request());
  assert.equal(response.status, 200); assert.equal((await response.json()).video_path, video);
  const commit = f.calls.find(x => x.url.endsWith('/register_verified_card_video'));
  assert.equal(commit.options.headers.Authorization, 'Bearer eyJ.service-secret');
  assert.equal(commit.options.headers['Content-Profile'], 'ojjuda_note');
  const body = JSON.parse(commit.options.body);
  assert.equal(body.p_user_id, user); assert.equal(body.p_duration, 1.25); assert.equal(body.p_video_object_id, 'video-id');
  assert.equal(f.validations(), 1);
  assert.ok(f.calls.filter(x => x.url.includes('/object/')).every(x => x.options.headers.Authorization === 'Bearer user-token'));
});

test('Cross-account, mismatched filenames, browser metadata and invalid files cannot mint receipts', async () => {
  const other = fixture({ authUser: id }); assert.equal((await other.handler(request())).status, 403); assert.equal(other.calls.length, 1);
  const mismatch = fixture(); assert.equal((await mismatch.handler(request({ poster_path: photo, video_path: `../${id}.mp4` }))).status, 400); assert.equal(mismatch.calls.length, 0);
  const invalid = fixture({ invalid: true }); const failure = await invalid.handler(request({ poster_path: photo, video_path: video, duration: 0.01, width: 1 }));
  assert.equal(failure.status, 400); assert.equal((await failure.json()).code, 'invalid_video');
  assert.ok(!invalid.calls.some(x => x.url.endsWith('/register_verified_card_video')));
  const changed = fixture({ changed: true }); assert.equal((await changed.handler(request())).status, 409);
});

test('Successful immutable retries reuse verified receipt without re-downloading media', async () => {
  const f = fixture({ cached: true }); assert.equal((await f.handler(request())).status, 200);
  assert.equal(f.calls.length, 2); assert.equal(f.validations(), 0);
  const noAuth = fixture(); assert.equal((await noAuth.handler(request(undefined, { authorization: '' }))).status, 401);
  const origin = fixture(); assert.equal((await origin.handler(request(undefined, { origin: 'https://foreign.invalid' }))).status, 403);
});

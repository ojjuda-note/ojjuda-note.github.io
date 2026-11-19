const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../note/card-video-upload.js'), 'utf8')
  .replace(/^import .*;\n/m, '').replace(/export (?=(?:async )?function)/g, '');
const USER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

function fixture({ transfer, validate, posterError } = {}) {
  const calls = [], state = { user: USER, token: 'current-token' };
  class Upload {
    constructor(blob, options) { this.blob = blob; this.options = options; state.upload = this; }
    async findPreviousUploads() { return [{ uploadUrl: 'https://storage.test/resume' }]; }
    resumeFromPreviousUpload(previous) { calls.push(['resume', previous.uploadUrl]); }
    async abort() { calls.push(['abort']); }
    start() {
      calls.push(['start']);
      Promise.resolve().then(async () => {
        await this.options.onBeforeRequest({ setHeader: (name, value) => calls.push(['header', name, value]) });
        if (transfer) return transfer(this, state);
        this.options.onProgress(this.blob.size, this.blob.size);
        this.options.onSuccess();
      }).catch(error => this.options.onError(error));
    }
  }
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: state.user }, access_token: state.token } } }; } },
    storage: { from(bucket) { return { async upload(object, blob, options) {
      calls.push(['poster', bucket, object, blob.type, options.upsert]); return { error: posterError || null };
    } }; } },
    functions: { async invoke(name, options) {
      calls.push(['validate', name, options.body]);
      return validate ? validate(options.body) : { data: { ok: true, photo_path: options.body.poster_path, video_path: options.body.video_path } };
    } },
  };
  const context = vm.createContext({ Upload, URL, DOMException, console });
  vm.runInContext(source, context);
  const controller = new AbortController();
  const args = { client, supabaseUrl: 'https://exampleproject.supabase.co', userId: USER, requestId: REQUEST,
    video: { blob: new Blob(['video bytes'], { type: 'video/mp4' }) },
    posterBlob: new Blob(['jpeg'], { type: 'image/jpeg' }), signal: controller.signal,
    onProgress: progress => calls.push(['progress', progress.phase, progress.progress]) };
  return { context, calls, state, args, controller, run: () => context.uploadCardVideo(args) };
}

test('video uploads resume with fresh credentials, then validate both immutable files', async () => {
  const f = fixture();
  assert.equal(await f.run(), `${USER}/${REQUEST}.jpg`);
  assert.equal(f.state.upload.options.endpoint, 'https://exampleproject.storage.supabase.co/storage/v1/upload/resumable');
  assert.equal(f.state.upload.options.chunkSize, 6 * 1024 * 1024);
  assert.equal(f.state.upload.options.removeFingerprintOnSuccess, true);
  assert.ok(f.calls.some(call => call[0] === 'resume'));
  assert.ok(f.calls.some(call => call[0] === 'header' && call[2] === 'Bearer current-token'));
  const posterIndex = f.calls.findIndex(call => call[0] === 'poster');
  const validateIndex = f.calls.findIndex(call => call[0] === 'validate');
  assert.ok(posterIndex > f.calls.findIndex(call => call[0] === 'start'));
  assert.ok(validateIndex > posterIndex);
  assert.equal(f.calls[posterIndex][4], false, 'never overwrite an immutable attachment');
  assert.equal(f.calls[validateIndex][2].video_path, `${USER}/${REQUEST}.mp4`);
  assert.equal(f.context.resumableEndpoint('http://localhost:54321'), 'http://localhost:54321/storage/v1/upload/resumable');
});

test('account changes during transfer cannot validate or publish under the next account', async () => {
  const f = fixture({ transfer(upload, state) { state.user = REQUEST; upload.options.onSuccess(); } });
  await assert.rejects(f.run(), /계정이 변경/);
  assert.equal(f.calls.some(call => call[0] === 'poster' || call[0] === 'validate'), false);
});

test('cancelling a running upload aborts TUS and leaves no publishable result', async () => {
  let reached;
  const started = new Promise(resolve => { reached = resolve; });
  const f = fixture({ transfer() { reached(); } });
  const result = f.run();
  await started; f.controller.abort();
  await assert.rejects(result, error => error.name === 'AbortError');
  assert.equal(f.calls.filter(call => call[0] === 'abort').length, 1);
  assert.equal(f.calls.some(call => call[0] === 'validate'), false);
});

test('a server validation rejection does not return a photo path', async () => {
  const f = fixture({ validate: async () => ({ error: { context: { json: async () => ({ message: '1분 미만 영상을 골라 주세요.' }) } } }) });
  await assert.rejects(f.run(), /1분 미만/);
});

test('retries after lost success responses revalidate existing files without overwriting', async () => {
  const f = fixture({ transfer(upload) { upload.options.onError({ originalResponse: { getStatus: () => 409 } }); },
    posterError: { statusCode: '409', message: 'already exists' } });
  assert.equal(await f.run(), `${USER}/${REQUEST}.jpg`);
  assert.equal(f.calls.filter(call => call[0] === 'validate').length, 1);
});

test('invalid output files cannot begin a transfer', async () => {
  const f = fixture(); f.args.video.blob = { type: 'video/mp4', size: 20 * 1024 * 1024 + 1 };
  await assert.rejects(f.run(), /영상 정보/);
  assert.equal(f.calls.length, 0);
});

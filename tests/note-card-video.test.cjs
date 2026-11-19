const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('note/preview.js');
const boot = source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(boot > 0, 'the production preview boot boundary exists');
const html = read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1), NEXT_USER = id(2);
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(t, { records = [] } = {}) {
  const dom = new JSDOM(html, { url: 'https://park-video.test/park/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom, document = window.document;
  const run = code => new vm.Script(code).runInContext(dom.getInternalVMContext());
  t.after(() => window.close());
  window.confirm = () => true;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const calls = { rpc: [], posters: [], videos: [], uploads: [], removed: [], plays: [], pauses: [], loads: [], created: [], revoked: [] };
  const mediaState = new WeakMap();
  window.HTMLMediaElement.prototype.play = function () {
    calls.plays.push(this); mediaState.set(this, false); return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function () { calls.pauses.push(this); mediaState.set(this, true); };
  window.HTMLMediaElement.prototype.load = function () { calls.loads.push(this); mediaState.set(this, true); };
  Object.defineProperty(window.HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return mediaState.get(this) !== false; } });
  window.URL.createObjectURL = blob => {
    const url = `blob:https://park-video.test/${calls.created.length + 1}`;
    calls.created.push({ blob, url }); return url;
  };
  window.URL.revokeObjectURL = url => calls.revoked.push(url);
  let signVideo = async () => null;
  const query = {};
  for (const method of ['select', 'eq', 'neq', 'is', 'not', 'in', 'contains', 'order', 'limit', 'lt', 'lte', 'gt', 'gte', 'or', 'abortSignal']) query[method] = () => query;
  query.maybeSingle = async () => ({ data: null });
  query.then = resolve => Promise.resolve({ data: [] }).then(resolve);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: run('session?.user?.id') } } }) },
    from: () => query,
    rpc: async () => ({ data: null }),
    schema: () => ({ from: () => query, async rpc(name, args = {}) {
      calls.rpc.push({ name, args: plain(args) });
      if (name === 'card_media_paths') return { data: records.filter(row => args.p_ids.includes(row.card_id)) };
      if (name === 'get_note_state') return { data: {} };
      return { data: [] };
    } }),
    storage: { from(bucket) { return {
      async createSignedUrls(paths) {
        calls.posters.push({ bucket, paths: [...paths] });
        return { data: paths.map(value => ({ path: value, signedUrl: `https://media.test/posters/${value}?signed=poster` })) };
      },
      async createSignedUrl(value, seconds) {
        calls.videos.push({ bucket, path: value, seconds });
        const custom = await signVideo(value);
        return custom || { data: { signedUrl: `https://media.test/videos/${value}?signed=video` } };
      },
      async upload(value, blob, options) { calls.uploads.push({ bucket, path: value, blob, options }); return { error: null }; },
      async remove(paths) { calls.removed.push({ bucket, paths: [...paths] }); return { error: null }; }
    }; } }
  };
  window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
  window.supabase = { createClient: () => client };
  run(read('note/composer-tools.js'));
  run(source.slice(0, boot));
  // JSDOM has no layout or real feed service. Keep the actual attachment, editor,
  // identity-reset and lightbox logic; only these unrelated services are inert.
  run(`composerPhotoOverflows = () => false; cardPhotoOverflows = () => false;
    resizeComposerText = () => {}; syncComposeInk = () => {};
    loadFeed = async () => {}; loadWorldBalance = async () => {};
    loadNoteState = async () => {}; loadAccountProfile = async () => {};
    session = { user: { id: ${JSON.stringify(USER)} } }; composerUserId = ${JSON.stringify(USER)};
    authKnown = ready = true; noteState = { is_restricted: false };
    myIdentity = { gender: 'private' }; myIdentityReady = true; myGender = 'private';
    backgroundKey = '42'; publishRequestId = ${JSON.stringify(id(9))};
    writingPosition = { latitude: 37, longitude: 127 };
    text.value = '오늘 산책에서 찍었어요'; tags.value = '';
    document.querySelector('input[name="gender"][value="private"]').checked = true;`);
  const card = (number, kind = 'memo') => ({ id: id(number), kind, body: '오늘의 작은 이야기', tags: ['산책', '하루'],
    background_key: '42', created_at: '2026-11-20T00:00:00Z', is_mine: false, style: { font: 'default' } });
  async function render(cards) {
    window.__videoTestCards = cards;
    run('list.replaceChildren(...window.__videoTestCards.map(card => { cache.set(card.id, card); return cardElement(card); }));');
    await run('clearTimeout(cardPhotoTimer); fetchCardPhotos()');
    await settle();
  }
  async function flush() { for (let i = 0; i < 5; i++) await settle(); }
  function compose() { run('backdrop.hidden = false; setComposerInputs(); updateComposer();'); }
  function prepared() {
    return { blob: new window.Blob(['encoded video'], { type: 'video/mp4' }),
      posterBlob: new window.Blob(['poster'], { type: 'image/jpeg' }), duration: 12.5,
      width: 405, height: 720, mimeType: 'video/mp4', method: 'fixture' };
  }
  return { window, document, run, calls, card, render, flush, compose, prepared,
    thumb: number => document.querySelector(`[data-photo-card="${id(number)}"]`),
    setSigning: callback => { signVideo = callback; } };
}

const videoRow = number => ({ card_id: id(number), photo_path: `${USER}/${id(number)}-poster.jpg`,
  video_path: `${USER}/${id(number)}.mp4`, duration: 12.5, width: 405, height: 720 });

test('video feeds fetch poster images only and distinguish the existing photo attachment', async t => {
  const videos = Array.from({ length: 12 }, (_, index) => videoRow(20 + index));
  const photo = { card_id: id(40), photo_path: `${USER}/${id(40)}.jpg`, video_path: null, duration: null, width: null, height: null };
  const f = fixture(t, { records: [...videos, photo] });
  await f.render([...videos.map((_, i) => f.card(20 + i)), f.card(40)]);
  assert.equal(f.calls.videos.length, 0, 'no video is signed or opened by feed rendering');
  assert.equal(f.document.querySelectorAll('#feed-list video,#feed-list source').length, 0, 'feed cards cannot preload a video');
  assert.equal(f.calls.posters.length, 1, 'poster signatures retain the existing batch request');
  assert.equal(f.calls.posters[0].bucket, 'note-card-photos');
  for (let number = 20; number < 32; number++) {
    const thumb = f.thumb(number);
    assert.equal(thumb.hidden, false);
    assert.equal(thumb.dataset.mediaKind, 'video');
    assert.match(thumb.querySelector('.card-video-badge')?.textContent || '', /▶/);
    assert.match(thumb.querySelector('img')?.src || '', /\/posters\//);
    assert.doesNotMatch(thumb.querySelector('img').src, /\/videos\/|\.mp4/);
  }
  assert.equal(f.thumb(40).dataset.mediaKind, 'photo');
  assert.equal(f.thumb(40).querySelector('.card-video-badge'), null);
});

test('a video opens on demand, keeps its controls usable and releases playback when closed', async t => {
  const f = fixture(t, { records: [videoRow(20)] });
  await f.render([f.card(20)]);
  const thumb = f.thumb(20); thumb.focus(); thumb.click(); await f.flush();
  assert.equal(f.calls.videos.length, 1);
  assert.equal(f.calls.videos[0].bucket, 'note-card-videos');
  assert.equal(f.calls.videos[0].path, videoRow(20).video_path);
  const box = f.document.querySelector('.note-photo-lightbox'), video = box?.querySelector('video');
  assert.ok(video, 'the lightbox contains the selected video');
  assert.equal(box.hidden, false);
  assert.equal(video.controls, true);
  assert.equal(video.playsInline, true, 'mobile video remains in the lightbox');
  assert.match(video.getAttribute('src') || '', /\/videos\//);
  video.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }));
  assert.equal(box.hidden, false, 'clicking video controls does not close the overlay');
  const pauses = f.calls.pauses.length, loads = f.calls.loads.length;
  f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(box.hidden, true);
  assert.ok(f.calls.pauses.length > pauses, 'closing explicitly stops audio and playback');
  assert.ok(f.calls.loads.length > loads, 'closing releases the active media resource');
  assert.ok(!video.getAttribute('src'));
  assert.equal(f.document.activeElement, thumb);
});

test('existing photo thumbnails still open an image without requesting any video', async t => {
  const f = fixture(t);
  await f.render([f.card(40)]);
  f.window.__imageUrl = 'https://media.test/photo.jpg';
  f.run(`applyCardPhoto(document.querySelector('[data-photo-card="${id(40)}"]'), window.__imageUrl)`);
  const thumb = f.thumb(40); thumb.click();
  const box = f.document.querySelector('.note-photo-lightbox');
  assert.equal(box.hidden, false);
  assert.equal(box.querySelector('img').getAttribute('src'), f.window.__imageUrl);
  assert.equal(box.querySelector('img').dataset.protectPhoto, 'true');
  assert.equal(f.calls.videos.length, 0);
  f.run('closePhotoLightbox()');
  assert.equal(box.hidden, true);
  assert.ok(!box.querySelector('img').getAttribute('src'));
});

test('an old signed video response cannot reopen playback after an account change', async t => {
  const f = fixture(t, { records: [videoRow(20)] }), signing = deferred();
  await f.render([f.card(20)]);
  f.setSigning(() => signing.promise);
  f.thumb(20).click(); await f.flush();
  assert.equal(f.calls.videos.length, 1);
  f.run(`receiveAuth({ user: { id: ${JSON.stringify(NEXT_USER)} } })`);
  signing.resolve({ data: { signedUrl: 'https://media.test/videos/old-account.mp4' } });
  await f.flush();
  const box = f.document.querySelector('.note-photo-lightbox');
  assert.ok(!box || box.hidden);
  assert.equal(f.calls.plays.length, 0, 'old account video never starts');
  assert.equal(f.document.querySelectorAll('video[src]').length, 0);
});

test('guests cannot fetch an attachment or start the member video player', async t => {
  const f = fixture(t, { records: [videoRow(20)] });
  f.run('session = null; composerUserId = null;');
  await f.render([f.card(20)]);
  assert.equal(f.calls.rpc.filter(call => call.name === 'card_media_paths').length, 0);
  assert.equal(f.calls.posters.length, 0);
  const thumb = f.thumb(20);
  thumb.dataset.mediaKind = 'video'; thumb.dataset.videoPath = videoRow(20).video_path;
  thumb.click(); await f.flush();
  assert.equal(f.calls.videos.length, 0);
  assert.equal(f.document.querySelectorAll('video[src]').length, 0);
});

test('video preparation shows progress and uses only the poster for the composer preview', async t => {
  const f = fixture(t), preparation = deferred(), result = f.prepared();
  f.window.ojjudaCardVideo = { prepareCardVideo: (_file, options) => {
    options.onProgress({ phase: 'processing', progress: 0.375 });
    return preparation.promise;
  } };
  f.window.__chosenFile = new f.window.File(['input video'], 'walk.mp4', { type: 'video/mp4' });
  f.compose();
  const pending = f.run('selectCardPhoto(window.__chosenFile)'); await f.flush();
  assert.match(f.document.getElementById('card-media-status').textContent, /38%/);
  assert.equal(f.document.getElementById('publish-card').disabled, true);
  preparation.resolve(result); await pending;
  assert.equal(f.run('cardVideoPrepared'), result);
  assert.equal(f.run('cardPhotoBlob'), result.posterBlob);
  assert.equal(f.calls.created.length, 1);
  assert.equal(f.calls.created[0].blob, result.posterBlob, 'the full video never becomes a composer background');
  assert.match(f.document.getElementById('card-photo-attach').style.backgroundImage, /blob:/);
  assert.equal(f.document.querySelectorAll('video[src]').length, 0);
  assert.equal(f.document.getElementById('publish-card').disabled, false);
  assert.match(f.document.getElementById('card-media-status').textContent, /13초.*준비/);
  assert.match(f.document.getElementById('card-photo-file').accept, /video\//);
  assert.doesNotMatch(f.document.getElementById('event-photo-file').accept, /video\//, 'event images keep their existing input contract');
  f.document.getElementById('card-photo-remove').click();
  assert.equal(f.run('cardVideoPrepared'), null);
  assert.equal(f.run('cardPhotoBlob'), null);
  assert.ok(f.calls.revoked.includes(f.calls.created[0].url));
});

test('choosing another video aborts the old preparation and preserves the newer result', async t => {
  const f = fixture(t), first = deferred(), second = deferred(), signals = [];
  f.window.ojjudaCardVideo = { prepareCardVideo: (file, options) => {
    signals.push(options.signal); return file.name === 'first.mp4' ? first.promise : second.promise;
  } };
  f.window.__firstFile = new f.window.File(['first'], 'first.mp4', { type: 'video/mp4' });
  f.window.__secondFile = new f.window.File(['second'], 'second.mp4', { type: 'video/mp4' });
  f.compose();
  const oldPending = f.run('selectCardPhoto(window.__firstFile)'); await f.flush();
  const newPending = f.run('selectCardPhoto(window.__secondFile)'); await f.flush();
  assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  const latest = { ...f.prepared(), duration: 24 };
  second.resolve(latest); await newPending;
  first.resolve(f.prepared()); await oldPending;
  assert.equal(f.run('cardVideoPrepared'), latest);
  assert.equal(f.run('cardPhotoBlob'), latest.posterBlob);
  assert.equal(f.calls.created.length, 1, 'a stale job cannot allocate a replacement preview URL');
  assert.match(f.document.getElementById('card-media-status').textContent, /24초/);
});

test('canceling video preparation aborts work and cannot restore a late result', async t => {
  const f = fixture(t), prepared = deferred();
  let options;
  f.window.ojjudaCardVideo = { prepareCardVideo: (_file, value) => { options = value; return prepared.promise; } };
  f.window.__chosenFile = new f.window.File(['input video'], 'walk.mp4', { type: 'video/mp4' });
  f.compose();
  const pending = f.run('selectCardPhoto(window.__chosenFile)');
  await f.flush();
  assert.ok(options?.signal, 'preparation receives a cancellation signal');
  assert.equal(f.document.getElementById('publish-card').disabled, true);
  f.run('clearCardPhoto(); updateComposer();');
  assert.equal(options.signal.aborted, true);
  prepared.resolve(f.prepared()); await pending;
  assert.equal(f.run('cardPhotoBlob'), null);
  assert.equal(f.run('cardVideoPrepared'), null);
  assert.equal(f.document.getElementById('card-photo-attach').classList.contains('has-photo'), false);
  assert.equal(f.document.getElementById('publish-card').disabled, false);
});

test('an account switch cancels prepared video state and discards its late result', async t => {
  const f = fixture(t), prepared = deferred();
  let signal;
  f.window.ojjudaCardVideo = { prepareCardVideo: (_file, options) => { signal = options.signal; return prepared.promise; } };
  f.window.__chosenFile = new f.window.File(['input video'], 'walk.mp4', { type: 'video/mp4' });
  f.compose();
  const pending = f.run('selectCardPhoto(window.__chosenFile)'); await f.flush();
  f.run(`receiveAuth({ user: { id: ${JSON.stringify(NEXT_USER)} } })`);
  assert.equal(signal?.aborted, true);
  prepared.resolve(f.prepared()); await pending;
  assert.equal(f.run('cardVideoPrepared'), null);
  assert.equal(f.run('cardPhotoBlob'), null);
  assert.equal(f.document.getElementById('composer-backdrop').hidden, true);
  assert.equal(f.calls.uploads.length, 0);
  assert.ok(f.calls.created.every(({ url }) => f.calls.revoked.includes(url)), 'no discarded preview URL survives the account boundary');
});

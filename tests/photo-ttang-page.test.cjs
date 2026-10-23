const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'photo-ttang.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'photo-ttang-page.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const dom = new JSDOM(html, { url: 'https://fixture.test/photo-ttang.html', runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  let user = { id: 'member', user_metadata: { nickname: '테스트' } }, authChange, releaseIdentity;
  const timers = [];
  w.setInterval = fn => { timers.push(fn); return timers.length; };
  w.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
  w.supabase = { createClient: () => ({ auth: {
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: fn => { authChange = fn; }
  } }) };
  w.OjjudaPhotoTtangAccess = {
    configure() {}, allowed: () => Boolean(user), subscribe() {},
    refresh: () => new Promise(resolve => { releaseIdentity = () => resolve({ userId: user?.id }); })
  };
  const settleIdentity = async () => { await tick(); releaseIdentity(); await tick(); };
  function ready(frame) {
    frame.contentWindow.focus = () => {};
    frame.contentWindow.OjjudaPhotoEntryReady = true;
    frame.contentWindow.OjjudaPhotoTtang = { canLeave: () => true };
    frame.dispatchEvent(new w.Event('load'));
  }
  try {
    w.eval(script);
    assert.equal(d.getElementById('hero-wrap').hidden, true, 'identity loading never flashes the guest entrance');
    assert.equal(d.getElementById('entry-loading').hidden, false);
    await settleIdentity();
    const first = d.querySelector('iframe');
    assert.ok(first, 'a verified member opens the game once');
    assert.equal(d.getElementById('hero-wrap').hidden, true, 'game loading does not show a second entrance');
    ready(first);
    assert.equal(d.getElementById('game-shell').hidden, false);
    assert.equal(d.getElementById('entry-loading').hidden, true);
    assert.equal(first.contentDocument.querySelectorAll('script[data-photo-entry]').length, 0, 'the parent does not overwrite the game entrance');

    d.getElementById('exit-game').click();
    assert.equal(d.querySelectorAll('iframe').length, 0);
    assert.equal(d.getElementById('hero-wrap').hidden, false);
    timers[0](); await settleIdentity();
    assert.equal(d.querySelectorAll('iframe').length, 0, 'periodic member refresh cannot reopen a closed game');
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    await settleIdentity();
    assert.equal(d.querySelectorAll('iframe').length, 0, 'returning to a saved page cannot reopen a closed game');
    authChange('TOKEN_REFRESHED'); await new Promise(resolve => setTimeout(resolve, 5)); await settleIdentity();
    assert.equal(d.querySelectorAll('iframe').length, 0, 'session refresh cannot reopen a closed game');

    d.getElementById('start-demo').click(); d.getElementById('start-demo').click();
    assert.equal(d.querySelectorAll('iframe').length, 1, 'explicit repeated starts still open only one game');
    const second = d.querySelector('iframe'); ready(second);
    timers[0](); await settleIdentity();
    assert.equal(d.querySelector('iframe'), second, 'refresh preserves an open game rather than replacing it');
    user = null; authChange('SIGNED_OUT');
    assert.equal(d.querySelectorAll('iframe').length, 0, 'sign-out closes full play immediately');
    assert.equal(d.getElementById('hero-wrap').hidden, false);
    assert.equal(d.getElementById('start-demo').textContent, '한 판 체험하기');
    first.dispatchEvent(new w.Event('load'));
    assert.equal(d.getElementById('game-shell').hidden, true, 'a stale frame cannot cover the entrance');
    console.log('PASS: one photo entrance, no member-loading flash, no automatic reopening, explicit reentry, single frame, sign-out and stale loads');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

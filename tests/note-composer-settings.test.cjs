const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'note/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const key = id => `ojjuda-note-composer-settings-v1:${id}`;
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  let dom, window, document;
  const errors = [];
  const run = code => new vm.Script(code).runInContext(dom.getInternalVMContext());
  const choices = () => JSON.parse(JSON.stringify(run(`({
    identity: $('#quick-identity').value, gender: $('#quick-gender').value,
    location: $('#card-location-button').getAttribute('aria-checked') === 'true'
  })`)));
  const stored = id => JSON.parse(window.localStorage.getItem(key(id)));
  const open = async () => { await run("openComposer('memo')"); await settle(); };
  const close = () => run('closeComposer(false)');
  function choose(identity, gender) {
    for (const [id, value] of [['quick-identity', identity], ['quick-gender', gender]]) {
      const select = document.getElementById(id);
      assert.equal(select.disabled, false);
      select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  }
  const locationClick = async () => {
    const button = document.getElementById('card-location-button');
    assert.equal(button.disabled, false); button.click(); await settle();
  };
  function signIn(id, gender) {
    if (!run('backdrop.hidden')) close();
    run(`session = { user: { id: ${JSON.stringify(id)} } }; authKnown = true; ready = true;
      myIdentity = { gender: ${JSON.stringify(gender)} }; myIdentityReady = true; myGender = ${JSON.stringify(gender)};
      window.restorePayload = null;`);
  }
  function boot(id = 'account-a', gender = 'male') {
    const saved = dom ? Object.fromEntries(Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)])) : {};
    dom?.window.close();
    dom = new JSDOM(html, { url: 'https://note.test/note/', runScripts: 'outside-only', pretendToBeVisual: true });
    window = dom.window; document = window.document;
    window.addEventListener('error', event => errors.push(event.error?.message || event.message));
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollTo = () => {};
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    for (const [k, value] of Object.entries(saved)) window.localStorage.setItem(k, value);
    run(source); signIn(id, gender);
    run(`window.geoCalls = 0; window.deferGeo = false;
      currentPosition = async () => {
        window.geoCalls++;
        if (window.deferGeo) return new Promise(resolve => { window.resolveGeo = resolve; });
        return { latitude: 37 + window.geoCalls / 1000, longitude: 127 };
      };
      draftStatus = document.createElement('span');
      draftController = { resume: async () => window.restorePayload,
        change: value => { window.restorePayload = value; }, setUser() {} };
      prepareCardPhotoEdit = async () => {};`);
  }
  try {
    boot(); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'male', location: true });
    choose('nickname', 'private'); await locationClick();
    assert.deepEqual(stored('account-a'), { identity: 'nickname', gender: 'private', locationEnabled: false });
    document.getElementById('compose-text').value = '다시 열어도 설정 유지';
    document.getElementById('compose-text').dispatchEvent(new window.Event('input'));
    document.getElementById('close-composer').click(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });
    assert.equal(document.getElementById('compose-text').value, '다시 열어도 설정 유지');
    assert.equal(window.geoCalls, 1, 'restored location-off must not request GPS');

    boot(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });
    assert.equal(window.geoCalls, 0, 'a fresh page with saved preferences keeps location off');
    choose('anonymous', 'male'); await locationClick();
    const firstLat = run('writingPosition.latitude');
    close(); await open();
    assert.notEqual(run('writingPosition.latitude'), firstLat, 'location-on requests current coordinates for every new card');
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'male', location: true });
    assert.deepEqual(Object.keys(stored('account-a')).sort(), ['gender', 'identity', 'locationEnabled'], 'never persist coordinates');

    await locationClick(); window.deferGeo = true;
    await locationClick(); await locationClick();
    window.resolveGeo({ latitude: 36, longitude: 128 }); await settle();
    assert.equal(choices().location, false, 'late GPS response cannot undo the last off choice');
    assert.equal(run('writingPosition'), null);
    close(); await open(); assert.equal(choices().location, false);
    window.deferGeo = false;

    close();
    await run(`openComposer('edit', { id: '00000000-0000-4000-8000-000000000001', is_mine: true,
      kind: 'memo', parent_id: null, body: '기존 카드', tags: [], background_key: '42', identity_mode: 'anonymous' })`);
    choose('nickname', 'male');
    assert.equal(stored('account-a').identity, 'anonymous', 'existing-card edits do not change new-card preferences');
    close(); await open(); assert.equal(choices().identity, 'anonymous');

    choose('nickname', 'private'); signIn('account-b', 'female'); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'female', location: true }, 'each account has independent choices');
    signIn('account-a', 'male'); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });

    close();
    window.sessionStorage.setItem('ojjuda-note-local-composer-v1:account-a:event', JSON.stringify({
      savedAt: Date.now(), content: { kind: 'event', editingId: null, body: '이전 이벤트 글', tags: '', style: {},
        identity: 'anonymous', backgroundKey: '42', eventPosition: null, radius: '1', hours: '1' }
    }));
    await run("openComposer('event')");
    assert.equal(choices().identity, 'nickname', 'old event drafts cannot overwrite the latest choice');
    assert.equal(document.getElementById('compose-text').value, '이전 이벤트 글');

    signIn('corrupt-account', 'female');
    window.localStorage.setItem(key('corrupt-account'), '{broken'); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'female', location: true });

    signIn('blocked-storage', 'male');
    window.Storage.prototype.getItem = () => { throw new Error('blocked'); };
    window.Storage.prototype.setItem = () => { throw new Error('blocked'); };
    await open(); choose('nickname', 'private'); await locationClick(); close(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false }, 'storage errors retain choices in the current session');
    assert.deepEqual(errors, []);
    console.log('PASS: real composer DOM handlers retain name, gender and location through close, draft restore, fresh-page load and publish cleanup; account separation, fresh/cancelled GPS, edits, event drafts and storage errors.');
  } finally { dom?.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

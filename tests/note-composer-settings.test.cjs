const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'park/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
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
  const styleChoices = () => ({
    font: document.getElementById('compose-font').value,
    size: document.getElementById('compose-size').value,
    boxTransparency: Number(document.getElementById('compose-box-transparency').value)
  });
  function chooseStyle(font, size, transparency, useNumber = false) {
    for (const [id, value] of [['compose-font', font], ['compose-size', size]]) {
      const select = document.getElementById(id);
      assert.equal(select.disabled, false); select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    const input = document.getElementById(useNumber ? 'compose-box-transparency-value' : 'compose-box-transparency');
    input.value = String(transparency); input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(Number(document.getElementById('compose-box-transparency-value').value), transparency);
    assert.equal(styleChoices().boxTransparency, transparency);
  }
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
      draftController = null; // Unfinished text is no longer saved in production.
      prepareCardPhotoEdit = async () => {};`);
  }
  try {
    boot(); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'male', location: true });
    assert.deepEqual(styleChoices(), { font: 'default', size: 'normal', boxTransparency: 25 });
    choose('nickname', 'private'); await locationClick();
    assert.deepEqual(stored('account-a'), { identity: 'nickname', gender: 'private', locationEnabled: false,
      font: 'default', size: 'normal', boxTransparency: 25 });
    chooseStyle('serif', 'large', 0);
    document.getElementById('compose-text').value = '다시 열어도 설정 유지';
    document.getElementById('compose-text').dispatchEvent(new window.Event('input'));
    document.getElementById('close-composer').click(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });
    assert.equal(document.getElementById('compose-text').value, '', 'remember choices without saving unfinished text');
    assert.deepEqual(styleChoices(), { font: 'serif', size: 'large', boxTransparency: 0 });
    assert.equal(window.geoCalls, 1, 'restored location-off must not request GPS');

    boot(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });
    assert.deepEqual(styleChoices(), { font: 'serif', size: 'large', boxTransparency: 0 }, 'zero remains fully transparent after reload');
    assert.equal(window.geoCalls, 0, 'a fresh page with saved preferences keeps location off');
    chooseStyle('mono', 'small', 37, true);
    assert.equal(stored('account-a').boxTransparency, 37, 'number input is remembered immediately, before blur');
    close(); await open();
    assert.deepEqual(styleChoices(), { font: 'mono', size: 'small', boxTransparency: 37 });
    chooseStyle('round', 'normal', 100);
    close(); await open();
    assert.deepEqual(styleChoices(), { font: 'round', size: 'normal', boxTransparency: 100 });
    choose('anonymous', 'male'); await locationClick();
    const firstLat = run('writingPosition.latitude');
    close(); await open();
    assert.notEqual(run('writingPosition.latitude'), firstLat, 'location-on requests current coordinates for every new card');
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'male', location: true });
    assert.deepEqual(Object.keys(stored('account-a')).sort(), ['boxTransparency', 'font', 'gender', 'identity', 'locationEnabled', 'size'], 'never persist coordinates or unfinished text');

    await locationClick(); window.deferGeo = true;
    await locationClick(); await locationClick();
    window.resolveGeo({ latitude: 36, longitude: 128 }); await settle();
    assert.equal(choices().location, false, 'late GPS response cannot undo the last off choice');
    assert.equal(run('writingPosition'), null);
    close(); await open(); assert.equal(choices().location, false);
    window.deferGeo = false;

    close();
    await run(`openComposer('edit', { id: '00000000-0000-4000-8000-000000000001', is_mine: true,
      kind: 'memo', parent_id: null, body: '기존 카드', tags: [], background_key: '42', identity_mode: 'anonymous',
      style: { font: 'handwriting', size: 'large', boxTransparency: 64 } })`);
    assert.deepEqual(styleChoices(), { font: 'handwriting', size: 'large', boxTransparency: 64 }, 'editing uses the existing card style');
    choose('nickname', 'male');
    chooseStyle('serif', 'small', 12, true);
    assert.equal(stored('account-a').identity, 'anonymous', 'existing-card edits do not change new-card preferences');
    close(); await open(); assert.equal(choices().identity, 'anonymous');
    assert.deepEqual(styleChoices(), { font: 'round', size: 'normal', boxTransparency: 100 }, 'editing never overwrites new-card style choices');

    choose('nickname', 'private'); signIn('account-b', 'female'); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'female', location: true }, 'each account has independent choices');
    assert.deepEqual(styleChoices(), { font: 'default', size: 'normal', boxTransparency: 25 });
    signIn('account-a', 'male'); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false });
    assert.deepEqual(styleChoices(), { font: 'round', size: 'normal', boxTransparency: 100 });

    close();
    window.sessionStorage.setItem('ojjuda-note-local-composer-v1:account-a:event', JSON.stringify({
      savedAt: Date.now(), content: { kind: 'event', editingId: null, body: '이전 이벤트 글', tags: '', style: {},
        identity: 'anonymous', backgroundKey: '42', eventPosition: null, radius: '1', hours: '1' }
    }));
    await run("openComposer('event')");
    assert.equal(choices().identity, 'nickname', 'old event drafts cannot overwrite the latest choice');
    assert.equal(document.getElementById('compose-text').value, '', 'old event text is not restored');
    assert.deepEqual(styleChoices(), { font: 'round', size: 'normal', boxTransparency: 100 });

    signIn('legacy-settings', 'male');
    window.localStorage.setItem(key('legacy-settings'), JSON.stringify({ identity: 'nickname', gender: 'private', locationEnabled: false }));
    await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false }, 'existing saved choices survive the upgrade');
    assert.deepEqual(styleChoices(), { font: 'default', size: 'normal', boxTransparency: 25 });

    signIn('corrupt-account', 'female');
    window.localStorage.setItem(key('corrupt-account'), '{broken'); await open();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'female', location: true });
    assert.deepEqual(styleChoices(), { font: 'default', size: 'normal', boxTransparency: 25 });

    signIn('blocked-storage', 'male');
    window.Storage.prototype.getItem = () => { throw new Error('blocked'); };
    window.Storage.prototype.setItem = () => { throw new Error('blocked'); };
    await open(); choose('nickname', 'private'); await locationClick();
    chooseStyle('handwriting', 'small', 17); close(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false }, 'storage errors retain choices in the current session');
    assert.deepEqual(styleChoices(), { font: 'handwriting', size: 'small', boxTransparency: 17 });
    assert.deepEqual(errors, []);
    console.log('PASS: composer name, gender, location, font, size and 0-100 transparency persist through close and reload; number/slider input, legacy settings, account separation, edits and blocked storage; unfinished text stays unsaved.');
  } finally { dom?.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

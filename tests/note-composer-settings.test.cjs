const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const toolbarSource = fs.readFileSync(path.join(root, 'note/composer-tools.js'), 'utf8');
const sharedLocationSource = fs.readFileSync(path.join(root,'shared/location/location.js'),'utf8');
const sharedPreferences = new Map();
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
  const tool = name => document.querySelector(`[data-compose-tool="${name}"]`);
  const panel = name => document.querySelector(`[data-compose-panel="${name}"]`);
  function openTool(name) {
    const button = tool(name);
    assert.ok(button, `the ${name} option is reachable from the toolbar`);
    assert.equal(button.disabled, false);
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(panel(name).hidden, false);
    assert.equal(document.querySelectorAll('[data-compose-panel]:not([hidden])').length, 1,
      'only the chosen option panel opens');
    assert.equal(document.getElementById(button.getAttribute('aria-controls')), panel(name));
    assert.ok(button.getAttribute('aria-label'), 'icon buttons have accessible names');
  }
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
    const saved = dom && id ? Object.fromEntries(Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)])) : {};
    dom?.window.close();
    dom = new JSDOM(html, { url: 'https://note.test/note/', runScripts: 'outside-only', pretendToBeVisual: true });
    window = dom.window; document = window.document;
    window.addEventListener('error', event => errors.push(event.error?.message || event.message));
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollTo = () => {};
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    for (const [k, value] of Object.entries(saved)) window.localStorage.setItem(k, value);
    window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
    window.supabase = {createClient:()=>({
      auth:{onAuthStateChange(){},getSession:async()=>({data:{session:run('session')}})},
      schema:()=>({rpc:async()=>({data:[]})}),
      rpc:async(name,args={})=>{
        if(name==='get_my_member_identity')return window.deferIdentity
          ? new Promise(resolve=>{window.resolveIdentity=resolve;}) : {data:{gender:run('myGender')}};
        if(name!=='ojjuda_location_preference')return {data:null};
        const owner=args.p_account_id;
        let preference=sharedPreferences.get(owner)||{enabled:true,version:0};
        if(typeof args.p_enabled==='boolean'||(args.p_legacy_disabled&&preference.version===0&&preference.enabled)){
          if(args.p_expected_version!=null&&args.p_expected_version!==preference.version)return {error:{code:'PT412',message:'다른 화면에서 위치 설정이 바뀌었어요.'}};
          preference={enabled:args.p_enabled??false,version:preference.version+1};sharedPreferences.set(owner,preference);
        }
        return {data:preference};
      }
    })};
    run(sharedLocationSource);
    run(toolbarSource);
    run(source.slice(0,source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange')));
    if (id) signIn(id, gender);
    else run('authKnown = ready = true; selectCollection = async () => true; refreshCards = async () => {};');
    run(`window.geoCalls = 0; window.deferGeo = false;
      currentPosition = async (fresh=false,enable=false,signal) => {
        const owner=session.user.id;
        const choice=await window.OjjudaLocation.preference(client,owner);
        if(!choice.enabled&&!enable)throw Object.assign(Error('위치가 꺼져 있어요.'),{code:'disabled'});
        window.geoCalls++;
        let position;
        if(window.deferGeo)position=await new Promise((resolve,reject)=>{
          window.resolveGeo=resolve;signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
        });
        else position={latitude:37+window.geoCalls/1000,longitude:127};
        if(enable&&!choice.enabled)await window.OjjudaLocation.setPreference(client,owner,true,choice.version);
        return position;
      };
      draftController = null; // Unfinished text is no longer saved in production.
      prepareCardPhotoEdit = async () => {};`);
  }
  try {
    boot();
    const opener=document.querySelector('[data-compose="new"]');opener.focus();opener.click();
    assert.equal(document.activeElement,document.getElementById('compose-text'),
      'a ready member starts typing in the same synchronous click that opens the writer');
    assert.equal(document.getElementById('compose-text').disabled,false);
    await settle();
    assert.deepEqual(choices(), { identity: 'anonymous', gender: 'male', location: true });
    assert.deepEqual(styleChoices(), { font: 'default', size: 'normal', boxTransparency: 25 });
    assert.ok(document.querySelector('.composer').classList.contains('composer-tools-ready'));
    assert.deepEqual([...document.querySelectorAll('[data-compose-tool]')].map(button => button.dataset.composeTool),
      ['photo', 'font', 'color', 'box', 'effect', 'location', 'settings']);
    assert.equal(document.querySelectorAll('[data-compose-panel]:not([hidden])').length, 0,
      'writing starts with every option panel collapsed');
    assert.equal(document.activeElement, document.getElementById('compose-text'),
      'background work keeps the writing input focused');
    const originalInput = document.getElementById('compose-text');
    const originalPhotoInput = document.getElementById('card-photo-file');
    const textPalette = document.querySelector('[data-color-field="textColor"]');
    const boxPalette = document.querySelector('[data-color-field="boxColor"]');
    const opacityInput = document.getElementById('compose-box-transparency');
    assert.equal(document.getElementById('compose-tags').closest('.compose-tag-entry')?.parentElement,
      document.querySelector('.composer-body'), 'tags stay above the card');
    assert.equal(document.getElementById('publish-card').closest('.composer-head'),
      document.querySelector('.composer-head'), 'the existing publish action stays in the header');
    originalInput.value = '옵션을 바꿔도 남아 있는 글';
    originalInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    for (const name of ['photo', 'font', 'color', 'box', 'effect', 'location', 'settings']) openTool(name);
    assert.equal(document.getElementById('compose-text'), originalInput, 'panel switches never replace the writing input');
    assert.equal(document.getElementById('card-photo-file'), originalPhotoInput,
      'the original attachment input and its listeners are kept');
    assert.equal(originalInput.value, '옵션을 바꿔도 남아 있는 글');
    assert.equal(document.querySelectorAll('#compose-text,#card-photo-file,#quick-identity,#quick-gender').length, 4,
      'moving options never duplicates an input id');
    assert.equal(textPalette.closest('[data-compose-panel]'), panel('color'), 'text colors have their own short panel');
    assert.equal(boxPalette.closest('[data-compose-panel]'), panel('box'), 'box colors stay with box opacity');
    assert.equal(opacityInput.closest('[data-compose-panel]'), panel('box'));
    assert.equal(panel('color').contains(boxPalette), false);
    assert.equal(document.querySelectorAll('#compose-box-transparency,#compose-box-transparency-value').length, 2);
    const chooseColor = (field, value) => {
      const label = field.querySelector(value === 'default' ? '[data-color="default"]' : '.note-color-choice:not([data-color="default"])');
      label.querySelector('input').click();
      return label.dataset.color;
    };
    openTool('color');
    const textValue = chooseColor(textPalette, 'custom');
    assert.equal(run('currentStyle().textColor'), textValue);
    assert.equal(tool('color').dataset.selected, 'true');
    assert.equal(tool('box').dataset.selected, 'false', 'text color does not mark the box tool as changed');
    openTool('box');
    const boxValue = chooseColor(boxPalette, 'custom');
    assert.equal(run('currentStyle().boxColor'), boxValue);
    assert.equal(tool('box').dataset.selected, 'true');
    openTool('color'); chooseColor(textPalette, 'default');
    assert.equal(tool('color').dataset.selected, 'false');
    assert.equal(tool('box').dataset.selected, 'true', 'resetting the lettering leaves the box selection intact');
    openTool('box'); chooseColor(boxPalette, 'default');
    assert.equal(tool('box').dataset.selected, 'false');
    assert.equal(document.querySelector('[data-color-field="textColor"]'), textPalette);
    assert.equal(document.querySelector('[data-color-field="boxColor"]'), boxPalette);
    assert.equal(document.getElementById('compose-box-transparency'), opacityInput);
    chooseStyle('serif', 'large', 37);
    openTool('photo'); openTool('box');
    assert.deepEqual(styleChoices(), { font: 'serif', size: 'large', boxTransparency: 37 });
    assert.equal(tool('color').dataset.selected, 'false');
    assert.equal(tool('box').dataset.selected, 'true', 'opacity changes are marked only on the box tool');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.getElementById('composer-backdrop').hidden, false,
      'Escape first dismisses the option panel without closing the draft');
    assert.equal(document.querySelectorAll('[data-compose-panel]:not([hidden])').length, 0);
    assert.equal(originalInput.value, '옵션을 바꿔도 남아 있는 글');
    run('busy = true; setComposerInputs(); updateComposer();');
    assert.equal([...document.querySelectorAll('[data-compose-tool]')].every(button => button.disabled), true,
      'submission locks the option toolbar too');
    run('busy = false; setComposerInputs(); updateComposer();');
    openTool('font'); tool('font').click();
    assert.equal(document.querySelectorAll('[data-compose-panel]:not([hidden])').length, 0,
      'tapping the active tool collapses its panel');
    const photo = document.querySelector('.compose-photo');
    assert.equal(originalInput.parentElement, photo, 'the writing input is a direct child of the photo');
    assert.equal(document.getElementById('compose-ink-editor'), null, 'calligraphy has no separate source field');
    const originalRenderer = window.ParkCalligraphy;
    // Canvas pixels are covered by guest-access-ui; this fixture checks native editing state.
    window.ParkCalligraphy = { render: () => true };
    const inkFrame = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    originalInput.value = '첫째\n둘째\n셋째';
    originalInput.focus(); originalInput.setSelectionRange(1, 4, 'backward');
    chooseStyle('calligraphy', 'normal', 25); await inkFrame();
    assert.equal(document.getElementById('compose-text'), originalInput);
    assert.equal(originalInput.parentElement, photo, 'conversion never moves or replaces the native input');
    assert.equal(document.activeElement, originalInput);
    assert.deepEqual([originalInput.value, originalInput.selectionStart, originalInput.selectionEnd, originalInput.selectionDirection],
      ['첫째\n둘째\n셋째', 1, 4, 'backward'], 'conversion keeps multiline text and the selected range');
    assert.equal(photo.classList.contains('park-ink-writing'), true);
    assert.equal(photo.classList.contains('park-ink-preview'), false);
    originalInput.blur(); await inkFrame();
    assert.equal(photo.classList.contains('park-ink-preview'), true, 'blur shows the ready painted preview');
    assert.deepEqual([originalInput.selectionStart, originalInput.selectionEnd, originalInput.selectionDirection], [1, 4, 'backward']);
    originalInput.focus();
    assert.equal(photo.classList.contains('park-ink-writing'), true, 'focusing the same field resumes native editing');
    assert.equal(photo.classList.contains('park-ink-preview'), false);
    originalInput.blur();
    window.ParkCalligraphy.render = () => false;
    run('updateComposer()'); await inkFrame();
    assert.equal(photo.classList.contains('park-ink-writing'), true, 'a renderer failure leaves the native text available');
    assert.equal(photo.classList.contains('park-ink-preview'), false);
    assert.equal(originalInput.value, '첫째\n둘째\n셋째');
    window.ParkCalligraphy.render = () => true;
    originalInput.value = ''; originalInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await inkFrame();
    assert.equal(photo.classList.contains('park-ink-writing'), true, 'an empty card keeps its native placeholder available');
    assert.equal(photo.classList.contains('park-ink-preview'), false);
    chooseStyle('default', 'normal', 25);
    assert.equal(originalInput.parentElement, photo);
    assert.equal(photo.classList.contains('park-ink-writing'), false);
    assert.equal(photo.classList.contains('park-ink-preview'), false);
    window.ParkCalligraphy = originalRenderer;
    originalInput.value = ''; originalInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    choose('nickname', 'private'); await locationClick();
    assert.deepEqual(stored('account-a'), { identity: 'nickname', gender: 'private', locationEnabled: false,
      font: 'default', size: 'normal', boxTransparency: 25 });
    chooseStyle('serif', 'large', 0);
    document.getElementById('compose-text').value = '다시 열어도 설정 유지';
    document.getElementById('compose-text').dispatchEvent(new window.Event('input'));
    document.getElementById('close-composer').click();
    assert.equal(document.activeElement,opener,'closing returns focus to the original writing button');
    await open();
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
    assert.equal(document.activeElement,document.getElementById('compose-text'),'editing focuses the original writing input');
    assert.deepEqual([document.activeElement.selectionStart,document.activeElement.selectionEnd],['기존 카드'.length,'기존 카드'.length],
      'editing places the cursor at the end of the existing writing');
    assert.deepEqual(styleChoices(), { font: 'handwriting', size: 'large', boxTransparency: 64 }, 'editing uses the existing card style');
    assert.equal(tool('location').disabled, true, 'editing cannot expose a new location setting');
    assert.equal(tool('photo').disabled, true, 'a card without an existing attachment cannot gain one while editing');
    openTool('font');
    assert.equal(document.getElementById('compose-text').value, '기존 카드');
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
    await run(`cache.set('00000000-0000-4000-8000-000000000003', {my_reply_alias:'활기찬 돌고래'});
      openComposer('reply',null,'00000000-0000-4000-8000-000000000003')`);
    assert.equal(document.activeElement,document.getElementById('compose-text'),'replies also begin in the writing input');
    assert.equal(choices().identity,'anonymous');
    const nameBox = document.getElementById('quick-identity');
    assert.equal(nameBox.selectedOptions[0].textContent,'활기찬 돌고래');
    assert.equal(nameBox.disabled,true);
    openTool('settings');
    assert.equal(panel('settings').contains(nameBox), true, 'reply identity stays in the settings panel');
    assert.equal(document.getElementById('note-photo-pick').hidden, true,
      'reply photos never expose the new-card background purchase gallery');
    assert.equal(stored('account-a').identity,'nickname','the conversation alias does not overwrite new-card preferences');
    close(); await open();
    assert.equal(choices().identity,'nickname');
    assert.equal(nameBox.disabled,false);
    close();
    window.sessionStorage.setItem('ojjuda-note-local-composer-v1:account-a:event', JSON.stringify({
      savedAt: Date.now(), content: { kind: 'event', editingId: null, body: '이전 이벤트 글', tags: '', style: {},
        identity: 'anonymous', backgroundKey: '42', eventPosition: null, radius: '1', hours: '1' }
    }));
    await run("openComposer('event')");
    openTool('photo');
    assert.equal(panel('photo').contains(document.getElementById('event-photo-choice')), true);
    openTool('location');
    assert.equal(panel('location').contains(document.getElementById('note-event-fields')), true);
    assert.equal(document.getElementById('note-event-fields').hidden, false);
    assert.equal(document.getElementById('card-location-consent').hidden, true,
      'event location uses its map instead of the ordinary-card GPS consent');
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

    signIn('heart-account', 'female'); await open();
    run(fs.readFileSync(path.join(root, 'features/wallet/ju-decorations.js'), 'utf8'));
    await run(`(async () => {
      const state = { ok: true, coins: 100, selected: {}, owned:
        ['card_fonts', 'card_stickers', 'card_foil'].map(key => ({ key, expires_at: new Date(Date.now() + 86400000).toISOString() })) };
      OjjudaDecorations.install({ getUserId: () => session?.user?.id, client: { rpc: () => {
        const request = Promise.resolve({ data: state }); request.abortSignal = () => request; return request;
      } } });
      await OjjudaDecorations.refresh();
      OjjudaDecorations.setStyle({ shopFont: 'poster', shopSticker: 'heart', shopEffect: 'foil' });
    })()`);
    chooseStyle('heart', 'normal', 25);
    assert.deepEqual(JSON.parse(JSON.stringify(run('OjjudaDecorations.styleFields()'))),
      { shopSticker: 'heart', shopFont: 'none', shopEffect: 'foil' },
      'choosing the heart font replaces the purchased font while preserving stickers and effects');
    assert.equal(document.querySelector('.compose-photo').classList.contains('note-font-heart'), true);
    const purchasedFont = document.querySelector('[data-shop-style="Font"]');
    purchasedFont.value = 'book'; purchasedFont.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(styleChoices().font, 'default', 'a later purchased-font choice becomes the active font');
    assert.equal(stored('heart-account').font, 'default');
    assert.deepEqual(JSON.parse(JSON.stringify(run('OjjudaDecorations.styleFields()'))),
      { shopSticker: 'heart', shopFont: 'book', shopEffect: 'foil' });
    chooseStyle('heart', 'normal', 25);
    document.getElementById('compose-text').value = '가나다 하트 1234567890';
    document.getElementById('compose-text').dispatchEvent(new window.Event('input', { bubbles: true }));
    run('toggleCalligraphy(); toggleCalligraphy();');
    assert.equal(styleChoices().font, 'heart', 'leaving calligraphy restores the chosen heart font');
    close(); await open();
    assert.equal(styleChoices().font, 'heart', 'the heart font is remembered when writing another card');
    assert.equal(document.getElementById('compose-text').value, '', 'font preferences do not save unfinished text');
    boot('heart-account', 'female'); await open();
    assert.equal(styleChoices().font, 'heart', 'the heart font survives a page reload');
    close();
    await run(`openComposer('edit', { id: '00000000-0000-4000-8000-000000000009', is_mine: true,
      kind: 'memo', parent_id: null, body: '저장한 하트 글씨 123', tags: [], background_key: '42',
      identity_mode: 'anonymous', style: { font: 'heart', size: 'small', boxTransparency: 40 } })`);
    assert.deepEqual(styleChoices(), { font: 'heart', size: 'small', boxTransparency: 40 });
    chooseStyle('serif', 'large', 60);
    close(); await open();
    assert.equal(styleChoices().font, 'heart', 'editing a saved card does not change the new-card font preference');
    signIn('heart-other-account', 'male'); await open();
    assert.equal(styleChoices().font, 'default', 'a different account never inherits the heart font preference');
    signIn('heart-account', 'female'); await open();
    assert.equal(styleChoices().font, 'heart');

    signIn('gallery-account', 'female'); await open();
    const byId = id => document.getElementById(id);
    const picker = byId('photo-gallery-toggle'), jump = byId('photo-page-jump');
    const random = window.Math.random;
    for (const asset of [10, 189, 190, 225, 226, 261, 262, 297]) {
      close();
      window.Math.random = () => (asset - 10 + 0.5) / 288;
      await open();
      assert.ok(document.querySelector('.compose-photo').style.backgroundImage.includes('/' + asset + '.jpg'));
      assert.equal(run('chosenPhoto()'), 'plain', 'a randomly assigned photo or ink wash is free');
    }
    window.Math.random = random;
    const keys = [];
    picker.click();
    for (const [first, pageCount] of [[10,15], [190,3], [226,3], [262,3]]) {
      byId('photo-groups').querySelector(`button[value="${first}"]`).click();
      assert.equal(jump.options.length, pageCount);
      assert.ok(byId('photo-prev').disabled);
      for (const option of [...jump.options]) {
        jump.value = option.value;
        jump.dispatchEvent(new window.Event('change', { bubbles: true }));
        const inputs = byId('photo-grid').querySelectorAll('input[name="photo-choice"]');
        assert.equal(inputs.length, 12);
        keys.push(...Array.from(inputs, input => Number(input.value)));
      }
      assert.ok(byId('photo-next').disabled);
    }
    assert.deepEqual(keys, Array.from({ length: 288 }, (_, i) => i + 10), 'each background appears once');
    const last = byId('photo-grid').querySelector('input[value="297"]');
    last.click();
    assert.equal(run('chosenPhoto()'), '297');
    assert.match(byId('photo-featured-image').src, /\/297\.jpg$/);
    picker.click(); picker.click();
    assert.ok(byId('photo-grid').querySelector('input[value="297"]').checked);
    // A legacy draft can still carry an explicitly selected paid background.
    close(); await open();
    await run("restoreDraft({kind:'memo', parent_id:null, body:'수묵 배경', tags:'', background_key:'10', photo_key:'226'})");
    picker.click();
    assert.equal(run('chosenPhoto()'), '226');
    assert.ok(byId('photo-grid').querySelector('input[value="226"]').checked);
    close();

    signIn('blocked-storage', 'male');
    window.Storage.prototype.getItem = () => { throw new Error('blocked'); };
    window.Storage.prototype.setItem = () => { throw new Error('blocked'); };
    await open(); choose('nickname', 'private'); await locationClick();
    chooseStyle('handwriting', 'small', 17); close(); await open();
    assert.deepEqual(choices(), { identity: 'nickname', gender: 'private', location: false }, 'storage errors retain choices in the current session');
    assert.deepEqual(styleChoices(), { font: 'handwriting', size: 'small', boxTransparency: 17 });
    boot(null);
    const draws = [], posts = [];
    window.noteRpc = async (name, args) => {
      if (name === 'guest_card_background') return new Promise((resolve, reject) => {
        draws.push({ id: args.p_request_id, resolve, reject });
      });
      if (name === 'publish_guest_card') {
        posts.push({ ...args });
        return { card_id: window.crypto.randomUUID(), tags: [] };
      }
      return [];
    };
    const preview = () => document.querySelector('.compose-photo').style.backgroundImage;
    const write = body => {
      byId('compose-text').value = body;
      byId('compose-text').dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const first = run("openComposer('memo')");
    assert.equal(document.activeElement,byId('compose-text'),'guest writing focuses immediately while its background loads');
    assert.equal(byId('compose-text').disabled,false);
    await settle();
    assert.equal(document.querySelector('.compose-toolbar').hidden, true,
      'guests cannot use member-only option panels');
    assert.equal(byId('guest-compose-login').hidden, false);
    assert.equal(byId('convert-calligraphy').closest('.composer-body'), document.querySelector('.composer-body'),
      'guest conversion still leads to login from the writing screen');
    assert.equal(draws.length, 1);
    assert.doesNotMatch(preview(), /url\(/, 'a pending draw does not promise a different photo');
    close();
    const next = run("openComposer('memo')");
    await settle();
    assert.equal(draws.length, 2);
    assert.notEqual(draws[0].id, draws[1].id);
    write('수묵 배경으로 글 쓰기');
    byId('compose-text').setSelectionRange(1,4,'backward');
    const guestSelection=()=>[byId('compose-text').selectionStart,byId('compose-text').selectionEnd,byId('compose-text').selectionDirection];
    draws[1].resolve('297'); await next; await settle();
    assert.equal(document.activeElement,byId('compose-text'));
    assert.deepEqual(guestSelection(),[1,4,'backward'],'a late background preserves the selected writing');
    byId('close-composer').focus();
    draws[0].resolve('42'); await first; await settle();
    assert.equal(document.activeElement,byId('close-composer'),'stale background work does not steal focus back');
    assert.deepEqual(guestSelection(),[1,4,'backward']);
    assert.match(preview(), /\/297\.jpg/, 'a response from the closed composer cannot replace this preview');
    byId('publish-card').click(); await settle();
    assert.deepEqual(posts, [{ p_request_id: draws[1].id, p_body: '수묵 배경으로 글 쓰기', p_parent_id: null }]);

    const replyId = window.crypto.randomUUID();
    const reply = run("openComposer('reply', null, " + JSON.stringify(replyId) + ")");
    await settle();
    assert.equal(draws.length, 3);
    write('미리보기가 끊겨도 등록');
    byId('compose-text').setSelectionRange(2,5,'backward');byId('close-composer').focus();
    draws[2].reject(new Error('preview unavailable')); await reply; await settle();
    assert.equal(document.activeElement,byId('close-composer'),'a failed background does not move the current focus');
    assert.deepEqual(guestSelection(),[2,5,'backward']);
    assert.equal(byId('compose-text').value,'미리보기가 끊겨도 등록');
    assert.equal(byId('compose-text').disabled,false,'a background failure leaves the writing editable');
    assert.doesNotMatch(preview(), /url\(/);
    assert.equal(byId('publish-card').disabled, false);
    byId('publish-card').click(); await settle();
    assert.deepEqual(posts[1], { p_request_id: draws[2].id, p_body: '미리보기가 끊겨도 등록', p_parent_id: replyId });
    const saved = { id: replyId, kind: 'memo', body: '기존 글', tags: [], background_key: '42' };
    for (const expanded of [false, true]) {
      const element = window.cardElement(saved, false, expanded);
      assert.match(element.querySelector('.photo').style.backgroundImage, /\/42\.jpg/);
    }
    assert.equal(draws.length, 3, 'reading or rendering a saved card never draws a new background');

    await open();
    write('배경보다 먼저 등록');
    byId('publish-card').click(); await settle();
    assert.equal(posts[2].p_request_id, draws[3].id);
    signIn('returning-member', 'private');
    window.pendingGuest = { requestId: window.crypto.randomUUID(), backgroundKey: null,
      parent: null, body: '로그인 전 쓰던 원고', convert: false };
    await run("openComposer('memo', null, null, pendingGuest)");
    await settle();
    assert.equal(document.querySelector('.compose-toolbar').hidden, false,
      'member tools return after login');
    assert.equal(draws[4].id, window.pendingGuest.requestId, 'login resumes the same draw');
    draws[4].resolve('226'); await settle();
    draws[3].resolve('10'); await settle();
    assert.equal(byId('compose-text').value, window.pendingGuest.body);
    assert.match(preview(), /\/226\.jpg/);
    close();boot('shared-member','female');await open();
    run('watchLocationPreference(session.user.id)');await settle();
    await run(`(async()=>{
      const service=window.OjjudaLocation,id=session.user.id,p=await service.preference(client,id);
      await service.setPreference(client,id,false,p.version);
    })()`);await settle();
    assert.equal(choices().location,false,'Pajang/shared off updates the real Park switch');
    assert.equal(run('writingPosition'),null,'shared off clears the pending publishing location');
    await run(`(async()=>{
      const service=window.OjjudaLocation,id=session.user.id,p=await service.preference(client,id);
      await service.setPreference(client,id,true,p.version);
    })()`);await settle();
    assert.equal(choices().location,true,'shared on restores the Park switch');
    await locationClick();
    assert.equal((await run('window.OjjudaLocation.preference(client,session.user.id)')).enabled,false,'Park off is saved for Pajang');
    window.deferGeo=true;
    await run(`(async()=>{
      const service=window.OjjudaLocation,id=session.user.id,p=await service.preference(client,id);
      await service.setPreference(client,id,true,p.version);
    })()`);await settle();
    assert.equal(document.getElementById('card-location-button').disabled,false,'Park can turn off while an automatic fix is pending');
    await locationClick();
    window.resolveGeo({latitude:36,longitude:128});await settle();
    assert.equal(choices().location,false,'late automatic fix keeps the shared off choice');
    assert.equal(run('writingPosition'),null);
    run('stopLocationPreference()');
    close();boot('pending-identity','male');window.deferIdentity=true;
    run('myIdentityReady=false;myIdentity=null;');
    const identityOpener=document.querySelector('[data-compose="new"]');identityOpener.focus();
    const blockedOpen=run("openComposer('memo')");
    assert.equal(run('backdrop.hidden'),true,'unverified member identity still blocks opening the writer');
    assert.equal(document.activeElement,identityOpener);
    window.resolveIdentity({error:{message:'회원정보 확인 실패'}});await blockedOpen;
    assert.equal(run('backdrop.hidden'),true,'failed identity checks never open an editable composer');
    assert.equal(document.activeElement,identityOpener,'failed opening leaves focus on the initiating button');
    const verifiedOpen=run("openComposer('memo')");
    window.resolveIdentity({data:{gender:'male'}});await verifiedOpen;await settle();
    assert.equal(document.activeElement,document.getElementById('compose-text'),'a successfully verified opening focuses writing');
    assert.equal(document.getElementById('compose-text').disabled,false);
    assert.deepEqual(errors, []);
    console.log('PASS: one-panel composer toolbar, input identity, Escape, busy/edit/reply/event/guest boundaries; composer preferences, gallery, backgrounds, offline submission and login return.');
  } finally { dom?.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

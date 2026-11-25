const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const pajang = path.resolve(__dirname, '../features/pajang');
const {build} = createRequire(path.join(pajang, 'package.json'))('esbuild');
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setTimeout(resolve, 10));
const profileId = '11111111-1111-4111-8111-111111111111';
const emptyPreferences = () => ({
  relationship_intents:['friendship'], meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[],
  custom:{meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[]},
});
let bundle;

async function waitFor(predicate, message) {
  const until = Date.now() + 2000;
  do {
    if (predicate()) return;
    await turn();
  } while (Date.now() < until);
  assert.ok(predicate(), message);
}

async function editorBundle() {
  if (!bundle) {
    bundle = build({
      stdin: {
        contents: `
          import {createRoot} from 'react-dom/client';
          import {ExchangeProfileEditor, PeerProfile} from './src/app/exchange-profile';
          let root;
          window.mountEditor = () => {
            root = createRoot(document.getElementById('root'));
            root.render(<ExchangeProfileEditor profileId={window.profileId} onSaved={saved => window.profileSaved(saved)}/>);
          };
          window.showPeerProfile = profile => root.render(<PeerProfile profile={profile}/>);
          window.unmountEditor = () => { root?.unmount(); root = null; };
          window.mountEditor();
        `,
        resolveDir: pajang,
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      define: {'process.env.NODE_ENV': '"production"'},
    }).then(result => result.outputFiles[0].text);
  }
  return bundle;
}

// The actual editor runs against an in-memory RPC boundary. These tests never
// access a member account, live Supabase data, or browser authentication state.
async function fixture(t, {fields = {}, profile = {}, save, read, ready = true} = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://ojjuda.kr/features/pajang/station.html?tab=profile',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const {window} = dom;
  const state = {
    calls: [],
    successes: 0,
    profile: {fields: copy(fields), age: 35, gender: '남성', showAge: false, showGender: false,
      person: profileId, name:'보리', region:'서울특별시', interest: 'book', preferences: emptyPreferences(), preferencesVersion: 3, ...profile},
  };
  window.profileId = profileId;
  window.pajangArt = {};
  window.profileSaved = saved => { state.successes++; state.saved = copy(saved); };
  window.OjjudaGetClient = async () => ({
    async rpc(name, args) {
      assert.equal(name, 'pajang_profile_details');
      state.calls.push(copy(args));
      if (args.p_action === 'mine') {
        const override = await read?.(state.calls.filter(call => call.p_action === 'mine').length, copy(state.profile));
        return override || {data: copy(state.profile), error: null};
      }
      assert.equal(args.p_action, 'save');
      const attempt = state.calls.filter(call => call.p_action === 'save').length;
      assert.equal(args.p_data.profilePerson, profileId);
      assert.equal(args.p_data.preferencesVersion, state.profile.preferencesVersion);
      assert.ok(Object.hasOwn(args.p_data.preferences, 'relationship_intents'));
      const nextFields = copy(args.p_data.fields);
      if (Object.hasOwn(nextFields, 'height')) nextFields.height = Number(nextFields.height);
      const next = {...state.profile, ...(args.p_data.avatar ? {avatar:copy(args.p_data.avatar)} : {}), fields:nextFields, name:args.p_data.name.trim(), region:args.p_data.region,
        showAge:args.p_data.showAge??state.profile.showAge, showGender:args.p_data.showGender??state.profile.showGender,
        interest:args.p_data.interest, preferencesVersion:state.profile.preferencesVersion + 1,
        preferences:{...state.profile.preferences,...copy(args.p_data.preferences)}};
      const override = await save?.(copy(args.p_data), attempt, copy(next));
      if (override) return override;
      state.profile = next;
      return {data: copy(state.profile), error: null};
    },
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.eval(await editorBundle());
  t.after(() => {
    window.unmountEditor?.();
    window.close();
  });
  const form = () => window.document.querySelector('form');
  const saveButton = () => form()?.querySelector('button[type="submit"]');
  const isReady = () => saveButton() && !saveButton().disabled &&
    form().querySelector('[aria-label="만남 스타일 직접 입력"]');
  if (ready) await waitFor(isReady, 'the complete profile draft should finish loading');
  const control = label => {
    const element = [...window.document.querySelectorAll('input,select,textarea')].find(input =>
      input.getAttribute('aria-label') === label ||
      [...input.labels].some(item => item.textContent.trim().startsWith(label)));
    assert.ok(element, `missing profile control: ${label}`);
    return element;
  };
  return {
    window, state, form, control, saveButton, isReady,
    button: label => [...window.document.querySelectorAll('button')].find(button =>
      button.getAttribute('aria-label') === label || button.textContent.trim() === label),
    saves: () => state.calls.filter(call => call.p_action === 'save'),
    alert: () => window.document.querySelector('[role="alert"]'),
    async set(label, value) {
      const element = control(label);
      if (element.type === 'checkbox') {
        if (element.checked !== value) element.click();
      } else {
        const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype :
          element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
      }
      await turn();
    },
    submit() { form().requestSubmit(); },
    async reopen({ready = true} = {}) {
      window.unmountEditor();
      window.mountEditor();
      if (ready) await waitFor(isReady, 'the saved profile should reopen with its choices');
    },
    async showPeer() {
      window.showPeerProfile({fields: copy(state.profile.fields), age: null, gender: null});
      await waitFor(() => window.document.querySelector('.exchange-facts'), 'the shared profile should render');
      return Object.fromEntries([...window.document.querySelectorAll('.exchange-facts > div')].map(row =>
        [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    },
  };
}

test('one profile editor saves public name, region, intentions, tastes and private details together', async t => {
  const f = await fixture(t, {fields:{drinking:'가끔 마셔요', smoking:'피우지 않아요', bio:'기존 소개'}});
  assert.equal([...f.form().querySelectorAll('summary')].some(el=>el.textContent.trim()==='공개 설정'),false);
  const headings = [...f.form().querySelectorAll('h3')];
  const tastes = headings.find(node => node.textContent === '나를 표현하는 취향');
  const artwork = f.form().querySelector('.profile-art-choice');
  assert.ok(tastes && artwork, 'all moved public choices belong to the detailed editor');
  assert.ok(f.form().querySelector('.unified-public-profile')?.contains(tastes),
    'self-expression tastes belong to the public profile fieldset');
  assert.equal(f.form().querySelector('.unified-private-profile')?.open,true,
    'exchange-only fields start expanded but remain private to approved peers');
  const follows = (before, after) => Boolean(before.compareDocumentPosition(after) & f.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(follows(f.control('닉네임'), tastes));
  assert.ok(follows(f.control('공개할 활동 지역 시·도'), tastes));
  assert.ok(follows(tastes, artwork));
  assert.ok(follows(artwork, f.control('음주 여부')));
  assert.ok(follows(f.control('음주 여부'), f.control('자기소개')));
  assert.ok([...f.form().querySelectorAll('legend')].some(node => node.textContent === '원하는 인연'),
    'relationship intentions are in the same editor');
  assert.equal(tastes.closest('.unified-public-profile').querySelector('legend').textContent, '공개 프로필',
    'public choices remain grouped under the public profile heading');
  assert.equal(f.button('독서').getAttribute('aria-pressed'), 'true', 'saved artwork is hydrated before saving is enabled');
  await f.set('닉네임','새 보리');
  await f.set('공개할 활동 지역 시·도','경기도');
  f.button('대화 상대').click();
  f.button('차분한 대화').click();
  await f.set('만남 스타일 직접 입력', '  별 보며 걷기  ');
  f.button('카페').click();
  await f.set('자기소개', '취향과 함께 바꿀 소개');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'one complete profile save should succeed');
  const [saved] = f.saves();
  assert.equal(f.saves().length, 1, 'one RPC saves private fields, public tastes and artwork');
  assert.equal(saved.p_data.profilePerson, profileId);
  assert.equal(saved.p_data.preferencesVersion, 3);
  assert.deepEqual(Object.keys(saved.p_data.preferences).sort(),
    ['relationship_intents','meeting_styles','relationship_values','affection_styles','life_priorities','custom'].sort());
  assert.equal(saved.p_data.name,'새 보리');
  assert.equal(saved.p_data.region,'경기도');
  assert.deepEqual(saved.p_data.preferences.relationship_intents,['friendship','conversation']);
  assert.deepEqual(saved.p_data.preferences.meeting_styles, ['deep_talk']);
  assert.deepEqual(saved.p_data.preferences.custom.meeting_styles, ['별 보며 걷기']);
  assert.equal(saved.p_data.interest, 'coffee');
  assert.equal(saved.p_data.fields.bio, '취향과 함께 바꿀 소개');
  assert.deepEqual(f.state.profile.preferences.relationship_intents, ['friendship','conversation'], 'relationship intentions are saved with the other fields');
  assert.equal(f.state.saved.preferencesVersion, 4, 'the caller receives the canonical saved public version');
  await f.reopen();
  assert.equal(f.button('차분한 대화').getAttribute('aria-pressed'), 'true');
  assert.ok(f.button('별 보며 걷기 삭제'));
  assert.equal(f.button('카페').getAttribute('aria-pressed'), 'true');
  assert.equal(f.control('자기소개').value, '취향과 함께 바꿀 소개');
  assert.equal(f.control('닉네임').value,'새 보리');
  assert.equal(f.control('공개할 활동 지역 시·도').value,'경기도');
});

test('a delayed complete-profile read cannot expose an empty editable taste draft', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, {ready:false, read:async (_attempt, profile) => {
    await pending;
    return {data:{...profile,preferences:{...profile.preferences,meeting_styles:['deep_talk']}},error:null};
  }});
  await waitFor(() => f.state.calls.length === 1, 'the complete profile read should start');
  assert.ok(!f.saveButton() || f.saveButton().disabled, 'saving is unavailable until the choices arrive');
  assert.equal(f.button('차분한 대화'), undefined, 'an empty editable choice list is not shown while loading');
  assert.equal(f.saves().length, 0);
  release();
  await waitFor(f.isReady, 'the loaded choices should become editable');
  assert.equal(f.button('차분한 대화').getAttribute('aria-pressed'), 'true');
  assert.equal(f.button('독서').getAttribute('aria-pressed'), 'true');
});

test('fractional height saves, accepts the numeric server response, and survives reopening', async t => {
  const f = await fixture(t, {fields: {height: 175, job: '책방지기'}});
  await f.set('키 (cm)', '175.5');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'a valid decimal height should save');
  assert.equal(f.saves().length, 1);
  assert.equal(Number(f.saves()[0].p_data.fields.height), 175.5);
  assert.equal(f.state.profile.fields.height, 175.5);
  await f.reopen();
  assert.equal(f.control('키 (cm)').value, '175.5');
  assert.equal(f.control('직업').value, '책방지기');
});

test('editing profile fields trims text, deletes cleared values, and preserves visibility choices', async t => {
  const f = await fixture(t, {fields: {job: '이전 직업', hobbies: '지울 취미', bio: '이전 소개'}});
  await f.set('결혼 이력', '돌싱');
  await f.set('직업', '  책방지기 ! ? , ~ - * @ .  ');
  await f.set('사는 지역 시·도', '경기도');
  await f.set('시·군', '수원시');
  await f.set('키 (cm)', '180');
  await f.set('MBTI', 'INTJ');
  await f.set('혈액형', 'AB');
  await f.set('특기', '  글쓰기와 사진  ');
  await f.set('취미', '   ');
  await f.set('음주 여부', '가끔 마셔요');
  await f.set('흡연 여부', '피우지 않아요');
  await f.set('자기소개', '  반가워요!\n함께 산책해요.  ');
  await f.set('나이', true);
  await f.set('성별', true);
  f.submit();
  await waitFor(() => f.state.successes === 1, 'edited fields should save');
  const payload = f.saves()[0].p_data;
  assert.deepEqual({...payload.fields, height: Number(payload.fields.height)}, {
    relationship: '돌싱', job: '책방지기 ! ? , ~ - * @ .', region: '경기도 수원시', height: 180,
    mbti: 'INTJ', bloodType: 'AB', skills: '글쓰기와 사진', drinking: '가끔 마셔요',
    smoking: '피우지 않아요', bio: '반가워요!\n함께 산책해요.',
  });
  assert.equal(payload.showAge, true);
  assert.equal(payload.showGender, true);
  await f.reopen();
  assert.equal(f.control('취미').value, '');
  assert.equal(f.control('직업').value, '책방지기 ! ? , ~ - * @ .');
  assert.equal(f.control('자기소개').value, '반가워요!\n함께 산책해요.');
  assert.equal(f.control('나이').checked, true);
  assert.equal(f.control('성별').checked, true);
});

test('religion can be entered, edited, cleared, reopened, and displayed in the shared profile', async t => {
  const f = await fixture(t, {fields: {job: '책방지기', bio: '그대로 남길 소개'}});
  assert.equal(f.control('나의 신앙 (선택)').type, 'text');
  assert.equal(f.control('나의 신앙 (선택)').required, false);
  assert.equal(f.control('나의 신앙 (선택)').value, '');

  await f.set('나의 신앙 (선택)', '  천주교  ');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'a newly entered religion should save');
  assert.equal(f.saves()[0].p_data.fields.religion, '천주교');
  await f.reopen();
  assert.equal(f.control('나의 신앙 (선택)').value, '천주교');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 신앙: '천주교', 자기소개: '그대로 남길 소개'});

  await f.reopen();
  await f.set('나의 신앙 (선택)', '  기독교 · 개신교  ');
  f.submit();
  await waitFor(() => f.state.successes === 2, 'an edited religion should replace the saved value');
  assert.equal(f.saves()[1].p_data.fields.religion, '기독교 · 개신교');
  await f.reopen();
  assert.equal(f.control('나의 신앙 (선택)').value, '기독교 · 개신교');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 신앙: '기독교 · 개신교', 자기소개: '그대로 남길 소개'});

  await f.reopen();
  await f.set('나의 신앙 (선택)', '   ');
  f.submit();
  await waitFor(() => f.state.successes === 3, 'clearing religion should remove the saved value');
  assert.equal(Object.hasOwn(f.saves()[2].p_data.fields, 'religion'), false);
  assert.equal(Object.hasOwn(f.state.profile.fields, 'religion'), false);
  await f.reopen();
  assert.equal(f.control('나의 신앙 (선택)').value, '');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 자기소개: '그대로 남길 소개'});
  assert.equal(f.saves().length, 3);
});

test('an RPC failure keeps the draft, shows the error near save, and allows retry', async t => {
  const f = await fixture(t, {save: (_data, attempt) => attempt === 1 ? {
    data: null, error: {message: '연결을 확인하고 다시 시도해 주세요.', code: '08006'},
  } : undefined});
  await f.set('직업', '다시 저장할 직업');
  f.button('차분한 대화').click();
  await waitFor(() => f.button('차분한 대화').getAttribute('aria-pressed') === 'true', 'the preset click should be committed before the next choice');
  f.button('카페').click();
  await f.set('만남 스타일 직접 입력', '다시 저장할 취향');
  f.submit();
  await waitFor(() => f.alert(), 'a failed request should display an error');
  assert.equal(f.state.successes, 0);
  assert.match(f.alert().textContent, /연결/);
  assert.ok(f.alert().closest('form') === f.form(), 'the error should be inside the form near the save button');
  assert.equal(f.control('직업').value, '다시 저장할 직업');
  assert.equal(f.control('만남 스타일 직접 입력').value, '다시 저장할 취향');
  assert.equal(f.button('차분한 대화').getAttribute('aria-pressed'), 'true');
  assert.equal(f.button('카페').getAttribute('aria-pressed'), 'true');
  assert.equal(f.state.profile.preferencesVersion, 3, 'a failed atomic save leaves the saved version unchanged');
  await waitFor(() => !f.saveButton().disabled, 'save should be available for retry');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'retry should succeed');
  assert.equal(f.saves().length, 2);
  assert.equal(f.state.profile.fields.job, '다시 저장할 직업');
  assert.deepEqual(f.state.profile.preferences.custom.meeting_styles, ['다시 저장할 취향']);
  assert.deepEqual(f.saves().map(call => call.p_data.preferencesVersion), [3,3]);
  assert.ok(!f.alert(), 'a successful retry should clear the error');
});

test('an out-of-range height shows a Korean error without sending a save request', async t => {
  const f = await fixture(t);
  await f.set('키 (cm)', '301');
  f.submit();
  await waitFor(() => f.alert(), 'native validation should produce a visible inline error');
  assert.equal(f.saves().length, 0);
  assert.equal(f.state.successes, 0);
  assert.match(f.alert().textContent, /[가-힣]/);
  assert.match(f.alert().textContent, /키|300|센티미터/);
  assert.equal(f.control('키 (cm)').value, '301', 'invalid input remains available to correct');
});

test('a successful HTTP response that omits an edited field is not reported as saved', async t => {
  const f = await fixture(t, {save: (_data, _attempt, next) => ({
    data: {...next, fields: {}},
    error: null,
  })});
  await f.set('직업', '응답에서 사라진 직업');
  f.submit();
  await waitFor(() => f.alert(), 'a mismatched saved profile should display an error');
  assert.equal(f.saves().length, 1);
  assert.equal(f.state.successes, 0);
  assert.equal(f.control('직업').value, '응답에서 사라진 직업');
  assert.match(f.alert().textContent, /[가-힣]/);
});

test('a successful HTTP response without public choices is not reported as a complete save', async t => {
  const f = await fixture(t, {save: (_data, _attempt, next) => {
    delete next.preferences;
    return {data:next,error:null};
  }});
  await f.set('직업', '저장 확인이 필요한 직업');
  f.button('차분한 대화').click();
  f.submit();
  await waitFor(() => f.alert(), 'a partial canonical response should be rejected');
  assert.equal(f.saves().length, 1);
  assert.equal(f.state.successes, 0);
  assert.equal(f.control('직업').value, '저장 확인이 필요한 직업');
  assert.equal(f.button('차분한 대화').getAttribute('aria-pressed'), 'true');
});

test('two submits while saving send one RPC and report success once', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, {save: () => pending});
  await f.set('직업', '한 번만 저장');
  f.submit();
  f.submit();
  await waitFor(() => f.saves().length === 1, 'one save request should start');
  await turn();
  assert.equal(f.saves().length, 1);
  assert.equal(f.state.successes, 0);
  assert.ok(f.saveButton().disabled);
  release();
  await waitFor(() => f.state.successes === 1, 'the pending save should finish once');
  assert.equal(f.saves().length, 1);
});

test('the female catalog has 102 outfits with the short variant on the left and a separate backdrop', async t => {
  const f = await fixture(t,{profile:{gender:'여성',showGender:true,avatarCollection:'female'}});
  const avatar = () => f.form().querySelector('[aria-label="내 캐릭터"]');
  const stage = () => avatar().querySelector('[role="img"]');
  assert.equal(stage().getAttribute('aria-label'), '흰 티와 청바지 전신형 · 배경 없음');
  assert.equal(avatar().querySelectorAll('.pj-character-figure').length, 1);
  assert.equal(f.button('배경 선택').getAttribute('aria-expanded'), 'false');
  f.button('캐릭터 선택').click();
  await turn();
  assert.ok(!f.button('남자'));
  const names = new Set();
  for (let page = 1; page <= 13; page++) {
    for (const pair of avatar().querySelectorAll('.pj-avatar-pair')) {
      const buttons = [...pair.querySelectorAll('button')];
      assert.deepEqual(buttons.map(b => b.textContent), ['대두형','전신형']);
      for(const button of buttons)assert.match(button.querySelector('.pj-character-figure').style.backgroundImage,/\/avatars-20261125-\d{2}\.webp/);
      names.add(pair.parentElement.querySelector('strong').textContent);
    }
    if (page < 13) { f.button('다음').click(); await turn(); }
  }
  assert.equal(names.size, 102);
  for(const name of ['정류장의 오후','갤러리 산책'])assert.ok(names.has(name));
  await f.set('캐릭터 검색', '책방 가는 날');
  assert.equal(avatar().querySelectorAll('.pj-avatar-pair').length,0,'search cannot reach the other catalog');
  await f.set('캐릭터 검색', '회색 후디');
  f.button('회색 후디 대두형').click();
  await turn();
  f.button('배경 선택').click();
  await turn();
  f.button('장미 정원').click();
  await turn();
  assert.equal(avatar().querySelectorAll('.pj-character-figure').length, 1);
  assert.equal(stage().getAttribute('aria-label'), '회색 후디 대두형 · 배경 장미 정원');
  assert.equal(f.saves().length, 0);
  f.submit();
  await waitFor(() => f.state.successes === 1, 'avatar should save with profile');
  assert.deepEqual(f.saves()[0].p_data.previousAvatar, {id:1,form:'full',bg:0});
  assert.deepEqual(f.state.profile.avatar, {id:2,form:'mini',bg:2});
  await f.reopen();
  assert.equal(stage().getAttribute('aria-label'), '회색 후디 대두형 · 배경 장미 정원');
  assert.equal(avatar().querySelectorAll('.pj-character-figure').length, 1);
});

test('102 male outfits reuse every existing backdrop and reopen on the saved pair', async t => {
  const f = await fixture(t,{profile:{gender:'남성',showGender:true,avatarCollection:'male'}});
  const region = () => f.form().querySelector('[aria-label="내 캐릭터"]');
  const stage = () => region().querySelector('[role="img"]');
  const click = async label => { f.button(label).click(); await turn(); };
  const backgrounds = () => [...region().querySelectorAll('.pj-avatar-scenes button')]
    .map(b => [b.textContent.trim(), b.querySelector('img')?.getAttribute('src') ?? null]);
  assert.match(stage().querySelector('.pj-character-figure').style.backgroundImage,/avatars-male-20261125-01\.webp/);

  await click('배경 선택');
  const sharedBackgrounds = backgrounds();
  assert.equal(sharedBackgrounds.length, 9);
  assert.deepEqual(sharedBackgrounds.map(([,src]) => src), [null,
    ...Array.from({length:8}, (_,i) => '/features/pajang/assets/avatar-bg-20261125-' + (i + 1) + '.webp')]);
  const chosenBackground = sharedBackgrounds[8][0];
  await click(chosenBackground);
  await click('캐릭터 선택');
  const sheet = f.window.document.createElement('style');
  sheet.textContent = require('node:fs').readFileSync(path.join(pajang, 'letterroom.css'), 'utf8');
  f.window.document.head.append(sheet);
  const frameHeight = form => f.window.getComputedStyle(region().querySelector('.pj-avatar-pair .' + form)).height;
  assert.ok(frameHeight('full'));
  assert.ok(!f.button('여자'));
  await f.set('캐릭터 검색','회색 후디');
  assert.equal(region().querySelectorAll('.pj-avatar-pair').length,0);
  await f.set('캐릭터 검색','');
  assert.equal(frameHeight('mini'), frameHeight('full'), 'the male art already contains its intended height ratio');

  const looks = [];
  const sprites = new Set();
  for (let page = 0; page < 13; page++) {
    for (const card of region().querySelectorAll('.pj-avatar-card')) {
      const pair = [...card.querySelectorAll('.pj-avatar-pair button')];
      assert.deepEqual(pair.map(b => b.textContent), ['대두형','전신형']);
      const atlas = String(Math.floor(looks.length / 4) + 1).padStart(2,'0');
      for (const button of pair) {
        const figure = button.querySelector('.pj-character-figure');
        assert.ok(figure.style.backgroundImage.includes('avatars-male-20261125-' + atlas + '.webp'));
        sprites.add(figure.style.backgroundImage + ' ' + figure.style.backgroundPosition);
      }
      looks.push(card.querySelector('strong').textContent);
    }
    if (page < 12) await click('다음');
  }
  assert.equal(looks.length, 102);
  assert.equal(new Set(looks).size, 102);
  assert.equal(sprites.size, 204);

  const lastShort = looks[101] + ' 대두형';
  await click(lastShort);
  assert.equal(region().querySelectorAll('.pj-character-figure').length, 1);
  assert.ok(stage().querySelector('.pj-character-figure').style.backgroundImage.includes('avatars-male-20261125-26.webp'));
  assert.ok(stage().getAttribute('aria-label').includes(chosenBackground));
  await click('배경 선택');
  assert.deepEqual(backgrounds(), sharedBackgrounds);
  await click(chosenBackground);
  f.submit();
  await waitFor(() => f.state.successes === 1, 'male outfit and shared backdrop should save');

  await f.reopen();
  assert.ok(stage().getAttribute('aria-label').includes(looks[101]));
  assert.ok(stage().getAttribute('aria-label').includes(chosenBackground));
  await click('캐릭터 선택');
  assert.equal(f.button(lastShort).getAttribute('aria-pressed'), 'true');
  assert.ok(f.button('다음').disabled);
  assert.ok(!f.button('여자'));
  assert.deepEqual(f.saves()[0].p_data.avatar, {id:205,form:'mini',bg:8});
  assert.ok(f.state.calls.every(call => call.p_data.avatarCatalog === 3));
});

test('an older profile read uses the registered gender and preserves the original avatar for conflict detection',async t=>{
  for(const [gender,oldId,newId] of [['남성',2,103],['여성',102,3]]){
    await t.test(gender,async t=>{
      const previous={id:oldId,form:'mini',bg:4};
      const f=await fixture(t,{profile:{gender,showGender:true,avatar:previous},save:(_data,attempt)=>
        attempt===1?{data:null,error:{code:'40001',message:'다른 화면에서 변경했어요.'}}:undefined});
      const character=f.form().querySelector('[aria-label="내 캐릭터"]');
      const stage=()=>character.querySelector('.pj-avatar-stage').getAttribute('aria-label');
      assert.ok(stage().startsWith(gender==='남성'?'책방 가는 날':'회색 후디'));
      f.button('캐릭터 선택').click();await turn();
      character.querySelectorAll('.pj-avatar-pair')[2].querySelector('button').click();await turn();
      const selected=stage();
      f.submit();await waitFor(()=>!!f.alert(),'a conflicting save leaves the editor open');
      assert.equal(stage(),selected);
      assert.deepEqual(f.saves()[0].p_data.previousAvatar,previous);
      f.submit();await waitFor(()=>f.state.successes===1,'a valid retry can save the chosen outfit');
      assert.deepEqual(f.saves()[1].p_data.previousAvatar,previous);
      assert.deepEqual(f.state.profile.avatar,{id:newId,form:'mini',bg:4});
    });
  }
});

test('hiding gender keeps the private catalog restricted and previews the tree for either collection',async t=>{
  for(const collection of ['female','male']){
    await t.test(collection,async t=>{
      const f=await fixture(t,{profile:{gender:null,showGender:false,avatarCollection:collection}});
      const stage=()=>f.form().querySelector('.pj-avatar-stage');
      assert.match(stage().getAttribute('aria-label'),/^나무 분장/);
      f.button('캐릭터 선택').click();await turn();
      assert.equal(f.button(collection==='male'?'여자':'남자'),undefined);
      const name=collection==='male'?'책방 가는 날':'회색 후디';
      f.button(name+' 대두형').click();await turn();
      assert.match(stage().getAttribute('aria-label'),/^나무 분장 대두형/);
      f.submit();await waitFor(()=>f.state.successes===1,'private selection saves under the costume');
      assert.deepEqual(f.state.profile.avatar,{id:collection==='male'?102:2,form:'mini',bg:0});
    });
  }
});

test('a missing registration gender permits a shared backdrop and profile edits without unlocking either catalog',async t=>{
  const avatar={id:147,form:'mini',bg:0};
  const f=await fixture(t,{profile:{gender:'여성',avatarCollection:null,avatar}});
  assert.ok(f.button('캐릭터 선택').disabled,'explicitly unregistered takes precedence over public gender and outfit');
  await f.set('닉네임','새 보리');
  f.button('배경 선택').click();await turn();
  f.button('장미 정원').click();await turn();
  f.submit();await waitFor(()=>f.state.successes===1,'background and public fields can still save');
  assert.deepEqual(f.saves()[0].p_data.previousAvatar,avatar);
  assert.deepEqual(f.saves()[0].p_data.avatar,{...avatar,bg:2});
  assert.equal(f.saves()[0].p_data.name,'새 보리');
});

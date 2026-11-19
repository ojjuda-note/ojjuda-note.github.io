const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const pajang = path.resolve(__dirname, '../features/pajang');
const {build} = createRequire(path.join(pajang, 'package.json'))('esbuild');
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setTimeout(resolve, 10));
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
            root.render(<ExchangeProfileEditor onSaved={() => window.profileSaved()}/>);
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
async function fixture(t, {fields = {}, save} = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://ojjuda.kr/features/pajang/station.html?tab=profile',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const {window} = dom;
  const state = {
    calls: [],
    successes: 0,
    profile: {fields: copy(fields), age: 35, gender: '남성', showAge: false, showGender: false},
  };
  window.profileSaved = () => state.successes++;
  window.OjjudaGetClient = async () => ({
    async rpc(name, args) {
      assert.equal(name, 'pajang_exchange');
      state.calls.push(copy(args));
      if (args.p_action === 'mine') return {data: copy(state.profile), error: null};
      assert.equal(args.p_action, 'save');
      const attempt = state.calls.filter(call => call.p_action === 'save').length;
      const override = await save?.(copy(args.p_data), attempt);
      if (override) return override;
      const nextFields = copy(args.p_data.fields);
      if (Object.hasOwn(nextFields, 'height')) nextFields.height = Number(nextFields.height);
      state.profile = {...state.profile, ...copy(args.p_data), fields: nextFields};
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
  await waitFor(form, 'the profile editor should finish loading');
  const control = label => {
    const element = [...window.document.querySelectorAll('input,select,textarea')].find(input =>
      input.getAttribute('aria-label') === label ||
      [...input.labels].some(item => item.textContent.trim().startsWith(label)));
    assert.ok(element, `missing profile control: ${label}`);
    return element;
  };
  return {
    window, state, form, control,
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
    async reopen() {
      window.unmountEditor();
      window.mountEditor();
      await waitFor(form, 'the saved profile should reopen');
    },
    async showPeer() {
      window.showPeerProfile({fields: copy(state.profile.fields), age: null, gender: null});
      await waitFor(() => window.document.querySelector('.exchange-facts'), 'the shared profile should render');
      return Object.fromEntries([...window.document.querySelectorAll('.exchange-facts > div')].map(row =>
        [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    },
  };
}

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
  assert.equal(f.control('종교').type, 'text');
  assert.equal(f.control('종교').required, false);
  assert.equal(f.control('종교').value, '');

  await f.set('종교', '  천주교  ');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'a newly entered religion should save');
  assert.equal(f.saves()[0].p_data.fields.religion, '천주교');
  await f.reopen();
  assert.equal(f.control('종교').value, '천주교');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 종교: '천주교', 자기소개: '그대로 남길 소개'});

  await f.reopen();
  await f.set('종교', '  기독교 · 개신교  ');
  f.submit();
  await waitFor(() => f.state.successes === 2, 'an edited religion should replace the saved value');
  assert.equal(f.saves()[1].p_data.fields.religion, '기독교 · 개신교');
  await f.reopen();
  assert.equal(f.control('종교').value, '기독교 · 개신교');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 종교: '기독교 · 개신교', 자기소개: '그대로 남길 소개'});

  await f.reopen();
  await f.set('종교', '   ');
  f.submit();
  await waitFor(() => f.state.successes === 3, 'clearing religion should remove the saved value');
  assert.equal(Object.hasOwn(f.saves()[2].p_data.fields, 'religion'), false);
  assert.equal(Object.hasOwn(f.state.profile.fields, 'religion'), false);
  await f.reopen();
  assert.equal(f.control('종교').value, '');
  assert.deepEqual(await f.showPeer(), {직업: '책방지기', 자기소개: '그대로 남길 소개'});
  assert.equal(f.saves().length, 3);
});

test('an RPC failure keeps the draft, shows the error near save, and allows retry', async t => {
  const f = await fixture(t, {save: (_data, attempt) => attempt === 1 ? {
    data: null, error: {message: '연결을 확인하고 다시 시도해 주세요.', code: '08006'},
  } : undefined});
  await f.set('직업', '다시 저장할 직업');
  f.submit();
  await waitFor(() => f.alert(), 'a failed request should display an error');
  assert.equal(f.state.successes, 0);
  assert.match(f.alert().textContent, /연결/);
  assert.ok(f.alert().closest('form') === f.form(), 'the error should be inside the form near the save button');
  assert.equal(f.control('직업').value, '다시 저장할 직업');
  await waitFor(() => !f.form().querySelector('button').disabled, 'save should be available for retry');
  f.submit();
  await waitFor(() => f.state.successes === 1, 'retry should succeed');
  assert.equal(f.saves().length, 2);
  assert.equal(f.state.profile.fields.job, '다시 저장할 직업');
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
  const f = await fixture(t, {save: data => ({
    data: {fields: {}, age: 35, gender: '남성', showAge: data.showAge, showGender: data.showGender},
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
  assert.ok(f.form().querySelector('button').disabled);
  release();
  await waitFor(() => f.state.successes === 1, 'the pending save should finish once');
  assert.equal(f.saves().length, 1);
});

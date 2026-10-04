const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const identity = require('../signup-identity.js');
const source = fs.readFileSync(path.join(__dirname, '../portal.js'), 'utf8');

// Exercise the real controller with a fake Auth service: no accounts or emails are created.
function setup(query, { user = null, confirmed = false, sessionError = false, recoveryError = null, recoveryVerified = true, resetError = null } = {}) {
  let clock = Date.now();
  const elements = new Map(), tasks = [], navigations = [], signups = [], recoveries = [], storage = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      hidden: false, disabled: false, value: '', checked: false, textContent: '',
      firstChild: { textContent: '' }, dataset: {}, attributes: {}, listeners: {}, open: false,
      addEventListener(name, callback) { this.listeners[name] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      closest(selector) { return element(`${key}:${selector}`); },
      querySelector(selector) { return selector.startsWith('#') ? element(selector.slice(1)) : element(selector); },
      querySelectorAll(selector) { return selector === '[data-auth-mode]' ? tabs : []; },
      focus() {}, scrollIntoView() {}, reset() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    });
    return elements.get(key);
  };
  const tabs = ['login', 'signup'].map(mode => { const e = element(`${mode}-tab`); e.dataset.authMode = mode; return e; });
  const location = new URL(`https://ojjuda.kr/${query}`);
  location.assign = value => navigations.push(value);
  let authListener;
  const account = user ? { user } : null;
  const client = {
    auth: {
      onAuthStateChange(callback) { authListener = callback; },
      async getSession() { if (sessionError) throw new Error('network'); return { data: { session: account } }; },
      async getUser() { return { data: { user } }; },
      async signUp(args) {
        signups.push(args);
        return { data: { session: confirmed ? { user: { id: 'new-member', email: args.email } } : null } };
      }
    },
    functions: { async invoke(name, args) { recoveries.push({ name, ...args }); const error = args.body.action === 'reset' ? resetError : recoveryError; return error ? { error: { context: { json: async () => ({ error }) } } } : { data: args.body.action === 'reset' ? { reset: true } : { verified: recoveryVerified, reset_token: 'a'.repeat(64), expires_in: 300 } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; } }; },
    async rpc() { return { data: true }; }
  };
  const context = {
    window: { OJJUDA_CONFIG: { supabaseUrl: 'https://example.test', supabaseKey: 'test' }, supabase: { createClient: () => client }, OjjudaIdentity: identity },
    document: { getElementById: element, querySelector: element, querySelectorAll: () => [] },
    Date: class extends Date { static now() { return clock; } },
    location, URL, URLSearchParams, console: { warn() {}, error() {} },
    history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setTimeout: callback => tasks.push(callback)
  };
  vm.runInNewContext(source, context);
  const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); while (tasks.length) tasks.shift()(); } };
  const emit = async (event, session) => { authListener(event, session); await flush(); };
  const submit = async () => { await element('auth-form').listeners.submit({ preventDefault() {} }); await flush(); };
  const fill = () => {
    for (const [key, value] of Object.entries({ nickname: '테스트', email: 'signup-test@example.invalid', password: 'test-password', 'password-confirm': 'test-password', 'signup-birth': '000101', 'signup-code': '3', 'signup-phone': '010-1234-5678' })) element(key).value = value;
    element('age-check').checked = element('policy-check').checked = true;
  };
  return { element, flush, emit, submit, fill, navigations, signups, recoveries, storage, location, advance: ms => { clock += ms; } };
}

(async () => {
  const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  const renderer = world.slice(world.indexOf('function nr('), world.indexOf('function J1('));
  const worldRoutes = [];
  vm.runInNewContext(`${renderer}; nr('signup'); nr('forgot');`, {
    ha: 'login', location: { assign: url => worldRoutes.push(url) },
    qr() { throw new Error('World must use the common signup form'); }
  });
  assert.deepEqual(worldRoutes, ['/?auth=signup&next=world', '/?auth=forgot&next=world']);
  for (const destination of ['world', 'note']) {
    const app = setup(`?auth=signup&next=${destination}`); await app.flush();
    assert.equal(app.element('auth-dialog').open, true);
    assert.equal(app.element('signup-tab').attributes['aria-selected'], 'true');
    assert.equal(app.element('auth-title').textContent, '오쭈다 월드');
    assert.equal(app.element('.password-confirm-field').hidden, false);
    assert.equal(app.element('password-confirm-label').textContent, '비밀번호 확인');
    assert.equal(app.element('password-confirm').required, true);
    assert.equal(app.element('password-confirm').disabled, false);
    assert.equal(app.location.searchParams.get('auth'), null);
    app.fill(); await app.submit();
    assert.equal(app.signups.length, 1);
    const sent = app.signups[0];
    assert.equal(sent.options.emailRedirectTo, `https://ojjuda.kr/?next=${destination}`);
    assert.equal(sent.options.data.phone_number, '01012345678');
    assert.equal(sent.options.data.birth_yymmdd, '000101');
    assert.equal(sent.options.data.gender_code, '3');
    assert.equal(sent.options.data.age_14_or_older, true);
    assert.equal('age_15_to_69' in sent.options.data, false);
    assert.equal(JSON.parse(app.storage.get('ojjuda_post_confirm_destination')).destination, destination);
    assert.equal(app.element('auth-title').textContent, '이메일을 확인해 주세요');
  }
  for (const missing of ['nickname', 'email', 'password', 'password-confirm', 'signup-birth', 'signup-code', 'signup-phone', 'age-check', 'policy-check']) {
    const app = setup('?auth=signup&next=world'); await app.flush(); app.fill();
    if (missing.endsWith('check')) app.element(missing).checked = false;
    else app.element(missing).value = '';
    await app.submit(); assert.equal(app.signups.length, 0, `${missing} must be required`);
    if (missing === 'age-check') assert.equal(app.element('auth-feedback').textContent, '만 14세 이상인지 확인해 주세요.');
    if (missing === 'password-confirm') assert.match(app.element('auth-feedback').textContent, /비밀번호 확인을 입력/);
  }
  for (const destination of ['world', 'note']) {
    const app = setup(`?auth=signup&next=${destination}`); await app.flush(); app.fill();
    for (const value of ['different-password', 'test-password ']) {
      app.element('password-confirm').value = value;
      await app.submit();
      assert.equal(app.signups.length, 0, 'mismatched passwords must not reach Auth');
      assert.match(app.element('auth-feedback').textContent, /두 비밀번호가 달라요/);
    }
    app.element('password-confirm').value = 'test-password'; await app.submit();
    assert.equal(app.signups.length, 1, 'correcting the confirmation permits signup');
    assert.equal(app.element('password').value, '');
    assert.equal(app.element('password-confirm').value, '');
  }
  const switched = setup('?auth=signup'); await switched.flush(); switched.fill();
  switched.element('login-tab').listeners.click();
  assert.equal(switched.element('.password-confirm-field').hidden, true);
  assert.equal(switched.element('password-confirm').required, false);
  assert.equal(switched.element('password-confirm').disabled, true);
  assert.equal(switched.element('password-confirm').value, '');
  const existing = setup('?auth=signup&next=world', { user: { id: 'existing', email: 'member@example.invalid' } });
  await existing.flush();
  assert.deepEqual(existing.navigations, ['/world.html']);
  assert.equal(existing.element('auth-dialog').open, false);

  const cardId = '00000000-0000-4000-8000-000000000010';
  const reader = { id: 'reader', email: 'reader@example.invalid' };
  const returnToCard = setup(`?auth=login&next=note&card=${cardId}`, { user: reader });
  await returnToCard.flush();
  assert.deepEqual(returnToCard.navigations, [`/world.html?place=park&card=${cardId}`], 'sign-in returns to the card being read');
  const invalidCard = setup('?auth=login&next=note&card=https://example.invalid', { user: reader });
  await invalidCard.flush();
  assert.deepEqual(invalidCard.navigations, ['/world.html?place=park'], 'only card UUIDs can be carried through login');
  const cardSignup = setup(`?auth=signup&next=note&card=${cardId}`);
  await cardSignup.flush(); cardSignup.fill(); await cardSignup.submit();
  assert.equal(cardSignup.signups[0].options.emailRedirectTo, `https://ojjuda.kr/?next=note&card=${cardId}`);

  const note = setup('?next=note'); await note.flush();
  assert.equal(note.element('login-tab').attributes['aria-selected'], 'true');
  assert.equal(note.element('auth-dialog').open, true);
  note.element('auth-dialog').close();
  await note.emit('INITIAL_SESSION', null);
  assert.equal(note.element('auth-dialog').open, false, 'initial auth entry is consumed once');

  const recovery = setup('?auth=signup&next=world&reset=1'); await recovery.flush();
  assert.equal(recovery.element('auth-title').textContent, '비밀번호 찾기');
  const invalid = setup('?auth=signup&next=https://example.invalid'); await invalid.flush(); invalid.fill(); await invalid.submit();
  assert.equal(invalid.signups[0].options.emailRedirectTo, 'https://ojjuda.kr/');
  assert.deepEqual(invalid.navigations, []);
  const failedSession = setup('?auth=signup&next=world', { sessionError: true }); await failedSession.flush();
  assert.equal(failedSession.element('signup-tab').attributes['aria-selected'], 'true');
  const recoveryValues = { email: 'recovery@example.invalid', 'recovery-phone': '+82 10-1234-5678', 'recovery-birth': '2000-02-29', 'recovery-gender': 'male' };
  const fillRecovery = app => { for (const [key, value] of Object.entries(recoveryValues)) app.element(key).value = value; };
  for (const user of [null, { id: 'existing' }]) {
    const app = setup('?auth=forgot&next=world', { user }); await app.flush();
    assert.equal(app.element('auth-dialog').open, true);
    assert.equal(app.element('recovery-identity-slot').hidden, false);
    fillRecovery(app); await app.submit();
    assert.equal(app.recoveries.length, 1);
    assert.equal(app.recoveries[0].name, 'member-recovery');
    assert.deepEqual(JSON.parse(JSON.stringify(app.recoveries[0].body)), { action: 'check', email: recoveryValues.email, phone: '01012345678', birth_date: '2000-02-29', gender: 'male' });
    assert.equal(app.element('recovery-phone').value, '');
    assert.equal(app.element('recovery-reset-button').hidden, false);
    app.element('recovery-reset-button').listeners.click();
    assert.equal(app.element('auth-title').textContent, '새 비밀번호 설정');
    assert.equal(app.element('.password-confirm-field').hidden, false);
    assert.equal(app.element('password-confirm-label').textContent, '새 비밀번호 확인');
    assert.equal(app.element('password-confirm').disabled, false);
    app.element('password').value = 'new-password'; app.element('password-confirm').value = 'different';
    await app.submit(); assert.equal(app.recoveries.length, 1); assert.match(app.element('auth-feedback').textContent, /두 비밀번호가 달라요/);
    app.element('password-confirm').value = 'new-password'; await app.submit();
    assert.equal(app.recoveries.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(app.recoveries[1].body)), { action: 'reset', token: 'a'.repeat(64), password: 'new-password', password_confirmation: 'new-password' });
    assert.equal(app.element('auth-title').textContent, '비밀번호가 바뀌었어요');
    assert.equal(app.element('recovery-reset-button').hidden, true);
    assert.equal(app.element('password').value, ''); assert.equal(app.element('password-confirm').value, '');
    app.element('back-to-login').listeners.click();
    assert.equal(app.element('login-tab').attributes['aria-selected'], 'true');
  }
  for (const field of Object.keys(recoveryValues)) {
    const app = setup('?auth=forgot'); await app.flush(); fillRecovery(app); app.element(field).value = '';
    await app.submit(); assert.equal(app.recoveries.length, 0, `${field} must be required for recovery`);
  }
  const mismatch = setup('?auth=forgot', { recoveryVerified: false });
  await mismatch.flush(); fillRecovery(mismatch); await mismatch.submit();
  assert.equal(mismatch.element('recovery-reset-button').hidden, true);
  assert.match(mismatch.element('auth-feedback').textContent, /일치하지 않아요/);
  const limited = setup('?auth=forgot', { recoveryError: 'recovery_rate_limited' });
  await limited.flush(); fillRecovery(limited); await limited.submit();
  assert.match(limited.element('auth-feedback').textContent, /15분/);
  assert.equal(limited.element('recovery-reset-button').hidden, true);
  const expired = setup('?auth=forgot'); await expired.flush(); fillRecovery(expired); await expired.submit();
  expired.advance(300001); expired.element('recovery-reset-button').listeners.click();
  assert.equal(expired.element('recovery-reset-button').hidden, true);
  assert.match(expired.element('auth-feedback').textContent, /확인 시간이 지났/);
  const failedReset = setup('?auth=forgot', { resetError: 'recovery_restart_required' });
  await failedReset.flush(); fillRecovery(failedReset); await failedReset.submit();
  failedReset.element('recovery-reset-button').listeners.click();
  failedReset.element('password').value = failedReset.element('password-confirm').value = 'new-password';
  await failedReset.submit();
  assert.equal(failedReset.element('recovery-identity-slot').hidden, false);
  assert.match(failedReset.element('auth-feedback').textContent, /확인부터 다시/);
  assert.equal(failedReset.element('recovery-reset-button').hidden, true);
  const closed = setup('?auth=forgot'); await closed.flush(); fillRecovery(closed); await closed.submit();
  closed.element('auth-dialog').close(); closed.element('auth-dialog').listeners.close();
  closed.element('recovery-reset-button').listeners.click();
  assert.equal(closed.recoveries.length, 1); assert.equal(closed.element('recovery-reset-button').hidden, true);
  console.log('PASS: verified recovery, unified signup entry, required inputs, password confirmation and mode switching, confirmation return destinations, existing sessions, recovery priority, redirect allowlist');
})().catch(error => { console.error(error); process.exitCode = 1; });

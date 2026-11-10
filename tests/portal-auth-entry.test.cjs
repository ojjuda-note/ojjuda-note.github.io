const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const identity = require('../shared/auth/signup-identity.js');
const source = fs.readFileSync(path.join(__dirname, '../app/portal/portal.js'), 'utf8');
const entrance = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const entryScript = entrance.match(/<script id="world-default-entry">([\s\S]*?)<\/script>/)?.[1];
assert.ok(entryScript, 'the root route runs before loading the account controller');
assert.ok(entrance.indexOf('id="world-default-entry"') < entrance.indexOf('src="/shared/auth/portal-availability.js'));
function initialRoute(path) {
  const navigations = [], location = new URL(path, 'https://ojjuda.kr');
  location.replace = target => navigations.push(target);
  vm.runInNewContext(entryScript, {location, URL, URLSearchParams});
  return navigations;
}
for (const path of ['/', '/index.html']) assert.deepEqual(initialRoute(path), ['/world.html?tab=hub']);
assert.deepEqual(initialRoute('/?utm_source=share'), ['/world.html?utm_source=share&tab=hub']);
assert.deepEqual(initialRoute('/?tab=board'), ['/world.html?tab=board']);
for (const path of ['/?auth=login', '/?auth=signup&next=world', '/?auth=forgot', '/?next=note&card=fixture',
  '/?reset=1', '/?code=fixture-code', '/?token_hash=fixture-hash&type=signup',
  '/#access_token=fixture-token&refresh_token=fixture-refresh&type=recovery',
  '/#error=access_denied&error_description=fixture', '/?error_code=expired']) {
  assert.deepEqual(initialRoute(path), [], 'account entry must handle its own callback: ' + path);
}

// Exercise the real controller with a fake Auth service: no accounts or emails are created.
function setup(query, { user = null, confirmed = false, sessionError = false, sessionResponse = null, userResponse = null, signInResponse = null, signupResponse = null, recoveryResponse = null, recoveryError = null, recoveryVerified = true, resetError = null, now = Date.now() } = {}) {
  let clock = now;
  let taskId = 0;
  let serviceUser = user;
  const elements = new Map(), tasks = new Map(), navigations = [], signups = [], signins = [], passwordUpdates = [], recoveries = [], storage = new Map();
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
  const policyLinks = ['terms', 'privacy'].map(name => { const e = element(`${name}-link`); e.dataset.policyDocument = name; return e; });
  const location = new URL(`https://ojjuda.kr/${query}`);
  location.assign = value => navigations.push(value);
  let authListener;
  const account = user ? { user } : null;
  const client = {
    auth: {
      onAuthStateChange(callback) { authListener = callback; },
      async getSession() { if (sessionResponse) return sessionResponse(); if (sessionError) throw new Error('network'); return { data: { session: account } }; },
      async getUser() { return userResponse ? userResponse(serviceUser) : { data: { user: serviceUser } }; },
      async updateUser(args) { passwordUpdates.push({ owner: user?.id, ...args }); return { data: { user } }; },
      async signInWithPassword(args) {
        signins.push(args);
        const result = signInResponse ? await signInResponse(args) : { data: { session: { user: { id: 'signed-in-member', email: args.email, is_anonymous: false } } } };
        if (result.data?.session?.user) serviceUser = result.data.session.user;
        return result;
      },
      async signUp(args) {
        signups.push(args);
        const result = signupResponse ? await signupResponse(args) : { data: { session: confirmed ? { user: { id: 'new-member', email: args.email, is_anonymous: false } } : null } };
        if (result.data?.session?.user) serviceUser = result.data.session.user;
        return result;
      }
    },
    functions: { async invoke(name, args) { recoveries.push({ name, ...args }); if (recoveryResponse) return recoveryResponse(args.body); const error = args.body.action === 'reset' ? resetError : recoveryError; return error ? { error: { context: { json: async () => ({ error }) } } } : { data: args.body.action === 'reset' ? { reset: true } : { verified: recoveryVerified, reset_token: 'a'.repeat(64), expires_in: 300 } }; } },
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; } }; },
    async rpc() { return { data: true }; }
  };
  const context = {
    window: { OJJUDA_CONFIG: { supabaseUrl: 'https://example.test', supabaseKey: 'test' }, supabase: { createClient: () => client }, OjjudaIdentity: identity },
    document: { getElementById: element, querySelector: element, querySelectorAll: selector => selector === '[data-policy-document]' ? policyLinks : [] },
    Date: class extends Date { static now() { return clock; } },
    location, URL, URLSearchParams, console: { warn() {}, error() {} },
    history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } },
    sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setTimeout: (callback, delay = 0) => { const id = ++taskId; tasks.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout: id => tasks.delete(id)
  };
  vm.runInNewContext(source, context);
  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      for (const [id, task] of tasks) {
        if (task.at > clock) continue;
        tasks.delete(id); task.callback();
      }
    }
  };
  const emitNow = (event, session) => { serviceUser = session?.user || null; authListener(event, session); };
  const emit = async (event, session) => { emitNow(event, session); await flush(); };
  const submit = async () => { await element('auth-form').listeners.submit({ preventDefault() {} }); await flush(); };
  const fill = () => {
    for (const [key, value] of Object.entries({ nickname: '테스트', email: 'signup-fixture@ojjuda.kr', password: 'test-password', 'password-confirm': 'test-password', 'signup-birth': '000101', 'signup-code': '3', 'signup-phone': '010-2345-6789' })) element(key).value = value;
    element('age-check').checked = element('policy-check').checked = true;
  };
  return { element, flush, emit, emitNow, submit, fill, navigations, signups, signins, passwordUpdates, recoveries, storage, location, window: context.window, client, advance: ms => { clock += ms; } };
}

// The login controller shares its auth client with navigation tracking.
{
  const app = setup('?auth=login');
  assert.equal(app.window.ojjudaSupabase, app.client, 'Portal exposes one shared auth client');
}

(async () => {
  for (const [time, version, prefix] of [
    ['2026-11-19T14:59:59.999Z', '2026-09-29-age14', '/policies/2026-09-29/'],
    ['2026-11-19T15:00:00.000Z', '2026-11-20', '/']
  ]) {
    const app = setup('?auth=signup&next=world', { now: Date.parse(time) });
    await app.flush(); app.fill(); await app.submit();
    assert.equal(app.signups[0].options.data.terms_version, version, 'consent uses the document effective at Korea midnight');
    for (const name of ['terms', 'privacy']) assert.equal(app.element(`${name}-link`).href, `${prefix}${name}.html`);
    assert.equal(app.element('policy-revision-note').hidden, version === '2026-11-20');
  }
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
    assert.equal(app.element('auth-title').textContent, '오쭈다 아지트');
    assert.equal(app.element('.password-confirm-field').hidden, false);
    assert.equal(app.element('password-confirm-label').textContent, '비밀번호 확인');
    assert.equal(app.element('password-confirm').required, true);
    assert.equal(app.element('password-confirm').disabled, false);
    assert.equal(app.location.searchParams.get('auth'), null);
    app.fill(); await app.submit();
    assert.equal(app.signups.length, 1);
    const sent = app.signups[0];
    assert.equal(sent.options.emailRedirectTo, `https://ojjuda.kr/?next=${destination}`);
    assert.equal(sent.options.data.phone_number, '01023456789');
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
  for (const email of ['person@example.invalid', 'somebody@example.com', 'guest@mailinator.com', 'broken-email']) {
    const app = setup('?auth=signup'); await app.flush(); app.fill();
    app.element('email').value = email;
    await app.submit();
    assert.equal(app.signups.length, 0, `invalid email must not reach Auth: ${email}`);
    assert.match(app.element('auth-feedback').textContent, /올바른 이메일/);
  }
  for (const phone of ['010-1234-5678', '010-1111-1111', '070-2345-6789']) {
    const app = setup('?auth=signup'); await app.flush(); app.fill();
    app.element('signup-phone').value = phone;
    await app.submit();
    assert.equal(app.signups.length, 0, `invalid phone must not reach Auth: ${phone}`);
    assert.match(app.element('auth-feedback').textContent, /휴대전화/);
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
  const runningWorldRecovery = setup('?reset=1&next=world', { user: reader });
  await runningWorldRecovery.flush();
  assert.equal(runningWorldRecovery.element('auth-title').textContent, '새 비밀번호 설정');
  assert.deepEqual(runningWorldRecovery.navigations, [], 'World recovery handoff must not resume World before resetting');
  await runningWorldRecovery.emit('TOKEN_REFRESHED', { user: reader });
  assert.equal(runningWorldRecovery.element('auth-title').textContent, '새 비밀번호 설정');
  runningWorldRecovery.element('password').value = runningWorldRecovery.element('password-confirm').value = 'replacement-password';
  await runningWorldRecovery.submit();
  assert.deepEqual(runningWorldRecovery.passwordUpdates, [{ owner: 'reader', password: 'replacement-password' }], 'the handoff retains the current recovery session');
  assert.equal(runningWorldRecovery.element('auth-title').textContent, '비밀번호가 바뀌었어요');
  const photoLogin = setup('?auth=login&next=photo', { user: reader });
  await photoLogin.flush();
  assert.deepEqual(photoLogin.navigations, ['/photo-ttang.html'], 'photo login returns to the full game page');
  const photoGuest = setup('?auth=login&next=photo'); await photoGuest.flush();
  assert.equal(photoGuest.element('auth-dialog').open, true);
  const photoSignup = setup('?auth=signup&next=photo');
  await photoSignup.flush(); photoSignup.fill(); await photoSignup.submit();
  assert.equal(photoSignup.signups[0].options.emailRedirectTo, 'https://ojjuda.kr/?next=photo');
  assert.equal(JSON.parse(photoSignup.storage.get('ojjuda_post_confirm_destination')).destination, 'photo');
  const photoConfirmed = setup('?auth=signup&next=photo', { confirmed: true });
  await photoConfirmed.flush(); photoConfirmed.fill(); await photoConfirmed.submit();
  assert.deepEqual(photoConfirmed.navigations, ['/photo-ttang.html']);

  const groupCode='10000000-0000-4000-8000-000000000001';
  const groupPath='/groups/#invite='+groupCode;
  const groupMember=setup('?auth=login&next=groups&invite='+groupCode,{user:reader});await groupMember.flush();assert.deepEqual(groupMember.navigations,[groupPath]);
  const groupGuest=setup('?auth=login&next=groups&invite='+groupCode);await groupGuest.flush();
  groupGuest.element('email').value='member@example.invalid';groupGuest.element('password').value='test-password';await groupGuest.submit();assert.deepEqual(groupGuest.navigations,[groupPath]);
  const groupSignup=setup('?auth=signup&next=groups&invite='+groupCode);await groupSignup.flush();groupSignup.fill();await groupSignup.submit();
  assert.equal(groupSignup.signups[0].options.emailRedirectTo,'https://ojjuda.kr/?next=groups&invite='+groupCode);
  const groupConfirmed=setup('?code=confirmation');await groupConfirmed.flush();groupConfirmed.storage.set('ojjuda_post_confirm_destination',JSON.stringify({destination:'groups',invite:groupCode,email:reader.email,expiresAt:Date.now()+60000}));
  await groupConfirmed.emit('SIGNED_IN',{user:reader});assert.deepEqual(groupConfirmed.navigations,[groupPath]);
  for(const bad of ['https://evil.invalid/','invalid&invite='+groupCode]){const app=setup('?auth=login&next=groups&invite='+bad,{user:reader});await app.flush();assert.deepEqual(app.navigations,['/groups/']);}

  const bookingQuery = 'date=2026-12-24&room=7618700&guests=4';
  const bookingMember = setup('?auth=login&next=byeolcheonji&' + bookingQuery, { user: reader });
  await bookingMember.flush();
  assert.deepEqual(bookingMember.navigations, ['/byeolcheonji/?' + bookingQuery], 'notification room and date survive sign-in');
  const bookingGuest = setup('?auth=login&next=byeolcheonji&' + bookingQuery);
  await bookingGuest.flush();
  assert.equal(bookingGuest.element('auth-dialog').open, true);
  assert.deepEqual(bookingGuest.navigations, [], 'a guest must sign in before returning to the member tool');
  bookingGuest.element('email').value = 'member@example.invalid';
  bookingGuest.element('password').value = 'test-password';
  await bookingGuest.submit();
  assert.deepEqual(bookingGuest.navigations, ['/byeolcheonji/?' + bookingQuery]);
  const bookingSignup = setup('?auth=signup&next=byeolcheonji&' + bookingQuery);
  await bookingSignup.flush(); bookingSignup.fill(); await bookingSignup.submit();
  assert.equal(bookingSignup.signups[0].options.emailRedirectTo, 'https://ojjuda.kr/?next=byeolcheonji&' + bookingQuery);
  const bookingConfirmed = setup('?code=confirmation');
  await bookingConfirmed.flush();
  bookingConfirmed.storage.set('ojjuda_post_confirm_destination', JSON.stringify({
    destination: 'byeolcheonji', booking: bookingQuery, email: reader.email, expiresAt: Date.now() + 60000
  }));
  await bookingConfirmed.emit('SIGNED_IN', { user: reader });
  assert.deepEqual(bookingConfirmed.navigations, ['/byeolcheonji/?' + bookingQuery]);
  for (const invalid of ['date=2026-02-30&room=https://evil.invalid/&guests=99', 'date=2026-12-24&date=2026-12-25&room=7618700&room=7618751&guests=4&guests=8']) {
    const app = setup('?auth=login&next=byeolcheonji&' + invalid, { user: reader });
    await app.flush();
    assert.deepEqual(app.navigations, ['/byeolcheonji/'], 'invalid or duplicate booking values cannot change the trusted destination');
  }

  for (const query of ['?next=star', '?auth=login&next=star&startDate=2026-11-14&endDate=2026-11-16',
    '?auth=login&next=https://example.invalid/star/']) {
    const retired = setup(query, { user: reader });
    await retired.flush();
    assert.deepEqual(retired.navigations, [], 'retired or external destinations are not reopened');
  }
  const retiredConfirmation = setup('?code=confirmation');
  await retiredConfirmation.flush();
  retiredConfirmation.storage.set('ojjuda_post_confirm_destination', JSON.stringify({
    destination: 'star', email: reader.email, expiresAt: Date.now() + 60000
  }));
  await retiredConfirmation.emit('SIGNED_IN', { user: reader });
  assert.deepEqual(retiredConfirmation.navigations, [], 'a saved retired destination cannot reopen the helper');

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
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const oldSession = deferred();
  const sessionRace = setup('?auth=login', { sessionResponse: () => oldSession.promise });
  await sessionRace.emit('SIGNED_IN', { user: reader });
  assert.equal(sessionRace.element('signed-in-actions').hidden, false);
  oldSession.reject(new Error('network')); await sessionRace.flush();
  assert.equal(sessionRace.element('signed-in-actions').hidden, false, 'a stale initial-session failure cannot overwrite a later sign-in');
  assert.equal(sessionRace.element('account-actions').hidden, true);
  for (const lateFailure of [false, true]) {
    const oldRecovery = deferred();
    const app = setup('?auth=forgot', { recoveryResponse: () => oldRecovery.promise });
    await app.flush(); fillRecovery(app); const pending = app.submit();
    app.element('auth-dialog').close(); app.element('auth-dialog').listeners.close();
    // Reopening the same recovery mode starts a new view even while the previous request settles.
    app.element('login-tab').listeners.click(); app.element('forgot-trigger').listeners.click();
    app.element('auth-dialog').showModal();
    app.element('recovery-phone').value = '010-9999-8888';
    app.element('auth-feedback').textContent = '새로 입력 중';
    if (lateFailure) oldRecovery.reject(new Error('network'));
    else oldRecovery.resolve({ data: { verified: true, reset_token: 'a'.repeat(64), expires_in: 300 } });
    await pending;
    assert.equal(app.element('auth-title').textContent, '비밀번호 찾기');
    assert.equal(app.element('recovery-phone').value, '010-9999-8888');
    assert.equal(app.element('auth-feedback').textContent, '새로 입력 중');
    assert.equal(app.element('recovery-reset-button').hidden, true, 'a previous recovery result cannot grant a newly opened form');
    assert.equal(app.element('auth-submit').disabled, false);
  }
  const oldSignup = deferred();
  const signupRace = setup('?auth=signup', { signupResponse: () => oldSignup.promise });
  await signupRace.flush(); signupRace.fill(); const pendingSignup = signupRace.submit();
  signupRace.element('auth-dialog').close(); signupRace.element('auth-dialog').listeners.close();
  signupRace.element('login-tab').listeners.click(); signupRace.element('auth-dialog').showModal();
  signupRace.element('password').value = 'replacement-password';
  oldSignup.resolve({ data: { session: null } }); await pendingSignup;
  assert.equal(signupRace.element('login-tab').attributes['aria-selected'], 'true');
  assert.equal(signupRace.element('auth-form').hidden, false, 'a previous signup response cannot replace a reopened login form');
  assert.equal(signupRace.element('password').value, 'replacement-password');
  console.log('PASS: verified recovery, unified signup entry, required inputs, confirmation destinations, retired destination rejection and account races');
})().catch(error => { console.error(error); process.exitCode = 1; });

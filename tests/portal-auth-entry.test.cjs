const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
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
function setup(query, { user = null, confirmed = false, sessionError = false, sessionResponse = null, userResponse = null, signInResponse = null, signupResponse = null, nicknameResponse = null, recoveryResponse = null, recoveryError = null, recoveryVerified = true, resetError = null, now = Date.now() } = {}) {
  let clock = now;
  let taskId = 0;
  let serviceUser = user;
  let focused = null;
  const elements = new Map(), tasks = new Map(), navigations = [], navigationKinds = [], signups = [], signins = [], passwordUpdates = [], recoveries = [], storage = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      hidden: false, disabled: false, readOnly: false, tabIndex: 0, value: '', checked: false, textContent: '',
      firstChild: { textContent: '' }, dataset: {}, attributes: {}, listeners: {}, open: false,
      addEventListener(name, callback) { this.listeners[name] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      hasChildNodes() { return Boolean(this.innerHTML); },
      closest(selector) { return element(`${key}:${selector}`); },
      querySelector(selector) { return selector.startsWith('#') ? element(selector.slice(1)) : element(selector); },
      querySelectorAll(selector) { return selector === '[data-auth-mode]' ? tabs : []; },
      focus() { focused = key; }, scrollIntoView() {}, reset() {},
      showModal() { this.open = true; },
      close() {
        if (!this.open) return;
        this.open = false;
        // Native dialog.close() queues its event, including when login immediately reopens the dialog.
        const id = ++taskId;
        tasks.set(id, { callback: () => this.listeners.close?.({ target: this }), at: clock });
      }
    });
    return elements.get(key);
  };
  const tabs = ['login', 'signup'].map(mode => { const e = element(`${mode}-tab`); e.dataset.authMode = mode; return e; });
  const authButtons = ['login', 'signup'].map(mode => { const e = element(`header-${mode}`); e.dataset.openAuth = mode; return e; });
  const destinationButtons = ['world', 'pajang', 'note'].map(destination => {
    const e = element(`destination-${destination}`); e.dataset.destination = destination; return e;
  });
  const policyLinks = ['terms', 'privacy'].map(name => { const e = element(`${name}-link`); e.dataset.policyDocument = name; return e; });
  const location = new URL(`https://ojjuda.kr/${query}`);
  location.assign = value => { navigationKinds.push('assign'); navigations.push(value); };
  location.replace = value => { navigationKinds.push('replace'); navigations.push(value); };
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
    async rpc(name, args) {
      if (name === 'has_banned') return nicknameResponse ? nicknameResponse(args.t) : { data: false };
      return { data: true };
    }
  };
  const context = {
    window: { OJJUDA_CONFIG: { supabaseUrl: 'https://example.test', supabaseKey: 'test' }, supabase: { createClient: () => client }, OjjudaIdentity: identity, crypto: webcrypto },
    document: { getElementById: element, querySelector: element, querySelectorAll: selector =>
      selector === '[data-policy-document]' ? policyLinks : selector === '[data-open-auth]' ? authButtons
        : selector === '[data-destination]' ? destinationButtons : [] },
    Date: class extends Date { static now() { return clock; } },
    location, URL, URLSearchParams, console: { warn() {}, error() {} },
    history: { state: { sharedNavigation: 'keep' }, replaceState(state, _title, url) { this.state = state; location.href = new URL(url, location).href; } },
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
    for (const [key, value] of Object.entries({ email: 'signup-fixture@ojjuda.kr', password: 'test-password', 'password-confirm': 'test-password', 'signup-birth': '000101', 'signup-code': '3', 'signup-phone': '010-2345-6789' })) element(key).value = value;
    element('age-check').checked = element('policy-check').checked = true;
  };
  return { element, flush, emit, emitNow, submit, fill, navigations, navigationKinds, signups, signins, passwordUpdates, recoveries, storage, location, history: context.history, window: context.window, client, get focused() { return focused; }, advance: ms => { clock += ms; } };
}

// The login controller shares its auth client with navigation tracking.
{
  const app = setup('?auth=login');
  assert.equal(app.window.ojjudaSupabase, app.client, 'Portal exposes one shared auth client');
}

(async () => {
  const loginRoutes = [
    ['world', '/world.html', '/world.html'],
    ['pajang', '/features/pajang/', '/features/pajang/'],
    ['note', '/world.html?place=park', '/world.html?place=park&guest=1']
  ];
  const signIn = async app => {
    app.element('email').value = 'member@ojjuda.kr';
    app.element('password').value = 'fixture-password';
    await app.submit();
  };
  const entryIdentity = (app, destination) => {
    const [key, name] = { world: ['agit', '아지트'], note: ['park', '공원'], pajang: ['pajang', '파장'] }[destination];
    assert.equal(app.element('auth-dialog').attributes['data-entry-space'], key);
    assert.equal(app.element('auth-title').textContent, `오쭈다 ${name}`);
    assert.equal(app.element('front-title').textContent, `오쭈다 ${name}`);
  };
  const closeDialog = async app => {
    app.element('[data-close-dialog]').listeners.click();
    await app.flush();
    assert.equal(app.element('auth-dialog').open, false);
  };
  for (const [destination, route] of loginRoutes) {
    const direct = setup(`?auth=login&next=${destination}`); await direct.flush();
    entryIdentity(direct, destination);
    await signIn(direct);
    assert.deepEqual(direct.navigations, [route], `${destination} returns to its own section after login`);
    assert.deepEqual(direct.navigationKinds, ['replace'], `${destination} consumes the intermediate login page`);
    assert.equal(direct.history.state.sharedNavigation, 'keep', 'auth URL cleanup preserves navigation metadata');

    const reopened = setup(`?auth=login&next=${destination}`); await reopened.flush();
    await closeDialog(reopened);
    reopened.element('header-login').listeners.click();
    entryIdentity(reopened, destination);
    await signIn(reopened);
    assert.deepEqual(reopened.navigations, [route], `${destination} survives closing and reopening header login`);
  }
  for (const [destination, route, guestRoute] of loginRoutes) {
    const switched = setup(`?auth=login&next=${destination}`); await switched.flush();
    switched.element('signup-tab').listeners.click(); switched.element('login-tab').listeners.click();
    entryIdentity(switched, destination);
    assert.equal(switched.element('guest-browse').href, guestRoute, `${destination} keeps its own guest entrance`);
    await signIn(switched);
    assert.deepEqual(switched.navigations, [route], `${destination} survives login/signup tab switches`);

    for (const entry of ['tab', 'header']) {
      const signup = setup(`?auth=login&next=${destination}`); await signup.flush();
      if (entry === 'header') { await closeDialog(signup); signup.element('header-signup').listeners.click(); }
      else signup.element('signup-tab').listeners.click();
      entryIdentity(signup, destination);
      signup.fill(); await signup.submit();
      assert.equal(signup.signups[0].options.emailRedirectTo, `https://ojjuda.kr/?next=${destination}`, `${entry} signup keeps ${destination} in the confirmation link`);
      assert.equal(JSON.parse(signup.storage.get('ojjuda_post_confirm_destination')).destination, destination);
    }

    const selected = setup(`?auth=login&next=${destination === 'world' ? 'pajang' : 'world'}`); await selected.flush();
    await closeDialog(selected);
    selected.element(`destination-${destination}`).listeners.click({ preventDefault() {} });
    await closeDialog(selected);
    selected.element('header-login').listeners.click();
    await signIn(selected);
    assert.deepEqual(selected.navigations, [route], 'an explicit section choice survives closing and reopening login');

    const immediate = setup(`?auth=signup&next=${destination}`, { confirmed: true });
    await immediate.flush(); immediate.fill(); await immediate.submit();
    assert.deepEqual(immediate.navigations, [route], `${destination} also resumes when signup immediately returns a session`);
    assert.deepEqual(immediate.navigationKinds, ['replace']);
    const existing = setup(`?auth=login&next=${destination}`, { user: { id: 'existing-member', email: 'member@ojjuda.kr' } });
    await existing.flush();
    assert.deepEqual(existing.navigations, [route], `${destination} also resumes an existing session`);
    assert.deepEqual(existing.navigationKinds, ['replace']);

    const explicit = setup('?auth=login', { user: { id: 'existing-member', email: 'member@ojjuda.kr' } });
    await explicit.flush();
    explicit.element(`destination-${destination}`).listeners.click({ preventDefault() {} });
    await explicit.flush();
    assert.deepEqual(explicit.navigations, [route]);
    assert.deepEqual(explicit.navigationKinds, ['assign'], 'an explicit signed-in service choice keeps its real visit history');
  }
  for (const next of ['', '&next=unknown', '&next=https://example.invalid/', '&next=//example.invalid/', '&next=toString']) {
    const login = setup('?auth=login' + next); await login.flush(); await signIn(login);
    assert.deepEqual(login.navigations, ['/world.html'], 'missing or untrusted login destinations use the Agit entrance');
    const signup = setup('?auth=signup' + next, { confirmed: true });
    await signup.flush(); signup.fill(); await signup.submit();
    assert.deepEqual(signup.navigations, ['/world.html'], 'missing or untrusted immediate signup destinations use the Agit entrance');
  }
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
  for (const destination of ['world', 'note', 'pajang']) {
    const app = setup(`?auth=signup&next=${destination}`); await app.flush();
    const generatedNickname = app.element('nickname').value;
    assert.match(generatedNickname, /^[가-힣]{2}[0-9a-z]{10}$/);
    assert.equal(app.element('nickname').readOnly, false, 'the automatic nickname remains editable');
    assert.equal(app.element('nickname').tabIndex, 0);
    assert.equal(app.element('nickname-auto-help').hidden, false);
    assert.equal(app.focused, 'email', 'signup starts with the first editable field');
    assert.equal(app.element('auth-dialog').open, true);
    assert.equal(app.element('signup-tab').attributes['aria-selected'], 'true');
    entryIdentity(app, destination);
    assert.equal(app.element('.password-confirm-field').hidden, false);
    assert.equal(app.element('password-confirm-label').textContent, '비밀번호 확인');
    assert.equal(app.element('password-confirm').required, true);
    assert.equal(app.element('password-confirm').disabled, false);
    assert.equal(app.location.searchParams.get('auth'), null);
    app.fill(); await app.submit();
    assert.equal(app.signups.length, 1);
    const sent = app.signups[0];
    assert.equal(sent.options.data.nickname, generatedNickname, 'signup uses the displayed automatic nickname without manual input');
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
    assert.equal(app.focused, missing, `focus the missing signup field: ${missing}`);
    if (missing === 'age-check') assert.equal(app.element('auth-feedback').textContent, '만 14세 이상인지 확인해 주세요.');
    if (missing === 'password-confirm') assert.match(app.element('auth-feedback').textContent, /비밀번호 확인을 입력/);
  }
  const corrected = setup('?auth=signup'); await corrected.flush();
  for (const [field, value, message] of [
    ['email', 'signup-fixture@ojjuda.kr', /^이메일을 입력해 주세요\.$/], ['password', 'test-password', /비밀번호/],
    ['password-confirm', 'test-password', /비밀번호 확인/], ['signup-birth', '000101', /생년월일/],
    ['signup-code', '3', /성별/], ['signup-phone', '010-2345-6789', /전화번호/],
    ['age-check', true, /14세/], ['policy-check', true, /이용약관/]
  ]) {
    corrected.element('auth-submit').focus();
    await corrected.submit();
    assert.match(corrected.element('auth-feedback').textContent, message);
    assert.equal(corrected.focused, field);
    assert.equal(corrected.signups.length, 0);
    corrected.element(field)[value === true ? 'checked' : 'value'] = value;
  }
  await corrected.submit();
  assert.equal(corrected.signups.length, 1, 'the corrected form submits once');
  for (const [field, value] of [['signup-birth', '000230'], ['signup-code', '9'], ['signup-phone', '010-1111-1111']]) {
    const app = setup('?auth=signup'); await app.flush(); app.fill();
    app.element(field).value = value;
    app.element('auth-submit').focus(); await app.submit();
    assert.equal(app.focused, field);
    assert.equal(app.signups.length, 0);
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
  const login = setup('?auth=login'); await login.flush();
  assert.ok(!login.element('signup-identity-slot').innerHTML, 'only signup needs the generated identity fields');
  login.element('password').value = 'fixture-password';
  login.element('login-tab').listeners.click();
  assert.equal(login.element('password').value, 'fixture-password', 'selecting the current login tab keeps the password');
  login.element('forgot-trigger').listeners.click();
  assert.ok(login.element('recovery-birth').max);
  assert.ok(!login.element('signup-identity-slot').innerHTML, 'recovery uses its own identity fields');
  login.element('signup-tab').listeners.click();
  assert.ok(login.element('signup-identity-slot').innerHTML);
  login.fill();
  login.element('signup-tab').listeners.click();
  assert.equal(login.element('password-confirm').value, 'test-password', 'selecting the current signup tab keeps confirmation');

  const switched = setup('?auth=signup'); await switched.flush(); switched.fill();
  const retainedNickname = switched.element('nickname').value;
  switched.element('login-tab').listeners.click();
  assert.equal(switched.element('.password-confirm-field').hidden, true);
  assert.equal(switched.element('password-confirm').required, false);
  assert.equal(switched.element('password-confirm').disabled, true);
  assert.equal(switched.element('password-confirm').value, '');
  switched.element('signup-tab').listeners.click();
  assert.equal(switched.element('nickname').value, retainedNickname, 'tab switches preserve the assigned name');
  switched.element('email').value = 'broken-email'; await switched.submit();
  assert.equal(switched.element('nickname').value, retainedNickname, 'validation failures preserve the assigned name');
  switched.element('nickname').value = '나만의별명';
  switched.element('login-tab').listeners.click(); switched.element('signup-tab').listeners.click();
  assert.equal(switched.element('nickname').value, '나만의별명', 'tab switches preserve an edited nickname');
  switched.fill();
  await switched.submit();
  assert.equal(switched.signups[0].options.data.nickname, '나만의별명', 'signup sends the nickname chosen by the member');

  const checkedNames = [];
  const rejectedName = setup('?auth=signup', { nicknameResponse: name => {
    checkedNames.push(name); return { data: checkedNames.length === 1 };
  } });
  await rejectedName.flush(); rejectedName.fill(); await rejectedName.submit();
  assert.equal(checkedNames.length, 2, 'a forbidden candidate is regenerated before account creation');
  assert.notEqual(checkedNames[0], checkedNames[1]);
  assert.equal(rejectedName.signups.length, 1);
  assert.equal(rejectedName.signups[0].options.data.nickname, checkedNames[1]);
  let customChecks = 0;
  const rejectedCustom = setup('?auth=signup', { nicknameResponse: () => { customChecks++; return { data: true }; } });
  await rejectedCustom.flush(); rejectedCustom.fill(); rejectedCustom.element('nickname').value = '직접고른이름';
  await rejectedCustom.submit();
  assert.equal(customChecks, 1, 'a rejected custom nickname is never silently regenerated');
  assert.equal(rejectedCustom.signups.length, 0);
  assert.equal(rejectedCustom.element('nickname').value, '직접고른이름');
  assert.equal(rejectedCustom.element('nickname').disabled, false);
  assert.equal(rejectedCustom.focused, 'nickname');
  assert.match(rejectedCustom.element('auth-feedback').textContent, /다른 이름을 입력/);
  let rejectedChecks = 0;
  const blockedNames = setup('?auth=signup', { nicknameResponse: () => { rejectedChecks++; return { data: true }; } });
  await blockedNames.flush(); blockedNames.fill(); await blockedNames.submit();
  assert.equal(rejectedChecks, 4, 'candidate retries are bounded');
  assert.equal(blockedNames.signups.length, 0);
  assert.match(blockedNames.element('auth-feedback').textContent, /닉네임을 만들지 못했어요/);
  for (const result of [{ data: null }, { data: 'false' }, { error: { message: 'network' } }]) {
    const app = setup('?auth=signup', { nicknameResponse: () => result });
    await app.flush(); app.fill(); await app.submit();
    assert.equal(app.signups.length, 0, 'only a successful false result allows signup');
  }
  const failedSignup = setup('?auth=signup', { signupResponse: () => ({ error: { message: 'network' } }) });
  await failedSignup.flush(); failedSignup.fill(); const failedName = failedSignup.element('nickname').value;
  await failedSignup.submit();
  assert.equal(failedSignup.signups.length, 1, 'an account creation failure never triggers an automatic retry');
  assert.equal(failedSignup.element('nickname').value, failedName);

  const nicknameMember = { id: 'nickname-member', email: 'member@ojjuda.kr', user_metadata: { nickname: '기존별명' } };
  let authStatus = 555, prepareCalls = 0, identityCalls = 0;
  const retryPark = setup('?next=note', { user:nicknameMember, userResponse:user => {
    identityCalls++;
    return authStatus ? {data:{user:null},error:{status:authStatus}} : {data:{user}};
  } });
  retryPark.client.rpc = async () => { prepareCalls++; return {data:true}; };
  await retryPark.flush();
  assert.deepEqual(retryPark.navigations,[]);
  assert.equal(prepareCalls,0,'unverified identity never enters the park');
  assert.equal(retryPark.element('back-to-login').textContent,'다시 시도');
  assert.equal(identityCalls,1,'simultaneous admin and park checks share one Auth request');
  authStatus = 0;
  retryPark.element('back-to-login').listeners.click();
  retryPark.element('back-to-login').listeners.click();
  await retryPark.flush();
  assert.equal(prepareCalls,1);
  assert.equal(identityCalls,2,'a retry gets a new server identity check');
  assert.deepEqual(retryPark.navigations,['/world.html?place=park']);
  const expiredPark = setup('?next=note', {user:nicknameMember,userResponse:()=>({data:{user:null},error:{status:401}})});
  await expiredPark.flush();
  assert.deepEqual(expiredPark.navigations,[]);
  assert.match(expiredPark.element('auth-feedback').textContent,/로그인을 다시 확인/);

  const repair = setup('?auth=login&next=note', { user: nicknameMember });
  repair.client.rpc = async () => ({ error: { code: '23505', message: 'nickname conflict' } });
  await repair.flush();
  assert.equal(repair.element('auth-title').textContent, '닉네임 정하기');
  assert.equal(repair.element('nickname').readOnly, false, 'existing nickname repair remains editable');
  assert.equal(repair.element('nickname-auto-help').hidden, true);
  repair.element('nickname').value = '새별명';
  repair.client.rpc = async () => ({ data: true });
  await repair.submit();
  assert.deepEqual(repair.navigations, ['/world.html?place=park']);
  const existing = setup('?auth=signup&next=world', { user: { id: 'existing', email: 'member@example.invalid' } });
  await existing.flush();
  assert.deepEqual(existing.navigations, ['/world.html']);
  assert.equal(existing.element('auth-dialog').open, false);

  const cardId = '00000000-0000-4000-8000-000000000010';
  const reader = { id: 'reader', email: 'reader@example.invalid' };
  const pajangConfirmed = setup('?code=confirmation'); await pajangConfirmed.flush();
  pajangConfirmed.storage.set('ojjuda_post_confirm_destination', JSON.stringify({
    destination: 'pajang', email: reader.email, expiresAt: Date.now() + 60000
  }));
  await pajangConfirmed.emit('SIGNED_IN', { user: { ...reader, email: reader.email.toUpperCase() } });
  assert.deepEqual(pajangConfirmed.navigations, ['/features/pajang/'], 'email confirmation returns the matching member to Pajang');
  for (const stored of [
    { destination: 'pajang', email: 'another@example.invalid', expiresAt: Date.now() + 60000 },
    { destination: 'pajang', email: reader.email, expiresAt: Date.now() - 1 },
    { destination: 'https://example.invalid/', email: reader.email, expiresAt: Date.now() + 60000 }
  ]) {
    const confirmation = setup('?code=confirmation'); await confirmation.flush();
    confirmation.storage.set('ojjuda_post_confirm_destination', JSON.stringify(stored));
    await confirmation.emit('SIGNED_IN', { user: reader });
    assert.deepEqual(confirmation.navigations, [], 'confirmation cannot use another account, an expired choice or an external destination');
  }
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
  runningWorldRecovery.element('back-to-login').listeners.click(); await runningWorldRecovery.flush();
  assert.deepEqual(runningWorldRecovery.navigations, ['/world.html'], 'a completed session recovery returns to its requested section');
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
  assert.equal(invalid.signups[0].options.emailRedirectTo, 'https://ojjuda.kr/?next=world');
  assert.deepEqual(invalid.navigations, []);
  const failedSession = setup('?auth=signup&next=world', { sessionError: true }); await failedSession.flush();
  assert.equal(failedSession.element('signup-tab').attributes['aria-selected'], 'true');
  const recoveryValues = { email: 'recovery@example.invalid', 'recovery-phone': '+82 10-1234-5678', 'recovery-birth': '2000-02-29', 'recovery-gender': 'male' };
  const fillRecovery = app => { for (const [key, value] of Object.entries(recoveryValues)) app.element(key).value = value; };
  for (const [destination, route] of loginRoutes) {
    const app = setup(`?auth=login&next=${destination}`); await app.flush();
    app.element('forgot-trigger').listeners.click(); fillRecovery(app); await app.submit();
    app.element('recovery-reset-button').listeners.click();
    app.element('password').value = app.element('password-confirm').value = 'new-password';
    await app.submit();
    assert.equal(app.location.search, `?next=${destination}`, 'direct password reset keeps only the safe section return');
    app.element('back-to-login').listeners.click();
    assert.equal(app.element('login-tab').attributes['aria-selected'], 'true');
    assert.deepEqual(app.navigations, [], 'direct password recovery still requires a fresh login');
    await signIn(app);
    assert.deepEqual(app.navigations, [route], `${destination} survives password recovery and a fresh login`);
  }
  for (const [returnQuery, route] of [
    ['next=pajang', '/features/pajang/'],
    [`next=note&card=${cardId}`, `/world.html?place=park&card=${cardId}`],
    [`next=groups&invite=${groupCode}`, groupPath],
    ['next=byeolcheonji&' + bookingQuery, '/byeolcheonji/?' + bookingQuery]
  ]) {
    const app = setup(`?reset=1&${returnQuery}&code=fixture&token_hash=fixture&type=recovery#access_token=fixture&type=recovery`, { user: reader });
    await app.flush();
    assert.deepEqual(app.navigations, [], 'session recovery completes before resuming the section');
    app.element('password').value = app.element('password-confirm').value = 'replacement-password';
    await app.submit();
    assert.equal(app.location.search, '?' + returnQuery, 'recovery keeps the validated card, invite or booking return');
    assert.equal(app.location.hash, '', 'recovery removes callback tokens from the URL');
    app.element('back-to-login').listeners.click(); await app.flush();
    assert.deepEqual(app.navigations, [route], 'completed session recovery resumes the original destination');
  }
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
  const guided = setup('?auth=login'); await guided.flush();
  const forgot = guided.element('forgot-trigger');
  forgot.focus(); forgot.listeners.click();
  assert.equal(guided.focused, 'email', 'opening recovery starts at the first input');
  for (const [field, value] of Object.entries(recoveryValues)) {
    guided.element('auth-submit').focus();
    await guided.submit();
    assert.equal(guided.focused, field, 'empty recovery inputs are visited in screen order');
    assert.equal(guided.recoveries.length, 0);
    guided.element(field).value = value;
  }
  await guided.submit(); assert.equal(guided.recoveries.length, 1);
  for (const [field, invalid, hint] of [
    ['email','missing-at-sign',/이메일/], ['recovery-phone','abc',/전화번호/],
    ['recovery-birth','2100-01-01',/생년월일/], ['recovery-birth','2001-02-29',/존재하지/],
    ['recovery-birth','2099-01-01',/미래/], ['recovery-gender','',/성별/]
  ]) {
    const app = setup('?auth=forgot'); await app.flush(); fillRecovery(app); app.element(field).value = invalid;
    app.element('auth-submit').focus(); await app.submit();
    assert.equal(app.recoveries.length, 0);
    assert.match(app.element('auth-feedback').textContent, hint);
    assert.equal(app.focused, field);
  }
  const remembered = setup('?auth=login'); await remembered.flush();
  remembered.element('email').value = recoveryValues.email;
  remembered.element('forgot-trigger').listeners.click();
  assert.equal(remembered.element('email').value, recoveryValues.email);
  assert.equal(remembered.focused, 'recovery-phone');
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
  closed.element('auth-dialog').close(); await closed.flush();
  closed.element('recovery-reset-button').listeners.click();
  assert.equal(closed.recoveries.length, 1); assert.equal(closed.element('recovery-reset-button').hidden, true);
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const oldIdentity = deferred(), newIdentity = deferred();
  const owners = [];
  const sessionSwitch = setup('?next=note', {user:nicknameMember,userResponse:user => {
    owners.push(user.id);
    return owners.length === 1 ? oldIdentity.promise : newIdentity.promise;
  }});
  await sessionSwitch.flush();
  await sessionSwitch.emit('SIGNED_OUT',null);
  await sessionSwitch.emit('SIGNED_IN',{user:nicknameMember});
  oldIdentity.resolve({data:{user:nicknameMember}});
  await sessionSwitch.flush();
  assert.deepEqual(owners,[nicknameMember.id,nicknameMember.id], 'even the same account gets a fresh check after signing out');
  assert.deepEqual(sessionSwitch.navigations,[], 'a response from the old session cannot open the park');
  newIdentity.resolve({data:{user:nicknameMember}});
  await sessionSwitch.flush();

  const oldNickname = deferred();
  const nicknameRace = setup('?auth=signup', { nicknameResponse: () => oldNickname.promise });
  await nicknameRace.flush(); nicknameRace.fill(); const pendingNickname = nicknameRace.submit();
  await nicknameRace.flush();
  nicknameRace.element('auth-dialog').close(); await nicknameRace.flush();
  nicknameRace.element('login-tab').listeners.click(); nicknameRace.element('auth-dialog').showModal();
  nicknameRace.element('nickname').value = '새창의이름';
  oldNickname.resolve({ data: true }); await pendingNickname;
  assert.equal(nicknameRace.signups.length, 0, 'a late nickname check cannot create an account after closing signup');
  assert.equal(nicknameRace.element('nickname').value, '새창의이름', 'a late rejection cannot regenerate a name in another view');
  assert.equal(nicknameRace.element('login-tab').attributes['aria-selected'], 'true');
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
    app.element('auth-dialog').close(); await app.flush();
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
  await signupRace.flush();
  assert.equal(signupRace.signups.length, 1, 'the signup request is pending before the dialog closes');
  signupRace.element('auth-dialog').close(); await signupRace.flush();
  signupRace.element('login-tab').listeners.click(); signupRace.element('auth-dialog').showModal();
  signupRace.element('password').value = 'replacement-password';
  oldSignup.resolve({ data: { session: null } }); await pendingSignup;
  assert.equal(signupRace.element('login-tab').attributes['aria-selected'], 'true');
  assert.equal(signupRace.element('auth-form').hidden, false, 'a previous signup response cannot replace a reopened login form');
  assert.equal(signupRace.element('password').value, 'replacement-password');
  console.log('PASS: Agit/Pajang/Park login returns, dialog reopen and signup switches, confirmation and recovery destinations, required inputs, untrusted destination rejection and account races');
})().catch(error => { console.error(error); process.exitCode = 1; });


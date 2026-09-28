const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const identity = require('../signup-identity.js');
const source = fs.readFileSync(path.join(__dirname, '../portal.js'), 'utf8');

// Exercise the real controller with a fake Auth service: no accounts or emails are created.
function setup(query, { user = null, confirmed = false, sessionError = false } = {}) {
  const elements = new Map(), tasks = [], navigations = [], signups = [], storage = new Map();
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
    from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; } }; },
    async rpc() { return { data: true }; }
  };
  const context = {
    window: { OJJUDA_CONFIG: { supabaseUrl: 'https://example.test', supabaseKey: 'test' }, supabase: { createClient: () => client }, OjjudaIdentity: identity },
    document: { getElementById: element, querySelector: element, querySelectorAll: () => [] },
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
    for (const [key, value] of Object.entries({ nickname: '테스트', email: 'signup-test@example.invalid', password: 'test-password', 'signup-birth': '000101', 'signup-code': '3', 'signup-phone': '010-1234-5678' })) element(key).value = value;
    element('age-check').checked = element('policy-check').checked = true;
  };
  return { element, flush, emit, submit, fill, navigations, signups, storage, location };
}

(async () => {
  const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  const renderer = world.slice(world.indexOf('function nr('), world.indexOf('function J1('));
  const worldRoutes = [];
  vm.runInNewContext(`${renderer}; nr('signup');`, {
    ha: 'login', location: { assign: url => worldRoutes.push(url) },
    qr() { throw new Error('World must use the common signup form'); }
  });
  assert.deepEqual(worldRoutes, ['/?auth=signup&next=world']);
  for (const destination of ['world', 'note']) {
    const app = setup(`?auth=signup&next=${destination}`); await app.flush();
    assert.equal(app.element('auth-dialog').open, true);
    assert.equal(app.element('signup-tab').attributes['aria-selected'], 'true');
    assert.equal(app.element('auth-title').textContent, '오쭈다 월드/노트');
    assert.equal(app.location.searchParams.get('auth'), null);
    app.fill(); await app.submit();
    assert.equal(app.signups.length, 1);
    const sent = app.signups[0];
    assert.equal(sent.options.emailRedirectTo, `https://ojjuda.kr/?next=${destination}`);
    assert.equal(sent.options.data.phone_number, '01012345678');
    assert.equal(sent.options.data.birth_yymmdd, '000101');
    assert.equal(sent.options.data.gender_code, '3');
    assert.equal(JSON.parse(app.storage.get('ojjuda_post_confirm_destination')).destination, destination);
    assert.equal(app.element('auth-title').textContent, '이메일을 확인해 주세요');
  }
  for (const missing of ['nickname', 'email', 'password', 'signup-birth', 'signup-code', 'signup-phone', 'age-check', 'policy-check']) {
    const app = setup('?auth=signup&next=world'); await app.flush(); app.fill();
    if (missing.endsWith('check')) app.element(missing).checked = false;
    else app.element(missing).value = '';
    await app.submit(); assert.equal(app.signups.length, 0, `${missing} must be required`);
  }
  const existing = setup('?auth=signup&next=world', { user: { id: 'existing', email: 'member@example.invalid' } });
  await existing.flush();
  assert.deepEqual(existing.navigations, ['/world.html']);
  assert.equal(existing.element('auth-dialog').open, false);

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
  console.log('PASS: unified signup entry, required inputs, confirmation return destinations, existing sessions, recovery priority, redirect allowlist');
})().catch(error => { console.error(error); process.exitCode = 1; });

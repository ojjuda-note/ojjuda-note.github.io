const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function fixture(member = true) {
  const dom = new JSDOM(read('park/index.html'), {
    url: 'https://fixture.test/park/?embedded=1', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  const observers = new Set(), MutationObserver = w.MutationObserver;
  w.MutationObserver = class extends MutationObserver {
    constructor(callback) { super(callback); observers.add(this); }
  };
  w.scrollTo = () => {};
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  let authChanged;
  let session = member ? {user:{id:'park-member-a',email:'park@example.test'}} : null;
  const calls = [];
  const client = {
    auth: {
      onAuthStateChange(callback) { authChanged = callback; },
      async getSession() { return {data:{session}}; },
      async signOut() { calls.push('signOut'); return {error:{message:'fixture stops sign out'}}; },
      async updateUser() { calls.push('updateUser'); return {data:{}}; }
    },
    async rpc(name) {
      calls.push(name);
      if (name === 'get_my_member_identity') return {data:{birth_date:'1990-01-01',age:36,age_at_signup:35,gender:'male',phone_number:'010-1234-5678'}};
      return {data:{}};
    },
    from(table) {
      return {select:() => ({eq:() => ({maybeSingle:async() => ({data:table === 'profiles' ? {nickname:'공원회원'} : {coins:50}})})})};
    },
    schema:() => ({rpc:async(name) => {
      calls.push(name);
      return {data:name === 'get_note_state' ? {} : []};
    }})
  };
  w.OJJUDA_CONFIG = {supabaseUrl:'https://fixture.test',supabaseKey:'fixture-key'};
  w.supabase = {createClient:() => client};
  w.OjjudaAccountDeletion = {run:async() => {calls.push('deleteAccount');}};
  w.eval(read('note/preview.js') + '\nwindow.parkFixture={setBusy(value){managementBusy=value;}};\n' + read('park/integration.js'));
  const settle = () => new Promise(resolve => w.setTimeout(resolve,0));
  authChanged('INITIAL_SESSION',session);
  await settle(); await settle();
  const api = w.OjjudaParkFull;
  const setting = action => w.document.querySelector(`[data-park-settings="${action}"]`);
  return {dom,w,api,calls,settle,setting,
    async close() { await settle(); for (const observer of observers) observer.disconnect(); dom.window.close(); },
    async changeUser(next) {session=next;authChanged(next?'SIGNED_IN':'SIGNED_OUT',next);await settle();},
    root:() => w.document.querySelector('[data-park-settings-root]'),
    management:() => w.document.querySelector('#management-backdrop')};
}

test('guests can open Park settings, read policies and reach login', async () => {
  const f = await fixture(false);
  try {
    assert.equal(f.api.navigate('settings'),true);
    assert.ok(f.root());
    assert.equal(f.api.navigationAction(),'settings');
    assert.ok(f.setting('login'),'guest settings have a login entry');
    assert.ok(f.setting('world'),'guests can return to Agit');
    assert.ok(f.setting('terms'));
    assert.ok(f.setting('privacy'));
    assert.equal(f.setting('logout'),null);
    assert.equal(f.setting('delete-account'),null);
    assert.equal(f.api.back(),true);
    assert.equal(f.management().hidden,true);
    assert.equal(f.api.navigationAction(),'feed');
  } finally {await f.close();}
});

test('Park settings opens the existing account forms and returns without executing destructive actions', async () => {
  const f = await fixture();
  try {
    f.api.navigate('settings');
    for (const [action,selector] of [
      ['member-info','#member-phone-edit'],
      ['nickname','#note-new-nickname'],
      ['password','#note-new-password'],
      ['blocked','.management-help'],
      ['logout','.management-footer button'],
      ['delete-account','#note-delete-nickname']
    ]) {
      assert.ok(f.setting(action),action+' is available from Park');
      f.setting(action).click();
      await f.settle();
      assert.ok(f.w.document.querySelector(selector),action+' opens its real existing form');
      assert.equal(f.api.navigationAction(),'settings',action+' stays in Park settings');
      assert.ok(f.w.document.querySelector('[data-park-settings-back]'));
      assert.equal(f.api.back(),true);
      assert.ok(f.root(),'Back returns to the Park settings list');
      assert.equal(f.api.navigationAction(),'settings');
    }
    assert.equal(f.calls.includes('signOut'),false,'opening logout never signs the user out');
    assert.equal(f.calls.includes('deleteAccount'),false,'opening account deletion never deletes the user');
    assert.equal(f.calls.includes('updateUser'),false,'opening password change never changes a password');
    f.api.back();
    assert.equal(f.management().hidden,true);
    assert.equal(f.api.navigationAction(),'feed');
  } finally {await f.close();}
});

test('pending account saves keep the current form and changing accounts clears private settings', async () => {
  const f = await fixture();
  try {
    f.api.navigate('settings');f.setting('password').click();
    const input = f.w.document.querySelector('#note-new-password');
    input.value = 'unsaved-private-value';
    f.w.parkFixture.setBusy(true);
    assert.equal(f.api.navigate('feed'),false);
    f.api.back();
    assert.equal(f.w.document.querySelector('#note-new-password'),input,'Back cannot discard a pending account save');
    assert.equal(input.value,'unsaved-private-value');
    assert.equal(f.api.navigationAction(),'settings');
    f.w.parkFixture.setBusy(false);
    await f.changeUser(null);
    assert.equal(f.management().hidden,true,'account changes dismiss prior private settings');
    assert.equal(f.w.document.querySelector('#note-new-password'),null);
    f.api.navigate('settings');
    assert.ok(f.setting('login'));
    assert.equal(f.setting('logout'),null);
    assert.equal(f.setting('delete-account'),null);
  } finally {await f.close();}
});

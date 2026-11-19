const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function fixture(member = true, {hosted = false, submitInquiry} = {}) {
  const dom = new JSDOM(read('park/index.html'), {
    url: 'https://fixture.test/park/?embedded=1', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  const messages = [];
  if (hosted) Object.defineProperty(w, 'parent', {value:{
    location:new URL('https://fixture.test/world.html'),
    postMessage(data, origin) {messages.push({data, origin});}
  }});
  const observers = new Set(), MutationObserver = w.MutationObserver;
  w.MutationObserver = class extends MutationObserver {
    constructor(callback) { super(callback); observers.add(this); }
  };
  w.scrollTo = () => {};
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const authListeners = [];
  let session = member ? {user:{id:'park-member-a',email:'park@example.test'}} : null;
  const calls = [];
  const client = {
    auth: {
      onAuthStateChange(callback) { authListeners.push(callback); },
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
      if (name === 'submit_inquiry' && submitInquiry) return submitInquiry();
      return {data:name === 'get_note_state' ? {} : []};
    }})
  };
  w.OJJUDA_CONFIG = {supabaseUrl:'https://fixture.test',supabaseKey:'fixture-key'};
  w.supabase = {createClient:() => client};
  w.OjjudaAccountDeletion = {run:async() => {calls.push('deleteAccount');}};
  w.eval(read('note/support.js'));
  w.eval(read('note/preview.js') + '\nwindow.parkFixture={setBusy(value){managementBusy=value;}};\n' + read('park/integration.js'));
  const settle = () => new Promise(resolve => w.setTimeout(resolve,0));
  for (const callback of authListeners) callback('INITIAL_SESSION',session);
  await settle(); await settle();
  const api = w.OjjudaParkFull;
  const setting = action => w.document.querySelector(`[data-park-settings="${action}"]`);
  return {dom,w,api,calls,messages,settle,setting,
    async close() { await settle(); for (const observer of observers) observer.disconnect(); dom.window.close(); },
    async changeUser(next) {session=next;for (const callback of authListeners) callback(next?'SIGNED_IN':'SIGNED_OUT',next);await settle();},
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
    f.setting('support').click(); await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
    assert.equal(f.w.document.querySelector('[data-support-withdrawal]').closest('footer').hidden,true,
      'guests do not receive a withdrawal entry in support');
    f.w.OjjudaNoteSupport.close(); f.api.navigate('settings');
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
      ['logout','.management-footer button']
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

test('Park withdrawal requires expanding account management and cancellation never deletes an account', async () => {
  const f = await fixture();
  try {
    f.api.navigate('settings');
    assert.equal(f.setting('delete-account'),null,'settings have no direct withdrawal action');
    assert.equal(f.w.document.getElementById('note-delete-account'),null,'the legacy account menu has no direct withdrawal action');
    f.setting('support').click(); await f.settle();
    const support = f.w.document.querySelector('.note-support-layer [role="dialog"]');
    const account = support.querySelector('[data-support-account]');
    const toggle = support.querySelector('[data-support-account-toggle]');
    const withdrawal = support.querySelector('[data-support-withdrawal]');
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
    assert.equal(withdrawal.closest('footer').hidden,false);
    assert.equal(support.lastElementChild,withdrawal.closest('footer'),'withdrawal is below the inquiry content and status');
    assert.equal([...support.querySelectorAll('button')].at(-1),withdrawal);
    assert.equal(account.open,false,'account management starts collapsed');
    assert.equal(toggle.textContent,'계정 관리');
    assert.equal(withdrawal.textContent,'회원 탈퇴 안내');
    withdrawal.click(); await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true,'a hidden withdrawal control cannot open confirmation');
    assert.equal(f.w.document.getElementById('note-delete-nickname'),null);
    toggle.click(); await f.settle();
    assert.equal(account.open,true);
    assert.equal(f.w.document.getElementById('note-delete-nickname'),null,'expanding account management only reveals the 안내 button');
    assert.equal(f.calls.includes('deleteAccount'),false);
    assert.equal(f.calls.includes('signOut'),false);
    withdrawal.click(); await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),false,'support closes before the existing confirmation form opens');
    const nickname = f.w.document.getElementById('note-delete-nickname');
    assert.ok(nickname,'the real existing account confirmation form opens');
    assert.equal(nickname.value,'');
    assert.equal(f.w.document.querySelector('.note-account-consent input').checked,false);
    [...f.management().querySelectorAll('button')].find(button=>button.textContent==='취소').click();
    assert.equal(f.management().hidden,true);
    assert.equal(f.calls.includes('deleteAccount'),false);
    assert.equal(f.calls.includes('signOut'),false);
    f.w.OjjudaNoteSupport.open(); await f.settle();
    assert.equal(account.open,false,'returning from confirmation starts collapsed again');
    toggle.click(); await f.settle();
    f.w.OjjudaNoteSupport.close();
    assert.equal(account.open,false,'closing support resets the expanded account section');
    f.w.OjjudaNoteSupport.open(); await f.settle();
    assert.equal(account.open,false,'reopening support keeps the section collapsed');
    toggle.click(); await f.settle();
    support.querySelector('[data-support-view="feedback"]').click();
    assert.equal(account.open,false,'changing support tabs resets account management');
    f.w.OjjudaNoteSupport.report({onSubmit:async()=>{throw Error('not submitted');}});
    assert.equal(withdrawal.closest('footer').hidden,true,'reporting content does not expose an account-deletion entry');
  } finally {await f.close();}
});

test('pending support sends and account changes cannot open the withdrawal form', async () => {
  let finishInquiry;
  const f = await fixture(true,{submitInquiry:()=>new Promise(resolve=>{finishInquiry=resolve;})});
  try {
    f.api.navigate('settings'); f.setting('support').click(); await f.settle();
    const field = f.w.document.getElementById('note-inquiry-body');
    const withdrawal = f.w.document.querySelector('[data-support-withdrawal]');
    f.w.document.querySelector('[data-support-account-toggle]').click(); await f.settle();
    assert.equal(f.w.document.querySelector('[data-support-account]').open,true);
    field.value='검증용 문의';
    field.form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(withdrawal.disabled,true);
    assert.equal(f.w.document.querySelector('[data-support-account]').open,false,'sending an inquiry closes account management');
    f.w.document.querySelector('[data-support-account-toggle]').click();
    assert.equal(f.w.document.querySelector('[data-support-account]').open,false,'account management cannot expand during a pending send');
    withdrawal.click();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
    assert.equal(f.w.document.getElementById('note-delete-nickname'),null);
    finishInquiry({data:null}); await f.settle();
    assert.equal(withdrawal.disabled,false);
    assert.equal(f.w.document.querySelector('[data-support-account]').open,false,'finishing a send does not reveal withdrawal');
    await f.changeUser({user:{id:'park-member-b',email:'other@example.test'}});
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),false);
    withdrawal.click(); await f.settle();
    assert.equal(f.w.document.getElementById('note-delete-nickname'),null,'a stale support button cannot target the next account');
    assert.equal(f.calls.includes('deleteAccount'),false);
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

test('Park settings shows its administrator mode only for the matching verified host account', async () => {
  const f = await fixture(true, {hosted:true});
  const entries = () => f.messages.filter(({data}) => data.type === 'ojjuda:park-navigate' && data.action === 'admin');
  try {
    f.api.navigate('settings');
    assert.equal(f.setting('admin'),null,'ordinary members have no administrator entry');
    assert.equal(f.api.navigate('admin'),false);
    assert.ok(f.messages.some(({data}) => data.type === 'ojjuda:park-admin-refresh'),'opening settings refreshes the host role');
    f.api.setAdminAccess({userId:'another-member',allowed:true});
    assert.equal(f.setting('admin'),null,'a role for another account cannot appear');
    f.api.setAdminAccess({userId:'park-member-a',allowed:true});
    assert.equal(f.setting('admin').textContent,'공원 관리자모드›');
    assert.equal(f.setting('admin').classList.contains('park-settings-row'),true,'administrator entry shares the existing settings layout');
    f.w.parkFixture.setBusy(true); f.setting('admin').click();
    assert.equal(entries().length,0,'an unfinished account save blocks leaving settings');
    assert.ok(f.root());
    f.w.parkFixture.setBusy(false);
    f.api.setAdminAccess({userId:'park-member-a',allowed:false});
    assert.equal(f.setting('admin'),null,'revoked access disappears immediately');
    assert.equal(f.api.navigate('admin'),false);
    await f.changeUser({user:{id:'park-member-a',user_metadata:{is_admin:true,role:'admin'}}});
    f.api.navigate('settings');
    assert.equal(f.setting('admin'),null,'editable user metadata cannot grant access');
    f.api.setAdminAccess({userId:'park-member-a',allowed:true});
    f.setting('admin').click();
    assert.equal(entries().length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(entries()[0])), {
      data:{type:'ojjuda:park-navigate',action:'admin',userId:'park-member-a'},origin:'https://fixture.test'
    });
    assert.equal(f.management().hidden,true);
    f.api.navigate('settings');
    await f.changeUser({user:{id:'park-member-b'}});
    f.api.navigate('settings');
    assert.equal(f.setting('admin'),null,'another member never inherits the earlier host grant');
    assert.equal(f.api.navigate('admin'),false);
    assert.equal(entries().length,1);
    assert.equal(f.calls.includes('updateUser'),false);
    assert.equal(f.calls.includes('deleteAccount'),false);
  } finally {await f.close();}
});

test('guest and standalone Park settings never expose the host administrator shortcut', async () => {
  for (const [member, hosted] of [[false,true],[true,false]]) {
    const f = await fixture(member, {hosted});
    try {
      f.api.setAdminAccess({userId:'park-member-a',allowed:true});
      f.api.navigate('settings');
      assert.equal(f.setting('admin'),null);
      assert.equal(f.api.navigate('admin'),false);
    } finally {await f.close();}
  }
});

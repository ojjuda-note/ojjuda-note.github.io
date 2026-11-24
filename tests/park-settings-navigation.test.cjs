const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function fixture(member = true, {hosted = false, submitInquiry, mutationLimit = Infinity, standaloneNavigation = false} = {}) {
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
  let mutationCount = 0;
  w.MutationObserver = class extends MutationObserver {
    constructor(callback) {
      super((...args) => {
        if (++mutationCount > mutationLimit) { for (const observer of observers) observer.disconnect(); return; }
        callback(...args);
      });
      observers.add(this);
    }
  };
  w.scrollTo = () => {};
  w.matchMedia = () => ({matches:false, addEventListener() {}});
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
    schema:() => ({
      rpc:async(name) => {
        calls.push(name);
        if (name === 'submit_inquiry' && submitInquiry) return submitInquiry();
        return {data:name === 'get_note_state' ? {} : ['get_card','get_my_event'].includes(name)?null:[]};
      },
      from() {
        const q={select:()=>q,eq:()=>q,not:()=>q,contains:()=>q,lte:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:[]})};return q;
      }
    })
  };
  w.OJJUDA_CONFIG = {supabaseUrl:'https://fixture.test',supabaseKey:'fixture-key'};
  w.supabase = {createClient:() => client};
  w.OjjudaAccountDeletion = {run:async() => {calls.push('deleteAccount');}};
  w.eval(read('shared/brand/service-banners.js'));
  w.eval(read('note/support.js'));
  if (standaloneNavigation) w.eval(read('note/navigation.js'));
  w.eval(read('note/preview.js') + '\nwindow.parkFixture={setBusy(value){managementBusy=value;},openCard(id){openCard(id);},backCard(){goBack();},closeManagement(){closeManagement();}};\n' + read('park/integration.js'));
  const settle = () => new Promise(resolve => w.setTimeout(resolve,0));
  for (const callback of authListeners) callback('INITIAL_SESSION',session);
  await settle(); await settle();
  const api = w.OjjudaParkFull;
  const setting = action => w.document.querySelector(`[data-park-settings="${action}"]`);
  return {dom,w,api,calls,messages,settle,setting,mutationCount:() => mutationCount,
    async back() {const popped=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));assert.equal(api.back(),true);await popped;await settle();},
    async forward() {const popped=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));w.history.forward();await popped;await settle();},
    async close() { await settle(); for (const observer of observers) observer.disconnect(); dom.window.close(); },
    async changeUser(next) {session=next;for (const callback of authListeners) callback(next?'SIGNED_IN':'SIGNED_OUT',next);await settle();},
    root:() => w.document.querySelector('[data-park-settings-root]'),
    management:() => w.document.querySelector('#management-backdrop')};
}

test('standalone mobile and desktop settings buttons open the canonical settings and both banners', async () => {
  for (const member of [false,true]) {
    const f = await fixture(member,{standaloneNavigation:true});
    try {
      for (const button of f.w.document.querySelectorAll('[data-note-my]')) {
        button.click(); await f.settle();
        assert.ok(f.root(),'actual navigation opens canonical settings');
        assert.equal(f.w.document.getElementById('note-my-screen').hidden,true,'legacy dashboard is not displayed');
        assert.equal(f.root().lastElementChild.localName,'ojjuda-service-banners');
        const testLink = f.root().lastElementChild.querySelector('.ojjuda-test-service-link');
        assert.equal(testLink.textContent, 'Test service');
        assert.equal(testLink.getAttribute('href'), '/avatar-test/');
        assert.equal(testLink.target, '_top');
        assert.deepEqual([...f.root().querySelectorAll('.ojjuda-service-banner')].map(link=>link.dataset.service),['agit','pajang']);
        assert.ok(f.root().querySelector('.ojjuda-settings-group .ojjuda-settings-list .ojjuda-settings-row'));
        assert.deepEqual([...f.root().querySelectorAll('.ojjuda-settings-heading')].map(el=>el.textContent),
          ['내 정보','앱 다운로드','이용 설정','활동·도움']);
        for (const id of ['events','event-new','notifications']) assert.equal(f.setting(id),null);
        for (const [id,key] of [['profile','profile'],['friends','friends'],['friend-alert','notifications']]) {
          if (!member) { assert.equal(f.setting(id),null); continue; }
          assert.equal(f.setting(id).getAttribute('href'),'/world.html?tab=my&setting='+key);
          assert.equal(f.setting(id).target,'_top');
        }
        assert.ok(f.setting('charge'));
        assert.deepEqual([...f.root().querySelectorAll('[data-store-app]')].map(el=>el.dataset.storeApp),['agit','pajang','park']);
        await f.back();
        assert.equal(f.management().hidden,true);
      }
    } finally {await f.close();}
  }
});

test('guests can open Park settings, read policies and reach login', async () => {
  const f = await fixture(false);
  try {
    assert.equal(f.api.navigate('settings'),true);
    assert.ok(f.root());
    assert.equal(f.root().lastElementChild.localName,'ojjuda-service-banners');
    assert.deepEqual([...f.root().querySelectorAll('.ojjuda-service-banner')].map(link=>link.dataset.service),['agit','pajang']);
    assert.equal(f.api.navigationAction(),'settings');
    assert.ok(f.setting('login'),'guest settings have a login entry');
    assert.ok(f.setting('world'),'guests can return to Agit');
    assert.ok(f.setting('terms'));
    assert.ok(f.setting('privacy'));
    assert.equal(f.setting('organization').getAttribute('href'),'/features/organization/?from=park');
    assert.equal(f.setting('organization').getAttribute('target'),'_top');
    assert.match(f.setting('organization').closest('details').querySelector('summary').textContent,/도움말/);
    assert.equal(f.setting('logout'),null);
    assert.equal(f.setting('delete-account'),null);
    f.setting('support').click(); await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
    assert.equal(f.w.document.querySelector('[data-support-withdrawal]').closest('footer').hidden,true,
      'guests do not receive a withdrawal entry in support');
    await f.back();
    assert.ok(f.root(),'Back from support restores guest settings');
    await f.back();
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
      await f.back();
      assert.ok(f.root(),'Back returns to the Park settings list');
      assert.equal(f.api.navigationAction(),'settings');
    }
    assert.equal(f.calls.includes('signOut'),false,'opening logout never signs the user out');
    assert.equal(f.calls.includes('deleteAccount'),false,'opening account deletion never deletes the user');
    assert.equal(f.calls.includes('updateUser'),false,'opening password change never changes a password');
    await f.back();
    assert.equal(f.management().hidden,true);
    assert.equal(f.api.navigationAction(),'feed');
  } finally {await f.close();}
});

test('Park withdrawal disclosure and Back/Forward preserve support without deleting an account', async () => {
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
    const deletionNavigation=f.api.navigationAction();
    assert.equal(f.w.document.querySelector('[data-park-settings-back]'),null,'withdrawal belongs to support');
    assert.equal(nickname.value,'');
    assert.equal(f.w.document.querySelector('.note-account-consent input').checked,false);
    const returned=new Promise(resolve=>f.w.addEventListener('popstate',resolve,{once:true}));
    [...f.management().querySelectorAll('button')].find(button=>button.textContent==='취소').click();
    assert.equal(f.management().hidden,true);
    await returned;await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true,'cancelling returns to the support screen that opened withdrawal');
    assert.equal(f.w.history.state.ojjudaParkRoute.view,'support');
    await f.forward();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),false);
    assert.ok(f.w.document.getElementById('note-delete-nickname'),'Forward restores only the confirmation form');
    assert.equal(f.api.navigationAction(),deletionNavigation,'Forward retains the same owning screen');
    assert.equal(f.w.document.querySelector('[data-park-settings-back]'),null,'Forward does not relabel support as settings');
    assert.equal(f.w.document.getElementById('note-delete-nickname').value,'');
    assert.equal(f.w.document.querySelector('.note-account-consent input').checked,false);
    await f.back();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
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
    assert.equal(f.api.back(),true,'the pending support send consumes Back without leaving');
    await f.settle();
    assert.equal(f.w.OjjudaNoteSupport.isOpen(),true);
    assert.equal(f.w.history.state.ojjudaParkRoute.view,'support');
    assert.equal(field.value,'검증용 문의','a pending send retains its content');
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


test('Park Back and Forward restore the actual collections and settings sequence', async () => {
  const f = await fixture();
  try {
    f.api.navigate('saved'); await f.settle();
    f.api.navigate('mine'); await f.settle();
    f.api.navigate('settings'); await f.settle();
    assert.equal(f.api.navigationAction(),'settings');
    assert.equal(f.setting('terms').target,'_top','internal policy links stay in the current app window');
    await f.back(); assert.equal(f.api.navigationAction(),'mine');
    await f.back(); assert.equal(f.api.navigationAction(),'saved');
    await f.back(); assert.equal(f.api.navigationAction(),'feed');
    await f.forward(); assert.equal(f.api.navigationAction(),'saved');
    await f.forward(); assert.equal(f.api.navigationAction(),'mine');
    await f.forward(); assert.equal(f.api.navigationAction(),'settings');
    assert.ok(f.root());
  } finally {await f.close();}
});

test('explicit Park reentry resets retained settings without a reload or an extra child history step', async () => {
  const f=await fixture();
  try{
    f.api.navigate('saved');await f.settle();
    f.api.navigate('settings');await f.settle();
    const previous=f.api.navigationSnapshot(),length=f.w.history.length;
    f.w.parkFixture.setBusy(true);
    assert.equal(f.api.returnHome(),false,'a pending account save blocks resetting the frame');
    assert.ok(f.root());
    f.w.parkFixture.setBusy(false);
    assert.equal(f.api.returnHome(),true,'a loaded frame can close retained settings and serve the next visit');
    await f.settle();
    assert.equal(f.api.navigationAction(),'feed');
    assert.equal(f.management().hidden,true);
    assert.equal(f.w.history.length,length,'the parent owns this new visit');
    assert.equal(f.w.history.state.ojjudaParkRoute.index,previous.index);
    assert.equal(f.api.restoreNavigation(previous),true);await f.settle();
    assert.ok(f.root(),'Back can still restore the saved settings snapshot');
    assert.equal(f.api.navigationSnapshot().mode,'saved');
  }finally{await f.close();}
});

test('closing a pending charge consumes its popup history without repeating the busy guard', async () => {
  // Bound observer callbacks so the previous microtask loop fails instead of
  // preventing the test runner from ever reaching its timeout or cleanup.
  const f = await fixture(true, {mutationLimit:200});
  let finishCharge, chargeCalls = 0, balance;
  try {
    f.w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    f.w.HTMLDialogElement.prototype.close = function() {
      if (!this.open) return;
      this.open = false;
      f.w.setTimeout(() => this.dispatchEvent(new f.w.Event('close')),0);
    };
    f.w.eval(read('features/wallet/ju-charge.js'));
    f.w.OjjudaCharge.install({getUserId:() => 'park-member-a',source:'note',onBalance:coins => {balance = coins;},client:{
      rpc:async name => {
        if (name === 'beta_charge') {
          chargeCalls++;
          return new Promise(resolve => {finishCharge = () => resolve({data:{ok:true,coins:110,added:10}});});
        }
        return {data:{ok:true,enabled:true,coins:100,left:5,limit:5}};
      }
    }});
    f.api.navigate('saved'); await f.settle();
    const index = f.w.history.state.ojjudaParkRoute.index;
    f.w.OjjudaCharge.open(); await f.settle();
    assert.equal(f.w.history.state.ojjudaParkRoute.view,'charge');
    f.w.document.querySelector('.ju-charge-checkout').click(); await f.settle();
    assert.equal(chargeCalls,1);
    assert.equal(f.w.OjjudaCharge.canLeave(),false);
    f.w.document.querySelector('.ju-charge-close').click();
    for (let i=0;i<4;i++) await f.settle();
    assert.ok(f.mutationCount()<200,'closing the dialog must not feed busy messages back into its observer');
    assert.equal(f.w.OjjudaCharge.isOpen(),false);
    assert.equal(f.w.history.state.ojjudaParkRoute.view,null);
    assert.equal(f.w.history.state.ojjudaParkRoute.index,index,'only the closed popup entry is consumed');
    assert.equal(f.api.navigationAction(),'saved');
    assert.equal(f.api.navigate('settings'),false,'a pending charge still blocks leaving the current screen');
    assert.equal(f.api.navigationAction(),'saved');
    finishCharge(); await f.settle();
    assert.equal(balance,110);
    assert.equal(chargeCalls,1);
    assert.equal(f.w.OjjudaCharge.canLeave(),true);
    await f.back();
    assert.equal(f.api.navigationAction(),'feed','Back works again after the response updates the balance');
  } finally {await f.close();}
});


test('card details return through saved cards and nested cards without resetting their collection', async () => {
  const f = await fixture();
  const first='10000000-0000-4000-8000-000000000001',second='20000000-0000-4000-8000-000000000002';
  try {
    f.api.navigate('saved');await f.settle();
    f.w.parkFixture.openCard(first);await f.settle();
    f.w.parkFixture.openCard(second);await f.settle();
    assert.equal(new URL(f.w.location.href).searchParams.get('card'),second);
    await f.back();assert.equal(new URL(f.w.location.href).searchParams.get('card'),first);
    await f.back();assert.equal(new URL(f.w.location.href).searchParams.get('card'),null);
    assert.equal(f.api.navigationAction(),'saved');assert.equal(f.api.cardOpen(),false);
    await f.forward();assert.equal(new URL(f.w.location.href).searchParams.get('card'),first);
    assert.equal(f.api.cardOpen(),true);
    const popped=new Promise(resolve=>f.w.addEventListener('popstate',resolve,{once:true}));
    f.w.parkFixture.backCard();await popped;await f.settle();
    assert.equal(f.api.cardOpen(),false);assert.equal(f.api.navigationAction(),'saved');
  } finally {await f.close();}
});


test('a fresh Park frame restores a saved route without replaying actions or retaining another account', async () => {
  const first = await fixture(),second = await fixture();
  try {
    first.api.navigate('saved');await first.settle();
    first.w.parkFixture.openCard('10000000-0000-4000-8000-000000000001');await first.settle();
    const route=first.api.navigationSnapshot();
    assert.equal(second.api.restoreNavigation(route),true);await second.settle();
    assert.equal(second.api.navigationAction(),'saved');assert.equal(second.api.cardOpen(),true);
    assert.match(second.w.location.search,/card=10000000/);
    assert.equal(second.w.history.state.ojjudaParkRoute.index,0,'a recreated iframe does not point to nonexistent old history entries');
    second.api.restoreNavigation({...route,owner:'another-account',view:'delete-account'});await second.settle();
    assert.equal(second.api.navigationAction(),'feed');assert.equal(second.api.cardOpen(),false);
    assert.equal(second.calls.includes('deleteAccount'),false);assert.equal(second.management().hidden,true);
  } finally {await first.close();await second.close();}
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
    assert.equal(f.root().lastElementChild.localName,'ojjuda-service-banners','asynchronous administrator access keeps service banners at the bottom');
    f.w.parkFixture.setBusy(true); f.setting('admin').click();
    assert.equal(entries().length,0,'an unfinished account save blocks leaving settings');
    assert.ok(f.root());
    f.w.parkFixture.setBusy(false);
    f.api.setAdminAccess({userId:'park-member-a',allowed:false});
    assert.equal(f.setting('admin'),null,'revoked access disappears immediately');
    assert.equal(f.root().lastElementChild.localName,'ojjuda-service-banners','revoking access leaves the same final banner row');
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
    assert.equal(f.api.navigationSnapshot().view,'settings','the host captures settings as the route to return to');
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


test('Park teardown cannot navigate Back and BFCache restores its displayed route', async () => {
  const f=await fixture();
  try {
    f.api.navigate('settings');await f.settle();
    const originalState=JSON.stringify(f.w.history.state),length=f.w.history.length;
    let backCalls=0;
    const nativeBack=f.w.history.back.bind(f.w.history);
    f.w.history.back=()=>{backCalls++;nativeBack();};
    f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
    f.w.parkFixture.closeManagement();await f.settle();await f.settle();
    assert.equal(backCalls,0,'teardown does not cancel the next-page navigation');
    assert.equal(f.w.history.length,length);assert.equal(JSON.stringify(f.w.history.state),originalState);
    assert.equal(f.api.navigate('mine'),false,'late callbacks do not create entries after leaving');
    f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
    await f.settle();await f.settle();
    assert.ok(f.root(),'BFCache restores the saved settings screen');
    assert.equal(f.api.navigationAction(),'settings');
    await f.back();assert.equal(f.management().hidden,true);assert.equal(f.api.navigationAction(),'feed');
  } finally {await f.close();}
});


test('leaving Park settings for Agit preserves the originating screen in host history', async () => {
  const f=await fixture(true,{hosted:true});
  try {
    f.api.navigate('settings');await f.settle();
    const before=f.api.navigationSnapshot(),length=f.w.history.length;
    assert.equal(f.api.navigate('world'),true);await f.settle();
    assert.equal(f.messages.at(-1).data.action,'world');
    const after=f.api.navigationSnapshot();
    assert.equal(after.view,before.view);assert.equal(after.index,before.index);
    assert.equal(f.w.history.length,length,'the iframe does not add a transient feed step while leaving');
  } finally {await f.close();}
});

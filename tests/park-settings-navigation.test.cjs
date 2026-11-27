const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function fixture(member = true, {hosted = false, submitInquiry, mutationLimit = Infinity, standaloneNavigation = false, account = {}} = {}) {
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
      async updateUser(payload) {
        calls.push('updateUser');
        if (account.updateUser) return account.updateUser(payload);
        session = {user:{...session.user,user_metadata:{...session.user.user_metadata,...payload.data}}};
        return {data:session};
      }
    },
    async rpc(name) {
      calls.push(name);
      if (name === 'get_my_member_identity') return {data:{birth_date:'1990-01-01',age:36,age_at_signup:35,gender:'male',phone_number:'010-1234-5678'}};
      return {data:{}};
    },
    from(table) {
      let id, changes, fields;
      const q = {
        select(columns) {fields=columns;return q;}, eq(_key, value) {id=value;return q;},
        or() {return q;}, in() {return q;}, update(values) {changes=values;return q;},
        async maybeSingle() {
          if (table !== 'profiles') return {data:{coins:50}};
          if (account.profile) return account.profile({id,fields});
          return {data:{nickname:'공원회원',bio:''}};
        },
        async single() {return account.saveProfile({id,changes});},
        then(resolve,reject) {return Promise.resolve({data:[]}).then(resolve,reject);}
      };
      return q;
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
  w.eval(read('features/profile/world-profile-photo.js'));
  w.eval(read('features/friends/friend-messages.js'));
  w.eval(read('note/preview.js') + '\nwindow.parkFixture={setBusy(value){managementBusy=value;},openCard(id){openCard(id);},backCard(){goBack();},closeManagement(){closeManagement();}};\n' +
    read('park/account-settings.js') + '\n' + read('park/friends.js') + '\n' + read('park/integration.js'));
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
        assert.equal(f.root().lastElementChild.getAttribute('aria-label'),'앱 다운로드');
        assert.equal(f.root().lastElementChild.previousElementSibling.querySelectorAll('.ojjuda-service-banner').length,2);
        assert.deepEqual([...f.root().querySelectorAll('.ojjuda-service-banner')].map(link=>link.dataset.service),['agit','pajang']);
        assert.ok(f.root().querySelector('.ojjuda-settings-group .ojjuda-settings-list .ojjuda-settings-row'));
        assert.deepEqual([...f.root().querySelectorAll('.ojjuda-settings-heading')].map(el=>el.textContent),
          ['내 정보','이용 설정','활동·도움','앱 다운로드']);
        for (const id of ['events','event-new','notifications']) assert.equal(f.setting(id),null);
        for (const id of ['profile','friends','friend-alert']) {
          if (!member) { assert.equal(f.setting(id),null); continue; }
          assert.equal(f.setting(id).tagName,'BUTTON');
          assert.equal(f.setting(id).hasAttribute('href'),false);
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
    assert.equal(f.root().lastElementChild.getAttribute('aria-label'),'앱 다운로드');
    assert.deepEqual([...f.root().querySelectorAll('.ojjuda-service-banner')].map(link=>link.dataset.service),['agit','pajang']);
    assert.equal(f.api.navigationAction(),'settings');
    assert.ok(f.setting('login'),'guest settings have a login entry');
    assert.equal(f.setting('world'),null,'the service banner is the only Agit entry');
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
      ['profile','#park-profile-bio'],
      ['friends','#park-friend-search'],
      ['friend-alert','.park-alert-setting input'],
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
  const destinations = [];
  function clickAdmin() {
    const entry = f.setting('admin');
    entry.addEventListener('click', event => {
      if (!event.defaultPrevented) destinations.push(entry.getAttribute('href'));
      event.preventDefault();
    }, {once:true});
    entry.click();
  }
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
    assert.equal(f.root().lastElementChild.getAttribute('aria-label'),'앱 다운로드','asynchronous administrator access keeps downloads last');
    f.w.parkFixture.setBusy(true); clickAdmin();
    assert.equal(destinations.length,0,'an unfinished account save blocks leaving settings');
    assert.ok(f.root());
    f.w.parkFixture.setBusy(false);
    f.api.setAdminAccess({userId:'park-member-a',allowed:false});
    assert.equal(f.setting('admin'),null,'revoked access disappears immediately');
    assert.equal(f.root().lastElementChild.getAttribute('aria-label'),'앱 다운로드','revoking access keeps downloads last');
    assert.equal(f.api.navigate('admin'),false);
    await f.changeUser({user:{id:'park-member-a',user_metadata:{is_admin:true,role:'admin'}}});
    f.api.navigate('settings');
    assert.equal(f.setting('admin'),null,'editable user metadata cannot grant access');
    f.api.setAdminAccess({userId:'park-member-a',allowed:true});
    assert.equal(f.setting('admin').target,'_top');
    clickAdmin();
    assert.deepEqual(destinations,['/admin/?from=park&admin=cards']);
    assert.equal(f.messages.some(({data}) => data.type === 'ojjuda:park-navigate' && data.action === 'admin'),false);
    assert.equal(f.api.navigationSnapshot().view,'settings','Park retains settings as the return screen');
    f.api.navigate('settings');
    await f.changeUser({user:{id:'park-member-b'}});
    f.api.navigate('settings');
    assert.equal(f.setting('admin'),null,'another member never inherits the earlier host grant');
    assert.equal(f.api.navigate('admin'),false);
    assert.equal(destinations.length,1);
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
    f.root().querySelector('.ojjuda-service-banner[data-service="agit"]').click();await f.settle();
    assert.equal(f.messages.at(-1).data.action,'world');
    const after=f.api.navigationSnapshot();
    assert.equal(after.view,before.view);assert.equal(after.index,before.index);
    assert.equal(f.w.history.length,length,'the iframe does not add a transient feed step while leaving');
  } finally {await f.close();}
});

test('Park profile retries a failed read, preserves a failed edit and reloads the saved profile locally', async () => {
  let saved = {nickname:'공원회원',bio:'반갑습니다'}, failRead = true, failWrite = true;
  const account = {
    profile({fields}) {
      if (fields.includes('bio') && failRead) return {error:{message:'offline'}};
      return {data:{...saved}};
    },
    saveProfile({id,changes}) {
      assert.equal(id,'park-member-a');
      if (failWrite) return {error:{message:'offline'}};
      assert.ok(changes.updated_at);
      saved = {nickname:changes.nickname,bio:changes.bio};
      return {data:{...saved}};
    }
  };
  const f = await fixture(true,{account});
  try {
    const doc = f.w.document;
    f.api.navigate('settings');f.setting('profile').click();await f.settle();
    assert.match(f.management().textContent,/프로필을 불러오지 못했어요/);
    failRead = false;
    [...f.management().querySelectorAll('button')].find(b=>b.textContent==='다시 시도').click();await f.settle();
    const name = doc.getElementById('park-profile-name'), intro = doc.getElementById('park-profile-bio');
    assert.equal(name.value,'공원회원');assert.equal(intro.value,'반갑습니다');
    assert.ok(f.management().querySelector('.park-profile-photo'));
    name.value='새 이름';intro.value='새 소개';
    f.w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    f.w.HTMLDialogElement.prototype.close = function() { this.open = false; };
    f.w.HTMLCanvasElement.prototype.getContext = () => ({fillRect() {}});
    f.management().querySelector('.park-profile-photo').click();await f.settle();
    assert.ok(doc.querySelector('.profile-photo-dialog[open]'));
    assert.equal(f.api.navigationSnapshot().view,'account-dialog');
    await f.back();
    assert.equal(f.api.navigationSnapshot().view,'profile');
    assert.equal(doc.getElementById('park-profile-bio'),intro);
    assert.equal(intro.value,'새 소개');
    const submit = () => name.form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
    submit();await f.settle();
    assert.match(doc.querySelector('.management-message').textContent,/다시 시도/);
    assert.equal(intro.value,'새 소개');assert.equal(saved.bio,'반갑습니다');
    failWrite = false;submit();await f.settle();
    assert.match(f.management().textContent,/프로필을 저장했어요/);
    await f.back();
    assert.ok(f.root());
    await f.forward();
    assert.equal(doc.getElementById('park-profile-name').value,'새 이름');
    assert.equal(doc.getElementById('park-profile-bio').value,'새 소개');
    assert.equal(f.w.location.pathname,'/park/');
  } finally {await f.close();}
});

test('Park friend alerts save their own setting, roll back a failed save and isolate a late account response', async () => {
  const writes=[];
  let save = 'success', release;
  const account = {async updateUser(payload) {
    assert.deepEqual(Object.keys(payload.data),['park_friend_alerts']);
    const enabled = payload.data.park_friend_alerts;writes.push(enabled);
    if (save === 'error') return {error:{message:'offline'}};
    if (save === 'delayed') await new Promise(resolve=>{ release=resolve; });
    return {data:{user:{id:'park-member-a',user_metadata:{park_friend_alerts:enabled}}}};
  }};
  const f = await fixture(true,{account});
  try {
    const input=()=>f.management().querySelector('.park-alert-setting input');
    f.api.navigate('settings');f.setting('friend-alert').click();await f.settle();
    assert.ok(input().checked);
    save='error';input().click();await f.settle();
    assert.ok(input().checked,'failed write restores the saved preference');
    save='success';input().click();await f.settle();
    assert.equal(input().checked,false);
    assert.match(f.management().textContent,/알림을 껐어요/);
    await f.back();await f.forward();
    assert.equal(input().checked,false);
    const oldInput = input();
    save='delayed';oldInput.click();await f.settle();
    await f.changeUser({user:{id:'park-member-b',user_metadata:{park_friend_alerts:false}}});
    f.api.navigate('settings');f.setting('friend-alert').click();await f.settle();
    release();await f.settle();
    oldInput.dispatchEvent(new f.w.Event('change'));
    assert.equal(input().checked,false);
    assert.deepEqual(writes,[false,false,true]);
    assert.equal(f.w.location.pathname,'/park/');
  } finally {await f.close();}
});

test('a late Park profile read cannot render the previous member after switching accounts', async () => {
  let release;
  const account={async profile({id,fields}) {
    if (id==='park-member-a' && fields.includes('bio')) await new Promise(resolve=>{release=resolve;});
    return {data:{nickname:id==='park-member-a'?'첫 회원':'다음 회원',bio:''}};
  }};
  const f=await fixture(true,{account});
  try {
    f.api.navigate('settings');f.setting('profile').click();await f.settle();
    assert.ok(release);
    await f.changeUser({user:{id:'park-member-b'}});
    f.api.navigate('settings');f.setting('profile').click();await f.settle();
    release();await f.settle();
    assert.equal(f.w.document.getElementById('park-profile-name').value,'다음 회원');
  } finally {await f.close();}
});

test('Park-only junior members see their permitted account and blocking tools', async () => {
  const f=await fixture(true);
  try {
    await f.changeUser({user:{id:'junior',role:'park_junior',app_metadata:{park_guardian_account:true}}});
    f.api.navigate('settings');
    for (const item of ['member-info','password','logout','blocked']) assert.ok(f.setting(item),item);
    for (const item of ['profile','nickname','friends','friend-alert','charge']) assert.equal(f.setting(item),null,item);
    f.api.navigate('friends');
    assert.ok(f.root());
  } finally { await f.close(); }
});

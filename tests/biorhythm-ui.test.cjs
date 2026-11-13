const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID, webcrypto, createHash } = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { JSDOM } = require('jsdom');

const appDir = path.resolve(__dirname, '../features/biorhythm');
// It is still November 12 in UTC, but already November 13 in Korea.
const fixedNow = '2026-11-12T15:00:00.000Z';
const settle = () => new Promise(resolve => setImmediate(resolve));
const member = '11111111-1111-4111-8111-111111111111';
const otherMember = '22222222-2222-4222-8222-222222222222';
const dayMs = 86400000;
const birthdayKey = owner => 'ojjuda-biorhythm-birthdays-v1:' + owner;
const fingerprint = (birth, user = member) => createHash('sha256').update(JSON.stringify(['ojjuda:biorhythm:v1',user.toLowerCase(),birth])).digest('hex');
async function until(check, message = 'the operation should settle') {
  for (let index = 0; index < 300 && !check(); index++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(check(), message);
}

async function page(t, options = {}) {
  const dom = new JSDOM(await fs.readFile(path.join(appDir, 'index.html'), 'utf8'), {
    url: 'https://ojjuda.kr/features/biorhythm/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const state = { network: [], storageWrites: [], copies: [], errors: [], rpcCalls: [], analytics: [], pending:0,
    now:Date.parse(options.now || fixedNow),balance:options.coins ?? 100,entitlements:new Map(),requests:new Map(),
    session:options.signedIn === false ? null : {user:{id:member,is_anonymous:options.anonymous === true}} };
  const NativeDate = window.Date;
  window.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  };
  window.TextEncoder = TextEncoder;
  Object.defineProperty(window.crypto, 'subtle', {configurable:true,value:{async digest(...args) {
    state.pending++; try { return await webcrypto.subtle.digest(...args); } finally { state.pending--; }
  }}});
  Object.defineProperty(window.crypto, 'randomUUID', {configurable:true,value:randomUUID});
  const nowISO = () => new Date(state.now).toISOString();
  const meta = () => ({server_now:nowISO(),access_hours:24,access_version:1,entitlement_version:1});
  function receipt(key, overrides = {}) {
    return {ok:true,entitled:true,request_id:randomUUID(),birth_key:key,product:'biorhythm',topic:'rhythm',
      title:'오늘의 바이오리듬',price:5,coins:state.balance,charged:5,replayed:false,entitlement_replayed:false,
      paid_at:nowISO(),expires_at:new Date(state.now+dayMs).toISOString(),...meta(),...overrides};
  }
  function seed(birth, overrides = {}) {
    const key = fingerprint(birth,state.session.user.id);
    const item = receipt(key,overrides); state.entitlements.set(key,item); state.requests.set(item.request_id,item); return item;
  }
  function defaultRpc(name, args) {
    const saved = state.entitlements.get(args.p_birth_key);
    const active = saved && Date.parse(saved.expires_at)>state.now;
    const replay = item => ({...item,...meta(),charged:0,replayed:true,entitlement_replayed:true,coins:state.balance});
    if (name === 'biorhythm_status_v1') return {data:{ok:true,coins:state.balance,birth_key:args.p_birth_key,price:5,...meta(),entitlement:active?replay(saved):null}};
    assert.equal(name,'biorhythm_buy_v1');
    if (args.p_expected_user !== state.session?.user.id) return {data:{ok:false,reason:'account_changed'}};
    const prior = state.requests.get(args.p_request_id);
    if (prior) return {data:Date.parse(prior.expires_at)>state.now?replay(prior):{ok:false,reason:'access_expired',coins:state.balance}};
    if (active) return {data:replay(saved)};
    if (args.p_expected_charge !== 5) return {data:{ok:false,reason:'price_changed',required:5,coins:state.balance,price:5,...meta()}};
    if (state.balance<5) return {data:{ok:false,reason:'coins',coins:state.balance}};
    state.balance -= 5;
    const item = receipt(args.p_birth_key,{request_id:args.p_request_id});
    state.entitlements.set(args.p_birth_key,item); state.requests.set(item.request_id,item);
    return {data:item};
  }
  let authChanged;
  const client = {auth:{
    async getSession() { return {data:{session:state.session}}; },
    onAuthStateChange(fn) { authChanged=fn; return {data:{subscription:{unsubscribe(){}}}}; }
  },rpc:async(name,args)=>{
    state.rpcCalls.push({name,args:JSON.parse(JSON.stringify(args))});
    state.pending++;
    try { return await (options.respond ? options.respond(name,args,state,defaultRpc) : defaultRpc(name,args)); }
    finally { state.pending--; }
  }};
  window.ojjudaSupabase=client;
  window.OjjudaSiteUsage={configure(value){state.analytics.push(value.client);if(options.analyticsFails)throw new Error('statistics unavailable');}};
  function setAccount(userId) {
    state.session=userId ? {user:{id:userId}} : null;
    authChanged(userId?'SIGNED_IN':'SIGNED_OUT',state.session);
  }
  // Announcements need not keep a real timer alive in these interaction tests.
  let nextTimer = 0;
  const timers = new Map();
  window.setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.addEventListener('error', event => { state.errors.push(event.error || event.message); event.preventDefault(); });
  window.fetch = (...args) => { state.network.push(['fetch', ...args]); throw new Error('Birth information must stay in this page'); };
  window.XMLHttpRequest.prototype.open = function (...args) { state.network.push(['xhr', ...args]); throw new Error('Unexpected network request'); };
  Object.defineProperty(window.navigator, 'sendBeacon', {value: (...args) => { state.network.push(['beacon', ...args]); return false; }});
  const nativeSetItem = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = function (...args) {
    state.storageWrites.push(args);
    if(options.storageFails)throw new Error('storage unavailable');
    return nativeSetItem.apply(this, args);
  };
  if (options.clipboard !== false) Object.defineProperty(window.navigator, 'clipboard', {
    value: {writeText: options.writeText || (async text => { state.copies.push(text); })},
  });
  const context = dom.getInternalVMContext();
  const modules = new Map();
  async function load(identifier) {
    if (!modules.has(identifier)) modules.set(identifier, (async () => {
      const filename = fileURLToPath(identifier);
      assert.ok(filename.startsWith(appDir + path.sep), 'the fixture loads only this feature');
      return new vm.SourceTextModule(await fs.readFile(filename, 'utf8'), {context, identifier});
    })());
    return modules.get(identifier);
  }
  const entry = await load(pathToFileURL(path.join(appDir, 'app.mjs')).href);
  await entry.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
  await entry.evaluate();
  const $ = id => window.document.getElementById(id);
  await until(() => !$('calculate-button').disabled, 'authentication setup should finish');
  function input(id, value) {
    $(id).value = value;
    $(id).dispatchEvent(new window.Event('input', {bubbles: true}));
  }
  function dispatchSubmit(birth, target) {
    if (birth !== undefined) input('birth-date', birth);
    if (target !== undefined) input('target-date', target);
    $('rhythm-form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    assert.deepEqual(state.errors, [], 'submitting should not throw a page error');
  }
  async function waitIdle() { await until(() => $('rhythm-form').getAttribute('aria-busy') !== 'true'); }
  async function submit(birth,target) { dispatchSubmit(birth,target); await waitIdle(); }
  const click = id => $(id).click();
  t.after(async () => {
    await settle(); await until(() => state.pending === 0, 'all billing work should finish before closing the page'); await settle();
    try {
      assert.deepEqual(state.errors, [], 'interactions should not throw page errors');
      assert.deepEqual(state.network, [], 'billing and analytics use the shared mock client without other network paths');
      for(const [key,text] of state.storageWrites) {
        assert.match(key,/^ojjuda-biorhythm-birthdays-v1:[0-9a-f-]{36}$/,'only the requested member birthday list may be stored');
        const saved=JSON.parse(text);
        assert.deepEqual(Object.keys(saved).sort(),['birthdays','owner','version']);
        assert.equal(key,birthdayKey(saved.owner));assert.equal(saved.version,1);
        assert.ok(saved.birthdays.length<=20);
        assert.ok(saved.birthdays.every(birth=>/^\d{4}-\d{2}-\d{2}$/.test(birth)));
      }
      for(let index=0;index<window.localStorage.length;index++)assert.match(window.localStorage.key(index),/^ojjuda-biorhythm-birthdays-v1:/);
      assert.equal(window.sessionStorage.length, 0);
      assert.equal(window.document.cookie, '');
      assert.equal(window.location.href, 'https://ojjuda.kr/features/biorhythm/');
      for (const call of state.rpcCalls) {
        const expected = call.name === 'biorhythm_status_v1' ? ['p_birth_key'] : ['p_birth_key','p_expected_charge','p_expected_user','p_request_id','p_verify_only'];
        assert.deepEqual(Object.keys(call.args).sort(),expected);
        assert.ok(call.args.p_birth_key === null || /^[0-9a-f]{64}$/.test(call.args.p_birth_key));
      }
    } finally { dom.window.close(); }
  });
  return {window, $, state, input, submit, dispatchSubmit, waitIdle, click, setAccount, seed, timers,
    advance:ms=>{state.now+=ms;},buys:()=>state.rpcCalls.filter(call=>call.name==='biorhythm_buy_v1')};
}

test('initial view uses the Korean date, waits for an explicit birth input, and explains its limits', async t => {
  const p = await page(t);
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('birth-date').max, '2026-11-13');
  assert.equal(p.$('birth-date').value, '');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('calculate-button').disabled, false);
  assert.equal(p.$('sample-button').disabled, false);
  assert.ok(p.$('faq-list').querySelectorAll('details').length >= 8);
  assert.ok(p.$('source-links').querySelectorAll('a').length >= 2);
  assert.match(p.window.document.querySelector('.intro-note').textContent, /재미용/);
  assert.match(p.window.document.querySelector('.privacy-note').textContent, /브라우저의 회원별 목록에 저장/);
  assert.match(p.$('calculate-button').textContent, /5쭈/);
  assert.match(p.$('purchase-offer').textContent, /24시간/);
  assert.equal(p.state.analytics.length,1,'the direct page configures analytics with its shared authentication client');
});

test('guests and anonymous users can use only the clearly labelled fixed free sample', async t => {
  for (const options of [{signedIn:false},{anonymous:true}]) {
    const p=await page(t,options);
    assert.equal(p.$('login-link').hidden,false);
    assert.equal(new URL(p.$('login-link').href).pathname,'/world.html');
    p.click('sample-button');
    assert.equal(p.$('birth-date').value,'1990-01-01');
    assert.equal(p.$('sample-badge').hidden,false);
    p.input('birth-date','1984-07-23');
    p.$('birth-date').dispatchEvent(new p.window.Event('change',{bubbles:true}));
    assert.equal(p.$('results').hidden,true,'changing the sample birthday removes the free reading');
    await p.submit();
    assert.equal(p.$('results').hidden,true);
    assert.match(p.$('form-error').textContent,/로그인/);
    assert.equal(p.buys().length,0);
    assert.equal(p.window.localStorage.length,0,'guests and anonymous accounts do not get persistent birthday lists');
  }
});

test('completed birthday input saves once, but list selection and a saved date alone never grant paid access', async t => {
  const p=await page(t);
  p.input('birth-date','1984-07-23');
  p.$('birth-date').dispatchEvent(new p.window.Event('change',{bubbles:true}));
  p.$('birth-date').dispatchEvent(new p.window.Event('blur'));
  const stored=JSON.parse(p.window.localStorage.getItem(birthdayKey(member)));
  assert.deepEqual(stored.birthdays,['1984-07-23']);
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,1);
  assert.equal(p.buys().length,0);
  p.click('clear-button');
  assert.equal(p.$('birth-date').value,'');
  p.$('saved-birthdays').querySelector('.saved-birthday-use').click();
  assert.equal(p.$('birth-date').value,'1984-07-23');
  assert.equal(p.$('results').hidden,true);
  assert.equal(p.buys().length,0);
  assert.match(p.$('calculate-button').textContent,/5쭈/,'saved input is not a receipt');
  await p.submit();
  assert.equal(p.buys().length,1);
  const expires=p.state.entitlements.get(fingerprint('1984-07-23')).expires_at;
  p.click('clear-button');
  p.$('saved-birthdays').querySelector('.saved-birthday-use').click();
  await until(()=>p.$('calculate-button').textContent.includes('0쭈'));
  assert.equal(p.buys().length,1);
  await p.submit();
  assert.equal(p.buys().length,1);
  assert.equal(p.state.entitlements.get(fingerprint('1984-07-23')).expires_at,expires);
  p.click('sample-button');
  assert.deepEqual(JSON.parse(p.window.localStorage.getItem(birthdayKey(member))).birthdays,['1984-07-23'],'the fixed free sample is never added automatically');
});

test('saved birthday lists follow the member account and selection/deletion stay locked during payment', async t => {
  let release;
  const p=await page(t,{respond(name,args,_state,next){
    if(name==='biorhythm_buy_v1')return new Promise(resolve=>{release=()=>resolve(next(name,args));});
    return next(name,args);
  }});
  p.input('birth-date','1984-07-23');p.$('birth-date').dispatchEvent(new p.window.Event('change'));
  p.setAccount(otherMember);
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,0);
  p.input('birth-date','1992-02-29');p.$('birth-date').dispatchEvent(new p.window.Event('change'));
  assert.deepEqual(JSON.parse(p.window.localStorage.getItem(birthdayKey(otherMember))).birthdays,['1992-02-29']);
  p.setAccount(member);
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,1);
  assert.doesNotMatch(p.$('saved-birthdays').textContent,/1992/);
  p.$('saved-birthdays').querySelector('.saved-birthday-use').click();
  p.dispatchSubmit();await until(()=>!!release);
  for(const button of p.$('saved-birthdays').querySelectorAll('button'))assert.equal(button.disabled,true);
  p.$('saved-birthdays').querySelector('.saved-birthday-delete').click();
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,1);
  release();await p.waitIdle();
  p.$('saved-birthdays').querySelector('.saved-birthday-delete').click();
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,0);
  assert.equal(p.$('results').hidden,false,'deleting a shortcut does not erase a still-valid paid result');
  assert.equal(p.buys().length,1);
  p.setAccount(null);
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,0);
  assert.equal(p.$('results').hidden,true);
});

test('browser storage failure cannot block payment or create a false saved-list entitlement', async t => {
  const p=await page(t,{storageFails:true});
  p.input('birth-date','1984-07-23');p.$('birth-date').dispatchEvent(new p.window.Event('change'));
  assert.equal(p.$('saved-birthdays').querySelectorAll('.saved-birthday-use').length,0);
  await p.submit();
  assert.equal(p.$('results').hidden,false);
  assert.equal(p.buys().length,1);
  assert.equal(p.window.localStorage.length,0);
});

test('only explicit opening spends 5쭈, while all dates and same-birthday reopening stay within one entitlement', async t => {
  const p=await page(t);
  p.input('birth-date','1984-07-23');
  await until(()=>p.state.rpcCalls.some(call=>call.args.p_birth_key));
  assert.equal(p.buys().length,0,'typing only checks the existing entitlement');
  await p.submit();
  assert.equal(p.buys().length,1);
  assert.equal(p.buys()[0].args.p_expected_charge,5);
  assert.equal(p.buys()[0].args.p_expected_user,member);
  assert.equal(p.buys()[0].args.p_birth_key,fingerprint('1984-07-23'));
  assert.equal(p.state.balance,95);
  const originalExpiry=p.state.entitlements.get(fingerprint('1984-07-23')).expires_at;
  p.click('next-day'); p.input('chart-slider','0'); p.click('result-today');
  assert.equal(p.buys().length,1,'date navigation cannot create another charge');
  p.input('target-date','2040-07-23');
  assert.equal(p.$('results').hidden,true);
  await p.submit();
  assert.equal(p.buys().length,1,'reopening another target date uses the original entitlement');
  assert.equal(p.state.entitlements.get(fingerprint('1984-07-23')).expires_at,originalExpiry);
  p.input('birth-date','1985-07-23');
  assert.equal(p.buys().length,1);
  await p.submit();
  assert.equal(p.buys().length,2,'another birthday needs another explicit purchase');
  assert.equal(p.state.balance,90);
  assert.notEqual(p.buys()[0].args.p_birth_key,p.buys()[1].args.p_birth_key);
  assert.equal(JSON.stringify(p.state.rpcCalls).includes('1984-07-23'),false,'raw birth dates never reach billing');
});

test('a displayed 0쭈 offer expiring before the click never silently becomes a 5쭈 purchase', async t => {
  const p=await page(t);
  p.seed('1984-07-23',{paid_at:new Date(p.state.now-dayMs+1000).toISOString(),expires_at:new Date(p.state.now+1000).toISOString()});
  p.input('birth-date','1984-07-23');
  await until(()=>p.$('calculate-button').textContent.includes('0쭈'));
  assert.equal(p.$('results').hidden,true,'the entitlement is only quoted, not opened');
  p.advance(2000); // A throttled background-tab timer has not refreshed the visible offer.
  assert.match(p.$('calculate-button').textContent,/0쭈/);
  await p.submit();
  assert.equal(p.buys().length,0,'the server expiry check must stop before any charge request');
  assert.equal(p.$('results').hidden,true);
  assert.match(p.$('calculate-button').textContent,/5쭈/);
  assert.match(p.$('form-error').textContent,/다시 눌러/);
  await p.submit();
  assert.equal(p.buys().length,1,'a second explicit click accepts the newly shown 5쭈');
  assert.equal(p.buys()[0].args.p_expected_charge,5);
});

test('expiry locks an open reading and every navigation stays free until an explicit new purchase', async t => {
  const p=await page(t);
  await p.submit('1984-07-23','2026-11-13');
  const request=p.buys()[0].args.p_request_id;
  p.advance(dayMs+1000);
  p.click('next-day');
  assert.equal(p.$('results').hidden,true);
  assert.match(p.$('calculate-button').textContent,/5쭈/);
  p.click('result-today'); p.input('target-date','2026-11-15');
  assert.equal(p.buys().length,1);
  await p.submit();
  assert.equal(p.buys().length,2);
  assert.notEqual(p.buys()[1].args.p_request_id,request,'renewal has a fresh explicit-purchase identity');
  assert.equal(p.state.balance,90);
});

test('pending payment freezes sample, date, chart and form controls and keeps the paid result visible', async t => {
  let release;
  const p=await page(t,{respond(name,args,_state,next){
    if(name==='biorhythm_buy_v1')return new Promise(resolve=>{release=()=>resolve(next(name,args));});
    return next(name,args);
  }});
  p.click('sample-button');
  p.dispatchSubmit();
  await until(()=>!!release);
  for(const id of ['sample-button','clear-button','birth-date','target-date','input-today','previous-day','next-day','result-today','chart-slider','copy-result','edit-birth']) {
    assert.equal(p.$(id).disabled,true,`${id} must be disabled while the charge is pending`);
  }
  const target=p.$('target-date').value;
  p.click('next-day'); p.click('result-today'); p.input('chart-slider','0');
  p.$('chart-table').querySelector('button[data-date]').dispatchEvent(new p.window.MouseEvent('click',{bubbles:true}));
  p.input('birth-date','1984-07-23'); p.input('target-date','2040-01-01');
  p.dispatchSubmit();
  assert.equal(p.$('birth-date').value,'1990-01-01');
  assert.equal(p.$('target-date').value,target);
  assert.equal(p.buys().length,1,'double submission cannot duplicate a pending purchase');
  release(); await p.waitIdle();
  assert.equal(p.$('results').hidden,false);
  assert.equal(p.$('sample-badge').hidden,true);
  assert.match(p.$('payment-status').textContent,/5쭈를 사용/);
  assert.equal(p.state.balance,95);
});

test('logout and account changes discard a late paid response and clear private inputs', async t => {
  for(const nextOwner of [null,otherMember]) {
    let release;
    const p=await page(t,{respond(name,args,_state,next){
      const response=next(name,args);
      if(name==='biorhythm_buy_v1')return new Promise(resolve=>{release=()=>resolve(response);});
      return response;
    }});
    p.dispatchSubmit('1984-07-23','2026-11-13');
    await until(()=>!!release);
    p.setAccount(nextOwner);
    assert.equal(p.$('birth-date').value,'');
    assert.equal(p.$('results').hidden,true);
    release(); await p.waitIdle();
    assert.equal(p.$('results').hidden,true,'an old member receipt must never unlock the current page');
    assert.equal(p.$('birth-date').value,'');
    assert.match(p.$('payment-status').textContent,/계정이 바뀌었/);
  }
});

test('an uncertain network response retries the same request UUID without a second debit or extended expiry', async t => {
  let first=true;
  const p=await page(t,{respond(name,args,state,next){
    if(name==='biorhythm_status_v1') {
      const reply=next(name,args); reply.data.entitlement=null; return reply;
    }
    const reply=next(name,args);
    if(first){first=false;throw new Error('connection lost after commit');}
    return reply;
  }});
  await p.submit('1984-07-23','2026-11-13');
  assert.equal(p.$('results').hidden,true);
  assert.equal(p.state.balance,95);
  const expires=p.state.entitlements.get(fingerprint('1984-07-23')).expires_at;
  await p.submit();
  assert.equal(p.$('results').hidden,false);
  assert.equal(p.buys().length,2);
  assert.equal(p.buys()[0].args.p_request_id,p.buys()[1].args.p_request_id);
  assert.equal(p.state.balance,95);
  assert.equal(p.state.entitlements.get(fingerprint('1984-07-23')).expires_at,expires);
});

test('insufficient coins and malformed receipts cannot reveal a personal reading', async t => {
  const poor=await page(t,{coins:4});
  await poor.submit('1984-07-23','2026-11-13');
  assert.equal(poor.$('results').hidden,true);
  assert.match(poor.$('form-error').textContent,/부족/);
  assert.equal(poor.state.balance,4);
  for(const mutate of [item=>{item.birth_key='f'.repeat(64);},item=>{item.access_version=2;},item=>{item.charged=10;}]) {
    const p=await page(t,{respond(name,args,_state,next){const reply=next(name,args);if(name==='biorhythm_buy_v1')mutate(reply.data);return reply;}});
    await p.submit('1984-07-23','2026-11-13');
    assert.equal(p.$('results').hidden,true);
    assert.match(p.$('form-error').textContent,/확인하지 못했/);
  }
});

test('analytics failures cannot block either the free sample or a valid paid reading', async t => {
  const p=await page(t,{analyticsFails:true});
  p.click('sample-button');
  assert.equal(p.$('results').hidden,false);
  await p.submit('1984-07-23','2026-11-13');
  assert.equal(p.$('results').hidden,false);
  assert.equal(p.buys().length,1);
});

test('missing birth or target dates produce focused, recoverable field errors', async t => {
  const p = await page(t);
  await p.submit();
  assert.equal(p.$('form-error').hidden, false);
  assert.match(p.$('form-error').textContent, /생년월일/);
  assert.equal(p.$('birth-date').getAttribute('aria-invalid'), 'true');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
  p.input('birth-date', '1990-04-17');
  assert.equal(p.$('form-error').hidden, true);
  assert.equal(p.$('birth-date').hasAttribute('aria-invalid'), false);
  await p.submit(undefined, '');
  assert.match(p.$('form-error').textContent, /날짜/);
  assert.equal(p.window.document.activeElement, p.$('target-date'));
  assert.equal(p.$('results').hidden, true);
});

test('future birth dates, dates before birth, and unsupported years do not create a reading', async t => {
  const p = await page(t);
  await p.submit('2026-11-14', '2026-11-14');
  assert.match(p.$('form-error').textContent, /오늘 이후/);
  assert.equal(p.$('results').hidden, true);
  await p.submit('1990-04-17', '1990-04-16');
  assert.match(p.$('form-error').textContent, /생년월일과 같거나 이후/);
  assert.equal(p.$('target-date').getAttribute('aria-invalid'), 'true');
  assert.equal(p.$('results').hidden, true);
  await p.submit('1899-12-31', '2026-11-13');
  assert.match(p.$('form-error').textContent, /1900/);
  assert.equal(p.$('results').hidden, true);
});

test('a leap-day birthday renders the three known one-day readings with calculation evidence', async t => {
  const p = await page(t);
  await p.submit('2000-02-29', '2000-03-01');
  assert.equal(p.$('results').hidden, false);
  assert.equal(p.$('sample-badge').hidden, true);
  assert.equal(p.window.document.activeElement, p.$('result-title'));
  assert.match(p.$('result-title').textContent, /3월 1일/);
  assert.deepEqual(Array.from(p.$('rhythm-cards').querySelectorAll('.rhythm-value'), element => element.textContent), ['+27', '+22', '+19']);
  assert.equal(p.$('rhythm-cards').querySelectorAll('article').length, 3);
  assert.equal(p.$('suggestion-cards').querySelectorAll('article').length, 3);
  assert.match(p.$('calculation-evidence').textContent, /1일이 지났어요/);
  assert.match(p.$('calculation-evidence').textContent, /2000년 2월 29일/);
  assert.equal(p.$('chart-table').rows[0].dataset.date, '2000-02-29');
  assert.equal(p.$('chart-table').querySelectorAll('[aria-current="date"]').length, 1);
});

test('sample readings remain clearly labelled when navigating and disappear for a personal calculation', async t => {
  const p = await page(t);
  p.click('sample-button');
  assert.equal(p.$('birth-date').value, '1990-01-01');
  assert.equal(p.$('sample-badge').hidden, false);
  assert.match(p.$('sample-badge').textContent, /샘플/);
  p.click('next-day');
  assert.equal(p.$('sample-badge').hidden, false);
  p.click('copy-result');
  await settle();
  assert.match(p.state.copies[0], /샘플/);
  await p.submit('1984-07-23', '2026-11-13');
  assert.equal(p.$('sample-badge').hidden, true);
});

test('date navigation crosses February 29 and disables the birth-date boundary', async t => {
  const p = await page(t);
  await p.submit('2000-02-28', '2000-02-28');
  assert.equal(p.$('previous-day').disabled, true);
  p.click('previous-day');
  assert.equal(p.$('target-date').value, '2000-02-28');
  p.click('next-day');
  assert.equal(p.$('target-date').value, '2000-02-29');
  assert.equal(p.$('previous-day').disabled, false);
  p.click('next-day');
  assert.equal(p.$('target-date').value, '2000-03-01');
  p.click('previous-day');
  assert.equal(p.$('target-date').value, '2000-02-29');
  p.click('result-today');
  assert.equal(p.$('target-date').value, '2026-11-13');
  await p.submit('2000-02-28', '2100-12-31');
  assert.equal(p.$('next-day').disabled, true);
});

test('slider, date table, and graph clicks select the same date and keep table focus intact', async t => {
  const p = await page(t);
  await p.submit('2000-01-01', '2000-03-20');
  assert.equal(p.$('chart-table').rows.length, 31);
  assert.equal(p.$('chart-slider').value, '15');
  const firstValues = Array.from(p.$('chart-table').rows[0].cells).slice(1, 4).map(cell => cell.textContent);
  p.input('chart-slider', '0');
  assert.equal(p.$('target-date').value, '2000-03-05');
  assert.match(p.$('chart-slider').getAttribute('aria-valuetext'), /3월 5일/);
  assert.deepEqual(Array.from(p.$('rhythm-cards').querySelectorAll('.rhythm-value'), element => element.textContent), firstValues);
  const dateButton = p.$('chart-table').querySelector('button[data-date="2000-03-12"]');
  dateButton.focus();
  dateButton.click();
  assert.equal(p.$('target-date').value, '2000-03-12');
  assert.equal(p.window.document.activeElement, dateButton);
  assert.equal(p.$('chart-table').querySelector('[aria-current="date"]').dataset.date, '2000-03-12');
  const svg = p.$('chart-holder').querySelector('svg');
  svg.getBoundingClientRect = () => ({left: 0, width: 900});
  svg.dispatchEvent(new p.window.MouseEvent('click', {bubbles: true, clientX: 875}));
  assert.equal(p.$('target-date').value, '2000-04-04');
  assert.equal(p.$('chart-slider').value, '30');
});

test('legend controls hide individual graph lines while keeping one visible and all readings available', async t => {
  const p = await page(t);
  await p.submit('1990-04-17', '2026-11-13');
  const count = () => p.$('chart-holder').querySelectorAll('.chart-path').length;
  const toggle = id => p.window.document.querySelector(`button[data-cycle="${id}"]`).click();
  assert.equal(count(), 3);
  toggle('physical');
  assert.equal(count(), 2);
  assert.equal(p.window.document.querySelector('button[data-cycle="physical"]').getAttribute('aria-pressed'), 'false');
  toggle('emotional');
  assert.equal(count(), 1);
  toggle('intellectual');
  assert.equal(count(), 1);
  assert.match(p.$('status').textContent, /선 하나/);
  toggle('physical');
  assert.equal(count(), 2);
  assert.equal(p.$('rhythm-cards').querySelectorAll('article').length, 3);
});

test('editing either input removes the old reading until explicitly recalculated', async t => {
  const p = await page(t);
  await p.submit('1984-07-23', '2026-11-13');
  p.input('birth-date', '1985-07-23');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('calculation-evidence').textContent, '');
  assert.equal(p.$('chart-table').rows.length, 0);
  assert.equal(p.$('rhythm-cards').children.length, 0);
  await p.submit();
  assert.equal(p.$('results').hidden, false);
  p.input('target-date', '2026-11-14');
  assert.equal(p.$('results').hidden, true);
  p.click('input-today');
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('results').hidden, true);
});

test('clear removes birth input, calculated values, and clipboard fallback while keeping the Korean today default', async t => {
  const p = await page(t, {clipboard: false});
  await p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.$('copy-fallback').hidden, false);
  p.click('clear-button');
  assert.equal(p.$('birth-date').value, '');
  assert.equal(p.$('target-date').value, '2026-11-13');
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
  assert.equal(p.$('calculation-evidence').textContent, '');
  assert.equal(p.$('chart-holder').textContent, '');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
});

test('copying includes only the selected-day results, the feature link, and the entertainment notice', async t => {
  const p = await page(t);
  await p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.state.copies.length, 1);
  const copy = p.state.copies[0];
  assert.match(copy, /2026년 11월 13일/);
  for (const axis of ['신체', '감정', '지성']) assert.ok(copy.includes(axis));
  assert.match(copy, /재미로/);
  assert.match(copy, /https:\/\/ojjuda\.kr\/features\/biorhythm\/$/);
  assert.doesNotMatch(copy, /1984|7월 23일|birth|생년월일|[?&]/);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.match(p.$('status').textContent, /복사했어요/);
});

test('clipboard denial offers selectable text without the birth date', async t => {
  const p = await page(t, {writeText: async () => { throw new Error('permission denied'); }});
  await p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  await settle();
  assert.equal(p.$('copy-fallback').hidden, false);
  assert.equal(p.$('copy-text').readOnly, true);
  assert.equal(p.window.document.activeElement, p.$('copy-text'));
  assert.equal(p.$('copy-text').selectionStart, 0);
  assert.equal(p.$('copy-text').selectionEnd, p.$('copy-text').value.length);
  assert.match(p.$('copy-text').value, /2026년 11월 13일/);
  assert.doesNotMatch(p.$('copy-text').value, /1984|7월 23일/);
});

test('a late clipboard rejection cannot recreate a reading after the user clears the page', async t => {
  let rejectCopy;
  const pendingCopy = new Promise((resolve, reject) => { rejectCopy = reject; });
  const p = await page(t, {writeText: () => pendingCopy});
  await p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  p.click('clear-button');
  rejectCopy(new Error('late clipboard denial'));
  await settle();
  assert.equal(p.$('results').hidden, true);
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
  assert.equal(p.window.document.activeElement, p.$('birth-date'));
});

test('a late clipboard rejection cannot replace the currently selected date with an older copy', async t => {
  let rejectCopy;
  const pendingCopy = new Promise((resolve, reject) => { rejectCopy = reject; });
  const p = await page(t, {writeText: () => pendingCopy});
  await p.submit('1984-07-23', '2026-11-13');
  p.click('copy-result');
  p.click('next-day');
  rejectCopy(new Error('late clipboard denial'));
  await settle();
  assert.equal(p.$('results').hidden, false);
  assert.equal(p.$('target-date').value, '2026-11-14');
  assert.equal(p.$('copy-fallback').hidden, true);
  assert.equal(p.$('copy-text').value, '');
});

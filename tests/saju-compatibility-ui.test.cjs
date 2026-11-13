const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL,fileURLToPath} = require('node:url');
const {JSDOM} = require('jsdom');

const appDir=path.resolve(__dirname,'../games/starlit-saju');
const fixedNow='2026-11-13T03:00:00.000Z';
const ACCESS_MS=24*60*60*1000;
const PROFILE_USER_A='00000000-0000-4000-8000-000000000001';
const PROFILE_USER_B='00000000-0000-4000-8000-000000000002';
const selfBirth={year:1990,month:5,day:17,hour:8,minute:37};
const partnerBirth={year:1992,month:3,day:14,hour:10,minute:20};
const otherBirth={year:1987,month:12,day:11,hour:22,minute:15};
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
function deferred() { let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve}; }
async function waitFor(predicate,message='Compatibility UI did not settle') {
  const deadline=Date.now()+10000;
  while(!predicate()) { if(Date.now()>deadline)throw new Error(message);await pause(); }
}

// Only authentication and billing are replaced. These fixtures never contact a
// wallet: the real birth calculator, pair reading and DOM renderer are executed.
async function harness(options={}) {
  const html=await fs.readFile(path.join(appDir,'compatibility.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/starlit-saju/compatibility.html',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,NativeDate=window.Date;
  for(const [key,value] of Object.entries(options.initialStorage||{}))window.localStorage.setItem(key,value);
  let nowMs=NativeDate.parse(fixedNow);
  window.Date=class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length?args:[nowMs])); }
    static now() { return nowMs; }
  };
  const timers=new Map(),nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
  window.setTimeout=(callback,delay=0,...args)=>{
    const id=nativeSetTimeout(()=>{timers.delete(id);callback(...args);},delay);
    timers.set(id,{due:nowMs+Number(delay),callback,args});return id;
  };
  window.clearTimeout=id=>{timers.delete(id);nativeClearTimeout(id);};
  function advance(ms,{runTimers=true,focus=false}={}) {
    nowMs+=ms;
    if(runTimers)for(const [id,timer] of [...timers].sort((a,b)=>a[1].due-b[1].due)) {
      if(timer.due<=nowMs&&timers.has(id)) {window.clearTimeout(id);timer.callback(...timer.args);}
    }
    if(focus)window.dispatchEvent(new window.Event('focus'));
  }
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  window.scrollTo=()=>{};
  window.HTMLElement.prototype.scrollIntoView=function(){};
  const state={
    user:PROFILE_USER_A,signedIn:true,adminPreview:false,coins:30,
    initCalls:0,parentInstances:[],pairInstances:[],statusCalls:[],starts:[],baseStarts:[],
    charges:0,chargedAmounts:[],receipts:new Map(),copies:[],nextRequest:1,fetches:[],
    statusGate:null,purchaseGate:null,receiptGate:null,failStatus:0,moduleRequests:[],...options
  };
  Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async text=>state.copies.push(text)}});
  window.fetch=(...args)=>{state.fetches.push(args);throw new Error('Birth inputs and reading text must not be sent by the UI');};
  const chartKey=chart=>`${chart.solar.iso}|${chart.timeKnown?`${chart.input.hour}:${chart.input.minute}`:'unknown'}`;
  const pairKey=(chart,partner,owner=state.user)=>`${owner}|${[chartKey(chart),chartKey(partner)].sort().join('||')}`;
  class ParentPaymentStub {
    constructor(callbacks={}) {this.callbacks=callbacks;Object.assign(this,callbacks);state.parentInstances.push(this);this.modeVersion=0;this.client={};this.ready=false;}
    get user() {return state.signedIn?state.user:null;}
    get balance() {return state.coins;}
    get adminPreview() {return state.adminPreview;}
    get anonymous() {return false;}
    async init() {state.initCalls++;this.ready=true;return {signedIn:state.signedIn,adminPreview:state.adminPreview};}
    async refreshAdminMode() {return state.adminPreview;}
    check(owner) {if(!state.signedIn||owner!==state.user)throw Object.assign(new Error('로그인한 계정이 바뀌었어요.'),{code:'account_changed'});}
    setBalance(value) {state.coins=value;this.callbacks.onBalance?.(value);}
    serverTime() {return nowMs;}
    async status() {throw new Error('A personal saju purchase must not be required for compatibility');}
    async start(...args) {state.baseStarts.push(args);throw new Error('Compatibility must use its own separate product');}
  }
  class PairPaymentStub {
    constructor(parent) {this.parent=parent;state.pairInstances.push(this);}
    serverTime() {return nowMs;}
    remainingMs(access) {return access?.adminPreview&&state.adminPreview?Infinity:Math.max(0,Date.parse(access?.expires_at)-nowMs)||0;}
    isActive(access) {return this.remainingMs(access)>0;}
    async status(chart,partner) {
      const owner=state.user,key=pairKey(chart,partner,owner),gate=state.statusGate;
      state.statusCalls.push({chart,partner,owner,key});
      if(state.failStatus>0) {state.failStatus--;throw Object.assign(new Error('궁합 구매 내역을 확인하지 못했어요.'),{code:'network'});}
      const found=state.receipts.get(key);
      const result={ok:true,price:10,coins:state.coins,entitlement:this.isActive(found)?found:null,adminPreview:state.adminPreview,server_now:new Date(nowMs).toISOString()};
      if(gate)await gate.promise;
      return result;
    }
    async start(chart,partner,{expectedCharge}={}) {
      const owner=state.user,key=pairKey(chart,partner,owner),gate=state.purchaseGate,responseGate=state.receiptGate;
      assert.ok([0,10].includes(expectedCharge),'an explicit current price must authorize the purchase');
      state.starts.push({chart,partner,owner,key,expectedCharge});
      if(gate)await gate.promise;
      if(!state.signedIn)throw Object.assign(new Error('아지트에 로그인한 뒤 궁합을 펼쳐 주세요.'),{code:'not_signed_in'});
      const previous=state.receipts.get(key),charged=this.isActive(previous)||state.adminPreview?0:10;
      if(charged>expectedCharge)throw Object.assign(new Error('궁합 이용 시간이 바뀌었어요. 표시된 이용료를 확인한 뒤 다시 눌러 주세요.'),{code:'price_changed',required:charged});
      if(state.coins<charged)throw Object.assign(new Error('쭈가 부족해요. 궁합을 새로 열려면 10쭈가 필요해요.'),{code:'coins'});
      let access=previous;
      if(charged||!access) {
        access={ok:true,entitled:true,price:10,product:'saju',topic:'compatibility',pair_key:key,
          request_id:`00000000-0000-4000-8000-${String(state.nextRequest++).padStart(12,'0')}`,
          paid_at:new Date(nowMs).toISOString(),expires_at:new Date(nowMs+ACCESS_MS).toISOString()};
        state.receipts.set(key,access);
      }
      if(charged) {state.charges++;state.chargedAmounts.push(charged);if(owner===state.user)state.coins-=charged;}
      if(owner===state.user)this.parent.callbacks.onBalance?.(state.coins);
      const receipt={...access,charged,replayed:charged===0,entitlement_replayed:charged===0,coins:state.coins,
        adminPreview:state.adminPreview,server_now:new Date(nowMs).toISOString()};
      if(responseGate)await responseGate.promise;
      return receipt;
    }
  }
  const context=dom.getInternalVMContext(),records=new Map();
  async function record(identifier) {
    if(!records.has(identifier))records.set(identifier,(async()=>{
      const file=fileURLToPath(identifier),basename=path.basename(file);
      state.moduleRequests.push(identifier);
      let module;
      if(basename==='payment.js')module=new vm.SyntheticModule(['SajuPayment'],function(){this.setExport('SajuPayment',ParentPaymentStub);},{context,identifier});
      else if(/^compatibility-payment\.(mjs|js)$/.test(basename))module=new vm.SyntheticModule(['SajuCompatibilityPayment'],function(){this.setExport('SajuCompatibilityPayment',PairPaymentStub);},{context,identifier});
      else module=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{
        context,identifier,initializeImportMeta(meta){meta.url=identifier;},
        importModuleDynamically:async(specifier,parent)=>evaluate(new URL(specifier,parent.identifier).href)
      });
      return {module,link:null,evaluation:null};
    })());
    return records.get(identifier);
  }
  async function evaluate(identifier) {
    const entry=await record(identifier);
    if(entry.module.status==='unlinked')entry.link||=entry.module.link(async(specifier,parent)=>(await record(new URL(specifier,parent.identifier).href)).module);
    if(entry.link)await entry.link;
    if(entry.module.status==='linked')entry.evaluation||=entry.module.evaluate();
    if(entry.evaluation)await entry.evaluation;
    return entry.module;
  }
  await evaluate(pathToFileURL(path.join(appDir,'compatibility-app.mjs')).href);
  await waitFor(()=>state.initCalls>0);await pause();
  const $=id=>window.document.getElementById(id);
  const change=element=>element.dispatchEvent(new window.Event('change',{bubbles:true}));
  function set(id,value) {const element=$(id);assert.ok(element,`missing form input ${id}`);element.value=String(value);change(element);}
  function fillPerson(prefix,{year=1990,month=5,day=17,hour=null,minute=0,calendar='solar',leap=false,name='',gender=''}={}) {
    set(`${prefix}-name`,name);set(`${prefix}-gender`,gender);
    set(`${prefix}-calendar`,calendar);
    set(`${prefix}-year`,year);set(`${prefix}-month`,month);set(`${prefix}-day`,day);
    $(`${prefix}-leap-month`).checked=leap;change($(`${prefix}-leap-month`));
    $(`${prefix}-time-unknown`).checked=hour===null;change($(`${prefix}-time-unknown`));
    if(hour!==null) {set(`${prefix}-hour`,hour);set(`${prefix}-minute`,minute);}
  }
  function fill(first=selfBirth,second=partnerBirth) {fillPerson('self',first);fillPerson('partner',second);}
  function submit() {$('compatibility-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));}
  async function price(amount) {await waitFor(()=>state.statusCalls.length>0&&$('compatibility-open').dataset.expectedCharge===String(amount)&&!$('compatibility-open').disabled,`offer ${amount} did not settle`);}
  async function ready() {await waitFor(()=>!$('compatibility-result').hidden&&$('compatibility-report').querySelector('#compatibility-reading'),$('compatibility-error').textContent||'purchased compatibility missing');}
  function edit() {$('compatibility-edit').click();}
  function changeAccount(user,signedIn=true) {
    state.user=user;state.signedIn=signedIn;
    for(const parent of state.parentInstances)parent.callbacks.onAccountChange?.();
  }
  return {dom,window,state,$,fill,fillPerson,submit,price,ready,edit,change,changeAccount,advance,close:()=>dom.window.close()};
}

test('the separate page checks a pair without requiring a saju purchase, charging or exposing its reading',async t=>{
  const h=await harness();t.after(h.close);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
  h.fill();await h.price(10);
  assert.ok(h.state.statusCalls.length>0);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);
  assert.equal(h.state.coins,30);assert.equal(h.state.charges,0);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
  assert.match(h.$('compatibility-open').textContent,/10쭈/);
  assert.match(h.$('compatibility-price-note').textContent,/24시간/);
  assert.deepEqual(h.state.fetches,[]);
});

test('an explicit separate ten-ju purchase opens the real pair reading once and waits for its receipt',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(10);h.submit();await waitFor(()=>h.state.starts.length===1);
  assert.equal(h.state.starts[0].expectedCharge,10);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  h.submit();await pause();assert.equal(h.state.starts.length,1,'pending submissions cannot start another payment');
  receiptGate.resolve();await h.ready();
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,20);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(h.state.baseStarts.length,0);
  assert.ok(h.$('compatibility-report').textContent.length>3000);
  assert.equal(h.$('compatibility-report').querySelectorAll('.reader-card').length,5);
  assert.ok(h.$('compatibility-expiry').textContent.trim());
  h.$('compatibility-copy').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/궁합/);
  for(const paragraph of h.$('compatibility-report').querySelectorAll('.reader-prose > p'))assert.ok(h.state.copies[0].includes(paragraph.textContent),'copy includes every personal interpretation paragraph');
  assert.match(h.state.copies[0],/궁합 계산 근거/);
  assert.deepEqual(h.state.fetches,[]);
});

test('the same pair remains free within its original 24 hours even when the two input positions are swapped',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  const original=[...h.state.receipts.values()][0],expiry=original.expires_at,firstKey=h.state.starts[0].key;
  const firstBody=h.$('compatibility-report').textContent;
  h.edit();h.$('pair-swap').click();await h.price(0);
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1,'swapping only checks entitlement');
  assert.match(h.$('compatibility-open').textContent,/0쭈/);
  h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].expectedCharge,0);
  assert.equal(h.state.starts[1].key,firstKey);assert.equal(h.state.starts[1].chart.solar.iso,'1992-03-14');
  assert.equal(h.state.starts[1].partner.solar.iso,'1990-05-17');
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,20);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  assert.notEqual(h.$('compatibility-report').textContent,firstBody,'the real directional interpretation follows the new positions');
});

test('changing the partner hides the old reading and requires its own ten-ju confirmation',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  h.edit();h.fillPerson('partner',otherBirth);await h.price(10);
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  h.submit();await h.ready();
  assert.equal(h.state.charges,2);assert.equal(h.state.coins,10);assert.equal(h.state.receipts.size,2);
  assert.notEqual(h.state.starts[0].key,h.state.starts[1].key);
  assert.equal(h.state.starts[1].partner.solar.iso,'1987-12-11');
});

test('expiry removes the reading and copy access without automatically charging, then permits an explicit new purchase',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  const expiry=[...h.state.receipts.values()][0].expires_at;
  h.advance(ACCESS_MS+1,{focus:true});await waitFor(()=>h.$('compatibility-result').hidden);
  assert.equal(h.$('compatibility-report').textContent,'');
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1);
  const copies=h.state.copies.length;h.$('compatibility-copy').click();await pause();assert.equal(h.state.copies.length,copies);
  await h.price(10);h.submit();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.ok(Date.parse([...h.state.receipts.values()][0].expires_at)>Date.parse(expiry));
});

test('a stale zero-ju offer cannot silently become a ten-ju purchase after expiry',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  h.edit();await h.price(0);h.advance(ACCESS_MS+1,{runTimers:false});
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0');
  h.submit();await h.price(10);
  assert.equal(h.state.charges,1);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(h.$('compatibility-result').hidden,true);
  h.submit();await h.ready();assert.deepEqual(h.state.chargedAmounts,[10,10]);
});

test('copying rechecks expiry even if the page expiry timer has not run',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  h.advance(ACCESS_MS+1,{runTimers:false});
  h.$('compatibility-copy').click();await pause();await pause();
  assert.equal(h.state.copies.length,0);assert.equal(h.state.charges,1);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
});

test('a receipt that arrives after its own deadline never reveals the pair reading',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(10);h.submit();await waitFor(()=>h.state.charges===1);
  h.advance(ACCESS_MS+1,{runTimers:false});receiptGate.resolve();
  await waitFor(()=>!h.$('compatibility-open').disabled);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assert.match(h.$('compatibility-error').textContent,/24시간|이용 시간|만료/);
  assert.equal(h.state.copies.length,0);assert.equal(h.state.charges,1);
});

test('account changes erase both a current result and any late payment result for the previous account',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();
  h.changeAccount('00000000-0000-4000-8000-000000000002');await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  const receiptGate=deferred();h.state.receiptGate=receiptGate;h.fill();await h.price(10);h.submit();
  await waitFor(()=>h.state.starts.length===2);
  h.changeAccount('00000000-0000-4000-8000-000000000003');receiptGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assert.equal(h.state.copies.length,0);
});

test('changed birth inputs invalidate a pending result and never purchase the changed pair implicitly',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(10);h.submit();await waitFor(()=>h.state.charges===1);
  h.fillPerson('partner',otherBirth);receiptGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
  await h.price(10);h.state.receiptGate=null;h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].partner.solar.iso,'1987-12-11');
  assert.equal(h.state.charges,2);assert.equal(h.state.receipts.size,2);
});

test('an older pair status cannot overwrite the current pair price',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(10);h.submit();await h.ready();h.edit();await h.price(0);
  const statusGate=deferred(),before=h.state.statusCalls.length;h.state.statusGate=statusGate;
  h.fillPerson('partner',otherBirth);await waitFor(()=>h.state.statusCalls.length>before);
  h.state.statusGate=null;h.fillPerson('partner',partnerBirth);await h.price(0);
  statusGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0');assert.equal(h.state.charges,1);
  h.submit();await h.ready();assert.equal(h.state.charges,1);assert.equal(h.state.starts.at(-1).partner.solar.iso,'1992-03-14');
});

test('unknown birth times remain unknown in the actual pair reading, and reset never charges',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({...selfBirth,hour:null},{year:2024,month:2,day:4,hour:null});await h.price(10);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.timeKnown,false);assert.equal(h.state.starts[0].partner.timeKnown,false);
  assert.match(h.$('compatibility-report').textContent,/태어난 시간/);
  assert.match(h.$('compatibility-report').textContent,/상대 사주/);
  h.$('compatibility-clear').click();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);assert.deepEqual(h.state.fetches,[]);
});

test('unchecking unknown time requires choosing both hour and minute before a midnight purchase can proceed',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({...selfBirth,hour:null},{...partnerBirth,hour:null});
  for(const person of ['self','partner'])for(const field of ['hour','minute']) {
    const select=h.$(`${person}-${field}`);
    assert.equal(select.value,'');assert.equal(select.required,true);assert.equal(select.disabled,true);
  }
  h.$('self-time-unknown').checked=false;h.change(h.$('self-time-unknown'));
  assert.equal(h.$('self-hour').value,'');assert.equal(h.$('self-minute').value,'');
  assert.equal(h.$('self-hour').disabled,false);assert.equal(h.$('self-minute').disabled,false);
  assert.equal(h.$('compatibility-form').checkValidity(),false);
  h.submit();await pause();
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('compatibility-result').hidden,true);
  h.$('self-hour').value='0';h.change(h.$('self-hour'));
  assert.equal(h.$('compatibility-form').checkValidity(),false,'choosing the hour alone never supplies minute zero');
  h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('self-minute').value='0';h.change(h.$('self-minute'));
  await h.price(10);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.timeKnown,true);
  assert.equal(h.state.starts[0].chart.input.hour,0);assert.equal(h.state.starts[0].chart.input.minute,0);
  assert.equal(h.state.starts[0].partner.timeKnown,false);assert.equal(h.state.charges,1);
});

test('swapping people preserves unselected or partly entered times and their unknown-time controls',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({...selfBirth,hour:null},{...partnerBirth,hour:null});
  h.$('self-time-unknown').checked=false;h.change(h.$('self-time-unknown'));
  h.$('self-hour').value='8';h.change(h.$('self-hour'));
  assert.equal(h.$('self-minute').value,'');
  h.$('pair-swap').click();
  assert.equal(h.$('self-year').value,String(partnerBirth.year));
  assert.equal(h.$('self-time-unknown').checked,true);assert.equal(h.$('self-hour').disabled,true);
  assert.equal(h.$('self-hour').value,'');assert.equal(h.$('self-minute').value,'');
  assert.equal(h.$('partner-year').value,String(selfBirth.year));
  assert.equal(h.$('partner-time-unknown').checked,false);assert.equal(h.$('partner-hour').disabled,false);
  assert.equal(h.$('partner-hour').value,'8');assert.equal(h.$('partner-minute').value,'');
  assert.equal(h.$('compatibility-form').checkValidity(),false);
  h.submit();await pause();assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
  h.$('self-time-unknown').checked=false;h.change(h.$('self-time-unknown'));
  assert.equal(h.$('self-hour').value,'');assert.equal(h.$('self-minute').value,'');
  h.$('pair-swap').click();
  assert.equal(h.$('self-hour').value,'8');assert.equal(h.$('self-minute').value,'');
  assert.equal(h.$('partner-hour').value,'');assert.equal(h.$('partner-minute').value,'');
  assert.equal(h.$('compatibility-form').checkValidity(),false);
  h.submit();await pause();assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('a signed-out visitor sees the login state and cannot obtain or pay for a compatibility reading',async t=>{
  const h=await harness({user:null,signedIn:false});t.after(h.close);
  h.fill();assert.equal(h.$('compatibility-login').hidden,false);h.submit();
  await waitFor(()=>!h.$('compatibility-error').hidden&&h.$('compatibility-error').textContent);
  assert.match(h.$('compatibility-error').textContent,/로그인/);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);assert.equal(h.state.charges,0);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
});

test('both compatibility pickers share saved people and restore or swap the complete profiles without a purchase',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const first={name:'나의 음력 정보',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37};
  const second={...partnerBirth,name:'상대의 정보',gender:'male'};
  h.fill(first,second);
  const save=async prefix=>{
    const host=h.$(`${prefix}-saved-profiles`);
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled,'pair profile save did not settle');
  };
  await save('self');await save('partner');
  for(const prefix of ['self','partner'])assert.equal(h.$(`${prefix}-saved-profiles`).querySelectorAll('.profile-picker-use').length,2);
  h.$('self-saved-profiles').querySelector('.profile-picker-new').click();
  assert.equal(h.$('self-name').value,'');assert.equal(h.$('self-year').value,'');
  const pick=(prefix,name)=>[...h.$(`${prefix}-saved-profiles`).querySelectorAll('.profile-picker-use')].find(button=>button.textContent.includes(name)).click();
  pick('self',first.name);pick('partner',second.name);
  assert.equal(h.$('self-name').value,first.name);assert.equal(h.$('self-gender').value,'female');
  assert.equal(h.$('self-calendar').value,'lunar');assert.equal(h.$('self-leap-month').checked,true);
  assert.deepEqual(['year','month','day','hour','minute'].map(field=>h.$('self-'+field).value),['2023','2','10','8','37']);
  assert.equal(h.$('self-time-unknown').checked,false);
  for(const prefix of ['self','partner'])assert.equal(h.$(`${prefix}-saved-profiles`).querySelectorAll('.is-selected').length,1);
  h.$('pair-swap').click();
  assert.equal(h.$('self-name').value,second.name);assert.equal(h.$('self-gender').value,'male');
  assert.equal(h.$('partner-name').value,first.name);assert.equal(h.$('partner-gender').value,'female');
  assert.equal(h.$('partner-calendar').value,'lunar');assert.equal(h.$('partner-leap-month').checked,true);
  assert.equal(h.$('partner-hour').value,'8');assert.equal(h.$('partner-minute').value,'37');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);assert.equal(h.state.charges,0);
  assert.equal(h.$('compatibility-result').hidden,true);assert.deepEqual(h.state.fetches,[]);
  h.changeAccount(PROFILE_USER_B);await pause();
  for(const prefix of ['self','partner']) {
    assert.equal(h.$(`${prefix}-saved-profiles`).querySelectorAll('.profile-picker-use').length,0);
    assert.equal(h.$(`${prefix}-name`).value,'');assert.equal(h.$(`${prefix}-gender`).value,'');assert.equal(h.$(`${prefix}-year`).value,'');
  }
});

test('changing only both names and genders preserves the paid pair and its original expiry',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({...selfBirth,name:'처음 이름',gender:'male'},{...partnerBirth,name:'상대 이름',gender:'female'});
  await h.price(10);h.submit();await h.ready();
  const firstKey=h.state.starts[0].key,expiry=[...h.state.receipts.values()][0].expires_at;
  assert.equal(h.$('self-saved-profiles').querySelectorAll('.profile-picker-use').length,2,'an explicit pair reading saves both entered people');
  h.edit();
  for(const [id,value] of [['self-name','수정한 이름'],['self-gender','female'],['partner-name','<img src=x onerror=alert(1)>'],['partner-gender','male']]) {
    h.$(id).value=value;h.change(h.$(id));
  }
  await h.price(0);assert.equal(h.state.starts.length,1,'profile edits only refresh the current offer');
  h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].key,firstKey);assert.equal(h.state.starts[1].expectedCharge,0);
  assert.deepEqual(h.state.chargedAmounts,[10]);assert.equal(h.state.receipts.size,1);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  for(const id of ['self-saved-profiles','partner-saved-profiles','compatibility-result'])assert.equal(h.$(id).querySelector('img,script,[onerror]'),null);
  assert.equal(h.state.baseStarts.length,0);assert.deepEqual(h.state.fetches,[]);
});

test('returning to compatibility refreshes both lists after another tab saves or deletes a person without purchasing',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const other=await harness({user:PROFILE_USER_A});t.after(other.close);
  const hosts=['self','partner'].map(prefix=>h.$(prefix+'-saved-profiles'));
  for(const host of hosts)assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  other.fillPerson('self',{...selfBirth,name:'다른 탭의 사람',gender:'male'});
  const otherHost=other.$('self-saved-profiles');
  otherHost.querySelector('.profile-picker-save').click();
  await waitFor(()=>otherHost.querySelectorAll('.profile-picker-use').length===1);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const saved=other.window.localStorage.getItem(key);assert.ok(saved);
  h.window.localStorage.setItem(key,saved);
  for(const host of hosts)assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'only storage, not the page DOM, is synchronized');
  h.window.dispatchEvent(new h.window.Event('pageshow'));
  await waitFor(()=>hosts.every(host=>host.querySelectorAll('.profile-picker-use').length===1));
  for(const host of hosts)assert.match(host.querySelector('.profile-picker-use').textContent,/다른 탭의 사람.*남성.*08:37/);
  for(const prefix of ['self','partner']) {assert.equal(h.$(prefix+'-name').value,'');assert.equal(h.$(prefix+'-year').value,'');}
  otherHost.querySelector('.profile-picker-delete').click();
  const deleted=other.window.localStorage.getItem(key);
  if(deleted===null)h.window.localStorage.removeItem(key);else h.window.localStorage.setItem(key,deleted);
  for(const host of hosts)assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.window.dispatchEvent(new h.window.StorageEvent('storage',{key,oldValue:saved,newValue:deleted,storageArea:h.window.localStorage,url:other.window.location.href}));
  await waitFor(()=>hosts.every(host=>host.querySelectorAll('.profile-picker-use').length===0));
  for(const host of hosts)assert.equal(host.textContent.includes('다른 탭의 사람'),false);
  for(const tab of [h,other]) {
    assert.equal(tab.state.starts.length,0);assert.equal(tab.state.baseStarts.length,0);assert.equal(tab.state.charges,0);
    assert.equal(tab.$('compatibility-result').hidden,true);assert.deepEqual(tab.state.fetches,[]);
  }
});

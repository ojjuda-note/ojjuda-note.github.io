const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const appDir = path.join(root, 'games/starlit-saju');
const fixedNow = '2026-11-13T03:00:00.000Z';
const PROFILE_USER_A = '10000000-0000-4000-8000-000000000001';
const PROFILE_USER_B = '10000000-0000-4000-8000-000000000002';
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function waitFor(predicate, message = 'UI did not settle') {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await pause();
  }
}
function entryFlowDriver(form,window) {
  const current=()=>form.querySelector('[data-flow-step="'+form.dataset.flowStep+'"]');
  const control=selector=>[...form.querySelectorAll(selector)].find(element=>!element.closest('[hidden]'));
  async function next() {
    const button=control('[data-flow-next]');
    assert.ok(button,'the current input stage has a next button');
    assert.equal(button.disabled,false,'the next action is available before validation');
    button.click();
    await waitFor(()=>form.dataset.flowBusy!=='true','input-stage validation did not settle');
    return Number(form.dataset.flowStep);
  }
  function back() {const button=control('[data-flow-back]');assert.ok(button,'the current input stage has a back button');button.click();}
  async function confirm() {
    const stages=form.querySelectorAll('[data-flow-step]').length;
    for(let count=0;count<stages-1;count++) {
      if(Number(form.dataset.flowStep)===stages-1)break;
      const before=form.dataset.flowStep;await next();
      if(form.dataset.flowStep===before)return false;
    }
    assert.equal(Number(form.dataset.flowStep),stages-1,'the explicit purchase starts on the final confirmation stage');
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    return true;
  }
  return {current,next,back,confirm};
}
function selectReadingItem(select,id) {
  const doc=select.ownerDocument,nav=doc.getElementById(select.id+'-navigator');
  assert.ok(nav,'the reading has visible field and item navigation');
  const item=nav.querySelector('[data-reading-target="'+id+'"]');
  assert.ok(item,id+' is reachable from the item list');
  const domain=nav.querySelector('.reading-domain-button[data-reading-domain="'+item.dataset.readingDomain+'"]');
  assert.ok(domain&&!domain.hidden,'the requested field is available');
  if(domain.getAttribute('aria-pressed')!=='true')domain.click();
  const picker=nav.querySelector('.reading-item-picker');
  if(!picker.open)picker.querySelector('summary').click();
  assert.equal(item.closest('[hidden]'),null,'the requested item is shown inside its selected field');
  item.click();
  assert.equal(select.value,id,'visible navigation and the selected reading agree');
  assert.equal(item.getAttribute('aria-current'),'page');
  assert.equal(picker.open,false,'choosing an item closes the list to show the reading');
  return doc.getElementById(id);
}
function assertNoReadingScores(h) {
  assert.equal(h.window.document.querySelector('.saju-reading-score'),null,'an unavailable paid reading leaves no score or scoring notice on the page');
}
function assertNoCalculationUI(h) {
  assert.equal(h.window.document.querySelector('.birth-chart-details,#conventions,#convention-list,#result-pillars,#element-bars,#reading-evidence,#reading-method,#reading-sources,#reading-guide,#reading-glossary,.report-chapter,.reading-full-text,.source-entry,[data-fact-id],a[href*="-evidence"],a[href*="-chapter-"]'),null,'the result omits calculation tables, source panels and evidence links');
  const picker=h.$('reading-page-select');
  if(picker)assert.ok([...picker.options].every(option=>!/근거|계산·해석|계산 단원|자료 출처/.test(option.textContent)));
}
function assertReadingScores(root) {
  const panels=[...root.querySelectorAll('.saju-reading-score')];
  assert.ok(panels.length>0,'the purchased reading declares its scores or why they are unavailable');
  return panels.map(panel=>{
    const meters=[...panel.querySelectorAll('.saju-wind-meter[role="meter"]')];
    if(panel.dataset.readingScoreStatus==='unavailable') {
      assert.equal(meters.length,0,'unsupported items do not invent a zero score');
      assert.equal(panel.querySelector('.saju-wind-fill'),null);
      assert.ok(panel.querySelector('.saju-reading-score-reason')?.textContent.trim());
      return {status:'unavailable'};
    }
    assert.equal(panel.dataset.readingScoreStatus,'available');assert.equal(meters.length,2);
    const values={status:'available'};
    for(const [key,label] of [['tailwind','순풍'],['headwind','역풍']]) {
      const row=panel.querySelector(`[data-wind="${key}"]`),meter=row.querySelector('.saju-wind-meter'),value=Number(meter.getAttribute('aria-valuenow'));
      assert.ok(Number.isInteger(value)&&value>=0&&value<=100);
      assert.equal(meter.getAttribute('aria-valuemin'),'0');assert.equal(meter.getAttribute('aria-valuemax'),'100');
      assert.equal(meter.querySelector('.saju-wind-fill').style.width,`${value}%`);
      assert.ok(row.textContent.includes(label)&&row.textContent.includes(`${value}점`),'each direction and score remain readable as text');
      const name=meter.getAttribute('aria-label')||(meter.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>panel.ownerDocument.getElementById(id)?.textContent||'').join(' ');
      assert.ok(name.includes(label),'the meter identifies which independent score it represents');
      values[key]=value;
    }
    return values;
  });
}
function assertReadingScoreCopy(copy,root) {
  assert.doesNotMatch(copy,/사주 계산 근거|전체 계산 근거|계산·해석 자료|자료 출처|점수를 계산한 방법/);
  for(const panel of root.querySelectorAll('.saju-reading-score')) {
    if(panel.dataset.readingScoreStatus==='unavailable') {
      assert.ok(copy.includes(panel.querySelector('.saju-reading-score-reason').textContent),'copy retains the reason a score is unavailable');
      continue;
    }
    for(const [key,label] of [['tailwind','순풍'],['headwind','역풍']]) {
      const meter=panel.querySelector(`[data-wind="${key}"] .saju-wind-meter`);
      const value=meter.getAttribute('aria-valuenow');
      assert.ok(new RegExp(label+'\\s*'+value+'(?:\\s*/\\s*100)?\\s*점').test(copy),`copy retains the independent ${label} score ${value}/100`);
    }
  }
}

async function harness(options = {}) {
  const html = await fs.readFile(path.join(appDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {url:'https://ojjuda.kr/games/starlit-saju/', runScripts:'outside-only', pretendToBeVisual:true});
  const {window} = dom;
  window.structuredClone=structuredClone;
  for (const [key,value] of Object.entries(options.initialStorage || {})) window.localStorage.setItem(key,value);
  const NativeDate = window.Date;
  let nowMs=NativeDate.parse(fixedNow);
  window.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  };
  const timers=new Map(),nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
  window.setTimeout=(callback,delay=0,...args)=>{
    const id=nativeSetTimeout(()=>{timers.delete(id);callback(...args);},delay);
    timers.set(id,{due:nowMs+Number(delay),callback,args});
    return id;
  };
  window.clearTimeout=id=>{timers.delete(id);nativeClearTimeout(id);};
  function advance(ms,{runTimers=true,focus=false}={}) {
    nowMs+=ms;
    if(runTimers) for(const [id,timer] of [...timers].sort((a,b)=>a[1].due-b[1].due)) {
      if(timer.due<=nowMs&&timers.has(id)){window.clearTimeout(id);timer.callback(...timer.args);}
    }
    if(focus)window.dispatchEvent(new window.Event('focus'));
  }
  window.matchMedia = () => ({matches:true, addEventListener(){}, removeEventListener(){}});
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function() {};
  const state = {
    user:PROFILE_USER_A, signedIn:true, adminPreview:false, coins:30,
    starts:[], charges:0, chargedAmounts:[], nextRequest:1, initCalls:0, instances:[], receipts:new Map(), copies:[], statusCalls:[],
    failReadings:0, failStatus:0, failInit:0, failAuth:false, identityGate:null, initGate:null,
    legacyBundle:false, readingsGate:null, purchaseGate:null, moduleRequests:[],
    ...options
  };
  Object.defineProperty(window.navigator, 'clipboard', {value:{writeText:async text => state.copies.push(text)}});
  window.fetch = () => { throw new Error('The UI must not transmit birth information'); };
  const context = dom.getInternalVMContext();
  const profileKey=(chart,owner=state.user)=>`${owner}|${chart.solar.iso}|${chart.timeKnown?`${chart.input.hour}:${chart.input.minute}`:'unknown'}`;
  class PaymentStub {
    constructor(callbacks) { this.callbacks = callbacks; this.identityReady=false;this.identityVersion=0;this.ready=false;state.instances.push(this); }
    get user() { return state.signedIn||state.anonymous?state.user:null; }
    get balance() { return state.coins; }
    get adminPreview() { return state.adminPreview; }
    get anonymous() { return Boolean(state.anonymous); }
    remainingMs(access) { return access?.adminPreview?Infinity:Math.max(0,Date.parse(access?.expires_at)-nowMs)||0; }
    isActive(access) { return this.remainingMs(access)>0; }
    legacyAccess() { return {price:10,paid_at:fixedNow,expires_at:new Date(Date.parse(fixedNow)+86400000).toISOString()}; }
    confirmIdentity() {
      const owner=this.user,anonymous=this.anonymous;
      const changed=owner!==this.identityOwner||anonymous!==this.identityAnonymous,wasConfirmed=this.identityReady;
      if(wasConfirmed&&!changed)return;
      this.identityReady=true;this.identityOwner=owner;this.identityAnonymous=anonymous;this.identityVersion++;this.ready=false;
      if(wasConfirmed&&changed)this.callbacks.onAccountChange?.();
      this.callbacks.onIdentityReady?.({user:owner,anonymous,signedIn:!!owner&&!anonymous});
    }
    async init() {
      state.initCalls++;
      if(state.identityGate)await state.identityGate.promise;
      if(state.failAuth) {
        const wasConfirmed=this.identityReady;this.identityReady=false;this.identityVersion++;this.ready=false;
        if(wasConfirmed)this.callbacks.onAccountChange?.();
        throw Object.assign(new Error('로그인 정보를 확인하지 못했어요.'),{code:'network'});
      }
      this.confirmIdentity();
      const identityVersion=this.identityVersion;
      if(state.initGate)await state.initGate.promise;
      if(identityVersion!==this.identityVersion)throw Object.assign(new Error('로그인한 계정이 바뀌었어요.'),{code:'account_changed'});
      if(state.failInit>0){state.failInit--;throw Object.assign(new Error('보유 쭈를 확인하지 못했어요.'),{code:'network'});}
      this.ready=true;return {signedIn:state.signedIn&&!this.anonymous,adminPreview:state.adminPreview};
    }
    async status(chart) {
      state.statusCalls.push(chart);
      if(state.failStatus>0){state.failStatus--;throw Object.assign(new Error('구매 내역을 확인하지 못했어요.'),{code:'network'});}
      const profile=profileKey(chart);
      return {ok:true,coins:state.coins,prices:{lifelong:10,annual:10,monthly:10,all:30},
        entitlements:[...state.receipts.values()].filter(receipt=>receipt.profile===profile&&this.isActive(receipt)),
        bundle_entitlement:state.legacyBundle&&this.isActive(this.legacyAccess())?this.legacyAccess():null,adminPreview:state.adminPreview};
    }
    async start(chart, target) {
      assert.ok(['lifelong','annual','monthly','all'].includes(target?.topic),'payment requires an explicit product');
      const owner = state.user;
      const topic=target.topic,year=topic==='lifelong'?0:target.year;
      state.starts.push({chart,topic,year,expectedCharge:target.expectedCharge});
      if (state.purchaseGate) await state.purchaseGate.promise;
      if (!state.signedIn) throw Object.assign(new Error('아지트에 로그인해 주세요.'), {code:'not_signed_in'});
      if (state.adminPreview) return {ok:true,price:0,charged:0,replayed:false,adminPreview:true,topic,year};
      const profile=profileKey(chart,owner),key=`${profile}|${topic}|${year}`;
      const targets=topic==='all'?[{topic:'lifelong',year:0},{topic:'annual',year},{topic:'monthly',year}]:[{topic,year}];
      const legacy=state.legacyBundle&&this.isActive(this.legacyAccess());
      const missing=legacy?[]:targets.filter(item=>!this.isActive(state.receipts.get(`${profile}|${item.topic}|${item.year}`)));
      const charged=missing.length*10,replayed=charged===0;
      if(charged!==target.expectedCharge)throw Object.assign(new Error('이용 금액이 바뀌었어요. 표시된 금액을 확인한 뒤 다시 눌러 주세요.'),{code:'price_changed'});
      if (state.coins < charged) throw Object.assign(new Error(`쭈가 부족해요. 선택한 풀이에는 ${charged}쭈가 필요해요.`), {code:'coins'});
      for (const item of missing) {
        const request_id=`00000000-0000-4000-8000-${String(state.nextRequest++).padStart(12,'0')}`;
        state.receipts.set(`${profile}|${item.topic}|${item.year}`,{profile,...item,price:10,request_id,
          paid_at:new Date(nowMs).toISOString(),expires_at:new Date(nowMs+86400000).toISOString()});
      }
      if (charged) {
        state.charges++;
        state.chargedAmounts.push(charged);
        if (owner === state.user) state.coins -= charged;
      }
      if (owner === state.user) this.callbacks.onBalance(state.coins);
      const items=targets.map(item=>legacy?{...item,...this.legacyAccess()}:state.receipts.get(`${profile}|${item.topic}|${item.year}`));
      return {ok:true,price:topic==='all'?30:10,charged,replayed,legacy_bundle:legacy,coins:state.coins,topic,year,items,
        paid_at:items[0].paid_at,expires_at:new Date(Math.min(...items.map(item=>Date.parse(item.expires_at)))).toISOString(),
        request_id:state.receipts.get(key)?.request_id};
    }
  }
  const records = new Map();
  let linkQueue=Promise.resolve();
  const resolve = (specifier, parent) => new URL(specifier, parent).href;
  async function record(identifier) {
    const file = fileURLToPath(identifier);
    if (!records.has(identifier)) {
      if(path.basename(file)==='zodiac.mjs'&&state.zodiacGate)await state.zodiacGate.promise;
      if (path.basename(file) === 'readings.mjs') {
        if (state.failReadings > 0) { state.failReadings--; throw new Error('simulated reading module load failure'); }
        if (state.readingsGate) await state.readingsGate.promise;
      }
      if (!records.has(identifier)) records.set(identifier, (async () => {
        state.moduleRequests.push(identifier);
        const module = path.basename(file) === 'payment.js'
          ? new vm.SyntheticModule(['SajuPayment'], function() { this.setExport('SajuPayment', PaymentStub); }, {context, identifier})
          : new vm.SourceTextModule(await fs.readFile(file, 'utf8'), {
            context, identifier,
            initializeImportMeta(meta) { meta.url = identifier; },
            importModuleDynamically: async (specifier, parent) => evaluate(resolve(specifier, parent.identifier))
          });
        return {module, link:null, evaluation:null};
      })());
    }
    return records.get(identifier);
  }
  async function evaluate(identifier) {
    const entry = await record(identifier);
    // Browser imports coordinate a shared dependency graph. VM modules require
    // us to serialize linking when independent imports also depend on each other.
    const linked=linkQueue.then(async()=>{
      if(entry.module.status==='unlinked')entry.link||=entry.module.link(async(specifier,parent)=>(await record(resolve(specifier,parent.identifier))).module);
      if(entry.link)await entry.link;
    });
    linkQueue=linked.catch(()=>{});
    await linked;
    if (entry.module.status === 'linked') entry.evaluation ||= entry.module.evaluate();
    if (entry.evaluation) await entry.evaluation;
    return entry.module;
  }
  await evaluate(pathToFileURL(path.join(appDir, 'app.js')).href);
  await waitFor(() => state.initCalls > 0);
  await pause();
  const $ = id => window.document.getElementById(id);
  const change = element => element.dispatchEvent(new window.Event('change', {bubbles:true}));
  function fill({year=1990,month=5,day=17,hour=null,minute=0,calendar='solar',leap=false,topic='lifelong',fortuneYear=2026,name='',gender=''} = {}) {
    $('person-name').value=name; change($('person-name'));
    $('person-gender').value=gender; change($('person-gender'));
    const radio = window.document.querySelector(`input[name="calendar"][value="${calendar}"]`);
    radio.checked = true;
    change(radio);
    $('birth-year').value = String(year);
    $('birth-month').value = String(month);
    $('birth-day').value = String(day);
    $('time-unknown').checked = hour === null;
    change($('time-unknown'));
    $('leap-month').checked = leap;
    if (hour !== null) { $('birth-hour').value = String(hour); $('birth-minute').value = String(minute); }
    const product=window.document.querySelector(`input[name="entry-topic"][value="${topic}"]`);
    product.checked=true;change(product);
    $('entry-year').value=String(fortuneYear);change($('entry-year'));
  }
  const flow=entryFlowDriver($('birth-form'),window);
  function submit() {return flow.confirm();}
  async function ready(topic='lifelong',year=0) {
    try { await waitFor(() => !$('result').hidden && $('report-content').dataset.topic===topic && $('report-content').dataset.year===String(year),'report missing'); }
    catch(error) { error.message+=` · ${$('form-error').textContent} · ${$('entry-check-error-text').textContent} · starts=${state.starts.length}`;throw error; }
  }
  function pickReport(topic,year=2026) {
    if (!$('other-reading-options').open) $('other-reading-options').querySelector('summary').click();
    assert.equal($('other-reading-options').open,true,'open the other-reading options before choosing a product');
    const radio=window.document.querySelector(`input[name="report-topic"][value="${topic}"]`);
    radio.checked=true;change(radio);
    $('fortune-year').value=String(year);change($('fortune-year'));
  }
  function changeAccount(user, signedIn = true, {anonymous=false}={}) {
    state.user = user;
    state.signedIn = signedIn;
    state.anonymous=anonymous;
    for (const instance of state.instances) instance.confirmIdentity();
  }
  let closed=false;
  function close() {
    if(closed)return;
    closed=true;
    // Closing jsdom removes DOM listeners and native timers, but our fake clock
    // and VM module graph can still retain the app's last full paid report.
    // End the test identity first, without scheduling another billing init.
    state.user=null;state.signedIn=false;state.adminPreview=false;
    for(const instance of state.instances) {
      instance.identityReady=false;instance.identityVersion++;
      instance.callbacks.onAccountChange?.();
      instance.callbacks={};
    }
    for(const id of timers.keys())nativeClearTimeout(id);
    timers.clear();records.clear();
    state.instances.length=0;state.starts.length=0;state.statusCalls.length=0;
    state.copies.length=0;state.receipts.clear();
    dom.window.close();
  }
  return {dom,window,state,$,fill,submit,ready,change,pickReport,changeAccount,advance,flow,close};
}

module.exports = {harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, entryFlowDriver, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy};

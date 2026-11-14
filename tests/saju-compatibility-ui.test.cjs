const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL,fileURLToPath} = require('node:url');
const {JSDOM} = require('jsdom');
const {entryFlowDriver,selectReadingItem} = require('./helpers/saju-ui-harness.cjs');

const appDir=path.resolve(__dirname,'../games/starlit-saju');
const fixedNow='2026-11-13T03:00:00.000Z';
const ACCESS_MS=24*60*60*1000;
const PROFILE_USER_A='00000000-0000-4000-8000-000000000001';
const PROFILE_USER_B='00000000-0000-4000-8000-000000000002';
const selfBirth={year:1990,month:5,day:17,hour:8,minute:37};
const partnerBirth={year:1992,month:3,day:14,hour:10,minute:20};
const otherBirth={year:1987,month:12,day:11,hour:22,minute:15};
const SCORE_IDS=['temperament','complement','daily','harmony'];
const PEOPLE_TOPICS=['overview','decisions','relationships','work','pressure','adjustment'];
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
function deferred() { let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve}; }
async function waitFor(predicate,message='Compatibility UI did not settle') {
  const deadline=Date.now()+10000;
  while(!predicate()) { if(Date.now()>deadline)throw new Error(message);await pause(); }
}
function assertNoScoreboard(h) {
  assert.equal(h.window.document.querySelector('.compatibility-scoreboard'),null,'an unavailable reading must not leave scores anywhere on the page');
  assert.equal(h.window.document.querySelector('.compatibility-person-reading,#compatibility-synthesis,#compatibility-page-select'),null,'an unavailable reading must not leave either person, the synthesis or its navigation on the page');
}
function assertNoCompatibilityEvidence(h) {
  assert.equal(h.$('compatibility-report').querySelector('#compatibility-reading-evidence,.compatibility-evidence-link,.compatibility-score-details,[data-fact-id],.source-entry,a[href*="-evidence"],a[href*="-chapter-"]'),null,'compatibility exposes no calculation tables, sources, formulas or evidence links');
  assert.ok([...h.$('compatibility-page-select').options].every(option=>!/근거|계산|자료|출처/.test(option.textContent)),'the reading picker contains only the requested reading pages');
}
function selectCompatibilityPage(h,id) {
  const picker=h.$('compatibility-page-select');
  assert.ok(picker,'the paid compatibility has a reading picker');
  assert.ok([...picker.options].some(option=>option.value===id),`${id} is available in the reading picker`);
  selectReadingItem(picker,id);
  const page=h.$(id);
  assert.ok(page,`${id} has a reading page`);
  assert.equal(page.closest('[hidden]'),null,`${id} is revealed when selected`);
  return page;
}
function assertCompleteExplanation(element,item,label) {
  const prose=element.matches('.reader-prose,.compatibility-person-prose')?element:element.querySelector('.reader-prose,.compatibility-person-prose');
  assert.ok(prose,`${label} has its own complete explanation`);
  const paragraphs=[...prose.querySelectorAll(':scope > p')];
  assert.deepEqual(paragraphs.map(paragraph=>paragraph.textContent),item.paragraphs,`${label} retains every paragraph in its authored order`);
  assert.equal(prose.closest('details.reading-body-details'),null,`${label} does not hide the body behind its summary`);
  assert.ok(paragraphs.length>0&&paragraphs.every(paragraph=>{
    if(paragraph.closest('[hidden]'))return false;
    for(let ancestor=paragraph.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS'&&!ancestor.open)return false;
    return true;
  }),`${label} is fully readable as soon as its item is selected`);
  if(item.detailSections) {
    assert.deepEqual([...prose.querySelectorAll(':scope > .reading-body-heading')].map(heading=>heading.textContent),item.detailSections.map(section=>section.title),`${label} has meaningful headings for its full explanation`);
    assert.deepEqual(item.detailSections.flatMap(section=>section.paragraphs),item.paragraphs);
  }
}
async function assertCalculatedPeople(h,names=['','']) {
  const {buildCompatibilityReading}=await import(pathToFileURL(path.join(appDir,'compatibility.mjs')).href);
  const {chart,partner}=h.state.starts.at(-1),reading=buildCompatibilityReading(chart,partner);
  const pageIds=PEOPLE_TOPICS.map(topic=>`compatibility-people-${topic}`);
  assert.deepEqual([...h.$('compatibility-report').querySelectorAll('.reading-item-button[data-reading-domain="people"]')].map(button=>button.dataset.readingTarget),pageIds,'the people field lists the matching A/B topics in order');
  for(const topic of PEOPLE_TOPICS) {
    const page=selectCompatibilityPage(h,`compatibility-people-${topic}`);
    const people=[...page.querySelectorAll('.compatibility-person-reading')];
    assert.deepEqual(people.map(person=>person.dataset.personKey),['self','partner'],'every topic presents A before B');
    assert.deepEqual(people.map(person=>person.dataset.personMarker),['A','B']);
    const jumps=[...page.querySelectorAll('.compatibility-person-jumps a')];
    assert.equal(jumps.length,2,'a long comparison offers direct A/B movement');
    for(const [index,link] of jumps.entries()) {
      const heading=people[index].querySelector('.compatibility-person-name');
      assert.equal(link.hash,'#'+heading.id);link.click();
      assert.equal(h.$('compatibility-report').querySelector('[data-compatibility-current]'),page,'moving between A and B stays in the same topic');
      assert.equal(h.window.document.activeElement,heading,'the chosen person’s heading receives focus');
    }
    for(const [index,person] of people.entries()) {
      const expected=topic==='overview'?reading.people[index]:reading.people[index].cards.find(card=>card.topicId===topic);
      assert.ok(expected,`${topic} comes from the real person reading`);
      const marker=index===0?'A':'B';
      assert.equal(person.querySelector('.compatibility-person-name').textContent,names[index]?`${marker} · ${names[index]}`:marker,'a display name never replaces the A/B identity');
      const summary=person.querySelector('.compatibility-two-line-summary');
      assert.equal(summary?.getAttribute('role'),'group');assert.equal(summary?.getAttribute('aria-label'),'두 줄 요약');
      assert.deepEqual([...summary.querySelectorAll('.compatibility-summary-line')].map(line=>line.textContent),expected.summaryLines,`${marker} ${topic} retains both calculated summary units`);
      assertCompleteExplanation(person,expected,`${marker} ${topic}`);
      assert.equal(person.querySelector('.compatibility-evidence-link'),null,`${marker} ${topic} keeps its interpretation without an evidence link`);
    }
  }
  const synthesis=selectCompatibilityPage(h,'compatibility-synthesis');
  assert.deepEqual([...synthesis.querySelectorAll('.compatibility-summary-line')].map(line=>line.textContent),reading.synthesis.summaryLines);
  assertCompleteExplanation(synthesis,reading.synthesis,'the combined explanation');
  assertNoCompatibilityEvidence(h);
  selectCompatibilityPage(h,'compatibility-people-overview');
  h.$('compatibility-report').querySelector('[data-compatibility-step="next"]').click();
  assert.equal(h.$('compatibility-page-select').value,'compatibility-people-decisions','next follows the same A/B topic order');
  [...h.$('compatibility-people-decisions').querySelectorAll('.compatibility-person-reading')].forEach((element,index)=>assertCompleteExplanation(element,reading.people[index].cards.find(card=>card.topicId==='decisions'),'next immediately exposes each person’s decision story'));
  h.$('compatibility-report').querySelector('[data-compatibility-step="previous"]').click();
  assert.equal(h.$('compatibility-page-select').value,'compatibility-people-overview');
  return reading;
}
function assertCopiedPeople(text,reading,names=['','']) {
  const labels=names.map((name,index)=>`${index===0?'A':'B'}${name?' · '+name:''}`);
  const headings=reading.people.flatMap((person,index)=>[`${labels[index]} · 성격과 특징`,...person.cards.map(card=>`${labels[index]} · ${card.label}`)]);
  headings.push(reading.synthesis.title);
  let position=0;
  for(const heading of headings) {
    const found=text.indexOf(heading,position);
    assert.ok(found>=position,'copy keeps A’s complete story, B’s complete story, then the combined explanation');
    position=found+heading.length;
  }
  for(const person of reading.people)for(const item of [person,...person.cards]) {
    for(const value of [...item.summaryLines,...item.paragraphs])assert.ok(text.includes(value),'copy preserves each person’s complete summaries and interpretation');
  }
  for(const value of [reading.synthesis.title,...reading.synthesis.summaryLines,...reading.synthesis.paragraphs])assert.ok(text.includes(value),'copy preserves the combined explanation');
}
function scoreSnapshot(h) {
  selectCompatibilityPage(h,'compatibility-scores');
  const boards=h.window.document.querySelectorAll('.compatibility-scoreboard');
  assert.equal(boards.length,1,'a paid pair has one score summary');
  const board=boards[0],totalElement=board.querySelector('[data-score-total]');
  assert.equal(board.closest('#compatibility-reading'),h.$('compatibility-reading'));
  assert.equal(board.closest('[hidden]'),null,'the paid score summary is visible with its reading');
  assert.ok(totalElement,'the total score is readable as text');
  const total=Number(totalElement.textContent.match(/\d+/)?.[0]);
  assert.ok(Number.isInteger(total)&&total>=0&&total<=100,'the displayed total is between zero and one hundred');
  const rows=[...board.querySelectorAll('[data-score-item]')];
  assert.deepEqual(rows.map(row=>row.dataset.scoreItem).sort(),[...SCORE_IDS].sort());
  const items=SCORE_IDS.map(id=>{
    const row=rows.find(row=>row.dataset.scoreItem===id),meter=row.querySelector('.compatibility-score-meter');
    assert.ok(meter,`${id} has a score bar`);
    assert.equal(meter.getAttribute('role'),'meter');
    assert.equal(meter.getAttribute('aria-valuemin'),'0');assert.equal(meter.getAttribute('aria-valuemax'),'100');
    assert.match(meter.getAttribute('aria-valuenow')||'',/^\d+$/,`${id} exposes its numeric value`);
    const value=Number(meter.getAttribute('aria-valuenow'));
    assert.ok(Number.isInteger(value)&&value>=0&&value<=100,`${id} is a bounded numeric score`);
    const name=meter.getAttribute('aria-label')||(meter.getAttribute('aria-labelledby')||'').split(/\s+/).map(key=>h.$(key)?.textContent||'').join(' ');
    assert.ok(name.trim(),`${id} is named for readers using assistive technology`);
    assert.ok(row.textContent.includes(String(value)),`${id} is readable without relying on its bar length`);
    const fill=meter.querySelector('.compatibility-score-fill');
    assert.ok(fill,`${id} has a filled bar`);
    assert.equal(fill.style.width,`${value}%`,`${id} bar length matches its accessible numeric value`);
    return {id,value,width:fill.style.width};
  });
  return {total,items};
}
async function assertCalculatedScores(h) {
  const {buildCompatibilityReading}=await import(pathToFileURL(path.join(appDir,'compatibility.mjs')).href);
  const {chart,partner}=h.state.starts.at(-1),reading=buildCompatibilityReading(chart,partner),{score}=reading;
  assert.ok(score,'the real pair calculation provides the score data');
  const displayed=scoreSnapshot(h),board=h.window.document.querySelector('.compatibility-scoreboard');
  assert.equal(displayed.total,score.total);
  assert.ok(board.textContent.includes(score.label),'the reference-score label accompanies the numbers');
  assert.match(board.querySelector('.compatibility-score-summary').textContent,/성향.*함께 지내는/,'the visible summary explains the comparison without a calculation formula');
  assert.match(board.querySelector('.compatibility-score-notice').textContent,/참고 점수/,'the numbers are described as reference scores');
  for(const item of score.items) {
    assert.equal(displayed.items.find(value=>value.id===item.id).value,item.value);
    const row=board.querySelector(`[data-score-item="${item.id}"]`);
    for(const value of [item.label,item.summary])assert.ok(row.textContent.includes(value),`${item.id} retains its label and short explanation`);
    const link=row.querySelector('.compatibility-score-detail-link');
    assert.equal(link?.hash,`#compatibility-score-detail-${item.id}`,`${item.id} connects its score to its own full explanation`);
    link.click();
    const detail=h.$(link.hash.slice(1));
    assert.equal(h.$('compatibility-report').querySelector('[data-compatibility-current]'),detail,'the score link selects exactly its corresponding reading');
    assert.equal(h.$('compatibility-report').querySelectorAll('[data-compatibility-current]').length,1);
    assertCompleteExplanation(detail,item,item.id);
    assert.deepEqual([...detail.querySelectorAll('.compatibility-summary-line')].map(line=>line.textContent),item.summaryLines);
    assert.equal(detail.querySelector('.compatibility-detail-score-value').textContent,`${item.value}점 / 100점`);
    assert.equal(detail.querySelector('[role="meter"]'),null,'each detail preserves the one original four-bar scoreboard');
    detail.querySelector('a[href="#compatibility-scores"]').click();
    assert.equal(h.$('compatibility-report').querySelector('[data-compatibility-current]'),board);
  }
  assertNoCompatibilityEvidence(h);
  return score;
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
    user:PROFILE_USER_A,signedIn:true,adminPreview:false,coins:60,
    initCalls:0,parentInstances:[],pairInstances:[],statusCalls:[],starts:[],baseStarts:[],
    charges:0,chargedAmounts:[],receipts:new Map(),copies:[],nextRequest:1,fetches:[],
    statusGate:null,purchaseGate:null,receiptGate:null,failStatus:0,failInit:0,failAuth:false,identityGate:null,initGate:null,moduleRequests:[],...options
  };
  Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async text=>state.copies.push(text)}});
  window.fetch=(...args)=>{state.fetches.push(args);throw new Error('Birth inputs and reading text must not be sent by the UI');};
  const chartKey=chart=>`${chart.solar.iso}|${chart.timeKnown?`${chart.input.hour}:${chart.input.minute}`:'unknown'}`;
  const pairKey=(chart,partner,owner=state.user)=>`${owner}|${[chartKey(chart),chartKey(partner)].sort().join('||')}`;
  class ParentPaymentStub {
    constructor(callbacks={}) {this.callbacks=callbacks;Object.assign(this,callbacks);state.parentInstances.push(this);this.modeVersion=0;this.client={};this.ready=false;this.identityReady=false;this.identityVersion=0;}
    get user() {return state.signedIn||state.anonymous?state.user:null;}
    get balance() {return state.coins;}
    get adminPreview() {return state.adminPreview;}
    get anonymous() {return Boolean(state.anonymous);}
    confirmIdentity() {
      const owner=this.user,anonymous=this.anonymous,wasConfirmed=this.identityReady;
      const changed=owner!==this.identityOwner||anonymous!==this.identityAnonymous;
      if(wasConfirmed&&!changed)return;
      this.identityReady=true;this.identityOwner=owner;this.identityAnonymous=anonymous;this.identityVersion++;this.ready=false;
      if(wasConfirmed&&changed){this.modeVersion++;this.callbacks.onAccountChange?.();}
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
      this.confirmIdentity();const identityVersion=this.identityVersion;
      if(state.initGate)await state.initGate.promise;
      if(identityVersion!==this.identityVersion)throw Object.assign(new Error('로그인한 계정이 바뀌었어요.'),{code:'account_changed'});
      if(state.failInit>0){state.failInit--;throw Object.assign(new Error('보유 쭈를 확인하지 못했어요.'),{code:'network'});}
      this.ready=true;return {signedIn:state.signedIn&&!this.anonymous,adminPreview:state.adminPreview};
    }
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
      if(state.failStatus>0) {state.failStatus--;throw Object.assign(new Error('궁합 구매 내역을 확인하지 못했어요.'),{code:state.statusErrorCode||'network'});}
      const found=state.receipts.get(key);
      const result={ok:true,price:20,coins:state.coins,entitlement:this.isActive(found)?found:null,adminPreview:state.adminPreview,server_now:new Date(nowMs).toISOString()};
      if(gate)await gate.promise;
      return result;
    }
    async start(chart,partner,{expectedCharge}={}) {
      const owner=state.user,key=pairKey(chart,partner,owner),gate=state.purchaseGate,responseGate=state.receiptGate;
      assert.ok([0,10,20].includes(expectedCharge),'the UI must submit an explicitly displayed current or historical quote');
      state.starts.push({chart,partner,owner,key,expectedCharge});
      if(gate)await gate.promise;
      if(!state.signedIn)throw Object.assign(new Error('아지트에 로그인한 뒤 궁합을 펼쳐 주세요.'),{code:'not_signed_in'});
      const previous=state.receipts.get(key),charged=this.isActive(previous)||state.adminPreview?0:20;
      if(charged>expectedCharge)throw Object.assign(new Error('궁합 이용 시간이 바뀌었어요. 표시된 이용료를 확인한 뒤 다시 눌러 주세요.'),{code:'price_changed',required:charged});
      if(state.coins<charged)throw Object.assign(new Error('쭈가 부족해요. 궁합을 새로 열려면 20쭈가 필요해요.'),{code:'coins'});
      let access=previous;
      if(charged||!access) {
        access={ok:true,entitled:true,price:20,product:'saju',topic:'compatibility',pair_key:key,
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
  let linkQueue=Promise.resolve();
  async function record(identifier) {
    if(!records.has(identifier))records.set(identifier,(async()=>{
      const file=fileURLToPath(identifier),basename=path.basename(file);
      if(basename==='zodiac.mjs'&&state.zodiacGate)await state.zodiacGate.promise;
      state.moduleRequests.push(identifier);
      let module;
      if(basename==='payment.js')module=new vm.SyntheticModule(['SajuPayment'],function(){this.setExport('SajuPayment',ParentPaymentStub);},{context,identifier});
      else if(/^compatibility-payment\.(mjs|js)$/.test(basename))module=new vm.SyntheticModule(['SajuCompatibilityPayment','COMPATIBILITY_PRICE'],function(){this.setExport('SajuCompatibilityPayment',PairPaymentStub);this.setExport('COMPATIBILITY_PRICE',20);},{context,identifier});
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
    // Model the browser's shared dependency graph when previews and paid
    // readings independently import the same local calendar module.
    const linked=linkQueue.then(async()=>{
      if(entry.module.status==='unlinked')entry.link||=entry.module.link(async(specifier,parent)=>(await record(new URL(specifier,parent.identifier).href)).module);
      if(entry.link)await entry.link;
    });
    linkQueue=linked.catch(()=>{});
    await linked;
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
  const flow=entryFlowDriver($('compatibility-form'),window);
  function submit() {return flow.confirm();}
  async function price(amount) {await waitFor(()=>state.statusCalls.length>0&&$('compatibility-open').dataset.expectedCharge===String(amount)&&!$('compatibility-open').disabled,`offer ${amount} did not settle`);}
  async function ready() {await waitFor(()=>!$('compatibility-result').hidden&&$('compatibility-report').querySelector('#compatibility-reading'),$('compatibility-error').textContent||'purchased compatibility missing');}
  function edit() {$('compatibility-edit').click();}
  function changeAccount(user,signedIn=true,{anonymous=false}={}) {
    state.user=user;state.signedIn=signedIn;
    state.anonymous=anonymous;
    for(const parent of state.parentInstances)parent.confirmIdentity();
  }
  return {dom,window,state,$,fill,fillPerson,submit,price,ready,edit,change,changeAccount,advance,flow,close:()=>dom.window.close()};
}

test('the pair journey validates A then B, preserves both people and purchases only from the final confirmation',async t=>{
  const h=await harness();t.after(h.close);
  const form=h.$('compatibility-form'),doc=h.window.document;
  const visibleSteps=()=>[...form.querySelectorAll('[data-flow-step]')].filter(panel=>!panel.hidden);
  const snapshot=()=>[...form.querySelectorAll('input,select')].map(field=>({id:field.id||field.name,value:field.value,checked:field.checked}));
  assert.equal(form.dataset.flowStep,'0');assert.equal(visibleSteps().length,1);assert.equal(h.$('compatibility-open').hidden,true);
  await h.flow.next();assert.equal(form.dataset.flowStep,'0');assert.equal(doc.activeElement,h.$('self-year'));
  h.fillPerson('self',{...selfBirth,name:'예시 A',gender:'female',hour:null});
  h.$('self-year').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await waitFor(()=>form.dataset.flowStep==='1'&&form.dataset.flowBusy==='false');
  assert.equal(h.$('partner-year').value,'','an empty later person does not block finishing A');
  assert.equal(h.state.starts.length,0);assert.equal(visibleSteps().length,1);
  await h.flow.next();assert.equal(form.dataset.flowStep,'1');assert.equal(doc.activeElement,h.$('partner-year'));
  h.fillPerson('partner',{...partnerBirth,name:'예시 B',gender:'male',month:2,day:31,hour:null});
  await h.flow.next();assert.equal(form.dataset.flowStep,'1');assert.ok(form.querySelector('[data-flow-error]:not([hidden])'));
  h.$('partner-month').value='3';h.change(h.$('partner-month'));h.$('partner-day').value='14';h.change(h.$('partner-day'));
  h.$('partner-time-unknown').checked=false;h.change(h.$('partner-time-unknown'));
  h.$('partner-hour').value='0';h.change(h.$('partner-hour'));
  await h.flow.next();assert.equal(form.dataset.flowStep,'1');assert.equal(doc.activeElement,h.$('partner-minute'));
  h.$('partner-minute').value='0';h.change(h.$('partner-minute'));
  await h.flow.next();assert.equal(form.dataset.flowStep,'2');assert.equal(visibleSteps().length,1);
  const values=snapshot(),review=form.querySelector('[data-flow-review]').textContent;
  assert.ok(['예시 A','예시 B','1990.05.17','1992.03.14','시간 모름','00:00'].every(value=>review.includes(value)));
  h.flow.back();assert.equal(form.dataset.flowStep,'1');assert.deepEqual(snapshot(),values);
  h.flow.back();assert.equal(form.dataset.flowStep,'0');assert.deepEqual(snapshot(),values);
  await h.flow.next();await h.flow.next();assert.equal(form.dataset.flowStep,'2');assert.deepEqual(snapshot(),values);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0,'checking and reviewing both people never buys compatibility');
  await h.price(20);h.$('compatibility-open').click();await h.ready();
  assert.equal(h.state.starts.length,1);assert.deepEqual(h.state.chargedAmounts,[20]);
  h.edit();assert.equal(form.dataset.flowStep,'0');assert.deepEqual(snapshot(),values);assert.equal(h.$('compatibility-open').hidden,true);
  h.changeAccount(PROFILE_USER_B);await pause();
  assert.equal(form.dataset.flowStep,'0');assert.equal(h.$('self-year').value,'');assert.equal(h.$('partner-year').value,'');
  assert.equal(form.querySelector('[data-flow-review]').textContent,'');assertNoScoreboard(h);
});

test('the separate page checks a pair without requiring a saju purchase, charging or exposing its reading',async t=>{
  const h=await harness();t.after(h.close);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  h.fill();await h.price(20);
  assert.ok(h.state.statusCalls.length>0);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);
  assert.equal(h.state.coins,60);assert.equal(h.state.charges,0);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  assert.match(h.$('compatibility-open').textContent,/20쭈/);
  assert.match(h.$('compatibility-price-note').textContent,/24시간/);
  assert.deepEqual(h.state.fetches,[]);
});

test('an explicit twenty-ju purchase reveals the real reading and accessible score bars only after its receipt',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(20);h.submit();await waitFor(()=>h.state.starts.length===1);
  assert.equal(h.state.starts[0].expectedCharge,20);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  h.submit();await pause();assert.equal(h.state.starts.length,1,'pending submissions cannot start another payment');
  receiptGate.resolve();await h.ready();
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,40);assert.deepEqual(h.state.chargedAmounts,[20]);
  assert.equal(h.state.baseStarts.length,0);
  assert.equal(h.$('compatibility-report').querySelector('details.reading-body-details'),null,'paid explanations are immediately readable after selecting an item');
  assert.equal(h.$('compatibility-report').querySelectorAll('.reader-card').length,6);
  assert.ok(h.$('compatibility-expiry').textContent.trim());
  assert.equal(h.$('compatibility-page-select').value,'compatibility-synthesis','the purchased reading starts with the combined explanation and its score');
  const reading=await assertCalculatedPeople(h);
  const score=await assertCalculatedScores(h);
  h.$('compatibility-copy').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/궁합/);
  for(const paragraph of h.$('compatibility-report').querySelectorAll('.reader-prose > p'))assert.ok(h.state.copies[0].includes(paragraph.textContent),'copy includes every personal interpretation paragraph');
  assert.doesNotMatch(h.state.copies[0],/궁합 계산 근거|점수를 계산한 방법/);
  assertCopiedPeople(h.state.copies[0],reading);
  const copyLines=h.state.copies[0].split('\n');
  assert.ok(copyLines.some(line=>line.includes('종합 궁합')&&line.includes(`${score.total}점`)),'copy associates the total with its score');
  for(const value of [score.label,h.$('compatibility-report').querySelector('.compatibility-score-summary').textContent])assert.ok(h.state.copies[0].includes(value),'copy includes the displayed score summary');
  assert.equal(h.state.copies[0].includes(score.methodNotice),false,'copy omits the detailed scoring method');
  for(const item of score.items) {
    assert.ok(copyLines.some(line=>line.includes(item.label)&&line.includes(`${item.value}점`)),`copy associates ${item.id} with its numeric score`);
    assert.ok(h.state.copies[0].includes(item.summary),`copy includes ${item.id} summary`);
    for(const value of [...item.paragraphs,...item.detailSections.map(section=>section.title)])assert.ok(h.state.copies[0].includes(value),`copy includes ${item.id} complete explanation and headings`);
    assert.equal(h.state.copies[0].includes(item.reason),false,`copy omits the ${item.id} calculation formula`);
  }
  assert.deepEqual(h.state.fetches,[]);
});

test('the same pair remains free within its original 24 hours even when the two input positions are swapped',async t=>{
  const names=['첫 번째 예시','두 번째 예시'];
  const h=await harness();t.after(h.close);h.fill({...selfBirth,name:names[0]},{...partnerBirth,name:names[1]});await h.price(20);h.submit();await h.ready();
  await assertCalculatedPeople(h,names);
  const original=[...h.state.receipts.values()][0],expiry=original.expires_at,firstKey=h.state.starts[0].key;
  const firstBody=h.$('compatibility-report').textContent,firstScores=scoreSnapshot(h);
  h.edit();h.$('pair-swap').click();await h.price(0);
  assertNoScoreboard(h);
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1,'swapping only checks entitlement');
  assert.match(h.$('compatibility-open').textContent,/0쭈/);
  h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].expectedCharge,0);
  assert.equal(h.state.starts[1].key,firstKey);assert.equal(h.state.starts[1].chart.solar.iso,'1992-03-14');
  assert.equal(h.state.starts[1].partner.solar.iso,'1990-05-17');
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,40);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  assert.notEqual(h.$('compatibility-report').textContent,firstBody,'the real directional interpretation follows the new positions');
  await assertCalculatedPeople(h,[names[1],names[0]]);
  assert.deepEqual(scoreSnapshot(h),firstScores,'swapping the same two people preserves their scores and bar lengths');
});

test('changing the partner hides the old reading and requires its own twenty-ju confirmation',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();
  h.edit();h.fillPerson('partner',otherBirth);await h.price(20);
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  h.submit();await h.ready();
  assert.equal(h.state.charges,2);assert.equal(h.state.coins,20);assert.equal(h.state.receipts.size,2);
  assert.notEqual(h.state.starts[0].key,h.state.starts[1].key);
  assert.equal(h.state.starts[1].partner.solar.iso,'1987-12-11');
  await assertCalculatedScores(h);
});

test('a temporary connection failure preserves the paid page and free quote only until the original expiry',async t=>{
  const h=await harness();t.after(h.close);
  h.fill();await h.price(20);h.submit();await h.ready();
  selectCompatibilityPage(h,'compatibility-people-work');
  const content=h.$('compatibility-report').firstElementChild,expiry=h.$('compatibility-expiry').textContent;
  h.state.failStatus=1;h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>!h.$('compatibility-open').disabled&&/연결이 잠시 끊겼어요/.test(h.$('compatibility-copy-status').textContent));
  assert.equal(h.$('compatibility-result').hidden,false);
  assert.equal(h.$('compatibility-report').firstElementChild,content,'a background retry must not replace the page being read');
  assert.equal(h.$('compatibility-page-select').value,'compatibility-people-work');
  assert.equal(h.$('compatibility-copy').disabled,false);
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0');
  assert.match(h.$('compatibility-copy-status').textContent,/출생 정보 다시 보기/,'the visible result explains how to retry');
  assert.equal(h.$('compatibility-expiry').textContent,expiry);
  assert.equal(h.state.charges,1);

  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>!h.$('compatibility-open').disabled&&h.$('compatibility-copy-status').textContent==='');
  assert.equal(h.$('compatibility-report').firstElementChild,content);
  h.state.failStatus=1;h.edit();
  await waitFor(()=>!h.$('compatibility-open').disabled&&!h.$('compatibility-error').hidden);
  assert.equal(h.$('compatibility-result').hidden,true);
  assertNoScoreboard(h);
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0','an unexpired quote stays free even before reopening the reading');
  assert.match(h.$('compatibility-error').textContent,/연결을 확인한 뒤 다시 펼쳐/);
  h.submit();await h.ready();
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.equal(h.state.charges,1);
  assert.equal(h.$('compatibility-expiry').textContent,expiry);

  h.state.failStatus=1;h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>!h.$('compatibility-open').disabled&&/연결이 잠시 끊겼어요/.test(h.$('compatibility-copy-status').textContent));
  h.$('compatibility-copy').click();await waitFor(()=>h.state.copies.length===1);
  h.advance(ACCESS_MS+1);
  assert.equal(h.$('compatibility-result').hidden,true);assertNoScoreboard(h);
  assert.equal(h.$('compatibility-copy').disabled,true);
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'20');
  h.$('compatibility-copy').click();await pause();assert.equal(h.state.copies.length,1);
  assert.equal(h.state.charges,1,'preserving an offline result never extends or renews its entitlement');
  h.submit();await h.ready();assert.equal(h.state.starts.at(-1).expectedCharge,20);assert.equal(h.state.charges,2);
});

test('authentication and invalid status failures still remove a previously paid compatibility reading',async t=>{
  for(const code of ['not_signed_in','invalid']) {
    const h=await harness({statusErrorCode:code});t.after(h.close);
    h.fill();await h.price(20);h.submit();await h.ready();
    h.state.failStatus=1;h.window.dispatchEvent(new h.window.Event('focus'));
    await waitFor(()=>!h.$('compatibility-open').disabled&&!h.$('compatibility-error').hidden);
    assert.equal(h.$('compatibility-result').hidden,true,code);assertNoScoreboard(h);
    assert.equal(h.$('compatibility-copy').disabled,true,code);
    assert.equal(h.$('compatibility-open').dataset.expectedCharge,'20',code);
    assert.equal(h.state.charges,1);
  }
});

test('expiry removes the reading and copy access without automatically charging, then permits an explicit new purchase',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();
  const expiry=[...h.state.receipts.values()][0].expires_at;
  h.advance(ACCESS_MS+1,{focus:true});await waitFor(()=>h.$('compatibility-result').hidden);
  assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  assert.equal(h.state.charges,1);assert.equal(h.state.starts.length,1);
  const copies=h.state.copies.length;h.$('compatibility-copy').click();await pause();assert.equal(h.state.copies.length,copies);
  await h.price(20);h.submit();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[20,20]);
  assert.ok(Date.parse([...h.state.receipts.values()][0].expires_at)>Date.parse(expiry));
  scoreSnapshot(h);
});

test('a stale zero-ju offer cannot silently become a twenty-ju purchase after expiry',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();
  h.edit();await h.price(0);h.advance(ACCESS_MS+1,{runTimers:false});
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0');
  h.submit();await h.price(20);
  assert.equal(h.state.charges,1);assert.deepEqual(h.state.chargedAmounts,[20]);
  assert.equal(h.$('compatibility-result').hidden,true);
  h.submit();await h.ready();assert.deepEqual(h.state.chargedAmounts,[20,20]);
});

test('an existing ten-ju purchase stays free until its original deadline, then requires twenty ju explicitly',async t=>{
  const h=await harness({coins:20});t.after(h.close);
  h.fill();await h.price(20);
  const {key}=h.state.statusCalls.at(-1);
  const paidAt=new Date(Date.parse(fixedNow)-23*60*60*1000).toISOString();
  const expiresAt=new Date(Date.parse(paidAt)+ACCESS_MS).toISOString();
  h.state.receipts.set(key,{ok:true,entitled:true,price:10,product:'saju',topic:'compatibility',pair_key:key,
    request_id:'00000000-0000-4000-8000-000000000099',paid_at:paidAt,expires_at:expiresAt});
  h.$('pair-swap').click();await h.price(0);
  assert.match(h.$('compatibility-open').textContent,/0쭈/);
  h.submit();await h.ready();
  assert.equal(h.state.starts.at(-1).expectedCharge,0);
  assert.equal(h.state.charges,0);assert.equal(h.state.coins,20);
  assert.equal(h.state.receipts.get(key).price,10);
  assert.equal(h.state.receipts.get(key).paid_at,paidAt);
  assert.equal(h.state.receipts.get(key).expires_at,expiresAt);
  h.advance(60*60*1000+1,{focus:true});await h.price(20);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.state.charges,0,'expiry alone must not charge the wallet');
  assert.equal(h.state.receipts.get(key).expires_at,expiresAt);
  h.submit();await h.ready();
  assert.equal(h.state.starts.at(-1).expectedCharge,20);
  assert.deepEqual(h.state.chargedAmounts,[20]);assert.equal(h.state.coins,0);
  assert.equal(h.state.receipts.get(key).price,20);
  assert.ok(Date.parse(h.state.receipts.get(key).expires_at)>Date.parse(expiresAt));
});

test('exactly twenty ju opens compatibility once and nineteen ju never reveals or charges a reading',async t=>{
  const enough=await harness({coins:20});t.after(enough.close);
  enough.fill();await enough.price(20);enough.submit();await enough.ready();
  assert.deepEqual(enough.state.chargedAmounts,[20]);assert.equal(enough.state.coins,0);
  assert.equal(enough.state.baseStarts.length,0);
  const short=await harness({coins:19});t.after(short.close);
  short.fill();await short.price(20);short.submit();
  await waitFor(()=>!short.$('compatibility-error').hidden&&!short.$('compatibility-open').disabled);
  assert.match(short.$('compatibility-error').textContent,/20쭈/);
  assert.equal(short.state.coins,19);assert.equal(short.state.charges,0);
  assert.deepEqual(short.state.chargedAmounts,[]);assert.equal(short.state.receipts.size,0);
  assert.equal(short.$('compatibility-result').hidden,true);
  assert.equal(short.$('compatibility-report').textContent,'');
  assertNoScoreboard(short);
});

test('a historical ten-ju button offer cannot authorize a twenty-ju charge without a new confirmation',async t=>{
  const h=await harness({coins:20});t.after(h.close);
  h.fill();await h.price(20);
  h.$('compatibility-open').dataset.expectedCharge='10';
  h.$('compatibility-open').querySelector('span').textContent='10쭈로 궁합 펼치기';
  h.submit();await waitFor(()=>h.state.starts.length===1);await h.price(20);
  assert.equal(h.state.starts[0].expectedCharge,10,'submit preserves the amount visible before its refresh');
  assert.equal(h.state.charges,0);assert.equal(h.state.coins,20);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.match(h.$('compatibility-error').textContent,/이용료|다시 눌러/);
  h.submit();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[20]);assert.equal(h.state.coins,0);
});

test('copying rechecks expiry even if the page expiry timer has not run',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();
  h.advance(ACCESS_MS+1,{runTimers:false});
  h.$('compatibility-copy').click();await pause();await pause();
  assert.equal(h.state.copies.length,0);assert.equal(h.state.charges,1);
  assert.equal(h.$('compatibility-result').hidden,true);
  assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
});

test('a receipt that arrives after its own deadline never reveals the pair reading',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(20);h.submit();await waitFor(()=>h.state.charges===1);
  h.advance(ACCESS_MS+1,{runTimers:false});receiptGate.resolve();
  await waitFor(()=>!h.$('compatibility-open').disabled);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  assert.match(h.$('compatibility-error').textContent,/24시간|이용 시간|만료/);
  assert.equal(h.state.copies.length,0);assert.equal(h.state.charges,1);
});

test('account changes erase both a current result and any late payment result for the previous account',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();
  h.changeAccount('00000000-0000-4000-8000-000000000002');await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  const receiptGate=deferred();h.state.receiptGate=receiptGate;h.fill();await h.price(20);h.submit();
  await waitFor(()=>h.state.starts.length===2);
  h.changeAccount('00000000-0000-4000-8000-000000000003');receiptGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  assert.equal(h.state.copies.length,0);
});

test('changed birth inputs invalidate a pending result and never purchase the changed pair implicitly',async t=>{
  const receiptGate=deferred(),h=await harness({receiptGate});t.after(h.close);
  h.fill();await h.price(20);h.submit();await waitFor(()=>h.state.charges===1);
  h.fillPerson('partner',otherBirth);receiptGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
  await h.price(20);h.state.receiptGate=null;await h.submit();
  assert.equal(h.$('compatibility-form').dataset.flowStep,'1','a changed hidden partner must be checked again before the next purchase');
  assert.equal(h.state.starts.length,1,'the unreviewed changed pair is not purchased by a stale confirmation');
  h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].partner.solar.iso,'1987-12-11');
  assert.equal(h.state.charges,2);assert.equal(h.state.receipts.size,2);
});

test('an older pair status cannot overwrite the current pair price',async t=>{
  const h=await harness();t.after(h.close);h.fill();await h.price(20);h.submit();await h.ready();h.edit();await h.price(0);
  const statusGate=deferred(),before=h.state.statusCalls.length;h.state.statusGate=statusGate;
  h.fillPerson('partner',otherBirth);await waitFor(()=>h.state.statusCalls.length>before);
  h.state.statusGate=null;h.fillPerson('partner',partnerBirth);await h.price(0);
  statusGate.resolve();await pause();await pause();
  assert.equal(h.$('compatibility-open').dataset.expectedCharge,'0');assert.equal(h.state.charges,1);
  h.submit();await h.ready();assert.equal(h.state.charges,1);assert.equal(h.state.starts.at(-1).partner.solar.iso,'1992-03-14');
});

test('unknown birth times remain unknown in the actual pair reading, and reset never charges',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({...selfBirth,hour:null},{year:2024,month:2,day:4,hour:null});await h.price(20);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.timeKnown,false);assert.equal(h.state.starts[0].partner.timeKnown,false);
  assert.match(h.$('compatibility-report').textContent,/태어난 시간/);
  assert.match(h.$('compatibility-report').textContent,/상대 사주/);
  const score=await assertCalculatedScores(h);
  assert.equal(score.coverage.partial,true,'a score for unknown times keeps its limited calculation scope');
  h.$('compatibility-clear').click();await pause();
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
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
  await h.price(20);h.submit();await h.ready();
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

test('returning at the Korean new year refreshes both birth-year limits without purchasing',async t=>{
  const h=await harness();t.after(h.close);
  const boundary=Date.parse('2026-12-31T15:00:00.000Z');
  h.advance(boundary-Date.parse(fixedNow)-1,{runTimers:false});
  h.window.dispatchEvent(new h.window.Event('focus'));
  for(const person of ['self','partner'])assert.equal(h.$(person+'-year').max,'2026');
  h.advance(1,{runTimers:false});
  h.window.dispatchEvent(new h.window.Event('pageshow'));
  for(const person of ['self','partner'])assert.equal(h.$(person+'-year').max,'2027');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('a new-year input refreshes validation while future birthdays still cannot start a purchase',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({year:2027,month:1,day:2,hour:null},partnerBirth);
  assert.equal(h.$('compatibility-form').checkValidity(),false);
  h.advance(Date.parse('2026-12-31T15:00:00.000Z')-Date.parse(fixedNow),{runTimers:false});
  await h.submit();
  const flowError=h.$('compatibility-form').querySelector('[data-flow-error]:not([hidden])');
  assert.ok(flowError,'the future birthday is rejected in its own input stage');
  for(const person of ['self','partner'])assert.equal(h.$(person+'-year').max,'2027');
  assert.match(flowError.textContent,/미래/);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
  // Stay on the same page through another year boundary, without a resume event.
  h.advance(Date.parse('2027-12-31T15:00:00.000Z')-Date.parse('2026-12-31T15:00:00.000Z'),{runTimers:false});
  h.$('self-year').value='2028';h.change(h.$('self-year'));
  for(const person of ['self','partner'])assert.equal(h.$(person+'-year').max,'2028');
  h.$('self-day').value='1';h.change(h.$('self-day'));
  await h.price(20);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.solar.iso,'2028-01-01');
  assert.equal(h.state.charges,1);
});

test('a signed-out visitor sees the login state and cannot obtain or pay for a compatibility reading',async t=>{
  const h=await harness({user:null,signedIn:false});t.after(h.close);
  h.fill();assert.equal(h.$('compatibility-login').hidden,false);h.submit();
  await waitFor(()=>!h.$('compatibility-error').hidden&&h.$('compatibility-error').textContent);
  assert.match(h.$('compatibility-error').textContent,/로그인/);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);assert.equal(h.state.charges,0);
  assert.equal(h.$('compatibility-result').hidden,true);assert.equal(h.$('compatibility-report').textContent,'');
  assertNoScoreboard(h);
});

test('each compatibility input automatically saves independently and restores both complete profiles after reload without payment',async t=>{
  const h=await harness();t.after(h.close);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const first={name:'내 자동 저장',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37};
  const second={...partnerBirth,name:'상대 자동 저장',gender:'male'};
  const uses=(page,prefix)=>[...page.$(prefix+'-saved-profiles').querySelectorAll('.profile-picker-use')];
  h.fillPerson('self',first);h.advance(599);
  assert.equal(uses(h,'self').length,0);
  h.advance(1);
  for(const prefix of ['self','partner'])assert.equal(uses(h,prefix).length,1);
  assert.equal(h.$('partner-name').value,'');assert.equal(h.$('partner-year').value,'','saving one input does not fill the other');
  h.fillPerson('partner',second);h.advance(600);await h.price(20);
  for(const prefix of ['self','partner'])assert.equal(uses(h,prefix).length,2);
  const before=JSON.parse(h.window.localStorage.getItem(key)).profiles;
  h.$('self-name').value='수정한 내 이름';h.change(h.$('self-name'));
  h.$('partner-name').value='수정한 상대 이름';h.change(h.$('partner-name'));
  h.window.dispatchEvent(new h.window.Event('pagehide'));
  const after=JSON.parse(h.window.localStorage.getItem(key)).profiles;
  assert.equal(after.length,2,'both pending edits update their existing rows');
  for(const [name,expected] of [[first.name,'수정한 내 이름'],[second.name,'수정한 상대 이름']]) {
    const original=before.find(profile=>profile.name===name),saved=after.find(profile=>profile.id===original.id);
    assert.equal(saved.name,expected);assert.deepEqual(saved.birth,original.birth);assert.equal(saved.gender,original.gender);
  }
  await h.price(20);
  const reloaded=await harness({initialStorage:{[key]:h.window.localStorage.getItem(key)}});t.after(reloaded.close);
  uses(reloaded,'self').find(button=>button.textContent.includes('수정한 내 이름')).click();
  uses(reloaded,'partner').find(button=>button.textContent.includes('수정한 상대 이름')).click();
  assert.equal(reloaded.$('self-name').value,'수정한 내 이름');assert.equal(reloaded.$('self-gender').value,'female');
  assert.equal(reloaded.$('self-calendar').value,'lunar');assert.equal(reloaded.$('self-leap-month').checked,true);
  assert.deepEqual(['year','month','day','hour','minute'].map(field=>reloaded.$('self-'+field).value),['2023','2','10','8','37']);
  assert.equal(reloaded.$('self-time-unknown').checked,false);
  assert.equal(reloaded.$('partner-name').value,'수정한 상대 이름');assert.equal(reloaded.$('partner-gender').value,'male');
  assert.deepEqual(['year','month','day','hour','minute'].map(field=>reloaded.$('partner-'+field).value),['1992','3','14','10','20']);
  await reloaded.price(20);
  for(const page of [h,reloaded]) {
    assert.equal(page.state.starts.length,0);assert.equal(page.state.baseStarts.length,0);assert.equal(page.state.charges,0);
    assert.equal(page.$('compatibility-result').hidden,true);assert.deepEqual(page.state.fetches,[]);
  }
});

test('both compatibility inputs save with delayed identity and failed wallet while account changes cancel pending local edits',async t=>{
  const identityGate=deferred(),h=await harness({identityGate,failInit:Infinity});t.after(h.close);
  const key=owner=>'ojjuda-saju-profiles-v1:'+owner;
  h.fill({...selfBirth,name:'내 정보',gender:'male'},{...partnerBirth,name:'상대 정보',gender:'female'});h.advance(600);
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_A)),null);
  identityGate.resolve();await waitFor(()=>h.state.parentInstances[0].identityReady);
  assert.equal(h.$('self-name').value,'내 정보');assert.equal(h.$('partner-name').value,'상대 정보');
  h.advance(600);
  for(const prefix of ['self','partner'])assert.equal(h.$(prefix+'-saved-profiles').querySelectorAll('.profile-picker-use').length,2);
  assert.equal(h.state.parentInstances[0].ready,false);
  const initCalls=h.state.initCalls;
  h.$('self-name').value='잔액과 별도로 저장';h.change(h.$('self-name'));
  h.$('self-saved-profiles').querySelector('.profile-picker-save').click();
  await waitFor(()=>h.$('self-saved-profiles').querySelector('.profile-picker-status').dataset.state==='success');
  assert.equal(h.state.initCalls,initCalls,'manual local save does not retry failed wallet initialization');
  assert.ok(!h.state.moduleRequests.some(url=>/\/(compatibility|readings|fortune-data|daeun)\.mjs/.test(url)),'local zodiac previews do not load the paid pair reading or start a purchase');
  const stored=h.window.localStorage.getItem(key(PROFILE_USER_A));
  for(const prefix of ['self','partner']) {h.$(prefix+'-name').value='취소할 수정';h.change(h.$(prefix+'-name'));}
  h.changeAccount(PROFILE_USER_B);
  for(const prefix of ['self','partner']) {
    assert.equal(h.$(prefix+'-name').value,'');assert.equal(h.$(prefix+'-year').value,'');
    assert.equal(h.$(prefix+'-saved-profiles').querySelectorAll('.profile-picker-use').length,0);
  }
  h.changeAccount(PROFILE_USER_A);h.changeAccount(PROFILE_USER_B);h.advance(600);await pause();
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_A)),stored);
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_B)),null);
  h.fill({...selfBirth,name:'다른 회원의 나'},{...otherBirth,name:'다른 회원의 상대'});h.advance(600);
  const ownProfiles=JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles;
  assert.deepEqual(ownProfiles.map(profile=>profile.name).sort(),['다른 회원의 나','다른 회원의 상대']);
  h.$('partner-name').value='로그아웃 전 수정';h.change(h.$('partner-name'));
  h.changeAccount(null,false);h.advance(600);await pause();
  for(const prefix of ['self','partner']) {
    assert.equal(h.$(prefix+'-name').value,'');assert.equal(h.$(prefix+'-year').value,'');
    assert.equal(h.$(prefix+'-saved-profiles').querySelectorAll('.profile-picker-use').length,0);
  }
  assert.deepEqual(JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles,ownProfiles);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.baseStarts.length,0);assert.equal(h.state.charges,0);
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

test('deleting saved people follows the next or previous row without taking focus from birth inputs',async t=>{
  const h=await harness();t.after(h.close);
  const host=h.$('self-saved-profiles'),rows=()=>[...host.querySelectorAll('.profile-picker-item')];
  for(let index=0;index<4;index++) {
    host.querySelector('.profile-picker-new').click();
    h.fillPerson('self',{...selfBirth,year:1990+index,name:`저장 ${index+1}`});
    h.advance(600);
  }
  assert.equal(rows().length,4);
  const ids=rows().map(row=>row.dataset.profileId);
  let remove=rows()[1].querySelector('.profile-picker-delete');remove.focus();remove.click();
  assert.equal(h.window.document.activeElement.closest('.profile-picker-item')?.dataset.profileId,ids[2],'deleting a middle row moves to its next person');
  remove=rows().at(-1).querySelector('.profile-picker-delete');remove.focus();remove.click();
  assert.equal(h.window.document.activeElement.closest('.profile-picker-item')?.dataset.profileId,ids[2],'deleting the last row moves to its previous person');
  h.$('partner-year').focus();rows()[0].querySelector('.profile-picker-delete').click();
  assert.equal(h.window.document.activeElement,h.$('partner-year'),'a delete started outside the list does not steal focus');
  remove=rows()[0].querySelector('.profile-picker-delete');remove.focus();remove.click();
  assert.equal(h.window.document.activeElement,host.querySelector('.profile-picker-new'),'the empty list leads to entering a new person');
  assert.equal(rows().length,0);
  assert.equal(h.$('partner-saved-profiles').querySelectorAll('.profile-picker-item').length,0);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('changing only both names and genders preserves the paid pair and its original expiry',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({...selfBirth,name:'같은 이름',gender:'male'},{...partnerBirth,name:'같은 이름',gender:'female'});
  await h.price(20);h.submit();await h.ready();
  await assertCalculatedPeople(h,['같은 이름','같은 이름']);
  const firstKey=h.state.starts[0].key,expiry=[...h.state.receipts.values()][0].expires_at,firstScores=scoreSnapshot(h);
  assert.equal(h.$('self-saved-profiles').querySelectorAll('.profile-picker-use').length,2,'an explicit pair reading saves both entered people');
  h.edit();
  for(const [id,value] of [['self-name','수정한 이름'],['self-gender','female'],['partner-name','<img src=x onerror=alert(1)>'],['partner-gender','male']]) {
    h.$(id).value=value;h.change(h.$(id));
  }
  await h.price(0);assert.equal(h.state.starts.length,1,'profile edits only refresh the current offer');
  assertNoScoreboard(h);
  h.submit();await h.ready();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.starts[1].key,firstKey);assert.equal(h.state.starts[1].expectedCharge,0);
  assert.deepEqual(h.state.chargedAmounts,[20]);assert.equal(h.state.receipts.size,1);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  const reading=await assertCalculatedPeople(h,['수정한 이름','<img src=x onerror=alert(1)>']);
  assert.deepEqual(scoreSnapshot(h),firstScores,'display names and genders cannot change these birth-chart comparison scores');
  for(const id of ['self-saved-profiles','partner-saved-profiles','compatibility-result'])assert.equal(h.$(id).querySelector('img,script,[onerror]'),null);
  h.$('compatibility-copy').click();await waitFor(()=>h.state.copies.length===1);
  assertCopiedPeople(h.state.copies[0],reading,['수정한 이름','<img src=x onerror=alert(1)>']);
  assert.ok(h.state.copies[0].includes('A · 수정한 이름'));assert.ok(h.state.copies[0].includes('B · <img src=x onerror=alert(1)>'),'copy keeps the display name as plain text');
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


test('both zodiac previews follow separate births, swaps and resets without purchasing',async t=>{
  const h=await harness({user:null,signedIn:false});t.after(h.close);
  for(const person of ['self','partner'])assert.equal(h.$(person+'-zodiac').hidden,true);
  h.fill({year:1990,month:1,day:1},{year:2024,month:2,day:4,hour:null});
  await waitFor(()=>!h.$('self-zodiac').hidden&&!h.$('partner-zodiac').hidden);
  assert.match(h.$('self-zodiac').textContent,/뱀띠.*입춘/);
  assert.match(h.$('partner-zodiac').textContent,/토끼띠 \/ 용띠.*태어난 시간을 알아야/);
  h.$('pair-swap').click();
  await waitFor(()=>h.$('self-zodiac').textContent.includes('토끼띠 / 용띠')&&h.$('partner-zodiac').textContent.includes('뱀띠'));
  h.fillPerson('partner',{year:2024,month:1,day:1,calendar:'lunar'});
  await waitFor(()=>h.$('partner-zodiac').querySelector('strong')?.textContent==='용띠');
  h.$('partner-day').value='';h.change(h.$('partner-day'));
  assert.equal(h.$('partner-zodiac').hidden,true);assert.equal(h.$('partner-zodiac').textContent,'');
  h.$('compatibility-clear').click();await pause();
  for(const person of ['self','partner']) {
    assert.equal(h.$(person+'-zodiac').hidden,true);assert.equal(h.$(person+'-zodiac').textContent,'');
  }
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.deepEqual(h.state.fetches,[]);
});

test('purchased compatibility retains both zodiac labels in its result, card and copied text',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({...selfBirth,name:'하늘'},{...partnerBirth,name:'바다'});await h.price(20);h.submit();await h.ready();
  assert.match(h.$('self-result-zodiac').textContent,/A · 하늘 · 말띠.*입춘/);
  assert.match(h.$('partner-result-zodiac').textContent,/B · 바다 · 원숭이띠.*입춘/);
  assert.match(h.$('compatibility-report').textContent,/두 사람의 띠/);
  h.$('compatibility-copy').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/A · 하늘: 말띠 · 사주에서는 입춘부터 띠가 바뀌어요/);
  assert.match(h.state.copies[0],/B · 바다: 원숭이띠 · 사주에서는 입춘부터 띠가 바뀌어요/);
  assert.equal(h.state.charges,1);
  h.changeAccount(PROFILE_USER_B);
  for(const person of ['self','partner']) {
    assert.equal(h.$(person+'-result-zodiac').hidden,true);assert.equal(h.$(person+'-result-zodiac').textContent,'');
    assert.equal(h.$(person+'-zodiac').hidden,true);assert.equal(h.$(person+'-zodiac').textContent,'');
  }
});

test('late zodiac labels cannot survive a compatibility reset or account change and never delay local saving',async t=>{
  const zodiacGate=deferred(),h=await harness({zodiacGate,failInit:Infinity});t.after(h.close);
  h.fill({...selfBirth,name:'나 저장'},{...partnerBirth,name:'상대 저장'});h.advance(600);
  await waitFor(()=>h.$('self-saved-profiles').querySelectorAll('.profile-picker-use').length===2);
  assert.equal(h.$('self-zodiac').hidden,true);assert.equal(h.$('partner-zodiac').hidden,true);
  h.$('compatibility-clear').click();h.changeAccount(PROFILE_USER_B);
  zodiacGate.resolve();await waitFor(()=>h.state.moduleRequests.some(url=>/zodiac\.mjs/.test(url)));await pause();
  for(const person of ['self','partner']) {
    assert.equal(h.$(person+'-zodiac').hidden,true);assert.equal(h.$(person+'-zodiac').textContent,'');
    assert.equal(h.$(person+'-saved-profiles').querySelectorAll('.profile-picker-zodiac').length,0);
  }
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.deepEqual(h.state.fetches,[]);
});

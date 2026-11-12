const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'games/starlit-saju');
const fixedNow = '2026-11-13T03:00:00.000Z';
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

async function harness(options = {}) {
  const html = await fs.readFile(path.join(appDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {url:'https://ojjuda.kr/games/starlit-saju/', runScripts:'outside-only', pretendToBeVisual:true});
  const {window} = dom;
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
    user:'member-a', signedIn:true, adminPreview:false, coins:30,
    starts:[], charges:0, chargedAmounts:[], nextRequest:1, initCalls:0, instances:[], receipts:new Map(), copies:[], statusCalls:[],
    failReadings:0, failStatus:0, legacyBundle:false, readingsGate:null, purchaseGate:null, moduleRequests:[],
    ...options
  };
  Object.defineProperty(window.navigator, 'clipboard', {value:{writeText:async text => state.copies.push(text)}});
  window.fetch = () => { throw new Error('The UI must not transmit birth information'); };
  const context = dom.getInternalVMContext();
  const profileKey=(chart,owner=state.user)=>`${owner}|${chart.solar.iso}|${chart.timeKnown?`${chart.input.hour}:${chart.input.minute}`:'unknown'}`;
  class PaymentStub {
    constructor(callbacks) { this.callbacks = callbacks; state.instances.push(this); }
    get user() { return state.user; }
    get balance() { return state.coins; }
    get adminPreview() { return state.adminPreview; }
    remainingMs(access) { return access?.adminPreview?Infinity:Math.max(0,Date.parse(access?.expires_at)-nowMs)||0; }
    isActive(access) { return this.remainingMs(access)>0; }
    legacyAccess() { return {price:10,paid_at:fixedNow,expires_at:new Date(Date.parse(fixedNow)+86400000).toISOString()}; }
    async init() { state.initCalls++; return {signedIn:state.signedIn, adminPreview:state.adminPreview}; }
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
  const resolve = (specifier, parent) => new URL(specifier, parent).href;
  async function record(identifier) {
    const file = fileURLToPath(identifier);
    if (!records.has(identifier)) {
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
    if (entry.module.status === 'unlinked') entry.link ||= entry.module.link(async (specifier, parent) => (await record(resolve(specifier, parent.identifier))).module);
    if (entry.link) await entry.link;
    if (entry.module.status === 'linked') entry.evaluation ||= entry.module.evaluate();
    if (entry.evaluation) await entry.evaluation;
    return entry.module;
  }
  await evaluate(pathToFileURL(path.join(appDir, 'app.js')).href);
  await waitFor(() => state.initCalls > 0);
  await pause();
  const $ = id => window.document.getElementById(id);
  const change = element => element.dispatchEvent(new window.Event('change', {bubbles:true}));
  function fill({year=1990,month=5,day=17,hour=null,minute=0,calendar='solar',leap=false,topic='lifelong',fortuneYear=2026} = {}) {
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
  function submit() { $('birth-form').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true})); }
  async function ready(topic='lifelong',year=0) { await waitFor(() => !$('result').hidden && $('report-content').dataset.topic===topic && $('report-content').dataset.year===String(year), $('form-error').textContent || 'report missing'); }
  function pickReport(topic,year=2026) {
    if (!$('other-reading-options').open) $('other-reading-options').querySelector('summary').click();
    assert.equal($('other-reading-options').open,true,'open the other-reading options before choosing a product');
    const radio=window.document.querySelector(`input[name="report-topic"][value="${topic}"]`);
    radio.checked=true;change(radio);
    $('fortune-year').value=String(year);change($('fortune-year'));
  }
  function changeAccount(user, signedIn = true) {
    state.user = user;
    state.signedIn = signedIn;
    for (const instance of state.instances) instance.callbacks.onAccountChange();
  }
  return {dom,window,state,$,fill,submit,ready,change,pickReport,changeAccount,advance,close:()=>dom.window.close()};
}

test('only the selected monthly product is generated before its explicit ten-ju purchase', async t => {
  const readingsGate=deferred(),purchaseGate=deferred();
  const h=await harness({readingsGate,purchaseGate});t.after(h.close);
  h.fill({topic:'monthly'});h.submit();await pause();await pause();
  assert.equal(h.state.starts.length,0);assert.equal(h.$('result').hidden,true);
  readingsGate.resolve();await waitFor(()=>h.state.starts.length===1);
  assert.equal(h.state.starts[0].topic,'monthly');assert.equal(h.state.starts[0].year,2026);
  assert.equal(h.$('result').hidden,true);
  purchaseGate.resolve();await h.ready('monthly',2026);
  assert.equal(h.state.charges,1);assert.equal(h.state.coins,20);
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  assert.equal(h.$('reading-lifelong'),null);assert.equal(h.$('reading-annual'),null);
  assert.ok(h.$('report-content').textContent.length>=10000);
  assert.equal(h.$('reading-month-11').open,true);
  assert.match(h.$('result-warnings').textContent,/태어난 시간을 몰라서.*두 글자는 비워/);
  assert.match(h.$('result-warnings').textContent,/확인한 6글자.*나무·불·흙·쇠·물/);
  assert.match(h.$('convention-list').textContent,/원래 안내: 태어난 시간을 모르므로 시주는 표시하지 않아요/);
});

test('choosing another product never charges or exposes it before the labelled open button', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  assert.equal(h.$('other-reading-options').open,false);
  assert.match(h.$('other-reading-options').querySelector('summary').textContent,/다른 풀이 보기.*전체 30쭈.*각각 10쭈/);
  const previous=h.$('report-content').textContent;
  h.pickReport('annual',2026);await pause();
  assert.equal(h.state.starts.length,1);assert.equal(h.$('report-content').textContent,previous);
  assert.equal(h.$('reading-annual'),null);assert.match(h.$('open-product').textContent,/10쭈/);
  h.$('open-product').click();await h.ready('annual',2026);
  assert.equal(h.$('other-reading-options').open,false,'finish the purchase with the reading in front');
  assert.equal(h.state.charges,2);assert.equal(h.$('reading-lifelong'),null);
  h.pickReport('lifelong');assert.match(h.$('open-product').textContent,/0쭈/);
  h.$('open-product').click();await h.ready();
  assert.equal(h.state.starts.length,3);assert.equal(h.state.charges,2);assert.equal(h.$('reading-annual'),null);
});

test('reader size and chapter navigation preserve the purchased reading without another payment', async t => {
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const doc=h.window.document;
  const original=h.$('report-content').textContent;
  assert.equal(h.$('reading-controls').hidden,false);
  assert.match(h.$('current-reading-title').textContent,/평생운/);
  assert.match(h.$('current-reading-note').textContent,/다시 보기 0쭈/);
  const normal=doc.querySelector('.reading-size-control button[data-reading-size="normal"]');
  const large=doc.querySelector('.reading-size-control button[data-reading-size="large"]');
  assert.equal(normal.getAttribute('aria-pressed'),'true');
  large.click();
  assert.equal(h.$('detailed-reading').dataset.readingSize,'large');
  assert.equal(large.getAttribute('aria-pressed'),'true');
  assert.equal(normal.getAttribute('aria-pressed'),'false');
  assert.equal(h.$('report-content').textContent,original);
  const outline=doc.querySelector('.chapter-outline');
  assert.equal(outline.open,false);
  outline.querySelector('summary').click();
  assert.equal(outline.open,true);
  for (const link of [...outline.querySelectorAll('a'),...h.$('report-toc').querySelectorAll('a')]) {
    const target=h.$(link.hash.slice(1));
    assert.ok(target,`navigation target exists: ${link.hash}`);
    if(target.tagName==='DETAILS') {
      assert.equal(target.open,false);
      link.click();
      assert.equal(target.open,true,'an explicit contents link reveals the requested information');
    }
  }
  h.pickReport('annual',2027);
  assert.match(h.$('current-reading-title').textContent,/평생운/,'choosing a product does not relabel the current story');
  assert.equal(h.$('report-content').textContent,original);
  normal.click();
  assert.equal(h.$('detailed-reading').dataset.readingSize,'normal');
  assert.equal(normal.getAttribute('aria-pressed'),'true');
  assert.equal(h.state.starts.length,1);
  assert.equal(h.state.charges,1);
});

test('a new annual year is a separate explicit purchase and changing the selection preserves old copy', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'annual'});h.submit();await h.ready('annual',2026);
  const previous=h.$('reading-annual').textContent;
  h.pickReport('annual',2027);await pause();
  assert.equal(h.state.starts.length,1);assert.equal(h.$('reading-annual').textContent,previous);
  assert.match(h.$('open-product').textContent,/2027.*10쭈|10쭈.*2027/);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/2026년 (운세|연간운|올해운)/);assert.doesNotMatch(h.state.copies[0],/2027년 (운세|연간운|올해운)/);
  h.$('open-product').click();await h.ready('annual',2027);
  assert.equal(h.state.charges,2);assert.notEqual(h.$('reading-annual').textContent,previous);
  h.pickReport('annual',2026);assert.match(h.$('open-product').textContent,/0쭈/);
  h.$('open-product').click();await h.ready('annual',2026);assert.equal(h.state.charges,2);
});

test('all twelve monthly chapters and their controls reuse the same product entitlement', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  h.$('toggle-all-months').click();assert.equal(h.$('report-content').querySelectorAll('.month-reading[open]').length,12);
  assert.equal(h.$('toggle-all-months').getAttribute('aria-expanded'),'true');
  h.$('toggle-all-months').click();assert.equal(h.$('report-content').querySelectorAll('.month-reading[open]').length,0);
  h.window.document.querySelector('.month-jump[aria-controls="reading-month-4"]').click();
  assert.equal(h.$('reading-month-4').open,true);assert.equal(h.window.document.activeElement.id,'month-title-4');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1);
});

test('copy and evidence contain only the opened product, with method and common explanations disclosed', async t => {
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0];
  assert.match(copy,/평생운/);assert.doesNotMatch(copy,/2026년 운세|2026년 12월|1990-05-17|1990년\s*5월\s*17일/);
  assert.ok(h.$('reading-evidence'));assert.ok(h.$('reading-method'));
  assert.ok(h.$('report-content').querySelectorAll('.evidence-row').length>10);
  assert.match(h.$('report-content').textContent,/계산에서 확인한 내용/);
  assert.match(h.$('report-content').textContent,/적용한 해석 규칙/);
  assert.match(h.$('report-content').textContent,/공통 참고 설명/);
  assert.match(h.$('reading-method').textContent,/계산하지 않은/);
  assert.match(h.window.document.querySelector('.method-preview').textContent,/대운.*용신.*신살/);
});

test('each chapter leads with its title, clear subtitle and easy detail before complete expandable evidence', async t => {
  const h=await harness({adminPreview:true});t.after(h.close);
  h.fill({hour:8,minute:37});h.submit();await h.ready();
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const {getReadingSources}=await import('../games/starlit-saju/sources.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const expected=buildDetailedReading(h.state.starts[0].chart,fortune);
  assert.equal(h.window.document.querySelector('.birth-chart-details').open,false);
  assert.ok(h.$('reading-guide-title'));assert.ok(h.$('reading-glossary'));
  for (const topic of ['lifelong','annual','monthly','all']) {
    if(topic!=='lifelong') {h.pickReport(topic,2026);h.$('open-product').click();await h.ready(topic,2026);}
    const first=h.$('report-content').firstElementChild;
    assert.equal(first.id,topic==='all'?'reading-all':topic==='monthly'?'reading-months':`reading-${topic}`,
      'the requested reading comes before supporting instructions');
    for(const id of ['reading-guide','reading-evidence','reading-method','reading-sources']) {
      const details=h.$(id);
      assert.equal(details.tagName,'DETAILS');
      assert.equal(details.open,false,'supporting information starts collapsed');
      details.querySelector('summary').click();
      assert.equal(details.open,true,'all supporting information remains available on request');
    }
    const chapters=topic==='all'?[...expected.sections.flatMap(section=>section.chapters),...expected.months.flatMap(month=>month.chapters)]:topic==='monthly'?expected.months.flatMap(month=>month.chapters):expected.sections.find(section=>section.id===topic).chapters;
    const articles=[...h.$('report-content').querySelectorAll('.report-chapter')];
    assert.equal(articles.length,chapters.length);
    for (const [index,chapter] of chapters.entries()) {
      const article=articles[index];
      const title=article.querySelector(':scope > h4.chapter-title');
      const subtitle=article.querySelector(':scope > h5.chapter-summary');
      const easy=article.querySelector(':scope > .easy-reading');
      const details=article.querySelector(':scope > details.chapter-evidence');
      assert.ok(title.textContent.includes(chapter.title));
      assert.equal(subtitle.textContent,chapter.summary);
      assert.equal(title.nextElementSibling,subtitle);
      assert.equal(subtitle.nextElementSibling,easy);
      assert.ok(chapter.easyParagraphs.length>0);
      assert.deepEqual([...easy.children].map(p=>p.textContent),chapter.easyParagraphs);
      assert.equal(details.open,false);
      assert.ok([...article.children].indexOf(easy)<[...article.children].indexOf(details));
      assert.deepEqual([...details.querySelectorAll('.calculated-reading > p:not(.reading-kind)')].map(p=>p.textContent),chapter.calculation);
      assert.deepEqual([...details.querySelectorAll('.interpreted-reading > p:not(.reading-kind)')].map(p=>p.textContent),chapter.interpretation);
      assert.deepEqual([...details.querySelectorAll('.shared-reference > p:not(.reading-kind)')].map(p=>p.textContent),chapter.reference);
      details.querySelector('summary').click();
      assert.equal(details.open,true);
    }
    const expectedRows=expected.evidence[topic].groups.flatMap(group=>group.rows);
    const evidenceRows=[...h.$('reading-evidence').querySelectorAll('.evidence-row')];
    assert.equal(evidenceRows.length,expectedRows.length);
    for (const [index,row] of expectedRows.entries()) {
      assert.equal(evidenceRows[index].dataset.factId,row.factId);
      assert.equal(evidenceRows[index].querySelector('dt').textContent,row.label);
      assert.equal(evidenceRows[index].querySelector('dd').textContent,row.value);
    }
    const advice=topic==='all'?[...expected.adviceByCategory.lifelong,...expected.adviceByCategory.annual,...expected.months.flatMap(month=>month.advice)]:topic==='monthly'?expected.months.flatMap(month=>month.advice):expected.adviceByCategory[topic];
    const cards=[...h.$('report-content').querySelectorAll('.advice-card')];
    assert.ok(advice.length>0);
    assert.equal(cards.length,advice.length,'show every grounded suggestion without truncation');
    for (const [index,item] of advice.entries()) {
      const card=cards[index];
      assert.equal(card.dataset.adviceId,item.id);
      assert.equal(card.dataset.origin,'service-advice');
      assert.equal(card.querySelector('h4').textContent,item.title);
      assert.equal(card.querySelector('h4').nextElementSibling,card.querySelector('h5'));
      assert.equal(card.querySelector('h5').textContent,item.why);
      assert.equal(card.querySelector('.advice-action > span').textContent,item.action);
      assert.equal(card.querySelector('.advice-caution > span').textContent,item.caution);
    }
    if (topic==='monthly'||topic==='all') for (const month of expected.months) assert.equal(h.$(`reading-month-${month.month}`).querySelectorAll('.advice-card').length,month.advice.length);
    const notices=h.$('report-content').querySelectorAll('.advice-notice');
    assert.equal(notices.length,1,'a common advice notice is stated once, not once per month');
    assert.equal(notices[0].textContent,expected.adviceNotice);
    assert.match(expected.adviceNotice,/오쭈다가 쓴 생활 제안/);
    const sources=getReadingSources(topic,2026);
    const renderedSources=[...h.$('reading-sources').querySelectorAll('.source-entry')];
    assert.equal(renderedSources.length,sources.length);
    for (const [index,source] of sources.entries()) {
      const item=renderedSources[index];
      assert.equal(item.dataset.sourceId,source.id);
      assert.equal(item.querySelector('a').href,source.url);
      assert.equal(item.querySelector('a').target,'_blank');
      assert.equal(item.querySelector('.source-use').textContent,source.usedFor);
      assert.equal(item.querySelector('.source-limitation').textContent,source.limitation);
    }
  }
  assert.equal(h.state.starts.length,4,'only the four explicit product buttons open purchases');
  assert.equal(h.state.charges,0,'reading and expanding calculation evidence never creates a payment');
});

test('signed-out and anonymous sessions cannot purchase or reveal paid products', async t => {
  for(const user of [null,'anonymous-id']){
    const h=await harness({user,signedIn:false});t.after(h.close);h.fill();h.submit();
    await waitFor(()=>!h.$('form-error').hidden);
    assert.equal(h.state.starts.length,0);assert.equal(h.$('result').hidden,true);
    assert.equal(h.$('login-link').hidden,false);assert.match(h.$('form-error').textContent,/로그인/);
  }
});

test('insufficient balance leaves the paid product hidden and allows an explicit retry', async t => {
  const h=await harness({coins:9});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('form-error').hidden);assert.match(h.$('form-error').textContent,/부족/);
  assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
  h.state.coins=20;h.submit();await h.ready();assert.equal(h.state.charges,1);assert.equal(h.state.coins,10);
});

test('a detail module failure charges nothing and keeps the birth input for retry', async t => {
  const h=await harness({failReadings:1});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('form-error').hidden);assert.equal(h.state.starts.length,0);
  assert.equal(h.$('birth-year').value,'1990');assert.equal(h.$('result').hidden,true);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
});

test('failed read-only ownership checks block payment and their retry itself never charges', async t => {
  const h=await harness({failStatus:1});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>!h.$('entry-check-error').hidden);
  assert.equal(h.state.starts.length,0);assert.equal(h.$('open-story').disabled,true);
  h.$('retry-entry-status').click();await waitFor(()=>!h.$('open-story').disabled);
  assert.equal(h.state.starts.length,0);assert.equal(h.$('entry-check-error').hidden,true);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
});

test('a failed product ownership refresh preserves the paid report and retries without charging', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const previous=h.$('report-content').textContent;
  h.state.failStatus=1;h.pickReport('annual',2027);h.$('open-product').click();
  await waitFor(()=>!h.$('report-error').hidden);
  assert.equal(h.state.starts.length,1);assert.ok(h.$('report-content').textContent===previous);
  assert.equal(h.$('open-product').disabled,true);
  h.$('retry-report').click();await waitFor(()=>h.$('report-error').hidden&&!h.$('open-product').disabled);
  assert.equal(h.state.starts.length,1);assert.ok(h.$('report-content').textContent===previous);
  h.$('open-product').click();await h.ready('annual',2027);assert.equal(h.state.charges,2);
});

test('editing birth during a product transition discards the old request before payment', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  h.pickReport('annual',2027);h.$('open-product').click();h.$('edit-birth').click();
  h.fill({year:2001,month:4,day:9,hour:11,minute:20});h.submit();await h.ready();
  assert.match(h.$('birth-summary').textContent,/2001년 4월 9일/);
  assert.equal(h.state.starts.length,2);assert.ok(h.state.starts.every(value=>value.topic==='lifelong'));
  assert.equal(h.$('report-content').hasAttribute('aria-busy'),false);
});

test('account changes invalidate late payment receipts and erase the previous birth state', async t => {
  const purchaseGate=deferred();const h=await harness({purchaseGate});t.after(h.close);h.fill();h.submit();
  await waitFor(()=>h.state.starts.length===1);h.changeAccount('member-b');purchaseGate.resolve();await pause();await pause();
  assert.equal(h.$('result').hidden,true);assert.equal(h.$('birth-year').value,'');
  assert.equal(h.$('report-content').textContent,'');assert.equal(h.$('copy-reading').disabled,true);
});

test('solar and lunar representations reopen the same purchased product without an extra charge', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const chart=h.state.starts[0].chart;h.$('edit-birth').click();
  h.fill({calendar:'lunar',year:chart.lunar.year,month:chart.lunar.month,day:chart.lunar.day,leap:chart.lunar.leapMonth});
  h.submit();await h.ready();assert.equal(h.state.starts.length,2);assert.equal(h.state.charges,1);
  assert.equal(h.state.starts[1].chart.solar.iso,chart.solar.iso);assert.match(h.$('status').textContent,/추가 차감 없이/);
});

test('legacy bundle recovery and verified admin preview do not create new product charges', async t => {
  for(const mode of [{legacyBundle:true},{adminPreview:true}]){
    const h=await harness(mode);t.after(h.close);h.fill({topic:'annual'});h.submit();await h.ready('annual',2026);
    h.pickReport('monthly',2027);assert.match(h.$('open-product').textContent,/0쭈|미리보기/);
    h.$('open-product').click();await h.ready('monthly',2027);
    h.pickReport('all',2026);assert.match(h.$('open-product').textContent,/0쭈|미리보기/);
    h.$('open-product').click();await h.ready('all',2026);
    assert.equal(h.state.charges,0);assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  }
});

test('the explicit thirty-ju full purchase opens all three readings and each can reopen free', async t => {
  const h=await harness();t.after(h.close);h.fill({topic:'all'});
  await waitFor(()=>h.state.statusCalls.length>0&&!h.$('open-story').disabled);
  assert.equal(h.$('entry-year-field').hidden,false);
  assert.match(h.$('entry-price-value').textContent,/2026.*전체 풀이.*30쭈/);
  assert.match(h.$('open-story').textContent,/30쭈로.*전체 풀이/);
  for(const topic of ['lifelong','annual','monthly']) {
    assert.equal(h.window.document.querySelector(`[data-entry-price="${topic}"]`).textContent,'10쭈');
  }
  assert.match(h.$('entry-price-note').textContent,/결제 후 24시간.*다시 보기 0쭈.*다시 결제.*이용 시간이 남은 항목/);
  assert.equal(h.state.starts.length,0,'selecting the full product only checks ownership');
  h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.coins,0);
  assert.equal(h.state.starts.length,1);assert.equal(h.state.starts[0].topic,'all');
  assert.equal(h.state.receipts.size,3);
  assert.ok(h.$('reading-lifelong'));assert.ok(h.$('reading-annual'));
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  assert.equal(h.$('reading-all').querySelectorAll('a').length,3);
  for (const link of [...h.$('reading-all').querySelectorAll('a'),...h.$('report-toc').querySelectorAll('a')]) assert.ok(h.$(link.hash.slice(1)));
  const ids=[...h.$('report-content').querySelectorAll('[id]')].map(item=>item.id);
  assert.equal(new Set(ids).size,ids.length,'the combined view has no duplicate section IDs');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/평생운/);assert.match(h.state.copies[0],/2026년/);assert.match(h.state.copies[0],/12월/);
  assert.doesNotMatch(h.state.copies[0],/1990-05-17|1990년\s*5월\s*17일/);
  for (const topic of ['lifelong','annual','monthly','all']) {
    h.pickReport(topic,2026);
    assert.match(h.$('open-product').textContent,/0쭈/);
    h.$('open-product').click();await h.ready(topic,topic==='lifelong'?0:2026);
  }
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.coins,0);
});

test('full purchase deducts only missing products and another year keeps lifelong free', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const before=h.$('report-content').textContent;
  h.pickReport('all',2026);
  assert.match(h.$('product-offer').textContent,/전체 풀이.*남은 20쭈/);
  assert.match(h.$('open-product').textContent,/남은 20쭈로/);
  assert.equal(h.window.document.querySelector('[data-report-price="all"]').textContent,'남은 20쭈');
  assert.equal(h.state.starts.length,1);assert.equal(h.$('report-content').textContent,before);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.doesNotMatch(h.state.copies[0],/2026년 12월/,'the old purchased copy remains active before full purchase');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20]);assert.equal(h.state.coins,0);
  h.pickReport('all',2027);
  assert.equal(h.$('report-content').dataset.year,'2026');
  assert.match(h.$('open-product').textContent,/남은 20쭈로.*2027/);
  assert.equal(h.state.starts.length,2,'changing the full-reading year never starts a purchase');
  h.state.coins=20;
  h.$('open-product').click();await h.ready('all',2027);
  assert.deepEqual(h.state.chargedAmounts,[10,20,20]);assert.equal(h.state.coins,0);
  assert.equal(h.state.receipts.size,5,'lifelong has one entitlement across years');
  assert.equal(h.$('reading-months-title').textContent,'2027년, 열두 달의 이야기');
});

test('three separate purchases unlock the combined reading at zero extra ju', async t => {
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  for (const topic of ['annual','monthly']) {h.pickReport(topic);h.$('open-product').click();await h.ready(topic,2026);}
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.pickReport('all');assert.match(h.$('open-product').textContent,/0쭈/);
  assert.equal(h.window.document.querySelector('[data-report-price="all"]').textContent,'이용 가능');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);assert.equal(h.state.coins,0);
  h.$('edit-birth').click();h.fill({topic:'all'});
  await waitFor(()=>!h.$('open-story').disabled&&/0쭈/.test(h.$('open-story').textContent));
  h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);
});

test('an insufficient full-reading balance exposes no partial report or purchase', async t => {
  const h=await harness({coins:29});t.after(h.close);h.fill({topic:'all'});h.submit();
  await waitFor(()=>!h.$('form-error').hidden);
  assert.match(h.$('form-error').textContent,/30쭈/);
  assert.equal(h.$('result').hidden,true);assert.equal(h.state.coins,29);
  assert.equal(h.state.charges,0);assert.equal(h.state.receipts.size,0);
  h.state.coins=30;h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);assert.equal(h.state.receipts.size,3);
});

test('the reading closes exactly 24 hours after payment and only a new explicit click renews it',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const original=h.$('report-content').textContent;
  const first=[...h.state.receipts.values()][0];
  assert.match(h.$('current-reading-note').textContent,/11월 14일.*12:00까지/);
  h.advance(86400000-1);
  assert.equal(h.$('report-content').textContent,original);
  h.advance(1);
  assert.equal(h.$('report-content').textContent,'');
  assert.equal(h.$('copy-reading').disabled,true);
  assert.equal(h.$('reading-controls').hidden,true);
  assert.equal(h.window.document.querySelector('.birth-chart-details').hidden,true);
  assert.equal(h.$('other-reading-options').open,true);
  assert.match(h.$('report-status').textContent,/24시간 이용이 끝났어요/);
  assert.match(h.$('open-product').textContent,/10쭈/);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  h.$('open-product').click();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.$('report-content').textContent,original,'repurchase does not invent a different natal reading');
  assert.equal(h.window.document.querySelector('.birth-chart-details').hidden,false);
  const renewed=[...h.state.receipts.values()][0];
  assert.notEqual(renewed.request_id,first.request_id);
  assert.equal(Date.parse(renewed.expires_at)-Date.parse(first.expires_at),86400000);
});

test('reopening inside the access window is free and does not extend the original deadline',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const originalExpiry=[...h.state.receipts.values()][0].expires_at;
  h.advance(23*3600000);h.$('edit-birth').click();h.submit();await h.ready();
  assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal([...h.state.receipts.values()][0].expires_at,originalExpiry);
  h.advance(3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('a stale free entry offer cannot silently charge when the ownership check finds it expired',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();h.$('edit-birth').click();
  await waitFor(()=>/0쭈/.test(h.$('open-story').textContent)&&!h.$('open-story').disabled);
  h.advance(86400000,{runTimers:false});
  assert.equal(h.$('open-story').dataset.expectedCharge,'0');
  h.submit();await waitFor(()=>!h.$('form-error').hidden);
  assert.match(h.$('form-error').textContent,/금액.*바뀌/);
  assert.equal(h.$('result').hidden,true);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);
  assert.match(h.$('open-story').textContent,/10쭈/);
  h.submit();await h.ready();assert.deepEqual(h.state.chargedAmounts,[10,10]);
});

test('a stale free product offer requires a second explicit click after the price increases',async t=>{
  const h=await harness({coins:50});t.after(h.close);h.fill();h.submit();await h.ready();
  h.pickReport('annual');h.$('open-product').click();await h.ready('annual',2026);
  h.pickReport('lifelong');h.$('open-product').click();await h.ready();
  h.pickReport('annual');assert.equal(h.$('open-product').dataset.expectedCharge,'0');
  h.advance(86400000,{runTimers:false});
  h.$('open-product').click();await waitFor(()=>!h.$('report-error').hidden);
  assert.equal(h.$('report-content').textContent,'');
  assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);
  assert.match(h.$('open-product').textContent,/10쭈/);
  h.$('open-product').click();await h.ready('annual',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,10,10]);
});

test('a partially expired full reading charges only the expired part and preserves active deadlines',async t=>{
  const h=await harness({coins:60});t.after(h.close);h.fill();h.submit();await h.ready();
  h.advance(3600000);
  h.pickReport('all');h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20]);
  const annual=[...h.state.receipts.values()].find(item=>item.topic==='annual');
  h.advance(23*3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.match(h.$('open-product').textContent,/남은 10쭈/);
  assert.equal(h.window.document.querySelector('[data-report-price="annual"]').textContent,'이용 가능');
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[10,20,10]);
  assert.equal([...h.state.receipts.values()].find(item=>item.topic==='annual').expires_at,annual.expires_at);
  h.advance(3600000);
  assert.equal(h.$('report-content').textContent,'');
  assert.match(h.$('open-product').textContent,/남은 20쭈/);
  assert.deepEqual(h.state.chargedAmounts,[10,20,10]);
});

test('copying and returning to a sleeping tab check expiry before showing or copying the old report',async t=>{
  for(const resume of ['copy','focus','pageshow','visibility']) {
    const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
    h.advance(86400000,{runTimers:false});
    if(resume==='copy')h.$('copy-reading').click();
    else if(resume==='visibility')h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    else h.window.dispatchEvent(new h.window.Event(resume));
    assert.equal(h.$('report-content').textContent,'');
    assert.equal(h.$('copy-reading').disabled,true);
    assert.equal(h.state.copies.length,0);
    assert.deepEqual(h.state.chargedAmounts,[10]);
  }
});

test('an old bundle expires at its original payment time and a status retry never renews it',async t=>{
  const h=await harness({legacyBundle:true});t.after(h.close);h.fill({topic:'all'});h.submit();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[]);
  h.advance(86400000);
  h.$('retry-report').click();await waitFor(()=>!h.$('open-product').disabled);
  assert.equal(h.$('report-content').textContent,'');assert.match(h.$('open-product').textContent,/30쭈/);
  assert.deepEqual(h.state.chargedAmounts,[]);
  h.$('open-product').click();await h.ready('all',2026);
  assert.deepEqual(h.state.chargedAmounts,[30]);
});

test('a paid previous year remains selectable across New Year for the rest of its 24-hour window',async t=>{
  const h=await harness();t.after(h.close);
  h.advance(Date.parse('2026-12-31T14:00:00Z')-Date.parse(fixedNow));
  h.fill({topic:'annual',fortuneYear:2025});h.submit();await h.ready('annual',2025);
  h.advance(2*3600000,{focus:true});
  await waitFor(()=>!h.$('report-product-picker').disabled);
  assert.ok([...h.$('fortune-year').options].some(option=>option.value==='2025'));
  h.$('edit-birth').click();h.fill({topic:'annual',fortuneYear:2025});
  await waitFor(()=>!h.$('open-story').disabled&&/0쭈/.test(h.$('open-story').textContent));
  assert.ok([...h.$('entry-year').options].some(option=>option.value==='2025'));
  h.submit();await h.ready('annual',2025);assert.deepEqual(h.state.chargedAmounts,[10]);
  const previousChecks=h.state.statusCalls.length;
  h.changeAccount('member-b');h.fill({topic:'annual'});
  await waitFor(()=>h.state.statusCalls.length>previousChecks&&!h.$('open-story').disabled);
  assert.equal([...h.$('entry-year').options].some(option=>option.value==='2025'),false,'the next account cannot inherit an owned historical year');
});

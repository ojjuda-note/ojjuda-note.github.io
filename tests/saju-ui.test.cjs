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
  window.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return NativeDate.parse(fixedNow); }
  };
  window.matchMedia = () => ({matches:true, addEventListener(){}, removeEventListener(){}});
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function() {};
  const state = {
    user:'member-a', signedIn:true, adminPreview:false, coins:30,
    starts:[], charges:0, initCalls:0, instances:[], receipts:new Map(), copies:[], statusCalls:[],
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
    async init() { state.initCalls++; return {signedIn:state.signedIn, adminPreview:state.adminPreview}; }
    async status(chart) {
      state.statusCalls.push(chart);
      if(state.failStatus>0){state.failStatus--;throw Object.assign(new Error('구매 내역을 확인하지 못했어요.'),{code:'network'});}
      const profile=profileKey(chart);
      return {ok:true,coins:state.coins,prices:{lifelong:10,annual:10,monthly:10},
        entitlements:[...state.receipts.values()].filter(receipt=>receipt.profile===profile),
        bundle_entitlement:state.legacyBundle?{price:10}:null,adminPreview:state.adminPreview};
    }
    async start(chart, target) {
      assert.ok(['lifelong','annual','monthly'].includes(target?.topic),'payment requires an explicit product');
      const owner = state.user;
      const topic=target.topic,year=topic==='lifelong'?0:target.year;
      state.starts.push({chart,topic,year});
      if (state.purchaseGate) await state.purchaseGate.promise;
      if (!state.signedIn) throw Object.assign(new Error('아지트에 로그인해 주세요.'), {code:'not_signed_in'});
      if (state.adminPreview) return {ok:true,price:0,charged:0,replayed:false,adminPreview:true,topic,year};
      const profile=profileKey(chart,owner),key=`${profile}|${topic}|${year}`;
      const replayed = state.legacyBundle || state.receipts.has(key);
      if (!replayed && state.coins < 10) throw Object.assign(new Error('쭈가 부족해요. 사주 전체 풀이에는 10쭈가 필요해요.'), {code:'coins'});
      if (!replayed) {
        state.receipts.set(key,{profile,topic,year,price:10});
        state.charges++;
        if (owner === state.user) state.coins -= 10;
      }
      if (owner === state.user) this.callbacks.onBalance(state.coins);
      return {ok:true,price:10,charged:replayed?0:10,replayed,legacy_bundle:state.legacyBundle,coins:state.coins,topic,year};
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
  return {dom,window,state,$,fill,submit,ready,change,pickReport,changeAccount,close:()=>dom.window.close()};
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
  assert.match(h.$('other-reading-options').querySelector('summary').textContent,/다른 풀이 보기.*10쭈.*0쭈/);
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
  assert.match(h.$('current-reading-note').textContent,/구매한 풀이.*0쭈/);
  const normal=doc.querySelector('.reading-size-control button[data-reading-size="normal"]');
  const large=doc.querySelector('.reading-size-control button[data-reading-size="large"]');
  assert.equal(normal.getAttribute('aria-pressed'),'true');
  large.click();
  assert.equal(h.$('detailed-reading').dataset.readingSize,'large');
  assert.equal(large.getAttribute('aria-pressed'),'true');
  assert.equal(normal.getAttribute('aria-pressed'),'false');
  assert.equal(h.$('report-content').textContent,original);
  const outline=doc.querySelector('.chapter-outline');
  assert.equal(outline.open,true);
  for (const link of [...outline.querySelectorAll('a'),...h.$('report-toc').querySelectorAll('a')]) {
    assert.ok(h.$(link.hash.slice(1)),`navigation target exists: ${link.hash}`);
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
  for (const topic of ['lifelong','annual','monthly']) {
    if(topic!=='lifelong') {h.pickReport(topic,2026);h.$('open-product').click();await h.ready(topic,2026);}
    const chapters=topic==='monthly'?expected.months.flatMap(month=>month.chapters):expected.sections.find(section=>section.id===topic).chapters;
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
    const advice=topic==='monthly'?expected.months.flatMap(month=>month.advice):expected.adviceByCategory[topic];
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
    if (topic==='monthly') for (const month of expected.months) assert.equal(h.$(`reading-month-${month.month}`).querySelectorAll('.advice-card').length,month.advice.length);
    for (const notice of h.$('report-content').querySelectorAll('.advice-notice')) assert.equal(notice.textContent,expected.adviceNotice);
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
  assert.equal(h.state.starts.length,3,'only the three explicit product buttons open purchases');
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
    assert.equal(h.state.charges,0);assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12);
  }
});

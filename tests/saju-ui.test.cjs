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
    get anonymous() { return Boolean(state.anonymous); }
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
  let linkQueue=Promise.resolve();
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
  function submit() { $('birth-form').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true})); }
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
  const full=h.$('reading-lifelong-details');
  assert.equal(full.open,false,'the original theory stays folded behind the personal reading');
  const basisLink=doc.querySelector('.reader-card .reader-detail-link');
  assert.ok(basisLink,'each personal interpretation can reveal its original explanation');
  basisLink.click();
  assert.equal(full.open,true);
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

test('the personal reading leads and all longer explanations remain accessible on request',async t=>{
  const h=await harness();t.after(h.close);h.fill({hour:8,minute:37});h.submit();await h.ready();
  const doc=h.window.document,body=h.$('report-content');
  assert.ok(h.$('reading-summary'));
  assert.ok(h.$('reading-topics'));
  assert.equal(doc.querySelector('.report-opening'),null,'there is no duplicate introductory banner before the reading');
  assert.deepEqual([...h.$('report-toc').querySelectorAll('a')].map(link=>link.hash),['#reading-summary','#reading-topics','#reading-evidence']);
  assert.ok(body.compareDocumentPosition(doc.querySelector('.birth-chart-details'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the personal interpretation comes before the birth-chart explanation');
  assert.ok(body.compareDocumentPosition(h.$('other-reading-options'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the current reading comes before another purchase panel');
  assert.equal(h.$('report-status').textContent,'');
  const cards=[...body.querySelectorAll('.reader-card')];
  assert.ok(cards.length>=16,'personal life topics have separate detailed sections');
  assert.ok(body.querySelectorAll('.reader-topic-group').length>1,'many topics are grouped in the contents');
  for(const card of cards) {
    assert.ok(card.querySelector('.reader-card-label').textContent.trim());
    assert.ok(card.querySelector('.reader-card-title').textContent.trim());
    assert.ok(card.querySelectorAll('.reader-prose>p').length>=5,'each topic explains its meaning, concrete examples and how to act');
    assert.equal(card.dataset.origin,'service-reference');
    assert.ok(card.dataset.factIds.split(' ').every(id=>id.startsWith('natal.')),'lifelong never leaks a separately purchased period');
    assert.doesNotMatch(card.textContent,/사주는 태어난|이를 .십성|아래쪽 대표 글자|위쪽 글자/);
  }
  assert.equal(h.$('reading-lifelong-details').open,false);
  assert.equal(body.querySelectorAll('.report-chapter').length,13,'all previous detailed chapters are preserved');
  assert.ok([...body.querySelectorAll('.report-chapter')].every(chapter=>chapter.closest('.reading-full-text')&&!chapter.closest('.reading-full-text').open));
  cards.find(card=>card.querySelector('.reader-detail-link')).querySelector('.reader-detail-link').click();
  assert.equal(h.$('reading-lifelong-details').open,true);
  assert.ok(doc.activeElement.classList.contains('chapter-title'));
  doc.querySelector('.other-reading-link').click();
  assert.equal(h.$('other-reading-options').open,true);
  assert.equal(h.state.charges,1,'reading navigation is never a purchase');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0],headline=body.querySelector('.reader-headline').textContent;
  assert.ok(copy.indexOf(headline)<copy.indexOf('자세한 풀이'));
  assert.ok(copy.indexOf(headline)<copy.indexOf('사주 이름을 쉬운 말로'));
  for(const card of cards)for(const paragraph of card.querySelectorAll('.reader-prose>p'))assert.ok(copy.includes(paragraph.textContent));
});

test('the personal portrait leads with every paragraph and connects its topics to complete evidence',async t=>{
  const h=await harness();t.after(h.close);h.fill();h.submit();await h.ready();
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const reading=buildDetailedReading(h.state.starts[0].chart,fortune),expected=reading.personPortrait;
  const doc=h.window.document,portrait=h.$('reading-person-portrait'),summary=h.$('reading-summary'),topics=h.$('reading-topics');
  assert.ok(expected,'the personal portrait must be built from the actual chart');
  assert.equal(h.$('reading-lifelong-title').textContent,expected.title);
  assert.equal(summary.parentElement,portrait,'the main summary opens the new personal conclusion');
  assert.equal(summary.querySelector('.portrait-headline').textContent,expected.headline);
  assert.deepEqual([...summary.querySelectorAll('.portrait-prose>p')].map(p=>p.textContent),expected.paragraphs);
  const portraitTable=summary.querySelector('table.portrait-summary-table');
  assert.equal(portraitTable.caption.textContent,'한눈에 보는 나');
  assert.deepEqual([...portraitTable.tHead.rows[0].cells].map(cell=>[cell.scope,cell.textContent]),[['col','상황'],['col','내 모습']]);
  assert.ok(summary.querySelector('.portrait-headline').compareDocumentPosition(portraitTable)&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the personal conclusion precedes its overview table');
  assert.ok(portraitTable.compareDocumentPosition(summary.querySelector('.portrait-prose'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the overview table precedes every full introductory paragraph');
  const portraitRows=[...portraitTable.tBodies[0].rows];
  assert.equal(portraitRows.length,expected.cards.length);
  for(const [index,row] of portraitRows.entries()) {
    const item=expected.cards[index],link=row.querySelector('th a');
    assert.equal(row.cells[0].scope,'row');
    assert.equal(link.firstChild.textContent,item.label);
    assert.equal(row.querySelector('.summary-cell-text').textContent,item.title);
    assert.equal(link.hash,`#person-portrait-topic-${index+1}`);
    link.click();assert.equal(doc.activeElement,h.$(link.hash.slice(1)),'each row reaches its own detailed personality topic');
  }
  assert.equal(topics.parentElement,portrait);
  assert.equal(topics.querySelector('.portrait-topic-group'),null,'the overview rows replace the duplicate five personality buttons');
  assert.equal(h.$('reading-lifelong').querySelectorAll('.reader-scope-note').length,1,'the unknown-time notice appears once');
  assert.equal(summary.querySelector('.reader-scope-note').textContent,reading.reader.scopeNotice);
  assert.equal(portrait.querySelectorAll('.portrait-card').length,5);
  for(const item of expected.cards) {
    const card=[...portrait.querySelectorAll('.portrait-card')].find(value=>value.dataset.portraitCard===item.id);
    assert.ok(card,`the portrait keeps ${item.id}`);
    assert.equal(card.querySelector('.portrait-card-label').lastChild.textContent,item.label);
    assert.equal(card.querySelector('.portrait-card-title').textContent,item.title);
    assert.deepEqual([...card.querySelectorAll('.portrait-prose>p')].map(p=>p.textContent),item.paragraphs);
    assert.equal(card.dataset.origin,item.origin||expected.origin||'service-reference');
    assert.deepEqual(card.dataset.factIds.split(' '),item.factIds);
    const heading=card.querySelector('.portrait-card-label');
    const link=portraitTable.querySelector(`a[href="#${heading.id}"]`);
    assert.ok(link,`the overview row reaches ${item.label}`);
    link.click();assert.equal(doc.activeElement,heading);
  }
  const previous=h.$('reading-personality-more');
  assert.equal(previous.open,false,'the previous three explanations do not repeat before the new portrait');
  assert.deepEqual([...previous.querySelectorAll('.reader-card')].map(card=>card.dataset.readerCard),['natal-character','natal-aptitude','natal-life-path']);
  assert.equal(h.$('reading-lifelong').querySelectorAll('.reader-card').length,reading.reader.lifelong.cards.length,'all prior personal topics remain available');
  for(const item of reading.reader.lifelong.cards) {
    const card=[...h.$('reading-lifelong').querySelectorAll('.reader-card')].find(value=>value.dataset.readerCard===item.id);
    assert.deepEqual([...card.querySelectorAll('.reader-prose>p')].map(p=>p.textContent),item.paragraphs);
    const heading=card.querySelector('.reader-card-label');
    const link=topics.querySelector(`a[href="#${heading.id}"]`);
    assert.ok(link,`the contents still reach ${item.label}`);
    link.click();assert.equal(doc.activeElement,heading);
    if(card.closest('#reading-personality-more'))assert.equal(previous.open,true,'a topic link reveals a folded prior explanation');
  }
  const storyParagraphs=[...h.$('reading-lifelong').querySelectorAll('.reader-prose>p')];
  const splitParagraphs=storyParagraphs.filter(paragraph=>paragraph.querySelector('.reader-sentence-group'));
  assert.ok(splitParagraphs.length>0,'long personal explanations gain visible sentence groups');
  for(const paragraph of splitParagraphs) {
    const groups=[...paragraph.querySelectorAll(':scope>span.reader-sentence-group')];
    assert.ok(groups.length>1,'a long paragraph is divided into more than one readable group');
    assert.ok(groups.every(group=>group.textContent.trim()),'visual breaks do not create empty groups');
    assert.equal(groups.map(group=>group.textContent).join(''),paragraph.textContent,'sentence groups retain every character and its original order');
  }
  const shortParagraphs=storyParagraphs.filter(paragraph=>paragraph.textContent.length<100);
  assert.ok(shortParagraphs.length>0);
  for(const paragraph of shortParagraphs)assert.equal(paragraph.children.length,0,'short explanations retain their plain paragraph text');
  const evidence=h.$('reading-person-portrait-evidence');
  assert.equal(evidence.open,false,'provenance and calculation details start folded');
  assert.ok(evidence.textContent.includes(expected.methodNotice));
  assert.ok(evidence.textContent.includes(expected.selectionNotice));
  const factIds=[...new Set([...expected.factIds,...expected.cards.flatMap(card=>card.factIds)])];
  const rows=[...evidence.querySelectorAll('.portrait-evidence-row')];
  assert.deepEqual(rows.map(row=>row.dataset.factId),factIds);
  for(const row of rows) {
    const fact=reading.facts.find(value=>value.id===row.dataset.factId);
    assert.ok(fact,'every statement is linked to a real calculation fact');
    assert.equal(row.querySelector('dt').textContent,fact.label);
    assert.equal(row.querySelector('dd').textContent,fact.text);
  }
  portrait.querySelector('.portrait-card .reader-detail-link').click();
  assert.equal(evidence.open,true);assert.equal(doc.activeElement,evidence);
  assert.equal(h.$('reading-evidence').open,false);
  evidence.querySelector('.reader-detail-link').click();
  assert.equal(h.$('reading-evidence').open,true,'the original full calculation registry is reachable');
  for(const id of ['reading-summary','reading-topics']) {
    h.$('report-toc').querySelector(`a[href="#${id}"]`).click();
    await waitFor(()=>h.window.location.hash===`#${id}`,'the main contents should navigate to the personal reading');
    assert.equal(h.$(id).tabIndex,-1,'the requested summary or contents is focusable in the browser');
  }
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'reading links never start a new purchase');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  const copy=h.state.copies[0];
  assert.ok(copy.includes(expected.headline));
  assert.ok(copy.indexOf(expected.headline)<copy.indexOf(reading.reader.lifelong.headline));
  for(const paragraph of [...expected.paragraphs,...expected.cards.flatMap(card=>card.paragraphs)])assert.ok(copy.includes(paragraph));
});

test('monthly readers see the current and next actual flow before all twelve detailed months',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly'});h.submit();await h.ready('monthly',2026);
  const spotlight=h.$('reading-summary');
  assert.ok(spotlight.classList.contains('months-spotlight'));
  const links=[...spotlight.querySelectorAll('a')];
  assert.deepEqual(links.map(link=>link.hash),['#month-title-11','#month-title-12']);
  assert.equal(h.$('report-content').querySelector('.month-reading').id,'reading-month-11','the current detailed result appears before the other collapsed months');
  assert.equal(h.$('reading-month-11').querySelector('.reader-headline'),null,'the month result heading is not repeated inside its open body');
  for(const month of h.$('report-content').querySelectorAll('.month-reading')) {
    assert.ok(month.querySelector(':scope>summary .month-headline').textContent.trim());
    assert.equal(month.querySelector('.reading-full-text').open,false);
  }
  h.$('reading-month-11').open=false;
  h.$('report-toc').querySelector('a[href="#reading-topics"]').click();
  assert.equal(h.$('reading-month-11').open,true,'the topic navigation opens its current month automatically');
  assert.equal(h.$('reading-month-11-details').open,false,'topic navigation does not unfold the calculation lesson');
  links[1].click();
  assert.equal(h.$('reading-month-12').open,true);
  assert.equal(h.window.document.activeElement.id,'month-title-12');
  assert.equal(h.state.charges,1);
});

test('the monthly overview preserves every calculated period, opportunity and caution and opens the correct details',async t=>{
  const h=await harness();t.after(h.close);h.fill({topic:'monthly',hour:8,minute:37});h.submit();await h.ready('monthly',2026);
  const {analyzeFortune}=await import('../games/starlit-saju/fortune-data.mjs');
  const {buildDetailedReading}=await import('../games/starlit-saju/readings.mjs');
  const fortune=analyzeFortune(h.state.starts[0].chart,{year:2026,now:new Date(fixedNow)});
  const reading=buildDetailedReading(h.state.starts[0].chart,fortune);
  const expected=[...reading.reader.timings.items].sort((a,b)=>a.month-b.month);
  const doc=h.window.document,section=h.$('reading-timings'),table=section.querySelector('table.timing-summary-table');
  const navigation=section.querySelector('.reader-timing-navigation'),comparison=section.querySelector('details.timing-table-details');
  assert.ok(comparison,'the twelve-month comparison has its own expandable section');
  assert.equal(comparison.open,false,'the dense comparison starts folded behind the monthly shortcuts');
  assert.equal(navigation.nextElementSibling,comparison,'monthly shortcuts come before the comparison');
  assert.equal(comparison.nextElementSibling,section.querySelector('.reader-timing-list'),'detailed readings follow the folded comparison');
  assert.equal(table.parentElement,comparison.querySelector(':scope>div.timing-table-body'));
  const comparisonToggle=comparison.querySelector(':scope>summary.full-reading-toggle');
  assert.ok(comparisonToggle.textContent.startsWith('열두 달 비교표'));
  assert.equal(comparisonToggle.querySelector('small').textContent,'12개월');
  const monthShortcut=navigation.querySelector('a'),shortcutTarget=h.$(monthShortcut.hash.slice(1));
  shortcutTarget.closest('details').open=false;
  monthShortcut.click();
  assert.equal(shortcutTarget.closest('details').open,true);
  assert.equal(doc.activeElement,shortcutTarget);
  assert.equal(comparison.open,false,'a monthly shortcut reaches its reading without opening the comparison');
  comparisonToggle.click();
  assert.equal(comparison.open,true,'the reader explicitly opens the complete twelve-month comparison');
  assert.equal(table.caption.textContent,'월별 기회와 주의점 한눈에 보기');
  assert.deepEqual([...table.tHead.rows[0].cells].map(cell=>[cell.scope,cell.textContent]),
    [['col','월과 기간'],['col','살릴 기회'],['col','조심할 상황']]);
  assert.ok(table.compareDocumentPosition(section.querySelector('.reader-timing-list'))&h.window.Node.DOCUMENT_POSITION_FOLLOWING);
  const rows=[...table.tBodies[0].rows];
  assert.equal(rows.length,12);
  assert.deepEqual(rows.map(row=>Number(row.dataset.month)),expected.map(item=>item.month));
  for(const [index,row] of rows.entries()) {
    const item=expected[index],link=row.querySelector('th a');
    assert.equal(row.cells[0].scope,'row');
    assert.equal(link.firstChild.textContent,`${item.month}월`);
    assert.equal(link.hash,`#reading-timings-month-${item.month}`);
    assert.equal(row.querySelector('.summary-period').textContent,item.periodLabel,'the exact calculated time range stays visible');
    assert.deepEqual([...row.querySelectorAll('.summary-opportunities li')].map(point=>point.textContent),item.opportunities.map(point=>point.label));
    assert.deepEqual([...row.querySelectorAll('.summary-cautions li')].map(point=>point.textContent),item.cautions.map(point=>point.label));
    const heading=h.$(link.hash.slice(1)),article=heading.closest('details');
    article.open=false;link.click();
    assert.equal(article.open,true);assert.equal(doc.activeElement,heading);
    assert.equal(article.dataset.month,String(item.month));
    assert.deepEqual([...article.querySelectorAll('.reader-timing-content>.reader-prose>p')].map(p=>p.textContent),item.paragraphs);
    assert.deepEqual([...article.querySelectorAll('.reader-timing-point')].map(point=>[point.querySelector('dt').textContent,point.querySelector('dd').textContent]),
      [...item.cautions,...item.opportunities,...item.people,...item.documents].map(point=>[point.label,point.text]),
      'all detailed text remains present, with cautions before opportunities');
  }
  comparisonToggle.click();assert.equal(comparison.open,false,'the comparison can close again without removing any month');
  assert.equal(section.querySelectorAll('.reader-timing-card').length,12);
  assert.equal(h.$('report-content').querySelectorAll('.month-reading').length,12,'the table does not replace the original twelve monthly readings');
  assert.equal(h.$('report-content').querySelector('.portrait-summary-table'),null,'a monthly purchase reveals no lifelong portrait');
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'table navigation never purchases a reading');
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
  assert.match(h.window.document.querySelector('.method-preview').textContent,/성별.*태어난 시간.*10년.*이름.*용신.*신살/);
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
    const sections=topic==='all'?[...expected.sections,...expected.months.map(month=>({...month,id:`month-${month.month}`}))]:topic==='monthly'?expected.months.map(month=>({...month,id:`month-${month.month}`})):expected.sections.filter(section=>section.id===topic);
    const chapters=sections.flatMap(section=>section.chapters.map((chapter,index)=>({chapter,headingId:`reading-${section.id}-chapter-${index+1}`})));
    const articles=[...h.$('report-content').querySelectorAll('.report-chapter')];
    assert.equal(articles.length,chapters.length);
    for (const {chapter,headingId} of chapters) {
      const article=h.$(headingId).closest('.report-chapter');
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
    for (const item of advice) {
      const card=cards.find(value=>value.dataset.adviceId===item.id);
      assert.ok(card,'each month retains its own complete advice');
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
    const includesPortrait=topic==='lifelong'||topic==='all';
    assert.equal(h.$('report-content').querySelectorAll('.person-portrait').length,includesPortrait?1:0,'the personal portrait belongs only to lifelong and full readings');
    assert.equal(h.$('report-content').querySelectorAll('.portrait-summary-table').length,includesPortrait?1:0);
    assert.equal(h.$('report-content').querySelectorAll('.timing-summary-table').length,topic==='monthly'||topic==='all'?1:0,
      'the monthly overview stays inside the opened monthly or full product');
    if(includesPortrait) {
      assert.equal(h.$('report-content').querySelectorAll('.portrait-card').length,5);
      assert.equal(h.$('reading-summary').parentElement,h.$('reading-person-portrait'));
      assert.equal(h.$('reading-topics').parentElement,h.$('reading-person-portrait'));
    }
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

test('saved people restore every birth field, render names as text, and allow edits and deletion without payment',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const host=h.$('saved-profiles'),uses=()=>[...host.querySelectorAll('.profile-picker-use')];
  const save=async()=>{
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled,'profile save did not settle');
  };
  h.fill({name:'한별',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37});
  await save();assert.equal(uses().length,1);
  assert.match(uses()[0].textContent,/한별.*여성.*음력.*윤달.*08:37/);
  host.querySelector('.profile-picker-new').click();
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'');
  assert.equal(host.querySelectorAll('.is-selected').length,0);
  const markup='<img src=x onerror=alert(1)>';
  h.fill({name:markup,gender:'male',year:1994,month:11,day:8,hour:null});
  await save();assert.equal(uses().length,2);
  assert.ok(uses().some(button=>button.textContent.includes(markup)));
  assert.equal(host.querySelector('img,script,[onerror]'),null,'a stored name never becomes markup');
  uses().find(button=>button.textContent.includes('한별')).click();
  assert.equal(h.$('person-name').value,'한별');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'lunar');
  assert.deepEqual(['birth-year','birth-month','birth-day','birth-hour','birth-minute'].map(id=>h.$(id).value),['2023','2','10','8','37']);
  assert.equal(h.$('leap-month').checked,true);assert.equal(h.$('time-unknown').checked,false);
  assert.equal(host.querySelectorAll('.is-selected').length,1);
  h.$('person-name').value='한별 수정';h.change(h.$('person-name'));await save();
  assert.equal(uses().length,2,'saving an edited selected person updates that record');
  assert.ok(uses().some(button=>button.textContent.includes('한별 수정')));
  uses().find(button=>button.textContent.includes(markup)).click();
  assert.equal(h.$('time-unknown').checked,true);assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('leap-month').checked,false);assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'solar');
  host.querySelector('.is-selected .profile-picker-delete').click();
  assert.equal(uses().length,1);assert.equal(host.textContent.includes(markup),false);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('saved people persist on reopening and remain isolated after account changes and sign-out',async t=>{
  const original=await harness({user:PROFILE_USER_A});t.after(original.close);
  original.fill({name:'내가 저장한 사람',gender:'male',hour:4,minute:12});
  original.$('saved-profiles').querySelector('.profile-picker-save').click();
  await waitFor(()=>original.$('saved-profiles').querySelectorAll('.profile-picker-use').length===1);
  const storage=original.window.localStorage;
  const initialStorage=Object.fromEntries(Array.from({length:storage.length},(_,index)=>{const key=storage.key(index);return [key,storage.getItem(key)];}));
  const h=await harness({user:PROFILE_USER_A,initialStorage});t.after(h.close);
  const host=h.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  host.querySelector('.profile-picker-use').click();
  assert.equal(h.$('person-name').value,'내가 저장한 사람');assert.equal(h.$('birth-hour').value,'4');
  h.changeAccount(PROFILE_USER_B);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.textContent.includes('내가 저장한 사람'),false);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('person-gender').value,'');assert.equal(h.$('birth-year').value,'');
  h.changeAccount(PROFILE_USER_A);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.changeAccount(null,false);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.querySelector('.profile-picker-save').disabled,true);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(original.state.starts.length,0);
});

test('a device storage failure is visible and preserves the entered information without claiming a save or charging',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'지워지면 안 되는 입력',gender:'female',hour:8,minute:37});
  const host=h.$('saved-profiles');
  h.window.Storage.prototype.setItem=function(){throw new h.window.DOMException('storage full','QuotaExceededError');};
  host.querySelector('.profile-picker-save').click();
  await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='error');
  const status=host.querySelector('.profile-picker-status');
  assert.match(status.textContent,/저장 공간.*부족/);assert.equal(status.getAttribute('role'),'alert');
  assert.doesNotMatch(status.textContent,/저장했어요/);assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.$('person-name').value,'지워지면 안 되는 입력');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.$('birth-hour').value,'8');assert.equal(h.$('birth-minute').value,'37');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('name and gender edits reuse the original entitlement while the actual ten-year reading follows the selected gender',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'민준',gender:'male',hour:8,minute:37});h.submit();await h.ready();
  assert.equal(h.$('reading-daeun').querySelectorAll('[id^="reading-daeun-period-"]').length,9);
  const firstDaeun=h.$('reading-daeun').textContent,receipt=[...h.state.receipts.values()][0],expiry=receipt.expires_at;
  const firstBirth=JSON.stringify(h.state.starts[0].chart.input);
  assert.equal(h.$('saved-profiles').querySelectorAll('.profile-picker-use').length,1,'opening a reading also saves its entered person');
  h.$('edit-birth').click();
  h.$('person-name').value='민준 이름 수정';h.change(h.$('person-name'));
  h.$('person-gender').value='female';h.change(h.$('person-gender'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  assert.equal(h.state.starts.length,1,'changing display details never purchases automatically');
  h.submit();await h.ready();
  assert.notEqual(h.$('reading-daeun').textContent,firstDaeun);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.equal(h.state.charges,1);
  assert.equal(JSON.stringify(h.state.starts.at(-1).chart.input),firstBirth);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  h.$('edit-birth').click();h.$('person-name').value='<svg/onload=alert(1)>';h.change(h.$('person-name'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
  assert.equal(h.$('birth-summary').querySelector('[onload],script'),null);
  assert.equal(h.$('saved-profiles').querySelector('[onload],script'),null);
  h.pickReport('all',2026);h.$('open-product').click();await h.ready('all',2026);
  assert.equal(h.$('reading-daeun').querySelectorAll('[id^="reading-daeun-period-"]').length,9);
  assert.deepEqual(h.state.chargedAmounts,[10,20],'the ten-year reading adds no fee to lifelong or full access');
});

test('a missing time or an uncertain solar-term minute never renders invented ten-year periods',async t=>{
  for(const input of [
    {name:'시간 모름',gender:'female',year:1990,month:5,day:17,hour:null},
    {name:'절기 경계',gender:'male',year:2024,month:2,day:4,hour:17,minute:27},
  ]) {
    const h=await harness({user:PROFILE_USER_A});t.after(h.close);h.fill(input);h.submit();await h.ready();
    assert.ok(h.$('reading-daeun'));
    assert.equal(h.$('reading-daeun').querySelectorAll('[id^="reading-daeun-period-"]').length,0);
    assert.match(h.$('reading-daeun').textContent,input.hour===null?/태어난 시간/:/절기/);
    assert.equal(h.state.chargedAmounts[0],10);
  }
});

test('unchecking the main unknown-time box leaves hour and minute unselected until both are explicitly entered',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);h.fill({gender:'male',hour:null});
  for(const id of ['birth-hour','birth-minute']) {assert.equal(h.$(id).value,'');assert.equal(h.$(id).required,true);assert.equal(h.$(id).disabled,true);}
  h.$('time-unknown').checked=false;h.change(h.$('time-unknown'));
  assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-hour').value='0';h.change(h.$('birth-hour'));
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-minute').value='0';h.change(h.$('birth-minute'));
  await waitFor(()=>!h.$('open-story').disabled);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.input.hour,0);assert.equal(h.state.starts[0].chart.input.minute,0);
  assert.equal(h.state.starts[0].chart.timeKnown,true);assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('returning to the saju tab refreshes people saved or deleted in another tab without purchasing',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const other=await harness({user:PROFILE_USER_A});t.after(other.close);
  const host=h.$('saved-profiles'),otherHost=other.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  other.fill({name:'다른 탭에서 저장',gender:'female',year:1993,month:7,day:12,hour:9,minute:25});
  otherHost.querySelector('.profile-picker-save').click();
  await waitFor(()=>otherHost.querySelectorAll('.profile-picker-use').length===1);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const saved=other.window.localStorage.getItem(key);assert.ok(saved);
  h.window.localStorage.setItem(key,saved);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'storage synchronization alone does not manipulate the existing DOM');
  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.match(host.querySelector('.profile-picker-use').textContent,/다른 탭에서 저장.*여성.*09:25/);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'','refreshing the list does not fill or purchase a person automatically');
  otherHost.querySelector('.profile-picker-delete').click();
  const deleted=other.window.localStorage.getItem(key);
  if(deleted===null)h.window.localStorage.removeItem(key);else h.window.localStorage.setItem(key,deleted);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.window.dispatchEvent(new h.window.StorageEvent('storage',{key,oldValue:saved,newValue:deleted,storageArea:h.window.localStorage,url:other.window.location.href}));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===0);
  assert.equal(host.textContent.includes('다른 탭에서 저장'),false);
  for(const tab of [h,other]) {assert.equal(tab.state.starts.length,0);assert.equal(tab.state.charges,0);assert.equal(tab.$('result').hidden,true);}
});

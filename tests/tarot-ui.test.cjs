const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const root = path.join(__dirname, '../games/moonlit-tarot');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const unmodule = source => source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const settle = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await settle(); }
  assert.ok(predicate(), 'tarot UI did not finish the expected transition');
}

async function page({ admin = false, opened = [2, 3, 4], paidDay = '2026-11-12', drawn = ['fool', 'magician', 'priestess', 'empress', 'emperor'], pendingTopic = null, initError = false } = {}) {
  const dom = new JSDOM(read('index.html'), { url: 'https://ojjuda.kr/games/moonlit-tarot/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const context = dom.getInternalVMContext();
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const deferred = new Map();
  let nextTimer = -1, clock = Date.parse('2026-11-12T14:59:00Z');
  window.setTimeout = (fn, ms) => {
    if (ms < 2000) return nativeTimeout(fn, Math.min(ms, 2));
    const id = nextTimer--;
    deferred.set(id, { fn, at: clock + ms });
    return id;
  };
  window.clearTimeout = id => { deferred.delete(id); nativeClearTimeout(id); };
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
  window.HTMLElement.prototype.getAnimations = () => [];
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  let shuffle = 0;
  Object.defineProperty(window, 'crypto', { value: { getRandomValues(values) {
    shuffle++;
    values.forEach((_, i) => { values[i] = (i * 2654435761 + shuffle * 2000000000) >>> 0; });
    return values;
  } } });
  Object.assign(window, createTarotLoader(context)('readings.js'));
  window.getTarotPrice = createTarotLoader(context)('payment.js').getTarotPrice;
  window.TarotFX = class { setMood() {} setReducedMotion() {} burst() {} trail() {} };
  window.TarotAudio = class { play() {} setMuted() {} };
  const receipt = {
    topic: 'love', reading_day: paidDay, request_id: 'paid-original',
    reset_at: new Date(clock + 86400000).toISOString(), drawn, discarded: [0, 1], openOrder: opened
  };
  let payment, revelations = 0;
  window.TarotRevelation = class { play() { revelations++; return Promise.resolve(true); } cancel() {} };
  window.TarotPayment = class {
    constructor(options) {
      payment = this;
      this.options = options; this.enabled = true; this.adminPreview = admin;
      this.user = 'account'; this.balance = 40; this.starts = 0; this.saves = 0;
      this.record = { paid: !pendingTopic, requestId: receipt.request_id, resetAt: receipt.reset_at, readingDay: paidDay, topic: pendingTopic || receipt.topic };
      this.resetAt = receipt.reset_at;
    }
    async init() {
      if (pendingTopic) {
        if (initError) throw Error('연결을 다시 확인해 주세요.');
        return { signedIn: true, pending: { topic: pendingTopic } };
      }
      return this.adminPreview ? { signedIn: true, preview: true, adminPreview: true } : { signedIn: true, resume: receipt };
    }
    async refreshAdminMode() { return this.adminPreview; }
    now() { return clock; }
    async refreshToday() { this.resetAt = clock < Date.parse(receipt.reset_at) ? receipt.reset_at : new Date(clock + 86400000).toISOString(); }
    receiptFor(topic) { return !this.adminPreview && topic === receipt.topic && clock < Date.parse(receipt.reset_at) ? receipt : null; }
    async start() { this.starts++; return this.adminPreview ? null : receipt; }
    async save() { this.saves++; return null; }
    clearRecord() { this.record = null; }
    newReading() { if (!this.adminPreview) this.record = null; }
    switchMode(value) { this.adminPreview = value; this.options.onModeChange({ adminPreview: value }); }
  };
  vm.runInContext(unmodule(read('app.js')), context);
  await until(() => !window.document.querySelector('#summon-button').disabled);
  const $ = selector => window.document.querySelector(selector);
  const click = selector => $(selector).click();
  const chooseCategory = value => {
    const select = $('#summary-domain-category');
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const closeReading = () => { if ($('#reading-dialog').open) $('#reading-dialog').close(); };
  const phase = name => $('#app').dataset.phase === name;
  const advanceTime = async (ms, { runTimers = true } = {}) => {
    clock += ms;
    if (runTimers) {
      for (const [id, task] of [...deferred]) {
        if (task.at <= clock && deferred.delete(id)) task.fn();
      }
    }
    await settle();
  };
  return { dom, window, $, click, chooseCategory, closeReading, phase, payment, receipt, advanceTime, revelations: () => revelations };
}

(async () => {
  // Reopening today's completed reading must point the lower panel at the whole spread.
  const completed = await page();
  const completedCards = completed.receipt.openOrder.map(index => completed.window.DECK.find(card => card.id === completed.receipt.drawn[index]));
  const completedSummary = completed.window.getSummary(completedCards, 'love');
  const expected = completedSummary.oneLine;
  assert.notEqual(completed.$('#oracle-text').textContent, expected, 'combined fortune stays hidden until the revelation');
  assert.equal(completed.$('#oracle-card-name').hidden, true);
  assert.equal(completed.$('#oracle-keyword').hidden, true);
  assert.equal(completed.$('#reading-open span').textContent, '종합 점괘 자세히 보기');
  completed.click('#reading-open');
  await until(() => completed.$('#result-dialog').open);
  assert.equal(completed.$('#oracle-text').textContent, expected, 'combined one-line reading appears after the revelation');
  assert.equal(completed.revelations(), 1, 'lower combined CTA uses the revelation before the full result');
  assert.equal(completed.$('#reading-dialog').open, false);
  assert.equal(completed.$('.tarot-price span').textContent, '세 장의 풀이 · 종합 점괘 · 50가지 주제');
  assert.deepEqual(Array.from(completedSummary.groups, group => group.id), ['problem', 'timeline', 'domains']);
  assert.equal(completed.$('#summary-tab-problem').getAttribute('aria-selected'), 'true', 'the problem-solving view is the default');
  assert.equal(completed.$('#summary-panel-problem').hidden, false);
  assert.equal(completed.$('#summary-panel-timeline').hidden, true);
  assert.equal(completed.$('#summary-panel-domains').hidden, true);
  let dividedSections = 0;
  for (const group of completedSummary.groups) {
    const tab = completed.$(`#summary-tab-${group.id}`);
    const panel = completed.$(`#summary-panel-${group.id}`);
    assert.equal(tab.textContent, group.label);
    assert.equal(tab.getAttribute('aria-controls'), panel.id);
    assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    const sections = [...panel.querySelectorAll('.reading-part')];
    assert.equal(sections.length, group.sections.length, 'every interpretation section is included');
    if (group.id !== 'domains') assert.ok(sections.every(section => !section.hidden), 'the problem and timeline readings keep every section visible');
    group.sections.forEach((section, index) => {
      assert.ok(sections[index].querySelector('h3').textContent.endsWith(section.title));
      if (section.number) assert.equal(Number(sections[index].querySelector('.reading-part-number').textContent), section.number);
      const paragraphs = [...sections[index].querySelectorAll('p')].map(node => node.textContent);
      assert.equal(paragraphs.join(''), Array.from(section.paragraphs).join(''), 'visual paragraph breaks preserve every original character and its order');
      assert.ok(paragraphs.length >= section.paragraphs.length);
      if (paragraphs.length > section.paragraphs.length) dividedSections++;
      assert.equal(sections[index].closest('details'), null, 'the main interpretation is not hidden in expandable details');
    });
  }
  assert.ok(dividedSections > 0, 'long section paragraphs are divided into shorter reading blocks');
  const emphasizedCards = [...completed.$('#summary-text').querySelectorAll('.reading-card-name')];
  assert.ok(emphasizedCards.length > 0);
  assert.ok(emphasizedCards.every(node => completedCards.some(card => node.textContent.includes(card.name))), 'only the actual drawn card names receive emphasis');
  completed.click('#summary-tab-timeline');
  assert.equal(completed.$('#summary-panel-timeline').hidden, false, 'clicking the second tab opens the past, present and future reading');
  assert.equal(completed.$('#summary-panel-problem').hidden, true);
  assert.equal(completed.$('#summary-tab-timeline').getAttribute('aria-selected'), 'true');
  completed.$('#summary-tab-timeline').focus();
  completed.$('#summary-tab-timeline').dispatchEvent(new completed.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(completed.window.document.activeElement.id, 'summary-tab-problem');
  assert.equal(completed.$('#summary-panel-problem').hidden, false, 'arrow keys move focus and select the matching panel');
  completed.$('#summary-tab-problem').dispatchEvent(new completed.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(completed.window.document.activeElement.id, 'summary-tab-domains');
  assert.equal(completed.$('#summary-panel-domains').hidden, false);
  assert.equal(completed.$('#summary-tab-problem').tabIndex, -1);
  const domainGroup = completedSummary.groups.find(group => group.id === 'domains');
  const domainSections = [...completed.$('#summary-panel-domains').querySelectorAll('.reading-part')];
  const domainSelect = completed.$('#summary-domain-category');
  assert.equal(domainSections.length, 50, 'all fifty original readings stay in the DOM');
  assert.deepEqual(domainSections.map(section => Number(section.querySelector('.reading-part-number').textContent)), Array.from({ length: 50 }, (_, index) => index + 1), 'topic numbers retain their original sequence');
  assert.deepEqual(Array.from(domainGroup.categories, category => [category.id, category.count]), [['self', 5], ['timeline', 5], ['solutions', 5], ['love', 7], ['family', 4], ['career', 5], ['study', 5], ['money', 5], ['wellbeing', 4], ['opportunities', 5]]);
  assert.equal(domainSelect.labels[0].textContent, '풀이 분야');
  assert.equal(domainSelect.options.length, 10);
  assert.equal(domainSelect.value, 'self');
  assert.equal(completed.$('#summary-domain-total').textContent, '50개 풀이 · 10개 분야');
  assert.equal(completed.$('#summary-domain-basis').open, false);
  assert.equal(completed.$('#summary-domain-basis summary').textContent, '풀이 기준');
  assert.equal(completed.$('#summary-domain-basis p').textContent, domainGroup.description);
  const visitedTopics = new Set();
  for (const category of domainGroup.categories) {
    completed.chooseCategory(category.id);
    assert.equal(domainSelect.value, category.id);
    assert.equal(domainSelect.selectedOptions[0].textContent, `${category.label} · ${category.count}개`, 'the selected category and item count are clear');
    const visible = domainSections.filter(section => !section.hidden);
    assert.equal(visible.length, category.count);
    assert.ok(visible.every(section => section.dataset.categoryId === category.id));
    for (const section of visible) visitedTopics.add(section.dataset.sectionId);
    assert.equal(completed.$('#summary-domain-sections').querySelectorAll('.reading-part').length, 50, 'changing categories hides other sections without removing their original text');
  }
  assert.equal(visitedTopics.size, 50, 'every topic can be reached through the ten categories');
  completed.chooseCategory('money');
  completed.$('#summary-tab-domains').dispatchEvent(new completed.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(completed.window.document.activeElement.id, 'summary-tab-problem');
  completed.click('#summary-tab-domains');
  assert.equal(completed.$('#summary-panel-domains').hidden, false, 'the domain view also responds to an actual click');
  assert.equal(completed.payment.starts, 0, 'switching reading views never starts another purchase');
  assert.equal(completed.payment.record.topic, 'love', 'domain readings keep the original paid topic');
  assert.equal(completed.$('#summary-synthesis'), null, 'the older synthesis is not repeated after the grouped interpretation');
  assert.equal(completed.$('#summary-ritual').textContent, completedSummary.ritual);
  assert.equal(completed.$('.result-takeaway'), null, 'the full summary is not preceded by a duplicate takeaway box');
  let copiedResult = '';
  Object.defineProperty(completed.window.navigator, 'clipboard', { value: { async writeText(text) { copiedResult = text; } } });
  completed.click('#copy-result');
  await settle();
  const expectedCopy = ['오쭈다 · 달의 마녀 타로', '종합 점괘', completed.$('#result-date').textContent, ''];
  for (const group of completedSummary.groups) {
    expectedCopy.push(group.label, '');
    if (group.description) expectedCopy.push(group.description, '');
    const appendExpected = section => {
      expectedCopy.push(section.number ? `${section.number}. ${section.title}` : section.title);
      if (section.subtitle) expectedCopy.push(section.subtitle);
      for (const paragraph of section.paragraphs) expectedCopy.push(paragraph, '');
    };
    if (group.categories?.length) {
      for (const category of group.categories) {
        expectedCopy.push(category.label, '');
        group.sections.filter(section => section.categoryId === category.id).forEach(appendExpected);
      }
    } else group.sections.forEach(appendExpected);
  }
  expectedCopy.push(`이렇게 해 보세요: ${completedSummary.ritual}`, '', '타로의 전통 해석이에요. 미래를 확정하지 않아요.');
  assert.equal(copiedResult, expectedCopy.join('\n'), 'copy includes all three groups in order, including inactive groups, and the common practical advice once');
  assert.equal(copiedResult.split(completedSummary.ritual).length - 1, 1);
  assert.equal(copiedResult.split(domainGroup.description).length - 1, 1);
  const copiedLines = copiedResult.split('\n');
  for (const category of domainGroup.categories) assert.equal(copiedLines.filter(line => line === category.label).length, 1, 'each category heading is copied once');
  for (const section of domainGroup.sections) assert.equal(copiedLines.filter(line => line === `${section.number}. ${section.title}`).length, 1, 'all fifty numbered topics are copied once regardless of the selected category');
  completed.$('#result-dialog').close();
  completed.click('.card[data-index="2"]');
  assert.equal(completed.$('#reading-dialog').open, true, 'opened cards retain their individual explanations');
  const firstReading = completed.window.getReading(completedCards[0], 'love', 0);
  assert.equal(completed.$('#reading-position').textContent, '첫 번째 자리 · 지금의 문제');
  assert.equal(completed.$('#reading-introduction').textContent, firstReading.introduction);
  assert.equal(completed.$('#reading-title').textContent, firstReading.displayName);
  assert.ok(completed.$('#reading-introduction').compareDocumentPosition(completed.$('#reading-art')) & completed.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the position explanation comes before the actual card');
  const readingParagraphs = [...completed.window.document.querySelectorAll('#reading-sections > p')];
  assert.ok(readingParagraphs.length >= firstReading.paragraphs.length, 'the conversational explanation keeps its full detail');
  assert.equal(readingParagraphs.map(node => node.textContent).join(''), Array.from(firstReading.paragraphs).join(''), 'individual card paragraphs also preserve the original text exactly');
  assert.ok(completed.$('#reading-introduction .reading-card-name').textContent.includes(firstReading.displayName));
  assert.ok(firstReading.example && completed.$('#reading-sections').textContent.includes(firstReading.example), 'the selected-topic example remains in the main explanation');
  assert.equal(completed.$('#reading-sections h3'), null, 'the main explanation flows in paragraphs without repeated section headings');
  assert.equal(completed.$('#reading-summary'), null, 'the individual reading has no duplicate one-line box');
  assert.equal(completed.$('#reading-card-detail').hidden, false);
  assert.equal(completed.$('#reading-card-detail').open, false, 'card-specific reference details start collapsed');
  const cardDetails = [...completed.window.document.querySelectorAll('#reading-detail-sections .reading-part')];
  assert.ok(cardDetails.length > 0, 'the original card meanings and cautions remain available');
  for (const section of cardDetails) {
    assert.equal(section.children[0].tagName, 'H3');
    assert.equal(section.children[1].tagName, 'H4');
    assert.ok(section.children[1].textContent.length > 0);
    assert.equal(section.children[2].tagName, 'P');
  }
  assert.equal(completed.$('#oracle-text').textContent, expected, 'individual modal does not replace the combined lower panel');
  completed.$('#reading-card-detail').open = true;
  completed.closeReading();
  for (const [index, role] of [[3, '현재 상황'], [4, '해결 방법과 결과']]) {
    completed.click(`.card[data-index="${index}"]`);
    assert.ok(completed.$('#reading-position').textContent.endsWith(role), 'individual card roles match the primary problem-solving reading');
    assert.equal(completed.$('#reading-card-detail').open, false, 'changing cards closes the previous reference details');
    completed.closeReading();
  }
  completed.click('#reading-open');
  await until(() => completed.$('#result-dialog').open);
  completed.payment.switchMode(true);
  assert.equal(completed.phase('intro'), true);
  assert.equal(completed.$('#summary-domain-category'), null, 'a mode change removes the category control and paid text');
  assert.equal(completed.$('#summary-domain-basis'), null);
  completed.dom.window.close();

  // Extra reference notes follow the actual card and disappear on other cards.
  const references = await page({ drawn: ['magician', 'empress', 'star', 'cups_six', 'fool'] });
  references.click('.card[data-index="2"]');
  assert.equal(references.$('#reading-name-help').hidden, true);
  assert.equal(references.$('#reading-source-note').hidden, false);
  assert.match(references.$('#reading-source-note-body').textContent, /부족함/);
  assert.match(references.$('#reading-source-note-link').href, /Part_3$/);
  references.closeReading();
  references.click('.card[data-index="3"]');
  const cupsReading = references.window.getReading(references.window.DECK.find(card => card.id === 'cups_six'), 'love', 1);
  assert.equal(references.$('#reading-title').textContent, cupsReading.displayName, 'numbered cards use the plain Korean display name');
  assert.equal(references.$('#reading-name-help').hidden, false);
  assert.match(references.$('#reading-name-guide').textContent, /컵은 잔/);
  assert.match(references.$('#reading-source-note-body').textContent, /추억/);
  references.closeReading();
  references.click('.card[data-index="4"]');
  assert.equal(references.$('#reading-name-help').hidden, true);
  assert.equal(references.$('#reading-source-note').hidden, true);
  assert.equal(references.$('#reading-source-note-body').textContent, '');
  assert.equal(references.$('#reading-source-note-link').hasAttribute('href'), false);
  references.dom.window.close();

  for (const [pendingTopic, initError] of [['love', false], ['money', true]]) {
    const recovery = await page({ pendingTopic, initError });
    assert.equal(recovery.$('[data-topic].active').dataset.topic, pendingTopic);
    assert.equal(recovery.$('.tarot-price strong').textContent, '1회 10쭈', 'the price follows the recovered topic');
    if (initError) assert.equal(recovery.$('#payment-status').textContent, '연결을 다시 확인해 주세요.', 'price refresh does not hide recovery errors');
    recovery.dom.window.close();
  }

  // Before the last card, the lower CTA still shows the selected card's explanation.
  const partial = await page({ opened: [2] });
  assert.equal(partial.$('#reading-open span').textContent, '이 카드의 이야기 자세히 읽기');
  partial.click('#reading-open');
  assert.equal(partial.$('#reading-dialog').open, true);
  assert.equal(partial.$('#result-dialog').open, false);
  partial.closeReading();
  partial.click('.card[data-index="3"]');
  await until(() => partial.phase('reading') && partial.$('#reading-dialog').open);
  partial.closeReading();
  partial.click('.card[data-index="4"]');
  await until(() => partial.phase('complete') && partial.$('#reading-dialog').open);
  assert.equal(partial.$('#reading-open span').textContent, '종합 점괘 자세히 보기', 'the third reveal changes the lower CTA');
  assert.equal(partial.$('#oracle-card-name').hidden, true);
  partial.closeReading();
  partial.click('#reading-open');
  await until(() => partial.$('#result-dialog').open);
  partial.dom.window.close();

  // Admin preview starts fresh, repeats, and keeps the actual paid reading intact.
  const admin = await page({ admin: true, paidDay: '2000-01-01' });
  const originalRecord = admin.payment.record;
  assert.equal(admin.phase('intro'), true);
  assert.equal(admin.$('.tarot-price strong').textContent, '관리자 모드');
  assert.equal(admin.$('#summon-button span').textContent, '새 카드로 운세 시작하기');
  admin.click('#summon-button');
  await until(() => admin.phase('discard'));
  const firstDraw = [...admin.window.document.querySelectorAll('.front-title strong')].map(node => node.textContent);
  admin.click('.card[data-index="0"]');
  await until(() => admin.phase('discard'));
  admin.click('.card[data-index="1"]');
  await until(() => admin.phase('reading'));
  for (const index of [2, 3, 4]) {
    admin.click(`.card[data-index="${index}"]`);
    await until(() => admin.$('#reading-dialog').open);
    admin.closeReading();
  }
  assert.equal(admin.phase('complete'), true);
  assert.ok(!admin.$('#result-date').textContent.includes('2000'), 'preview does not display a paused paid receipt date');
  admin.click('#reading-open');
  await until(() => admin.$('#result-dialog').open);
  assert.equal(admin.$('#restart-result span').textContent, '새 운세 보기');
  admin.click('#restart-result');
  assert.equal(admin.phase('intro'), true);
  assert.equal(admin.$('#summary-domain-category'), null, 'starting over clears the previous category selection');
  assert.equal(admin.payment.record, originalRecord);
  admin.click('#summon-button');
  await until(() => admin.phase('discard'));
  const secondDraw = [...admin.window.document.querySelectorAll('.front-title strong')].map(node => node.textContent);
  assert.notDeepEqual(secondDraw, firstDraw, 'repeat uses a new shuffled draw');
  assert.equal(admin.payment.starts, 2);
  admin.payment.switchMode(false);
  assert.equal(admin.phase('intro'), true, 'turning off admin mode cancels the active preview');
  assert.equal(admin.payment.record, originalRecord, 'turning off preview preserves the original paid record');
  assert.equal(admin.$('.tarot-price strong').textContent, '1회 30쭈');
  admin.click('[data-topic="money"]');
  assert.equal(admin.$('.tarot-price strong').textContent, '1회 10쭈');
  assert.equal(admin.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  admin.click('[data-topic="overall"]');
  assert.equal(admin.$('#summon-button span').textContent, '30쭈로 운세 시작하기');
  assert.equal(admin.$('#daily-limit-note').textContent, '결제 후 24시간 이용 · 만료 후 재결제');
  assert.equal(admin.$('#reading-open').hidden, true);
  assert.equal(admin.$('#reading-open span').textContent, '이 카드의 이야기 자세히 읽기');
  admin.dom.window.close();

  // Crossing midnight keeps the purchased reading; exactly 24 hours closes it.
  const expires = await page();
  expires.click('#reading-open');
  await until(() => expires.$('#result-dialog').open);
  await expires.advanceTime(120000);
  expires.window.dispatchEvent(new expires.window.Event('focus'));
  await settle();
  assert.equal(expires.phase('complete'), true, 'Korean midnight does not end a 24-hour purchase');
  assert.equal(expires.$('#result-dialog').open, true);
  await expires.advanceTime(86400000 - 120000 - 1);
  assert.equal(expires.$('#result-dialog').open, true, 'reading remains open immediately before expiry');
  await expires.advanceTime(1);
  await until(() => expires.phase('intro'));
  assert.equal(expires.$('#result-dialog').open, false);
  for (const id of ['summary-tabs', 'summary-text', 'summary-ritual']) assert.equal(expires.$(`#${id}`).textContent, '', 'expiry removes all reading groups, their tabs and the common advice');
  assert.equal(expires.$('#summary-text').childElementCount, 0);
  assert.equal(expires.$('#summary-domain-category'), null);
  assert.equal(expires.$('#summary-domain-basis'), null);
  assert.ok([...expires.window.document.querySelectorAll('.front-title strong')].every(node => node.textContent === ''));
  assert.equal(expires.payment.record, null);
  assert.equal(expires.payment.starts, 0, 'expiry never automatically purchases a new reading');
  assert.equal(expires.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  assert.match(expires.$('#payment-status').textContent, /만료.*다시 결제/);
  expires.dom.window.close();

  // A suspended tab can miss its timer; direct card/result actions still expire.
  for (const action of ['.card[data-index="2"]', '#reading-open', '#copy-result', '#summary-tab-timeline', '#summary-tab-domains', '#summary-domain-category']) {
    const suspended = await page();
    if (action === '#copy-result' || action.startsWith('#summary-tab-') || action === '#summary-domain-category') {
      suspended.click('#reading-open');
      await until(() => suspended.$('#result-dialog').open);
      if (action === '#summary-domain-category') suspended.click('#summary-tab-domains');
    }
    await suspended.advanceTime(86400000, { runTimers: false });
    if (action === '#summary-domain-category') suspended.chooseCategory('money');
    else suspended.click(action);
    await until(() => suspended.phase('intro'));
    assert.equal(suspended.$('#reading-dialog').open, false);
    assert.equal(suspended.$('#result-dialog').open, false);
    assert.equal(suspended.$('#summary-tabs').childElementCount, 0);
    assert.equal(suspended.$('#summary-text').childElementCount, 0);
    assert.equal(suspended.$('#summary-domain-category'), null);
    assert.equal(suspended.payment.starts, 0);
    suspended.dom.window.close();
  }

  // Returning to an expired tab removes already visible individual explanations.
  const returned = await page({ opened: [2] });
  returned.click('#reading-open');
  assert.equal(returned.$('#reading-dialog').open, true);
  await returned.advanceTime(86400000, { runTimers: false });
  returned.window.dispatchEvent(new returned.window.Event('pageshow'));
  await until(() => returned.phase('intro'));
  assert.equal(returned.$('#reading-dialog').open, false);
  for (const id of ['reading-introduction', 'reading-title', 'reading-sections', 'reading-detail-sections']) assert.equal(returned.$(`#${id}`).textContent, '', 'expiry also removes the position explanation and collapsed card details');
  returned.dom.window.close();

  // Another topic's earlier expiry must not close this topic's valid reading.
  const independent = await page();
  independent.payment.resetAt = new Date(independent.payment.now() + 60000).toISOString();
  await independent.advanceTime(60001);
  independent.window.dispatchEvent(new independent.window.Event('focus'));
  await settle();
  assert.equal(independent.phase('complete'), true);
  assert.ok(independent.payment.record);
  independent.dom.window.close();

  // A suspended intro still showing a free CTA cannot silently become a charge.
  const staleFree = await page();
  staleFree.click('#restart-small');
  await until(() => staleFree.phase('intro'));
  await settle();
  assert.equal(staleFree.payment.record, null);
  assert.equal(staleFree.$('#summon-button span').textContent, '점괘 다시 보기');
  assert.equal(staleFree.$('#summon-button').dataset.replay, 'true');
  await staleFree.advanceTime(86400000, { runTimers: false });
  assert.equal(staleFree.$('#summon-button').dataset.replay, 'true', 'the suspended page still displays the old free action');
  staleFree.click('#summon-button');
  await settle();
  assert.equal(staleFree.payment.starts, 0, 'the stale free click does not invoke billing');
  assert.equal(staleFree.phase('intro'), true);
  assert.equal(staleFree.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  assert.match(staleFree.$('#payment-status').textContent, /만료.*다시 결제/);
  staleFree.dom.window.close();

  // An earlier topic's refresh can hang; this reading still expires locally.
  const hungRefresh = await page();
  hungRefresh.click('#reading-open');
  await until(() => hungRefresh.$('#result-dialog').open);
  let releaseStatus;
  const blockedStatus = new Promise(resolve => { releaseStatus = resolve; });
  hungRefresh.payment.resetAt = new Date(hungRefresh.payment.now() + 60000).toISOString();
  hungRefresh.payment.refreshToday = () => blockedStatus;
  hungRefresh.window.dispatchEvent(new hungRefresh.window.Event('focus'));
  await settle();
  await hungRefresh.advanceTime(60000);
  assert.equal(hungRefresh.phase('complete'), true, 'the first topic deadline does not expire this result');
  await hungRefresh.advanceTime(86400000 - 60000);
  await until(() => hungRefresh.phase('intro'));
  assert.equal(hungRefresh.$('#result-dialog').open, false, 'local expiry does not wait for the hanging RPC');
  assert.equal(hungRefresh.$('#summary-text').textContent, '');
  assert.equal(hungRefresh.$('#summary-tabs').textContent, '');
  assert.equal(hungRefresh.payment.starts, 0);
  releaseStatus();
  await settle();
  hungRefresh.dom.window.close();

  // A delayed clipboard rejection cannot recreate the cleared reading as a textarea.
  const delayedCopy = await page();
  delayedCopy.click('#reading-open');
  await until(() => delayedCopy.$('#result-dialog').open);
  let rejectCopy, copyCalls = 0;
  Object.defineProperty(delayedCopy.window.navigator, 'clipboard', { value: {
    writeText(text) {
      assert.ok(text.includes('종합 점괘'));
      copyCalls++;
      return new Promise((_resolve, reject) => { rejectCopy = reject; });
    }
  } });
  delayedCopy.window.document.execCommand = () => false;
  delayedCopy.click('#copy-result');
  assert.equal(copyCalls, 1);
  await delayedCopy.advanceTime(86400000);
  await until(() => delayedCopy.phase('intro'));
  rejectCopy(new Error('clipboard permission denied after expiry'));
  await settle();
  assert.equal(delayedCopy.$('#result-dialog').open, false);
  assert.equal(delayedCopy.$('#result-dialog').querySelectorAll('textarea').length, 0);
  assert.equal(delayedCopy.$('#summary-text').textContent, '');
  assert.equal(delayedCopy.$('#summary-tabs').textContent, '');
  assert.equal(delayedCopy.payment.starts, 0);
  delayedCopy.dom.window.close();

  const freePreview = await page({ admin: true });
  freePreview.click('#summon-button');
  await until(() => freePreview.phase('discard'));
  await freePreview.advanceTime(86400001);
  freePreview.window.dispatchEvent(new freePreview.window.Event('focus'));
  await settle();
  assert.equal(freePreview.phase('discard'), true, 'administrator preview has no paid expiry');
  freePreview.dom.window.close();
  console.log('PASS tarot UI: fifty topics in ten categories, complete original copy, readable card explanations, tabs, preview mode, rolling 24-hour expiry, suspended changes, hung status, delayed clipboard and no automatic repurchase');
})().catch(error => { console.error(error); process.exitCode = 1; });

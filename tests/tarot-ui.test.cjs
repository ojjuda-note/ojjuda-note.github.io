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

async function page({ admin = false, fresh = false, topic = 'love', discarded = [0, 1], opened = [2, 3, 4], paidDay = '2026-11-12', drawn = ['fool', 'magician', 'priestess', 'empress', 'emperor'], pendingTopic = null, initError = false } = {}) {
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
  const load = createTarotLoader(context);
  Object.assign(window, load('readings.js'));
  Object.assign(window, load('reading-summary-view.js'));
  window.getTarotPrice = load('payment.js').getTarotPrice;
  Object.assign(window, load('personal-reading.js'));
  Object.assign(window, load('reading-pages.js'));
  Object.assign(window, load('reading-reader.js'));
  window.createPersonalReading = load('personal-reading-ui.js').createPersonalReading;
  window.TarotFX = class { setMood() {} setReducedMotion() {} burst() {} trail() {} };
  window.TarotAudio = class { play() {} setMuted() {} };
  const receipt = {
    topic, reading_day: paidDay, request_id: 'paid-original',
    reset_at: new Date(clock + 86400000).toISOString(), drawn, discarded: [...discarded], openOrder: [...opened]
  };
  let payment, revelations = 0;
  window.TarotRevelation = class { play() { revelations++; return Promise.resolve(true); } cancel() {} };
  window.TarotPayment = class {
    constructor(options) {
      payment = this;
      this.options = options; this.enabled = true; this.adminPreview = admin;
      this.user = 'account'; this.balance = 40; this.starts = 0; this.saves = 0;
      this.savedProgress = [];
      this.record = fresh ? null : { paid: !pendingTopic, requestId: receipt.request_id, resetAt: receipt.reset_at, readingDay: paidDay, topic: pendingTopic || receipt.topic };
      this.resetAt = receipt.reset_at;
    }
    async init() {
      if (pendingTopic) {
        if (initError) throw Error('연결을 다시 확인해 주세요.');
        return { signedIn: true, pending: { topic: pendingTopic } };
      }
      return this.adminPreview ? { signedIn: true, preview: true, adminPreview: true }
        : fresh ? { signedIn: true } : { signedIn: true, resume: receipt };
    }
    async refreshAdminMode() { return this.adminPreview; }
    now() { return clock; }
    async refreshToday() { this.resetAt = clock < Date.parse(receipt.reset_at) ? receipt.reset_at : new Date(clock + 86400000).toISOString(); }
    receiptFor(topic) { return !this.adminPreview && (!fresh || this.starts > 0) && topic === receipt.topic && clock < Date.parse(receipt.reset_at) ? receipt : null; }
    async start() {
      this.starts++;
      if (!this.adminPreview && !this.record) this.record = { paid: true, requestId: receipt.request_id, resetAt: receipt.reset_at, readingDay: paidDay, topic: receipt.topic };
      return this.adminPreview ? null : receipt;
    }
    async save(value) {
      this.saves++;
      if (this.adminPreview) return null;
      const next = { discarded: Array.from(value.discarded), openOrder: Array.from(value.openOrder) };
      assert.ok(next.discarded.length <= 2 && next.openOrder.length <= 3, 'the UI respects the existing server progress sizes');
      assert.ok([...next.discarded, ...next.openOrder].every(index => Number.isInteger(index) && index >= 0 && index < 5));
      assert.equal(new Set([...next.discarded, ...next.openOrder]).size, next.discarded.length + next.openOrder.length, 'chosen and excluded cards never overlap or repeat');
      assert.ok(!next.openOrder.length || next.discarded.length === 2, 'all exclusions are committed before a card is revealed');
      assert.ok(receipt.discarded.every((index, slot) => next.discarded[slot] === index), 'legacy exclusions keep their saved prefix');
      assert.ok(receipt.openOrder.every((index, slot) => next.openOrder[slot] === index), 'revealing another card preserves the existing reading order');
      this.savedProgress.push(next);
      receipt.discarded = [...next.discarded];
      receipt.openOrder = [...next.openOrder];
      return null;
    }
    clearRecord() { this.record = null; }
    newReading() { if (!this.adminPreview) this.record = null; }
    switchMode(value) { this.adminPreview = value; this.options.onModeChange({ adminPreview: value }); }
  };
  vm.runInContext(unmodule(read('app.js')), context);
  await until(() => !window.document.querySelector('#summon-button').disabled);
  const $ = selector => window.document.querySelector(selector);
  const click = selector => $(selector).click();
  const chooseContext = (value, id = 'result-context-select') => {
    const select = $('#' + id);
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
  return { dom, window, $, click, chooseContext, closeReading, phase, payment, receipt, advanceTime, load, revelations: () => revelations };
}


const compact = value => String(value).replace(/\s/gu, '');
const cardIds = view => view.receipt.openOrder.map(index => view.window.DECK.find(card => card.id === view.receipt.drawn[index]));
const pageNode = (view, prefix = 'result') => view.$('#' + prefix + '-reader-page');
const currentId = (view, prefix = 'result') => pageNode(view, prefix)?.dataset.pageId;
const modelFor = (view, personalReport = null) => view.window.buildSummaryPages(
  view.window.getSummary(cardIds(view), view.receipt.topic), { cards: cardIds(view), personalReport }
);
const snapshotPurchase = view => JSON.stringify({
  receipt: view.receipt, record: view.payment.record, starts: view.payment.starts, saves: view.payment.saves
});
function openMenu(view, prefix = 'result') {
  if (view.$('#' + prefix + '-reader-menu').hidden) view.click('#' + prefix + '-reader-menu-toggle');
}
function jump(view, id, prefix = 'result') {
  openMenu(view, prefix);
  view.click('#' + prefix + '-reader-menu [data-reader-target="' + id + '"]');
  assert.equal(currentId(view, prefix), id, 'the chapter menu opens its first page');
  assert.equal(view.$('#' + prefix + '-reader-menu').hidden, true, 'choosing a chapter returns to its reading');
}
async function openResult(view) {
  view.click('#action-button');
  await until(() => view.$('#result-dialog').open);
}
function assertPage(view, expected, prefix = 'result') {
  const page = pageNode(view, prefix);
  assert.equal(page.dataset.pageId, expected.id);
  assert.equal(page.dataset.chapterId, expected.chapterId);
  assert.equal(page.dataset.groupId, expected.groupId);
  assert.equal(view.$('#' + prefix + '-title').textContent, expected.title);
  assert.equal(view.window.document.querySelectorAll('#' + prefix + '-reader-body [data-page-id]').length, 1,
    'exactly one current reading page is mounted');
  assert.equal([...page.querySelectorAll('.reader-paragraph')].map(node => node.textContent).join(''),
    Array.from(expected.paragraphs || []).join(''), 'the current page displays every original paragraph in order');
  assert.deepEqual([...page.querySelectorAll('.reader-summary-line')].map(node => node.textContent),
    Array.from(expected.summaryLines || []), 'the selected summary meaning units remain complete');
  assert.ok(view.$('#' + prefix + '-reader-count').textContent.trim(), 'the reader reports its position');
}
function assertAllPages(view, pages, prefix = 'result') {
  assert.ok(pages.length > 1);
  const chapters = pages.filter((item, index) => !index || item.chapterId !== pages[index - 1].chapterId);
  const before = snapshotPurchase(view);
  openMenu(view, prefix);
  const entries = [...view.$('#' + prefix + '-reader-menu').querySelectorAll('[data-reader-target]')];
  assert.deepEqual(entries.map(button => button.dataset.readerTarget).sort(), Array.from(chapters, chapter => chapter.id).sort(),
    'every chapter is directly reachable once, including source material');
  view.click('#' + prefix + '-reader-menu-toggle');
  jump(view, pages[0].id, prefix);
  assert.equal(view.$('#' + prefix + '-reader-prev').disabled, true);
  const visited = [];
  for (const [index, expected] of pages.entries()) {
    assertPage(view, expected, prefix);
    const chapterPages = pages.filter(item => item.chapterId === expected.chapterId);
    const progress = view.$('#' + prefix + '-reader-progress');
    assert.equal(Number(progress.getAttribute('aria-valuemax')), chapterPages.length);
    assert.equal(Number(progress.getAttribute('aria-valuenow')), chapterPages.findIndex(item => item.id === expected.id) + 1);
    visited.push(expected.id);
    if (index < pages.length - 1) {
      assert.equal(view.$('#' + prefix + '-reader-next').disabled, false);
      view.click('#' + prefix + '-reader-next');
    }
  }
  assert.deepEqual(visited, Array.from(pages, item => item.id), 'next visits every page once in source order');
  view.click('#' + prefix + '-reader-prev');
  assertPage(view, pages[pages.length - 2], prefix);
  view.click('#' + prefix + '-reader-next');
  assertPage(view, pages[pages.length - 1], prefix);
  jump(view, chapters[Math.floor(chapters.length / 2)].id, prefix);
  openMenu(view, prefix);
  const current = view.$('#' + prefix + '-reader-menu [aria-current="page"]');
  assert.equal(current.dataset.readerTarget, chapters[Math.floor(chapters.length / 2)].id);
  view.click('#' + prefix + '-reader-menu-toggle');
  assert.equal(snapshotPurchase(view), before, 'reading, paging and chapter jumps do not purchase, save, redraw or extend the receipt');
}
function assertCleared(view) {
  for (const prefix of ['result', 'reading']) {
    assert.equal(view.$('#' + prefix + '-dialog').open, false);
    assert.equal(view.$('#' + prefix + '-reader-body').textContent, '', 'clearing removes even offscreen source text');
    assert.equal(view.$('#' + prefix + '-reader-menu').querySelectorAll('[data-reader-target]').length, 0);
    assert.ok(!pageNode(view, prefix)?.dataset.pageId, 'no stale current page survives');
  }
}
async function copyResult(view) {
  let copied = '';
  Object.defineProperty(view.window.navigator, 'clipboard', { configurable: true, value: {
    async writeText(text) { copied = text; }
  } });
  openMenu(view);
  view.click('#copy-result');
  await settle();
  return copied;
}
function assertCompleteCopy(view, copied, summary) {
  const ordered = ['카드 소개', '나의 이야기', '과거·현재·미래', '분야별 풀이']
    .map(label => copied.indexOf('\n' + label + '\n'));
  assert.ok(ordered.every((position, index) => position >= 0 && (!index || position > ordered[index - 1])),
    'copy keeps the complete groups in their established order');
  for (const group of summary.groups) {
    for (const section of group.sections) {
      for (const paragraph of section.paragraphs) assert.ok(copied.includes(paragraph), 'copy preserves every full source paragraph');
      for (const detail of section.detailSections || []) for (const paragraph of detail.body.split(/\n\s*\n/)) {
        assert.ok(copied.includes(paragraph), 'card references and cautions remain in full copy');
      }
      if (section.reference?.url) assert.ok(copied.includes(section.reference.url));
      if (section.nameGuide) assert.ok(copied.includes(section.nameGuide));
      if (section.sourceNote) assert.ok(copied.includes(section.sourceNote.body));
    }
    for (const detail of group.detailSections || []) for (const paragraph of detail.body.split(/\n\s*\n/)) assert.ok(copied.includes(paragraph));
    for (const paragraph of group.basisParagraphs || []) assert.ok(copied.includes(paragraph));
  }
  for (const detail of summary.detailSections || []) assert.ok(copied.includes(detail.body));
  const domains = summary.groups.find(group => group.id === 'domains');
  const lines = copied.split('\n');
  for (const category of domains.categories) assert.equal(lines.filter(line => line === category.label).length, 1);
  for (const section of domains.sections) assert.equal(lines.filter(line => line === section.number + '. ' + section.title).length, 1,
    'each of the fifty numbered readings is copied once, even when it is not the current page');
  assert.equal(copied.split(summary.ritual).length - 1, 1);
}

(async () => {
  const completed = await page();
  const completedCards = cardIds(completed);
  const summary = completed.window.getSummary(completedCards, 'love');
  const pages = modelFor(completed);
  assert.notEqual(completed.$('#oracle-text').textContent, summary.oneLine);
  assert.equal(completed.$('#result-dialog').open, false);
  await openResult(completed);
  assert.equal(completed.revelations(), 0, 'results open directly without an interstitial');
  assert.equal(completed.$('#reading-dialog').open, false);
  assertPage(completed, pages[0]);
  assertAllPages(completed, pages);
  const domains = pages.filter(item => item.groupId.startsWith('domains'));
  assert.equal(new Set(domains.map(item => item.chapterId)).size, 50, 'all fifty original domain readings remain reachable');
  const domainModel = summary.groups.find(group => group.id === 'domains');
  for (const category of domainModel.categories) {
    const first = domains.find(item => item.groupId === 'domains:' + category.id);
    assert.ok(first, category.id + ': the domain category has reader pages');
    jump(completed, first.id);
    assert.equal(pageNode(completed).dataset.groupId, 'domains:' + category.id);
  }
  const originalCopy = await copyResult(completed);
  assertCompleteCopy(completed, originalCopy, summary);
  jump(completed, pages[0].id);
  assert.equal(await copyResult(completed), originalCopy, 'copy does not depend on the visible page or menu');
  const tarotExplanation = /(?:이|첫|다음|마지막) 카드|카드(?:가|는|의 뜻|의 의미|로 살펴)|타로의|같은 세 장/u;
  for (const group of ['problem', 'timeline', 'domains']) {
    const text = pages.filter(item => item.groupId === group || item.groupId.startsWith(group + ':'))
      .flatMap(item => [...item.paragraphs, ...(item.summaryLines || [])]).join('\n');
    assert.doesNotMatch(text, tarotExplanation, 'personal guidance stays separate from card reference teaching');
  }
  completed.$('#result-dialog').close();
  for (const [slot, index] of completed.receipt.openOrder.entries()) {
    completed.click('.card[data-index="' + index + '"]');
    assert.equal(completed.$('#reading-dialog').open, true);
    const reading = completed.window.getReading(completedCards[slot], 'love', slot);
    const positionLabel = ['첫 번째', '두 번째', '세 번째'][slot] + ' 자리 · ' + completed.window.POSITIONS[slot].label;
    const cardPages = completed.window.buildCardPages(completedCards[slot], reading, { positionLabel });
    assertPage(completed, cardPages[0], 'reading');
    assertAllPages(completed, cardPages, 'reading');
    assert.ok(compact(cardPages.flatMap(item => item.paragraphs).join('')).includes(compact(reading.example)));
    completed.closeReading();
  }
  await openResult(completed);
  assertPage(completed, pages[0]);
  completed.payment.switchMode(true);
  assert.equal(completed.phase('intro'), true);
  assertCleared(completed);
  completed.dom.window.close();

  // A selected source that was once omitted must survive both paging and free replay.
  const money = await page({ topic: 'money', drawn: ['magician', 'empress', 'fool', 'justice', 'pentacles_king'] });
  const moneySummary = money.window.getSummary(cardIds(money), 'money');
  const source = money.load('fortune-corpus/index.js').getFortune('money', '022');
  assert.equal(moneySummary.source.recordId, source.id);
  await openResult(money);
  assertAllPages(money, modelFor(money));
  let copied = await copyResult(money);
  for (const text of [source.body, source.action]) assert.equal(copied.split(text).length - 1, 1);
  const moneyReceipt = JSON.stringify(money.receipt);
  openMenu(money); money.click('#restart-result');
  assertCleared(money);
  money.click('#summon-button');
  await until(() => money.$('#result-dialog').open);
  assertPage(money, modelFor(money)[0]);
  assert.equal(JSON.stringify(money.receipt), moneyReceipt, 'free replay preserves cards, reveal order and exact original expiry');
  copied = await copyResult(money);
  for (const text of [source.body, source.action]) assert.equal(copied.split(text).length - 1, 1);
  money.dom.window.close();

  // Card-specific source notes and plain-language names never leak into the next card.
  const references = await page({ drawn: ['magician', 'empress', 'star', 'cups_six', 'fool'] });
  for (const [slot, index] of [2, 3, 4].entries()) {
    references.click('.card[data-index="' + index + '"]');
    const card = cardIds(references)[slot];
    const reading = references.window.getReading(card, 'love', slot);
    const cardPages = references.window.buildCardPages(card, reading, {
      positionLabel: ['첫 번째', '두 번째', '세 번째'][slot] + ' 자리 · ' + references.window.POSITIONS[slot].label
    });
    assertAllPages(references, cardPages, 'reading');
    const sourceText = compact(cardPages.flatMap(item => item.paragraphs).join(''));
    if (reading.nameGuide) assert.ok(sourceText.includes(compact(reading.nameGuide)));
    if (reading.sourceNote) assert.ok(sourceText.includes(compact(reading.sourceNote.body)));
    references.closeReading();
  }
  references.dom.window.close();

  for (const [pendingTopic, initError] of [['love', false], ['money', true]]) {
    const recovery = await page({ pendingTopic, initError });
    assert.equal(recovery.$('[data-topic].active').dataset.topic, pendingTopic);
    assert.equal(recovery.$('.tarot-price strong').textContent, '1회 10쭈');
    if (initError) assert.equal(recovery.$('#payment-status').textContent, '연결을 다시 확인해 주세요.');
    recovery.dom.window.close();
  }

  const partial = await page({ opened: [2] });
  partial.click('.card[data-index="2"]');
  assert.equal(partial.$('#reading-dialog').open, true);
  assert.equal(partial.$('#result-dialog').open, false);
  partial.closeReading();
  for (const [slot, index] of [3, 4].entries()) {
    partial.click('.card[data-index="' + index + '"]');
    await until(() => partial.phase(slot ? 'complete' : 'reading'));
    assert.equal(partial.$('#reading-dialog').open, false, 'revealing a card does not interrupt the table');
    assert.equal(partial.$('#result-dialog').open, false, 'results require an explicit action');
  }
  await openResult(partial);
  partial.dom.window.close();

  const direct = await page({ fresh: true, discarded: [], opened: [] });
  assert.equal(direct.$('#app').dataset.view, 'welcome');
  assert.equal(direct.payment.starts, 0);
  direct.click('#welcome-next');
  assert.equal(direct.$('#app').dataset.view, 'topics');
  direct.click('[data-topic="love"]');
  assert.equal(direct.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  assert.equal(direct.payment.starts, 0, 'choosing a topic never purchases');
  direct.click('#summon-button');
  await until(() => direct.phase('choosing'));
  const paidCards = [...direct.receipt.drawn];
  for (const [slot, index] of [4, 0].entries()) {
    direct.click('.card[data-index="' + index + '"]');
    direct.click('.card[data-index="' + index + '"]');
    await until(() => direct.phase(slot ? 'reading' : 'choosing'));
    assert.equal(direct.window.document.querySelectorAll('.card-turner.flipped').length, 0);
    assert.equal(direct.payment.saves, slot + 1, 'each exclusion saves once even with repeated taps');
    assert.equal(direct.$('.card[data-index="' + index + '"]').closest('.card-wrap').hidden, true);
  }
  assert.equal(direct.payment.starts, 1);
  assert.deepEqual(direct.payment.savedProgress, [
    { discarded: [4], openOrder: [] }, { discarded: [4, 0], openOrder: [] }
  ]);
  assert.deepEqual(direct.receipt.drawn, paidCards);
  for (const [slot, index] of [3, 1, 2].entries()) {
    direct.click('.card[data-index="' + index + '"]');
    await until(() => direct.phase(slot === 2 ? 'complete' : 'reading'));
    assert.equal(direct.$('#reading-dialog').open, false);
    assert.equal(direct.$('#result-dialog').open, false);
  }
  assert.deepEqual(direct.receipt.openOrder, [3, 1, 2]);
  assert.deepEqual(direct.receipt.discarded, [4, 0]);
  await openResult(direct);
  assert.equal(direct.revelations(), 0);
  assert.equal(direct.payment.starts, 1);
  direct.dom.window.close();

  const legacyPick = await page({ discarded: [3], opened: [] });
  assert.equal(legacyPick.phase('choosing'), true);
  assert.equal(legacyPick.$('.card[data-index="3"]').closest('.card-wrap').hidden, true);
  legacyPick.click('.card[data-index="1"]');
  await until(() => legacyPick.phase('reading'));
  assert.deepEqual(legacyPick.payment.savedProgress, [{ discarded: [3, 1], openOrder: [] }]);
  assert.equal(legacyPick.payment.starts, 0);
  legacyPick.dom.window.close();

  const admin = await page({ admin: true, paidDay: '2000-01-01' });
  const originalRecord = admin.payment.record;
  assert.equal(admin.phase('intro'), true);
  assert.equal(admin.$('#app').dataset.view, 'welcome');
  assert.ok(admin.$('#welcome-title').textContent.trim());
  assert.equal(admin.$('#main').hidden, true);
  assert.equal(admin.$('.tarot-price strong').textContent, '관리자 모드');
  admin.click('#welcome-next');
  admin.click('#tarot-back');
  assert.equal(admin.$('#app').dataset.view, 'welcome');
  assert.equal(admin.payment.starts, 0);
  admin.click('#welcome-next');
  admin.click('#summon-button');
  await until(() => admin.phase('choosing'));
  const firstDraw = [...admin.window.document.querySelectorAll('.front-title strong')].map(node => node.textContent);
  for (const [slot, index] of [0, 1].entries()) {
    admin.click('.card[data-index="' + index + '"]');
    await until(() => admin.phase(slot ? 'reading' : 'choosing'));
  }
  for (const [slot, index] of [2, 3, 4].entries()) {
    admin.click('.card[data-index="' + index + '"]');
    await until(() => admin.phase(slot === 2 ? 'complete' : 'reading'));
    assert.equal(admin.$('#reading-dialog').open, false);
  }
  await openResult(admin);
  assert.ok(!admin.$('#result-date').textContent.includes('2000'));
  openMenu(admin);
  assert.equal(admin.$('#restart-result span').textContent, '새 운세 보기');
  admin.click('#restart-result');
  assert.equal(admin.phase('intro'), true);
  assertCleared(admin);
  assert.equal(admin.payment.record, originalRecord);
  admin.click('#summon-button');
  await until(() => admin.phase('choosing'));
  const secondDraw = [...admin.window.document.querySelectorAll('.front-title strong')].map(node => node.textContent);
  assert.notDeepEqual(secondDraw, firstDraw);
  assert.equal(admin.payment.starts, 2);
  admin.payment.switchMode(false);
  assert.equal(admin.phase('intro'), true);
  assert.equal(admin.payment.record, originalRecord);
  assert.equal(admin.$('.tarot-price strong').textContent, '1회 30쭈');
  admin.click('[data-topic="money"]');
  assert.equal(admin.$('.tarot-price strong').textContent, '1회 10쭈');
  assert.equal(admin.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  admin.click('[data-topic="overall"]');
  assert.equal(admin.$('#summon-button span').textContent, '30쭈로 운세 시작하기');
  assert.equal(admin.$('#daily-limit-note').textContent, '결제 후 24시간 이용 · 만료 후 재결제');
  admin.dom.window.close();

  const expires = await page();
  await openResult(expires);
  await expires.advanceTime(120000);
  expires.window.dispatchEvent(new expires.window.Event('focus'));
  await settle();
  assert.equal(expires.phase('complete'), true, 'midnight does not end a rolling 24-hour purchase');
  await expires.advanceTime(86400000 - 120000 - 1);
  assert.equal(expires.$('#result-dialog').open, true);
  await expires.advanceTime(1);
  await until(() => expires.phase('intro'));
  assertCleared(expires);
  assert.ok([...expires.window.document.querySelectorAll('.front-title strong')].every(node => node.textContent === ''));
  assert.equal(expires.payment.record, null);
  assert.equal(expires.payment.starts, 0);
  assert.equal(expires.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  assert.match(expires.$('#payment-status').textContent, /만료.*다시 결제/);
  expires.dom.window.close();

  // A timer-suspended reader must enforce expiry at every newly introduced navigation action.
  for (const action of ['card', 'result', 'next', 'prev', 'keyboard', 'menu', 'chapter', 'copy', 'context']) {
    const suspended = await page();
    if (!['card', 'result'].includes(action)) {
      await openResult(suspended);
      if (action === 'prev') suspended.click('#result-reader-next');
      if (['chapter', 'copy', 'context'].includes(action)) openMenu(suspended);
    }
    const chapter = action === 'chapter' ? suspended.$('#result-reader-menu [data-reader-target]') : null;
    await suspended.advanceTime(86400000, { runTimers: false });
    if (action === 'card') suspended.click('.card[data-index="2"]');
    if (action === 'result') suspended.click('#action-button');
    if (action === 'next' || action === 'prev') suspended.click('#result-reader-' + action);
    if (action === 'keyboard') suspended.$('#result-reader-body').dispatchEvent(new suspended.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    if (action === 'menu') suspended.click('#result-reader-menu-toggle');
    if (action === 'chapter') chapter.click();
    if (action === 'copy') suspended.click('#copy-result');
    if (action === 'context') suspended.chooseContext('love-crush');
    await until(() => suspended.phase('intro'));
    await settle();
    assertCleared(suspended);
    assert.equal(suspended.payment.starts, 0, action + ': expired navigation never repurchases');
    suspended.dom.window.close();
  }

  const returned = await page({ opened: [2] });
  returned.click('.card[data-index="2"]');
  assert.equal(returned.$('#reading-dialog').open, true);
  await returned.advanceTime(86400000, { runTimers: false });
  returned.window.dispatchEvent(new returned.window.Event('pageshow'));
  await until(() => returned.phase('intro'));
  assertCleared(returned);
  returned.dom.window.close();

  const independent = await page();
  independent.payment.resetAt = new Date(independent.payment.now() + 60000).toISOString();
  await independent.advanceTime(60001);
  independent.window.dispatchEvent(new independent.window.Event('focus'));
  await settle();
  assert.equal(independent.phase('complete'), true);
  assert.ok(independent.payment.record);
  independent.dom.window.close();

  const staleFree = await page();
  staleFree.click('#restart-small');
  await until(() => staleFree.phase('intro'));
  await settle();
  assert.equal(staleFree.payment.record, null);
  assert.equal(staleFree.$('#summon-button span').textContent, '점괘 다시 보기');
  assert.equal(staleFree.$('#summon-button').dataset.replay, 'true');
  await staleFree.advanceTime(86400000, { runTimers: false });
  assert.equal(staleFree.$('#summon-button').dataset.replay, 'true', 'a suspended page still displays its earlier free action');
  staleFree.click('#summon-button');
  await settle();
  assert.equal(staleFree.payment.starts, 0, 'an old free-replay button never silently charges');
  assert.equal(staleFree.phase('intro'), true);
  assert.equal(staleFree.$('#summon-button span').textContent, '10쭈로 운세 시작하기');
  assert.match(staleFree.$('#payment-status').textContent, /만료.*다시 결제/);
  staleFree.dom.window.close();

  const hungRefresh = await page();
  await openResult(hungRefresh);
  let releaseStatus;
  const blockedStatus = new Promise(resolve => { releaseStatus = resolve; });
  hungRefresh.payment.resetAt = new Date(hungRefresh.payment.now() + 60000).toISOString();
  hungRefresh.payment.refreshToday = () => blockedStatus;
  hungRefresh.window.dispatchEvent(new hungRefresh.window.Event('focus'));
  await settle();
  await hungRefresh.advanceTime(60000);
  assert.equal(hungRefresh.phase('complete'), true);
  await hungRefresh.advanceTime(86400000 - 60000);
  await until(() => hungRefresh.phase('intro'));
  assertCleared(hungRefresh);
  assert.equal(hungRefresh.payment.starts, 0);
  releaseStatus(); await settle();
  assertCleared(hungRefresh);
  hungRefresh.dom.window.close();

  const delayedCopy = await page();
  await openResult(delayedCopy);
  let rejectCopy, copyCalls = 0;
  Object.defineProperty(delayedCopy.window.navigator, 'clipboard', { value: {
    writeText(text) {
      assert.ok(text.includes('종합 점괘'));
      copyCalls++;
      return new Promise((_resolve, reject) => { rejectCopy = reject; });
    }
  } });
  delayedCopy.window.document.execCommand = () => false;
  openMenu(delayedCopy); delayedCopy.click('#copy-result');
  assert.equal(copyCalls, 1);
  await delayedCopy.advanceTime(86400000);
  await until(() => delayedCopy.phase('intro'));
  rejectCopy(new Error('clipboard permission denied after expiry'));
  await settle();
  assertCleared(delayedCopy);
  assert.equal(delayedCopy.$('#result-dialog').querySelectorAll('textarea').length, 0,
    'a delayed clipboard rejection cannot recreate expired text');
  assert.equal(delayedCopy.payment.starts, 0);
  delayedCopy.dom.window.close();

  // Context changes rebuild only optional guidance, using the exact purchased cards.
  const personal = await page();
  await openResult(personal);
  const beforePersonal = snapshotPurchase(personal);
  openMenu(personal);
  assert.equal(personal.$('#result-context-select').options.length, 6);
  personal.chooseContext('love-crush');
  const report = personal.load('personal-reading.js').buildPersonalReading({
    cards: cardIds(personal), topicId: 'love', contextId: 'love-crush'
  });
  const personalPages = modelFor(personal, report);
  const firstPersonal = personalPages.find(item => item.groupId === 'personal');
  assert.ok(firstPersonal);
  assertPage(personal, firstPersonal);
  assertAllPages(personal, personalPages);
  const personalCopy = await copyResult(personal);
  for (const line of personal.load('personal-reading.js').personalReadingCopyLines(report).filter(Boolean)) {
    assert.ok(personalCopy.includes(line), 'copy retains complete choices, examples and follow-up answers');
  }
  openMenu(personal); personal.chooseContext('love-distance');
  assert.equal(personal.$('#result-context-select').value, 'love-distance');
  assert.equal(pageNode(personal).dataset.groupId, 'personal');
  const distanceReport = personal.load('personal-reading.js').buildPersonalReading({
    cards: cardIds(personal), topicId: 'love', contextId: 'love-distance'
  });
  const distanceFirst = modelFor(personal, distanceReport).find(item => item.groupId === 'personal');
  assertPage(personal, distanceFirst);
  assert.notEqual(distanceFirst.title, firstPersonal.title, 'changing the situation displays its own question and guidance');
  assert.equal(snapshotPurchase(personal), beforePersonal, 'context changes leave cards, saves, price and expiry untouched');
  openMenu(personal);
  const forged = personal.window.document.createElement('option');
  forged.value = 'money-saving'; personal.$('#result-context-select').append(forged);
  personal.chooseContext('money-saving');
  assert.equal(personal.$('#result-reader-menu [data-reader-target="' + firstPersonal.id + '"]'), null,
    'a situation from another purchased topic cannot retain the earlier personalized pages');
  personal.chooseContext('love-dating');
  personal.payment.options.onAccountChange();
  assert.equal(personal.phase('intro'), true);
  assertCleared(personal);
  assert.equal(personal.$('#intro-context-select').value, '');
  personal.dom.window.close();

  const chosen = await page({ admin: true });
  chosen.click('#welcome-next');
  assert.equal(chosen.$('#intro-context-select').options.length, 16);
  chosen.chooseContext('love-crush', 'intro-context-select');
  chosen.click('[data-topic="love"]');
  assert.equal(chosen.$('#intro-context-select').value, '');
  assert.equal(chosen.$('#intro-context-select').options.length, 6);
  chosen.chooseContext('love-reunion', 'intro-context-select');
  chosen.click('#summon-button');
  await until(() => chosen.phase('choosing'));
  for (const [slot, index] of [0, 1].entries()) {
    chosen.click('.card[data-index="' + index + '"]');
    await until(() => chosen.phase(slot ? 'reading' : 'choosing'));
  }
  for (const [slot, index] of [2, 4, 3].entries()) {
    chosen.click('.card[data-index="' + index + '"]');
    await until(() => chosen.phase(slot === 2 ? 'complete' : 'reading'));
  }
  await openResult(chosen);
  assert.equal(chosen.$('#result-context-select').value, 'love-reunion');
  assert.equal(pageNode(chosen).dataset.groupId, 'cards');
  openMenu(chosen);
  const personalTarget = [...chosen.$('#result-reader-menu').querySelectorAll('[data-reader-target]')]
    .find(button => button.dataset.readerTarget.startsWith('personal-'));
  assert.ok(personalTarget, 'the situation selected before drawing survives in the chapter menu');
  personalTarget.click();
  assert.equal(pageNode(chosen).dataset.groupId, 'personal');
  const resumedPage = currentId(chosen);
  chosen.$('#result-dialog').close();
  await openResult(chosen);
  assert.equal(currentId(chosen), resumedPage, 'reopening keeps the last page being read');
  assert.equal(chosen.$('#result-context-select').value, 'love-reunion');
  openMenu(chosen); chosen.click('#restart-result');
  assert.equal(chosen.$('#intro-context-select').value, '');
  assertCleared(chosen);
  chosen.dom.window.close();

  for (const prefix of ['result', 'reading']) {
    const guarded = await page();
    if (prefix === 'result') await openResult(guarded);
    else guarded.click('.card[data-index="2"]');
    guarded.click('#' + prefix + '-reader-next');
    const oldPage = currentId(guarded, prefix);
    const next = guarded.$('#' + prefix + '-reader-next');
    await guarded.advanceTime(86400000, { runTimers: false });
    next.click();
    await until(() => guarded.phase('intro'));
    await settle();
    assertCleared(guarded);
    assert.notEqual(currentId(guarded, prefix), oldPage);
    next.click(); await settle();
    assertCleared(guarded);
    assert.equal(guarded.payment.starts, 0, 'a retained reader button cannot restore expired pages');
    guarded.dom.window.close();
  }

  const freePreview = await page({ admin: true });
  freePreview.click('#welcome-next'); freePreview.click('#summon-button');
  await until(() => freePreview.phase('choosing'));
  await freePreview.advanceTime(86400001);
  freePreview.window.dispatchEvent(new freePreview.window.Event('focus'));
  await settle();
  assert.equal(freePreview.phase('choosing'), true, 'administrator preview has no paid expiry');
  freePreview.dom.window.close();
  console.log('PASS tarot UI: one-page readers, complete source/copy and chapter navigation, context rebuilds, ordered paid progress, free replay, exact 24-hour expiry and no stale-page restoration');
})().catch(error => { console.error(error); process.exitCode = 1; });

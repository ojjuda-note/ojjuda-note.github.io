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
  window.setTimeout = (fn, ms) => ms >= 2000 ? -1 : nativeTimeout(fn, Math.min(ms, 2));
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
    drawn, discarded: [0, 1], openOrder: opened
  };
  let payment, revelations = 0;
  window.TarotRevelation = class { play() { revelations++; return Promise.resolve(true); } cancel() {} };
  window.TarotPayment = class {
    constructor(options) {
      payment = this;
      this.options = options; this.enabled = true; this.adminPreview = admin;
      this.user = 'account'; this.balance = 40; this.starts = 0; this.saves = 0;
      this.record = { paid: !pendingTopic, readingDay: paidDay, topic: pendingTopic || receipt.topic };
    }
    async init() {
      if (pendingTopic) {
        if (initError) throw Error('연결을 다시 확인해 주세요.');
        return { signedIn: true, pending: { topic: pendingTopic } };
      }
      return this.adminPreview ? { signedIn: true, preview: true, adminPreview: true } : { signedIn: true, resume: receipt };
    }
    async refreshAdminMode() { return this.adminPreview; }
    async refreshToday() {}
    receiptFor(topic) { return !this.adminPreview && topic === receipt.topic ? receipt : null; }
    async start() { this.starts++; return this.adminPreview ? null : receipt; }
    async save() { this.saves++; return null; }
    newReading() { if (!this.adminPreview) this.record = null; }
    switchMode(value) { this.adminPreview = value; this.options.onModeChange({ adminPreview: value }); }
  };
  vm.runInContext(unmodule(read('app.js')), context);
  await until(() => !window.document.querySelector('#summon-button').disabled);
  const $ = selector => window.document.querySelector(selector);
  const click = selector => $(selector).click();
  const closeReading = () => { if ($('#reading-dialog').open) $('#reading-dialog').close(); };
  const phase = name => $('#app').dataset.phase === name;
  return { dom, window, $, click, closeReading, phase, payment, receipt, revelations: () => revelations };
}

(async () => {
  // Reopening today's completed reading must point the lower panel at the whole spread.
  const completed = await page();
  const expected = completed.window.getSummary(completed.receipt.openOrder.map(index => completed.window.DECK.find(card => card.id === completed.receipt.drawn[index])), 'love').oneLine;
  assert.notEqual(completed.$('#oracle-text').textContent, expected, 'combined fortune stays hidden until the revelation');
  assert.equal(completed.$('#oracle-card-name').hidden, true);
  assert.equal(completed.$('#oracle-keyword').hidden, true);
  assert.equal(completed.$('#reading-open span').textContent, '종합 점괘 자세히 보기');
  completed.click('#reading-open');
  await until(() => completed.$('#result-dialog').open);
  assert.equal(completed.$('#oracle-text').textContent, expected, 'combined one-line reading appears after the revelation');
  assert.equal(completed.revelations(), 1, 'lower combined CTA uses the revelation before the full result');
  assert.equal(completed.$('#reading-dialog').open, false);
  completed.$('#result-dialog').close();
  completed.click('.card[data-index="2"]');
  assert.equal(completed.$('#reading-dialog').open, true, 'opened cards retain their individual explanations');
  assert.equal(completed.$('#reading-title').textContent, '여사제');
  for (const section of completed.window.document.querySelectorAll('#reading-sections .reading-part')) {
    assert.equal(section.children[0].tagName, 'H3');
    assert.equal(section.children[1].tagName, 'H4');
    assert.ok(section.children[1].textContent.length > 0);
    assert.equal(section.children[2].tagName, 'P');
  }
  assert.equal(completed.$('#oracle-text').textContent, expected, 'individual modal does not replace the combined lower panel');
  completed.closeReading();
  completed.click('#reading-open');
  await until(() => completed.$('#result-dialog').open);
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
  assert.equal(admin.$('#daily-limit-note').textContent, '분야별 하루 1회 · 한국시간 밤 12시에 새 운세');
  assert.equal(admin.$('#reading-open').hidden, true);
  assert.equal(admin.$('#reading-open span').textContent, '이 카드의 이야기 자세히 읽기');
  admin.dom.window.close();
  console.log('PASS tarot UI: combined lower result, individual cards, repeatable admin preview and mode reset');
})().catch(error => { console.error(error); process.exitCode = 1; });

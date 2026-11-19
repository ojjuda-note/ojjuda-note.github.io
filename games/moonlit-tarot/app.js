import { DECK, TOPICS, POSITIONS, getReading, getSummary } from './readings.js?v=20261114-tarot-first-person1';
import { TarotFX, TarotAudio } from './fx.js';
import { TarotPayment, getTarotPrice } from './payment.js?v=20261114-tarot-copy1';
import { createPersonalReading } from './personal-reading-ui.js?v=20261120-tarot-chapters1';
import { createReadingReader } from './reading-reader.js?v=20261120-tarot-chapters1';
import { buildSummaryPages, buildCardPages } from './reading-pages.js?v=20261120-tarot-chapters1';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const app = $('#app');
const arena = $('#arena');
const plane = $('#cards-plane');
const mediaMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  phase: 'intro', topic: 'overall', drawn: [], kept: [], openOrder: [], discarded: new Set(), revealed: 0,
  busy: false, sound: false, voice: false, reduced: mediaMotion.matches, epoch: 0, lastReading: -1, summaryReady: false, readingExpiresAt: null,
};
// The quiet scene is static; do not keep an invisible particle loop running.
const effects = new TarotFX({ reducedMotion: state.reduced });
const audio = new TarotAudio();
const cards = [];
let lastFocus = null;
let toastTimeout;
let oracleTimeout;
let voiceNoticeShown = false;
let billingReady = false;
let readingExpiryTimer;
let personalReading;
let resultContext = null;
const billing = new TarotPayment({
  enabled: document.documentElement.dataset.billing === 'ojjuda',
  onBalance: updatePaymentStatus,
  onModeChange: handleBillingModeChange,
  onAccountChange: () => {
    reset({ clearPaid: false });
    billingReady = false;
    clearTimeout(readingExpiryTimer);
    $('#summon-button').disabled = true;
    $('#payment-status').textContent = '로그인 계정이 바뀌었어요. 새로고침 후 다시 이용해 주세요.';
    $('#login-link').hidden = false;
  }
});

function recordFortuneVisit() {
  if (!billing.client || billing.adminPreview) return;
  try { window.OjjudaSiteUsage?.configure({ client: billing.client }); } catch {} // Statistics never block a reading.
}

function handleBillingModeChange() {
  clearTimeout(readingExpiryTimer);
  if (!billingReady) { updatePaymentStatus(); return; }
  // A mode change must never carry preview cards into a paid reading.
  reset({ clearPaid: false });
  showToast(billing.adminPreview ? '관리자 모드예요. 매번 새로운 운세를 볼 수 있어요.' : '관리자 모드가 꺼졌어요. 오늘의 운세를 확인해 주세요.');
  if (!billing.adminPreview) { recordFortuneVisit(); void refreshReadingAvailability({ verifyMode: false }); }
}

function updatePaymentStatus() {
  personalReading?.syncTopic();
  $('#summon-button').dataset.replay = 'false';
  if (!billing.enabled) { $('.tarot-price strong').textContent = `1회 ${getTarotPrice(state.topic)}쭈`; return; }
  const preview = billing.adminPreview;
  app.dataset.adminPreview = String(preview);
  $('.tarot-price strong').textContent = preview ? '관리자 모드' : `1회 ${getTarotPrice(state.topic)}쭈`;
  $('.tarot-price span').textContent = preview ? '쭈 차감 없음 · 기록 미저장' : '세 장의 풀이 · 종합 점괘 · 50가지 주제';
  $('#daily-limit-note').textContent = preview ? '횟수 제한 없이 매번 새로운 카드로 시작해요.' : '결제 후 24시간 이용 · 만료 후 재결제';
  $('#help-usage-note').textContent = preview ? '관리자 모드에서는 쭈를 차감하거나 기록을 저장하지 않아요. 일반 이용으로 돌아가려면 아지트에서 관리자 모드를 꺼 주세요.' : '전체 30쭈 · 연애·금전·일과 도전 각 10쭈. 결제 후 24시간 동안 다시 보기는 무료이며, 만료 후에는 다시 결제해요.';
  $('#restart-small span').textContent = preview ? '새 운세 보기' : '다른 주제 고르기';
  $('#restart-result span').textContent = preview ? '새 운세 보기' : '다른 주제 고르기';
  if (preview) {
    $('#summon-button span').textContent = '새 카드로 운세 시작하기';
    $('#payment-status').textContent = '관리자 모드 · 쭈 차감 없이 새 운세를 계속 볼 수 있어요.';
    $('#login-link').hidden = true;
    $$('[data-topic]').forEach(button => {
      button.disabled = state.busy;
      button.dataset.readToday = 'false';
    });
    return;
  }
  const balance = Number.isInteger(billing.balance) ? `보유 ${billing.balance.toLocaleString('ko-KR')}쭈` : '';
  if (state.phase !== 'intro') {
    $('#payment-status').textContent = `만료 전 다시 보기 무료${balance ? ' · ' + balance : ''}`;
    return;
  }
  const unfinished = billing.record && (!billing.record.paid || billing.record.unsynced);
  const previous = billing.receiptFor(state.topic);
  $('#summon-button').dataset.replay = String(!unfinished && !!previous);
  $('#summon-button span').textContent = unfinished ? '진행하던 운세 이어보기' : previous ? (previous.openOrder.length === 3 ? '점괘 다시 보기' : '점괘 이어보기') : `${getTarotPrice(state.topic)}쭈로 운세 시작하기`;
  const expires = previous ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(previous.reset_at)) : '';
  $('#payment-status').textContent = unfinished ? '진행하던 운세를 이어서 확인해 주세요.' : previous ? `${expires}까지 다시 보기 무료${balance ? ' · ' + balance : ''}` : balance;
  $$('[data-topic]').forEach(button => {
    button.disabled = !!unfinished || state.busy;
    button.dataset.readToday = String(!!billing.receiptFor(button.dataset.topic));
  });
}

function scheduleReadingRefresh() {
  clearTimeout(readingExpiryTimer);
  if (!billing.enabled || billing.adminPreview) return;
  const now = billing.now();
  const expiries = [state.readingExpiresAt, Date.parse(billing.resetAt) > now ? billing.resetAt : null].map(Date.parse).filter(Number.isFinite);
  if (!expiries.length) return;
  const delay = Math.max(20, Math.min(...expiries) - now);
  readingExpiryTimer = setTimeout(() => { void refreshReadingAvailability(); }, Math.min(delay, 2147483647));
}
function expireDisplayedReading() {
  if (!billing.enabled || billing.adminPreview || !state.readingExpiresAt || billing.now() < Date.parse(state.readingExpiresAt)) return false;
  billing.clearRecord();
  reset({ clearPaid: false });
  $('#payment-status').textContent = '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.';
  showToast('풀이가 만료됐어요.');
  return true;
}
async function refreshReadingAvailability({ verifyMode = true } = {}) {
  if (!billingReady || !billing.user) return;
  const expired = expireDisplayedReading();
  if (state.phase === 'intro' && !state.busy) {
    updatePaymentStatus();
    if (expired) $('#payment-status').textContent = '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.';
  }
  // The local deadline must remain armed while a network request is pending.
  scheduleReadingRefresh();
  try {
    if (verifyMode) await billing.refreshAdminMode();
    if (!billing.adminPreview) await billing.refreshToday();
    const newlyExpired = expireDisplayedReading();
    if (state.phase === 'intro') {
      updatePaymentStatus();
      if (expired || newlyExpired) $('#payment-status').textContent = '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.';
    }
    scheduleReadingRefresh();
  } catch {
    // Clear an expired on-screen reading even when the server is unavailable.
    expireDisplayedReading();
    if (state.readingExpiresAt) scheduleReadingRefresh();
  }
}
function saveProgress() {
  // Capture the choice immediately, but let its animation begin without a dialog.
  return billing.save(state).then(receipt => ({ receipt }), error => ({ error }));
}
async function confirmProgress(saved, epoch) {
  const result = await saved;
  if (epoch !== state.epoch || expireDisplayedReading()) return false;
  if (!result.error) return true;
  const error = result.error;
  reset({ clearPaid: false });
  if (error.receipt) restorePaidReading(error.receipt);
  else {
    state.topic = billing.record?.topic || state.topic;
    $$('[data-topic]').forEach(button => {
      button.classList.toggle('active', button.dataset.topic === state.topic);
      button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic));
    });
    updatePaymentStatus();
    $('#payment-status').textContent = error.message;
    $('#login-link').hidden = !['not_signed_in', 'member_required'].includes(error.code);
  }
  showToast(error.message);
  return false;
}

function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function backArtwork(index) {
  return `<svg class="back-art" viewBox="0 0 150 240" aria-hidden="true">
    <defs><radialGradient id="back-glow-${index}"><stop stop-color="#aa7cc5" stop-opacity=".24"/><stop offset="1" stop-color="#20152c" stop-opacity="0"/></radialGradient></defs>
    <rect x="3" y="3" width="144" height="234" rx="4"/><rect x="8" y="8" width="134" height="224" rx="3" opacity=".5"/>
    <path d="M15 42V16h27M108 16h27v26M15 198v26h27M108 224h27v-26"/>
    <path d="m15 17 15 15m105-15-15 15M15 223l15-15m105 15-15-15M25 15v10H15m110-10v10h10M25 225v-10H15m110 10v-10h10"/>
    <ellipse cx="75" cy="120" rx="61" ry="95" fill="url(#back-glow-${index})" stroke="none"/>
    <path d="M75 26c-23 18-48 40-48 94s25 76 48 94c23-18 48-40 48-94S98 44 75 26Z" opacity=".7"/>
    <path d="M75 39c-16 14-38 37-38 81s22 67 38 81c16-14 38-37 38-81S91 53 75 39Z" opacity=".38"/>
    <circle cx="75" cy="120" r="42"/><circle cx="75" cy="120" r="37" opacity=".6"/><circle cx="75" cy="120" r="45" stroke-dasharray="1 6"/>
    <path d="m75 70 5 11-5 11-5-11Zm0 78 5 11-5 11-5-11ZM25 120l11-5 11 5-11 5Zm78 0 11-5 11 5-11 5Z"/>
    <path d="M82 95a27 27 0 1 0 9 45 25 25 0 0 1-9-45Z" fill="#c6a16c" fill-opacity=".7"/>
    <path d="m88 106 2.8 7.2L98 116l-7.2 2.8L88 126l-2.8-7.2L78 116l7.2-2.8Z" class="back-star"/>
    <path d="m75 11 3 7-3 7-3-7Zm0 204 3 7-3 7-3-7ZM20 64l3 6-3 6-3-6Zm110 0 3 6-3 6-3-6ZM20 164l3 6-3 6-3-6Zm110 0 3 6-3 6-3-6Z" fill="currentColor"/>
    <path d="M51 60h48M51 180h48M61 53h28M61 187h28" opacity=".55"/>
    <circle cx="75" cy="51" r="1.5" fill="currentColor"/><circle cx="75" cy="189" r="1.5" fill="currentColor"/>
    <path d="M21 100v40M129 100v40" opacity=".4"/><circle cx="20" cy="120" r="2"/><circle cx="130" cy="120" r="2"/>
  </svg>`;
}

for (let index = 0; index < 5; index++) {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap';
  wrap.style.setProperty('--float-delay', `${index * -.8}s`);
  wrap.innerHTML = `<div class="card-pivot"><button class="card" type="button" disabled aria-label="${index + 1}번째 카드" data-index="${index}"><div class="card-turner"><div class="card-back">${backArtwork(index)}</div><div class="card-front" aria-hidden="true"><div class="front-art"></div><div class="front-shade"></div><div class="front-border"></div><span class="front-numeral"></span><div class="front-title"><strong></strong><span></span></div></div></div></button><span class="card-label"></span></div>`;
  plane.append(wrap);
  const card = { wrap, button: wrap.querySelector('button'), turner: wrap.querySelector('.card-turner'), label: wrap.querySelector('.card-label'), pose: null, index };
  card.button.insertAdjacentHTML('beforeend', '<span class="reveal-number" hidden aria-hidden="true"></span>');
  card.button.addEventListener('click', () => onCard(index));
  card.button.addEventListener('pointerenter', () => { if (!card.button.disabled && state.sound) audio.play('hover'); });
  cards.push(card);
}

const duration = (ms) => state.reduced ? Math.min(150, ms) : ms;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const poseTransform = (p) => `translate3d(calc(-50% + ${p.x}px),calc(-50% + ${p.y}px),${p.z || 0}px) rotateZ(${p.r || 0}deg) rotateY(${p.ry || 0}deg) scale(${p.s ?? 1})`;
function locationFor(index, arrangement = 'five') {
  const w = arena.clientWidth || 340;
  const h = arena.clientHeight || 340;
  const cw = cards.find(card => !card.wrap.hidden)?.wrap.offsetWidth || 100;
  if (arrangement === 'three') {
    const slot = state.kept.indexOf(index);
    const gap = Math.min(cw + 26, (w - cw - 24) / 2);
    return { x: (slot - 1) * gap, y: -12, r: 0, s: 1 };
  }
  const gap = Math.max(18, Math.min(cw * .66, (w - cw - 40) / 4));
  return { x: (index - 2) * gap, y: h * .12 + [16, 4, 0, 4, 16][index], r: (index - 2) * 8, s: 1 };
}

async function moveCard(card, pose, ms = 600, options = {}) {
  const from = card.wrap.style.transform || poseTransform(pose);
  const to = poseTransform(pose);
  card.pose = pose;
  card.wrap.style.transform = to;
  if (!ms || state.reduced) return;
  const animation = card.wrap.animate([{ transform: from, opacity: options.fromOpacity ?? 1 }, { transform: to, opacity: options.toOpacity ?? 1 }], { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'none' });
  try { await animation.finished; } catch { /* A restart or resize can replace an animation. */ }
}

function layout(animate = false) {
  cards.forEach(card => {
    if (card.wrap.hidden || (state.kept.length && !state.kept.includes(card.index))) return;
    const arrangement = state.kept.length ? 'three' : 'five';
    moveCard(card, locationFor(card.index, arrangement), animate ? duration(320) : 0);
    card.wrap.style.zIndex = String(7 - Math.abs(card.index - 2));
  });
}

function centerOf(card) {
  const rect = card.button.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
function play(name) { if (state.sound) audio.play(name); }
function setTitle(title, subtitle, eyebrow = 'THE MOONLIT ORACLE') {
  $('#game-title').textContent = title;
  $('#game-subtitle').textContent = subtitle;
  $('#game-subtitle').hidden = !subtitle;
  $('#eyebrow').innerHTML = `<span></span>${eyebrow}<span></span>`;
}
function setStageCaption(text = '') {
  $('#stage-caption').textContent = text;
  $('#stage-caption').hidden = !text;
}
function setView(view, focus = false) {
  app.dataset.view = view;
  $('#welcome-screen').hidden = view !== 'welcome';
  $('#main').hidden = view === 'welcome';
  $('#tarot-back').setAttribute('aria-label', view === 'welcome' ? '아지트로 돌아가기' : '이전 화면으로');
  if (view === 'topics') setTitle('어떤 이야기가 궁금한가요?', '마음에 걸리는 주제를 골라 주세요.');
  if (focus) {
    const target = view === 'welcome' ? $('#welcome-next') : $('#game-title');
    if (target.id === 'game-title') target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
function setPhase(phase) {
  const wasBusy = state.busy;
  state.phase = phase;
  app.dataset.phase = phase;
  const busy = ['summoning', 'choosing-busy', 'revealing'].includes(phase);
  state.busy = busy;
  if (phase !== 'intro') setView('table');
  $('#tarot-back').disabled = busy;
  $('#pick-slots').hidden = true;
  if (wasBusy && !busy) layout(false);
  arena.setAttribute('aria-busy', String(busy));
  const step = phase === 'summoning' ? 0 : ['choosing', 'choosing-busy'].includes(phase) ? 1 : ['reading', 'revealing', 'complete'].includes(phase) ? 2 : -1;
  $$('#journey [data-step]').forEach((el, i) => {
    el.classList.toggle('active', i === step);
    el.classList.toggle('complete', i < step);
    if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
  });
}

function showToast(message) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimeout = setTimeout(() => $('#toast').classList.remove('show'), 3000);
}

function setOracle(text, { title = '', tag = '마녀의 속삭임', keyword = '', speak = true } = {}) {
  const textNode = $('#oracle-text');
  textNode.textContent = text;
  $('#dialogue-tag').textContent = tag;
  $('#oracle-card-name').hidden = !title;
  $('#oracle-card-name').textContent = title;
  $('#oracle-keyword').hidden = !keyword;
  $('#oracle-keyword').textContent = keyword ? `✧  ${keyword}` : '';
  if (!state.reduced) textNode.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 600, fill: 'none' });
  $('#oracle').classList.add('speaking');
  clearTimeout(oracleTimeout);
  oracleTimeout = setTimeout(() => $('#oracle').classList.remove('speaking'), 2400);
  if (speak && state.voice) speakText(`${title ? title + '. ' : ''}${text}`);
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = .91;
  utterance.pitch = .87;
  utterance.volume = .85;
  const voices = speechSynthesis.getVoices();
  const ko = voices.filter(v => v.lang.startsWith('ko'));
  if (ko.length) utterance.voice = ko.find(v => /female|yuna|sunhi|heami|여성/i.test(v.name)) || ko[0];
  if (!ko.length && !voiceNoticeShown) {
    showToast('기기의 기본 한국어 음성으로 읽어요. 음성이 없으면 글로 확인해 주세요.');
    voiceNoticeShown = true;
  }
  utterance.onerror = () => { $('#oracle').classList.remove('speaking'); };
  speechSynthesis.speak(utterance);
}

function randomDeck() {
  const pool = [...DECK];
  const randomValues = new Uint32Array(pool.length);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(randomValues);
  else randomValues.forEach((_, i) => { randomValues[i] = Math.floor(Math.random() * 4294967296); });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor((randomValues[i] / 4294967296) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

function applyArtwork(element, data) {
  const { src, columns, rows, index } = data.art;
  element.style.setProperty('--art-image', `url("${src}")`);
  element.style.setProperty('--art-size', `${columns * 100}% ${rows * 100}%`);
  element.style.setProperty('--art-x', `${columns > 1 ? index % columns * 100 / (columns - 1) : 0}%`);
  element.style.setProperty('--art-y', `${rows > 1 ? Math.floor(index / columns) * 100 / (rows - 1) : 0}%`);
}

function setCardArtwork(card, data) {
  applyArtwork(card.wrap, data);
  card.wrap.style.setProperty('--card-color', data.color);
  card.wrap.querySelector('.front-numeral').textContent = data.numeral;
  card.wrap.querySelector('.front-title strong').textContent = data.name;
  card.wrap.querySelector('.front-title span').textContent = data.english;
}

async function summon() {
  if (state.phase !== 'intro' || state.busy || !billingReady) return;
  // A stale free-replay button must show the price before starting a new purchase.
  if ($('#summon-button').dataset.replay === 'true' && !billing.receiptFor(state.topic)) {
    if (billing.record?.paid && billing.record.topic === state.topic) billing.clearRecord();
    updatePaymentStatus();
    $('#payment-status').textContent = '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.';
    scheduleReadingRefresh();
    return;
  }
  const epoch = ++state.epoch;
  state.busy = true;
  $('#summon-button').disabled = true;
  $('#tarot-back').disabled = true;
  let receipt;
  try {
    receipt = await billing.start(state.topic);
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    state.readingExpiresAt = receipt?.reset_at || null;
    if (expireDisplayedReading()) return;
    scheduleReadingRefresh();
    if (receipt && (receipt.discarded?.length || receipt.openOrder?.length)) {
      restorePaidReading(receipt);
      if (state.revealed === 3) void showResults();
      if (receipt.progressChanged) showToast('다른 화면에 저장된 점괘를 불러왔어요.');
      return;
    }
    state.drawn = receipt ? receipt.drawn.map(id => DECK.find(card => card.id === id)) : randomDeck();
    if (state.drawn.length !== 5 || state.drawn.some(card => !card) || new Set(state.drawn.map(card => card.id)).size !== 5) throw new Error('카드를 불러오지 못했어요. 시작 버튼을 다시 눌러 같은 운세를 이어서 확인해 주세요.');
    if (receipt) state.topic = receipt.topic;
  } catch (error) {
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    state.busy = false;
    $('#tarot-back').disabled = false;
    updatePaymentStatus();
    $('#summon-button').disabled = false;
    $('#payment-status').textContent = error.message;
    $('#login-link').hidden = !['not_signed_in', 'member_required', 'coins', 'wallet_unavailable'].includes(error.code);
    $$('[data-topic]').forEach(button => { button.disabled = !billing.adminPreview && !!billing.record && (!billing.record.paid || billing.record.unsynced); });
    return;
  }
  state.discarded.clear();
  state.kept = [];
  state.openOrder = [];
  state.revealed = 0;
  state.summaryReady = false;
  cards.forEach((card, i) => {
    card.wrap.hidden = false;
    setCardArtwork(card, state.drawn[i]);
  });
  $('#intro-controls').hidden = true;
  $('#play-controls').hidden = false;
  $('#action-button').hidden = true;
  $('#selection-count').textContent = '카드를 펼치고 있어요';
  $('#reading-open').hidden = true;
  setStageCaption();
  setPhase('summoning');
  updateSendProgress();
  updatePaymentStatus();
  setTitle('잠시 마음을 가라앉혀 보세요', '카드를 펼치고 있어요.');
  setOracle('궁금한 이야기를 하나 떠올려 보세요.', { speak: false });
  effects.setMood('idle');
  play('deal');
  await Promise.all(cards.map(async (card, index) => {
    moveCard(card, { x: (index - 2) * 3, y: arena.clientHeight * .12, r: (index - 2) * 2, s: .95 }, 0);
    await sleep(duration(index * 35));
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    await moveCard(card, locationFor(index), duration(360));
  }));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  setPhase('choosing');
  updateChoiceProgress();
  cards.find(card => !card.button.disabled)?.button.focus({ preventScroll: true });
}

function onCard(index) {
  if (expireDisplayedReading() || state.busy) return;
  if (state.phase === 'choosing') void chooseCard(index);
  else if (['reading', 'complete'].includes(state.phase) && state.kept.includes(index)) {
    const slot = state.openOrder.indexOf(index);
    if (slot >= 0) showReading(slot);
    else if (state.phase === 'reading') void revealCard(index);
  }
}

function updateSendProgress() {
  app.dataset.sent = String(state.discarded.size);
  $('#pick-slots').hidden = true;
  $$('[data-send-step]').forEach((step, index) => {
    const sent = index < state.discarded.size;
    step.classList.toggle('is-complete', sent);
    step.setAttribute('aria-label', `${index + 1}번째 카드${sent ? ', 보냄' : ', 기다리는 중'}`);
  });
}

function updateChoiceProgress() {
  const count = state.discarded.size;
  cards.forEach(card => {
    const sent = state.discarded.has(card.index);
    card.button.disabled = sent || state.busy;
    card.button.removeAttribute('aria-pressed');
    card.button.setAttribute('aria-label', `${card.index + 1}번 카드, ${sent ? '보낸 카드' : '누르면 보내기'}`);
    card.label.textContent = '';
  });
  updateSendProgress();
  $('#selection-count').innerHTML = `보낸 카드 <strong>${count} <span>/ 2</span></strong>`;
  $('#discard-preview').hidden = true;
  $('#action-button').hidden = true;
  $('#reveal-order').hidden = true;
  if (count < 2) setTitle(count ? '한 장 더 보내 주세요' : '두 장을 보내 주세요', '마음이 덜 가는 카드부터 골라 주세요.');
  else setTitle('남은 세 장을 펼쳐볼게요', '');
  setStageCaption();
}

async function chooseCard(index) {
  if (state.phase !== 'choosing' || state.busy || state.discarded.size >= 2 || state.discarded.has(index)) return;
  const epoch = state.epoch;
  const card = cards[index];
  const pose = locationFor(index);
  // Save each sent card immediately, keeping the original receipt and resumable
  // five-card ritual. The confirmed choice is removed before the next choice.
  state.discarded.add(index);
  const saved = saveProgress();
  setPhase('choosing-busy');
  updateChoiceProgress();
  card.wrap.style.zIndex = '20';
  play('deal');
  const lifted = { ...pose, y: pose.y - 14, r: 0, s: .98 };
  await moveCard(card, lifted, duration(160));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  if (!await confirmProgress(saved, epoch)) return;
  const sent = { ...lifted, y: lifted.y - 58, s: .88 };
  const animation = card.wrap.animate([
    { transform: poseTransform(lifted), opacity: 1 },
    { transform: poseTransform(state.reduced ? lifted : sent), opacity: 0 }
  ], { duration: duration(280), easing: 'ease-out', fill: 'forwards' });
  try { await animation.finished; } catch { return; }
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  card.wrap.hidden = true;
  animation.cancel();
  if (state.discarded.size < 2) {
    setPhase('choosing');
    updateChoiceProgress();
    cards.find(item => !item.button.disabled)?.button.focus({ preventScroll: true });
    return;
  }
  state.kept = cards.map(item => item.index).filter(i => !state.discarded.has(i));
  await Promise.all(state.kept.map(i => moveCard(cards[i], locationFor(i, 'three'), duration(360))));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  effects.setMood('idle');
  setPhase('reading');
  setOracle('남은 카드를 한 장씩 펼쳐 보세요.', { speak: false });
  prepareNextReveal();
  focusUnopenedCard();
}

function prepareNextReveal() {
  const order = ['첫 번째', '두 번째', '세 번째'];
  state.kept.forEach((index, physicalSlot) => {
    const card = cards[index];
    const slot = state.openOrder.indexOf(index);
    const opened = slot >= 0;
    card.button.disabled = false;
    card.button.classList.toggle('can-reveal', !opened);
    const badge = card.button.querySelector('.reveal-number');
    badge.hidden = !opened;
    if (opened) {
      badge.textContent = String(slot + 1);
      card.label.textContent = state.drawn[index].name;
      card.button.setAttribute('aria-label', `${order[slot]} 카드 ${state.drawn[index].name}, ${POSITIONS[slot].label} 설명 다시 읽기`);
    } else {
      card.label.textContent = '눌러서 펼치기';
      card.button.setAttribute('aria-label', `${['왼쪽', '가운데', '오른쪽'][physicalSlot]} 카드, 누르면 ${order[state.revealed]}로 열기`);
    }
  });
  $('#selection-count').innerHTML = `펼친 카드 <strong>${state.revealed} <span>/ 3</span></strong>`;
  $('#reveal-order').hidden = false;
  $$('#reveal-order li').forEach((item, slot) => {
    const opened = slot < state.revealed;
    item.classList.toggle('is-current', slot === state.revealed);
    item.classList.toggle('is-opened', opened);
    item.querySelector('small').textContent = opened ? state.drawn[state.openOrder[slot]].name : POSITIONS[slot].label;
    if (slot === state.revealed) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  $('#action-button').hidden = state.revealed < 3;
  $('#action-button').disabled = false;
  $('#action-button span').textContent = '풀이 보기';
  if (state.revealed < 3) {
    setTitle(`${order[state.revealed]} 카드를 펼쳐 주세요`, '원하는 카드부터 눌러 주세요.');
    setStageCaption();
  } else {
    setTitle('나에게 남은 세 장', '열린 카드를 누르면 카드별 풀이를 볼 수 있어요.');
  }
}

function focusUnopenedCard() {
  const index = state.kept.find(index => !state.openOrder.includes(index));
  if (index !== undefined) cards[index].button.focus({ preventScroll: true });
}

function revealFlash(x, y, color) {
  if (!state.reduced) effects.burst(x, y, { kind: 'spark', color, power: .25 });
}

async function revealCard(index) {
  if (state.phase !== 'reading' || state.busy || state.revealed >= 3 || !state.kept.includes(index) || state.openOrder.includes(index)) return;
  const epoch = state.epoch;
  const slot = state.revealed;
  const card = cards[index];
  const data = state.drawn[card.index];
  const reading = getReading(data, state.topic, slot);
  setPhase('revealing');
  // Reserve the chosen order before the artwork is visible, including across a reload.
  state.openOrder.push(index);
  const saved = saveProgress();
  $('#reading-open').disabled = true;
  $('#action-button').disabled = true;
  $('#action-button span').textContent = '카드를 펼치고 있어요';
  state.kept.forEach(index => { cards[index].button.disabled = true; cards[index].button.classList.remove('can-reveal'); });
  const pose = locationFor(card.index, 'three');
  card.wrap.style.zIndex = '20';
  play('reveal');
  const revealPose = state.reduced ? pose : { ...pose, y: pose.y - 8, s: 1.04, r: 0 };
  moveCard(card, revealPose, duration(180));
  await sleep(duration(100));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  if (!await confirmProgress(saved, epoch)) return;
  card.turner.classList.add('flipped');
  await sleep(duration(340));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  const c = centerOf(card);
  revealFlash(c.x, c.y, data.color);
  card.button.classList.add('revealed');
  card.wrap.querySelector('.card-front').setAttribute('aria-hidden', 'false');
  setOracle(reading.summary || reading.text, { title: data.name, tag: `${slot + 1}번째 카드 · ${POSITIONS[slot].label}`, keyword: reading.keyword });
  await moveCard(card, pose, duration(180));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  state.revealed = state.openOrder.length;
  state.lastReading = slot;
  setPhase(state.revealed === 3 ? 'complete' : 'reading');
  prepareNextReveal();
  $('#reading-open').hidden = false;
  $('#reading-open').disabled = false;
  $('#reading-open span').textContent = '카드 풀이 읽기';
  if (state.revealed === 3) {
    effects.setMood('idle');
    $('#restart-small').hidden = false;
    setStageCaption('열린 카드를 누르면 풀이를 다시 볼 수 있어요');
    play('complete');
    buildResults();
    $('#action-button').focus({ preventScroll: true });
  } else {
    focusUnopenedCard();
  }
}

function narrativeParagraphs(paragraphs, fallback = '') {
  const content = Array.isArray(paragraphs) && paragraphs.length ? paragraphs : String(fallback).split(/\n\s*\n/);
  return content.filter(text => typeof text === 'string' && text.trim());
}

function setReadingText(container, text, cardNames = []) {
  container.replaceChildren();
  let start = 0;
  for (const match of text.matchAll(/‘([^’]+)’|“([^”]+)”/gu)) {
    const name = match[1] || match[2];
    if (!cardNames.some(cardName => name === cardName || name.endsWith(`(${cardName})`))) continue;
    container.append(document.createTextNode(text.slice(start, match.index)));
    const emphasis = document.createElement('strong');
    emphasis.className = 'reading-card-name';
    emphasis.textContent = match[0];
    container.append(emphasis);
    start = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(start)));
}

function showReading(slot = state.lastReading) {
  if (expireDisplayedReading() || slot < 0 || slot >= state.revealed || state.busy) return;
  const data = state.drawn[state.openOrder[slot]];
  const reading = getReading(data, state.topic, slot);
  state.lastReading = slot;
  if (!cardReader.setPages(buildCardPages(data, reading, {
    positionLabel: `${['첫 번째', '두 번째', '세 번째'][slot]} 자리 · ${POSITIONS[slot].label}`
  }), { preserve: false })) return;
  $('#reading-date').textContent = TOPICS.find(topic => topic.id === state.topic).label;
  $('#reading-finish').textContent = state.revealed < 3 ? '다음 카드 펼치기' : '종합 풀이 보기';
  $('#reading-open span').textContent = state.revealed < 3 ? '이 카드의 이야기 자세히 읽기' : '종합 점괘 자세히 보기';
  $('#reading-open').hidden = false;
  $('#reading-open').disabled = false;
  if (state.revealed === 3) showOverallOracle();
  openDialog('reading-dialog');
}

function showOverallOracle(summary = getSummary(state.openOrder.map(index => state.drawn[index]), state.topic)) {
  setOracle(state.summaryReady ? summary.oneLine : '세 장에 담긴 나의 이야기를 함께 살펴본다.', { tag: state.summaryReady ? '종합 점괘 · 핵심 풀이' : '종합 점괘', speak: false });
  $('#reading-open span').textContent = '종합 점괘 자세히 보기';
  $('#reading-open').hidden = false;
  $('#reading-open').disabled = false;
}

function summaryGroups(summary) {
  return Array.isArray(summary.groups) && summary.groups.length
    ? summary.groups
    : [{ id: 'problem', label: '문제 해결', sections: summary.sections || [] }];
}

const SUMMARY_DETAIL_TITLE = '함께 읽는 종합 해석';
const readerOptions = {
  canRead: () => !expireDisplayedReading(),
  renderText: (node, text) => setReadingText(node, text, state.openOrder.map(index => state.drawn[index]?.name).filter(Boolean)),
  renderArtwork: applyArtwork
};
function finishCardReading() {
  if (expireDisplayedReading()) return;
  closeDialog('reading-dialog');
  if (state.phase === 'complete') void showResults();
  else if (state.phase === 'reading') focusUnopenedCard();
}
const cardReader = createReadingReader({
  ...readerOptions, dialog: $('#reading-dialog'), prefix: 'reading', onFinish: finishCardReading
});
const resultReader = createReadingReader({
  ...readerOptions, dialog: $('#result-dialog'), prefix: 'result', onFinish: () => closeDialog('result-dialog')
});
const resultActions = document.createElement('div');
resultActions.className = 'reader-actions';
resultActions.innerHTML = `<button id="copy-result" class="secondary-button" type="button">${icon('copy')}전체 풀이 복사</button><button id="restart-result" class="secondary-button" type="button">${icon('reset')}<span>다른 주제 고르기</span></button>`;
resultReader.setMenuActions(resultActions);
const cardFinish = document.createElement('button');
cardFinish.type = 'button';
cardFinish.id = 'reading-finish';
cardFinish.className = 'secondary-button';
cardFinish.textContent = '다음 카드 펼치기';
cardFinish.addEventListener('click', finishCardReading);
cardReader.setMenuActions(cardFinish);

function updateResultPages({ report, picker, changed }) {
  if (!resultContext || expireDisplayedReading() || state.phase !== 'complete') return false;
  const pages = buildSummaryPages(resultContext.summary, { cards: resultContext.cards, personalReport: report });
  const startId = changed ? pages.find(page => page.groupId === 'personal')?.id : undefined;
  if (!resultReader.setPages(pages, { startId, preserve: !changed })) return false;
  resultReader.setMenuTools(picker);
  if (changed && startId) return resultReader.show(startId);
  return true;
}

function buildResults() {
  const drawn = state.openOrder.map(index => state.drawn[index]);
  const summary = getSummary(drawn, state.topic);
  const topic = TOPICS.find(t => t.id === state.topic);
  const readingDate = !billing.adminPreview && billing.record?.readingDay ? new Date(`${billing.record.readingDay}T12:00:00+09:00`) : new Date();
  $('#result-date').textContent = `${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(readingDate)} · ${topic.label}${billing.adminPreview ? ' · 관리자 모드' : ''}`;
  resultContext = { summary, cards: drawn };
  if (personalReading?.mount({ cards: drawn, topicId: state.topic }) === false) return;
  showOverallOracle(summary);
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog.open) return;
  lastFocus = document.activeElement;
  dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('.modal-close')?.focus();
}
function closeDialog(id) {
  document.getElementById(id).close();
}
$$('dialog').forEach(dialog => {
  dialog.addEventListener('close', () => { lastFocus?.focus?.(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
});
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
$('#help-open').addEventListener('click', () => openDialog('help-dialog'));

function showResults() {
  if (expireDisplayedReading() || state.phase !== 'complete' || state.revealed !== 3 || $('#result-dialog').open) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  state.summaryReady = true;
  showOverallOracle();
  openDialog('result-dialog');
}

async function copyResult() {
  if (expireDisplayedReading() || state.revealed !== 3) return;
  const epoch = state.epoch;
  const drawn = state.openOrder.map(i => state.drawn[i]);
  const summary = getSummary(drawn, state.topic);
  const parts = ['오쭈다 · 달의 마녀 타로', '종합 점괘', $('#result-date').textContent, ''];
  const appendSection = section => {
    parts.push(section.number ? `${section.number}. ${section.title}` : section.title);
    if (section.subtitle) parts.push(section.subtitle);
    narrativeParagraphs(section.paragraphs, section.body || '').forEach(paragraph => parts.push(paragraph, ''));
  };
  const appendReference = reference => {
    if (reference?.url) parts.push(`${reference.label || '참고 자료'}: ${reference.url}`, '');
  };
  summaryGroups(summary).forEach(group => {
    parts.push(group.label, '');
    if (group.description) parts.push(group.description, '');
    if (group.categories?.length) {
      group.categories.forEach(category => {
        parts.push(category.label, '');
        group.sections.filter(section => section.categoryId === category.id).forEach(appendSection);
      });
    } else group.sections.forEach(section => {
      appendSection(section);
      if (group.id !== 'cards') return;
      if (section.nameGuide) parts.push('카드 이름 더 알아보기', section.nameGuide, '');
      if (section.detailSections?.length) {
        parts.push('카드의 뜻과 주의점 더 보기', '');
        section.detailSections.forEach(appendSection);
      }
      appendReference(section.reference);
      if (section.sourceNote) {
        parts.push('다르게 읽는 풀이', section.sourceNote.body, '');
        appendReference(section.sourceNote.reference);
      }
    });
    if (group.id === 'cards') {
      if (group.detailSections?.length) {
        parts.push('세 카드를 함께 읽는 법', '');
        group.detailSections.forEach(appendSection);
      }
      if (group.basisParagraphs?.length) parts.push('풀이 방식과 범위', ...group.basisParagraphs, '');
    }
    if (group.id === 'problem' && Array.isArray(summary.detailSections) && summary.detailSections.length) {
      parts.push(SUMMARY_DETAIL_TITLE, '');
      summary.detailSections.forEach(appendSection);
    }
  });
  parts.push(...(personalReading?.copyLines() || []));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  if (!summary.ritualInReading) parts.push(`이렇게 해 보세요: ${summary.ritual}`, '');
  const text = parts.join('\n');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    showToast('종합 점괘를 복사했어요.');
  } catch {
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;inset:25% 10% auto;width:80%;height:45%;z-index:101;background:#1b112a;color:#eee;padding:20px;border:1px solid #b99563;border-radius:8px';
    textarea.setAttribute('aria-label', '복사할 종합 점괘');
    $('#result-dialog').append(textarea);
    textarea.focus();
    textarea.select();
    if (document.execCommand('copy')) {
      textarea.remove();
      showToast('종합 점괘를 복사했어요.');
    } else {
      showToast('선택된 글을 길게 누르거나 Ctrl+C를 눌러 복사해 주세요.');
      textarea.addEventListener('blur', () => textarea.remove(), { once: true });
    }
  }
}

function reset({ clearPaid = true } = {}) {
  personalReading?.reset();
  state.epoch++;
  if (clearPaid && !billing.pending) billing.newReading();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $$('dialog[open]').forEach(dialog => dialog.close());
  state.discarded.clear();
  state.kept = [];
  state.openOrder = [];
  state.drawn = [];
  state.revealed = 0;
  state.lastReading = -1;
  state.summaryReady = false;
  state.readingExpiresAt = null;
  setPhase('intro');
  cards.forEach(card => {
    card.wrap.getAnimations().forEach(a => a.cancel());
    card.wrap.hidden = false;
    card.wrap.style.opacity = '';
    card.wrap.style.filter = '';
    card.turner.classList.remove('flipped');
    card.button.classList.remove('selected', 'not-selected', 'revealed', 'can-reveal');
    card.button.disabled = true;
    card.button.removeAttribute('aria-pressed');
    card.button.setAttribute('aria-label', `${card.index + 1}번째 카드`);
    card.wrap.querySelector('.card-front').setAttribute('aria-hidden', 'true');
    card.wrap.querySelectorAll('.front-title strong, .front-title span, .front-numeral').forEach(node => { node.textContent = ''; });
    ['--art-image', '--art-size', '--art-x', '--art-y', '--card-color'].forEach(name => card.wrap.style.removeProperty(name));
    card.label.textContent = '';
    card.button.querySelector('.reveal-number').hidden = true;
  });
  resultContext = null;
  cardReader.reset();
  resultReader.reset();
  resultReader.setMenuTools(null);
  $('#result-dialog').querySelectorAll('textarea').forEach(node => node.remove());
  $('#intro-controls').hidden = false;
  $('#play-controls').hidden = true;
  $('#restart-small').hidden = true;
  $('#discard-preview').hidden = true;
  $('#reveal-order').hidden = true;
  $('#reading-open').hidden = true;
  $('#reading-open span').textContent = '이 카드의 이야기 자세히 읽기';
  $('#summon-button').disabled = !billingReady;
  $('#summon-button span').textContent = billing.enabled ? `${getTarotPrice(state.topic)}쭈로 운세 시작하기` : '마녀의 카드 불러오기';
  $$('[data-topic]').forEach(button => { button.disabled = false; });
  $('#login-link').hidden = true;
  updatePaymentStatus();
  setView('topics');
  updateSendProgress();
  setStageCaption();
  setOracle('이번에는 어떤 이야기가 궁금한가요?', { speak: false });
  effects.setMood('idle');
  layout(false);
  $('#game-title').focus({ preventScroll: true });
  if (innerWidth <= 760) window.scrollTo({ top: 0, behavior: state.reduced ? 'instant' : 'smooth' });
  if (clearPaid) void refreshReadingAvailability();
}

$('#welcome-next').addEventListener('click', () => { setView('topics', true); });
$('#tarot-back').addEventListener('click', () => {
  if (state.busy || billing.pending) return;
  if (app.dataset.view === 'welcome') {
    window.location.assign($('#azit-back').getAttribute('href') || '/world.html?tab=hub#agit-daily');
  } else if (state.phase === 'intro') {
    setView('welcome', true);
  } else {
    // Going back changes the screen, never the saved paid draw or its progress.
    reset({ clearPaid: false });
  }
});
$('#summon-button').addEventListener('click', summon);
$('#action-button').addEventListener('click', () => {
  if (state.phase === 'complete') void showResults();
});
$('#restart-small').addEventListener('click', reset);
$('#restart-result').addEventListener('click', reset);
$('#copy-result').addEventListener('click', copyResult);
$('#reading-open').addEventListener('click', () => {
  if (state.phase === 'complete') void showResults();
  else showReading();
});
$$('[data-topic]').forEach(button => button.addEventListener('click', () => {
  if (state.phase !== 'intro' || state.busy) return;
  state.topic = button.dataset.topic;
  $$('[data-topic]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  const invitations = {
    overall: '오늘 마음에 남은 일을 하나 떠올려 봐.',
    love: '지금 내 마음을 차분히 살펴본다.',
    money: '돈에 관해 마음에 걸리는 일을 떠올려 보렴.',
    work: '지금 살릴 강점과 필요한 도움을 짚어 보자.',
  };
  setOracle(invitations[state.topic], { tag: '마녀의 초대' });
  updatePaymentStatus();
  void refreshReadingAvailability();
  play('hover');
}));

$('#sound-toggle').addEventListener('click', async () => {
  const next = !state.sound;
  if (next) {
    try {
      const enabled = await audio.enable();
      if (enabled === false) { showToast('이 브라우저에서는 효과음을 재생할 수 없어요.'); return; }
    } catch { showToast('효과음을 켜지 못했어요. 다시 눌러 주세요.'); return; }
  }
  state.sound = next;
  audio.setMuted(!next);
  $('#sound-toggle').setAttribute('aria-pressed', String(next));
  $('#sound-toggle').title = next ? '효과음 끄기' : '효과음 켜기';
  $('#sound-toggle').innerHTML = `${icon(next ? 'sound' : 'muted')}<span>효과음 ${next ? 'ON' : 'OFF'}</span>`;
  if (next) play('hover');
});

function applyMotionPreference(value) {
  state.reduced = value;
  document.body.classList.toggle('reduced-motion', value);
  $('#motion-toggle').setAttribute('aria-pressed', String(value));
  $('#motion-toggle').setAttribute('aria-label', value ? '마법 연출 켜기' : '움직임 줄이기');
  $('#motion-toggle').title = value ? '마법 연출 켜기' : '움직임 줄이기';
  effects.setReducedMotion(value);
  if (value) cards.forEach(card => card.wrap.getAnimations().forEach(animation => {
    try { animation.finish(); } catch { /* Already finished or cancelled. */ }
  }));
}
$('#motion-toggle').addEventListener('click', () => {
  applyMotionPreference(!state.reduced);
  showToast(state.reduced ? '움직임을 줄였어요.' : '마법 연출을 켰어요.');
});
mediaMotion.addEventListener('change', event => applyMotionPreference(event.matches));

$('#voice-toggle').addEventListener('click', () => {
  if (expireDisplayedReading()) return;
  if (!('speechSynthesis' in window)) { showToast('이 브라우저에서는 안내 음성을 지원하지 않아요.'); return; }
  state.voice = !state.voice;
  $('#voice-toggle').setAttribute('aria-pressed', String(state.voice));
  $('#voice-toggle').setAttribute('aria-label', state.voice ? '마녀의 안내 음성 끄기' : '마녀의 안내 음성 켜기');
  $('#voice-toggle').title = state.voice ? '안내 음성 끄기' : '안내 음성 켜기';
  if (state.voice) speakText($('#oracle-text').textContent);
  else speechSynthesis.cancel();
});

let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { if (!state.busy) layout(false); });
}, { passive: true });
window.addEventListener('pagehide', () => {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (state.sound) audio.setMuted(true);
});
window.addEventListener('pageshow', event => { if (event.persisted && state.sound) audio.setMuted(false); void refreshReadingAvailability(); });
window.addEventListener('focus', () => { void refreshReadingAvailability(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshReadingAvailability(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && 'speechSynthesis' in window) speechSynthesis.cancel();
});
applyMotionPreference(state.reduced);
setView(app.dataset.view || 'welcome');
layout(false);
$('#oracle-text').textContent = '마음에 걸리는 일을 하나 떠올려 보렴.';
// Start image requests while the visitor chooses a topic; five cards share at most five atlases.
for (const src of new Set(DECK.map(card => card.art.src))) {
  const atlas = new Image();
  atlas.src = src;
}

function restorePaidReading(receipt) {
  state.readingExpiresAt = receipt.reset_at;
  if (expireDisplayedReading()) return;
  scheduleReadingRefresh();
  const drawn = receipt.drawn?.map(id => DECK.find(card => card.id === id));
  if (!drawn || drawn.length !== 5 || drawn.some(card => !card) || new Set(drawn.map(card => card.id)).size !== 5) throw new Error('저장된 카드를 불러오지 못했어요. 새로고침 후 다시 확인해 주세요.');
  state.drawn = drawn;
  state.summaryReady = false;
  state.topic = receipt.topic;
  $$('[data-topic]').forEach(button => {
    button.classList.toggle('active', button.dataset.topic === state.topic);
    button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic));
  });
  state.discarded = new Set(receipt.discarded);
  updateSendProgress();
  state.openOrder = [...receipt.openOrder];
  state.revealed = state.openOrder.length;
  state.kept = state.discarded.size === 2 ? cards.map(card => card.index).filter(index => !state.discarded.has(index)) : [];
  state.lastReading = state.revealed - 1;
  $('#intro-controls').hidden = true;
  $('#play-controls').hidden = false;
  cards.forEach((card, index) => {
    setCardArtwork(card, state.drawn[index]);
    card.wrap.hidden = state.discarded.has(index);
    const opened = state.openOrder.includes(index);
    card.turner.classList.toggle('flipped', opened);
    card.button.classList.toggle('revealed', opened);
    card.wrap.querySelector('.card-front').setAttribute('aria-hidden', String(!opened));
  });
  if (state.kept.length) {
    setPhase(state.revealed === 3 ? 'complete' : 'reading');
    prepareNextReveal();
    if (state.revealed === 3) {
      buildResults();
      setTitle('선택한 카드를 확인해 주세요', '세 장에 담긴 이야기를 살펴볼게요.');
      setStageCaption('열린 카드를 누르면 풀이를 다시 볼 수 있어요');
      $('#restart-small').hidden = false;
    }
  } else {
    setPhase('choosing');
    updateChoiceProgress();
  }
  if (state.revealed > 0 && state.revealed < 3) {
    const data = state.drawn[state.openOrder[state.lastReading]];
    const reading = getReading(data, state.topic, state.lastReading);
    setOracle(reading.summary, { title: data.name, tag: '다시 찾아온 카드 이야기', keyword: reading.keyword, speak: false });
    $('#reading-open').hidden = false;
    $('#reading-open').disabled = false;
    $('#reading-open span').textContent = '이 카드의 이야기 자세히 읽기';
  } else if (!state.revealed) setOracle('아까의 이야기를 이어 가자.', { tag: '이어보기', speak: false });
  effects.setMood('idle');
  layout(false);
  updatePaymentStatus();
}

async function initializeBilling() {
  $('#summon-button').disabled = true;
  $('#azit-back').hidden = !billing.enabled;
  $('#summon-button span').textContent = billing.enabled ? `${getTarotPrice(state.topic)}쭈로 운세 시작하기` : '마녀의 카드 불러오기';
  $('#payment-status').textContent = billing.enabled ? '로그인 상태와 보유한 쭈를 확인하고 있어요…' : '미리보기 · 실제 쭈는 차감되지 않아요';
  try {
    const result = await billing.init();
    recordFortuneVisit();
    billingReady = true;
    if (result.resume) {
      restorePaidReading(result.resume);
      if (result.resume.progressChanged) showToast('다른 화면에 저장된 점괘를 불러왔어요.');
    }
    else if (result.pending) {
      state.topic = result.pending.topic;
      $$('[data-topic]').forEach(button => {
        button.disabled = true;
        button.classList.toggle('active', button.dataset.topic === state.topic);
        button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic));
      });
      updatePaymentStatus();
      $('#summon-button span').textContent = '같은 운세 다시 확인하기';
      $('#payment-status').textContent = '진행하던 운세를 이어서 확인해 주세요. 같은 운세의 이용 금액은 한 번만 차감돼요.';
    }
    else if (result.signedIn === false) {
      $('#payment-status').textContent = '아지트에 로그인한 뒤 이용해 주세요.';
      $('#login-link').hidden = false;
    } else {
      updatePaymentStatus();
      if (result.expired) $('#payment-status').textContent = '24시간이 지나 풀이가 만료됐어요. 다시 결제해 주세요.';
    }
    $('#summon-button').disabled = result.signedIn === false;
    scheduleReadingRefresh();
  } catch (error) {
    billingReady = !!billing.user;
    if (!billing.adminPreview && billing.record && (!billing.record.paid || billing.record.unsynced)) {
      state.topic = billing.record.topic;
      $$('[data-topic]').forEach(button => {
        button.classList.toggle('active', button.dataset.topic === state.topic);
        button.setAttribute('aria-pressed', String(button.dataset.topic === state.topic));
      });
      updatePaymentStatus();
      $('#summon-button span').textContent = '진행하던 운세 이어보기';
    }
    $('#summon-button').disabled = !billingReady;
    $('#payment-status').textContent = error.message;
    $$('[data-topic]').forEach(button => { button.disabled = !billing.adminPreview && !!billing.record && (!billing.record.paid || billing.record.unsynced); });
    if (!billingReady) $('#login-link').hidden = false;
  }
}
personalReading = createPersonalReading({
  getSnapshot: () => ({
    topicId: state.topic, phase: state.phase, busy: state.busy,
    complete: state.phase === 'complete' && state.revealed === 3,
    cards: state.openOrder.map(index => state.drawn[index])
  }),
  canRead: () => !expireDisplayedReading(),
  onReport: updateResultPages
});
void initializeBilling();

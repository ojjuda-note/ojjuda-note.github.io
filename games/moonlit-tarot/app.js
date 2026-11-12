import { DECK, TOPICS, POSITIONS, getReading, getSummary } from './readings.js?v=20261113-tarot-corpus1';
import { TarotFX, TarotAudio } from './fx.js';
import { TarotPayment, getTarotPrice } from './payment.js?v=20261113-tarot-24h1';
import { TarotRevelation } from './revelation.js?v=20261112-tarot-daily1';

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
const effects = new TarotFX({ canvas: $('#magic-canvas'), reducedMotion: state.reduced });
const audio = new TarotAudio();
const cards = [];
const discardGhosts = new Map();
let lastFocus = null;
let toastTimeout;
let oracleTimeout;
let trailRaf = null;
let voiceNoticeShown = false;
let billingReady = false;
let readingExpiryTimer;
const billing = new TarotPayment({
  enabled: document.documentElement.dataset.billing === 'ojjuda',
  onBalance: updatePaymentStatus,
  onModeChange: handleBillingModeChange,
  onAccountChange: () => {
    reset({ clearPaid: false });
    billingReady = false;
    clearTimeout(readingExpiryTimer);
    $('#summon-button').disabled = true;
    $('#payment-status').textContent = '로그인이 바뀌었어요. 새로고침 후 다시 이용해 주세요.';
    $('#login-link').hidden = false;
  }
});

function handleBillingModeChange() {
  clearTimeout(readingExpiryTimer);
  if (!billingReady) { updatePaymentStatus(); return; }
  // A mode change must never carry preview cards into a paid reading.
  reset({ clearPaid: false });
  showToast(billing.adminPreview ? '관리자 모드예요. 매번 새로운 운세를 볼 수 있어요.' : '관리자 모드가 꺼졌어요. 오늘의 운세를 확인해 주세요.');
  if (!billing.adminPreview) void refreshReadingAvailability({ verifyMode: false });
}

function updatePaymentStatus() {
  $('#summon-button').dataset.replay = 'false';
  if (!billing.enabled) { $('.tarot-price strong').textContent = `1회 ${getTarotPrice(state.topic)}쭈`; return; }
  const preview = billing.adminPreview;
  app.dataset.adminPreview = String(preview);
  $('.tarot-price strong').textContent = preview ? '관리자 모드' : `1회 ${getTarotPrice(state.topic)}쭈`;
  $('.tarot-price span').textContent = preview ? '쭈 차감 없음 · 기록 미저장' : '세 장의 풀이와 종합 점괘';
  $('#daily-limit-note').textContent = preview ? '횟수 제한 없이 매번 새로운 카드로 시작해요.' : '결제 후 24시간 이용 · 만료 후 재결제';
  $('#help-usage-note').textContent = preview ? '쭈 차감·기록 저장 없이 횟수 제한 없이 이용해요. 일반 이용은 아지트에서 관리자 모드를 꺼 주세요.' : '전체 30쭈 · 연애·금전·일과 도전 각 10쭈. 결제 후 24시간 동안 다시 보기는 무료이며, 만료 후에는 다시 결제해요.';
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
  $('#payment-status').textContent = unfinished ? '시작하던 운세를 이어서 확인해요.' : previous ? `${expires}까지 다시 보기 무료${balance ? ' · ' + balance : ''}` : balance;
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
  wrap.innerHTML = `<div class="card-pivot"><button class="card" type="button" disabled aria-label="${index + 1}번째 카드" data-index="${index}"><div class="card-turner"><div class="card-back">${backArtwork(index)}</div><div class="card-front" aria-hidden="true"><div class="front-art"></div><div class="front-shade"></div><div class="front-border"></div><span class="front-numeral"></span><div class="front-title"><strong></strong><span></span></div></div></div><span class="card-mark" aria-hidden="true">×</span></button><span class="card-label"></span></div>`;
  plane.append(wrap);
  const card = { wrap, button: wrap.querySelector('button'), turner: wrap.querySelector('.card-turner'), label: wrap.querySelector('.card-label'), pose: null, index };
  card.button.insertAdjacentHTML('beforeend', `<span class="discard-tint" aria-hidden="true"></span><span class="discard-tag" aria-hidden="true"><b>${String(index + 1).padStart(2, '0')}번 · 버리는 중</b><small>별빛으로 사라지는 중</small></span>`);
  card.button.insertAdjacentHTML('beforeend', '<span class="reveal-number" hidden aria-hidden="true"></span>');
  card.button.addEventListener('click', () => onCard(index));
  card.button.addEventListener('pointerenter', () => { if (!card.button.disabled && state.sound) audio.play('hover'); });
  cards.push(card);
}

const duration = (ms) => state.reduced ? Math.min(150, ms) : ms;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const poseTransform = (p) => `translate3d(calc(-50% + ${p.x}px),calc(-50% + ${p.y}px),${p.z || 0}px) rotateZ(${p.r || 0}deg) rotateY(${p.ry || 0}deg) scale(${p.s ?? 1})`;
function locationFor(index, arrangement = 'five') {
  const w = arena.clientWidth;
  const cw = cards.find(card => !card.wrap.hidden)?.wrap.offsetWidth || 100;
  if (arrangement === 'intro') {
    const gap = Math.min(112, (w - cw - 48) / 4);
    return { x: (index - 2) * gap, y: [19, -7, -17, -7, 19][index], r: (index - 2) * 8, s: 1 };
  }
  if (arrangement === 'three') {
    const slot = state.kept.indexOf(index);
    const gap = Math.min(cw + 48, (w - cw - 42) / 2);
    return { x: (slot - 1) * gap, y: slot === 1 ? -7 : 5, r: (slot - 1) * 3, s: 1 };
  }
  const gap = Math.min(cw + 24, (w - cw - 34) / 4);
  return { x: (index - 2) * gap, y: [5, 0, -4, 0, 5][index], r: (index - 2) * 1.2, s: 1 };
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
  const arrangement = state.phase === 'intro' ? 'intro' : state.kept.length ? 'three' : 'five';
  cards.forEach(card => {
    if (card.wrap.hidden || (state.kept.length && !state.kept.includes(card.index))) return;
    moveCard(card, locationFor(card.index, arrangement), animate ? duration(650) : 0);
    card.wrap.style.zIndex = String(['discard', 'discarding'].includes(state.phase) && state.discarded.has(card.index) ? 40 + card.index : 7 - Math.abs(card.index - 2));
  });
  discardGhosts.forEach((ghost, index) => { ghost.style.transform = poseTransform(locationFor(index, 'five')); });
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
function setPhase(phase) {
  const wasBusy = state.busy;
  state.phase = phase;
  app.dataset.phase = phase;
  const busy = ['summoning', 'discarding', 'revealing'].includes(phase);
  state.busy = busy;
  if (wasBusy && !busy) layout(false);
  arena.setAttribute('aria-busy', String(busy));
  const step = phase === 'summoning' ? 0 : ['discard', 'discarding'].includes(phase) ? 1 : ['reading', 'revealing', 'complete'].includes(phase) ? 2 : -1;
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

function followFlightTrails() {
  if (trailRaf) cancelAnimationFrame(trailRaf);
  if (state.reduced) return;
  const tick = () => {
    if (state.phase !== 'summoning') { trailRaf = null; return; }
    cards.forEach((card, i) => {
      const c = centerOf(card);
      effects.trail(c.x, c.y + card.wrap.offsetHeight * .3, i % 2 ? '#c998ee' : '#e2c28b');
    });
    trailRaf = requestAnimationFrame(tick);
  };
  trailRaf = requestAnimationFrame(tick);
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
  let receipt;
  try {
    receipt = await billing.start(state.topic);
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    state.readingExpiresAt = receipt?.reset_at || null;
    if (expireDisplayedReading()) return;
    scheduleReadingRefresh();
    if (receipt && (receipt.discarded?.length || receipt.openOrder?.length)) {
      restorePaidReading(receipt);
      if (state.revealed === 3) void showResultsWithRevelation();
      if (receipt.progressChanged) showToast('다른 화면에 저장된 점괘를 불러왔어요.');
      return;
    }
    state.drawn = receipt ? receipt.drawn.map(id => DECK.find(card => card.id === id)) : randomDeck();
    if (state.drawn.length !== 5 || state.drawn.some(card => !card) || new Set(state.drawn.map(card => card.id)).size !== 5) throw new Error('카드를 불러오지 못했어요. 다시 눌러 같은 운세를 확인해 주세요.');
    if (receipt) state.topic = receipt.topic;
  } catch (error) {
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    state.busy = false;
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
  cards.forEach((card, i) => setCardArtwork(card, state.drawn[i]));
  $('#intro-controls').hidden = true;
  $('#play-controls').hidden = false;
  $('#action-button').hidden = false;
  $('#selection-count').textContent = '카드를 모으는 중';
  $('#action-button').disabled = true;
  $('#action-button span').textContent = '카드가 날아오는 중';
  setStageCaption();
  setPhase('summoning');
  updatePaymentStatus();
  setTitle('카드를 불러오는 중', '', 'THE SUMMONING');
  setOracle('잠시만 기다려 보렴.', { tag: '마녀의 속삭임' });
  effects.setMood('dealing');
  play('summon');
  followFlightTrails();
  const areaWidth = arena.clientWidth;
  const arcX = Math.min(areaWidth * .34, 290);
  const arcY = Math.min(100, arena.clientHeight * .4);
  await Promise.all(cards.map(async (card, index) => {
    if (state.reduced) return moveCard(card, locationFor(index), 0);
    const initial = card.wrap.style.transform;
    const keys = [{ transform: initial, offset: 0 }];
    const phase = index / 5 * Math.PI * 2;
    for (let step = 1; step <= 11; step++) {
      const t = step / 12;
      const angle = phase + t * Math.PI * 3.7;
      keys.push({
        transform: poseTransform({ x: Math.cos(angle) * arcX * (.7 + .3 * Math.sin(t * Math.PI)), y: Math.sin(angle) * arcY - 40 * Math.sin(t * Math.PI), r: Math.sin(angle) * 25 + t * 360, ry: Math.cos(angle) * 40, s: .77 + .24 * (Math.sin(angle) + 1) / 2 }),
        offset: .1 + t * .72,
      });
    }
    const final = locationFor(index);
    keys.push({ transform: poseTransform({ ...final, y: final.y - 10, r: final.r + 360 }), offset: .94 });
    keys.push({ transform: poseTransform({ ...final, r: final.r + 360 }), offset: 1 });
    const animation = card.wrap.animate(keys, { duration: 3700 + index * 140, easing: 'linear', fill: 'forwards' });
    try { await animation.finished; } catch { return; }
    if (epoch !== state.epoch || expireDisplayedReading()) return;
    card.wrap.style.transform = poseTransform(final);
    card.pose = final;
    animation.cancel();
    const c = centerOf(card);
    effects.burst(c.x, c.y + card.wrap.offsetHeight * .4, { color: '#d6b988', power: .55, kind: 'land' });
    play('deal');
  }));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  effects.setMood('idle');
  setPhase('discard');
  setTitle('버릴 카드 두 장을 고르세요', '누르면 바로 버려져요.', 'THE CHOICE');
  setOracle('마음이 덜 가는 카드부터 골라 보렴.', { tag: '마녀의 속삭임' });
  updateDiscardProgress();
}

function onCard(index) {
  if (expireDisplayedReading() || state.busy) return;
  if (state.phase === 'discard') discardCard(index);
  else if (['reading', 'complete'].includes(state.phase) && state.kept.includes(index)) {
    const slot = state.openOrder.indexOf(index);
    if (slot >= 0) showReading(slot);
    else if (state.phase === 'reading') revealCard(index);
  }
}

function updateDiscardProgress() {
  const count = state.discarded.size;
  const numbers = [...state.discarded].map(index => String(index + 1).padStart(2, '0'));
  cards.forEach(card => {
    const discarded = state.discarded.has(card.index);
    card.button.disabled = discarded || state.busy;
    card.button.removeAttribute('aria-pressed');
    card.button.setAttribute('aria-label', `${card.index + 1}번 카드${discarded ? ', 버린 카드' : ', 누르면 바로 버리기'}`);
    card.label.textContent = discarded ? '' : `${String(card.index + 1).padStart(2, '0')}번`;
  });
  $('#selection-count').innerHTML = `버린 카드 <strong>${count} <span>/ 2</span></strong>`;
  $('#discard-preview').hidden = !count;
  $('#discard-preview').innerHTML = count ? `<span class="discard-preview-title">버린 카드</span>${numbers.map(number => `<span class="discard-number">× <b>${number}번</b></span>`).join('')}` : '';
  $('#action-button').hidden = true;
  setStageCaption();
}

function leaveDiscardGhost(card, pose) {
  const ghost = document.createElement('div');
  ghost.className = 'discard-slot';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = `<span>×</span><b>${String(card.index + 1).padStart(2, '0')}번</b><small>버린 카드</small>`;
  ghost.style.transform = poseTransform(pose);
  plane.append(ghost);
  discardGhosts.set(card.index, ghost);
}

async function discardCard(index) {
  if (state.phase !== 'discard' || state.busy || state.discarded.size >= 2 || state.discarded.has(index)) return;
  const epoch = state.epoch;
  const card = cards[index];
  const original = locationFor(index, 'five');
  state.discarded.add(index);
  const saved = saveProgress();
  setPhase('discarding');
  effects.setMood('discard');
  updateDiscardProgress();
  setStageCaption(`${String(index + 1).padStart(2, '0')}번 카드를 버렸어요`);
  card.wrap.style.zIndex = '60';
  cards.forEach(item => {
    item.button.classList.toggle('selected', item.index === index);
    item.button.classList.toggle('not-selected', item.index !== index);
  });
  play('discard');
  const focus = { x: 0, y: -24, r: 0, s: innerWidth <= 760 ? 1.18 : 1.12 };
  const frames = state.reduced ? [
    { transform: poseTransform(original), opacity: 1 },
    { transform: poseTransform(original), opacity: 0 },
  ] : [
    { transform: poseTransform(original), opacity: 1, filter: 'brightness(1)' },
    { transform: poseTransform(focus), opacity: 1, filter: 'brightness(1.18)', offset: .28 },
    { transform: poseTransform(focus), opacity: 1, filter: 'brightness(1.8)', offset: .48 },
    { transform: poseTransform({ ...focus, y: -150, r: state.discarded.size === 1 ? -100 : 100, s: .04 }), opacity: 0, filter: 'brightness(2.8)' },
  ];
  const animation = card.wrap.animate(frames, { duration: duration(1200), easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'forwards' });
  await sleep(duration(350));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  const point = centerOf(card);
  effects.burst(point.x, point.y, { kind: 'discard', color: '#ef9cbb', power: 1.25 });
  try { await animation.finished; } catch { return; }
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  if (!await confirmProgress(saved, epoch)) return;
  card.wrap.hidden = true;
  animation.cancel();
  leaveDiscardGhost(card, original);
  cards.forEach(item => item.button.classList.remove('selected', 'not-selected'));
  if (state.discarded.size < 2) {
    setPhase('discard');
    effects.setMood('idle');
    setTitle('한 장 더 버려주세요', '', 'THE CHOICE');
    setOracle('남길 카드에 마음을 기울여 보렴.', { tag: '마녀의 속삭임' });
    updateDiscardProgress();
    cards.find(item => !state.discarded.has(item.index))?.button.focus({ preventScroll: true });
    return;
  }
  state.kept = cards.map(item => item.index).filter(i => !state.discarded.has(i));
  discardGhosts.forEach(ghost => ghost.remove());
  discardGhosts.clear();
  $('#discard-preview').hidden = true;
  await Promise.all(state.kept.map(i => moveCard(cards[i], locationFor(i, 'three'), duration(800))));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  effects.setMood('reading');
  setPhase('reading');
  setOracle('끌리는 카드부터 열어 보렴.', { tag: '마녀의 속삭임' });
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
      card.label.textContent = `${String(slot + 1).padStart(2, '0')} · ${POSITIONS[slot].label}`;
      card.button.setAttribute('aria-label', `${order[slot]} 카드 ${state.drawn[index].name}, ${POSITIONS[slot].label} 설명 다시 읽기`);
    } else {
      card.label.textContent = '✧  선택해 열기';
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
  $('#action-button span').textContent = '종합 점괘 보기';
  if (state.revealed < 3) {
    setTitle(state.revealed === 0 ? '먼저 열 카드를 고르세요' : `${order[state.revealed]} 카드를 고르세요`, '', 'YOUR CHOICE, YOUR STORY');
    setStageCaption();
  }
}

function focusUnopenedCard() {
  const index = state.kept.find(index => !state.openOrder.includes(index));
  if (index !== undefined) cards[index].button.focus({ preventScroll: true });
}

function revealFlash(x, y, color) {
  const flash = $('#screen-flash');
  flash.style.setProperty('--flash-x', `${x}px`);
  flash.style.setProperty('--flash-y', `${y}px`);
  if (!state.reduced) flash.animate([{ opacity: 0 }, { opacity: .7, offset: .14 }, { opacity: .12, offset: .48 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out' });
  effects.burst(x, y, { kind: 'reveal', color, power: 1.3 });
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
  $('#action-button span').textContent = '마녀가 카드를 읽고 있어요';
  state.kept.forEach(index => { cards[index].button.disabled = true; cards[index].button.classList.remove('can-reveal'); });
  const pose = locationFor(card.index, 'three');
  card.wrap.style.zIndex = '20';
  play('reveal');
  const revealPose = state.reduced ? pose : { ...pose, y: pose.y - (innerWidth < 760 ? 10 : 26), s: innerWidth < 760 ? 1.11 : 1.17, r: 0 };
  moveCard(card, revealPose, duration(500));
  await sleep(duration(220));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  if (!await confirmProgress(saved, epoch)) return;
  card.turner.classList.add('flipped');
  await sleep(duration(420));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  const c = centerOf(card);
  revealFlash(c.x, c.y, data.color);
  card.button.classList.add('revealed');
  card.wrap.querySelector('.card-front').setAttribute('aria-hidden', 'false');
  setTitle(`${POSITIONS[slot].label} · ${data.name}`, data.message, `${['I', 'II', 'III'][slot]} · THE REVELATION`);
  setStageCaption(`${String(slot + 1).padStart(2, '0')}  ${data.english}  ✧  ${data.keyword}`);
  setOracle(reading.summary || reading.text, { title: data.name, tag: `${slot + 1}번째 카드 · ${POSITIONS[slot].label}`, keyword: reading.keyword });
  await sleep(duration(1200));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  await moveCard(card, pose, duration(500));
  if (epoch !== state.epoch || expireDisplayedReading()) return;
  state.revealed = state.openOrder.length;
  setPhase(state.revealed === 3 ? 'complete' : 'reading');
  prepareNextReveal();
  if (state.revealed === 3) {
    effects.setMood('reading');
    $('#restart-small').hidden = false;
    setStageCaption('열린 카드를 누르면 풀이를 다시 볼 수 있어요');
    play('complete');
    buildResults();
  }
  if (innerWidth <= 760 && !state.reduced) $('#oracle').animate([{ boxShadow: '0 0 25px rgba(189,147,231,.3)' }, { boxShadow: '0 0 0 transparent' }], { duration: 1800 });
  showReading(slot);
}

function renderReadingSections(container, sections, fallback = '', headingTag = 'h3') {
  container.replaceChildren();
  if (!Array.isArray(sections) || !sections.length) {
    const paragraph = document.createElement('p');
    paragraph.textContent = fallback;
    container.append(paragraph);
    return;
  }
  sections.forEach((part, index) => {
    const section = document.createElement('section');
    section.className = 'reading-part';
    const heading = document.createElement(headingTag);
    const number = document.createElement('span');
    number.className = 'reading-part-number';
    number.textContent = String(index + 1).padStart(2, '0');
    heading.append(number, document.createTextNode(part.title));
    section.append(heading);
    if (part.subtitle) {
      const subtitle = document.createElement(headingTag === 'h3' ? 'h4' : 'h5');
      subtitle.className = 'reading-part-subtitle';
      subtitle.textContent = part.subtitle;
      section.append(subtitle);
    }
    String(part.body || '').split(/\n\s*\n/).filter(Boolean).forEach(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      section.append(paragraph);
    });
    container.append(section);
  });
}

function showReading(slot = state.lastReading) {
  if (expireDisplayedReading() || slot < 0 || slot >= state.revealed || state.busy) return;
  const data = state.drawn[state.openOrder[slot]];
  const reading = getReading(data, state.topic, slot);
  state.lastReading = slot;
  $('#reading-position').textContent = `${['첫 번째', '두 번째', '세 번째'][slot]} 카드 설명 · ${POSITIONS[slot].label}`;
  $('#reading-title').textContent = data.name;
  $('#reading-keyword').textContent = `✧ ${reading.keyword}`;
  $('#reading-summary').textContent = reading.summary || data.message;
  $('#reading-name-help').hidden = !reading.nameGuide;
  $('#reading-name-help').open = false;
  $('#reading-name-guide').textContent = reading.nameGuide;
  applyArtwork($('#reading-art'), data);
  $('#reading-art').setAttribute('aria-label', `${data.name} 카드`);
  renderReadingSections($('#reading-sections'), reading.sections, reading.text);
  $('#reading-source-link').href = reading.reference.url;
  $('#reading-source-link').textContent = `${reading.reference.label} ↗`;
  $('#reading-source-note').hidden = !reading.sourceNote;
  $('#reading-source-note-body').textContent = reading.sourceNote?.body || '';
  if (reading.sourceNote) $('#reading-source-note-link').href = reading.sourceNote.reference.url;
  else $('#reading-source-note-link').removeAttribute('href');
  $('#reading-next span').textContent = state.revealed < 3 ? '다음 카드 고르기' : '종합 점괘 보기';
  $('#reading-open span').textContent = state.revealed < 3 ? '이 카드의 이야기 자세히 읽기' : '종합 점괘 자세히 보기';
  $('#reading-open').hidden = false;
  $('#reading-open').disabled = false;
  if (state.revealed === 3) showOverallOracle();
  openDialog('reading-dialog');
}

function showOverallOracle(summary = getSummary(state.openOrder.map(index => state.drawn[index]), state.topic)) {
  setOracle(state.summaryReady ? summary.oneLine : '세 장의 이야기를 함께 살펴보렴.', { tag: state.summaryReady ? '종합 점괘 · 한마디 정리' : '종합 점괘', speak: false });
  $('#reading-open span').textContent = '종합 점괘 자세히 보기';
  $('#reading-open').hidden = false;
  $('#reading-open').disabled = false;
}

function buildResults() {
  const drawn = state.openOrder.map(index => state.drawn[index]);
  const summary = getSummary(drawn, state.topic);
  const topic = TOPICS.find(t => t.id === state.topic);
  const readingDate = !billing.adminPreview && billing.record?.readingDay ? new Date(`${billing.record.readingDay}T12:00:00+09:00`) : new Date();
  $('#result-date').textContent = `${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(readingDate)} · ${topic.label}${billing.adminPreview ? ' · 관리자 모드' : ''}`;
  $('#result-title').textContent = '당신을 위한 종합 점괘';
  $('#result-one-line').textContent = summary.oneLine;
  $('#result-intro').textContent = summary.summary || '';
  $('#summary-headline').textContent = summary.headline;
  renderReadingSections($('#summary-text'), summary.sections, summary.text, 'h4');
  $('#summary-ritual').textContent = summary.ritual;
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

const revelation = new TarotRevelation();
let resultPresentation = null;
const revelationOptions = () => ({
  reducedMotion: state.reduced,
  onCue: cue => { if (cue === 'gather') play('summon'); else if (cue === 'reveal') play('reveal'); }
});
$('#preview-revelation').addEventListener('click', () => { void revelation.play(revelationOptions()); });
async function showResultsWithRevelation() {
  if (expireDisplayedReading() || state.phase !== 'complete' || state.revealed !== 3 || resultPresentation || $('#result-dialog').open) return;
  const presentation = { epoch: state.epoch };
  resultPresentation = presentation;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  let ready;
  try {
    ready = await revelation.play(revelationOptions());
  } catch {
    // A visual effect must never hide an already saved, paid reading.
    revelation.cancel();
    ready = true;
  }
  if (resultPresentation !== presentation || presentation.epoch !== state.epoch || expireDisplayedReading()) return;
  resultPresentation = null;
  if (ready && state.phase === 'complete' && state.revealed === 3) {
    state.summaryReady = true;
    showOverallOracle();
    openDialog('result-dialog');
  }
}

async function copyResult() {
  if (expireDisplayedReading() || state.revealed !== 3) return;
  const epoch = state.epoch;
  const drawn = state.openOrder.map(i => state.drawn[i]);
  const summary = getSummary(drawn, state.topic);
  const parts = ['오쭈다 · 달의 마녀 타로', '종합 점괘', $('#result-date').textContent, ''];
  parts.push('한마디 정리', summary.oneLine, '', summary.headline, summary.text, '', `오늘 해 볼 일: ${summary.ritual}`, '', '타로의 전통 해석이에요. 미래를 확정하지 않아요.');
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
  state.epoch++;
  resultPresentation = null;
  revelation.cancel();
  if (clearPaid && !billing.pending) billing.newReading();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (trailRaf) cancelAnimationFrame(trailRaf);
  trailRaf = null;
  $$('dialog[open]').forEach(dialog => dialog.close());
  state.discarded.clear();
  discardGhosts.forEach(ghost => ghost.remove());
  discardGhosts.clear();
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
  ['reading-position', 'reading-title', 'reading-keyword', 'reading-summary', 'reading-name-guide', 'reading-sections', 'reading-source-note-body', 'result-date', 'result-one-line', 'result-intro', 'summary-headline', 'summary-text', 'summary-ritual'].forEach(id => { document.getElementById(id).replaceChildren(); });
  ['--art-image', '--art-size', '--art-x', '--art-y'].forEach(name => $('#reading-art').style.removeProperty(name));
  $('#reading-art').removeAttribute('aria-label');
  $('#reading-source-link').removeAttribute('href');
  $('#reading-source-note-link').removeAttribute('href');
  $('#reading-source-note').hidden = true;
  $('#reading-name-help').hidden = true;
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
  $('#game-title').innerHTML = '운명이 속삭이는 밤,<br><em>달의 마녀</em>를 만나다';
  $('#game-subtitle').textContent = '세 장으로 읽는 오늘의 운세.';
  $('#game-subtitle').hidden = false;
  $('#eyebrow').innerHTML = '<span></span> THE MOONLIT ORACLE <span></span>';
  setStageCaption();
  setOracle('이번에는 어떤 이야기가 궁금하니?', { tag: '마녀의 초대' });
  effects.setMood('idle');
  layout(false);
  $('#summon-button').focus({ preventScroll: true });
  if (innerWidth <= 760) window.scrollTo({ top: 0, behavior: state.reduced ? 'instant' : 'smooth' });
  if (clearPaid) void refreshReadingAvailability();
}

$('#summon-button').addEventListener('click', summon);
$('#action-button').addEventListener('click', () => {
  if (state.phase === 'complete') void showResultsWithRevelation();
});
$('#restart-small').addEventListener('click', reset);
$('#restart-result').addEventListener('click', reset);
$('#copy-result').addEventListener('click', copyResult);
$('#reading-open').addEventListener('click', () => {
  if (state.phase === 'complete') void showResultsWithRevelation();
  else showReading();
});
$('#reading-next').addEventListener('click', () => {
  closeDialog('reading-dialog');
  if (state.phase === 'complete') void showResultsWithRevelation();
  else if (state.phase === 'reading') focusUnopenedCard();
});
$$('[data-topic]').forEach(button => button.addEventListener('click', () => {
  if (state.phase !== 'intro' || state.busy) return;
  state.topic = button.dataset.topic;
  $$('[data-topic]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  const invitations = {
    overall: '오늘 마음에 남은 일을 하나 떠올려 봐.',
    love: '지금 네 마음을 함께 살펴보자.',
    money: '돈에 관해 마음에 걸리는 일을 떠올려 보렴.',
    work: '지금 가진 힘과 필요한 도움을 살펴보자.',
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
  resultPresentation = null;
  revelation.cancel();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (state.sound) audio.setMuted(true);
});
window.addEventListener('pageshow', event => { if (event.persisted && state.sound) audio.setMuted(false); void refreshReadingAvailability(); });
window.addEventListener('focus', () => { void refreshReadingAvailability(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshReadingAvailability(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resultPresentation = null;
    revelation.cancel();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
});
applyMotionPreference(state.reduced);
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
    if (card.wrap.hidden && !state.kept.length) leaveDiscardGhost(card, locationFor(index, 'five'));
  });
  if (state.kept.length) {
    setPhase(state.revealed === 3 ? 'complete' : 'reading');
    prepareNextReveal();
    if (state.revealed === 3) {
      buildResults();
      setTitle('오늘의 타로', '', 'YOUR MOONLIT STORY');
      setStageCaption('열린 카드를 누르면 풀이를 다시 볼 수 있어요');
      $('#restart-small').hidden = false;
    }
  } else {
    setPhase('discard');
    updateDiscardProgress();
    setTitle(state.discarded.size ? '한 장 더 버려주세요' : '버릴 카드 두 장을 고르세요', '누르면 바로 버려져요.', 'WELCOME BACK');
  }
  if (state.revealed > 0 && state.revealed < 3) {
    const data = state.drawn[state.openOrder[state.lastReading]];
    const reading = getReading(data, state.topic, state.lastReading);
    setOracle(reading.summary, { title: data.name, tag: '다시 찾아온 카드 이야기', keyword: reading.keyword, speak: false });
    $('#reading-open').hidden = false;
    $('#reading-open').disabled = false;
    $('#reading-open span').textContent = '이 카드의 이야기 자세히 읽기';
  } else if (!state.revealed) setOracle('아까의 이야기를 이어가 보자.', { tag: '이어보기', speak: false });
  effects.setMood(state.kept.length ? 'reading' : 'idle');
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
      $('#payment-status').textContent = '시작하던 운세를 이어서 확인해요. 같은 운세의 이용 금액은 한 번만 사용돼요.';
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
void initializeBilling();

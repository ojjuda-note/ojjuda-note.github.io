/* Shared result presentation. Games retain ownership of progress and settlement. */
(() => {
  'use strict';
  if (window.OjjudaGameResults) return;
  const GAMES = Object.freeze({
    sacheonseong: { name: '사천성' }, mines: { name: '지뢰찾기' }, saetbyeol: { name: '샛별 키우기' },
    mole: { name: '두더지 잡기', unit: '점' }, runner: { name: '쭈 달리기', unit: '점' },
    stacker: { name: '탑 쌓기', unit: '층' }, breakout: { name: '벽돌깨기' },
    spot: { name: '틀린그림 찾기' }, screw: { name: '나사 풀기' },
    screw_box: { name: '나사 풀기 · 박스' }, screw_flat: { name: '나사 풀기 · 평면' },
    bang: { name: '뱅' }, tank: { name: '탱크' }, tour: { name: '오쭈다 투어' },
    ttang: { name: '땅따먹기' }, janggi: { name: '장기' }, chess: { name: '체스' },
    billiards: { name: '당구' }, carom4: { name: '당구 · 4구' },
    carom3: { name: '당구 · 3구' }, pool8: { name: '당구 · 8볼' },
    matgo: { name: '맞고' }, poker: { name: '포커' }, roulette: { name: '룰렛' },
    photo_ttang: { name: '포토 땅따먹기' }, archery: { name: '바람의 궁수' }
  });
  const TITLES = Object.freeze({ success: '성공', failure: '실패', draw: '무승부', complete: '게임 종료',
    record: '신기록', score: '도전 완료', 'gold-gain': '골드 획득', 'gold-loss': '골드 손실', 'gold-even': '골드 변동 없음' });
  const POSITIVE = new Set(['success', 'record', 'gold-gain']);
  const SAD = new Set(['failure', 'gold-loss']);
  const played = new Map(), liveEffects = new Map(), activated = new WeakMap();
  let sequence = 0, activeDialog = null;
  const own = (object, name) => Object.prototype.hasOwnProperty.call(object, name);
  const supportsGame = game => typeof game === 'string' && own(GAMES, game);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const validScore = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
  const outcomeOf = value => own(TITLES, value) ? value : 'complete';
  const motionReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const nodes = value => (Array.isArray(value) ? value : value ? [value] : []).filter(node => node && typeof node.nodeType === 'number');
  function icon(outcome) {
    const path = POSITIVE.has(outcome)
      ? '<path d="M17 8h30v13c0 11-7 18-15 18S17 32 17 21V8Z"/><path d="M17 12H9v7c0 7 4 12 12 12m26-19h8v7c0 7-4 12-12 12M32 39v12m-10 4h20"/><path class="game-result-icon-star" d="m32 14 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>'
      : SAD.has(outcome)
        ? '<circle cx="32" cy="30" r="22"/><path d="m18 24 7 3m14 0 7-3m-23 17c4-5 14-5 18 0M22 33v2m20-2v2"/><path class="game-result-icon-tear" d="M46 34c0 0-4 6-4 9a4 4 0 0 0 8 0c0-3-4-9-4-9Z"/>'
        : '<circle cx="32" cy="31" r="22"/><path d="m22 31 7 7 14-16"/>';
    return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  function markup(options = {}) {
    const game = supportsGame(options.game) ? options.game : '';
    const outcome = outcomeOf(options.outcome), id = 'game-result-heading-' + (++sequence);
    const share = options.share !== false && game;
    const encouragement = options.encouragement || '';
    return '<section class="game-result-card" data-game-result-card data-result-game="' + escape(game)
      + '" data-result-outcome="' + outcome + '" data-result-key="' + escape(options.key ?? '')
      + '"' + (validScore(options.score) ? ' data-result-score="' + options.score + '"' : '')
      + ' role="group" aria-labelledby="' + id + '">'
      + '<div class="game-result-effects" aria-hidden="true"></div>'
      + '<div class="game-result-content"><div class="game-result-icon">' + icon(outcome) + '</div>'
      + '<h2 class="game-result-title" id="' + id + '">' + escape(options.title ?? TITLES[outcome]) + '</h2>'
      + '<div class="game-result-metric">' + escape(typeof options.metric === 'string' || typeof options.metric === 'number' ? options.metric : '') + '</div>'
      + '<p class="game-result-encouragement"' + (encouragement ? '' : ' hidden') + '>' + escape(encouragement) + '</p>'
      + '<div class="game-result-actions">' + (typeof options.actions === 'string' ? options.actions : '') + '</div>'
      + '<div class="game-result-extra">' + (typeof options.extra === 'string' ? options.extra : '') + '</div>'
      + (share ? '<button type="button" class="game-result-share" data-game-result-share><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>공유하기</button>' : '')
      + '<p class="game-result-share-status" role="status" aria-live="polite"></p>'
      + '<div class="game-result-copy" hidden></div></div></section>';
  }
  function stopEffects(card) {
    const timer = liveEffects.get(card);
    if (timer) window.clearTimeout(timer);
    liveEffects.delete(card);
    card.classList.remove('is-celebrating', 'is-sad');
    card.querySelector('.game-result-effects')?.replaceChildren();
  }
  function activate(card) {
    if (!card.isConnected) return;
    const outcome = card.dataset.resultOutcome;
    const signature = outcome + '|' + card.dataset.resultKey;
    if (activated.get(card) === signature) return;
    activated.set(card, signature);
    stopEffects(card);
    if (motionReduced() || (!POSITIVE.has(outcome) && !SAD.has(outcome))) return;
    const key = card.dataset.resultKey ? card.dataset.resultGame + '|' + signature : null;
    if (key && played.has(key)) return;
    if (key) { played.set(key, true); if (played.size > 128) played.delete(played.keys().next().value); }
    const layer = card.querySelector('.game-result-effects');
    if (!layer) return;
    const add = (className, styles) => {
      const bit = document.createElement('i'); bit.className = className;
      for (const [name, value] of Object.entries(styles)) bit.style.setProperty(name, value);
      layer.append(bit);
    };
    if (POSITIVE.has(outcome)) {
      card.classList.add('is-celebrating');
      const colors = ['#f4bb43', '#f18b9b', '#70c9a7', '#8f9dec', '#edaa5e', '#e5ce7e'];
      for (let i = 0; i < 26; i++) add('game-result-confetti', {
        '--x': (4 + ((i * 29) % 93)) + '%', '--drift': ((i % 2 ? 1 : -1) * (18 + i % 7 * 8)) + 'px',
        '--delay': ((i % 8) * 0.08) + 's', '--turn': (280 + i * 63) + 'deg', '--color': colors[i % colors.length]
      });
      for (let burst = 0; burst < 3; burst++) {
        for (let i = 0; i < 8; i++) add('game-result-spark', {
          '--x': [18, 80, 52][burst] + '%', '--y': [24, 23, 12][burst] + '%',
          '--angle': (i * 45) + 'deg', '--delay': (burst * 0.28 + 0.1) + 's', '--color': colors[(burst + i) % colors.length]
        });
      }
      for (let i = 0; i < 3; i++) add('game-result-light', { '--x': (16 + i * 34) + '%', '--angle': ((i - 1) * 19) + 'deg', '--delay': (i * 0.12) + 's' });
    } else {
      card.classList.add('is-sad');
      for (let i = 0; i < 5; i++) add('game-result-tear', { '--x': (16 + i * 17) + '%', '--delay': (i * 0.19) + 's' });
    }
    liveEffects.set(card, window.setTimeout(() => stopEffects(card), 3700));
  }
  function decorate(element, options = {}) {
    if (!element || element.nodeType !== 1) return null;
    const metric = nodes(options.metric), actions = nodes(options.actions), extra = nodes(options.extra);
    const moving = [...new Set([...metric, ...actions, ...extra])].filter(node => node !== element && !node.contains?.(element));
    for (const node of moving) node.remove?.();
    for (const card of element.querySelectorAll('[data-game-result-card]')) stopEffects(card);
    element.innerHTML = markup({ ...options, metric: metric.length ? '' : options.metric, actions: '', extra: '' });
    if (element.tagName === 'DIALOG') element.classList.add('game-result-dialog');
    const card = element.querySelector('[data-game-result-card]');
    for (const [selector, originals] of [['.game-result-metric', metric], ['.game-result-actions', actions], ['.game-result-extra', extra]]) {
      const holder = card.querySelector(selector);
      for (const node of originals) if (moving.includes(node)) holder.append(node);
    }
    activate(card);
    return card;
  }
  function update(element, options = {}) {
    const card = element?.matches?.('[data-game-result-card]') ? element : element?.querySelector?.('[data-game-result-card]');
    if (!card) return null;
    if (own(options, 'outcome')) {
      card.dataset.resultOutcome = outcomeOf(options.outcome);
      card.querySelector('.game-result-icon').innerHTML = icon(card.dataset.resultOutcome);
    }
    if (own(options, 'title') || own(options, 'outcome')) card.querySelector('.game-result-title').textContent = options.title ?? TITLES[card.dataset.resultOutcome];
    if (own(options, 'metric')) {
      const holder = card.querySelector('.game-result-metric');
      if (options.metric?.nodeType) holder.replaceChildren(options.metric); else holder.textContent = options.metric ?? '';
    }
    if (own(options, 'encouragement')) {
      const line = card.querySelector('.game-result-encouragement'); line.textContent = options.encouragement || ''; line.hidden = !options.encouragement;
    }
    if (own(options, 'key')) card.dataset.resultKey = String(options.key ?? '');
    if (own(options, 'score')) { if (validScore(options.score)) card.dataset.resultScore = String(options.score); else delete card.dataset.resultScore; }
    activate(card);
    return card;
  }
  function show(options = {}) {
    close();
    const previousFocus = document.activeElement, dialog = document.createElement('dialog');
    dialog.className = 'game-result-dialog'; dialog.setAttribute('aria-label', options.title ?? TITLES[outcomeOf(options.outcome)]);
    dialog.innerHTML = markup({ ...options, actions: '' });
    const card = dialog.querySelector('[data-game-result-card]'), actionRow = card.querySelector('.game-result-actions');
    let closed = false, pending = false;
    const handle = { element: dialog, card, close: finish };
    function finish() {
      if (closed) return;
      closed = true; stopEffects(card);
      if (activeDialog === handle) activeDialog = null;
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
      if (!activeDialog && previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
      if (typeof options.onClose === 'function') options.onClose();
    }
    for (const action of Array.isArray(options.actions) ? options.actions : []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'game-result-action';
      if (action.id) button.id = action.id;
      if (action.requiresPlay) button.setAttribute('data-game-result-play', '');
      button.textContent = action.label || '확인'; button.disabled = action.disabled === true;
      button.addEventListener('click', async event => {
        if (pending || closed || button.disabled) return;
        pending = true;
        const buttons = [...actionRow.querySelectorAll('button')], disabled = buttons.map(item => item.disabled);
        buttons.forEach(item => { item.disabled = true; }); button.setAttribute('aria-busy', 'true');
        try {
          const result = typeof action.onClick === 'function' ? await action.onClick(event, handle) : undefined;
          if (result !== false) finish();
        } catch {
          if (!closed) card.querySelector('.game-result-share-status').textContent = '다시 눌러 주세요';
        } finally {
          pending = false; button.removeAttribute('aria-busy');
          if (!closed) buttons.forEach((item, i) => { item.disabled = disabled[i]; });
        }
      });
      actionRow.append(button);
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (options.dismissible !== false && !pending) finish(); });
    dialog.addEventListener('close', finish);
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    activeDialog = handle; document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    activate(card);
    const first = card.querySelector('button:not(:disabled)'); first?.focus({ preventScroll: true });
    return handle;
  }
  function close() { activeDialog?.close(); }
  function canPlay() {
    let access = window.OjjudaGuestAccess;
    if (!access && window.parent !== window) {
      try { access = window.parent.OjjudaGuestAccess; } catch {}
    }
    if (typeof access?.canPlay !== 'function') return true;
    try { return access.canPlay() !== false; } catch { return false; }
  }
  function shareData(options = {}) {
    if (!supportsGame(options.game)) return null;
    const game = options.game, meta = GAMES[game], url = new URL('/world.html', 'https://ojjuda.kr');
    url.searchParams.set('game', game);
    if ((game === 'mole' || game === 'stacker') && validScore(options.score)) {
      url.searchParams.set('challenge', '1'); url.searchParams.set('score', String(options.score));
    }
    const outcome = outcomeOf(options.outcome);
    const result = validScore(options.score) && meta.unit ? options.score.toLocaleString('ko-KR') + meta.unit : TITLES[outcome];
    return { title: '오쭈다 · ' + meta.name, text: meta.name + ' · ' + result + '\n함께 도전해요!', url: url.href };
  }
  function shared(game) { try { window.OjjudaGameChallenges?.recordShare?.(game); } catch {} }
  function manualCopy(card, data) {
    const box = card.querySelector('.game-result-copy'); if (!box) return;
    box.replaceChildren(); box.hidden = false;
    const label = document.createElement('label'); label.textContent = '게임 링크';
    const input = document.createElement('input'); input.type = 'text'; input.readOnly = true; input.value = data.url;
    input.setAttribute('aria-label', '게임 링크'); input.addEventListener('focus', () => input.select());
    const hint = document.createElement('p'); hint.textContent = '길게 누르거나 선택해서 복사해 주세요';
    label.append(input); box.append(label, hint); input.focus(); input.select();
  }
  async function share(button) {
    const card = button.closest('[data-game-result-card]');
    if (!card || button.disabled) return;
    const score = card.hasAttribute('data-result-score') ? Number(card.dataset.resultScore) : undefined;
    const data = shareData({ game: card.dataset.resultGame, outcome: card.dataset.resultOutcome, score });
    if (!data) return;
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    const status = card.querySelector('.game-result-share-status'); status.textContent = '';
    try {
      if (typeof navigator.share === 'function') {
        try { await navigator.share(data); shared(card.dataset.resultGame); return; }
        catch (error) { if (error?.name === 'AbortError') return; }
      }
      if (!card.isConnected) return;
      if (typeof navigator.clipboard?.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(data.text + '\n' + data.url); shared(card.dataset.resultGame);
          if (card.isConnected) status.textContent = '게임 링크를 복사했어요';
          return;
        } catch {}
      }
      if (card.isConnected) manualCopy(card, data);
    } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
  function requestedGame() {
    const params = new URL(window.location.href).searchParams, game = params.get('game');
    return params.getAll('game').length === 1 && supportsGame(game) ? game : null;
  }
  document.addEventListener('click', event => {
    const play = event.target.closest?.('[data-game-result-play]');
    if (play && !play.disabled && !canPlay()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-game-result-share]');
    if (button) { event.preventDefault(); void share(button).catch(() => {}); }
  });
  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.matches('[data-game-result-card]')) activate(node);
    node.querySelectorAll('[data-game-result-card]').forEach(activate);
  };
  if (typeof MutationObserver === 'function') new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
    for (const card of liveEffects.keys()) if (!card.isConnected) stopEffects(card);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('[data-game-result-card]').forEach(activate);
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  preference?.addEventListener?.('change', event => { if (event.matches) for (const card of liveEffects.keys()) stopEffects(card); });
  window.OjjudaGameResults = Object.freeze({ markup, decorate, update, show, close, canPlay, shareData, supportsGame, requestedGame, games: GAMES });
})();

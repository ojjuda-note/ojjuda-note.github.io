/* User-initiated record sharing. Daily usage counts never affect game scores. */
(() => {
  'use strict';
  const GAMES = Object.freeze({ stacker: { name: '탑 쌓기', unit: '층' }, mole: { name: '두더지 잡기', unit: '점' } });
  const KEY = 'ojjuda.game-growth.v1';
  const HOSTS = new Set(['ojjuda.kr', 'www.ojjuda.kr', 'ojjuda.com', 'www.ojjuda.com', 'ojjuda-note.github.io']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
  const supported = game => Object.hasOwn(GAMES, game);
  const incoming = (() => {
    const params = new URL(location.href).searchParams;
    const game = params.get('game');
    if (params.getAll('game').length !== 1 || !supported(game)) return null;
    const raw = params.get('score'), score = Number(raw);
    const challenge = params.getAll('challenge').length === 1 && params.get('challenge') === '1'
      && params.getAll('score').length === 1 && /^\d{1,7}$/.test(raw || '') && count(score);
    return { game, challenge, score: challenge ? score : null };
  })();
  let client, notify = () => {}, flushing = false, retryTimer, retryAfter = 0, clockOffset = 0;
  const pending = new Map(), active = new Set();
  const source = game => incoming?.game === game && incoming.challenge ? 'challenge' : 'direct';
  const allowed = () => client && HOSTS.has(location.hostname) && !document.hidden
    && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
  const today = offset => new Date(Date.now() + offset + 9 * 3600000).toISOString().slice(0, 10);
  function dailyRecord() {
    try {
      let record = JSON.parse(localStorage.getItem(KEY) || 'null');
      const offset = Number.isFinite(record?.clockOffset) ? record.clockOffset : 0;
      clockOffset = offset;
      if (!record || record.day !== today(offset) || !UUID.test(record.id)) {
        if (!crypto.randomUUID) return null;
        record = { day: today(offset), id: crypto.randomUUID(), sent: [], clockOffset: offset };
        localStorage.setItem(KEY, JSON.stringify(record));
        record = JSON.parse(localStorage.getItem(KEY));
      }
      if (!record || !UUID.test(record.id) || !Array.isArray(record.sent)) return null;
      return record;
    } catch { return null; }
  }
  async function send(key, event) {
    if (!allowed()) return 'later';
    const record = dailyRecord();
    if (new Date(event.at + clockOffset + 9 * 3600000).toISOString().slice(0, 10) !== today(clockOffset)) return 'done';
    if (!record || record.sent.includes(key)) return 'done';
    try {
      let request = client.rpc('record_game_growth', {
        p_visit_id: record.id, p_game: event.game, p_source: event.source, p_event: event.event
      });
      if (request?.abortSignal && typeof window.AbortSignal?.timeout === 'function') request = request.abortSignal(window.AbortSignal.timeout(5000));
      const { data, error } = await request;
      if (error || data?.ok !== true || !/^\d{4}-\d{2}-\d{2}$/.test(data.day)) return 'retry';
      const current = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (current?.id === record.id) {
        const serverNow = Date.parse(data.server_now);
        current.clockOffset = Number.isFinite(serverNow) ? serverNow - Date.now() : record.clockOffset;
        clockOffset = current.clockOffset;
        current.day = data.day;
        current.sent = [...new Set([...(current.sent || []), key])].slice(-16);
        localStorage.setItem(KEY, JSON.stringify(current));
      }
      return 'done';
    } catch { return 'retry'; }
  }
  async function flush() {
    if (flushing || !allowed() || Date.now() < retryAfter) return;
    flushing = true;
    try {
      while (pending.size) {
        if (!allowed()) break;
        const [queueKey, event] = pending.entries().next().value;
        const run = () => send(event.key, event);
        const result = navigator.locks?.request ? await navigator.locks.request(KEY, run) : await run();
        if (result === 'done') { if (pending.get(queueKey) === event) pending.delete(queueKey); continue; }
        if (result === 'retry') {
          retryAfter = Date.now() + 60000;
          clearTimeout(retryTimer); retryTimer = setTimeout(() => void flush(), 60000);
        }
        break;
      }
    } catch {} finally { flushing = false; }
  }
  function track(game, event) {
    if (!supported(game) || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    const origin = source(game), key = game + ':' + origin + ':' + event;
    const queueKey = today(clockOffset) + ':' + key;
    if (!pending.has(queueKey)) pending.set(queueKey, { key, game, source: origin, event, at: Date.now() });
    void flush();
  }
  function configure(options = {}) {
    client = options.client;
    if (typeof options.notify === 'function') notify = options.notify;
    if (incoming) track(incoming.game, 'visit');
    void flush();
  }
  function onStart(game) {
    if (!supported(game)) return;
    active.add(game); track(game, 'visit'); track(game, 'start');
  }
  function onOpen(game) { if (supported(game)) track(game, 'visit'); }
  function complete(game, score) {
    if (!supported(game) || !count(score)) return null;
    if (active.delete(game)) track(game, 'complete');
    const target = incoming?.game === game && incoming.challenge ? incoming.score : null;
    return { target, unit: GAMES[game].unit };
  }
  function recordShare(game) { if (supported(game)) track(game, 'share'); }
  function resultMarkup(game, score) {
    const result = complete(game, score);
    if (!result) return '';
    const target = result.target;
    const comparison = target === null ? '' : '<p class="game-challenge-comparison">친구 ' + target.toLocaleString('ko-KR')
      + GAMES[game].unit + ' · 나 ' + score.toLocaleString('ko-KR') + GAMES[game].unit + '</p>';
    return '<div class="game-challenge-result">' + comparison
      + '<button type="button" class="btn game-challenge-share" data-challenge-share="' + game
      + '" data-challenge-score="' + score + '">친구에게 도전</button></div>';
  }
  function shareData(game, score) {
    const url = new URL('/world.html', 'https://ojjuda.kr');
    url.searchParams.set('game', game); url.searchParams.set('challenge', '1'); url.searchParams.set('score', String(score));
    return { title: '오쭈다 · ' + GAMES[game].name,
      text: GAMES[game].name + ' ' + score.toLocaleString('ko-KR') + GAMES[game].unit + '! 내 기록 깨볼래?', url: url.href };
  }
  function copyDialog(text, game) {
    document.querySelector('[data-challenge-copy-dialog]')?.remove();
    const dialog = document.createElement('dialog'); dialog.className = 'game-challenge-copy';
    dialog.dataset.challengeCopyDialog = ''; dialog.setAttribute('aria-label', '도전 링크');
    const input = document.createElement('textarea'); input.readOnly = true; input.value = text;
    input.setAttribute('aria-label', '도전 링크'); input.rows = 3;
    const actions = document.createElement('div'); actions.className = 'game-challenge-copy-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn'; copy.textContent = '복사';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn ghost'; close.textContent = '닫기';
    copy.addEventListener('click', () => {
      input.focus(); input.select();
      try {
        if (document.execCommand('copy')) { track(game, 'share'); dialog.close?.(); dialog.remove(); notify('복사했어요'); return; }
      } catch {}
      notify('길게 눌러 복사해 주세요');
    });
    close.addEventListener('click', () => { dialog.close?.(); dialog.remove(); });
    dialog.addEventListener('cancel', () => dialog.remove());
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    actions.append(copy, close); dialog.append(input, actions); document.body.append(dialog);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    input.focus(); input.select();
  }
  async function share(button) {
    const game = button.dataset.challengeShare, score = Number(button.dataset.challengeScore);
    if (!supported(game) || !count(score) || button.disabled) return;
    const data = shareData(game, score); button.disabled = true;
    try {
      if (navigator.share) {
        try { await navigator.share(data); track(game, 'share'); return; }
        catch (error) { if (error?.name === 'AbortError') return; }
      }
      const text = data.text + '\n' + data.url;
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); track(game, 'share'); notify('도전 링크를 복사했어요'); return; }
        catch {}
      }
      copyDialog(text, game);
    } finally { button.disabled = false; }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-challenge-share]');
    if (button) { event.preventDefault(); void share(button).catch(() => notify('다시 눌러 주세요')); }
  });
  addEventListener('online', () => { retryAfter = 0; void flush(); });
  addEventListener('pageshow', () => void flush());
  document.addEventListener('visibilitychange', () => void flush());
  window.OjjudaGameChallenges = Object.freeze({ configure, requestedGame: () => incoming?.game || null, onOpen, onStart, complete, recordShare, resultMarkup });
})();

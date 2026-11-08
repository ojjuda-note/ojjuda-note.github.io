// Connect the Chacha Rush popup to Ojjuda's existing authenticated score RPC.
// Never send a member's session or credentials to the game origin.
const GAME_ORIGIN = 'https://chacharush-arcade-2611.mj830417686850.chatgpt.site';
const CHANNEL = 'ojjuda:chacha-rush';
const MAX_SCORE = 9_999_999;
const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;

export function installChachaRushPortal({ currentOwner, submitScore, onSaved, onNotice }) {
  const sessions = new Map();

  function open() {
    const nonce = crypto.randomUUID();
    const owner = currentOwner();
    const fragment = new URLSearchParams({ ojjuda_run: nonce, ojjuda_origin: location.origin });
    const popup = window.open(`${GAME_ORIGIN}/#${fragment}`, '_blank');
    if (!popup) {
      onNotice?.('차차 러시 창이 차단됐어요. 팝업을 허용하고 다시 눌러주세요.');
      return false;
    }
    sessions.set(nonce, { popup, owner, startedAt: 0, round: 0, finished: false, createdAt: Date.now() });
    setTimeout(() => sessions.delete(nonce), SESSION_LIFETIME_MS);
    return true;
  }

  function respond(session, nonce, action, extra = {}) {
    if (session.popup.closed) return;
    session.popup.postMessage({ channel: CHANNEL, nonce, action, round: session.round, ...extra }, GAME_ORIGIN);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-v="chacha_rush"]');
    if (!link) return;
    event.preventDefault();
    open();
  }, true);

  window.addEventListener('message', async event => {
    if (event.origin !== GAME_ORIGIN) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== CHANNEL || typeof data.nonce !== 'string') return;
    const session = sessions.get(data.nonce);
    if (!session || event.source !== session.popup || Date.now() - session.createdAt > SESSION_LIFETIME_MS) return;

    if (data.action === 'hello') {
      respond(session, data.nonce, 'connected', { signedIn: !!session.owner && session.owner === currentOwner() });
      return;
    }
    if (data.action === 'start') {
      if (!Number.isSafeInteger(data.round) || data.round <= session.round) return;
      session.round = data.round;
      session.startedAt = Date.now();
      session.finished = false;
      return;
    }
    if (data.action !== 'finish' || data.round !== session.round || session.finished) return;
    session.finished = true;
    const seconds = (Date.now() - session.startedAt) / 1000;
    const score = data.score;
    if (!session.startedAt || !Number.isSafeInteger(score) || score <= 0 || score > MAX_SCORE ||
        seconds < 0.4 || score > 1_000_000 + seconds * 100_000) {
      respond(session, data.nonce, 'result', { ok: false, message: '유효한 기록이 아니어서 등록되지 않았어요.' });
      return;
    }
    if (!session.owner || session.owner !== currentOwner()) {
      respond(session, data.nonce, 'result', { ok: false, message: '오쭈다에 로그인한 상태에서 시작해야 순위에 등록돼요.' });
      return;
    }
    try {
      const result = await submitScore(score);
      if (!result?.ok) {
        const message = result?.reason === 'too_fast'
          ? '잠깐 기다린 뒤 다시 도전해 주세요.'
          : '점수 저장에 실패했어요. 다시 도전해 주세요.';
        respond(session, data.nonce, 'result', { ok: false, message });
        return;
      }
      onSaved?.(session.owner);
      respond(session, data.nonce, 'result', { ok: true, message: '🏆 오쭈다 월간 게임순위에 등록됐어요!' });
    } catch {
      respond(session, data.nonce, 'result', { ok: false, message: '연결 오류로 저장하지 못했어요. 다시 도전해 주세요.' });
    }
  });

  return { open };
}

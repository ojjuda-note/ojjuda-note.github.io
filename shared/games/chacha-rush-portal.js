// Connect the Chacha Rush popup to Ojjuda's existing authenticated score RPC.
// Never send a member's session or credentials to the game origin.
const GAME_ORIGIN = 'https://chacharush-arcade-2611.mj830417686850.chatgpt.site';
const CHANNEL = 'ojjuda:chacha-rush';
const MAX_SCORE = 9_999_999;
const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;

export function installChachaRushPortal({ currentOwner, submitScore, onSaved, onNotice }) {
  const sessions = new Map();
  let activeClose = null;

  function open() {
    activeClose?.();
    const nonce = crypto.randomUUID();
    const owner = currentOwner();
    const fragment = new URLSearchParams({ ojjuda_run: nonce, ojjuda_origin: location.origin });

    // Keep the game inside Ojjuda so cross-origin popup isolation cannot sever
    // the score channel. The child is sandboxed and never sees member tokens.
    const overlay = document.createElement('section');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '차차 러시 게임');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;background:#edf2e3;';
    // Other Ojjuda games use a full-screen entrance with a quiet corner close.
    // Keep this close outside the iframe so a failed game load can still exit.
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '차차 러시 닫기');
    close.style.cssText = 'position:absolute;top:max(7px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #e8e6e9;border-radius:14px;background:#fff;color:#777485;font:400 24px/1 system-ui,sans-serif;cursor:pointer;';
    const frame = document.createElement('iframe');
    frame.title = '차차 러시 3D 레이싱';
    frame.src = `${GAME_ORIGIN}/#${fragment}`;
    frame.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#edf2e3;';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock');
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    overlay.append(frame, close);
    const oldOverflow = document.body.style.overflow;
    const closeGame = () => {
      overlay.remove();
      document.body.style.overflow = oldOverflow;
      sessions.delete(nonce);
      if (activeClose === closeGame) activeClose = null;
    };
    close.addEventListener('click', closeGame);
    activeClose = closeGame;
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    sessions.set(nonce, { target: frame.contentWindow, owner, startedAt: 0, round: 0, finished: false, createdAt: Date.now() });
    setTimeout(() => { if (sessions.has(nonce)) closeGame(); }, SESSION_LIFETIME_MS);
    return true;
  }

  function respond(session, nonce, action, extra = {}) {
    session.target?.postMessage({ channel: CHANNEL, nonce, action, round: session.round, ...extra }, GAME_ORIGIN);
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
    if (!session || event.source !== session.target || Date.now() - session.createdAt > SESSION_LIFETIME_MS) return;

    if (data.action === 'hello') {
      respond(session, data.nonce, 'connected', { signedIn: !!session.owner && session.owner === currentOwner() });
      return;
    }
    if (data.action === 'ranking') {
      activeClose?.();
      location.assign('/features/arcade/monthly-ranking.html?game=chacha_rush');
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

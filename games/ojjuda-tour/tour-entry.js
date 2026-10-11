/* Shared arcade entry controls around the supplied local multiplayer game. */
function tourShowError() {
  const status = document.getElementById('tourStatus');
  status.hidden = false;
  status.textContent = '이 기기에서 3D 화면을 열지 못했어요. 다른 브라우저에서 다시 시도해 주세요.';
}
(() => {
  'use strict';
  const embedded = window.parent !== window;
  if (embedded) document.documentElement.dataset.embedded = 'true';
  const modeButtons = [...document.querySelectorAll('[data-tour-mode]')];
  function refresh() {
    const humans = setupP.slice(0, setupN).filter(player => player.human).length;
    const computers = setupN - humans;
    const mode = humans === setupN ? 'together' : humans === 1 && setupP[0].human ? 'computer' : 'mixed';
    modeButtons.forEach(button => {
      const selected = button.dataset.tourMode === mode;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('tourModeHelp').textContent = mode === 'together'
      ? '한 기기를 번갈아 사용해요. 각자 차례에 주사위를 굴려요.'
      : mode === 'computer' ? '컴퓨터와 편하게 세계여행을 즐겨요.'
      : '사람과 컴퓨터를 섞어 즐겨요. 사람은 같은 기기를 사용해요.';
    document.getElementById('tourRosterCount').textContent =
      [humans ? '사람 ' + humans + '명' : '', computers ? '컴퓨터 ' + computers + '명' : ''].filter(Boolean).join(' · ');
    const saved = !!loadSave();
    document.getElementById('resumeBtn').classList.toggle('hidden', !saved);
    const start = document.getElementById('startBtn');
    start.classList.toggle('ge-primary', !saved);
    start.classList.toggle('ge-secondary', saved);
    start.textContent = saved ? '새 투어 시작하기' : '투어 시작하기';
  }
  modeButtons.forEach(button => button.addEventListener('click', () => {
    setupP.forEach((player, index) => { player.human = button.dataset.tourMode === 'together' || index === 0; });
    renderSetup();
  }));
  document.addEventListener('ojjuda-tour:setup', refresh);
  let initialized = false;
  window.addEventListener('message', event => {
    if (!embedded || initialized || G || event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (message?.source !== 'ojjuda-world' || message.type !== 'ojjuda-tour-init') return;
    initialized = true;
    // Keep different members' progress separate on a shared device.
    const owner = typeof message.owner === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.owner) ? message.owner : 'guest';
    KEY = 'ojjuda-tour-save-v1:' + owner;
    const nickname = cleanName(message.nickname);
    if (nickname) setupP[0].name = nickname;
    renderSetup();
  });
  try { localStorage.getItem(KEY); }
  catch { document.getElementById('tourSaveHint').textContent = '이 브라우저에서는 자동 저장을 사용할 수 없어요.'; }
  refresh();
  ojjudaPost({type:'ojjuda-game-ready', game:'ojjuda-tour'});
})();

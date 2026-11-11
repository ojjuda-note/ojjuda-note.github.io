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
    const online = window.MarbleOnline?.selected() === true;
    const humans = setupP.slice(0, setupN).filter(player => player.human).length;
    const computers = setupN - humans;
    const mode = humans === setupN ? 'together' : humans === 1 && setupP[0].human ? 'computer' : 'mixed';
    modeButtons.forEach(button => {
      const selected = button.dataset.tourMode === (online ? 'online' : mode);
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('tourModeHelp').textContent = online ? '각자 기기에서 방 번호로 모여요. 로그인한 회원 2~8명이 함께해요.' : mode === 'together'
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
    start.textContent = saved ? '새 게임 시작하기' : '게임 시작하기';
  }
  modeButtons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.tourMode === 'online') { window.MarbleOnline?.open(); return; }
    window.MarbleOnline?.local();
    setupP.forEach((player, index) => { player.human = button.dataset.tourMode === 'together' || index === 0; });
    renderSetup();
  }));
  document.addEventListener('ojjuda-tour:setup', refresh);
  let initialized = false;
  let pendingResult = null, recordTimer = 0;
  function recordStatus(ok, preview = false) {
    const status = document.getElementById('tourRecordStatus');
    if (!status || !pendingResult || !G?.over || G.runId !== pendingResult.runId) return;
    clearTimeout(recordTimer);
    status.textContent = preview ? '관리자 체험 · 기록은 저장하지 않아요.' : ok ? '기록 저장 완료' : '저장 실패 · ';
    if (!ok && !preview) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'btn sec'; retry.textContent = '다시 저장';
      retry.onclick = sendResult; status.append(retry);
    }
  }
  function sendResult() {
    const status = document.getElementById('tourRecordStatus');
    if (!status || !pendingResult) return;
    status.textContent = '기록 저장 중';
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => recordStatus(false), 25000);
    ojjudaPost(pendingResult);
  }
  window.tourSubmitResult = result => {
    pendingResult = result;
    clearTimeout(recordTimer);
    const status = document.getElementById('tourRecordStatus');
    if (!status) return;
    if (!result.myRank) { status.textContent = '순위 제외'; return; }
    if (!embedded || !initialized) { status.textContent = '연습 결과'; return; }
    sendResult();
  };
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (initialized && message?.source === 'ojjuda-world' && message.type === 'ojjuda-tour-record' && message.runId === pendingResult?.runId) {
      recordStatus(message.ok === true, message.preview === true); return;
    }
    if (initialized || G) return;
    if (message?.source !== 'ojjuda-world' || message.type !== 'ojjuda-tour-init') return;
    initialized = true;
    window.ojjudaMarbleAccess = {owner:message.owner,available:message.onlineAvailable === true,joinCode:message.joinCode};
    document.dispatchEvent(new Event('ojjuda-marble:ready'));
    // Clear only this member's previous round, keeping settings and records intact.
    const owner = typeof message.owner === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(message.owner) ? message.owner : 'guest';
    KEY = 'ojjuda-tour-save-v1:' + owner;
    clearSave();
    const nickname = cleanName(message.nickname);
    if (nickname) setupP[0].name = nickname;
    renderSetup();
  });
  refresh();
  ojjudaPost({type:'ojjuda-game-ready', game:'ojjuda-tour'});
})();

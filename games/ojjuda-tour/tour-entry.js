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
  function recordStatus(ok) {
    const status = document.getElementById('tourRecordStatus');
    if (!status || !pendingResult || !G?.over || G.runId !== pendingResult.runId) return;
    clearTimeout(recordTimer);
    status.textContent = ok ? '게임 순위에 기록했어요. 이번 달 최고 자산으로 표시돼요.' : '순위 기록을 저장하지 못했어요. ';
    if (!ok) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'btn sec'; retry.textContent = '다시 저장';
      retry.onclick = sendResult; status.append(retry);
    }
  }
  function sendResult() {
    const status = document.getElementById('tourRecordStatus');
    if (!status || !pendingResult) return;
    status.textContent = '게임 순위에 기록하는 중이에요…';
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => recordStatus(false), 25000);
    ojjudaPost(pendingResult);
  }
  window.tourSubmitResult = result => {
    pendingResult = result;
    clearTimeout(recordTimer);
    const status = document.getElementById('tourRecordStatus');
    if (!status) return;
    if (!result.myRank) { status.textContent = '사람 참가자가 있을 때 순위에 기록돼요.'; return; }
    if (!embedded || !initialized) { status.textContent = '오쭈다 게임 목록에서 시작하면 게임 순위에 기록돼요.'; return; }
    sendResult();
  };
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (initialized && message?.source === 'ojjuda-world' && message.type === 'ojjuda-tour-record' && message.runId === pendingResult?.runId) {
      recordStatus(message.ok === true); return;
    }
    if (initialized || G) return;
    if (message?.source !== 'ojjuda-world' || message.type !== 'ojjuda-tour-init') return;
    initialized = true;
    window.ojjudaMarbleAccess = {owner:message.owner,available:message.onlineAvailable === true};
    document.dispatchEvent(new Event('ojjuda-marble:ready'));
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

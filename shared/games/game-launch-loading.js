/* One playful entrance for on-demand games; never hold an already-ready game. */
(() => {
  'use strict';
  const games = Object.freeze({
    screw:['나사 풀기','🔩','쭈가 나사를 반짝반짝 닦는 중!'],
    spot:['틀린그림찾기','🔎','쭈가 다른 그림을 꼭꼭 숨기는 중!'],
    runner:['쭈 달리기','🏃','쭈가 운동화 끈을 묶는 중!'],
    stacker:['탑 쌓기','🏗️','블록을 한 층씩 올리는 중!'],
    mole:['두더지 잡기','🐹','두더지 친구들이 숨바꼭질 중!'],
    breakout:['벽돌깨기','🧱','벽돌을 가지런히 놓는 중!'],
    solitaire:['솔리테어','🃏','카드를 사르륵 섞는 중!'],
    archery:['바람의 궁수','🏹','바람의 방향을 살피는 중!'],
    sacheonseong:['사천성','🀄','짝꿍 패를 찾는 중!'],
    mines:['지뢰찾기','💣','안전한 칸을 표시하는 중!'],
    saetbyeol:['샛별키우기','🌟','새싹별에 반짝임을 더하는 중!'],
    bang:['뱅!','🤠','서부 마을의 문을 여는 중!'],
    tank:['탱크게임','🚀','탱크에 연료를 채우는 중!'],
    tour:['마블','🎲','주사위에 행운을 담는 중!'],
    ttang:['월드땅따먹기','🌍','새로운 땅을 펼치는 중!'],
    photo_ttang:['포토땅따먹기','📸','사진 카드를 고르는 중!'],
    poker:['세븐포커','♠️','카드를 섞고 테이블을 차리는 중!'],
    roulette:['룰렛','🎡','행운의 바퀴를 돌리는 중!'],
    matgo:['맞고','🎴','화투패를 예쁘게 펼치는 중!'],
    chess:['체스','♟️','말들이 제자리를 찾아가는 중!'],
    janggi:['장기','🐴','장기판을 반듯하게 펴는 중!'],
    billiards:['당구','🎱','당구공을 반짝반짝 닦는 중!'],
    carom4:['4구','🎱','당구공을 반짝반짝 닦는 중!'],
    carom3:['3구','🎱','당구공을 반짝반짝 닦는 중!'],
    pool8:['포켓볼','🎱','당구공을 반짝반짝 닦는 중!'],
    festival:['축제일정','🎈','즐거운 축제를 펼쳐 보는 중!'],
    restaurants:['인증맛집','🍽️','맛있는 곳을 찾아보는 중!'],
    recommendations:['추천 맛집','🥘','오늘의 메뉴를 고르는 중!']
  });
  const defaultGame=['게임','🎮','쭈가 게임판을 뚝딱 준비하는 중!'];
  let current = null;
  const now = () => window.performance?.now?.() ?? Date.now();
  function show(game,{onCancel}={}) {
    current?.cancel({silent:true});
    document.querySelectorAll('.ojjuda-game-launch-loading').forEach(node => node.remove());
    const [name,icon,line] = games[game] || defaultGame;
    const root = document.createElement('div');
    root.className = 'ojjuda-game-launch-loading';
    root.dataset.game = game;
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-live','polite');
    root.setAttribute('aria-label',name+' 준비 중');
    root.innerHTML = `<div class="ogl-card">
      <div class="ogl-scene" aria-hidden="true">
        <span class="ogl-spark ogl-spark-one">✦</span><span class="ogl-spark ogl-spark-two">✧</span>
        <span class="ogl-spark ogl-spark-three">✦</span>
        <div class="ogl-buddy"><span class="ogl-eye ogl-eye-left"></span><span class="ogl-eye ogl-eye-right"></span><span class="ogl-smile"></span></div>
        <span class="ogl-game-icon"></span>
      </div>
      <span class="ogl-kicker">오늘도 즐겁게, 오쭈다!</span>
      <h2 class="ogl-title"></h2><p class="ogl-caption"></p>
      <span class="ogl-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <button class="ogl-cancel" type="button">잠깐, 돌아가기</button>
    </div>`;
    root.querySelector('.ogl-game-icon').textContent = icon;
    root.querySelector('.ogl-title').textContent = name+' 준비 중!';
    root.querySelector('.ogl-caption').textContent = line;
    const previous = document.activeElement;
    let closed = false, shownAt = 0, fadeTimer = null, removeTimer = null;
    const remove = () => {
      root.remove();
      if (!document.querySelector('.ojjuda-game-launch-loading')) document.body.classList.remove('ojjuda-game-launch-open');
    };
    const listener = event => {
      if (event.key !== 'Escape' || closed) return;
      event.preventDefault();event.stopPropagation();session.cancel();
    };
    const onPageHide = () => session.cancel({silent:true});
    const revealTimer = setTimeout(() => {
      if (closed) return;
      shownAt = now();root.classList.add('is-visible');
      root.querySelector('.ogl-cancel')?.focus({preventScroll:true});
    }, 100);
    function dismiss({cancelled=false,silent=false}={}) {
      if (closed) return;
      closed = true;
      clearTimeout(revealTimer);clearTimeout(fadeTimer);clearTimeout(removeTimer);
      window.removeEventListener('keydown',listener,true);
      window.removeEventListener('pagehide',onPageHide);
      if (current === session) current = null;
      if (cancelled && !silent) {
        try {onCancel?.();} finally {if (previous?.isConnected) previous.focus?.({preventScroll:true});}
      }
      if (!shownAt || cancelled) {remove();return;}
      fadeTimer = setTimeout(() => {
        root.classList.remove('is-visible');root.classList.add('is-leaving');
        removeTimer = setTimeout(remove, 180);
      }, Math.max(0, 350 - (now() - shownAt)));
    }
    const frame = () => new Promise(resolve => {
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      else setTimeout(resolve,0);
    });
    const session = {
      cancel:({silent=false}={}) => dismiss({cancelled:true,silent}),
      finish:() => dismiss(),
      isCurrent:() => !closed && current === session,
      async beforeOpen() { if (!shownAt) return !closed; await frame(); return !closed; },
      async finishAfterOpen() {
        if (closed) return;
        await frame();
        if (closed) return;
        const iframe = document.querySelector('.arcade-game-view[open] iframe,.tour-game-dialog[open] iframe,.roulette-game-dialog[open] iframe,#ttang-overlay iframe,#photo-ttang-overlay iframe');
        if (iframe) {
          let ready = false;
          try {ready = iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument?.URL !== 'about:blank';} catch {}
          if (!ready) await new Promise(resolve => {
            const done = () => {clearTimeout(timer);iframe.removeEventListener('load',done);resolve();};
            const timer = setTimeout(done,5000);
            iframe.addEventListener('load',done,{once:true});
          });
        }
        if (!closed) dismiss();
      }
    };
    root.querySelector('.ogl-cancel').addEventListener('click',() => session.cancel());
    document.body.append(root);
    document.body.classList.add('ojjuda-game-launch-open');
    window.addEventListener('keydown',listener,true);
    window.addEventListener('pagehide',onPageHide,{once:true});
    current = session;
    return session;
  }
  window.OjjudaGameLaunch = Object.freeze({show,close:() => current?.cancel({silent:true}),isOpen:() => !!current});
})();

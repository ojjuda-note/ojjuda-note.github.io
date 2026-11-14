(() => {
  'use strict';
  const tables = {
    round: ['동그란 테이블', 1], oval: ['타원형 테이블', 1.65],
    square: ['네모난 테이블', 1], long: ['길쭉한 테이블', 1.85]
  };
  let frame = 0, backgroundBrake;
  function option(name, value, title, selected, preview = '') {
    return '<label><input type="radio" name="' + name + '" value="' + value + '"' +
      (value === selected ? ' checked' : '') + '><span>' + preview + title + '</span></label>';
  }
  function tableSetup(g, host) {
    if (!host) return '<h1 class="bottle-heading">테이블을 고르고 있어요</h1><p class="bottle-hint">방장이 고르면 각자 앉은 자리를 표시해요.</p>';
    const shapes = Object.entries(tables).map(([id,[title]]) => option('shape', id, title, g.shape,
      '<i aria-hidden="true" class="bottle-mini ' + id + '"></i>')).join('');
    return '<h1 class="bottle-heading">테이블을 골라 주세요</h1><p class="bottle-hint">모양과 방향을 고른 뒤 자리를 정해요.</p><form id="bottle-table" class="bottle-form bottle-table-setup">' +
      '<fieldset><legend>테이블 모양</legend><div class="bottle-options">' + shapes + '</div></fieldset>' +
      '<fieldset><legend>테이블 방향</legend><div class="bottle-options">' +
      option('direction','horizontal','가로',g.direction) + option('direction','vertical','세로',g.direction) +
      '</div></fieldset><button type="submit" class="action">자리 정하기</button></form>';
  }
  function ratioOf(g) {
    const ratio = tables[g.shape][1];
    return g.direction === 'vertical' ? 1/ratio : ratio;
  }
  function view(s, ui) {
    const g = s.game, host = s.me === 0;
    if (s.phase === 'table') return tableSetup(g, host);
    const seating = s.phase === 'seating', complete = g.positions.every(Boolean);
    const ratio = ratioOf(g);
    const width = tables[g.shape][1] === 1 ? 340 : Math.min(460, 460 * ratio);
    const markers = g.positions.map((point,i) => point ? '<span class="bottle-seat' +
      (i === s.me ? ' mine' : '') + (s.phase === 'done' && i === g.winner ? ' winner' : '') +
      '" style="left:' + Number(point.x) + '%;top:' + Number(point.y) + '%" title="' + ui.esc(s.players[i]) + '">' + (i+1) + '</span>' : '').join('');
    let title, hint, mainButton = '';
    if (seating) {
      title = complete ? '모두 자리를 정했어요' : '내 자리를 정해 주세요';
      hint = complete ? (host ? '준비됐다면 술병을 돌려 주세요.' : '방장이 술병을 돌리면 시작해요.') : '테이블을 눌러 내 자리를 정하거나 옮겨요.';
      if (complete && host) mainButton = '<button type="button" class="action bottle-center" data-game-action="spin">술병 돌리기</button>';
    } else if (s.phase === 'spinning') {
      title = '병이 돌고 있어요';
      hint = host ? '화면을 터치하면 서서히 멈춰요.' : '방장이 누르면 병이 서서히 멈춰요.';
      if (host) mainButton = '<button type="button" class="action bottle-center" data-game-action="brake">멈추기</button>';
    } else if (s.phase === 'braking') {
      title = '서서히 멈추는 중…'; hint = '병 입구가 어느 자리를 가리킬지 지켜봐요.';
    } else {
      title = ui.esc(s.players[g.winner]) + '님 당첨!'; hint = '병 입구가 '+(g.winner+1)+'번 자리를 가리켰어요.';
    }
    const escape = ui.esc;
    const roster = s.players.map((player,i) => '<li><b>'+ (i+1) +'</b> '+escape(player)+
      (i === s.me ? ' (나)' : '') + (seating && !g.positions[i] ? ' · 자리 선택 중' : '') +'</li>').join('');
    return '<h1 class="bottle-heading">' + title + '</h1><p class="bottle-hint">' + hint + '</p>' +
      '<div class="bottle-board ' + g.shape + '" style="--ratio:' + ratio + ';--board-width:' + width + 'px">' +
      '<div class="bottle-pointer" aria-hidden="true"><div class="bottle-glass"><i></i></div></div>' +
      (seating ? '<button type="button" class="bottle-hit" aria-label="내 자리 놓기. 방향키로 위치를 정하고 엔터를 누르세요."></button>' : '') +
      markers + '</div>' + mainButton + '<ul class="bottle-players" aria-label="참가자 자리">' + roster + '</ul>' +
      (seating && host ? '<button type="button" class="bottle-table-reset" data-game-action="change_table">테이블 다시 고르기</button>' : '');
  }
  function angleAt(g, now) {
    if (g.phase === 'done') return g.finalDeg;
    if (g.phase === 'spinning') return (g.initialDeg + Math.max(0, now-g.spinAt)*1.44) % 360;
    if (g.phase !== 'braking') return 0;
    const elapsed = Math.max(0, now-g.started);
    if (elapsed <= g.forwardMs || !g.returnMs) {
      const t = Math.min(1, elapsed/g.forwardMs);
      return g.initialDeg + g.travel*(1-(1-t)**g.power);
    }
    const t = Math.min(1, Math.max(0,(elapsed-g.durationMs+g.returnMs)/g.returnMs));
    return g.initialDeg + g.travel - g.reverseDeg*t*t*(3-2*t);
  }
  function restrictPoint(x,y,shape) {
    let dx=x-50, dy=y-50;
    if (shape==='oval' || shape==='round') {
      const scale = Math.max(1,Math.hypot(dx,dy)/44.99);
      dx/=scale; dy/=scale;
    } else {
      dx=Math.max(-45,Math.min(45,dx)); dy=Math.max(-45,Math.min(45,dy));
    }
    return {x:Number((50+dx).toFixed(4)), y:Number((50+dy).toFixed(4))};
  }
  function mount(s, ui) {
    const root = document.querySelector('#game');
    if (s.phase === 'table') {
      const form = root.querySelector('#bottle-table');
      if (form) form.onsubmit = event => {
        event.preventDefault();
        ui.send('table',{shape:form.elements.shape.value,direction:form.elements.direction.value});
      };
      return;
    }
    const g=s.game, board=root.querySelector('.bottle-board'), pointer=board.querySelector('.bottle-pointer');
    if (s.phase==='seating') {
      const surface=board.querySelector('.bottle-hit');
      let cursor=g.positions[s.me] || {x:50,y:15};
      const updateCursor=()=>{surface.style.setProperty('--x',cursor.x+'%');surface.style.setProperty('--y',cursor.y+'%')};
      updateCursor();
      surface.onkeydown=e=>{
        const delta={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];
        if (!delta) return;
        e.preventDefault();
        const step=e.shiftKey?1:5;
        cursor=restrictPoint(cursor.x+delta[0]*step, cursor.y+delta[1]*step, g.shape);
        updateCursor();
      };
      surface.onclick=e=>{
        const box=board.getBoundingClientRect();
        const point=e.detail===0?cursor:restrictPoint((e.clientX-box.left)*100/box.width,(e.clientY-box.top)*100/box.height,g.shape);
        ui.send('seat',point);
      };
      return;
    }
    if(s.phase==='spinning' && s.me===0){
      backgroundBrake=e=>{
        if (!e.target.closest('button,a,input,select,textarea,label,dialog,[data-drinking-overlay]')) ui.send('brake');
      };
      document.addEventListener('click',backgroundBrake);
    }
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate=()=>{
      const now=ui.now();
      // A static pointer avoids rapid motion when reduced motion is requested.
      const waiting=reduced && (s.phase==='spinning' || (s.phase==='braking' && now<g.started+g.durationMs));
      pointer.style.transform='rotate('+(waiting?0:angleAt(g,now))+'deg)';
      if (!reduced && (s.phase==='spinning' || (s.phase==='braking' && now<g.started+g.durationMs)))
        frame=requestAnimationFrame(animate);
    };
    animate();
  }
  function unmount(){
    cancelAnimationFrame(frame);frame=0;
    if(backgroundBrake){document.removeEventListener('click',backgroundBrake);backgroundBrake=null;}
  }
  window.PartyLiveGame={view,mount,unmount};
})();

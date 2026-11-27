/* A practice round never starts a real game or submits a score. */
(() => {
  'use strict';
  const lessons = {
    sacheonseong: {name:'사천성', prompt:'같은 꽃 두 장을 차례로 눌러 보세요.', tiles:['🌸','🌸','🍃'], path:[0,1], pair:true, result:'같은 패를 연결했어요.'},
    solitaire: {name:'솔리테어', prompt:'하트 A를 고른 뒤 빈 미션칸에 놓아 보세요.', tiles:['♥ A','♣ 7','빈 미션칸'], path:[0,2], result:'A부터 같은 무늬를 차례로 모아요.'},
    onecard: {name:'원카드', prompt:'바닥은 빨강 5예요. 같은 색이나 숫자의 카드를 내세요.', tiles:['파랑 3','노랑 5','초록 8'], path:[1], result:'숫자 5가 같아서 낼 수 있어요.'},
    mines: {name:'지뢰찾기', prompt:'숫자 1 옆에 남은 닫힌 칸은 하나예요. 그 칸을 길게 눌러 깃발을 꽂으세요.', tiles:['열린 칸','숫자 1','닫힌 칸'], path:[2], hold:true, result:'⚑ 지뢰가 있는 칸을 표시했어요.'},
    saetbyeol: {name:'샛별키우기', prompt:'탐험 중인 샛별을 위해 먹이를 골라 보세요.', tiles:['빈 공간','먹이 ✦'], path:[1], result:'먹이를 모아 샛별을 키워요.'},
    screw: {name:'나사 풀기', prompt:'박스에서 보이는 나사 머리를 눌러 빼 보세요.', tiles:['판자','나사 🔩','판자'], path:[1], result:'가려진 나사는 모형을 돌려 찾아요.'},
    screw_flat: {name:'나사 풀기 · 평면형', prompt:'나사를 누르고 옮길 빈 구멍을 골라 보세요.', tiles:['나사 🔩','빈 구멍 ○','철판'], path:[0,1], result:'철판을 잡고 있던 나사를 옮겼어요.'},
    spot: {name:'틀린그림찾기', prompt:'보기는 🌳 🌸 🌳예요. 아래에서 달라진 곳을 누르세요.', tiles:['🌳','🍎','🌳'], path:[1], result:'가운데 꽃이 사과로 바뀌었어요.'},
    mole: {name:'두더지 잡기', prompt:'구멍에서 나온 두더지를 잡아 보세요.', tiles:['빈 구멍','두더지','폭탄'], path:[1], result:'두더지를 잡았어요!'},
    runner: {name:'쭈달리기', prompt:'앞에 끊긴 발판이 있어요. 뛰어넘어 보세요.', tiles:['슬라이드','점프 ↑'], path:[1], result:'점프를 한 번 더 누르면 2단 점프예요.'},
    stacker: {name:'탑 쌓기', prompt:'위 블록이 아래 블록과 겹칠 때 멈춰 보세요.', timing:true, tiles:['블록 놓기'], result:'겹친 부분 위로 다음 블록을 쌓아요.'},
    breakout: {name:'벽돌깨기', prompt:'공이 오른쪽으로 내려와요. 공 아래에 받침대를 놓으세요.', tiles:['왼쪽','가운데','오른쪽 ●'], path:[2], result:'받침대로 공을 튕겨 벽돌을 깨요.'},
    chacha_rush: {name:'차차 러시!', prompt:'가운데 차선에 장애물이 있어요. 빈 차선으로 피하세요.', tiles:['차량','장애물','빈 차선 →'], path:[2], result:'빈 차선으로 이동했어요.'},
    janggi: {name:'장기', prompt:'졸을 고르고 바로 앞의 빈자리를 눌러 한 칸 전진해 보세요.', tiles:['졸 卒','앞 한 칸','뒤 한 칸'], path:[0,1], result:'졸을 한 칸 움직였어요.'},
    chess: {name:'체스', prompt:'백 폰을 골라 바로 앞의 빈칸으로 옮겨 보세요.', tiles:['♙ 폰','앞 한 칸','옆 한 칸'], path:[0,1], result:'폰을 한 칸 전진시켰어요.'},
    billiards: {name:'당구', prompt:'4구 연습이에요. 흰 수구로 맞힐 빨간 공 두 개를 골라 보세요.', tiles:['🔴','🟡','🔴'], path:[0,2], pair:true, result:'4구에서는 빨간 공 두 개를 맞혀요.'},
    carom3: {name:'당구 · 3쿠션', prompt:'내 수구가 두 번째 공을 맞히기 전까지 거쳐야 할 쿠션 수를 고르세요.', tiles:['1회','2회','3회 이상'], path:[2], result:'쿠션을 세 번 이상 거치면 득점할 수 있어요.'},
    pool8: {name:'당구 · 8볼', prompt:'내 공을 모두 넣었어요. 마지막에 넣을 공을 골라 보세요.', tiles:['하얀 수구','검은 8번 공'], path:[1], result:'내 공을 모두 넣은 뒤 8번 공을 노려요.'},
    yut: {name:'윷놀이', prompt:'‘개’가 나왔어요. 출발할 말을 고르고 두 칸 앞으로 가세요.', tiles:['내 말','한 칸','두 칸'], path:[0,2], result:'개는 두 칸이에요.'},
    tour: {name:'마블', prompt:'주사위를 굴려 말을 움직여 보세요.', tiles:['주사위 굴리기 🎲'], path:[0], result:'주사위 눈만큼 말을 옮겨요.'},
    tank: {name:'탱크게임', prompt:'내 탱크 차례예요. 위치를 바꾸는 버튼을 눌러 보세요.', tiles:['왼쪽 이동 ◀','차례 종료'], path:[0], result:'내 차례에 탱크의 위치를 바꿀 수 있어요.'},
    ttang: {name:'월드땅따먹기', prompt:'내 땅에서 바깥으로 나간 뒤 다시 내 땅으로 돌아오세요.', tiles:['바깥으로 →','내 땅으로 ↩'], path:[0,1], result:'선을 닫아 새 땅을 차지했어요.'},
    photo_ttang: {name:'포토땅따먹기', prompt:'테두리 밖으로 선을 그었다가 내 땅으로 돌아오세요.', tiles:['선 그리기','내 땅으로 ↩'], path:[0,1], result:'둘러싼 영역의 사진이 열려요.'},
    matgo: {name:'맞고', prompt:'손에 든 1월 송학과 같은 달의 바닥패를 고르세요.', tiles:['3월 벚꽃','1월 송학','8월 공산'], path:[1], result:'같은 달의 패를 가져왔어요.'},
  };
  const aliases = {screw_box:'screw',carom4:'billiards'};
  const canonical = id => aliases[id] || id;
  const supports = id => Object.hasOwn(lessons, canonical(id));
  const memory = new Set();
  const storageKey = id => 'ojjuda.arcade.practice.v1.' + id;
  function seen(id) {
    if (memory.has(id)) return true;
    try { return localStorage.getItem(storageKey(id)) === '1'; } catch { return false; }
  }
  function remember(id) {
    memory.add(id);
    try { localStorage.setItem(storageKey(id),'1'); } catch {}
  }
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    if (tag === 'button') node.type = 'button';
    return node;
  }
  let current;
  function show(id, {replay=false, onContinue, title}={}) {
    id = canonical(id);
    if (!supports(id) || (!replay && seen(id)) || typeof HTMLDialogElement === 'undefined') return false;
    if (current) return true;
    const lesson = lessons[id];
    const dialog = element('dialog','arcade-practice');
    const heading = element('h2','ap-title',title || lesson.name);
    heading.id = 'arcade-practice-title';
    dialog.setAttribute('aria-labelledby',heading.id);
    const prompt = element('p','ap-prompt',lesson.prompt);
    const choices = element('div','ap-choices');
    const feedback = element('p','ap-feedback');
    feedback.setAttribute('role','status');
    const skip = element('button','ap-skip',replay ? '닫기' : '건너뛰기');
    const accept = element('button','ap-done',onContinue ? '게임으로' : '완료');
    accept.hidden = true;
    dialog.append(element('small','ap-eyebrow','조작 연습'),heading,prompt);
    let moving, base;
    if (lesson.timing) {
      const track = element('div','ap-track');
      track.setAttribute('aria-hidden','true');
      moving = element('i','ap-moving'); base = element('i','ap-base');
      track.append(moving,base); dialog.append(track);
    }
    let step = 0, first = -1;
    const buttons = lesson.tiles.map((label,index) => {
      const button = element('button','ap-tile',label);
      let startedAt=null, held=false;
      if (lesson.hold) {
        button.style.touchAction='manipulation'; button.style.userSelect='none';
        button.oncontextmenu=event=>event.preventDefault();
        button.onpointerdown=()=>{startedAt=performance.now();held=false;};
        button.onpointerup=()=>{held=startedAt!==null && performance.now()-startedAt>=350;startedAt=null;};
        button.onpointercancel=()=>{startedAt=null;held=false;};
      }
      button.onclick = event => {
        if (lesson.hold && event.detail!==0 && !held) {feedback.textContent='손을 조금 더 오래 대세요.';return;}
        if (lesson.timing) {
          const a=moving.getBoundingClientRect(), b=base.getBoundingClientRect();
          if (a.right<=b.left || a.left>=b.right) {
            feedback.textContent='조금 빗나갔어요. 다시 놓아 보세요.'; return;
          }
          moving.style.animationPlayState='paused';
        } else {
          const correct = lesson.pair ? lesson.path.includes(index) && index !== first : index===lesson.path[step];
          if (!correct) { feedback.textContent='다른 칸을 골라 보세요.'; return; }
          first=index; step++;
          button.setAttribute('aria-pressed','true');
          if (step < lesson.path.length) { feedback.textContent=lesson.pair?'짝이 되는 패를 눌러 보세요.':'이제 다음 칸을 눌러 보세요.'; return; }
        }
        buttons.forEach(tile=>tile.disabled=true);
        feedback.textContent=lesson.result;
        skip.hidden=true; accept.hidden=false; accept.focus();
      };
      choices.append(button);
      return button;
    });
    dialog.append(choices,feedback,skip,accept);
    const finish = () => {
      if (current !== dialog) return;
      remember(id);
      current=null;
      dialog.close(); dialog.remove();
      onContinue?.();
    };
    skip.onclick=accept.onclick=finish;
    dialog.oncancel = event => { event.preventDefault(); finish(); };
    document.body.append(dialog);
    try { dialog.showModal(); } catch { dialog.remove(); return false; }
    current=dialog;
    return true;
  }
  window.OjjudaArcadePractice = {supports,show};
  const standalone=document.currentScript?.dataset.game;
  if (supports(standalone)) {
    const options=new URL(location.href).searchParams;
    const invited=['room','join','invite','code','create','party','resume','mode'].some(key=>options.has(key));
    if (!invited && window===window.parent) show(standalone);
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-practice-replay]')) show(standalone,{replay:true});
    });
  }
})();

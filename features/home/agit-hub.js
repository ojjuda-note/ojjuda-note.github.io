/* Ojjuda Agit: daily visits, five missions, and mini-puzzles. */
(function (root) {
  'use strict';

  const gameIds = ['spot', 'sacheonseong', 'archery', 'mines', 'breakout', 'stacker', 'solitaire', 'screw', 'mole', 'saetbyeol', 'runner'];
  const consonants = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const visitPages = [
    {id:'festival', name:'축제'},
    {id:'restaurants', name:'맛집'},
    {id:'fanpages', name:'팬페이지'},
    {id:'group', name:'그룹'}
  ];
  const missionLabels = {
    park: ['공원에 글 남기기', '🌷'],
    baseball: ['숫자야구', '⚾'],
    quiz: ['오늘의 퀴즈', '🧩'],
    recommend: ['추천게임 시작하기', '🎮'],
    visit: ['아지트 페이지 들어가기', '🚪']
  };
  const triviaQuestions = [
    ['대한민국의 수도는?', ['부산', '서울', '대전', '인천'], 1],
    ['태양계에서 가장 큰 행성은?', ['지구', '화성', '목성', '금성'], 2],
    ['한글을 창제한 왕은?', ['세종대왕', '정조', '태종', '영조'], 0],
    ['1년 중 날짜가 가장 적은 달은?', ['4월', '6월', '2월', '11월'], 2],
    ['무지개 색은 보통 몇 가지로 나눌까?', ['5가지', '6가지', '7가지', '8가지'], 2],
    ['지구의 위성은?', ['금성', '태양', '화성', '달'], 3],
    ['올림픽 오륜기의 고리 개수는?', ['4개', '5개', '6개', '7개'], 1],
    ['곤충의 다리는 몇 개일까?', ['4개', '6개', '8개', '10개'], 1],
    ['대한민국의 국화는?', ['장미', '진달래', '무궁화', '개나리'], 2],
    ['피아노 건반에서 한 옥타브의 흰 건반은?', ['5개', '6개', '7개', '8개'], 2],
    ['지구에서 가장 넓은 바다는?', ['대서양', '태평양', '인도양', '북극해'], 1],
    ['물의 화학식은?', ['CO₂', 'O₂', 'H₂O', 'NaCl'], 2]
  ];
  const wordQuestions = [
    ['바나나', '노란색 긴 과일'], ['무지개', '비 온 뒤 하늘'],
    ['도서관', '책을 빌리는 곳'], ['사과나무', '빨간 과일이 열리는 나무'],
    ['해바라기', '태양을 닮은 꽃'], ['눈사람', '겨울에 만드는 친구'],
    ['비행기', '하늘을 나는 교통수단'], ['고양이', '야옹 하는 동물'],
    ['딸기우유', '분홍색 달콤한 음료'], ['우산', '비 오는 날 펼치는 물건'],
    ['수박', '여름에 먹는 초록 껍질 과일'], ['컴퓨터', '키보드와 마우스로 쓰는 기계']
  ];

  function kstDate(date = new Date()) {
    return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  }
  function dayNumber(date) {
    return Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  }
  function addDays(date, offset) {
    return new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function missions(date = kstDate()) {
    return ['park', 'baseball', 'quiz', 'recommend', 'visit'];
  }
  function visitTarget(date = kstDate()) {
    // Start with festivals on 2026-11-10, then rotate one destination per KST day.
    const offset = dayNumber(date) - dayNumber('2026-11-10');
    return visitPages[((offset % visitPages.length) + visitPages.length) % visitPages.length];
  }
  function quizMode(date = kstDate()) {
    return dayNumber(date) % 2 === 0 ? 'chosung' : 'trivia';
  }
  function recommended(games, date = kstDate()) {
    const list = gameIds.filter(id => games && games[id] && !(games[id].age >= 19));
    if (!list.length) return null;
    const id = list[((dayNumber(date) % list.length) + list.length) % list.length];
    return {id, ...games[id]};
  }
  function themeFor(date = kstDate()) {
    const month = Number(date.slice(5, 7));
    const calendar = root.OjjudaThemes;
    const instant = new Date(date + 'T03:00:00Z');
    const season = calendar?.seasonFor?.(instant) || (month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter');
    const key = calendar?.resolve(instant) || season;
    const names = {spring:'봄', summer:'여름', autumn:'가을', winter:'겨울'};
    const entry = calendar?.catalog?.[key];
    return {key, season, name:entry?.name || names[key] || '오늘', headline:entry?.headline || ['오늘도','잘 왔어!'], copy:entry?.copy || '잠깐 쉬다가, 한 판 놀다 가.'};
  }
  function safeState(settings) {
    const raw = settings && typeof settings.agitHub === 'object' && settings.agitHub || {};
    const stamps = Array.isArray(raw.stamps) ? raw.stamps.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    const completed = raw.completed && typeof raw.completed === 'object' && !Array.isArray(raw.completed) ? raw.completed : {};
    const guesses = raw.guesses && typeof raw.guesses === 'object' && !Array.isArray(raw.guesses) ? raw.guesses : {};
    return {stamps: [...new Set(stamps)].sort().slice(-120), completed, guesses};
  }
  function mergeProgress(remote, local, date = kstDate()) {
    const first = safeState({agitHub:remote}), second = safeState({agitHub:local});
    const stamps = [...new Set([...first.stamps, ...second.stamps])].filter(d => d <= date).sort().slice(-120);
    const completed = {}, guesses = {};
    for (const day of new Set([...Object.keys(first.completed), ...Object.keys(second.completed)])) {
      if (day < addDays(date, -35) || day > date || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const ids = [...(Array.isArray(first.completed[day]) ? first.completed[day] : []),
        ...(Array.isArray(second.completed[day]) ? second.completed[day] : [])];
      const valid = [...new Set(ids.filter(id => missions(day).includes(id)))];
      if (valid.length) completed[day] = valid;
    }
    for (const day of new Set([...Object.keys(first.guesses), ...Object.keys(second.guesses)])) {
      if (day < addDays(date, -7) || day > date || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const entries = [...(Array.isArray(first.guesses[day]) ? first.guesses[day] : []),
        ...(Array.isArray(second.guesses[day]) ? second.guesses[day] : [])];
      const unique = new Map();
      for (const entry of entries) if (entry && typeof entry.guess === 'string' && /^[1-9]{3}$/.test(entry.guess) && new Set(entry.guess).size === 3) unique.set(entry.guess, entry);
      if (unique.size) guesses[day] = [...unique.values()].slice(-25);
    }
    return {stamps, completed, guesses};
  }
  function visitStreak(settings, date = kstDate()) {
    const stamps = new Set(safeState(settings).stamps);
    let current = stamps.has(date) ? date : addDays(date, -1), count = 0;
    while (stamps.has(current) && count < 120) {
      count++;
      current = addDays(current, -1);
    }
    return count;
  }
  function save(settings, state, date) {
    if(root.OjjudaAdminPreview?.isEnabled?.()===true)return false;
    if (!settings || typeof settings !== 'object') return false;
    state.stamps = state.stamps.filter(d => d <= date).slice(-120);
    state.completed = Object.fromEntries(Object.entries(state.completed).filter(([d]) => d >= addDays(date, -35) && d <= date));
    state.guesses = Object.fromEntries(Object.entries(state.guesses).filter(([d]) => d >= addDays(date, -7) && d <= date));
    settings.agitHub = state;
    return true;
  }
  function isComplete(settings, id, date = kstDate()) {
    return !!safeState(settings).completed[date]?.includes?.(id);
  }
  function complete(settings, id, date = kstDate()) {
    if (!missions(date).includes(id) || isComplete(settings, id, date)) return false;
    const state = safeState(settings), done = Array.isArray(state.completed[date]) ? state.completed[date] : [];
    state.completed[date] = [...done, id];
    return save(settings, state, date);
  }
  function stamp(settings, date = kstDate()) {
    const state = safeState(settings);
    if (state.stamps.includes(date)) return false;
    state.stamps.push(date);
    return save(settings, state, date);
  }
  function trivia(date = kstDate()) {
    return triviaQuestions[((dayNumber(date) % triviaQuestions.length) + triviaQuestions.length) % triviaQuestions.length];
  }
  function chosung(date = kstDate()) {
    return wordQuestions[((dayNumber(date) % wordQuestions.length) + wordQuestions.length) % wordQuestions.length];
  }
  function initials(word) {
    return Array.from(word).map(char => {
      const code = char.charCodeAt(0) - 44032;
      return code >= 0 && code < 11172 ? consonants[Math.floor(code / 588)] : char;
    }).join('');
  }
  function baseballAnswer(date = kstDate()) {
    let seed = (dayNumber(date) * 1664525 + 1013904223) >>> 0;
    const digits = '123456789'.split('');
    for (let i = digits.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 3).join('');
  }
  function guessBaseball(settings, guess, date = kstDate()) {
    if (!/^[1-9]{3}$/.test(guess) || new Set(guess).size !== 3) return {valid:false};
    const state = safeState(settings), previous = Array.isArray(state.guesses[date]) ? state.guesses[date] : [];
    const answer = baseballAnswer(date);
    const strike = [...guess].filter((digit, i) => answer[i] === digit).length;
    const ball = [...guess].filter((digit, i) => answer.includes(digit) && answer[i] !== digit).length;
    if (!previous.some(item => item.guess === guess)) state.guesses[date] = [...previous, {guess, strike, ball}].slice(-25);
    const won = strike === 3;
    if (won && missions(date).includes('baseball')) state.completed[date] = [...new Set([...(state.completed[date] || []), 'baseball'])];
    save(settings, state, date);
    return {valid:true, strike, ball, won};
  }
  function appendBaseballDigit(current, digit) {
    const value = String(current || ''), next = String(digit);
    return /^[1-9]$/.test(next) && /^[1-9]{0,3}$/.test(value) && value.length < 3 && !value.includes(next) ? value + next : value;
  }
  function baseballResultMarkup(strike, ball) {
    return Number(strike) === 0 && Number(ball) === 0
      ? '<span class="agit-baseball-chip is-out">OUT · 아웃</span>'
      : `<span class="agit-baseball-chip is-strike">${Number(strike)} 스트라이크</span><span class="agit-baseball-chip is-ball">${Number(ball)} 볼</span>`;
  }
  function missionMarkup(settings, date) {
    const today = missions(date), done = today.filter(id => isComplete(settings, id, date)).length;
    return `<section class="agit-quests" id="agit-missions" aria-label="오늘의 미션">
      <header class="agit-section-head"><h2>오늘의 미션</h2><div class="agit-quest-summary"><span class="agit-quest-tally"><b>${done}</b><small>/ ${today.length}</small></span><div class="agit-quest-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${today.length}" aria-valuenow="${done}" aria-label="미션 완료">${today.map((_,i)=>`<span class="${i<done?'is-on':''}"></span>`).join('')}</div></div></header>
      <div class="agit-quest-grid">${today.map((id,i) => {
        const target=id==='visit'?visitTarget(date):null;
        const [label,emoji]=target?[`${target.name} 페이지 들어가기`,'🚪']:
          id==='quiz'?(quizMode(date)==='chosung'?['초성 퀴즈','🔤']:['상식 퀴즈','💡']):missionLabels[id];
        const finished=isComplete(settings,id,date);
        return `<button type="button" class="agit-quest-card agit-quest-card--${i+1}${finished?' is-done':''}" data-act="agit-task" data-v="${id}" aria-label="${finished?'완료한 미션':'오늘의 미션'}: ${label}">
          <span class="agit-quest-number">0${i+1}</span>
          <span class="agit-quest-emoji" aria-hidden="true">${finished?'✓':emoji}</span>
          <strong class="agit-quest-name">${label}</strong>
          <span class="agit-quest-arrow" aria-hidden="true">${finished?'✓':'↗'}</span>
        </button>`;
      }).join('')}</div></section>`;
  }
  function markup(settings, games, date = kstDate()) {
    const state = safeState(settings), game = recommended(games, date), theme = themeFor(date);
    const weekStart = addDays(date, -((new Date(date+'T00:00:00Z').getUTCDay()+6)%7));
    const weekDays = Array.from({length:7}, (_, i) => addDays(weekStart, i));
    const stamped = state.stamps.includes(date);
    const stampedCount = weekDays.filter(d => state.stamps.includes(d)).length;
    const streak = visitStreak(settings, date);
    const [, month, day] = date.split('-');
    const weekday = ['일','월','화','수','목','금','토'][new Date(date+'T00:00:00Z').getUTCDay()];
    const daily = Object.entries(games || {}).filter(([, r]) => r.test && !(r.age >= 19));
    const lifeItems = daily.map(([id, item]) => ({id, item}));
    const festivalPosition = lifeItems.findIndex(entry => entry.id === 'festival');
    if (festivalPosition >= 0) {
      const [festival] = lifeItems.splice(festivalPosition, 1);
      lifeItems.splice(festivalPosition, 0, {id:'fanpages'});
      lifeItems.push(festival);
    } else {
      lifeItems.push({id:'fanpages'});
    }
    const dailyHints = {group:'함께하는 이야기',festival:'이번 주 어디 갈까?',restaurants:'맛있는 발견',tour:'가볍게 떠나요'};
    return `<div class="agit-hub" id="agit-hub-view" data-agit-hub data-agit-season="${theme.season}" data-agit-theme="${theme.key}">
      <header class="agit-hero" aria-label="아지트">
        <div class="agit-hero-story">
          <span class="agit-hero-eyebrow"><span aria-hidden="true">✦</span> ${Number(month)}월 ${Number(day)}일 ${weekday}요일 <strong>${escapeHtml(theme.name)} 테마</strong></span>
          <h1><span class="agit-hero-highlight">${escapeHtml(theme.headline[0])} <em>${escapeHtml(theme.headline[1])}</em></span></h1>
          <p><span class="agit-hero-highlight agit-hero-highlight--copy">${escapeHtml(theme.copy)}</span></p>
        </div>
        <section class="agit-hero-pick" id="agit-recommend" aria-label="오늘의 추천게임">
            <div class="agit-pick-top">오늘의 추천게임 <span>매일 바뀌어요</span></div>
            ${game ? `<div class="agit-pick-body"><div class="agit-pick-art"><img src="/assets/design/games/${game.id}.svg" alt="" width="62" height="62" loading="lazy"></div><div class="agit-pick-foot"><strong>${escapeHtml(game.name)}</strong><button type="button" class="agit-play-button" data-act="agit-play" data-v="${game.id}" aria-label="${escapeHtml(game.name)} 게임 시작">한 판 놀기 <span aria-hidden="true">↗</span></button></div></div>` : '<p>추천게임을 준비하고 있어요.</p>'}
          </section>
        <div class="agit-hero-visual" aria-hidden="true"><span class="agit-hero-halo"></span><img class="agit-hero-theme-art" src="/features/home/theme-illustrations/${theme.key}.webp?v=20261110-themes3" alt="" width="960" height="640" decoding="async" loading="eager" fetchpriority="high"></div>
      </header>
      <section class="agit-checkin" id="agit-stamp" aria-label="방문 도장">
        <div class="agit-checkin-label"><span class="agit-checkin-symbol" aria-hidden="true">✿</span><div><h2>방문 도장</h2><small>${streak?streak+'일 연속 방문 중!':'오늘부터 시작해요'} <span aria-hidden="true">·</span> 이번 주 ${stampedCount}/7</small></div></div>
        <div class="agit-stamp-days">${weekDays.map(d => {
          const name=['일','월','화','수','목','금','토'][new Date(d+'T00:00:00Z').getUTCDay()],on=state.stamps.includes(d),upcoming=d>date;
          return `<div class="agit-stamp-day${on?' is-stamped':''}${d===date?' is-today':''}${upcoming?' is-upcoming':''}" aria-label="${d} ${on?'방문 완료':upcoming?'방문 예정':'미방문'}"><span>${name}</span><strong aria-hidden="true">${on?'✓':'·'}</strong><small>${Number(d.slice(-2))}</small></div>`;
        }).join('')}</div>
        <button type="button" class="agit-stamp-button" data-act="agit-stamp"${stamped?' disabled':''}>${stamped?'오늘 도장 완료 ✓':'도장 콕 찍기 ✦'}</button>
      </section>
      ${missionMarkup(settings,date)}
      <section class="agit-life" id="agit-daily" aria-label="일상"><header class="agit-section-head"><div><span class="agit-section-kicker">쉬어 가는 곳</span><h2>일상 둘러보기</h2></div></header>
        <div class="agit-life-grid">${lifeItems.map(({id,item},i) => {
           if(id==='fanpages')return `<a class="agit-life-tile agit-life-tile--4" href="/features/fanpages/index.html" data-act="agit-fan" aria-label="팬페이지"><span class="agit-life-top"><span class="agit-life-tile-arrow" aria-hidden="true">↗</span></span><span class="agit-life-art"><img src="/features/fanpages/fan-tile.svg?v=20261110-fanpages1" alt="" width="160" height="112" loading="lazy"></span><span class="agit-life-title"><strong>팬페이지</strong><small>좋아하는 이야기</small></span></a>`;
          if(!/^[a-z0-9_]+$/.test(id))return '';
          return `<button type="button" class="agit-life-tile agit-life-tile--${id==='festival'?2:id==='group'?1:id==='restaurants'?3:i%4+1}" data-act="agit-daily" data-v="${id}" aria-label="${escapeHtml(item.name)}${item.memberOnly?' · 회원 전용':''}">
            <span class="agit-life-top"><span class="agit-life-tile-arrow" aria-hidden="true">↗</span></span>
            <span class="agit-life-art"><img src="/assets/design/games/${id}.svg" alt="" width="160" height="112" loading="lazy"></span>
            <span class="agit-life-title"><strong>${escapeHtml(item.name)}</strong><small>${item.memberOnly?'회원 전용':escapeHtml(dailyHints[id]||'구경하기')}</small></span>
          </button>`;
        }).join('')}</div>
      </section>
      <footer class="agit-footer"><span>오쭈다 아지트</span><button type="button" data-act="feedback-open">의견 보내기 <span aria-hidden="true">→</span></button></footer>
    </div>`;
  }
  function puzzleMarkup(settings, id, date = kstDate()) {
    if (id === 'trivia') {
      const [question, answers] = trivia(date);
      return `<h3 class="agit-puzzle-question">${escapeHtml(question)}</h3><div class="agit-choices">${answers.map((answer, i) => `<button class="btn" type="button" data-act="agit-quiz-answer" data-v="${i}">${escapeHtml(answer)}</button>`).join('')}</div><p class="agit-puzzle-feedback" role="status"></p>`;
    }
    if (id === 'chosung') {
      const [answer, hint] = chosung(date);
      return `<p class="agit-puzzle-symbol">${initials(answer)}</p><p class="agit-puzzle-hint">${escapeHtml(hint)}</p><div class="agit-puzzle-input"><input id="agit-puzzle-answer" class="inp" type="text" maxlength="20" autocomplete="off" aria-label="초성 정답" placeholder="정답 입력"><button type="button" class="btn pri" data-act="agit-solve">확인</button></div><p class="agit-puzzle-feedback" role="status"></p>`;
    }
    if (id === 'baseball') {
      const history = safeState(settings).guesses[date] || [];
      return `<p class="agit-puzzle-hint">서로 다른 숫자 3개를 순서대로 눌러봐요.</p>
        <div class="agit-baseball-picked" role="status" aria-live="polite" aria-label="선택한 숫자 없음">${[1,2,3].map(i=>`<span class="agit-baseball-slot" data-baseball-slot="${i}" aria-hidden="true">·</span>`).join('')}</div>
        <input id="agit-puzzle-answer" type="hidden" value="">
        <div class="agit-baseball-keypad" role="group" aria-label="숫자 선택">${[1,2,3,4,5,6,7,8,9].map(digit=>`<button type="button" class="agit-baseball-key" data-act="agit-baseball-digit" data-v="${digit}" aria-label="숫자 ${digit} 선택">${digit}</button>`).join('')}
          <button type="button" class="agit-baseball-key is-utility" data-act="agit-baseball-backspace">← 지우기</button>
          <button type="button" class="agit-baseball-key is-utility" data-act="agit-baseball-clear">초기화</button>
          <button type="button" class="agit-baseball-key is-submit" data-act="agit-solve" disabled>확인 ↗</button>
        </div>
        <div class="agit-baseball-legend"><span class="is-strike">● 스트라이크</span><span class="is-ball">● 볼</span><span class="is-out">● 아웃</span></div>
        <p class="agit-puzzle-feedback" role="status"></p>
        <div class="agit-guess-list" role="list">${history.slice(-8).reverse().map(item => `<div class="agit-baseball-history-row" role="listitem"><strong>${escapeHtml(item.guess)}</strong><span class="agit-baseball-result">${baseballResultMarkup(item.strike,item.ball)}</span></div>`).join('')}</div>`;
    }
    return '';
  }
  const api = {kstDate, missions, visitTarget, quizMode, recommended, themeFor, safeState, mergeProgress, visitStreak, isComplete, complete, stamp, trivia, chosung, initials, baseballAnswer, appendBaseballDigit, baseballResultMarkup, guessBaseball, markup, puzzleMarkup};
  root.OjjudaAgitHub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Ojjuda Agit: simple daily visits, rotating missions, and mini-puzzles. */
(function (root) {
  'use strict';

  const gameIds = ['spot', 'sacheonseong', 'archery', 'mines', 'breakout', 'stacker', 'solitaire', 'screw', 'mole', 'saetbyeol', 'runner'];
  const consonants = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const missionLabels = {
    stamp: ['방문 도장 찍기', '도장 찍기', '📍'],
    recommend: ['추천게임 시작하기', '플레이', '🎮'],
    daily: ['일상 둘러보기', '보러가기', '✨'],
    arcade: ['오락실 방문하기', '이동', '🕹️'],
    trivia: ['상식 퀴즈', '풀기', '💡'],
    baseball: ['숫자야구', '풀기', '⚾'],
    chosung: ['초성 맞추기', '풀기', '🔤']
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
    const n = dayNumber(date);
    const activities = ['stamp', 'recommend', 'daily', 'arcade'];
    const puzzle = ['trivia', 'baseball', 'chosung'][((n % 3) + 3) % 3];
    const first = ((n % activities.length) + activities.length) % activities.length;
    return [activities[first], puzzle, activities[(first + 1 + Math.floor(n / 4) % 2 + activities.length) % activities.length]];
  }
  function recommended(games, date = kstDate()) {
    const list = gameIds.filter(id => games && games[id] && !(games[id].age >= 19));
    if (!list.length) return null;
    const id = list[((dayNumber(date) % list.length) + list.length) % list.length];
    return {id, ...games[id]};
  }
  function safeState(settings) {
    const raw = settings && typeof settings.agitHub === 'object' && settings.agitHub || {};
    const stamps = Array.isArray(raw.stamps) ? raw.stamps.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    const completed = raw.completed && typeof raw.completed === 'object' && !Array.isArray(raw.completed) ? raw.completed : {};
    const guesses = raw.guesses && typeof raw.guesses === 'object' && !Array.isArray(raw.guesses) ? raw.guesses : {};
    return {stamps: [...new Set(stamps)].sort().slice(-120), completed, guesses};
  }
  function save(settings, state, date) {
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
    if (missions(date).includes('stamp')) state.completed[date] = [...new Set([...(state.completed[date] || []), 'stamp'])];
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
  function missionMarkup(settings, date) {
    const today = missions(date), done = today.filter(id => isComplete(settings, id, date)).length;
    return `<section class="agit-panel agit-missions" id="agit-missions" aria-label="오늘의 미션"><div class="agit-panel-head"><h2>오늘의 미션</h2><span class="agit-mission-count">${done} / 3</span></div><div class="agit-mission-progress" role="progressbar" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${done}" aria-label="미션 완료"><span style="width:${done / 3 * 100}%"></span></div><div class="agit-mission-list">${today.map(id => {
      const [label, action, emoji] = missionLabels[id], finished = isComplete(settings, id, date);
      return `<button type="button" class="agit-mission${finished ? ' is-done' : ''}" data-act="agit-task" data-v="${id}" ${finished ? 'aria-label="완료한 미션: '+label+'"' : ''}><span class="agit-mission-icon" aria-hidden="true">${finished ? '✓' : emoji}</span><span class="agit-mission-title">${label}</span><span class="agit-mission-action">${finished ? '완료' : action}</span></button>`;
    }).join('')}</div></section>`;
  }
  function markup(settings, games, date = kstDate()) {
    const state = safeState(settings), game = recommended(games, date);
    const lastDays = Array.from({length:7}, (_, i) => addDays(date, i - 6));
    const stamped = state.stamps.includes(date);
    const stampedCount = lastDays.filter(d => state.stamps.includes(d)).length;
    const [year, month, day] = date.split('-');
    const daily = Object.entries(games || {}).filter(([, r]) => r.test && !(r.age >= 19));
    return `<div class="agit-hub" id="agit-hub-view" data-agit-hub><header class="agit-heading"><div><span class="world-eyebrow">OJjUDA AGIT · ${month}.${day}</span><h1>아지트</h1></div><span class="agit-date">${year}.${month}.${day}</span></header>
    <div class="agit-feature-grid"><section class="agit-panel agit-pick" id="agit-recommend" aria-label="오늘의 추천게임"><div class="agit-panel-head"><h2>오늘의 추천게임</h2><span class="agit-tag">TODAY</span></div>${game ? `<div class="agit-pick-body"><div class="agit-pick-copy"><strong>${escapeHtml(game.name)}</strong><button type="button" class="agit-primary" data-act="agit-play" data-v="${game.id}">게임 시작 <span aria-hidden="true">→</span></button></div><img src="/assets/design/games/${game.id}.svg" alt="" width="180" height="138" loading="lazy"></div>` : '<p>추천게임을 준비하고 있어요.</p>'}</section>
    <section class="agit-panel agit-stamps" id="agit-stamp" aria-label="방문 도장"><div class="agit-panel-head"><h2>방문 도장</h2><span class="agit-tag">최근 7일 ${stampedCount}/7</span></div><div class="agit-stamp-grid">${lastDays.map(d => {
      const dayName = ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00:00Z').getUTCDay()], on = state.stamps.includes(d);
      return `<div class="agit-stamp-day${on ? ' is-stamped' : ''}${d === date ? ' is-today' : ''}" aria-label="${d} ${on ? '방문 완료' : '미방문'}"><span>${dayName}</span><strong aria-hidden="true">${on ? '✓' : '·'}</strong></div>`;
    }).join('')}</div><button type="button" class="agit-stamp-button" data-act="agit-stamp"${stamped ? ' disabled' : ''}>${stamped ? '오늘 도장 완료 ✓' : '오늘 도장 찍기'}</button></section></div>
    ${missionMarkup(settings, date)}
    <section class="agit-panel agit-daily" id="agit-daily" aria-label="일상"><div class="agit-panel-head"><h2>일상</h2><span class="agit-tag">DAILY</span></div><div class="gbtns agit-daily-grid">${daily.map(([id, item]) => {
      if (!/^[a-z0-9_]+$/.test(id)) return '';
      return `<button type="button" class="gbtn" data-act="agit-daily" data-v="${id}" aria-label="${escapeHtml(item.name)}${item.memberOnly ? ' · 회원 전용' : ''}"><span class="ge" aria-hidden="true"><img src="/assets/design/games/${id}.svg" alt="" width="120" height="84" loading="lazy"></span><span class="game-name">${escapeHtml(item.name)}${item.memberOnly ? '<small class="game-test-badge">회원 전용</small>' : ''}</span></button>`;
    }).join('')}<a class="gbtn" href="/features/fanpages/index.html" data-act="agit-fan" aria-label="팬페이지"><span class="ge" aria-hidden="true"><img src="/features/fanpages/fan-tile.svg?v=20261110-fanpages1" alt="" width="120" height="84" loading="lazy"></span><span class="game-name">팬페이지<small class="game-test-badge">일상</small></span></a></div></section></div>`;
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
      return `<p class="agit-puzzle-hint">1~9 중 다른 숫자 3개를 맞혀요</p><div class="agit-puzzle-input"><input id="agit-puzzle-answer" class="inp" type="text" inputmode="numeric" pattern="[1-9]{3}" maxlength="3" autocomplete="off" aria-label="숫자야구 추측" placeholder="예: 123"><button type="button" class="btn pri" data-act="agit-solve">확인</button></div><p class="agit-puzzle-feedback" role="status"></p><div class="agit-guess-list">${history.slice(-8).reverse().map(item => `<span>${escapeHtml(item.guess)} <strong>${item.strike}S ${item.ball}B</strong></span>`).join('')}</div>`;
    }
    return '';
  }
  const api = {kstDate, missions, recommended, safeState, isComplete, complete, stamp, trivia, chosung, initials, baseballAnswer, guessBaseball, markup, puzzleMarkup};
  root.OjjudaAgitHub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

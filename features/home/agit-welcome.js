/* A kind hello on arrival. At most one popup per Korean calendar day. */
(function (root) {
  'use strict';

  const PREFIX = 'ojjuda.agit-welcome.v1:';
  const GLOBAL_DAY = 'ojjuda.agit-welcome.v1:shown-day';
  const KST = 9 * 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const VALID_GAME = /^[a-z0-9_]{1,40}$/;
  const MAX_DAYS = 400;
  const MAX_PENDING = 12;
  let active = null;
  let openDialog = null;

  function koreaDay(now = new Date()) {
    return new Date(new Date(now).getTime() + KST).toISOString().slice(0, 10);
  }
  function koreaHour(now = new Date()) {
    return new Date(new Date(now).getTime() + KST).getUTCHours();
  }
  function dayNumber(day) {
    return Date.parse(day + 'T00:00:00Z') / DAY;
  }
  function previousDay(day) {
    return new Date(Date.parse(day + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
  }
  function cleanDays(days) {
    return [...new Set((Array.isArray(days) ? days : []).filter(day => typeof day === 'string' && VALID_DAY.test(day)))]
      .sort().slice(-MAX_DAYS);
  }
  function cleanState(raw) {
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const counts = {};
    for (const [day, count] of Object.entries(data.visitCounts || {})) {
      if (VALID_DAY.test(day) && Number.isInteger(count) && count >= 1) counts[day] = Math.min(count, 99);
    }
    const pending = (Array.isArray(data.pending) ? data.pending : []).filter(event =>
      event && ['new_record', 'rank_overtaken'].includes(event.type) &&
      typeof event.id === 'string' && VALID_GAME.test(event.game || '') && VALID_DAY.test(event.day || '')
    ).slice(-MAX_PENDING).map(event => ({ id: event.id, type: event.type, game: event.game, day: event.day }));
    const records = {};
    for (const [game, value] of Object.entries(data.records || {})) {
      if (VALID_GAME.test(game) && Number.isFinite(value?.score) && value.score >= 0) {
        records[game] = { score: value.score, stage: Number(value.stage) || 0, opponents: Number(value.opponents) || 0 };
      }
    }
    const champions = {};
    for (const [game, value] of Object.entries(data.champions || {})) {
      if (VALID_GAME.test(game) && Number.isFinite(value?.score) && value.score > 0) {
        champions[game] = { score: value.score, stage: Number(value.stage) || 0, opponents: Number(value.opponents) || 0 };
      }
    }
    return {
      days: cleanDays(data.days),
      visitCounts: counts,
      firstSeen: VALID_DAY.test(data.firstSeen || '') ? data.firstSeen : null,
      shownDay: VALID_DAY.test(data.shownDay || '') ? data.shownDay : null,
      shownType: typeof data.shownType === 'string' ? data.shownType.slice(0, 40) : null,
      celebrated: (Array.isArray(data.celebrated) ? data.celebrated : []).filter(v => typeof v === 'string').slice(-20),
      pending,
      consumed: (Array.isArray(data.consumed) ? data.consumed : []).filter(v => typeof v === 'string').slice(-30),
      records,
      recordMonth: /^\d{4}-\d{2}$/.test(data.recordMonth || '') ? data.recordMonth : null,
      champions,
      championMonth: /^\d{4}-\d{2}$/.test(data.championMonth || '') ? data.championMonth : null,
      updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : 0
    };
  }
  function mergeStates(remote, local) {
    const a = cleanState(remote), b = cleanState(local);
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    const older = newer === a ? b : a;
    const visitCounts = { ...older.visitCounts };
    for (const [day, count] of Object.entries(newer.visitCounts)) visitCounts[day] = Math.max(count, visitCounts[day] || 0);
    const consumed = [...new Set([...a.consumed, ...b.consumed])].slice(-30);
    const pending = [...new Map([...a.pending, ...b.pending].map(event => [event.id, event])).values()]
      .filter(event => !consumed.includes(event.id)).slice(-MAX_PENDING);
    return {
      ...newer,
      days: cleanDays([...a.days, ...b.days]),
      visitCounts,
      firstSeen: [a.firstSeen, b.firstSeen].filter(Boolean).sort()[0] || null,
      shownDay: [a.shownDay, b.shownDay].filter(Boolean).sort().at(-1) || null,
      celebrated: [...new Set([...a.celebrated, ...b.celebrated])].slice(-20),
      pending, consumed,
      records: newer.recordMonth === older.recordMonth ? { ...older.records, ...newer.records } : newer.records,
      champions: newer.championMonth === older.championMonth ? { ...older.champions, ...newer.champions } : newer.champions,
      updatedAt: Math.max(a.updatedAt, b.updatedAt)
    };
  }
  function monthForRanking(now = new Date()) {
    // Rankings roll over at 01:00 in Korea.
    return new Date(new Date(now).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
  }
  function visit(state, today, options = {}) {
    const prior = cleanDays([...state.days, ...(options.stamps || [])]).filter(day => day <= today);
    const previous = prior.filter(day => day < today).at(-1) || null;
    const createdDay = options.createdDay;
    const firstSeen = [state.firstSeen, prior[0], VALID_DAY.test(createdDay || '') ? createdDay : null, today]
      .filter(Boolean).sort()[0];
    state.days = cleanDays([...prior, today]);
    state.firstSeen = firstSeen;
    state.visitCounts[today] = Math.min(99, (state.visitCounts[today] || 0) + 1);
    for (const day of Object.keys(state.visitCounts)) if (dayNumber(today) - dayNumber(day) > 7 || day > today) delete state.visitCounts[day];
    let cursor = today, streak = 0;
    const set = new Set(state.days);
    while (set.has(cursor) && streak < MAX_DAYS) { streak++; cursor = previousDay(cursor); }
    return {
      first: !previous && firstSeen === today,
      previous,
      gap: previous ? dayNumber(today) - dayNumber(previous) : 0,
      streak,
      daysTotal: state.days.length,
      yesterdayVisits: state.visitCounts[previousDay(today)] || 0,
      daysTogether: dayNumber(today) - dayNumber(firstSeen)
    };
  }
  function positiveScore(row) {
    const score = Number(row?.score);
    return Number.isFinite(score) && score > 0;
  }
  function metric(row) {
    return { score: Number(row.score), stage: Number(row.stage) || 0, opponents: Number(row.opponents) || 0 };
  }
  function recordChanged(current, prior) {
    // The ranking endpoint returns each member's monthly *best* result.
    // Some games use a lower time as an improvement, not a higher score.
    return current.score !== prior.score || current.stage !== prior.stage || current.opponents !== prior.opponents;
  }
  function addPending(state, type, game, today) {
    if (!VALID_GAME.test(game) || !['new_record', 'rank_overtaken'].includes(type)) return false;
    const id = type + ':' + game + ':' + today;
    if (state.consumed.includes(id) || state.pending.some(event => event.id === id)) return false;
    state.pending.push({ id, type, game, day: today });
    state.pending = state.pending.slice(-MAX_PENDING);
    return true;
  }
  function observeLeaders(state, leaders, month, today) {
    if (!leaders || typeof leaders !== 'object') return false;
    if (state.championMonth !== month) { state.championMonth = month; state.champions = {}; }
    let changed = false;
    for (const [game, row] of Object.entries(leaders)) {
      if (!VALID_GAME.test(game)) continue;
      if (row?.me === true && positiveScore(row)) {
        const current = metric(row), previous = state.champions[game];
        if (!previous || recordChanged(current, previous)) {
          if (previous) changed = addPending(state, 'new_record', game, today) || changed;
          state.champions[game] = current;
          changed = true;
        }
      } else if (state.champions[game] && positiveScore(row) && row?.me === false) {
        // A formerly verified first place is now held by another player.
        changed = addPending(state, 'rank_overtaken', game, today) || changed;
        delete state.champions[game];
      }
    }
    return changed;
  }
  function observePersonalRecord(state, game, rows, month, today) {
    if (!VALID_GAME.test(game) || !Array.isArray(rows)) return false;
    const mine = rows.find(row => row?.me === true && positiveScore(row));
    if (!mine) return false; // Never invent a record for an unranked member.
    if (state.recordMonth !== month) { state.recordMonth = month; state.records = {}; }
    const current = metric(mine), previous = state.records[game];
    state.records[game] = current;
    if (!previous || !recordChanged(current, previous)) return false;
    return addPending(state, 'new_record', game, today);
  }
  function hash(text) {
    let result = 2166136261;
    for (const char of String(text)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return result >>> 0;
  }
  function choose(variants, seed) {
    return variants[hash(seed) % variants.length];
  }
  const greetings = {
    first: [['처음 오셨군요! 정말 반가워요 🌷', '오쭈다는 한 판 놀다가 마음 편히 쉬어 가는 놀이터예요. 천천히 둘러보세요.']],
    return: [['또 와주셨네요! 기다리고 있었어요 💗', '어제보다 더 편한 놀이터가 되었으면 좋겠어요. 오늘은 무엇을 하고 싶으세요?']],
    five: [['5일 연속, 멋진 만남이에요! ✨', '하루하루 함께해 주셔서 고마워요. 오늘도 마음 가는 만큼만 놀다 가세요.']],
    seven: [['일주일을 함께했어요! 🎉', '오쭈다에 따뜻한 발자국을 남겨 주셨네요. 앞으로도 반갑게 맞이할게요.']],
    thirty: [['한 달 동안 함께했네요! 🎊', '오쭈다에 쌓인 하루하루가 소중해요. 늘 편하게 들러 주세요.']],
    month: [['우리 벌써 한 달째 만나요! 🌼', '자주 오든 가끔 오든, 오쭈다는 언제나 반갑게 맞이할게요.']],
    week: [['오쭈다와 일주일째예요! 💕', '어느새 익숙한 놀이터가 되어 가나요? 오늘도 즐겁게 지내요.']],
    away: [
      ['오랜만이에요! 잘 지내셨어요? 🌿', '오지 못했던 날은 신경 쓰지 마세요. 오늘 다시 만난 것만으로도 기뻐요.'],
      ['다시 만나니 더 반가워요 💛', '바쁜 날들 잘 보내셨나요? 잠시 쉬어 갈 자리는 늘 여기 있어요.']
    ],
    farAway: [['정말 오랜만이에요. 그동안 괜찮으셨나요? 🫶', '돌아오는 데 늦은 때란 없어요. 오늘은 가볍게 쉬어 가세요.']],
    birthday: [
      ['생일 정말 축하해요! 🎂', '오늘만큼은 좋은 일이 하나 더 생기길 바라요. 오쭈다가 마음 가득 축하할게요!'],
      ['오늘의 주인공은 바로 당신! 🎁', '생일 축하해요. 웃는 일이 많은 따뜻한 하루가 되길 바라요.']
    ],
    new_record: [['새로운 최고 기록, 축하해요! 🏆', '한 걸음 더 성장했네요. 스스로 세운 기록을 넘어선 순간을 마음껏 기뻐해 주세요.']],
    rank_overtaken: [
      ['순위가 바뀌었어요. 괜찮아요 🌱', '누군가 앞서갔지만 이전의 멋진 기록은 사라지지 않아요. 쉬었다가 다시 도전해 봐요.'],
      ['다시 도전할 기회가 생겼네요! 💪', '순위는 오르내릴 수 있어요. 즐겁게 놀았던 시간과 실력은 그대로예요.']
    ],
    frequent: [['어제도 여러 번 들러주셨네요! 💖', '이곳에서 즐거운 시간을 보냈길 바라요. 오늘도 반갑게 맞이할게요.']],
    morning: [
      ['좋은 아침이에요! ☀️', '새로운 하루가 시작됐어요. 작은 즐거움 하나 발견하는 하루가 되길 바라요.'],
      ['잘 주무셨어요? 🌤️', '서두르지 않아도 괜찮아요. 오늘도 내 속도로 천천히 시작해 봐요.'],
      ['아침부터 반가운 얼굴이네요! 🌷', '오쭈다에서 상쾌한 한 판으로 하루를 열어 볼까요?']
    ],
    lunch: [
      ['점심은 드셨어요? 🍚', '바쁜 하루 중에도 밥은 잘 챙겨 드세요. 잠깐 쉬어 가도 좋아요.'],
      ['나른한 오후, 잘 지내세요? 🍵', '조금 쉬어도 괜찮아요. 가볍게 게임 한 판 어떠세요?']
    ],
    evening: [
      ['오늘 하루도 수고 많으셨어요 🌆', '잘한 일도, 아쉬운 일도 잠시 내려놓고 편안히 놀다 가세요.'],
      ['저녁 인사하러 왔어요 🌙', '오늘 하루는 어땠나요? 이야기하고 싶다면 공원에 한마디 남겨 보세요.']
    ],
    dawn: [
      ['아직 안 주무셨군요 🌙', '마음이 복잡한 밤이라면 잠깐 쉬어 가세요. 휴식도 꼭 챙기시고요.'],
      ['고요한 새벽에 만났네요 ✨', '잠이 오지 않는 밤인가요? 편히 쉬어 갈 수 있길 바라요.']
    ],
    weekend: [
      ['주말에도 만나서 반가워요! 🌻', '오늘은 조금 느긋하게, 좋아하는 것부터 즐겨 보세요.'],
      ['편안한 주말 보내고 계세요? ☕', '계획이 없어도 좋은 날이에요. 마음 가는 대로 쉬어 가세요.']
    ],
    monday: [['새로운 한 주가 시작됐네요! 🌼', '월요일부터 완벽할 필요는 없어요. 오늘 할 수 있는 만큼만 해봐요.']],
    friday: [['금요일까지 정말 수고했어요! 🎈', '이번 주의 나에게 작은 박수를 보내 주세요. 즐거운 한 판도 좋아요.']],
    comfort: [
      ['오늘 마음은 좀 어떠세요? 🫶', '괜찮은 날도, 조금 버거운 날도 있지요. 여기서는 편하게 쉬어 가세요.'],
      ['잠깐 숨 고르고 갈까요? 🌿', '오늘 꼭 무언가를 해내지 않아도 괜찮아요. 쉬는 시간도 소중하니까요.'],
      ['와주셔서 고마워요 💛', '말없이 둘러보거나 게임만 하고 가도 좋아요. 있는 그대로 환영해요.']
    ],
    holiday: [['오늘은 특별한 날이에요! 🎀', '소중한 사람에게 안부 한마디 전하는 따뜻한 하루가 되길 바라요.']]
  };
  const holidayText = {
    seollal: ['새해 복 많이 받으세요! 🧧', '설날의 따뜻한 마음이 오쭈다에도 가득하길 바라요.'],
    chuseok: ['풍성한 한가위 보내세요! 🌕', '멀리 있어도 가까이 있어도, 마음만은 넉넉한 명절 되세요.'],
    newyear: ['새해 첫 인사를 전해요! 🎊', '새로운 시작을 함께해요. 올해도 내 속도로 즐겁게 걸어가요.'],
    christmas: ['따뜻한 크리스마스 보내세요! 🎄', '오늘 하루에 작은 기쁨과 포근한 순간이 가득하길 바라요.'],
    pepero: ['달콤한 안부를 전해요! 🍫', '빼빼로보다 오래 남을 다정한 마음을 나눠 볼까요?'],
    children: ['오늘은 마음껏 웃는 날! 🎈', '어른도 아이도 즐거운 어린이날 되세요.'],
    liberation: ['뜻깊은 광복절이에요 🇰🇷', '자유의 소중함을 기억하며 평온한 하루 보내세요.'],
    hangeul: ['한글날에 다정한 인사 하나 💬', '우리말로 전하는 따뜻한 한마디가 힘이 되길 바라요.']
  };
  function greetingFor(type, context) {
    const variants = greetings[type] || greetings.comfort;
    const copy = choose(variants, context.today + ':' + context.seed + ':' + type);
    const name = String(context.nickname || '').trim().slice(0, 12);
    const title = name && !['new_record', 'rank_overtaken'].includes(type) ? name + '님, ' + copy[0] : copy[0];
    return { type, title, body: copy[1], game: context.game || '', eventId: context.eventId || null };
  }
  function selectGreeting(state, visitInfo, context) {
    const today = context.today, seed = context.seed || 'guest';
    const common = { today, seed, nickname: context.nickname };
    if (context.birthMonthDay === today.slice(5)) return greetingFor('birthday', common);
    const pending = state.pending.filter(event => !state.consumed.includes(event.id) &&
      dayNumber(today) - dayNumber(event.day) >= 0 && dayNumber(today) - dayNumber(event.day) <= 14);
    pending.sort((a, b) => Number(b.type === 'rank_overtaken') - Number(a.type === 'rank_overtaken'));
    if (pending.length) return greetingFor(pending[0].type, { ...common, game: pending[0].game, eventId: pending[0].id });
    const milestone = [
      [30, 'thirty'], [7, 'seven'], [5, 'five']
    ].find(([count, type]) => visitInfo.streak >= count && !state.celebrated.includes(type));
    if (milestone) return greetingFor(milestone[1], common);
    if (visitInfo.gap >= 30) return greetingFor('farAway', common);
    if (visitInfo.gap >= 14) return greetingFor('away', common);
    if (visitInfo.first) return greetingFor('first', common);
    if (visitInfo.daysTogether >= 30 && visitInfo.daysTogether <= 35 && !state.celebrated.includes('month')) return greetingFor('month', common);
    if (visitInfo.daysTogether >= 7 && visitInfo.daysTogether <= 10 && !state.celebrated.includes('week')) return greetingFor('week', common);
    const holiday = (context.events || []).find(key => holidayText[key]);
    if (holiday) return { ...greetingFor('holiday', common), title: holidayText[holiday][0], body: holidayText[holiday][1] };
    if ((context.events || []).length) {
      const name = context.holidayName || '특별한 날';
      return { ...greetingFor('holiday', common), title: name + '이에요! 🌼' };
    }
    if (visitInfo.yesterdayVisits >= 3 && visitInfo.gap === 1) return greetingFor('frequent', common);
    if (visitInfo.daysTotal === 2) return greetingFor('return', common);
    const hour = context.hour;
    const time = hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 16 ? 'lunch' : hour >= 16 && hour < 23 ? 'evening' : 'dawn';
    const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
    const choices = [time, time, 'comfort', 'comfort'];
    if (weekday === 0 || weekday === 6) choices.push('weekend', 'weekend');
    if (weekday === 1) choices.push('monday');
    if (weekday === 5) choices.push('friday');
    return greetingFor(choose(choices, today + ':' + seed), common);
  }

  function storageRead(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageWrite(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function readLocal(owner) {
    try { return JSON.parse(storageRead(PREFIX + owner) || 'null'); } catch { return null; }
  }
  function isCurrent(session) {
    return active === session && session.isCurrent();
  }
  function persist(session) {
    if (!isCurrent(session)) return;
    session.state.updatedAt = Date.now();
    storageWrite(PREFIX + session.owner, JSON.stringify(session.state));
    if (session.settings) {
      session.settings.agitWelcome = session.state;
      session.save?.();
    }
  }
  function blocked() {
    if (!document.querySelector('#app .shell') || document.hidden) return true;
    if (document.body.classList.contains('gaming') || document.body.classList.contains('matgo-open')) return true;
    if (document.querySelector('dialog[open], [role="dialog"], #modal-root > :not(:empty), .ov.on, .auth-loading')) return true;
    return false;
  }
  function close() {
    if (openDialog?.open) openDialog.close();
    else openDialog?.remove();
    openDialog = null;
  }
  function draw(greeting, session) {
    if (openDialog || typeof document.createElement('dialog').showModal !== 'function') return false;
    const dialog = document.createElement('dialog');
    dialog.className = 'agit-welcome-dialog';
    dialog.setAttribute('aria-labelledby', 'agit-welcome-title');
    dialog.setAttribute('aria-describedby', 'agit-welcome-copy');
    dialog.innerHTML = '<div class="agit-welcome-card">' +
      '<button type="button" class="agit-welcome-close" aria-label="인사 닫기">×</button>' +
      '<div class="agit-welcome-orbit" aria-hidden="true"><span>✦</span><span>✿</span><span>✧</span></div>' +
      '<div class="agit-welcome-heart" aria-hidden="true">💗</div>' +
      '<span class="agit-welcome-eyebrow">OJJUDA AGIT · 오늘의 인사</span>' +
      '<h2 id="agit-welcome-title"></h2><p id="agit-welcome-copy"></p>' +
      '<div class="agit-welcome-actions"><button type="button" class="agit-welcome-okay">오늘도 즐겁게 시작하기</button>' +
      '<button type="button" class="agit-welcome-next"></button></div>' +
      '<small class="agit-welcome-note">반가운 인사는 하루에 한 번만 전해요.</small>' +
      '</div>';
    dialog.querySelector('#agit-welcome-title').textContent = greeting.title;
    dialog.querySelector('#agit-welcome-copy').textContent = greeting.body;
    const next = dialog.querySelector('.agit-welcome-next');
    const destination = greeting.type === 'rank_overtaken' || greeting.type === 'new_record' ? 'arcade' : 'park';
    next.textContent = destination === 'arcade' ? '오락실 가기 ↗' : '공원 산책하기 ↗';
    dialog.querySelector('.agit-welcome-close').addEventListener('click', close);
    dialog.querySelector('.agit-welcome-okay').addEventListener('click', close);
    next.addEventListener('click', () => { close(); if (isCurrent(session)) session.navigate?.(destination); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (openDialog === dialog) openDialog = null; });
    document.body.append(dialog);
    try { dialog.showModal(); } catch { dialog.remove(); return false; }
    openDialog = dialog;
    dialog.querySelector('.agit-welcome-okay').focus({ preventScroll: true });
    return true;
  }
  function claimAndShow(session, greeting, today) {
    const work = () => {
      if (!isCurrent(session) || today !== koreaDay() || blocked()) return false;
      const latest = cleanState(readLocal(session.owner));
      if (latest.shownDay === today || session.state.shownDay === today || storageRead(GLOBAL_DAY) === today) return false;
      if (!draw(greeting, session)) return false;
      session.state.shownDay = today;
      session.state.shownType = greeting.type;
      if (['five', 'seven', 'thirty'].includes(greeting.type)) {
        const earned = greeting.type === 'thirty' ? ['five', 'seven', 'thirty'] : greeting.type === 'seven' ? ['five', 'seven'] : ['five'];
        session.state.celebrated = [...new Set([...session.state.celebrated, ...earned])];
      } else if (['week', 'month'].includes(greeting.type)) session.state.celebrated.push(greeting.type);
      if (greeting.eventId) {
        session.state.consumed.push(greeting.eventId);
        session.state.consumed = session.state.consumed.slice(-30);
        session.state.pending = session.state.pending.filter(event => event.id !== greeting.eventId);
      }
      storageWrite(GLOBAL_DAY, today);
      persist(session);
      return true;
    };
    if (navigator.locks?.request) return navigator.locks.request(PREFIX + 'day:' + today, work);
    return Promise.resolve(work());
  }
  async function greet(session, info, today) {
    let birthMonthDay = null;
    const client = session.client;
    if (client && session.member) {
      try {
        const result = await client.rpc('get_my_member_identity');
        const birth = result.error ? '' : String(result.data?.birth_date || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(birth)) birthMonthDay = birth.slice(5);
      } catch {} // Birthdays are optional; no identity is stored in the browser.
      if (!isCurrent(session)) return;
      const month = monthForRanking();
      const ids = session.state.championMonth === month ? Object.keys(session.state.champions) : [];
      if (ids.length) {
        try {
          const result = await client.rpc('community_game_monthly_leaders', { p_games: ids });
          if (isCurrent(session) && !result.error && observeLeaders(session.state, result.data, month, today)) persist(session);
        } catch {}
      }
    }
    if (!isCurrent(session)) return;
    const events = root.OjjudaThemes?.eventsOn?.(new Date()) || [];
    const greeting = selectGreeting(session.state, info, {
      today, seed: session.owner, nickname: session.nickname, birthMonthDay,
      events, holidayName: root.OjjudaThemes?.catalog?.[events[0]]?.name,
      hour: koreaHour()
    });
    // Other account dialogs and launched games take precedence over the hello.
    for (let attempts = 0; attempts < 180 && isCurrent(session); attempts++) {
      if (!document.hidden && !blocked()) {
        await new Promise(resolve => setTimeout(resolve, 450));
        if (!blocked() && isCurrent(session)) {
          await claimAndShow(session, greeting, today);
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  function enter(options = {}) {
    const owner = options.member && options.owner ? String(options.owner) : 'guest';
    if (active && active.owner === owner) return;
    close();
    const session = {
      owner, member: owner !== 'guest', client: options.client,
      settings: options.member ? options.settings : null,
      save: options.save, navigate: options.navigate, isCurrent: options.isCurrent || (() => true),
      nickname: options.nickname || ''
    };
    active = session;
    const local = readLocal(owner);
    session.state = mergeStates(session.settings?.agitWelcome, local);
    const today = koreaDay();
    const info = visit(session.state, today, { stamps: options.stamps, createdDay: options.createdDay });
    persist(session);
    if (session.state.shownDay === today || storageRead(GLOBAL_DAY) === today) return;
    void greet(session, info, today);
  }
  function revoke() {
    close();
    active = null;
  }
  async function onGameRecord(event) {
    const session = active, detail = event.detail || {};
    const game = detail.game, client = session?.client;
    if (!session?.member || !client || !VALID_GAME.test(game || '') ||
      detail.owner !== session.owner || !isCurrent(session)) return;
    const month = monthForRanking(), today = koreaDay();
    try {
      const [personal, leaders] = await Promise.all([
        client.rpc('community_game_monthly_ranking', { p_game: game }),
        client.rpc('community_game_monthly_leaders', { p_games: [game] })
      ]);
      if (!isCurrent(session)) return;
      let changed = false;
      if (!personal.error) changed = observePersonalRecord(session.state, game, personal.data, month, today) || changed;
      if (!leaders.error) changed = observeLeaders(session.state, leaders.data, month, today) || changed;
      if (changed || !personal.error) persist(session);
    } catch {}
  }
  function onLeadersLoaded(event) {
    const session = active, detail = event.detail || {};
    if (!session?.member || detail.owner !== session.owner || !isCurrent(session)) return;
    const month = detail.month;
    if (!/^\d{4}-\d{2}$/.test(month || '')) return;
    if (observeLeaders(session.state, detail.leaders, month, koreaDay())) persist(session);
  }
  root.addEventListener?.('ojjuda:game-record-saved', event => { void onGameRecord(event); });
  root.addEventListener?.('ojjuda:leaders-loaded', onLeadersLoaded);
  root.OjjudaAgitWelcome = { enter, revoke, close, isOpen: () => !!openDialog, koreaDay, koreaHour,
    cleanState, mergeStates, visit, chooseGreeting: selectGreeting, observeLeaders, observePersonalRecord,
    addPending, monthForRanking };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OjjudaAgitWelcome;
})(typeof window !== 'undefined' ? window : globalThis);

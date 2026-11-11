/* Administrator-only aggregate statistics. No individual browsing history is exposed. */
(() => {
  'use strict';
  const el = (tag, text, cls = '') => {
    const node = document.createElement(tag); node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const number = value => Number(value).toLocaleString('ko-KR');
  const validCount = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const sourceLabels = Object.freeze({ direct:'직접 방문',naver:'네이버 검색',google:'구글 검색',
    search:'기타 검색',social:'SNS·메신저',external:'외부 사이트',internal:'사이트 내부',campaign:'캠페인' });
  const featureLabels = Object.freeze({
    agit:'아지트',arcade:'오락실',park:'공원',settings:'설정',portal:'첫 화면',
    group:'그룹',fanpages:'팬페이지',restaurants:'인증맛집',festival:'축제일정',
    game_chacha_rush:'차차 러시',game_solitaire:'솔리테어',game_archery:'바람의 궁수',
    game_sacheonseong:'사천성',game_mines:'지뢰찾기',game_saetbyeol:'새별',
    game_mole:'두더지 잡기',game_runner:'달리기',game_stacker:'탑 쌓기',
    game_breakout:'벽돌깨기',game_spot:'틀린그림찾기',game_screw:'나사 풀기',
    game_bang:'뱅',game_tank:'탱크게임',game_tour:'오쭈다 투어',
    game_ttang:'땅따먹기',game_janggi:'장기',game_chess:'체스',
    game_billiards:'당구',game_matgo:'맞고',game_poker:'포커',
    game_roulette:'룰렛',game_photo_ttang:'포토땅따먹기',game_other:'기타 게임'
  });
  const chart = (title, subtitle, rows, kind, labels) => {
    const card = el('section', undefined, 'visitor-chart-card');
    card.append(el('h4', title), el('p', subtitle, 'visitor-chart-subtitle'));
    const scroll = el('div', undefined, 'visitor-chart-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', `${title} 그래프 · 좌우로 이동 가능`);
    const content = el('div', undefined, `visitor-chart-bars is-${kind}`);
    const max = Math.max(1, ...rows.map(row => Number(row.visits)));
    content.setAttribute('role','img');
    content.setAttribute('aria-label', `${title}: ${rows.map((row,i) => `${labels[i]} ${number(row.visits)}회`).join(', ')}`);
    rows.forEach((row,i) => {
      const col = el('div', undefined, 'visitor-chart-col');
      const count = el('span', Number(row.visits) ? number(row.visits) : '', 'visitor-chart-value');
      const track = el('div', undefined, 'visitor-chart-track');
      const bar = el('div', undefined, 'visitor-chart-fill');
      bar.style.height = `${100 * Number(row.visits) / max}%`;
      track.title = `${labels[i]} · ${number(row.visits)}회`;
      track.append(bar);
      const name = el('span', kind === 'weekday' || kind === 'date' && i % 3 === 0 || kind === 'hour' && i % 3 === 0 ? labels[i] : '', 'visitor-chart-label');
      col.append(count,track,name); content.append(col);
    });
    if (rows.every(row => Number(row.visits) === 0)) {
      card.append(el('p', '아직 집계된 기록이 없어요.', 'visitor-chart-empty'));
    }
    scroll.append(content); card.append(scroll); return card;
  };
  const horizontalChart = (title, subtitle, rows, key, labelMap) => {
    const card = el('section', undefined, 'visitor-chart-card');
    card.append(el('h4', title), el('p', subtitle, 'visitor-chart-subtitle'));
    if (!rows.length || rows.every(row => Number(row[key]) === 0)) {
      card.append(el('p', '아직 집계된 기록이 없어요.', 'visitor-empty')); return card;
    }
    const list = el('div', undefined, 'visitor-rank-list');
    const max = Math.max(1,...rows.map(row => Number(row[key])));
    rows.forEach(row => {
      const item = el('div', undefined, 'visitor-rank-row');
      const top = el('div',undefined,'visitor-rank-top');
      top.append(el('span',labelMap[row.feature || row.source] || '기타'),el('strong',`${number(row[key])}회`));
      const track = el('div',undefined,'visitor-rank-track');
      const fill = el('div',undefined,'visitor-rank-fill');
      fill.style.width = `${100 * Number(row[key]) / max}%`;
      track.append(fill); item.append(top,track); list.append(item);
    });
    card.append(list); return card;
  };
  function renderInsights(host, data) {
    if (!data || !Number.isFinite(Date.parse(data.started_at)) || !/^\d{4}-\d{2}-\d{2}$/.test(data.today_date)
      || !['today','month','total'].every(key => validCount(data[key]))
      || !Array.isArray(data.daily) || data.daily.length !== 30
      || !Array.isArray(data.hourly) || data.hourly.length !== 24
      || !Array.isArray(data.weekday) || data.weekday.length !== 7
      || !Array.isArray(data.features) || data.features.length > 12
      || !Array.isArray(data.sources) || data.sources.length !== 8
      || !data.daily.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.period) && validCount(row.visits))
      || !data.hourly.every((row,i) => Number(row.hour) === i && validCount(row.visits))
      || !data.weekday.every((row,i) => Number(row.day) === i + 1 && validCount(row.visits))
      || !data.features.every(row => Object.hasOwn(featureLabels,row.feature) && validCount(row.uses))
      || !data.sources.every(row => Object.hasOwn(sourceLabels,row.source) && validCount(row.visits))) {
      throw new Error('invalid_site_usage_statistics');
    }
    host.replaceChildren(el('h3','사이트 방문·이용 분석'));
    const intro = el('p','방문은 브라우저 기준 하루 1회만 집계합니다. 시간은 한국 시간이며 개인정보·개별 방문 기록은 표시하지 않습니다.','visitor-note');
    host.append(intro);
    const summary = el('div',undefined,'visitor-cards visitor-site-cards');
    for (const [label,key] of [['오늘','today'],['이번 달','month'],['집계 이후','total']]) {
      const card = el('div',undefined,'visitor-card');
      card.append(el('span',label),el('strong',`${number(data[key])}회`),el('small','일별 브라우저 방문 합계'));
      summary.append(card);
    }
    host.append(summary);
    const start = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(new Date(data.started_at));
    host.append(el('p',`${start}부터 수집 · 실제 사람 수나 페이지 조회수와 다를 수 있어요.`, 'visitor-note'));
    const grid = el('div',undefined,'visitor-chart-grid');
    grid.append(
      chart('날짜별 방문','최근 30일 · 아래 그래프는 옆으로 넘길 수 있어요.',data.daily,'date',data.daily.map(row => row.period.slice(5).replace('-','.'))),
      chart('시간별 방문','오늘 · 0시부터 23시까지',data.hourly,'hour',data.hourly.map(row => `${row.hour}시`)),
      chart('요일별 방문','최근 30일 합계',data.weekday,'weekday',['월','화','수','목','금','토','일']),
      horizontalChart('많이 선택한 기능','최근 30일 · 브라우저당 기능별 하루 1회',data.features,'uses',featureLabels),
      horizontalChart('유입 경로','최근 30일 · 방문 시 분류된 경로',data.sources,'visits',sourceLabels)
    );
    host.append(grid);
  }
  function mount({ container, client, getAdminId, isCurrent = () => container.isConnected, compact = false }) {
    const owner = getAdminId?.();
    let disposed = false, request = 0, subscription;
    const current = () => !disposed && isCurrent() && !!owner && getAdminId?.() === owner;
    const section = el('section', undefined, 'visitor-stats');
    section.setAttribute('aria-label', '비회원 방문 통계');
    const header = el('div', undefined, 'visitor-heading');
    const heading = el('h3', '방문·이용 통계');
    heading.title = '시간·요일·날짜별 방문과 기능 이용을 한국 시간 기준으로 확인합니다.';
    const refreshButton = el('button', '새로고침', 'btn sm'); refreshButton.type = 'button';
    header.append(heading, refreshButton);
    const status = el('p', '', 'visitor-status'); status.setAttribute('role', 'status'); status.hidden = true;
    const body = el('div', undefined, 'visitor-body');
    const legacy = el('details', undefined, 'visitor-history visitor-legacy');
    legacy.append(el('summary', '비회원 방문 기록 · 기존 집계'),
      el('p', '로그인하지 않은 방문만 따로 집계했던 기록입니다. 새 사이트 전체 방문 통계와 집계 기준이 달라요.', 'visitor-note'),
      body);
    const insights = el('section', undefined, 'visitor-insights');
    insights.setAttribute('aria-label','사이트 방문·이용 분석');
    const growth = el('section', undefined, 'visitor-growth');
    growth.setAttribute('aria-label', '게임 도전·공유 상세');
    section.append(header, status, insights, compact ? body : legacy, growth); container.replaceChildren(section);
    refreshButton.addEventListener('click', () => void refresh());
    function clear(message) {
      request++; body.replaceChildren(); insights.replaceChildren(); growth.replaceChildren(); refreshButton.disabled = true;
      section.setAttribute('aria-busy', 'false'); status.textContent = message; status.hidden = false;
    }
    function table(title, rows, monthly) {
      const details = el('details', undefined, 'visitor-history');
      details.open = !monthly;
      const summary = el('summary', title);
      const wrap = el('div', undefined, 'visitor-table-wrap');
      const table = el('table'); table.append(el('caption', title));
      const head = el('thead'), hr = el('tr');
      for (const text of [monthly ? '월' : '날짜', monthly ? '방문 합계' : '비회원 방문']) {
        const th = el('th', text); th.scope = 'col'; hr.append(th);
      }
      head.append(hr); const tbody = el('tbody');
      for (const row of rows) {
        const tr = el('tr'), date = el('th', row.period.replaceAll('-', '. ')); date.scope = 'row';
        tr.append(date, el('td', `${number(row.visits)}회`)); tbody.append(tr);
      }
      table.append(head, tbody); wrap.append(table); details.append(summary, wrap); return details;
    }
    function render(data) {
      const cards = el('div', undefined, 'visitor-cards');
      for (const [label, value, explanation] of [
        ['오늘', data.today, '오늘 방문'],
        ['이번 달', data.month, '일별 합계'],
        ['누적', data.total, '집계 이후']
      ]) {
        const card = el('div', undefined, 'visitor-card');
        card.title = label === '오늘' ? '다른 브라우저·주소, 데이터 삭제, 추적 방지 설정에 따라 차이가 날 수 있어요.'
          : '일별 방문 수 합계이며 서로 다른 사람의 총인원은 아니에요.';
        card.append(el('span', label), el('strong', `${number(value)}회`), el('small', explanation)); cards.append(card);
      }
      const since = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(data.started_at));
      body.append(cards, el('p', `${since}부터 집계`, 'visitor-note'));
      if (compact) {
        const link = el('button', '날짜별·월별 통계 보기 →', 'btn'); link.type = 'button';
        link.dataset.act = 'adm-tab'; link.dataset.v = 'visitors'; body.append(link);
      } else {
        body.append(table('최근 30일', data.daily, false), table('최근 12개월', data.monthly, true));
      }
    }
    function renderGrowth(data) {
      const games = { stacker: '탑 쌓기', mole: '두더지 잡기' };
      const sources = { challenge: '도전 링크', direct: '일반' };
      const validRows = rows => Array.isArray(rows) && rows.length === 4
        && new Set(rows.map(row => row.game + ':' + row.source)).size === 4
        && rows.every(row => Object.hasOwn(games, row.game) && Object.hasOwn(sources, row.source)
          && ['visits', 'starts', 'completes', 'shares'].every(key => validCount(row[key])));
      if (!data || !Number.isFinite(Date.parse(data.started_at)) || !/^\d{4}-\d{2}-\d{2}$/.test(data.today_date)
        || !validRows(data.today) || !validRows(data.month)) throw new Error('invalid_growth_statistics');
      const heading = el('h3', '게임 도전·공유 상세');
      heading.title = '두더지 잡기와 탑 쌓기만 집계합니다. 하루·브라우저·게임·경로별 중복 제외.';
      growth.replaceChildren(heading);
      growth.append(el('p','두더지 잡기·탑 쌓기의 링크 공유 효과만 따로 확인할 수 있어요.', 'visitor-note'));
      for (const [title, rows] of [['오늘', data.today], ['이번 달', data.month]]) {
        const details = el('details', undefined, 'visitor-history visitor-growth-period');
        const wrap = el('div', undefined, 'visitor-table-wrap');
        const table = el('table'); table.append(el('caption', `게임 도전·공유 ${title}`));
        const head = el('thead'), hr = el('tr');
        for (const text of ['게임', '경로', '방문', '시작', '완료', '공유']) {
          const th = el('th', text); th.scope = 'col';
          if (text === '공유') th.title = '공유·링크 복사 사용. 전달받은 사람 수와 달라요.';
          hr.append(th);
        }
        head.append(hr); const tbody = el('tbody');
        for (const row of rows) {
          const tr = el('tr'), game = el('th', games[row.game]); game.scope = 'row';
          tr.append(game, el('td', sources[row.source]));
          for (const key of ['visits', 'starts', 'completes', 'shares']) tr.append(el('td', number(row[key])));
          tbody.append(tr);
        }
        table.append(head, tbody); wrap.append(table); details.append(el('summary', title), wrap); growth.append(details);
      }
    }
    async function refresh() {
      if (!current()) { if (!disposed && isCurrent()) clear('관리자로 로그인해 주세요.'); return; }
      const version = ++request; refreshButton.disabled = true;
      section.setAttribute('aria-busy', 'true'); status.textContent = '불러오는 중'; status.hidden = false; body.replaceChildren(); growth.replaceChildren();
      const growthRequest = compact ? null : Promise.resolve().then(() => client.rpc('admin_game_growth_stats')).catch(error => ({ error }));
      const insightsRequest = compact ? null : Promise.resolve().then(() => client.rpc('admin_site_usage_stats')).catch(error => ({ error }));
      if (insightsRequest) insights.replaceChildren(el('p','방문 그래프를 불러오는 중이에요…','visitor-status'));
      try {
        const { data, error } = await client.rpc('admin_guest_visit_stats');
        if (version !== request || !current()) return;
        if (error) throw error;
        if (!data || !['today', 'month', 'total'].every(k => validCount(data[k])) || !Number.isFinite(Date.parse(data.started_at))
          || !Array.isArray(data.daily) || !Array.isArray(data.monthly)
          || ![...data.daily, ...data.monthly].every(r => /^\d{4}-\d{2}(-\d{2})?$/.test(r.period) && validCount(r.visits))) throw new Error('invalid_statistics');
        render(data); status.textContent = ''; status.hidden = true;
      } catch (error) {
        if (version !== request || !current()) return;
        status.textContent = /admin_required|permission denied|not_admin/.test(String(error?.message || ''))
          ? '관리자 권한이 필요해요.' : '통계를 불러오지 못했어요.';
      } finally {
        if (version === request && current()) { refreshButton.disabled = false; section.setAttribute('aria-busy', 'false'); }
      }
      if (insightsRequest || growthRequest) {
        const [insightsResult,growthResult] = await Promise.all([insightsRequest,growthRequest]);
        if (version !== request || !current()) return;
        try {
          if (insightsResult.error) throw insightsResult.error;
          renderInsights(insights,insightsResult.data);
        } catch {
          insights.replaceChildren(el('h3','사이트 방문·이용 분석'),
            el('p','통계 그래프를 불러오지 못했어요. 잠시 후 새로고침해 주세요.','visitor-status'));
        }
        try {
          if (growthResult.error) throw growthResult.error;
          renderGrowth(growthResult.data);
        } catch {
          growth.replaceChildren(el('h3','게임 도전·공유 상세'),el('p','불러오지 못했어요.', 'visitor-status'));
        }
      }
    }
    subscription = client.auth?.onAuthStateChange?.((_event, session) => {
      if (!disposed && container.isConnected && (session?.user?.id !== owner || !current())) clear('관리자로 다시 로그인해 주세요.');
    })?.data?.subscription;
    void refresh();
    return { refresh, destroy() { disposed = true; request++; subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaAdminVisitors = Object.freeze({ mount });
})();

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
  function mount({ container, client, getAdminId, isCurrent = () => container.isConnected, compact = false }) {
    const owner = getAdminId?.();
    let disposed = false, request = 0, subscription;
    const current = () => !disposed && isCurrent() && !!owner && getAdminId?.() === owner;
    const section = el('section', undefined, 'visitor-stats');
    section.setAttribute('aria-label', '비회원 방문 통계');
    const header = el('div', undefined, 'visitor-heading');
    const heading = el('h3', '비회원 방문 통계');
    heading.title = '로그인하지 않은 브라우저·주소별 하루 1회 · 한국 시간';
    const refreshButton = el('button', '새로고침', 'btn sm'); refreshButton.type = 'button';
    header.append(heading, refreshButton);
    const status = el('p', '', 'visitor-status'); status.setAttribute('role', 'status'); status.hidden = true;
    const body = el('div', undefined, 'visitor-body');
    const growth = el('section', undefined, 'visitor-growth');
    growth.setAttribute('aria-label', '도전 유입');
    section.append(header, status, body, growth); container.replaceChildren(section);
    refreshButton.addEventListener('click', () => void refresh());
    function clear(message) {
      request++; body.replaceChildren(); growth.replaceChildren(); refreshButton.disabled = true;
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
      const heading = el('h3', '도전 유입');
      heading.title = '한국 시간 · 하루·브라우저·게임·경로별 중복 제외. 이번 달은 일별 합계.';
      growth.replaceChildren(heading);
      for (const [title, rows] of [['오늘', data.today], ['이번 달', data.month]]) {
        const details = el('details', undefined, 'visitor-history visitor-growth-period'); details.open = title === '오늘';
        const wrap = el('div', undefined, 'visitor-table-wrap');
        const table = el('table'); table.append(el('caption', `도전 유입 ${title}`));
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
      if (growthRequest) {
        const { data, error } = await growthRequest;
        if (version !== request || !current()) return;
        try {
          if (error) throw error;
          renderGrowth(data);
        } catch {
          growth.replaceChildren(el('h3', '도전 유입'), el('p', '불러오지 못했어요.', 'visitor-status'));
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

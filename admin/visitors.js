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
    const refreshButton = el('button', '새로고침', 'btn sm'); refreshButton.type = 'button';
    header.append(heading, refreshButton);
    const intro = el('p', '로그인 없이 오락실·공원을 둘러본 방문을 집계해요.', 'visitor-note');
    const status = el('p', '', 'visitor-status'); status.setAttribute('role', 'status');
    const body = el('div', undefined, 'visitor-body');
    section.append(header, intro, status, body); container.replaceChildren(section);
    refreshButton.addEventListener('click', () => void refresh());
    function clear(message) {
      request++; body.replaceChildren(); refreshButton.disabled = true;
      section.setAttribute('aria-busy', 'false'); status.textContent = message;
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
        ['오늘', data.today, '오늘 방문한 브라우저'],
        ['이번 달', data.month, '일별 방문 수의 합계'],
        ['누적', data.total, '집계 시작 이후 합계']
      ]) {
        const card = el('div', undefined, 'visitor-card');
        card.append(el('span', label), el('strong', `${number(value)}회`), el('small', explanation)); cards.append(card);
      }
      const since = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(data.started_at));
      body.append(cards, el('p', `${since}부터 집계 · 한국 시간 기준`, 'visitor-note'));
      const explanation = el('p', '같은 브라우저·접속 주소에서는 하루 1회만 세며 새로고침으로 늘어나지 않아요. 월별·누적은 일별 수의 합계로, 서로 다른 사람의 총인원은 아니에요. 로그인한 회원의 방문은 포함하지 않아요.', 'visitor-note');
      body.append(explanation);
      if (compact) {
        const link = el('button', '날짜별·월별 통계 보기 →', 'btn'); link.type = 'button';
        link.dataset.act = 'adm-tab'; link.dataset.v = 'visitors'; body.append(link);
      } else {
        body.append(el('p', '다른 기기·브라우저·주소, 사이트 데이터 삭제, 추적 방지 설정에 따라 실제 인원과 차이가 날 수 있어요. 집계 시작 전 기록은 없으며 첫날과 이번 달은 집계한 기간만 표시해요.', 'visitor-note'));
        body.append(table('최근 30일', data.daily, false), table('최근 12개월', data.monthly, true));
      }
    }
    async function refresh() {
      if (!current()) { if (!disposed && isCurrent()) clear('관리자 계정으로 다시 열어 주세요.'); return; }
      const version = ++request; refreshButton.disabled = true;
      section.setAttribute('aria-busy', 'true'); status.textContent = '방문 통계를 불러오고 있어요.'; body.replaceChildren();
      try {
        const { data, error } = await client.rpc('admin_guest_visit_stats');
        if (version !== request || !current()) return;
        if (error) throw error;
        if (!data || !['today', 'month', 'total'].every(k => validCount(data[k])) || !Number.isFinite(Date.parse(data.started_at))
          || !Array.isArray(data.daily) || !Array.isArray(data.monthly)
          || ![...data.daily, ...data.monthly].every(r => /^\d{4}-\d{2}(-\d{2})?$/.test(r.period) && validCount(r.visits))) throw new Error('invalid_statistics');
        render(data); status.textContent = data.total ? '방금 갱신했어요.' : '아직 집계된 비회원 방문이 없어요.';
      } catch (error) {
        if (version !== request || !current()) return;
        status.textContent = /admin_required|permission denied|not_admin/.test(String(error?.message || ''))
          ? '관리자 권한을 확인해 주세요.' : '방문 통계를 불러오지 못했어요. 새로고침해 주세요.';
      } finally {
        if (version === request && current()) { refreshButton.disabled = false; section.setAttribute('aria-busy', 'false'); }
      }
    }
    subscription = client.auth?.onAuthStateChange?.((_event, session) => {
      if (!disposed && container.isConnected && (session?.user?.id !== owner || !current())) clear('로그인 상태가 바뀌었어요. 관리자 계정으로 다시 열어 주세요.');
    })?.data?.subscription;
    void refresh();
    return { refresh, destroy() { disposed = true; request++; subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaAdminVisitors = Object.freeze({ mount });
})();

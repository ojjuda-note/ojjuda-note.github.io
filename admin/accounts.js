/* Administrator account directory. The server owns filtering, paging and permission checks. */
(() => {
  'use strict';
  const PAGE_SIZE = 20;
  const activityKinds = { room: '프로필·방', diary: '다이어리', guestbook: '방명록', intro: '소개글', media: '사진·영상', comment: '앨범 댓글', chat: '동네 대화', game: '게임', house_post: '우리집 글' };
  const filters = [['all', '전체'], ['today', '오늘 가입'], ['banned', '정지 중'], ['admin', '관리자']];
  const el = (tag, text, className = '') => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    node.className = className;
    return node;
  };
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
    : '기록 없음';
  const button = (text, className = 'btn') => {
    const node = el('button', text, className); node.type = 'button'; return node;
  };

  function mount({ container, client, getAdminId, isCurrent = () => container.isConnected, view = 'members', initialFilter = 'all', initialState, renderActions }) {
    const withdrawn = view === 'withdrawn', owner = getAdminId?.();
    let destroyed = false, run = 0, query = String(initialState?.query || '').trim().slice(0, 100), total = 0, busy = false;
    let offset = Number.isSafeInteger(initialState?.offset) && initialState.offset >= 0 ? Math.floor(initialState.offset / PAGE_SIZE) * PAGE_SIZE : 0;
    const requestedFilter = initialState?.filter || initialFilter;
    let filter = filters.some(([id]) => id === requestedFilter) ? requestedFilter : 'all';
    let subscription;
    const current = () => !destroyed && isCurrent() && !!owner && getAdminId?.() === owner;
    const section = el('section', undefined, 'acct-directory');
    section.setAttribute('aria-label', withdrawn ? '탈퇴 기록' : '회원 관리');
    const heading = el('h3', withdrawn ? '탈퇴 기록' : '회원 관리');
    const intro = el('p', withdrawn
      ? '현재 보관기간이 남은 탈퇴 기록만 표시해요. 계정정보는 탈퇴 후 1개월이 지나면 자동 삭제돼요.'
      : '가입 현황과 계정 상태를 검색하고 관리해요. 날짜는 한국 시간을 기준으로 표시해요.', 'acct-intro');
    const filterBar = el('div', undefined, 'acct-filters');
    filterBar.setAttribute('role', 'group'); filterBar.setAttribute('aria-label', '회원 상태');
    const filterButtons = [];
    if (!withdrawn) for (const [id, label] of filters) {
      const control = button(label, 'btn sm');
      control.dataset.accountFilter = id; control.setAttribute('aria-pressed', String(id === filter));
      control.addEventListener('click', () => {
        if (busy || id === filter) return;
        filter = id; offset = 0;
        for (const item of filterButtons) item.setAttribute('aria-pressed', String(item.dataset.accountFilter === filter));
        void refresh();
      });
      filterButtons.push(control); filterBar.append(control);
    }
    const form = el('form', undefined, 'acct-search');
    const label = el('label', withdrawn ? '탈퇴 기록 검색' : '회원 검색');
    const input = el('input'); input.className = 'inp'; input.type = 'search'; input.maxLength = 100;
    input.placeholder = '닉네임 또는 이메일'; input.autocomplete = 'off'; input.value = query;
    label.append(input);
    const search = button('찾기', 'btn pri'); search.type = 'submit';
    const reset = button('초기화', 'btn'); reset.hidden = !query;
    form.append(label, search, reset);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (busy) return;
      query = input.value.trim(); input.value = query; reset.hidden = !query; offset = 0; void refresh();
    });
    reset.addEventListener('click', () => {
      if (busy) return;
      query = ''; input.value = ''; reset.hidden = true; offset = 0; void refresh(); input.focus();
    });
    const count = el('p', '', 'acct-count');
    const status = el('p', '', 'acct-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const retry = button('다시 불러오기', 'btn sm'); retry.hidden = true;
    retry.addEventListener('click', () => void refresh());
    const list = el('div', undefined, 'acct-list');
    const pagination = el('nav', undefined, 'acct-pagination'); pagination.setAttribute('aria-label', '계정 목록 페이지');
    const previous = button('이전'), next = button('다음'), pageLabel = el('span', '', 'acct-page-label');
    previous.addEventListener('click', () => { if (!busy && offset > 0) { offset = Math.max(0, offset - PAGE_SIZE); void refresh(); } });
    next.addEventListener('click', () => { if (!busy && offset + PAGE_SIZE < total) { offset += PAGE_SIZE; void refresh(); } });
    pagination.append(previous, pageLabel, next); pagination.hidden = true;
    section.append(heading, intro); if (!withdrawn) section.append(filterBar);
    section.append(form, count, status, retry, list, pagination); container.replaceChildren(section);

    function clearSensitive(message) {
      run++; busy = false;
      container.replaceChildren(el('p', message, 'acct-status'));
    }
    function setBusy(value) {
      busy = value; section.setAttribute('aria-busy', String(value));
      for (const control of [...filterButtons, search, reset, retry]) control.disabled = value;
      input.disabled = value;
      previous.disabled = value || offset === 0;
      next.disabled = value || offset + PAGE_SIZE >= total;
    }
    function item(record) {
      const card = el('article', undefined, 'acct-card');
      const head = el('div', undefined, 'acct-member-heading');
      head.append(el('strong', record.nickname || '닉네임 없음'));
      if (!withdrawn && record.is_admin) head.append(el('span', '관리자', 'vis'));
      const banned = !withdrawn && Number.isFinite(Date.parse(record.banned_until)) && Date.parse(record.banned_until) > Date.now();
      if (banned) head.append(el('span', '정지 중', 'vis warn-tag'));
      card.append(head, el('p', withdrawn ? record.email_masked || '이메일 없음' : record.email || '이메일 없음', 'acct-contact'));
      const details = el('dl', undefined, 'acct-details');
      const detail = (name, value) => { details.append(el('dt', name), el('dd', value)); };
      detail('가입', date(withdrawn ? record.account_created_at : record.created_at));
      if (withdrawn) {
        detail('탈퇴', date(record.withdrawn_at)); detail('자동 삭제 예정', date(record.expires_at));
      } else {
        detail('마지막 방문', date(record.last_seen));
        if (record.last_active) detail('마지막 활동', `${date(record.last_active)}${activityKinds[record.last_active_kind] ? ' · ' + activityKinds[record.last_active_kind] : ''}`);
        if (banned) detail('정지 종료', date(record.banned_until));
        detail('보유 ZU', Number(record.coins || 0).toLocaleString('ko-KR') + ' ZU');
      }
      card.append(details);
      if (!withdrawn) {
        const actions = el('div', undefined, 'acct-actions');
        if (!record.is_admin) for (const [days, text] of (banned ? [[0, '정지 해제']] : [[7, '7일 정지'], [30, '30일 정지']])) {
          const action = button(text, 'btn sm');
          Object.assign(action.dataset, { act: 'adm-ban', uid: record.id, days: String(days), name: record.nickname || '' });
          actions.append(action);
        }
        // This callback is application-owned markup (World's existing ch renderer), never server HTML.
        if (renderActions) {
          const extra = el('span', undefined, 'acct-extra-actions');
          const markup = renderActions(record);
          if (typeof markup === 'string') extra.innerHTML = markup;
          else if (markup instanceof Node) extra.append(markup);
          actions.append(extra);
        }
        if (actions.childElementCount) card.append(actions);
      }
      return card;
    }

    async function refresh() {
      if (!current()) { if (!destroyed && isCurrent()) clearSensitive('관리자 계정으로 다시 열어 주세요.'); return; }
      const request = ++run;
      setBusy(true); status.textContent = '목록을 불러오고 있어요.'; retry.hidden = true;
      // Never leave account actions visible for a filter/page whose request failed.
      list.replaceChildren(); count.textContent = ''; pagination.hidden = true;
      try {
        const args = { p_query: query, p_offset: offset, p_limit: PAGE_SIZE };
        if (!withdrawn) args.p_filter = filter;
        const result = await client.rpc(withdrawn ? 'admin_list_withdrawn_accounts' : 'admin_list_member_accounts', args);
        if (request !== run || !current()) return;
        if (result.error) throw result.error;
        const data = result.data;
        if (!data || !Array.isArray(data.items) || !Number.isFinite(Number(data.total))) throw new Error('invalid_response');
        total = Math.max(0, Number(data.total));
        // A deletion or a lifted restriction may remove the final page between requests.
        if (offset > 0 && offset >= total) {
          offset = total > 0 ? Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE : 0;
          return await refresh();
        }
        count.textContent = `${query ? '검색 결과 ' : ''}총 ${total.toLocaleString('ko-KR')}${withdrawn ? '건' : '명'}`;
        if (data.items.length) for (const record of data.items) list.append(item(record));
        else list.append(el('p', withdrawn ? '조건에 맞는 보관 중 탈퇴 기록이 없어요.' : '조건에 맞는 회원이 없어요.', 'acct-empty'));
        pageLabel.textContent = `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))}페이지`;
        pagination.hidden = total <= PAGE_SIZE;
        status.textContent = '';
      } catch (error) {
        if (request !== run || !current()) return;
        const message = String(error?.message || '');
        if (/not_admin|not_signed_in|permission denied/.test(message)) { clearSensitive('관리자 권한을 확인해 주세요.'); return; }
        status.textContent = /Could not find|schema cache|does not exist/.test(message)
          ? '계정 목록 기능의 서버 준비가 필요해요. 잠시 후 다시 확인해 주세요.'
          : '목록을 불러오지 못했어요. 다시 시도해 주세요.';
        retry.hidden = false;
      } finally { if (request === run && current()) setBusy(false); }
    }
    subscription = client?.auth?.onAuthStateChange?.((_event, session) => {
      if (destroyed || !isCurrent()) return;
      if (session?.user?.id !== owner || !current()) clearSensitive('로그인 상태가 바뀌었어요. 관리자 계정으로 다시 열어 주세요.');
    })?.data?.subscription;
    void refresh();
    return { refresh, getState: () => ({ query, filter, offset }), destroy() { destroyed = true; run++; subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaAdminAccounts = Object.freeze({ mount });
})();

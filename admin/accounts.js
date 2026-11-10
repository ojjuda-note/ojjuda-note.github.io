/* Administrator account directory. The server owns filtering, paging and permission checks. */
(() => {
  'use strict';
  const PAGE_SIZE = 20;
  const HISTORY_SIZE = 15;
  const activityKinds = {
    room:'프로필 수정', diary:'다이어리 작성', guestbook:'방명록 작성', intro:'소개글 작성',
    media:'사진·영상 등록', comment:'댓글 작성', chat:'대화', house_post:'우리집 글 작성',
    game:'게임', page:'페이지 방문'
  };
  const gameTitles = {
    screw_box:'나사 풀기 (박스형)', screw_flat:'나사 풀기 (평면형)',
    saetbyeol:'새별', runner:'쭈달리기', breakout:'벽돌깨기', mole:'두더지 팡!',
    stacker:'탑 쌓기', chacha_rush:'차차 러시', ttang:'월드땅따먹기',
    mines:'지뢰찾기', spot:'틀린그림 찾기', tour:'오쭈다 투어',
    solitaire:'솔리테어', snake:'스네이크', archery:'바람의 궁수',
    matgo:'맞고', poker:'세븐포커', roulette:'룰렛', bang:'뱅!', tank:'탱크게임'
  };
  const activityTitle = (kind, raw) => !raw ? '' : kind === 'game'
    ? (/^sacheonseong_\d+$/.test(raw) ? '사천성' : gameTitles[raw] || raw)
    : raw;
  const filters = [['all', '전체'], ['today', '오늘 가입'], ['admin', '관리자']];
  const sorts = [['last_seen', '최근 방문순'], ['created_at', '가입일순'], ['visit_count', '방문횟수순']];
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
    const withdrawn = view === 'withdrawn', referrals = view === 'referrals', suspended = view === 'suspended', owner = getAdminId?.();
    let destroyed = false, run = 0, query = String(initialState?.query || '').trim().slice(0, 100), total = 0, busy = false;
    let offset = Number.isSafeInteger(initialState?.offset) && initialState.offset >= 0 ? Math.floor(initialState.offset / PAGE_SIZE) * PAGE_SIZE : 0;
    const requestedFilter = initialState?.filter || initialFilter;
    let filter = suspended ? 'banned' : filters.some(([id]) => id === requestedFilter) ? requestedFilter : 'all';
    let sort = sorts.some(([id]) => id === initialState?.sort) ? initialState.sort : 'last_seen';
    let subscription;
    const current = () => !destroyed && isCurrent() && !!owner && getAdminId?.() === owner;
    const section = el('section', undefined, 'acct-directory');
    section.setAttribute('aria-label', referrals ? '추천인 집계' : withdrawn ? '탈퇴 기록' : suspended ? '정지 계정' : '가입자 관리');
    const heading = el('h3', referrals ? '추천인 집계' : withdrawn ? '탈퇴 기록' : suspended ? '정지 계정' : '가입자 관리');
    const intro = el('p', referrals ? '이메일 인증이 끝난 가입을 추천인별로 한 번씩 누적 집계해요.' : withdrawn
      ? '현재 보관기간이 남은 탈퇴 기록만 표시해요. 계정정보는 탈퇴 후 1개월이 지나면 자동 삭제돼요.'
      : suspended ? '정지가 끝나거나 해제되면 가입자 목록으로 돌아가요.'
      : '정지 중인 계정은 제외돼요. 날짜는 한국 시간을 기준으로 표시해요.', 'acct-intro');
    const filterBar = el('div', undefined, 'acct-filters');
    filterBar.setAttribute('role', 'group'); filterBar.setAttribute('aria-label', '회원 상태');
    const filterButtons = [];
    if (!withdrawn && !referrals && !suspended) for (const [id, label] of filters) {
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
    const label = el('label', referrals ? '추천인 검색' : withdrawn ? '탈퇴 기록 검색' : suspended ? '정지 계정 검색' : '회원 검색');
    const input = el('input'); input.className = 'inp'; input.type = 'search'; input.maxLength = 100;
    input.placeholder = referrals ? '추천인 닉네임' : '닉네임 또는 이메일'; input.autocomplete = 'off'; input.value = query;
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
    const sortBar = el('div', undefined, 'acct-sort-bar');
    const sortLabel = el('label', '정렬');
    const sortSelect = el('select'); sortSelect.className = 'inp'; sortSelect.setAttribute('aria-label', '계정 정렬');
    for (const [id, text] of sorts) { const option = el('option', text); option.value = id; sortSelect.append(option); }
    sortSelect.value = sort; sortLabel.append(sortSelect);
    sortSelect.addEventListener('change', () => {
      if (busy) { sortSelect.value = sort; return; }
      sort = sorts.some(([id]) => id === sortSelect.value) ? sortSelect.value : 'last_seen';
      sortSelect.value = sort; offset = 0; void refresh();
    });
    sortBar.append(sortLabel, el('span', '방문횟수는 기록된 방문일 기준으로 하루 1회 집계해요.', 'acct-sort-note'));
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
    section.append(heading, intro); if (!withdrawn && !referrals && !suspended) section.append(filterBar);
    section.append(form); if (!withdrawn && !referrals) section.append(sortBar);
    section.append(count, status, retry, list, pagination); container.replaceChildren(section);

    function clearSensitive(message) {
      run++; busy = false;
      container.replaceChildren(el('p', message, 'acct-status'));
    }
    function setBusy(value) {
      busy = value; section.setAttribute('aria-busy', String(value));
      for (const control of [...filterButtons, search, reset, retry]) control.disabled = value;
      input.disabled = value; sortSelect.disabled = value;
      previous.disabled = value || offset === 0;
      next.disabled = value || offset + PAGE_SIZE >= total;
    }
    function item(record) {
      const card = el('article', undefined, 'acct-card');
      if (referrals) {
        card.append(el('strong', record.nickname || '닉네임 없음'));
        const details = el('dl', undefined, 'acct-details');
        details.append(el('dt', '추천 가입'), el('dd', `${Number(record.referral_count || 0).toLocaleString('ko-KR')}명`));
        details.append(el('dt', '인증 대기'), el('dd', `${Number(record.pending_count || 0).toLocaleString('ko-KR')}명`));
        details.append(el('dt', '최근 추천 가입'), el('dd', date(record.last_referred_at)));
        card.append(details); return card;
      }
      const head = el('div', undefined, 'acct-member-heading');
      head.append(el('strong', record.nickname || '닉네임 없음'));
      if (!withdrawn && record.is_admin) head.append(el('span', '관리자', 'vis'));
      const permanent = !withdrawn && record.banned_until === 'infinity';
      const banned = permanent || (!withdrawn && Number.isFinite(Date.parse(record.banned_until)) && Date.parse(record.banned_until) > Date.now());
      if (banned) head.append(el('span', permanent ? '영구정지' : '정지 중', 'vis warn-tag'));
      card.append(head, el('p', withdrawn ? record.email_masked || '이메일 없음' : record.email || '이메일 없음', 'acct-contact'));
      const details = el('dl', undefined, 'acct-details');
      const detail = (name, value) => { details.append(el('dt', name), el('dd', value, name === '보유 ZU' ? 'acct-wallet-value' : '')); };
      detail('가입', date(withdrawn ? record.account_created_at : record.created_at));
      if (withdrawn) {
        detail('탈퇴', date(record.withdrawn_at)); detail('자동 삭제 예정', date(record.expires_at));
      } else {
        detail('마지막 방문', date(record.last_seen));
        detail('방문횟수', Math.max(0, Number(record.visit_count) || 0).toLocaleString('ko-KR') + '회');
        if (record.last_active) {
          const kind = activityKinds[record.last_active_kind] || record.last_active_kind || '';
          const title = activityTitle(record.last_active_kind, record.last_active_title);
          detail('마지막 활동', [date(record.last_active), kind, title].filter(Boolean).join(' · '));
        }
        if (banned) detail(permanent ? '정지 기간' : '정지 종료', permanent ? '무기한 · 관리자 해제 가능' : date(record.banned_until));
        detail('보유 ZU', Number(record.coins || 0).toLocaleString('ko-KR') + ' ZU');
      }
      card.append(details);
      if (!withdrawn) {
        const actions = el('div', undefined, 'acct-actions');
        // This callback is application-owned markup (World's existing ch renderer), never server HTML.
        if (renderActions) {
          const extra = el('span', undefined, 'acct-extra-actions');
          const markup = renderActions(record);
          if (typeof markup === 'string') extra.innerHTML = markup;
          else if (markup instanceof Node) extra.append(markup);
          actions.append(extra);
        }
        if (!record.is_admin) for (const [days, text] of (banned
          ? (permanent ? [[0, '정지 해제']] : [[0, '정지 해제'], [-1, '영구정지']])
          : [[7, '7일 정지'], [30, '30일 정지'], [-1, '영구정지']])) {
          const action = button(text, days === -1 ? 'btn sm acct-permanent-action' : 'btn sm');
          Object.assign(action.dataset, { act: 'adm-ban', uid: record.id, days: String(days), name: record.nickname || '' });
          actions.append(action);
        }
        if (actions.childElementCount) card.append(actions);

        const historyToggle = button('방문·게임 기록 보기', 'btn sm acct-history-toggle');
        const history = el('section', undefined, 'acct-history');
        history.hidden = true;
        history.id = `acct-history-${String(record.id).replace(/[^a-zA-Z0-9-]/g, '')}`;
        historyToggle.setAttribute('aria-controls', history.id);
        historyToggle.setAttribute('aria-expanded', 'false');
        const historyIntro = el('p', '방문한 페이지와 실행한 게임을 최근 순서로 보여줘요. 기록은 이 기능이 적용된 뒤부터 쌓여요.', 'acct-history-intro');
        const historyStatus = el('p', '', 'acct-history-status');
        historyStatus.setAttribute('role', 'status');
        const historyList = el('ol', undefined, 'acct-history-list');
        const historyPager = el('div', undefined, 'acct-history-pager');
        history.append(historyIntro, historyStatus, historyList, historyPager);
        let historyOffset = 0, historyRun = 0;
        async function loadHistory() {
          if (!current() || !card.isConnected) return;
          const request = ++historyRun;
          historyStatus.textContent = '방문 기록을 불러오고 있어요.';
          historyList.replaceChildren(); historyPager.replaceChildren();
          try {
            const { data, error } = await client.rpc('admin_member_navigation_history', {
              p_user_id: record.id, p_limit: HISTORY_SIZE, p_offset: historyOffset
            });
            if (request !== historyRun || !current() || !card.isConnected || history.hidden) return;
            if (error) throw error;
            if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(Number(data.total))) throw new Error('invalid_navigation_history');
            const total = Number(data.total);
            historyStatus.textContent = total ? `방문·게임 기록 ${total.toLocaleString('ko-KR')}건` : '아직 저장된 방문·게임 기록이 없어요.';
            for (const entry of data.items) {
              const line = el('li', undefined, 'acct-history-item');
              const description = entry.kind === 'game' ? '🎮 게임' : '📄 페이지';
              line.append(el('span', description, 'acct-history-kind'),
                el('strong', activityTitle(entry.kind, entry.title) || '이름 없음'),
                el('time', date(entry.created_at), 'acct-history-time'));
              historyList.append(line);
            }
            if (total > HISTORY_SIZE) {
              const back = button('이전', 'btn sm'), forward = button('다음', 'btn sm');
              back.disabled = historyOffset === 0;
              forward.disabled = historyOffset + HISTORY_SIZE >= total;
              back.addEventListener('click', () => { historyOffset = Math.max(0, historyOffset - HISTORY_SIZE); void loadHistory(); });
              forward.addEventListener('click', () => { historyOffset += HISTORY_SIZE; void loadHistory(); });
              historyPager.append(back, el('span', `${Math.floor(historyOffset / HISTORY_SIZE) + 1} / ${Math.ceil(total / HISTORY_SIZE)}페이지`), forward);
            }
          } catch {
            if (request !== historyRun || !current() || !card.isConnected || history.hidden) return;
            historyStatus.textContent = '방문 기록을 불러오지 못했어요.';
            historyPager.replaceChildren(button('다시 불러오기', 'btn sm'));
            historyPager.firstElementChild.addEventListener('click', () => void loadHistory());
          }
        }
        historyToggle.addEventListener('click', () => {
          history.hidden = !history.hidden;
          historyToggle.setAttribute('aria-expanded', String(!history.hidden));
          historyToggle.textContent = history.hidden ? '방문·게임 기록 보기' : '방문·게임 기록 닫기';
          if (!history.hidden) { historyOffset = 0; void loadHistory(); }
          else historyRun++;
        });
        card.append(historyToggle, history);
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
        if (!withdrawn && !referrals) { args.p_filter = filter; args.p_sort = sort; }
        const result = await client.rpc(referrals ? 'admin_referral_counts' : withdrawn ? 'admin_list_withdrawn_accounts' : 'admin_list_member_accounts', args);
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
        count.textContent = referrals
          ? `${query ? '검색 결과 · ' : ''}추천 가입 ${Number(data.total_referrals || 0).toLocaleString('ko-KR')}명 · 인증 대기 ${Number(data.pending_referrals || 0).toLocaleString('ko-KR')}명`
          : `${query ? '검색 결과 ' : ''}${suspended ? '정지 계정 ' : '총 '}${total.toLocaleString('ko-KR')}${withdrawn ? '건' : '명'}`;
        if (data.items.length) for (const record of data.items) list.append(item(record));
        else list.append(el('p', referrals ? '조건에 맞는 추천인이 없어요.' : withdrawn ? '조건에 맞는 보관 중 탈퇴 기록이 없어요.' : suspended ? '정지 중인 계정이 없어요.' : '조건에 맞는 회원이 없어요.', 'acct-empty'));
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
    return { refresh, getState: () => ({ query, filter, offset, sort }), destroy() { destroyed = true; run++; subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaAdminAccounts = Object.freeze({ mount });
})();

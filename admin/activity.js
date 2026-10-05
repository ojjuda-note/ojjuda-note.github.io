/* Read-only administrator history. Authorization is also enforced by the RPC. */
(() => {
  'use strict';
  const PAGE_SIZE = 30;
  const MAX_OFFSET = 2147483647; // PostgreSQL integer parameter range.
  const labels = {
    ban: '계정 이용 제한', unban: '계정 이용 제한 해제', report: '신고 처리', feedback: '문의 처리',
    config: '운영 설정 변경', delete: '자료 삭제', edit: '카드 수정',
    guestbook_hide: '방명록 숨김', guestbook_unhide: '방명록 복구', coins: '쭈 조정',
    item_give: '아이템 지급', item_take: '아이템 회수', rename: '닉네임 변경',
    member_identity_edit: '회원정보 수정', member_phone_emergency: '긴급 전화번호 조회',
    admin_on: '관리자 지정', admin_off: '관리자 해제',
    hide: '카드 숨김', restore: '카드 복구', resolve_report: '신고 처리 완료',
    archive: '카드 보관', archive_card: '카드 보관', restore_archived_card: '보관 카드 복구',
    purge_card: '보관 자료 영구 정리', edit_event: '이벤트 조건 정정',
    restrict_user: '카드 이용 제한', release_user: '카드 이용 제한 해제',
    add_moderator: '카드 운영자 지정', remove_moderator: '카드 운영자 해제',
    update_settings: '서비스 공지 변경', update_spam_settings: '도배 방지 설정 변경', reply_inquiry: '문의 답변',
    house_post_edit: '우리집 글 수정', house_post_delete: '우리집 글 삭제',
    media_comment_edit: '앨범 댓글 수정', media_comment_delete: '앨범 댓글 삭제'
  };
  const fields = { body: '글 내용', tags: '태그', birth_date: '생년월일', gender: '성별', phone_number: '전화번호', nickname: '닉네임' };
  const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value != null) n.textContent = String(value); return n; };
  const button = (label, action) => { const n = el('button', 'btn aa-button', label); n.type = 'button'; n.addEventListener('click', action); return n; };
  const number = value => Number(value || 0).toLocaleString('ko-KR');
  const date = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '시간 정보 없음';
  const actionLabel = (code, detail) => detail?.spam_after ? '도배 방지 설정 변경'
    : detail?.visual_after ? '카드 꾸미기·사진 정정' : detail?.after?.radius_km != null ? '이벤트 조건 정정'
      : labels[code] || `기타 작업 · ${code || '분류 없음'}`;
  function changes(row) {
    const d = row.detail && typeof row.detail === 'object' ? row.detail : {}, out = [];
    if (Number.isFinite(d.delta)) out.push(['쭈 변경', `${d.delta > 0 ? '+' : ''}${number(d.delta)}쭈`]);
    if (row.action === 'rename') out.push(['이전 닉네임', d.old || '없음'], ['새 닉네임', row.target || d.new || '없음']);
    if (Array.isArray(d.fields)) out.push(['수정 항목', d.fields.map(k => fields[k] || k).join(', ')]);
    if (Number.isSafeInteger(d.days)) out.push(['이용 제한', d.days ? `${d.days}일` : '해제']);
    if (Number.isSafeInteger(d.count)) out.push(['처리한 자료', `${number(d.count)}개`]);
    if (Object.hasOwn(d, 'restricted_until')) out.push(['제한 종료', d.restricted_until ? date(d.restricted_until) : '종료 시각 없음']);
    if (Number.isSafeInteger(d.notice_length)) out.push(['공지 길이', `${number(d.notice_length)}자`]);
    for (const [key, label] of [['posting_enabled','카드 작성'],['replies_enabled','답글 작성'],['reports_enabled','신고 접수']])
      if (typeof d[key] === 'boolean') out.push([label, d[key] ? '허용' : '중지']);
    if (d.blocked_words_changed) out.push(['금칙어', '변경']);
    if (d.operating_documents_changed) out.push(['운영 문서', '변경']);
    if (d.spam_before && d.spam_after) {
      const spam = v => `같은 글 연속 ${v.max_consecutive}회 · ${v.window_seconds}초에 ${v.max_posts}개 허용`;
      out.push(['이전 도배 방지', spam(d.spam_before)], ['변경된 도배 방지', spam(d.spam_after)]);
    }
    if (d.before?.radius_km != null && d.after?.radius_km != null) {
      const event = v => `위치 ${v.lat}, ${v.lng} · 반경 ${v.radius_km}km · ${date(v.starts_at)} ~ ${date(v.ends_at)}`;
      out.push(['이전 이벤트 조건', event(d.before)], ['변경된 이벤트 조건', event(d.after)]);
    }
    if (d.visual_after) {
      const visual = v => {
        const style = v?.style || {};
        return `글꼴 ${style.font || '기본'} · 글자 크기 ${style.size || '보통'} · 테마 ${style.theme || '기본'} · 글씨 색 ${style.textColor || '기본'} · 글상자 색 ${style.boxColor || '기본'} · 효과 ${style.effect || '없음'} · 지정 사진 ${v?.photo_key || '없음'} · 사진 종료 ${date(v?.photo_until)} · 꾸미기 종료 ${date(v?.style_until)}`;
      };
      out.push(['이전 카드 꾸미기', visual(d.visual_before)], ['변경된 카드 꾸미기', visual(d.visual_after)]);
    }
    if (d.inquiry_id) out.push(['문의 번호', d.inquiry_id]);
    return out;
  }
  function mount({ container, client, getAdminId, isCurrent = () => container.isConnected, initialSource = 'world', initialState = null }) {
    let owner = getAdminId?.(), destroyed = false, run = 0, subscription = null;
    const saved = initialState && typeof initialState === 'object' ? initialState : {};
    let source = ['world', 'park'].includes(saved.source) ? saved.source : ['park', 'note-actions'].includes(initialSource) ? 'park' : 'world';
    let action = typeof saved.action === 'string' && saved.action.length <= 100 && saved.action === saved.action.trim() ? saved.action : '';
    let offset = Number.isSafeInteger(saved.offset) && saved.offset >= 0 && saved.offset <= MAX_OFFSET ? Math.floor(saved.offset / PAGE_SIZE) * PAGE_SIZE : 0;
    let sourceSelect, actionSelect, refreshButton, status, list, pager;
    const getState = () => ({ source, action, offset });
    const active = () => !destroyed && isCurrent() && !!owner && getAdminId?.() === owner;
    const valid = version => active() && version === run;
    function clear(message) { container.replaceChildren(el('p', 'aa-message', message)); }
    function clearAccount() { if (destroyed || !isCurrent()) return; run++; owner = null; clear('관리자 계정으로 다시 열어 주세요.'); }
    function setBusy(busy) { refreshButton.disabled = busy; list.setAttribute('aria-busy', String(busy)); }
    function renderItems(items) {
      list.replaceChildren();
      for (const row of items) {
        const card = el('article', 'aa-card'), head = el('div', 'aa-card-head');
        head.append(el('strong', '', actionLabel(row.action, row.detail)), el('time', 'aa-date', date(row.created_at)));
        const actor = row.admin_nick || (row.admin_id ? `관리자 ${String(row.admin_id).slice(0, 8)}` : '기록된 관리자 없음');
        card.append(head, el('p', 'aa-meta', `처리자: ${actor}${row.target_nick ? ` · 대상: ${row.target_nick}` : ''}`));
        if (row.reason) card.append(el('p', 'aa-reason', `사유: ${row.reason}`));
        const detail = el('details', 'aa-detail'), values = el('dl'); detail.append(el('summary', '', '상세 기록'));
        const rows = [...changes(row), ['작업 번호', row.id], ['운영자 번호', row.admin_id], ['대상 회원 번호', row.target_user], ['대상 자료', row.target], ['카드 번호', row.card_id], ['신고 번호', row.report_id]];
        for (const [label, value] of rows) if (value != null && value !== '') values.append(el('dt', '', label), el('dd', '', value));
        detail.append(values); card.append(detail); list.append(card);
      }
    }
    async function refresh(reset = false) {
      if (!active()) { if (!destroyed && isCurrent()) clearAccount(); return; }
      if (reset) offset = 0;
      const version = ++run, requested = { p_source: source, p_action: action || null, p_limit: PAGE_SIZE, p_offset: offset };
      setBusy(true); status.textContent = '작업 기록을 불러오고 있어요.'; list.replaceChildren(); pager.replaceChildren();
      try {
        const { data, error } = await client.rpc('admin_activity_list', requested);
        if (!valid(version)) return;
        if (error) throw error;
        if (!data || !Array.isArray(data.items) || !Array.isArray(data.actions) || !Number.isSafeInteger(Number(data.total_count)) || Number(data.total_count) < 0) throw new Error('invalid_activity_response');
        const total = Number(data.total_count);
        actionSelect.replaceChildren(el('option', '', '전체 작업')); actionSelect.firstElementChild.value = '';
        for (const item of data.actions) { const option = el('option', '', `${actionLabel(item.action)} (${number(item.count)})`); option.value = item.action; actionSelect.append(option); }
        if (action && ![...actionSelect.options].some(option => option.value === action)) { const option = el('option', '', actionLabel(action)); option.value = action; actionSelect.append(option); }
        actionSelect.value = action;
        renderItems(data.items);
        const page = Math.floor(offset / PAGE_SIZE) + 1, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        status.textContent = total ? `총 ${number(total)}건 · ${number(page)} / ${number(pages)}페이지 · 최근 작업부터 표시` : '조건에 맞는 작업 기록이 없어요.';
        if (!data.items.length) list.append(el('p', 'aa-message', offset ? '이 페이지에 남은 기록이 없어요. 첫 페이지를 확인해 주세요.' : '아직 표시할 작업 기록이 없어요.'));
        const previous = button('이전', () => { offset = Math.max(0, offset - PAGE_SIZE); void refresh(); }); previous.disabled = offset === 0;
        const next = button('다음', () => { offset += PAGE_SIZE; void refresh(); }); next.disabled = offset + PAGE_SIZE >= total || offset + PAGE_SIZE > MAX_OFFSET;
        pager.append(previous, el('span', '', `${number(page)} / ${number(pages)}`), next);
        if (offset) pager.append(button('첫 페이지', () => { offset = 0; void refresh(); }));
      } catch (error) {
        if (!valid(version)) return;
        list.replaceChildren(); pager.replaceChildren();
        status.textContent = error?.code === '42501' ? '관리자 권한을 확인할 수 없어요. 다시 로그인해 주세요.' : '작업 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
        pager.append(button('다시 불러오기', () => { void refresh(); }));
      } finally { if (valid(version)) setBusy(false); }
    }
    if (!owner || typeof client?.rpc !== 'function') { clear('관리자 계정만 작업 기록을 볼 수 있어요.'); return { getState, refresh() {}, destroy() { destroyed = true; container.replaceChildren(); } }; }
    const section = el('section', 'aa-history'), heading = el('h3', '', '작업 기록');
    section.append(heading, el('p', 'aa-help', '변경 내용과 처리 사유를 확인해요. 시간은 한국 기준이에요.'));
    const controls = el('div', 'aa-controls');
    sourceSelect = el('select'); sourceSelect.setAttribute('aria-label', '기록 종류');
    for (const [value, label] of [['world','계정·집·대화'],['park','카드·답글']]) { const option = el('option', '', label); option.value = value; sourceSelect.append(option); }
    sourceSelect.value = source;
    actionSelect = el('select'); actionSelect.setAttribute('aria-label', '작업 분류'); actionSelect.append(el('option', '', '전체 작업')); actionSelect.firstElementChild.value = '';
    const sourceLabel = el('label', '', '기록 종류'), actionFilterLabel = el('label', 'aa-action-filter', '작업 분류'); sourceLabel.append(sourceSelect); actionFilterLabel.append(actionSelect);
    sourceSelect.addEventListener('change', () => { source = sourceSelect.value; action = ''; offset = 0; actionSelect.replaceChildren(el('option', '', '전체 작업')); actionSelect.firstElementChild.value = ''; void refresh(); });
    actionSelect.addEventListener('change', () => { action = actionSelect.value; offset = 0; void refresh(); });
    refreshButton = button('새로고침', () => { void refresh(true); }); controls.append(sourceLabel, actionFilterLabel, refreshButton);
    status = el('p', 'aa-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    list = el('div', 'aa-list'); pager = el('nav', 'aa-pager'); pager.setAttribute('aria-label', '작업 기록 페이지');
    section.append(controls, status, list, pager); container.replaceChildren(section);
    subscription = client.auth?.onAuthStateChange?.((_event, session) => { if (session?.user?.id !== owner) clearAccount(); })?.data?.subscription;
    void refresh();
    return { getState, refresh: () => refresh(true), destroy() { destroyed = true; run++; subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaAdminActivity = Object.freeze({ mount });
})();

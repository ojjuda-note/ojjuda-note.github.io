/* Independent Note administration. Only ojjuda_note RPCs are used here. */
(() => {
  'use strict';
  const PAGE_SIZE = 30;
  const TABS = [
    ['overview', '운영 현황'], ['settings', '운영 설정'], ['cards', '카드 · 답글'],
    ['reports', '신고'], ['inquiries', '문의'], ['users', '이용 제한'], ['moderators', '운영자'], ['actions', '작업 기록']
  ];
  const HELP = {
    overview: '노트의 콘텐츠와 운영 상태를 확인하세요.',
    settings: '공지와 노트 안의 기능을 관리합니다. 변경 사유는 작업 기록에 남습니다.',
    cards: '전체 카드와 답글을 관리합니다. 개별 숨김 여부를 표시하며, 상위 카드를 숨기면 그 답글도 함께 숨겨집니다.',
    reports: '신고 내용을 확인하고 카드 공개 여부와 처리 상태를 관리합니다.',
    inquiries: '이용자가 노트에 남긴 문의를 확인하고 답변합니다.',
    users: '노트에서의 활동만 제한합니다. 오쭈다월드 계정과 쭈에는 영향을 주지 않습니다.',
    moderators: '노트 운영 권한을 별도로 지정합니다. 월드 관리자 권한은 변경되지 않습니다.',
    actions: '노트에서 이루어진 운영 변경과 처리 사유를 확인하세요.'
  };
  const ACTIONS = {
    hide: '카드 숨김', restore: '카드 복구', resolve_report: '신고 처리 완료', edit: '카드 수정',
    restrict_user: '이용 제한', release_user: '이용 제한 해제', add_moderator: '운영자 지정',
    remove_moderator: '운영자 해제', update_settings: '운영 설정 변경', reply_inquiry: '문의 답변'
  };
  const filters = { cards: { query: '', state: 'all', offset: 0 }, users: { query: '', offset: 0 }, actions: { offset: 0 }, reports: { offset: 0 } };
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let client = null, onChanged = null, userId = null, subscription = null;
  let instance = 0, pageRun = 0, busy = false, tabId = 'overview', actionReturn = null;
  let previousFocus = null, previousOverflow = '', inertState = [], disabledState = [];
  let root, panel, nav, main, status, closeButton;

  function el(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = String(value);
    return item;
  }
  function button(label, action, variant = '') {
    const item = el('button', `na-button${variant ? ` na-button--${variant}` : ''}`, label);
    item.type = 'button'; item.addEventListener('click', action); return item;
  }
  function formatDate(value) {
    if (!value) return '없음';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '날짜 확인 불가';
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function shortUser(id) { return id ? `이용자 ${String(id).slice(0, 8)}` : '탈퇴한 이용자'; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('ko-KR') : '0'; }
  function validRun(run) { return !!root && !root.hidden && pageRun === run; }
  function validInstance(run) { return !!root && !root.hidden && instance === run; }
  function setStatus(message = '', error = false) {
    status.textContent = message;
    status.classList.toggle('na-status--error', error);
  }
  function empty(target, message) { target.append(el('p', 'na-empty', message)); }
  function badge(text, variant = '') { return el('span', `na-badge${variant ? ` na-badge--${variant}` : ''}`, text); }
  function sectionTitle(title, help) {
    const heading = el('h3', 'na-section-title', title); heading.tabIndex = -1;
    main.replaceChildren(heading);
    if (help) main.append(el('p', 'na-help', help));
    return heading;
  }
  function field(label, type = 'text', value = '', help = '') {
    const wrap = el('label', 'na-field');
    const input = el(type === 'textarea' ? 'textarea' : 'input', 'na-input');
    if (type !== 'textarea') input.type = type;
    input.value = value ?? '';
    wrap.append(el('span', '', label), input);
    if (help) wrap.append(el('small', '', help));
    return { wrap, input };
  }
  function reasonField() {
    const item = field('처리 사유', 'textarea', '', '변경 내용을 다른 운영자도 이해할 수 있도록 적어 주세요. 최대 500자');
    item.input.required = true; item.input.maxLength = 500; item.input.rows = 3;
    item.input.addEventListener('input', () => item.input.setCustomValidity(''));
    return item;
  }
  function validReason(input) {
    input.setCustomValidity(input.value.trim() ? '' : '처리 사유를 적어 주세요.');
    return input.reportValidity();
  }
  function details(values) {
    const block = el('details', 'na-details'); block.append(el('summary', '', '상세 정보'));
    const list = el('dl');
    for (const [label, value] of values) {
      if (!value) continue;
      list.append(el('dt', '', label), el('dd', 'na-id', value));
    }
    block.append(list); return block;
  }
  function pagination(target, offset, total, onPage) {
    const count = Number(total) || 0;
    if (count <= PAGE_SIZE && offset === 0) return;
    const row = el('div', 'na-pagination');
    const before = button('이전', () => onPage(Math.max(0, offset - PAGE_SIZE)));
    const next = button('다음', () => onPage(offset + PAGE_SIZE));
    before.disabled = offset === 0; next.disabled = offset + PAGE_SIZE >= count;
    row.append(before, el('span', '', `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(count / PAGE_SIZE))}`), next);
    target.append(row);
  }
  async function rpc(name, args = {}) {
    const { data, error } = await client.schema('ojjuda_note').rpc(name, args);
    if (error) throw error;
    return data;
  }
  function friendlyError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('self') || message.includes('your own note moderator') || message.includes('own moderator')) return '본인의 운영 권한은 여기서 해제할 수 없어요.';
    if (message.includes('last moderator') || message.includes('at least one note moderator')) return '마지막 운영자는 해제할 수 없어요.';
    if (message.includes('release the note restriction') || (message.includes('restricted') && message.includes('grant'))) return '이용 제한을 먼저 해제한 뒤 운영자로 지정해 주세요.';
    if (message.includes('moderator') && message.includes('restrict')) return '운영자는 이용 제한 대상이 될 수 없어요. 다른 운영자가 권한을 먼저 해제해 주세요.';
    if (message.includes('world member') || message.includes('onboard') || message.includes('not found')) return '대상을 찾지 못했어요. 현재 목록과 이용자 번호를 확인해 주세요.';
    if (message.includes('card unavailable')) return '카드를 찾지 못했어요. 목록을 새로 불러온 뒤 확인해 주세요.';
    if (message.includes('노트 운영 기준')) return '글이나 태그에 작성 금지어가 포함되어 있어요. 내용을 확인해 주세요.';
    if (error?.code === '42501' || message.includes('permission') || message.includes('moderator required') || message.includes('not authorized')) return '이 작업을 할 권한이 없어요. 노트 운영 권한을 확인해 주세요.';
    if (error?.code === '23514' || error?.code === '22023') return '입력 내용을 확인해 주세요. 글, 태그, 사유의 허용 범위를 벗어났을 수 있어요.';
    return '요청을 완료하지 못했어요. 연결 상태와 현재 권한을 확인한 뒤 다시 시도해 주세요.';
  }
  function lockControls(locked) {
    busy = locked; panel.setAttribute('aria-busy', String(locked));
    if (locked) {
      disabledState = [...panel.querySelectorAll('button,input,textarea,select')].map(control => [control, control.disabled]);
      for (const [control] of disabledState) control.disabled = true;
    } else {
      for (const [control, wasDisabled] of disabledState) if (control.isConnected) control.disabled = wasDisabled;
      disabledState = [];
    }
  }
  async function currentUserMatches() {
    const expected = userId;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!expected || data?.session?.user?.id !== expected) { close(); return false; }
    return true;
  }
  async function perform(name, args, success, returnTab = tabId) {
    if (busy || root.hidden) return;
    const run = instance;
    lockControls(true); setStatus('변경 내용을 저장하고 있어요.');
    try {
      if (!await currentUserMatches() || !validInstance(run)) return;
      await rpc(name, args);
      if (!validInstance(run) || !await currentUserMatches()) return;
      if (typeof onChanged === 'function') {
        try { await onChanged(); }
        catch { /* The saved operation remains successful even if the host refresh fails. */ }
      }
      if (!validInstance(run)) return;
      lockControls(false);
      const refreshed = await load(returnTab);
      if (validInstance(run)) setStatus(refreshed ? success : `${success} 목록을 새로 불러오지는 못했어요.`, !refreshed);
    } catch (error) {
      if (!validInstance(run)) return;
      setStatus(friendlyError(error), true);
    } finally {
      if (validInstance(run)) lockControls(false);
    }
  }
  function actionScreen(title, description, build) {
    if (busy) return;
    pageRun++; actionReturn = tabId; setStatus('');
    const heading = sectionTitle(title, description);
    const form = el('form', 'na-form');
    const actions = el('div', 'na-actions');
    actions.append(button('돌아가기', () => load(actionReturn || tabId)));
    build(form, actions);
    form.append(actions); main.append(form); main.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }
  function confirmVisibility(card) {
    const hide = !card.hidden;
    actionScreen(hide ? '카드 숨김' : '카드 복구', hide
      ? '이 카드와 연결된 답글을 공개 화면에서 숨깁니다. 작업 기록과 원문은 보관됩니다.'
      : '이 카드의 숨김을 해제합니다. 상위 카드나 개별 답글이 숨겨져 있으면 해당 콘텐츠는 계속 숨겨집니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', card.body || '삭제된 카드'));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button(hide ? '숨김 처리' : '복구', () => {});
      // Construct the submit button without executing the request until the form is valid.
      save.textContent = hide ? '숨김 처리' : '복구'; save.type = 'submit';
      save.className = 'na-button na-button--primary'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        perform('moderate_card', { p_card_id: card.id || card.card_id, p_hidden: hide, p_reason: reason.input.value.trim() }, hide ? '카드를 숨겼어요.' : '카드의 개별 숨김을 해제했어요.');
      });
    });
  }
  function editCard(card) {
    actionScreen('카드 · 답글 수정', '관리자의 수정 이력과 사유는 작업 기록에 남습니다.', (form, actions) => {
      const body = field('글 내용', 'textarea', card.body, '최대 200자, 8줄'); body.input.required = true; body.input.maxLength = 200; body.input.rows = 6;
      const tags = field('태그', 'text', (card.tags || []).join(', '), '쉼표로 구분해 최대 5개, 태그마다 20자 이내'); tags.input.maxLength = 120;
      const reason = reasonField(); form.append(body.wrap, tags.wrap, reason.wrap);
      const save = button('수정 내용 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = body.input.value.replace(/\r\n?/g, '\n').trim();
        const tagValues = [...new Set(tags.input.value.split(',').map(value => value.trim().replace(/^#+/, '')).filter(Boolean))];
        body.input.setCustomValidity(!value ? '글 내용을 적어 주세요.' : [...value].length > 200 || value.split('\n').length > 8 ? '글은 200자, 8줄 이내로 적어 주세요.' : '');
        tags.input.setCustomValidity(tagValues.length > 5 || tagValues.some(value => [...value].length > 20) ? '태그는 최대 5개이며, 각 20자 이내로 적어 주세요.' : '');
        if (!body.input.reportValidity() || !tags.input.reportValidity() || !validReason(reason.input)) return;
        perform('admin_edit_card', { p_card_id: card.id, p_body: value, p_tags: tagValues, p_reason: reason.input.value.trim() }, '카드를 수정했어요.', 'cards');
      });
      body.input.addEventListener('input', () => body.input.setCustomValidity(''));
      tags.input.addEventListener('input', () => tags.input.setCustomValidity(''));
    });
  }
  function restrictUser(user) {
    const restrict = !user.is_restricted;
    actionScreen(restrict ? '노트 이용 제한' : '노트 이용 제한 해제', `${shortUser(user.user_id)} · 월드 계정과 쭈는 그대로 유지됩니다.`, (form, actions) => {
      form.append(el('p', 'na-id', user.user_id));
      if (restrict) form.append(el('p', 'na-warning', '노트의 글 작성·수정과 공감·메모함 추가를 제한합니다. 신고와 문의, 본인 글 삭제는 계속 가능합니다. 기존 글의 공개 여부는 카드 · 답글 메뉴에서 따로 관리하세요.'));
      else if (user.restriction_reason) form.append(el('p', 'na-warning', `현재 제한 사유: ${user.restriction_reason}`));
      const until = field('제한 종료 시각', 'datetime-local', '', '비워 두면 직접 해제할 때까지 유지됩니다. 현재 기기의 시간 기준입니다.');
      if (restrict) form.append(until.wrap);
      const reason = reasonField(); form.append(reason.wrap);
      const save = button(restrict ? '이용 제한 적용' : '이용 제한 해제', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        let deadline = null;
        if (restrict && until.input.value) {
          const date = new Date(until.input.value);
          until.input.setCustomValidity(!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() ? '현재보다 이후의 시각을 선택해 주세요.' : '');
          if (!until.input.reportValidity()) return;
          deadline = date.toISOString();
        }
        perform('admin_restrict_user', { p_user_id: user.user_id, p_restricted: restrict, p_reason: reason.input.value.trim(), p_until: deadline }, restrict ? '노트 이용 제한을 적용했어요.' : '노트 이용 제한을 해제했어요.', 'users');
      });
      until.input.addEventListener('input', () => until.input.setCustomValidity(''));
    });
  }
  function setModerator(user, enabled) {
    if (user.user_id === userId && !enabled) return;
    actionScreen(enabled ? '노트 운영자 지정' : '노트 운영자 해제', shortUser(user.user_id), (form, actions) => {
      form.append(el('p', 'na-id', user.user_id));
      form.append(el('p', 'na-warning', enabled
        ? '이 이용자는 노트의 전체 콘텐츠, 신고, 이용 제한, 운영 설정과 운영자를 관리할 수 있게 됩니다.'
        : '이 이용자의 노트 관리 권한을 해제합니다. 일반 노트 이용과 월드 계정은 유지됩니다.'));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button(enabled ? '운영자로 지정' : '운영 권한 해제', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        perform('admin_set_moderator', { p_user_id: user.user_id, p_enabled: enabled, p_reason: reason.input.value.trim() }, enabled ? '노트 운영자로 지정했어요.' : '노트 운영 권한을 해제했어요.', 'moderators');
      });
    });
  }
  async function renderOverview(run) {
    const [overview, settings] = await Promise.all([rpc('admin_overview'), rpc('get_note_state')]);
    if (!validRun(run)) return;
    const stats = el('dl', 'na-stats');
    for (const [label, key] of [['사진 카드', 'total_memos'], ['답글', 'total_replies'], ['개별 숨김 콘텐츠', 'hidden_cards'], ['접수된 신고', 'open_reports'], ['이용 제한', 'restricted_users'], ['운영자', 'moderators']]) {
      const stat = el('div', 'na-stat'); stat.append(el('dt', '', label), el('dd', '', number(overview?.[key]))); stats.append(stat);
    }
    main.append(stats);
    const operating = el('section', 'na-box'); operating.append(el('h4', '', '현재 운영 상태'));
    const states = el('p', 'na-meta');
    for (const [label, key] of [['카드 작성', 'posting_enabled'], ['답글 작성', 'replies_enabled'], ['신고 접수', 'reports_enabled']]) states.append(badge(`${label} ${settings?.[key] ? '열림' : '닫힘'}`, settings?.[key] ? 'good' : 'warn'));
    operating.append(states, button('운영 설정 관리', () => load('settings'))); main.append(operating);
    const notice = el('section', 'na-box na-box--notice'); notice.append(el('h4', '', '현재 공지'), el('p', '', settings?.notice || '등록된 공지가 없어요.')); main.append(notice);
  }
  async function renderSettings(run) {
    const settings = await rpc('admin_settings'); if (!validRun(run)) return;
    const form = el('form', 'na-form');
    const notice = field('노트 공지', 'textarea', settings?.notice || '', '모든 이용자에게 표시됩니다. 최대 1,000자이며, 비우면 공지가 내려갑니다.'); notice.input.maxLength = 1000; notice.input.rows = 5;
    form.append(notice.wrap); const checks = {};
    for (const [key, label, description] of [
      ['posting_enabled', '카드 작성·수정 허용', '사진 카드를 새로 쓰거나 수정할 수 있습니다.'],
      ['replies_enabled', '답글 작성·수정 허용', '답글을 새로 쓰거나 수정할 수 있습니다.'],
      ['reports_enabled', '신고 접수 허용', '새 신고를 접수합니다. 기존 신고는 계속 관리할 수 있습니다.']
    ]) {
      const wrap = el('label', 'na-switch'); const input = el('input'); input.type = 'checkbox'; input.checked = settings?.[key] === true;
      const copy = el('span', '', label); copy.append(el('small', '', description)); wrap.append(input, copy); form.append(wrap); checks[key] = input;
    }
    const additional = {};
    for (const [key, label, maxLength, hint] of [
      ['contact_text', '문의 안내', 1000, '문의 방법이나 운영시간을 안내하세요.'],
      ['guidelines', '노트 이용 안내', 5000, '노트의 작성 규칙과 운영 원칙을 안내하세요.'],
      ['terms', '노트 이용약관', 10000, '노트 서비스에 적용할 약관 내용을 작성하세요.'],
      ['privacy', '노트 개인정보 안내', 10000, '노트에서 처리하는 정보와 문의 방법을 안내하세요.']
    ]) {
      const item = field(label, 'textarea', settings?.[key] || '', `${hint} 최대 ${number(maxLength)}자`);
      item.input.maxLength = maxLength; item.input.rows = key === 'contact_text' ? 3 : 6;
      additional[key] = item.input; form.append(item.wrap);
    }
    const blocked = field('작성 금지어', 'textarea', (settings?.blocked_words || []).join('\n'), '줄바꿈으로 구분하세요. 최대 100개, 각 40자 이내입니다. 글과 태그에 금지어가 포함되면 작성을 제한합니다.');
    blocked.input.maxLength = 4100; blocked.input.rows = 5; form.append(blocked.wrap);
    const reason = reasonField(); form.append(reason.wrap);
    const actions = el('div', 'na-actions'); const save = button('운영 설정 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save); form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const words = [...new Set(blocked.input.value.split('\n').map(value => value.trim()).filter(Boolean))];
      blocked.input.setCustomValidity(words.length > 100 || words.some(value => [...value].length > 40) ? '금지어는 최대 100개, 각각 40자 이내로 적어 주세요.' : '');
      if (!blocked.input.reportValidity() || !validReason(reason.input)) return;
      const args = { p_notice: notice.input.value.trim(), p_posting_enabled: checks.posting_enabled.checked, p_replies_enabled: checks.replies_enabled.checked, p_reports_enabled: checks.reports_enabled.checked, p_reason: reason.input.value.trim(), p_blocked_words: words };
      for (const [key, input] of Object.entries(additional)) args[`p_${key}`] = input.value.trim();
      perform('admin_update_settings', args, '운영 설정을 저장했어요.', 'settings');
    }); main.append(form);
    blocked.input.addEventListener('input', () => blocked.input.setCustomValidity(''));
  }
  function searchForm(value, placeholder, submit, states = null, help = '') {
    const form = el('form', 'na-search'); const query = field('검색', 'search', value, help); query.input.placeholder = placeholder; query.input.maxLength = 200; form.append(query.wrap);
    let select = null;
    if (states) {
      const wrap = el('label', 'na-field'); wrap.append(el('span', '', '개별 숨김')); select = el('select', 'na-input');
      for (const [key, label] of [['all', '전체'], ['visible', '숨김 없음'], ['hidden', '숨김']]) {
        const option = el('option', '', label); option.value = key; select.append(option);
      }
      select.value = states; wrap.append(select); form.append(wrap);
    }
    const go = button('검색', () => {}, 'primary'); go.type = 'submit';
    form.append(go, button('초기화', () => submit('', 'all')));
    form.addEventListener('submit', event => { event.preventDefault(); submit(query.input.value.trim(), select?.value); });
    return form;
  }
  async function renderCards(run) {
    const filter = filters.cards;
    main.append(searchForm(filter.query, '글 내용이나 태그 검색', (query, state) => { filters.cards = { query, state, offset: 0 }; load('cards'); }, filter.state));
    const rows = await rpc('admin_cards', { p_query: filter.query, p_state: filter.state, p_limit: PAGE_SIZE, p_offset: filter.offset });
    if (!validRun(run)) return;
    if (!rows?.length) { empty(main, filter.offset ? '이 페이지에 콘텐츠가 없어요.' : '조건에 맞는 카드와 답글이 없어요.'); if (filter.offset) main.append(button('첫 페이지로', () => { filters.cards.offset = 0; load('cards'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}개 · ${filter.offset + 1}–${filter.offset + rows.length}`));
    const list = el('div', 'na-list');
    for (const card of rows) {
      const item = el('article', 'na-item'); const header = el('div', 'na-item-header');
      const meta = el('p', 'na-meta'); meta.append(badge(card.kind === 'comment' ? '답글' : '사진 카드'), badge(card.hidden ? '개별 숨김' : '개별 숨김 없음', card.hidden ? 'warn' : 'good'), el('span', '', formatDate(card.created_at)));
      header.append(meta); item.append(header, el('blockquote', 'na-card-body', card.body));
      if (card.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of card.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
      item.append(el('p', 'na-reason', `작성자: ${shortUser(card.author_id)}`));
      if (card.moderation_reason) item.append(el('p', 'na-reason', `공개 상태 처리 사유: ${card.moderation_reason}`));
      item.append(details([['카드 번호', card.id], ['작성자 번호', card.author_id], ['원글 번호', card.parent_id], ['마지막 수정', formatDate(card.edited_at)]]));
      const actions = el('div', 'na-actions'); actions.append(button('본문 수정', () => editCard(card)), button(card.hidden ? '복구' : '숨김', () => confirmVisibility(card), card.hidden ? '' : 'danger'));
      if (card.author_id) actions.append(button('작성자 관리', () => { filters.users = { query: card.author_id, offset: 0 }; load('users'); }));
      item.append(actions); list.append(item);
    }
    main.append(list); pagination(main, filter.offset, total, offset => { filters.cards.offset = offset; load('cards'); });
  }
  function confirmReport(report) {
    actionScreen('신고 처리 완료', '이 신고의 검토를 완료로 표시합니다. 카드의 공개 상태는 그대로 유지됩니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', report.body || '삭제된 카드'), el('p', 'na-reason', `신고 사유: ${report.reason || ''}`));
      actions.append(button('처리 완료', () => perform('resolve_report', { p_report_id: report.report_id }, '신고 검토를 완료했어요.', 'reports'), 'primary'));
      form.addEventListener('submit', event => event.preventDefault());
    });
  }
  async function renderReports(run) {
    const all = await rpc('moderation_queue'); if (!validRun(run)) return;
    const rows = all || [];
    const offset = Math.min(filters.reports.offset, Math.max(0, Math.floor((rows.length - 1) / PAGE_SIZE) * PAGE_SIZE));
    filters.reports.offset = offset;
    if (!rows.length) { empty(main, '접수되거나 숨김 처리된 신고가 없어요.'); return; }
    main.append(el('p', 'na-count', `총 ${number(rows.length)}건 · 처리 중인 신고와 숨긴 카드를 함께 표시합니다.`));
    const list = el('div', 'na-list');
    for (const report of rows.slice(offset, offset + PAGE_SIZE)) {
      const item = el('article', 'na-item'); const meta = el('p', 'na-meta');
      meta.append(badge(report.status === 'resolved' ? '처리 완료' : '접수', report.status === 'resolved' ? 'good' : 'warn'), badge(report.hidden ? '개별 숨김' : '개별 숨김 없음'), el('span', '', formatDate(report.created_at)));
      item.append(meta, el('blockquote', 'na-card-body', report.body || '삭제된 카드'), el('p', 'na-reason', `신고 사유: ${report.reason || ''}`));
      const actions = el('div', 'na-actions');
      if (report.card_id) actions.append(button(report.hidden ? '카드 복구' : '카드 숨김', () => confirmVisibility(report)));
      if (report.status !== 'resolved') actions.append(button('처리 완료', () => confirmReport(report), 'primary'));
      item.append(actions); list.append(item);
    }
    main.append(list); pagination(main, offset, rows.length, next => { filters.reports.offset = next; load('reports'); });
  }
  async function renderUsers(run) {
    const filter = filters.users;
    main.append(searchForm(filter.query, '이용자 번호 전체 또는 일부', query => { filters.users = { query, offset: 0 }; load('users'); }, null, '노트에 참여한 이용자와 운영자를 찾습니다. 카드의 작성자 관리 버튼으로도 이동할 수 있어요.'));
    const rows = await rpc('admin_users', { p_query: filter.query, p_limit: PAGE_SIZE, p_offset: filter.offset });
    if (!validRun(run)) return;
    if (!rows?.length) { empty(main, '조건에 맞는 노트 이용자가 없어요.'); if (filter.offset) main.append(button('첫 페이지로', () => { filters.users.offset = 0; load('users'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}명`)); const list = el('div', 'na-list');
    for (const user of rows) {
      const item = el('article', 'na-item'); const header = el('div', 'na-item-header'); const meta = el('p', 'na-meta');
      header.append(el('strong', '', shortUser(user.user_id)));
      if (user.is_moderator) meta.append(badge('운영자', 'good'));
      if (user.user_id === userId) meta.append(badge('나'));
      meta.append(badge(user.is_restricted ? '이용 제한 중' : '이용 가능', user.is_restricted ? 'warn' : 'good')); header.append(meta); item.append(header);
      item.append(el('p', 'na-id', user.user_id), el('p', 'na-reason', `작성한 콘텐츠 ${number(user.card_count)}개 · 첫 활동 ${formatDate(user.first_seen)}`));
      if (user.is_restricted) item.append(el('p', 'na-reason', `제한 사유: ${user.restriction_reason || ''}\n종료: ${user.restricted_until ? formatDate(user.restricted_until) : '직접 해제할 때까지'}`));
      const actions = el('div', 'na-actions');
      if (!user.is_moderator) actions.append(button(user.is_restricted ? '이용 제한 해제' : '이용 제한', () => restrictUser(user), user.is_restricted ? '' : 'danger'));
      if (!user.is_moderator && !user.is_restricted) actions.append(button('운영자로 지정', () => setModerator(user, true)));
      if (user.is_moderator && user.user_id !== userId) actions.append(button('운영 권한 해제', () => setModerator(user, false)));
      item.append(actions); list.append(item);
    }
    main.append(list); pagination(main, filter.offset, total, offset => { filters.users.offset = offset; load('users'); });
  }
  async function renderInquiries(run) {
    const target = el('section'); main.append(target);
    if (!window.OjjudaNoteSupport?.renderAdmin) {
      empty(target, '문의 관리 기능을 불러오지 못했어요. 화면을 새로고침해 주세요.'); return;
    }
    await window.OjjudaNoteSupport.renderAdmin({ client, container: target, onChanged, isCurrent: () => validRun(run) });
  }
  async function renderModerators(run) {
    const rows = await rpc('admin_moderators'); if (!validRun(run)) return;
    const list = el('div', 'na-list');
    for (const user of rows || []) {
      const item = el('article', 'na-item'); const header = el('div', 'na-item-header'); header.append(el('strong', '', shortUser(user.user_id)));
      if (user.is_me || user.user_id === userId) header.append(badge('나', 'good'));
      item.append(header, el('p', 'na-id', user.user_id), el('p', 'na-reason', `지정일: ${formatDate(user.created_at)}`));
      if (!user.is_me && user.user_id !== userId) { const actions = el('div', 'na-actions'); actions.append(button('운영 권한 해제', () => setModerator(user, false), 'danger')); item.append(actions); }
      list.append(item);
    }
    main.append(list);
    const box = el('section', 'na-box'); box.append(el('h4', '', '운영자 추가'));
    box.append(el('p', '', '노트 이용자 목록에서 선택하거나, 월드 가입을 마친 이용자의 번호를 입력하세요. 본인의 운영 권한은 해제할 수 없습니다.'));
    const form = el('form', 'na-form'); const id = field('이용자 번호', 'text', '', '카드 · 답글의 작성자 상세 정보에서 확인할 수 있어요.'); id.input.required = true; id.input.maxLength = 36; id.input.autocomplete = 'off'; id.input.spellcheck = false;
    form.append(id.wrap); const actions = el('div', 'na-actions'); actions.append(button('노트 이용자에서 선택', () => { filters.users = { query: '', offset: 0 }; load('users'); }));
    const next = button('지정 내용 확인', () => {}, 'primary'); next.type = 'submit'; actions.append(next); form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault(); const value = id.input.value.trim();
      id.input.setCustomValidity(uuidPattern.test(value) ? '' : '올바른 이용자 번호를 입력해 주세요.'); if (!id.input.reportValidity()) return;
      setModerator({ user_id: value }, true);
    }); id.input.addEventListener('input', () => id.input.setCustomValidity(''));
    box.append(form); main.append(box);
  }
  async function renderActions(run) {
    const offset = filters.actions.offset;
    const rows = await rpc('admin_actions', { p_limit: PAGE_SIZE, p_offset: offset }); if (!validRun(run)) return;
    if (!rows?.length) { empty(main, '아직 남겨진 작업 기록이 없어요.'); if (offset) main.append(button('첫 페이지로', () => { filters.actions.offset = 0; load('actions'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}건 · 최근 작업부터 표시합니다.`)); const list = el('div', 'na-list');
    for (const action of rows) {
      const item = el('article', 'na-item'); const header = el('div', 'na-item-header');
      header.append(el('strong', '', ACTIONS[action.action] || '운영 작업'), el('span', 'na-meta', formatDate(action.created_at))); item.append(header);
      item.append(el('p', 'na-reason', `처리자: ${shortUser(action.moderator_id)}\n사유: ${action.reason || '기록된 사유 없음'}`));
      item.append(details([['작업 번호', action.action_id], ['운영자 번호', action.moderator_id], ['이용자 번호', action.subject_user_id], ['카드 번호', action.card_id], ['신고 번호', action.report_id]]));
      const changes = auditChanges(action.detail);
      if (changes.length) {
        const more = el('details', 'na-details'); more.append(el('summary', '', '변경 내용'));
        const values = el('dl');
        for (const [label, value] of changes) values.append(el('dt', '', label), el('dd', '', value));
        more.append(values); item.append(more);
      }
      list.append(item);
    }
    main.append(list); pagination(main, offset, total, next => { filters.actions.offset = next; load('actions'); });
  }
  function auditChanges(detail) {
    if (!detail || typeof detail !== 'object') return [];
    const values = [];
    for (const [key, label] of [['posting_enabled', '카드 작성'], ['replies_enabled', '답글 작성'], ['reports_enabled', '신고 접수']]) {
      if (typeof detail[key] === 'boolean') values.push([label, detail[key] ? '허용' : '중지']);
    }
    if (Number.isFinite(Number(detail.notice_length)) && detail.notice_length !== undefined) values.push(['공지 길이', `${number(detail.notice_length)}자`]);
    if (detail.blocked_words_changed === true) values.push(['금지어 설정', '저장']);
    if (detail.operating_documents_changed === true) values.push(['운영 문서', '저장']);
    if (Object.hasOwn(detail, 'restricted_until')) values.push(['제한 종료', detail.restricted_until ? formatDate(detail.restricted_until) : '지정된 종료 시각 없음']);
    if (Array.isArray(detail.fields)) {
      const fields = detail.fields.map(name => ({ body: '글 내용', tags: '태그' }[name])).filter(Boolean);
      if (fields.length) values.push(['수정 항목', fields.join(', ')]);
    }
    if (typeof detail.inquiry_id === 'string') values.push(['문의 번호', detail.inquiry_id]);
    return values;
  }
  async function load(nextTab = tabId) {
    if (busy || !root || root.hidden) return;
    tabId = TABS.some(([id]) => id === nextTab) ? nextTab : 'overview'; actionReturn = null;
    const run = ++pageRun; setStatus('');
    for (const item of nav.querySelectorAll('[data-admin-tab]')) {
      if (item.dataset.adminTab === tabId) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    const heading = sectionTitle(TABS.find(([id]) => id === tabId)[1], HELP[tabId]);
    main.scrollTop = 0; heading.focus({ preventScroll: true });
    const loading = el('p', 'na-empty', '불러오는 중이에요.'); loading.setAttribute('role', 'status'); main.append(loading);
    try {
      await ({ overview: renderOverview, settings: renderSettings, cards: renderCards, reports: renderReports, inquiries: renderInquiries, users: renderUsers, moderators: renderModerators, actions: renderActions }[tabId])(run);
      if (validRun(run)) loading.remove();
      return validRun(run);
    } catch (error) {
      if (!validRun(run)) return;
      loading.remove(); empty(main, '목록을 불러오지 못했어요.'); setStatus(friendlyError(error), true);
      main.append(button('다시 불러오기', () => load(tabId)));
      return false;
    }
  }
  function focusables() {
    return [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')]
      .filter(item => !item.hidden && item.getClientRects().length > 0);
  }
  function mount() {
    if (root) return;
    root = el('div', 'na-backdrop'); root.id = 'note-admin-backdrop'; root.hidden = true;
    panel = el('section', 'na-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'note-admin-title');
    const header = el('header', 'na-head'); const title = el('div'); const h2 = el('h2', '', '오쭈다노트 관리자'); h2.id = 'note-admin-title';
    title.append(h2, el('p', '', '노트 콘텐츠와 운영을 독립적으로 관리합니다.'));
    closeButton = button('닫기', () => { if (!busy) close(); }); closeButton.classList.add('na-close'); header.append(title, closeButton);
    const layout = el('div', 'na-layout'); nav = el('nav', 'na-nav'); nav.setAttribute('aria-label', '노트 관리자 메뉴');
    for (const [id, label] of TABS) { const item = button(label, () => load(id)); item.dataset.adminTab = id; nav.append(item); }
    main = el('div', 'na-main'); main.id = 'note-admin-content'; main.setAttribute('role', 'region'); main.setAttribute('aria-label', '관리 내용');
    status = el('p', 'na-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    layout.append(nav, main); panel.append(header, layout, status); root.append(panel); document.body.append(root);
    root.addEventListener('keydown', event => {
      if (root.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) actionReturn ? load(actionReturn) : close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables(); const first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
  }
  function close() {
    instance++; pageRun++; busy = false; actionReturn = null;
    subscription?.unsubscribe(); subscription = null;
    if (!root || root.hidden) return;
    lockControls(false); root.hidden = true; main.replaceChildren(); setStatus('');
    for (const [element, prior] of inertState) if (element.isConnected) element.inert = prior;
    inertState = []; document.body.style.overflow = previousOverflow;
    const focus = previousFocus; previousFocus = null; userId = null; client = null; onChanged = null;
    filters.cards = { query: '', state: 'all', offset: 0 }; filters.users = { query: '', offset: 0 }; filters.reports.offset = 0; filters.actions.offset = 0;
    if (focus?.isConnected && !focus.closest('[inert]')) focus.focus({ preventScroll: true });
  }
  async function open(options = {}) {
    if (!options.client?.schema || !options.client?.auth) return;
    if (root && !root.hidden) { closeButton.focus(); return; }
    mount(); instance++; const run = instance;
    client = options.client; onChanged = options.onChanged; userId = null;
    previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
    inertState = [...document.body.children].filter(item => item !== root && item instanceof HTMLElement).map(item => [item, item.inert]);
    for (const [item] of inertState) item.inert = true;
    root.hidden = false; document.body.style.overflow = 'hidden';
    nav.hidden = true;
    main.replaceChildren(el('p', 'na-empty', '노트 운영 권한을 확인하고 있어요.')); setStatus(''); closeButton.focus();
    try {
      const { data, error } = await client.auth.getSession();
      if (!validInstance(run)) return;
      if (error) throw error;
      userId = data?.session?.user?.id;
      if (!userId) { main.replaceChildren(el('p', 'na-empty', '대문에서 로그인한 뒤 다시 열어 주세요.')); return; }
      const auth = client.auth.onAuthStateChange((_event, session) => {
        if (validInstance(run) && session?.user?.id !== userId) close();
      });
      subscription = auth?.data?.subscription || null;
      const allowed = await rpc('is_note_moderator');
      if (!validInstance(run)) return;
      if (allowed !== true) {
        nav.hidden = true; main.replaceChildren(el('p', 'na-empty', '노트 운영자로 지정된 계정만 사용할 수 있어요.')); return;
      }
      nav.hidden = false; filters.cards.offset = 0; filters.users.offset = 0; filters.actions.offset = 0; filters.reports.offset = 0;
      await load('overview');
    } catch (error) {
      if (!validInstance(run)) return;
      nav.hidden = true; main.replaceChildren(el('p', 'na-empty', '노트 운영 권한을 확인하지 못했어요.')); setStatus(friendlyError(error), true);
    }
  }
  window.OjjudaNoteAdmin = Object.freeze({ open, close });
})();

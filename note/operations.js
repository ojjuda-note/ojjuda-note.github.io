(() => {
  'use strict';

  const instances = new WeakMap();
  const REPORT_STATES = [['all', '전체'], ['open', '접수'], ['reviewed', '확인함'], ['actioned', '조치함'], ['resolved', '처리 완료']];
  const WORLD_KINDS = { guestbook: '방명록', chat: '동네 대화', user: '사람', media_comment: '사진 댓글', diary: '다이어리', intro: '소개글' };
  const REASONS = { abuse: '욕설·비방', sexual: '음란·불쾌', spam: '스팸·광고', impersonation: '사칭', other: '기타' };
  const FEEDBACK_KINDS = { bug: '고장', idea: '아이디어', other: '기타' };
  const STATUS_LABELS = Object.fromEntries(REPORT_STATES);
  const el = (tag, value, className = '') => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value ?? '');
    if (className) node.className = className;
    return node;
  };
  const button = (label, action, className = '') => {
    const node = el('button', label, `btn ${className}`.trim());
    node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const badge = (label, className = '') => el('span', label, `ops-badge ${className}`.trim());
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR') : '날짜 없음';
  const newest = (left, right) => (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0);
  const empty = (target, label) => target.append(el('p', label, 'ops-empty'));
  const errorText = label => `${label} 목록을 불러오지 못했어요. 권한이나 연결 상태를 확인하고 다시 시도해 주세요.`;
  const isPermissionError = error => ['42501', 'PGRST301', 'PGRST302'].includes(error?.code);

  async function rpc(client, schema, name, args = {}) {
    const endpoint = schema === 'public' ? client : client.schema(schema);
    const { data, error } = await endpoint.rpc(name, args);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('목록 응답을 확인하지 못했어요.');
    return data;
  }
  async function writeRpc(client, schema, name, args) {
    const endpoint = schema === 'public' ? client : client.schema(schema);
    const { data, error } = await endpoint.rpc(name, args);
    if (error) throw error;
    if (data?.ok === false) throw new Error('처리를 완료하지 못했어요.');
    return data;
  }

  // Every asynchronous view is tied to both the host route and its original account.
  async function scopeFor({ client, container, isCurrent = () => true }) {
    instances.get(container)?.destroy();
    let alive = true, subscription = null, userId = null, authVersion = 0;
    const scope = {
      current: () => alive && container.isConnected && isCurrent(),
      destroy() { alive = false; subscription?.unsubscribe(); subscription = null; },
      changedAccount() {
        if (scope.current()) container.replaceChildren(el('p', '계정이 바뀌었어요. 관리자 메뉴를 다시 열어 주세요.', 'ops-empty'));
        scope.destroy();
      }
    };
    instances.set(container, scope);
    container.classList.add('ojjuda-operations');
    container.replaceChildren(el('p', '관리자 화면을 불러오는 중이에요.', 'ops-empty'));
    try {
      const auth = client.auth.onAuthStateChange((_event, session) => {
        authVersion++;
        const next = session?.user?.id || null;
        if (userId !== null && next !== userId) scope.changedAccount();
        userId = next;
      });
      subscription = auth?.data?.subscription || null;
      const before = authVersion;
      const { data, error } = await client.auth.getSession();
      if (!scope.current()) { scope.destroy(); return null; }
      if (error) throw error;
      if (before === authVersion) userId = data?.session?.user?.id || null;
      if (!userId) {
        container.replaceChildren(el('p', '로그인한 뒤 관리자 메뉴를 다시 열어 주세요.', 'ops-empty'));
        scope.destroy(); return null;
      }
      return scope;
    } catch {
      if (scope.current()) container.replaceChildren(el('p', '로그인 상태를 확인하지 못했어요. 관리자 메뉴를 다시 열어 주세요.', 'ops-empty'));
      scope.destroy(); return null;
    }
  }

  function choices(target, values, selected, change, label) {
    const group = el('div', undefined, 'ops-filters');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    for (const [value, text] of values) {
      const item = button(text, () => change(value), value === selected ? 'pri' : '');
      item.setAttribute('aria-pressed', String(value === selected)); group.append(item);
    }
    target.append(group);
  }
  function warning(target, failures, retry) {
    if (!failures.length) return;
    const box = el('div', undefined, 'ops-warning'); box.setAttribute('role', 'status');
    for (const value of failures) box.append(el('p', errorText(value)));
    box.append(button('다시 불러오기', retry)); target.append(box);
  }
  function lock(root, busy) {
    root.setAttribute('aria-busy', String(busy));
    for (const control of root.querySelectorAll('button')) control.disabled = busy;
  }

  async function renderReports(options = {}) {
    const { client, container, worldActions = {}, openNoteCard, onChanged = () => {} } = options;
    if (!container || !client?.rpc || !client?.schema || !client?.auth) return;
    const scope = await scopeFor(options); if (!scope) return;
    let run = 0, loading = false, saving = false, source = 'all', status = 'all', rows = [], failures = [], resultText = '';
    const heading = el('div', undefined, 'ops-heading');
    heading.append(el('h3', '신고'), button('새로고침', () => void load()));
    const filters = el('div', undefined, 'ops-controls'), warnings = el('div'), summary = el('p', '', 'ops-summary');
    const list = el('div', undefined, 'ops-list'), message = el('p', '', 'ops-message');
    message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    container.replaceChildren(heading, el('p', '미니홈피는 상태별 최근 100건, 익명카드는 처리 중인 신고와 숨긴 카드를 함께 확인해요.', 'ops-help'), filters, warnings, summary, list, message);

    function render() {
      if (!scope.current()) return;
      filters.replaceChildren();
      choices(filters, [['all', '전체 서비스'], ['world', '미니홈피'], ['note', '익명카드']], source, value => { source = value; render(); }, '신고 서비스');
      choices(filters, REPORT_STATES, status, value => { status = value; render(); }, '신고 처리 상태');
      warnings.replaceChildren(); warning(warnings, failures, () => void load());
      const visible = rows.filter(row => (source === 'all' || source === row.source) && (status === 'all' || status === row.state));
      summary.textContent = loading ? '신고를 불러오는 중이에요.' : `불러온 신고 ${rows.length.toLocaleString()}건 · 현재 ${visible.length.toLocaleString()}건${failures.length ? ' · 일부 목록 확인 필요' : ''}`;
      list.replaceChildren();
      if (!loading && !visible.length) empty(list, failures.length ? '불러온 목록에는 해당 신고가 없어요. 위의 조회 오류도 확인해 주세요.' : '해당하는 신고가 없어요.');
      for (const row of visible) list.append(reportRow(row));
      message.textContent = resultText; lock(container, saving || loading);
    }

    function reportRow(row) {
      const item = el('article', undefined, 'adm-card ops-card'); item.dataset.operationId = row.key;
      const value = row.value, meta = el('div', undefined, 'ops-meta');
      meta.append(badge(row.source === 'world' ? '미니홈피' : '익명카드', row.source), badge(row.source === 'world' ? WORLD_KINDS[value.kind] || value.kind || '콘텐츠' : '카드·답글'), badge(STATUS_LABELS[row.state] || row.state), el('time', date(row.created_at)));
      if (row.source === 'note') meta.append(badge(value.hidden ? '개별 숨김' : '개별 숨김 없음'));
      item.append(meta);
      if (row.source === 'world') {
        item.append(el('p', `${value.reporter_nick || '알 수 없음'} → ${value.target_nick || '알 수 없음'}`, 'ops-people'));
        if (value.content) item.append(el('blockquote', value.content, 'ops-content'));
        item.append(el('p', `신고 사유: ${REASONS[value.reason] || value.reason || '기타'}`, 'ops-reason'));
        if (value.detail) item.append(el('p', value.detail, 'ops-content'));
      } else {
        item.append(el('blockquote', value.body || '삭제된 카드', 'ops-content'), el('p', `신고 사유: ${value.reason || '내용 확인'}`, 'ops-reason'));
      }
      const actions = el('div', undefined, 'ops-actions');
      if (row.source === 'world') {
        if (typeof worldActions.setReport === 'function') {
          if (row.state !== 'reviewed') actions.append(button('확인함', () => void mutate('이 신고를 확인함으로 표시할까요?', () => worldActions.setReport(value.id, 'reviewed'), '확인함으로 표시했어요.')));
          if (row.state !== 'actioned') actions.append(button('조치함', () => void mutate('이 신고를 조치함으로 표시할까요?', () => worldActions.setReport(value.id, 'actioned'), '조치함으로 표시했어요.')));
        }
        if (typeof worldActions.deleteContent === 'function' && ['guestbook', 'chat', 'media_comment'].includes(value.kind) && value.target_id) {
          actions.append(button('글 삭제', () => void mutate('신고된 글을 삭제할까요?', () => worldActions.deleteContent(value.kind, value.target_id, value.target_user || null), '글 삭제를 처리했어요.'), 'danger'));
        }
        if (typeof worldActions.ban === 'function' && value.target_user) {
          const banned = Date.parse(value.target_banned_until) > Date.now();
          if (banned) meta.append(badge(`이용 정지 · ${date(value.target_banned_until)}까지`));
          actions.append(button(banned ? '정지 해제' : '7일 정지', () => void mutate(banned ? '이 이용자의 월드 이용 정지를 해제할까요?' : '이 이용자의 월드 활동을 7일 동안 정지할까요?', () => worldActions.ban(value.target_user, banned ? 0 : 7), banned ? '정지를 해제했어요.' : '7일 정지했어요.'), banned ? '' : 'danger'));
        }
      } else {
        if (value.card_id && typeof openNoteCard === 'function') actions.append(button(value.hidden ? '카드 복구' : '카드 숨김', () => { if (scope.current() && !saving) openNoteCard(value.card_id, value); }));
        if (value.report_id && row.state !== 'resolved') actions.append(button('처리 완료', () => void mutate('이 신고를 처리 완료로 표시할까요? 카드 공개 여부는 바뀌지 않아요.', () => writeRpc(client, 'ojjuda_note', 'resolve_report', { p_report_id: value.report_id }), '신고를 처리 완료로 표시했어요.'), 'pri'));
      }
      item.append(actions); return item;
    }

    async function mutate(question, action, success) {
      if (!scope.current() || loading || saving || !window.confirm(question)) return;
      saving = true; resultText = '처리 중이에요.'; render();
      let committed = false;
      try {
        await action(); committed = true;
        if (!scope.current()) return;
        resultText = success;
        try { await onChanged(); } catch { /* A host refresh must not turn a saved action into a save error. */ }
      } catch (error) {
        if (scope.current()) resultText = isPermissionError(error) ? '관리자 권한이 없어 처리하지 못했어요.' : '처리하지 못했어요. 다시 시도해 주세요.';
      } finally {
        saving = false;
        if (scope.current()) { if (committed) await load(); else render(); }
      }
    }

    async function load() {
      if (!scope.current() || loading || saving) return;
      const epoch = ++run; loading = true; render();
      const requests = [
        ['미니홈피 접수 신고', 'world', 'open', () => rpc(client, 'public', 'admin_reports', { st: 'open' })],
        ['미니홈피 확인한 신고', 'world', 'reviewed', () => rpc(client, 'public', 'admin_reports', { st: 'reviewed' })],
        ['미니홈피 조치한 신고', 'world', 'actioned', () => rpc(client, 'public', 'admin_reports', { st: 'actioned' })],
        ['익명카드 신고', 'note', null, () => rpc(client, 'ojjuda_note', 'moderation_queue')]
      ];
      const results = await Promise.allSettled(requests.map(request => request[3]()));
      if (!scope.current() || epoch !== run) return;
      const merged = new Map(); failures = [];
      results.forEach((result, index) => {
        const [label, origin, state] = requests[index];
        if (result.status === 'rejected') { failures.push(label); return; }
        for (const value of result.value) {
          if (!value || typeof value !== 'object') continue;
          const id = origin === 'world' ? value.id : value.report_id || (value.card_id && `card:${value.card_id}`);
          if (id === null || id === undefined || id === '') continue;
          const key = `${origin}:${id}`;
          merged.set(key, { key, source: origin, state: origin === 'world' ? value.status || state : value.status === 'resolved' ? 'resolved' : 'open', created_at: value.created_at, value });
        }
      });
      rows = [...merged.values()].sort(newest); loading = false; render();
    }
    await load(); return { refresh: load, destroy: scope.destroy };
  }

  async function renderSupport(options = {}) {
    const { client, container, onChanged = () => {} } = options;
    if (!container || !client?.rpc || !client?.schema || !client?.auth) return;
    const scope = await scopeFor(options); if (!scope) return;
    let run = 0, loading = false, saving = false, status = 'open', rows = [], failures = [], resultText = '';
    const inquiries = el('section', undefined, 'ops-section');
    inquiries.append(el('h3', '문의·답변'), el('p', '미니홈피와 익명카드에서 접수한 문의에 답변해요.', 'ops-help'));
    const inquiryBody = el('div', undefined, 'ops-inquiries'); inquiries.append(inquiryBody);
    const feedback = el('section', undefined, 'ops-section'), heading = el('div', undefined, 'ops-heading');
    heading.append(el('h3', '의견'), button('새로고침', () => void load()));
    const filters = el('div'), warnings = el('div'), summary = el('p', '', 'ops-summary'), list = el('div', undefined, 'ops-list'), message = el('p', '', 'ops-message');
    message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    feedback.append(heading, el('p', '고장 제보와 제안을 상태별 최근 100건씩 확인해요. 이전 접수 내용도 유지돼요.', 'ops-help'), filters, warnings, summary, list, message);
    container.replaceChildren(inquiries, feedback);

    async function loadInquiries() {
      if (!scope.current()) return;
      if (!window.OjjudaNoteSupport?.renderAdmin) {
        inquiryBody.replaceChildren(el('p', '문의 관리 화면을 불러오지 못했어요.', 'ops-empty'), button('다시 불러오기', () => void loadInquiries())); return;
      }
      try {
        await window.OjjudaNoteSupport.renderAdmin({ client, container: inquiryBody, onChanged, isCurrent: scope.current });
      } catch {
        if (scope.current()) inquiryBody.replaceChildren(el('p', errorText('문의'), 'ops-empty'), button('다시 불러오기', () => void loadInquiries()));
      }
    }

    function render() {
      if (!scope.current()) return;
      filters.replaceChildren(); choices(filters, [['open', '새 의견'], ['done', '확인함'], ['all', '전체']], status, value => { status = value; render(); }, '의견 처리 상태');
      warnings.replaceChildren(); warning(warnings, failures, () => void load());
      const visible = rows.filter(item => status === 'all' || item.status === status);
      summary.textContent = loading ? '의견을 불러오는 중이에요.' : `현재 ${visible.length.toLocaleString()}건${failures.length ? ' · 일부 목록 확인 필요' : ''}`;
      list.replaceChildren();
      if (!loading && !visible.length) empty(list, failures.length ? '불러온 목록에는 해당 의견이 없어요. 위의 조회 오류도 확인해 주세요.' : '해당하는 의견이 없어요.');
      for (const value of visible) {
        const item = el('article', undefined, 'adm-card ops-card'); item.dataset.operationId = `feedback:${value.id}`;
        const meta = el('div', undefined, 'ops-meta');
        meta.append(badge(FEEDBACK_KINDS[value.kind] || value.kind || '기타'), badge(value.status === 'done' ? '확인함' : '새 의견'), el('strong', value.nickname || '알 수 없음'), el('time', date(value.created_at)));
        item.append(meta, el('p', value.body, 'ops-content'));
        if (value.screen || value.app_version) item.append(el('p', [value.screen, value.app_version].filter(Boolean).join(' · '), 'ops-help'));
        if (value.user_agent) {
          const details = el('details', undefined, 'ops-device'); details.append(el('summary', '기기 정보'), el('p', value.user_agent, 'ops-help')); item.append(details);
        }
        const actions = el('div', undefined, 'ops-actions'), next = value.status === 'done' ? 'open' : 'done';
        actions.append(button(next === 'done' ? '확인함' : '다시 열기', () => void update(value.id, next)));
        item.append(actions); list.append(item);
      }
      message.textContent = resultText; lock(feedback, saving || loading);
    }

    async function update(id, next) {
      if (!scope.current() || saving || loading || !window.confirm(next === 'done' ? '이 의견을 확인함으로 표시할까요?' : '이 의견을 다시 열까요?')) return;
      saving = true; resultText = '처리 중이에요.'; render(); let committed = false;
      try {
        await writeRpc(client, 'public', 'admin_set_feedback', { feedback_id: id, st: next }); committed = true;
        if (!scope.current()) return;
        resultText = next === 'done' ? '확인함으로 표시했어요.' : '의견을 다시 열었어요.';
        try { await onChanged(); } catch { /* The status has already been saved. */ }
      } catch (error) {
        if (scope.current()) resultText = isPermissionError(error) ? '관리자 권한이 없어 처리하지 못했어요.' : '처리하지 못했어요. 다시 시도해 주세요.';
      } finally {
        saving = false;
        if (scope.current()) { if (committed) await load(); else render(); }
      }
    }

    async function load() {
      if (!scope.current() || loading || saving) return;
      const epoch = ++run; loading = true; render();
      const states = ['open', 'done'];
      const results = await Promise.allSettled(states.map(st => rpc(client, 'public', 'admin_feedback', { st })));
      if (!scope.current() || epoch !== run) return;
      const merged = new Map(); failures = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') { failures.push(index ? '확인한 의견' : '새 의견'); return; }
        for (const value of result.value) if (value && value.id !== null && value.id !== undefined) merged.set(`feedback:${value.id}`, { ...value, status: value.status || states[index] });
      });
      rows = [...merged.values()].sort(newest); loading = false; render();
    }
    await Promise.allSettled([loadInquiries(), load()]);
    return { refresh: async () => { await Promise.allSettled([loadInquiries(), load()]); }, destroy: scope.destroy };
  }

  window.OjjudaOperations = { renderReports, renderSupport };
})();

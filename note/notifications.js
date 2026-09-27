(() => {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COPY = Object.freeze({ reply: '내 카드에 새 답글이 달렸어요.', like: '내 카드에 좋아요가 도착했어요.', inquiry_reply: '내 문의에 답변이 도착했어요.' });
  const el = (tag, text, cls) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (cls) item.className = cls; return item; };
  const button = (text, action, cls = 'button') => { const item = el('button', text, cls); item.type = 'button'; item.addEventListener('click', action); return item; };
  let instance;

  function install({ client, getUserId = () => null, onOpenCard, onOpenInquiry, onKeepCard } = {}) {
    if (instance || !client?.schema || !client?.auth) return instance;
    let identity = getUserId() || null, identityRun = 0, viewRun = 0, listRun = 0, countRun = 0;
    let items = [], retentionItems = [], cursor = null, snapshotAt = null, hasMore = false;
    let notificationUnread = 0, retentionUnread = 0, unread = 0, loading = false, saving = false, loadError = '';
    let countRequest = null, lastRefresh = 0, priorFocus = null, priorOverflow = '', inertState = [];
    const trigger = button('알림', () => open(), 'button nn-trigger'); trigger.id = 'note-notifications';
    const badge = el('span', '', 'nn-badge'); badge.id = 'note-notification-badge'; badge.hidden = true; badge.setAttribute('aria-hidden', 'true'); trigger.append(badge);
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'note-notification-dialog');
    const layer = el('div', undefined, 'nn-backdrop'); layer.id = 'note-notification-backdrop'; layer.hidden = true;
    const panel = el('section', undefined, 'nn-dialog'); panel.id = 'note-notification-dialog'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'note-notification-title'); panel.tabIndex = -1;
    const heading = el('header', undefined, 'nn-heading'), title = el('h2', '알림'); title.id = 'note-notification-title';
    const closeButton = button('닫기', close); heading.append(title, closeButton);
    const toolbar = el('div', undefined, 'nn-toolbar'), summary = el('p', '', 'nn-summary');
    const readAll = button('모두 읽음', () => void markRead(null)); readAll.id = 'note-notifications-read-all'; toolbar.append(summary, readAll);
    const body = el('div', undefined, 'nn-body'), rows = el('ul', undefined, 'nn-list'); rows.id = 'note-notification-list'; rows.setAttribute('aria-label', '내 알림');
    const footer = el('div', undefined, 'nn-pagination');
    const status = el('p', '', 'nn-status'); status.id = 'note-notification-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    body.append(rows, footer); panel.append(heading, toolbar, body, status); layer.append(panel); document.body.append(layer);
    document.querySelector('.note-tools')?.append(trigger);

    async function rpc(name, args = {}) { const { data, error } = await client.schema('ojjuda_note').rpc(name, args); if (error) throw error; return data; }
    const userNow = () => getUserId() || null;
    const current = (run, user) => run === identityRun && user === identity && user === userNow();
    const currentView = (run, user, view) => current(run, user) && view === viewRun && !layer.hidden;
    const focusables = () => [...panel.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(item => !item.hidden && item.getClientRects().length);
    function keepFocus() {
      if (layer.hidden) return;
      const active = document.activeElement;
      if (!panel.contains(active) || active?.disabled || !active?.getClientRects().length) closeButton.focus({ preventScroll: true });
    }
    function setUnread(notifications = notificationUnread, retention = retentionUnread) {
      notificationUnread = Math.max(0, Number.isFinite(Number(notifications)) ? Math.floor(Number(notifications)) : 0);
      retentionUnread = Math.max(0, Number.isFinite(Number(retention)) ? Math.floor(Number(retention)) : 0);
      unread = notificationUnread + retentionUnread;
      toolbar.hidden = !identity;
      badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = unread === 0;
      trigger.setAttribute('aria-label', unread ? `알림, 읽지 않은 알림 ${unread}개` : '알림');
      summary.textContent = unread ? `읽지 않은 알림 ${unread}개` : '새 알림이 없어요.';
      updateControls();
    }
    function updateControls() {
      readAll.disabled = !identity || !unread || loading || saving || (!snapshotAt && !retentionItems.some(item => !item.read_at));
      for (const control of rows.querySelectorAll('button')) control.disabled = loading || saving;
      for (const control of footer.querySelectorAll('button')) control.disabled = loading || saving;
      rows.setAttribute('aria-busy', String(loading || saving));
    }
    function clearView() {
      viewRun++; listRun++; loading = false; saving = false; items = []; retentionItems = [];
      cursor = null; snapshotAt = null; hasMore = false; loadError = '';
      rows.replaceChildren(); footer.replaceChildren(); status.textContent = ''; updateControls();
    }
    function close() {
      clearView();
      if (layer.hidden) return;
      layer.hidden = true; trigger.setAttribute('aria-expanded', 'false');
      for (const [item, wasInert] of inertState) if (item.isConnected) item.inert = wasInert;
      inertState = []; document.body.style.overflow = priorOverflow;
      const focus = priorFocus; priorFocus = null;
      if (focus?.isConnected && !focus.closest('[inert]') && focus.getClientRects().length) focus.focus({ preventScroll: true });
    }
    function changeIdentity(next) {
      if (next === identity) return false;
      identityRun++; countRun++; countRequest = null; lastRefresh = 0; close(); identity = next; setUnread(0, 0);
      return true;
    }
    function showEmpty(text) { const row = el('li', text, 'nn-empty'); rows.replaceChildren(row); }
    const retentionCount = values => values.filter(item => !item.read_at).length;
    const validRetention = item => item && UUID.test(item.id || '') && UUID.test(item.card_id || '')
      && Number.isFinite(Date.parse(item.created_at)) && Number.isFinite(Date.parse(item.archive_due_at));
    const noticeItems = () => [...items, ...retentionItems].sort((a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) || String(b.id).localeCompare(String(a.id)));
    function rowFor(item) {
      const row = el('li', undefined, `nn-item${item.read_at ? '' : ' nn-unread'}`); row.dataset.notificationId = item.id;
      const retention = item.kind === 'retention';
      const text = el('p', retention
        ? item.reason === 'parent_due' ? '상위 카드와 함께 공개 종료 예정이에요.' : '내 카드가 곧 공개 종료돼요.'
        : COPY[item.kind], 'nn-copy');
      const meta = el('div', undefined, 'nn-meta'), state = el('span', item.read_at ? '읽음' : '안 읽음');
      const time = el('time'); const created = new Date(item.created_at);
      if (Number.isFinite(created.getTime())) { time.dateTime = created.toISOString(); time.textContent = created.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
      meta.append(state, time);
      if (retention) {
        const due = new Date(item.archive_due_at);
        meta.append(el('span', `공개 종료 ${due.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`));
        row.append(text, el('p', (item.body || '내용 없는 카드').slice(0, 100), 'nn-retention-preview'));
      } else row.append(text);
      const actions = el('div', undefined, 'nn-actions');
      const target = item.kind === 'inquiry_reply' ? item.inquiry_id : item.card_id;
      const action = item.kind === 'inquiry_reply' ? onOpenInquiry : onOpenCard;
      if (UUID.test(target || '') && typeof action === 'function') {
        const openButton = button(item.kind === 'inquiry_reply' ? '답변 보기' : '카드 보기', () => void openItem(item)); openButton.dataset.notificationOpen = item.id; actions.append(openButton);
      }
      if (retention && typeof onKeepCard === 'function') actions.append(button('10쭈로 영구보관', () => void keepCard(item)));
      if (!item.read_at) { const readButton = button('읽음 표시', () => void (retention ? markRetentionRead(item) : markRead([item.id]))); readButton.dataset.notificationRead = item.id; actions.append(readButton); }
      row.append(meta, actions); return row;
    }
    function render() {
      const focusId = document.activeElement?.closest('[data-notification-id]')?.dataset.notificationId;
      const visible = noticeItems();
      rows.replaceChildren(...visible.map(rowFor));
      if (!visible.length) showEmpty('아직 받은 알림이 없어요.');
      footer.replaceChildren();
      if (hasMore && cursor) { const more = button('알림 더 보기', () => void loadPage(true)); more.id = 'note-notifications-more'; footer.append(more); }
      if (loadError) footer.append(button('다시 시도', () => void loadPage()));
      updateControls();
      if (focusId) rows.querySelector(`[data-notification-id="${focusId}"] button`)?.focus({ preventScroll: true });
      keepFocus();
    }
    async function loadPage(more = false) {
      if (loading || saving || layer.hidden || !identity || identity !== userNow()) return;
      const run = identityRun, user = identity, view = viewRun, request = ++listRun;
      const after = more ? cursor : null;
      loading = true; countRun++; status.textContent = '알림을 불러오는 중이에요.';
      updateControls(); keepFocus();
      const requests = [rpc('list_notifications', { p_limit: 30,
        p_before_created_at: after?.created_at || null, p_before_id: after?.id || null })];
      if (!more) requests.push(rpc('list_retention_alerts'));
      const results = await Promise.allSettled(requests);
      if (!currentView(run, user, view) || request !== listRun) return;
      const normal = results[0], retention = results[1];
      let generalOk = false, retentionOk = more;
      if (normal.status === 'fulfilled' && normal.value && Array.isArray(normal.value.items)) {
        const data = normal.value;
        const incoming = data.items.filter(item => item && UUID.test(item.id || '') && Object.hasOwn(COPY, item.kind) && Number.isFinite(Date.parse(item.created_at)));
        const merged = new Map((more ? items : []).map(item => [item.id, item]));
        for (const item of incoming) merged.set(item.id, item);
        items = [...merged.values()];
        if (!more) snapshotAt = Number.isFinite(Date.parse(data.as_of)) ? data.as_of : null;
        cursor = data.next_cursor && UUID.test(data.next_cursor.id || '') && Number.isFinite(Date.parse(data.next_cursor.created_at)) ? data.next_cursor : null;
        hasMore = Boolean(data.has_more && cursor);
        setUnread(data.unread_count); generalOk = true;
      }
      if (!more && retention.status === 'fulfilled' && Array.isArray(retention.value)) {
        retentionItems = retention.value.filter(validRetention).map(item => ({ ...item, originalKind: item.kind, kind: 'retention' }));
        setUnread(notificationUnread, retentionCount(retentionItems)); retentionOk = true;
      }
      loading = false;
      loadError = !generalOk && !retentionOk ? '알림을 불러오지 못했어요.'
        : !generalOk ? '일반 알림을 불러오지 못했어요.'
          : !retentionOk ? '삭제 예정 카드 목록을 불러오지 못했어요.' : '';
      status.textContent = loadError ? `${loadError} 다시 시도해 주세요.` : '';
      if (generalOk || retentionOk) lastRefresh = Date.now();
      render(); return !loadError;
    }
    async function refreshCount(force = false) {
      const user = identity, run = identityRun;
      if (!user || user !== userNow() || document.visibilityState === 'hidden') return;
      if (countRequest?.user === user && countRequest.run === run) return countRequest.promise;
      if (!force && Date.now() - lastRefresh < 15000) return;
      const request = ++countRun, holder = { user, run, promise: null }; countRequest = holder;
      holder.promise = (async () => {
        try {
          const [normal, retention] = await Promise.allSettled([
            rpc('notification_unread_count'), rpc('list_retention_alerts')
          ]);
          if (current(run, user) && request === countRun) {
            if (normal.status === 'fulfilled') setUnread(normal.value);
            if (retention.status === 'fulfilled' && Array.isArray(retention.value)) {
              setUnread(notificationUnread, retentionCount(retention.value.filter(validRetention)));
            }
            if (normal.status === 'fulfilled' || retention.status === 'fulfilled') lastRefresh = Date.now();
          }
        }
        finally { if (countRequest === holder) countRequest = null; }
      })();
      return holder.promise;
    }
    async function markRead(ids) {
      if (saving || loading || !identity || layer.hidden || identity !== userNow()) return;
      const expected = ids ? items.find(item => item.id === ids[0])?.created_at : null;
      const pendingRetention = ids ? [] : retentionItems.filter(item => !item.read_at);
      if (ids ? !expected : !snapshotAt && !pendingRetention.length) return;
      const run = identityRun, user = identity, view = viewRun;
      saving = true; countRun++; status.textContent = '읽음으로 표시하는 중이에요.'; updateControls(); keepFocus();
      const requests = [];
      if (ids || snapshotAt) requests.push(rpc('mark_notifications_read', {
        p_ids: ids, p_expected_created_at: expected, p_before: ids ? null : snapshotAt }));
      for (const item of pendingRetention) requests.push(rpc('mark_retention_alert_read', { p_id: item.id }));
      const results = await Promise.allSettled(requests);
      if (!currentView(run, user, view)) return;
      saving = false; updateControls();
      const failed = results.some(result => result.status === 'rejected');
      const refreshed = await loadPage();
      if (!currentView(run, user, view)) return;
      status.textContent = failed ? '일부 알림을 읽음으로 표시하지 못했어요. 다시 시도해 주세요.'
        : refreshed ? ids ? '읽음으로 표시했어요.' : '모두 읽음으로 표시했어요.'
          : '읽음 표시는 저장됐지만 목록을 다시 불러오지 못했어요. 다시 시도해 주세요.';
      if (!refreshed) { countRequest = null; void refreshCount(true); }
    }
    async function markRetentionRead(item) {
      if (saving || loading || !identity || layer.hidden || identity !== userNow() || !retentionItems.some(value => value.id === item.id)) return;
      const run = identityRun, user = identity, view = viewRun;
      saving = true; status.textContent = '읽음으로 표시하는 중이에요.'; updateControls(); keepFocus();
      let failed = false;
      try { await rpc('mark_retention_alert_read', { p_id: item.id }); }
      catch { failed = true; }
      if (!currentView(run, user, view)) return;
      saving = false;
      if (failed) { status.textContent = '읽음 표시를 저장하지 못했어요. 다시 눌러 주세요.'; updateControls(); return; }
      const refreshed = await loadPage();
      if (currentView(run, user, view)) status.textContent = refreshed ? '읽음으로 표시했어요.' : '목록을 다시 불러오지 못했어요.';
    }
    function markSeenOnNavigate(item) {
      if (item.read_at) return;
      const run = identityRun, user = identity;
      const request = item.kind === 'retention'
        ? rpc('mark_retention_alert_read', { p_id: item.id })
        : rpc('mark_notifications_read', { p_ids: [item.id], p_expected_created_at: item.created_at, p_before: null });
      void request.catch(() => { /* Opening the target does not depend on this write. */ }).finally(() => {
        if (current(run, user)) { countRequest = null; lastRefresh = 0; void refreshCount(true); }
      });
    }
    function navigate(item, run, user, view) {
      if (!currentView(run, user, view)) return;
      const target = item.kind === 'inquiry_reply' ? item.inquiry_id : item.card_id;
      const action = item.kind === 'inquiry_reply' ? onOpenInquiry : onOpenCard;
      if (!UUID.test(target || '') || typeof action !== 'function') return;
      close();
      // The host rechecks the card or inquiry visibility before rendering its contents.
      action(target);
    }
    async function openItem(item) {
      if (saving || loading || !noticeItems().some(value => value.id === item.id && value.kind === item.kind)) return;
      markSeenOnNavigate(item);
      navigate(item, identityRun, identity, viewRun);
    }
    function keepCard(item) {
      if (saving || loading || item.kind !== 'retention' || !retentionItems.some(value => value.id === item.id)
        || typeof onKeepCard !== 'function') return;
      markSeenOnNavigate(item);
      const target = item.card_id, kind = item.originalKind;
      close(); onKeepCard(target, kind);
    }
    function open() {
      changeIdentity(userNow());
      if (!layer.hidden) { closeButton.focus({ preventScroll: true }); return; }
      priorFocus = document.activeElement; priorOverflow = document.body.style.overflow;
      inertState = [...document.body.children].filter(item => item !== layer && item instanceof HTMLElement).map(item => [item, item.inert]);
      for (const [item] of inertState) item.inert = true;
      layer.hidden = false; trigger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; closeButton.focus({ preventScroll: true });
      if (!identity) { showEmpty('대문에서 로그인하면 내 알림을 확인할 수 있어요.'); updateControls(); return; }
      void loadPage();
    }
    async function refresh(options = {}) {
      changeIdentity(userNow());
      if (!identity || document.visibilityState === 'hidden') return;
      const force = options.force !== false;
      if (!force && Date.now() - lastRefresh < 15000) return;
      if (!layer.hidden) return loadPage();
      return refreshCount(force);
    }
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const controls = focusables(), first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('focus', () => void refresh({ force: false }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh({ force: false }); });
    client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id || null;
      const changed = changeIdentity(next);
      if (changed || !lastRefresh) {
        const run = identityRun;
        // Supabase auth callbacks must return before issuing another client request.
        setTimeout(() => { if (run === identityRun && next === userNow()) void refresh(); }, 0);
      }
    });
    setUnread(0); trigger.setAttribute('aria-expanded', 'false');
    instance = Object.freeze({ open, close, refresh });
    setTimeout(() => void refresh(), 0);
    return instance;
  }
  window.OjjudaNoteNotifications = Object.freeze({ install });
})();

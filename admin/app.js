/* The database enforces every admin action. This page only routes verified roles. */
(() => {
  'use strict';
  // The World landing file can move without changing the admin links elsewhere.
  const WORLD_URL = '/world.html';
  const config = window.OJJUDA_CONFIG;
  const status = document.getElementById('status');
  const content = document.getElementById('admin-content');
  const authRequired = document.getElementById('auth-required');
  const noPermission = document.getElementById('no-permission');
  const noteButton = document.getElementById('open-note-admin');
  const worldSections = ['account', 'payment', 'world'].map(id => document.getElementById(id));
  const noteSection = document.getElementById('note');
  let client = null;
  let checkRun = 0;

  for (const link of document.querySelectorAll('[data-world-link]')) {
    const tab = link.dataset.worldAdmin;
    link.href = tab ? `${WORLD_URL}?admin=${encodeURIComponent(tab)}` : WORLD_URL;
  }

  function show(message, panel = null) {
    status.textContent = message;
    status.hidden = !message;
    content.hidden = panel !== 'content';
    authRequired.hidden = panel !== 'auth';
    noPermission.hidden = panel !== 'no-permission';
  }
  function lock(section, allowed, message) {
    section.dataset.locked = String(!allowed);
    const hint = section.querySelector('.hint');
    if (hint) {
      if (!hint.dataset.defaultHtml) hint.dataset.defaultHtml = hint.innerHTML;
      hint.innerHTML = allowed ? hint.dataset.defaultHtml : '';
      if (!allowed) hint.textContent = message;
    }
    for (const control of section.querySelectorAll('a.action, button.action')) {
      if (control.tagName === 'A') {
        if (!control.dataset.allowedHref && control.hasAttribute('href')) control.dataset.allowedHref = control.href;
        if (allowed) { control.href = control.dataset.allowedHref; control.removeAttribute('aria-disabled'); control.tabIndex = 0; }
        else { control.dataset.allowedHref ||= control.href; control.removeAttribute('href'); control.setAttribute('aria-disabled', 'true'); control.tabIndex = -1; }
      } else control.disabled = !allowed;
    }
  }
  function metric(id, value) {
    const item = document.getElementById(id);
    item.hidden = !value;
    if (value) item.textContent = value;
  }
  async function refresh() {
    const run = ++checkRun;
    for (const id of ['account-metric', 'world-metric', 'note-metric']) metric(id, '');
    if (!client) { show('연결 설정을 확인해 주세요.'); return; }
    show('계정과 운영 권한을 확인하고 있어요.');
    try {
      const { data, error } = await client.auth.getUser();
      if (run !== checkRun) return;
      if (error || !data?.user) { show('', 'auth'); return; }
      const [world, note] = await Promise.allSettled([
        client.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle(),
        client.schema('ojjuda_note').rpc('is_note_moderator')
      ]);
      if (run !== checkRun) return;
      const worldOk = world.status === 'fulfilled' && !world.value.error && !!world.value.data;
      const noteOk = note.status === 'fulfilled' && !note.value.error && note.value.data === true;
      const checkFailed = world.status === 'rejected' || note.status === 'rejected' || world.value?.error || note.value?.error;
      if (!worldOk && !noteOk && checkFailed) { show('운영 권한을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.'); return; }
      if (!worldOk && !noteOk) { show('', 'no-permission'); return; }
      for (const section of worldSections) lock(section, worldOk, '월드 관리자 권한이 필요해요.');
      lock(noteSection, noteOk, '노트 운영자 권한이 필요해요.');
      noteButton.disabled = !noteOk;
      show(checkFailed ? '일부 운영 권한을 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.' : '', 'content');
      // Overview RPCs enforce their own role checks and return only aggregate figures here.
      if (worldOk) client.rpc('admin_overview').then(({ data: overview, error: err }) => {
        if (run !== checkRun || err || !overview) return;
        if (Number.isFinite(Number(overview.users))) metric('account-metric', `전체 가입자 ${Number(overview.users).toLocaleString('ko-KR')}명`);
        if (Number.isFinite(Number(overview.reports_open))) metric('world-metric', `처리 안 한 신고 ${Number(overview.reports_open).toLocaleString('ko-KR')}건`);
      }).catch(() => {});
      if (noteOk) client.schema('ojjuda_note').rpc('admin_overview').then(({ data: overview, error: err }) => {
        if (run !== checkRun || err || !overview) return;
        if (Number.isFinite(Number(overview.total_cards))) metric('note-metric', `전체 카드 ${Number(overview.total_cards).toLocaleString('ko-KR')}장`);
      }).catch(() => {});
    } catch {
      if (run === checkRun) show('계정 상태를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.');
    }
  }

  noteButton.addEventListener('click', () => {
    if (!client || noteButton.disabled) return;
    window.OjjudaNoteAdmin?.open({ client });
  });
  if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient) {
    show('서비스 연결 설정을 확인해 주세요.');
    return;
  }
  client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
  client.auth.onAuthStateChange(() => { setTimeout(refresh, 0); });
  refresh();
})();

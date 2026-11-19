/* Separate admin tools return to the admin dashboard, including browser Back. */
(() => {
  'use strict';
  let service = '';
  try { service = new URL(location.href).searchParams.get('from'); } catch {}
  const home = '/world.html?admin=overview' + (['park','pajang'].includes(service) ? '&from=' + service : '');
  if (typeof document !== 'undefined') document.querySelectorAll('a[href="/world.html?admin=overview"]').forEach(link => { link.href = home; });
  const guard = 'ojjudaAdminSectionBack';
  try {
    if (!history.state?.[guard]) history.pushState({ ...(history.state || {}), [guard]: true }, '', location.href);
  } catch (error) {
    console.warn('관리 화면 뒤로가기를 준비하지 못했어요.', error);
  }
  window.addEventListener('popstate', () => location.replace(home));
})();

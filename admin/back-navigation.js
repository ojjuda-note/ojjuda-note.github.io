/* Separate admin tools return to the admin dashboard, including browser Back. */
(() => {
  'use strict';
  const home = '/world.html?admin=overview';
  const guard = 'ojjudaAdminSectionBack';
  try {
    if (!history.state?.[guard]) history.pushState({ ...(history.state || {}), [guard]: true }, '', location.href);
  } catch (error) {
    console.warn('관리 화면 뒤로가기를 준비하지 못했어요.', error);
  }
  window.addEventListener('popstate', () => location.replace(home));
})();

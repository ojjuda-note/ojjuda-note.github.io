/* Reward registration is a separate page; its Back returns to the admin dashboard. */
(() => {
  'use strict';
  const home = '/world.html?admin=overview';
  const guard = 'ojjudaAdminRewardBack';
  try {
    if (!history.state?.[guard]) history.pushState({ ...(history.state || {}), [guard]: true }, '', location.href);
  } catch (error) {
    console.warn('상품권 화면 뒤로가기를 준비하지 못했어요.', error);
  }
  window.addEventListener('popstate', () => location.replace(home));
})();

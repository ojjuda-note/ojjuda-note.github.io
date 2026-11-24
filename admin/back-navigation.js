/* Compatibility loader for previously cached admin entry pages. */
(() => {
  'use strict';
  if (window.OjjudaSectionNavigation) return;
  const script = document.createElement('script');
  script.src = '/shared/navigation/section-back.js?v=20261124-service-return1';
  script.dataset.returnTo = 'admin';
  document.head.append(script);
})();

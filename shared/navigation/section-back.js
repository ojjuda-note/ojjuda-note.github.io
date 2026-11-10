/* Browser Back from standalone pages returns to their owning Agit section. */
(() => {
  'use strict';
  if (window !== window.top) return; // The World shell owns Back for embedded pages.

  const script = document.currentScript;
  const from = new URLSearchParams(location.search).get('from');
  const destinations = {
    hub: '/world.html?tab=hub',
    arcade: '/world.html?tab=hub',
    park: '/world.html?tab=park',
    my: '/world.html?tab=my',
    admin: '/world.html?admin=overview'
  };
  const section = Object.hasOwn(destinations, from) ? from : script?.dataset.returnTo;
  const destination = destinations[section] || destinations.hub;
  const labels = { hub: '아지트로', arcade: '아지트로', park: '공원으로', my: '설정으로', admin: '관리자 모드로' };
  const returnLink = document.querySelector('[data-section-return]');
  if (returnLink) {
    returnLink.href = destination;
    const label = returnLink.querySelector('[data-section-return-label]');
    if (label) label.textContent = `${labels[section] || labels.hub} 돌아가기`;
  }
  const marker = 'ojjudaSectionBack';
  try {
    if (!history.state?.[marker]) history.pushState({ ...(history.state || {}), [marker]: true }, '', location.href);
  } catch (error) {
    console.warn('페이지 뒤로가기를 준비하지 못했어요.', error);
  }

  window.addEventListener('popstate', event => {
    if (!event.state?.[marker]) location.replace(destination);
  });
})();

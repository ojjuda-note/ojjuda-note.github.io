(() => {
  'use strict';
  // This prevents ordinary browser save/drag actions. Rendered image bytes and
  // screenshots cannot be made inaccessible to the person viewing the page.
  const protectedPhoto = target => target instanceof Element
    && target.closest('[data-protect-photo]')?.dataset.protectPhoto === 'true';
  for (const name of ['contextmenu', 'dragstart']) {
    document.addEventListener(name, event => {
      if (!protectedPhoto(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (link && protectedPhoto(link)) event.preventDefault();
  }, true);
})();

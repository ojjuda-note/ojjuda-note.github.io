/* Public short addresses resolve to the existing, access-controlled pages. */
(() => {
  'use strict';
  const value = document.querySelector('meta[name="ojjuda-short-target"]')?.content;
  if (!value || !value.startsWith('/') || value.startsWith('//')) return;
  const target = new URL(value, location.origin);
  if (target.origin !== location.origin || target.pathname === location.pathname) return;
  // Fixed route choices win over incoming query strings. Keep invitation and share
  // parameters without allowing them to change the page, game, or login action.
  const fixed = new Set(target.searchParams.keys());
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (!fixed.has(key)) target.searchParams.append(key, value);
  }
  if (!target.hash) target.hash = location.hash;
  location.replace(target.href);
})();

/* Legacy shared links and direct app loads enter the single World service. */
(() => {
  const source = new URL(location.href);
  let hosted = false;
  try { hosted = parent !== window && parent.location.origin === location.origin && parent.location.pathname === '/world.html'; } catch {}
  if (source.pathname.startsWith('/park/') && hosted) return;
  const target = new URL('/world.html', location.origin); target.searchParams.set('place','park'); target.hash=source.hash;
  for (const key of ['card','keep','compose','view']) if (source.searchParams.has(key)) target.searchParams.set(key,source.searchParams.get(key));
  if (source.pathname.endsWith('/glasses.html')) target.searchParams.set('view','glasses');
  if (parent !== window && hosted) parent.location.replace(target.href);
  else location.replace(target.href);
})();

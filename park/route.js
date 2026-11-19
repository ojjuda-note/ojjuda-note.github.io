/* Legacy shared links and direct app loads enter the single World service. */
(() => {
  const source = new URL(location.href);
  let hosted = false;
  try { hosted = parent !== window && parent.location.origin === location.origin && parent.location.pathname === '/world.html'; } catch {}
  if (source.pathname.startsWith('/park/') && hosted) return;
  const target = new URL('/world.html', location.origin); target.searchParams.set('place','park'); target.hash=source.hash;
  for (const key of ['card','keep','compose','view']) if (source.searchParams.has(key)) target.searchParams.set(key,source.searchParams.get(key));
  const refs=source.searchParams.getAll('ref');
  if(refs.length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refs[0]))target.searchParams.set('ref',refs[0].toLowerCase());
  if (source.pathname.endsWith('/glasses.html')) target.searchParams.set('view','glasses');
  if (parent !== window && hosted) parent.location.replace(target.href);
  else location.replace(target.href);
})();

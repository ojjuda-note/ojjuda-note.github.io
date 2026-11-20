/* Legacy shared links and direct app loads enter the single World service. */
(() => {
  const source = new URL(location.href);
  let hosted = false;
  try { hosted = parent !== window && parent.location.origin === location.origin && parent.location.pathname === '/world.html'; } catch {}
  if (source.pathname.startsWith('/park/') && hosted) return;
  const target = new URL('/world.html', location.origin); target.searchParams.set('place','park'); target.hash=source.hash;
  for (const key of ['card','keep','compose','view']) if (source.searchParams.has(key)) target.searchParams.set(key,source.searchParams.get(key));
  // Preserve bounded campaign labels through the legacy park redirect; never carry arbitrary URLs.
  const campaignKeys=['utm_source','utm_medium','utm_campaign','utm_content'];
  if(campaignKeys.some(key=>source.searchParams.has(key))){
    const valid=campaignKeys.every(key=>source.searchParams.getAll(key).length<=1 &&
      (!source.searchParams.has(key)||/^[a-z][a-z0-9_-]{0,63}$/.test(source.searchParams.get(key)))) &&
      ['threads','naver','instagram','facebook','youtube','tiktok','kakao','x','google','other'].includes(source.searchParams.get('utm_source')) &&
      source.searchParams.has('utm_campaign') &&
      (!source.searchParams.has('utm_medium')||['social','blog','video','search','referral','organic','paid','other'].includes(source.searchParams.get('utm_medium')));
    if(valid){for(const key of campaignKeys)if(source.searchParams.has(key))target.searchParams.set(key,source.searchParams.get(key));}
    // A fixed invalid marker also clears an older campaign in the destination;
    // dropping only the bad field would silently relabel this as a valid visit.
    else target.searchParams.set('utm_source','invalid');
  }
  const refs=source.searchParams.getAll('ref');
  if(refs.length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refs[0]))target.searchParams.set('ref',refs[0].toLowerCase());
  if (source.pathname.endsWith('/glasses.html')) target.searchParams.set('view','glasses');
  if (parent !== window && hosted) parent.location.replace(target.href);
  else location.replace(target.href);
})();

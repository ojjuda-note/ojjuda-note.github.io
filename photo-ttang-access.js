/* Photo Ttang uses the same server birth-date restriction as Matgo. */
(function (root) {
  'use strict';
  try {
    if (root.parent !== root && root.parent.location.origin === root.location.origin && root.parent.OjjudaPhotoTtangAccess) {
      root.OjjudaPhotoTtangAccess = root.parent.OjjudaPhotoTtangAccess;
      return;
    }
  } catch (_) {}
  const core = root.OjjudaMatgoAccess;
  function photoError(error) {
    const result = new Error(String(error?.message || '나이를 확인하지 못했어요. 다시 시도해 주세요.').replaceAll('맞고', '포토땅따먹기'));
    result.code = error?.code || 'unavailable';
    return result;
  }
  const run = method => async () => {
    try { if (!core) throw photoError(); return await core[method](); }
    catch (error) { throw photoError(error); }
  };
  root.OjjudaPhotoTtangAccess = Object.freeze({
    configure: client => core?.configure(client),
    check: run('check'), refresh: run('refresh'),
    allowed: () => core?.allowed() === true,
    subscribe: listener => core?.subscribe(error => listener(photoError(error))) || (() => {})
  });
})(window);

// Load optional paid help after the game engine has initialized. The guest demo stays free.
if(location.pathname==='/games/photo-ttang.html'&&new URLSearchParams(location.search).get('demo')!=='1'){
  const loadPhotoHelp=()=>{const script=document.createElement('script');script.src='/photo-ttang-help.js?v=20261006-direct1';document.head.append(script);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadPhotoHelp,{once:true});else loadPhotoHelp();
}

// Follow the visible phone viewport when browser controls or the keyboard move.
(()=>{
  const root=document.documentElement;
  if(window.parent!==window)root.dataset.matgoEmbedded='true';
  const sync=()=>{
    const height=Math.round(window.visualViewport?.height||window.innerHeight);
    root.style.setProperty('--matgo-viewport-height',height+'px');
    root.classList.toggle('matgo-short',height<640);
  };
  sync();window.addEventListener('resize',sync);
  window.visualViewport?.addEventListener('resize',sync);
})();

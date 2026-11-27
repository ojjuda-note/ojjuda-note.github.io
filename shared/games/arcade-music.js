(() => {
  'use strict';
  if (window.OjjudaArcadeMusic) return;
  const script = document.currentScript;
  const preference = 'ojjuda.arcade.background-music.v1';
  const games = new Set('sacheonseong solitaire mines spot screw saetbyeol chacha_rush runner mole stacker breakout janggi chess billiards onecard bang tank yut tour ttang photo_ttang matgo croc bottle bomb stopwatch liar king truth initial minority mission fingers imagevote updown secretcount partyroulette shapematch'.split(' '));
  const read = () => {try {return localStorage.getItem(preference) !== 'off';} catch {return true;}};
  let activated=!!navigator.userActivation?.hasBeenActive;
  let enabled=read(), context, source, preparing, game, root, playing=false, pageVisible=true;
  const controls = '[data-arcade-music-toggle]';
  const life = new MutationObserver(()=>{
    if (root && !root.isConnected) {
      const next=document.querySelector('[data-music-game="'+game+'"]');
      if (next) mount(game,next); else stop();
    }
  });
  function paint(button) {
    const label='배경음악 '+(enabled?'켬':'끔');
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(enabled)); button.title=label;
    button.textContent=button.hasAttribute('data-compact')?(enabled?'♫':'♫ 끔'):label;
  }
  function refresh() { document.querySelectorAll(controls).forEach(paint); }
  const audible = () => activated && game && enabled && playing && pageVisible && !document.hidden;
  function sync() {
    if (!audible()) {
      if (context && context.state!=='closed') context.suspend().catch(()=>{});
      return;
    }
    const AudioEngine=window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return;
    if (!context) {
      try {context=new AudioEngine();} catch {return;}
    }
    if (context.state!=='running') context.resume().catch(()=>{});
    if (source || preparing) return;
    const target=context, id=game;
    preparing=import('./arcade-compositions.mjs?v=20261127-arcade-practice1').then(module=>module.renderLoop(id)).then(({buffer,loopEnd})=>{
      if (context!==target || game!==id) return;
      const gain=target.createGain();
      gain.gain.value=.42;gain.connect(target.destination);
      source=target.createBufferSource();source.buffer=buffer;source.loop=true;
      source.loopEnd=loopEnd;source.connect(gain);source.start();
    }).catch(()=>{}).finally(()=>{if(context===target)preparing=null;});
  }
  function stop() {
    life.disconnect();root=null;game=null;playing=false;preparing=null;
    if(source){source.stop();source.disconnect();source=null;}
    if(context){context.close().catch(()=>{});context=null;}
  }
  function mount(id,element=null,autoplay=true) {
    if (!games.has(id)) {stop();return;}
    if (id!==game) {stop();game=id;}
    if (element!==root) {
      life.disconnect();root=element;
      for(let node=root?.parentNode;node;node=node.parentNode) life.observe(node,{childList:true});
    }
    activated ||= !!navigator.userActivation?.hasBeenActive;
    playing=autoplay;
    refresh();sync();
  }
  function interact(event) {
    if (!event.isTrusted || event.target.closest?.(controls)) return;
    activated=true;
    const surface=event.target.closest?.('[data-music-game]');
    if (surface && (surface!==root || surface.dataset.musicGame!==game)) mount(surface.dataset.musicGame,surface);
    else if (game && (!root || root.contains(event.target))) sync();
  }
  document.addEventListener('focusin',event=>{if(event.target.matches?.(controls))paint(event.target);});
  document.addEventListener('pointerup',interact,true);
  document.addEventListener('keydown',interact,true);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.(controls);
    if (!button) return;
    activated=true; enabled=!enabled;
    try {localStorage.setItem(preference,enabled?'on':'off');} catch {}
    const surface=button.closest('[data-music-game]');
    if (surface && surface!==root) mount(surface.dataset.musicGame,surface);
    refresh();sync();
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enabled=read();refresh();sync();});
  window.addEventListener('storage',event=>{if(event.key===preference || event.key===null){enabled=read();refresh();sync();}});
  window.addEventListener('pagehide',()=>{pageVisible=false;sync();});
  window.addEventListener('pageshow',()=>{pageVisible=true;enabled=read();refresh();sync();});
  window.OjjudaArcadeMusic={mount,stop,refresh,setPlaying(value){playing=value;sync();}};
  if (script?.dataset.game) mount(script.dataset.game,null,script.dataset.game!=='sacheonseong');
  else refresh();
})();

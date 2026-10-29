// Re-entry always starts at the game entrance, including muted devices.
// The same explicit click also unlocks audio when sound is enabled.
let firstStart=null;
const handoffKey='ojjuda-matgo-entry-handoff';
export function openMatgoSolo(event){
  if(!event?.isTrusted)return false;
  const url=new URL('./matgo.html',location.href);
  url.searchParams.set('v','20261029-matgo-deal1');url.searchParams.set('open',String(Date.now()));
  const id=crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
  const handoff=JSON.stringify({id,at:Date.now()});
  // The same-origin iframe survives navigation even when a mobile webview
  // blocks sessionStorage. This is start intent only, never authorization.
  try{window.frameElement?.setAttribute('data-matgo-start-handoff',handoff);}catch{}
  try{sessionStorage.setItem(handoffKey,handoff);}catch{}
  url.searchParams.set('entry',id);
  location.replace(url.href);return true;
}
function takeHandoff(){
  const candidates=[];
  try{const saved=sessionStorage.getItem(handoffKey);sessionStorage.removeItem(handoffKey);candidates.push(saved);}catch{}
  try{const frame=window.frameElement,saved=frame?.getAttribute('data-matgo-start-handoff');frame?.removeAttribute('data-matgo-start-handoff');candidates.push(saved);}catch{}
  const id=new URLSearchParams(location.search).get('entry');
  return candidates.some(raw=>{try{const saved=JSON.parse(raw),age=Date.now()-saved?.at;return !!id&&saved?.id===id&&age>=0&&age<60000;}catch{return false;}});
}
export function waitForMatgoStart(){
  if(firstStart)return firstStart;
  if(document.documentElement.dataset.viewportPage!=='matgo-solo')return Promise.resolve();
  // One trusted click in the shared entrance continues through navigation.
  // Consume it once; direct entry and reload still require a fresh click.
  if(takeHandoff())return firstStart=Promise.resolve();
  firstStart=new Promise(resolve=>{
    const panel=document.createElement('div');
    panel.className='modal';panel.id='matgo-start';panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','matgo-start-title');
    panel.innerHTML='<div class="card game-entry"><div class="ge-icon" aria-hidden="true">🎴</div><span class="ge-kicker">오쭈다 오락실</span><h2 id="matgo-start-title" class="ge-title">맞고</h2><p class="ge-copy">컴퓨터와 가볍게 한 판 즐겨보세요.</p><button type="button" class="btn gold ge-primary" id="matgo-start-play">시작하기</button><button type="button" class="btn g ge-secondary" id="matgo-start-exit">나가기</button></div>';
    const play=panel.querySelector('#matgo-start-play'),exit=panel.querySelector('#matgo-start-exit');
    play.addEventListener('click',event=>{
      if(!event.isTrusted||play.disabled)return;
      play.disabled=true;panel.remove();resolve();
    });
    exit.onclick=()=>{
      if(window.parent!==window)window.parent.postMessage({type:'ojjuda:matgo:close'},location.origin);
      else location.assign('../world.html');
    };
    panel.addEventListener('keydown',event=>{
      if(event.key==='Tab'){
        event.preventDefault();(document.activeElement===play?exit:play).focus();
      }
    });
    const loading=document.getElementById('matgo-entry-loading');if(loading)loading.hidden=true;
    document.body.append(panel);play.focus({preventScroll:true});
  });
  return firstStart;
}

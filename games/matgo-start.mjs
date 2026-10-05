// A newly navigated game has no audio gesture yet, even after a lobby click.
// The solo game's capture listeners unlock its existing sound bank on this click.
let firstStart=null;
export function waitForMatgoStart(){
  if(firstStart)return firstStart;
  if(document.documentElement.dataset.viewportPage!=='matgo-solo')return Promise.resolve();
  let muted=false;
  try{muted=localStorage.getItem('ojjuda-matgo-sound')==='off';}catch{}
  if(muted||!(window.AudioContext||window.webkitAudioContext))return firstStart=Promise.resolve();
  firstStart=new Promise(resolve=>{
    const panel=document.createElement('div');
    panel.className='modal';panel.id='matgo-start';panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','matgo-start-title');
    panel.innerHTML='<div class="card"><h2 id="matgo-start-title">🎴 맞고</h2><p>준비되면 패를 돌려요.</p><div class="row"><button type="button" class="btn gold" id="matgo-start-play">시작하기</button><button type="button" class="btn g" id="matgo-start-exit">나가기</button></div></div>';
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
    document.body.append(panel);play.focus({preventScroll:true});
  });
  return firstStart;
}

// Re-entry always starts at the game entrance, including muted devices.
// The same explicit click also unlocks audio when sound is enabled.
let firstStart=null;
export function waitForMatgoStart(){
  if(firstStart)return firstStart;
  if(document.documentElement.dataset.viewportPage!=='matgo-solo')return Promise.resolve();
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
    document.body.append(panel);play.focus({preventScroll:true});
  });
  return firstStart;
}

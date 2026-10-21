/* Solo practice game. Authentication stays in the parent, with existing adult access. */
(()=>{
  'use strict';let active=null,opening=0;
  window.OjjudaPokerGame={
    async open({owner=null,authorized=()=>true,onError=()=>{}}={}){
      if(active){active.dialog.focus();return;}
      const request=++opening,access=window.OjjudaMatgoAccess;
      try{const identity=await access?.check();if(!identity||identity.userId!==owner||!authorized())return;if(!Number.isInteger(identity.age)||identity.age<20){onError('세븐포커는 만 20세 이상 회원만 이용할 수 있어요.');return;}}catch(error){onError((error?.code==='underage'||error?.code==='login'?'세븐포커는 로그인한 만 20세 이상 회원만 이용할 수 있어요.':(error?.message||'나이를 확인하지 못했어요.').replaceAll('맞고','세븐포커')));return;}
      if(request!==opening||!authorized())return;
      const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
      const dialog=document.createElement('dialog');dialog.className='tour-game-dialog poker-game-dialog';dialog.setAttribute('aria-label','세븐포커');
      dialog.innerHTML='<header class="tour-game-header"><button type="button">← 게임 목록</button><span>세븐포커 · 컴퓨터 대전</span></header><iframe title="세븐포커" src="/games/poker/index.html?v=20261021-poker3" allow="autoplay"></iframe>';
      const frame=dialog.querySelector('iframe');let connected=false,unsubscribe=null;
      const send=type=>frame.contentWindow?.postMessage({source:'ojjuda-world',type,owner},location.origin);
      function close(){
        if(active?.dialog!==dialog)return;active=null;unsubscribe?.();clearInterval(authTimer);
        window.removeEventListener('message',receive);dialog.close();dialog.remove();
        if(!wasGaming)document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus({preventScroll:true});
      }
      function receive(event){
        if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='ojjuda-poker')return;
        if(!authorized()||!access.visible(20)){close();return;}
        if(event.data.type==='ready'){connected=true;send('poker-init');}
        if(event.data.type==='exit')close();
      }
      function requestClose(){if(connected&&authorized())send('poker-exit-request');else close();}
      const authTimer=setInterval(()=>{if(!authorized()||!access.visible(20))close();},1000);
      unsubscribe=access.subscribe(close);active={dialog,close};window.addEventListener('message',receive);
      dialog.querySelector('button').addEventListener('click',requestClose);
      dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
      document.body.append(dialog);document.body.classList.add('gaming');dialog.showModal();
    },
    close(){opening++;active?.close();}
  };
})();

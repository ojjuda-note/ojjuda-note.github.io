/* Authentication stays in the parent; the server authorizes every online request. */
(()=>{
  'use strict';let active=null,opening=0;
  window.OjjudaPokerGame={
    async open({owner=null,authorized=()=>true,onError=()=>{},joinCode=null,onCoins=()=>{}}={}){
      if(active){active.dialog.focus();return;}
      const request=++opening,access=window.OjjudaMatgoAccess;
      try{const identity=await access?.check();if(!identity||identity.userId!==owner||!authorized())return;if(!Number.isInteger(identity.age)||identity.age<19){onError('세븐포커는 만 19세 이상 회원만 이용할 수 있어요.');return;}}catch(error){onError((error?.code==='underage'||error?.code==='login'?'세븐포커는 로그인한 만 19세 이상 회원만 이용할 수 있어요.':(error?.message||'나이를 확인하지 못했어요.').replaceAll('맞고','세븐포커')));return;}
      if(request!==opening||!authorized())return;
      const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
      const dialog=document.createElement('dialog');dialog.className='tour-game-dialog poker-game-dialog';dialog.setAttribute('aria-label','세븐포커');
      dialog.innerHTML='<header class="tour-game-header"><button type="button">← 게임 목록</button><span>세븐포커</span></header><iframe title="세븐포커" src="/games/poker/index.html?v=20261031-fresh-games1" allow="autoplay"></iframe>';
      const frame=dialog.querySelector('iframe');let connected=false,unsubscribe=null,inflight=0,lastResult='';
      const send=type=>frame.contentWindow?.postMessage({source:'ojjuda-world',type,owner,joinCode},location.origin);
      function dispose(){
        if(active?.dialog!==dialog)return;active=null;unsubscribe?.();clearInterval(authTimer);
        window.removeEventListener('message',receive);dialog.close();dialog.remove();
        if(!wasGaming)document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus({preventScroll:true});
      }
      function close(){return session.close();}
      async function invoke(body){
        const {data,error}=await access.getClient().functions.invoke('poker',{body});
        let code=data?.error;
        if(error){try{code=(await error.context.json()).error;}catch{} }
        if(error||code)return {ok:false,error:code||'unavailable'};
        if(active?.dialog===dialog&&authorized()){
          if(Number.isSafeInteger(data?.wallet?.coins)&&data.wallet.coins>=0)onCoins(data.wallet.coins);
          if(['create','join','leave','start','ready'].includes(body.action))window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
          const result=data?.room?.status==='finished'?data.room.id+':'+data.room.round:'';
          if(body.action==='refill'||result&&result!==lastResult){lastResult=result;window.dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{owner,game:'poker'}}));}
        }
        return data||{ok:false,error:'unavailable'};
      }
      async function receive(event){
        if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='ojjuda-poker')return;
        if(!authorized()||!access.visible(19)){close();return;}
        if(event.data.type==='ready'){connected=true;void session.enter(()=>send('poker-init'));}
        if(event.data.type==='exit')close();
        if(event.data.type==='table-view'&&typeof event.data.playing==='boolean')dialog.classList.toggle('poker-table-open',event.data.playing);
        if(event.data.type==='rpc'){
          const {id,body}=event.data;
          if(typeof id!=='string'||id.length>64||!body||!['status','refill','list','mine','create','join','read','start','move','ready','leave'].includes(body.action)||inflight>=4)return;
          await session.run(async()=>{
            inflight++;
            try{
              const data=await invoke(body),code=data?.error;
              if(active?.dialog===dialog&&authorized())frame.contentWindow?.postMessage({source:'ojjuda-world',type:'poker-rpc',id,data:code?null:data,error:code||null},location.origin);
            }catch{if(active?.dialog===dialog&&authorized())frame.contentWindow?.postMessage({source:'ojjuda-world',type:'poker-rpc',id,error:'unavailable'},location.origin);}
            finally{inflight--;}
          });
        }
      }
      function requestClose(){if(connected&&authorized())send('poker-exit-request');else close();}
      const session=window.OjjudaGameSession.create({kind:'poker',dialog,frame,authorized:()=>active?.dialog===dialog&&authorized()&&access.visible(19),available:()=>!!owner,invoke,dispose,keepCode:typeof joinCode==='string'&&/^[A-F0-9]{8}$/i.test(joinCode)?joinCode:''});
      const authTimer=setInterval(()=>{if(!authorized()||!access.visible(19))close();},1000);
      unsubscribe=access.subscribe(close);active={dialog,close};window.addEventListener('message',receive);
      dialog.querySelector('button').addEventListener('click',requestClose);
      dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
      document.body.append(dialog);document.body.classList.add('gaming');dialog.showModal();
    },
    close(){opening++;return active?.close()??true;}
  };
})();

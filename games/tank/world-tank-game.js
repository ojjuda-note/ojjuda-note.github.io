// unchanged production source at line 1
   if(active){active.dialog.focus();return;}
   const previous=document.activeElement,wasGaming=document.body.classList.contains('gaming');
   const dialog=document.createElement('dialog');dialog.className='tour-game-dialog tank-game-dialog';dialog.setAttribute('aria-label','탱크게임');
   dialog.innerHTML='<header class="tour-game-header"><button type="button">← 오락실</button><span>탱크게임 · 혼자 / 같은 기기 / 온라인</span></header><iframe title="탱크게임" src="/games/tank/index.html?v=20261112-arcade-entry-return1" allow="fullscreen; clipboard-write; web-share"></iframe>';
   const frame=dialog.querySelector('iframe');let invitation=new AbortController(),requests=0,rankedRoom=null,guestFinished=false,latestInvoke=0;
   function dispose(){if(active?.dialog!==dialog)return;active=null;invitation.abort();window.removeEventListener('message',receive);clearInterval(authTimer);dialog.close();dialog.remove();if(!wasGaming)document.body.classList.remove('gaming');if(previous?.isConnected)previous.focus({preventScroll:true});}
   function close(){invitation.abort();const result=session.close();if(result?.then)result.then(closed=>{if(!closed&&active?.dialog===dialog)invitation=new AbortController();});return result;}
// unchanged production source at line 18

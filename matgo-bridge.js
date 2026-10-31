/* Ojjuda Agit arcade → member-only Matgo. Gold balances and refills are server-managed. */
(function () {
  'use strict';
  let overlay = null, frame = null, opening = null, unsubscribe = null, previousFocus = null;
  let generation = 0, onlineReady=false;
  let releaseViewport=null;
  let session=null,cleanup=null;const retired=[];
  function noteResponse(current,result,body,arcade=false){
    const data=result?.data;if(!data?.ok)return;
    if(arcade){if(data.room?.match_id)current.rooms.add(data.room.match_id);return;}
    if(['settle','abandon'].includes(body.action)){current.rounds.delete(body.round_id);current.finishedRounds.add(body.round_id);}
    else if(data.round?.id&&!current.finishedRounds.has(data.round.id))current.rounds.add(data.round.id);
    if(body.action==='online_leave'){current.rooms.delete(body.room_id);current.leftRooms.add(body.room_id);}
    else if(data.room?.id){
      if(['online_create','online_join','online_quick','online_ready'].includes(body.action))current.leftRooms.delete(data.room.id);
      if(['waiting','active'].includes(data.room.status)&&!current.leftRooms.has(data.room.id))current.rooms.add(data.room.id);
      else current.rooms.delete(data.room.id);
    }else if(data.online_room&&!current.leftRooms.has(data.online_room))current.rooms.add(data.online_room);
  }
  function track(source,body,arcade=false){
    const current=session;
    if(!current||current.closed||source!==frame?.contentWindow)return Promise.reject(Error('맞고를 다시 열어 주세요.'));
    current.client ||= window.OjjudaMatgoAccess.getClient();
    const request=Promise.resolve().then(()=>{
      if(current.closed)throw Error('맞고를 다시 열어 주세요.');
      return arcade?current.client.rpc('arcade_room_service',body):current.client.functions.invoke('matgo',{body});
    }).then(result=>{noteResponse(current,result,body,arcade);return result;}).finally(()=>current.pending.delete(request));
    current.pending.add(request);return request;
  }
  async function finishRetired(){
    if(cleanup)return cleanup;
    cleanup=(async()=>{
      while(retired.length){
        const previous=retired[0];
        await Promise.allSettled([...previous.pending]);
        for(const [ids,action,key] of [[previous.rooms,'online_leave','room_id'],[previous.rounds,'abandon','round_id']]){
          for(const id of ids){
            const auth=await previous.client.auth.getSession();
            if(auth.error)throw Error('이전 판의 나가기를 확인하지 못했어요. 다시 열어 주세요.');
            const member=auth.data?.session;
            if(!previous.owner||member?.user?.id!==previous.owner){previous.rooms.clear();previous.rounds.clear();break;}
            if(!member.access_token)throw Error('로그인을 확인한 뒤 맞고를 다시 열어 주세요.');
            const result=await previous.client.functions.invoke('matgo',{body:{action,[key]:id,stakes_version:1},headers:{Authorization:'Bearer '+member.access_token}});
            if(result.error||!result.data?.ok)throw Error('이전 판의 나가기를 확인하지 못했어요. 다시 열어 주세요.');
            ids.delete(id);
          }
        }
        retired.shift();
      }
    })().finally(()=>{cleanup=null;});
    return cleanup;
  }
  window.OjjudaMatgoBridge={invoke:(source,body)=>track(source,body),arcade:(source,body)=>track(source,body,true)};
  function requestClose(){
    if(onlineReady&&frame)frame.contentWindow.postMessage({type:'ojjuda:matgo:request-close'},location.origin);
    else closeMatgo();
  }
  function showMessage(message) {
    const target = document.getElementById('toast');
    if (target) {
      target.textContent = message;
      target.classList.add('show');
      clearTimeout(showMessage.timer);
      showMessage.timer = setTimeout(() => target.classList.remove('show'), 4500);
    } else window.alert(message);
  }
  function closeMatgo(preserveRoom=false) {
    generation++;
    opening = null;
    const previous=session;session=null;
    if(previous)previous.closed=true;
    try{frame?.contentWindow?.OjjudaMatgoSession?.dispose();}catch{}
    if(previous&&preserveRoom!==true&&(previous.pending.size||previous.rooms.size||previous.rounds.size)){
      retired.push(previous);void finishRetired().catch(()=>{});
    }
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    if (overlay) overlay.remove();
    releaseViewport?.();releaseViewport=null;
    overlay = frame = null;
    onlineReady=false;
    document.body.classList.remove('matgo-open');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  async function openMatgo(options = {}) {
    if (options.signal?.aborted) return false;
    if (opening || overlay) {
      if (options.propagateError) throw new Error('맞고를 준비 중이에요. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    const request = {};
    opening = request;
    const attempt = generation;
    const cancel = () => { if (opening === request || attempt === generation) closeMatgo(); };
    options.signal?.addEventListener('abort', cancel, {once:true});
    try {
      if(retired.length)await finishRetired();
      if(attempt!==generation||options.signal?.aborted)return false;
      const access = window.OjjudaMatgoAccess;
      if (!access) throw new Error('맞고를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
      const member=await access.check();
      if (attempt !== generation || options.signal?.aborted) return false;
      session={owner:member?.userId,client:null,closed:false,pending:new Set(),rooms:new Set(),rounds:new Set(),leftRooms:new Set(),finishedRounds:new Set()};
      previousFocus = document.activeElement;
      overlay = document.createElement('div');
      overlay.id = 'matgo-overlay';
      // Apply the shared entrance before the first frame can paint.
      overlay.classList.add('mp-entry-host');overlay.dataset.mpActive='true';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', '맞고 · 만 19세 이상');
      const phone=matchMedia('(max-width:600px),(pointer:coarse)').matches;
      overlay.style.cssText = 'position:fixed;inset:var(--app-viewport-top,0px) 0 auto;z-index:99999;background:#1c1730;display:flex;flex-direction:column;box-sizing:border-box;height:var(--app-viewport-height,100dvh);padding-top:var(--app-safe-top,env(safe-area-inset-top,0px));padding-bottom:max(var(--app-safe-bottom,env(safe-area-inset-bottom,0px)),'+(phone?'24px':'0px')+')';
      const bar = document.createElement('div');
      bar.id='matgo-loading-bar';
      bar.style.cssText = 'position:absolute;right:8px;top:calc(4px + env(safe-area-inset-top,0px));z-index:1;color:#fff';
      const label = document.createElement('span');
      label.textContent = '🎴 맞고 · 만 19세 이상';
      label.style.fontSize = '13px';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '닫기 ✕';
      close.setAttribute('aria-label', '맞고 닫기');
      close.style.cssText = 'min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #ffffff33;background:#ffffff14;color:#fff;font:inherit';
      close.onclick = requestClose;
      bar.append(close);
      frame = document.createElement('iframe');
      // Reopening must fetch current HTML; round rules still come from the server.
      const params = new URLSearchParams({ v: '20261031-fresh-games1', open: String(Date.now()) });
      if(/^[A-Fa-f0-9]{8}$/.test(options.inviteCode||''))params.set('friend_code',options.inviteCode);
      if (/^[0-9a-f-]{36}$/i.test(options.roomId || '')) params.set('room_id', options.roomId);
      if (/^[0-9]+$/.test(String(options.roomNo || ''))) params.set('room_no', options.roomNo);
      if (typeof options.title === 'string') params.set('room_title', options.title.slice(0, 80));
      if (/^[0-9]{4,16}$/.test(String(options.joinRoom || ''))) params.set('join_room', options.joinRoom);
      if (typeof options.createTitle === 'string') params.set('create_title', options.createTitle.slice(0,40));
      if (/^[0-9a-f-]{36}$/i.test(options.createRequest || '')) params.set('create_request', options.createRequest);
      frame.src = 'games/matgo-online.html?' + params.toString();
      frame.title = '오쭈다 맞고';
      frame.style.cssText = 'flex:1;min-height:0;width:100%;border:0';
      overlay.append(bar, frame);
      document.body.appendChild(overlay);
      const syncViewport=()=>{if(window.visualViewport&&Math.abs(window.visualViewport.scale-1)>0.02)return;if(overlay){overlay.style.height=(window.visualViewport?.height||innerHeight)+'px';overlay.style.top=(window.visualViewport?.offsetTop||0)+'px';}};
      syncViewport();window.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);
      releaseViewport=()=>{window.removeEventListener('resize',syncViewport);window.visualViewport?.removeEventListener('resize',syncViewport);window.visualViewport?.removeEventListener('scroll',syncViewport);};
      document.body.classList.add('matgo-open');
      unsubscribe = access.subscribe(error => { closeMatgo(); showMessage(error.message); });
      close.focus();
      return true;
    } catch (error) {
      if (attempt !== generation || options.signal?.aborted) return false;
      closeMatgo();
      if (options.propagateError) throw error;
      showMessage(error.message);
      return false;
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      if (opening === request) opening = null;
    }
  }
  window.openMatgo = openMatgo;
  window.closeMatgo = closeMatgo;
  window.requestMatgoClose = requestClose;
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay) requestClose(); });
  window.addEventListener('message', event => {
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'ojjuda:matgo:close') closeMatgo();
    if (event.data?.type === 'ojjuda:matgo:online-ready') {
      onlineReady=true;
      frame.contentWindow.postMessage({type:'ojjuda:matgo:capabilities',publicLobby:typeof window.OjjudaArcadeRoomCreated==='function'},location.origin);
    }
    if (event.data?.type === 'ojjuda:matgo:room-created' && typeof window.OjjudaArcadeRoomCreated==='function') {
      const room=event.data.room;
      closeMatgo(true);window.OjjudaArcadeRoomCreated(room);return;
    }
    if (event.data?.type === 'ojjuda:matgo:ready') onlineReady=false;
    if (['ojjuda:matgo:online-ready','ojjuda:matgo:ready'].includes(event.data?.type))document.getElementById('matgo-loading-bar')?.remove();
    if (event.data?.type === 'ojjuda:matgo:wallet') window.OjjudaMatgoWalletChanged?.();
    // Only the server refill endpoint can charge ZU.
  });
})();

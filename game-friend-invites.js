/* Friend selection and authenticated invitations for embedded multiplayer games. */
(() => {
  'use strict';
  let options, owner, channel, timer, chooser, popup, authSubscription, generation=0, refreshSequence=0;
  let expiryTimer, countdownTimer, incoming=[], responses=[];
  const deadlines=new Map(), handled=new Set();
  const names={matgo:'맞고',ttang:'월드땅따먹기'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message=error=>{
    const text=String(error?.message||error||'');
    if (/friend_required/.test(text)) return '현재 친구목록에 있는 친구만 초대할 수 있어요.';
    if (/invite_expired|room_unavailable|invite_unavailable/.test(text)) return '초대가 끝났어요. 친구에게 다시 초대해 달라고 해주세요.';
    if (/invite_rate_limit/.test(text)) return '잠시 후 다시 초대해 주세요.';
    return '초대를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  const current=()=>owner&&options?.user()===owner;
  async function rpc(args) {
    if (!current()) throw Error('not_signed_in');
    const actor=owner,{data,error}=await options.client.rpc('arcade_friend_invite',args);
    if (actor!==owner||!current()) throw Error('not_signed_in');
    if (error||!data?.ok) throw error||Error('unavailable');
    return data;
  }
  function closePicker() {
    if (!chooser) return;
    const focus=chooser._focus;chooser.remove();chooser=null;
    if(focus?.isConnected)focus.focus({preventScroll:true});
  }
  function closePopup() {
    clearTimeout(expiryTimer);clearInterval(countdownTimer);
    expiryTimer=countdownTimer=null;
    if(!popup)return;
    const node=popup;popup=null;
    node.close();node.remove();
    if(node._focus?.isConnected)node._focus.focus({preventScroll:true});
  }
  function stop() {
    generation++;refreshSequence++;clearInterval(timer);timer=null;
    if(channel)options?.client.removeChannel(channel);channel=null;
    authSubscription?.unsubscribe();authSubscription=null;
    closePopup();closePicker();owner=null;
    incoming=[];responses=[];deadlines.clear();handled.clear();
  }
  function render() {
    if(!current())return;
    incoming=incoming.filter(invite=>!handled.has(invite.id)&&deadlines.get(invite.id)>Date.now());
    responses=responses.filter(invite=>!handled.has(invite.id));
    // Keep the current request stable while another friend sends an invitation.
    const active=popup?.dataset.invite;
    const invite=incoming.find(item=>item.id===active)||incoming[0];
    const response=responses.find(item=>item.id===active)||responses[0];
    const item=invite||response,type=invite?'invite':'response';
    if(!item){closePopup();return;}
    if(popup?.dataset.invite===item.id)return;
    closePopup();
    const node=document.createElement('dialog'),version=generation;popup=node;
    node.className='game-friend-popup';node.dataset.invite=item.id;node.dataset.type=type;
    node._focus=document.activeElement;
    node.setAttribute('aria-labelledby','game-friend-popup-title');
    node.setAttribute('aria-describedby','game-friend-popup-copy');
    node.setAttribute('aria-modal','true');
    if(type==='response')node.setAttribute('role','alertdialog');
    node.innerHTML=`<section class="game-entry"><div class="ge-icon" aria-hidden="true">${invite?'👥':'💬'}</div><span class="ge-kicker">${names[item.kind]||'게임'}</span><h2 class="ge-title" id="game-friend-popup-title">${invite?'친구 초대':'초대 거절'}</h2><p class="ge-copy" id="game-friend-popup-copy"><strong>${escape(invite?item.sender_name:item.recipient_name)}</strong>님이 ${names[item.kind]||'게임'} 초대를 ${invite?'보냈어요.':'거절했어요.'}</p>${invite?'<p class="ge-invite-countdown">응답 시간 <strong data-seconds></strong>초 · 시간이 지나면 자동으로 닫혀요.</p><button type="button" class="ge-primary" data-answer="accept">함께하기</button><button type="button" class="ge-secondary" data-answer="decline">거절</button>':'<button type="button" class="ge-primary" data-answer="ack">확인</button>'}<p class="ge-invite-status" role="status" hidden></p></section>`;
    const expire=()=>{
      if(popup!==node)return;
      closePopup();render();void refresh();
    };
    node.onclick=async event=>{
      const button=event.target.closest('[data-answer]');if(!button||node._busy||!current())return;
      if(invite&&deadlines.get(item.id)<=Date.now()){expire();return;}
      node._busy=true;refreshSequence++;
      node.querySelectorAll('button').forEach(b=>b.disabled=true);
      try {
        const data=await rpc({p_action:button.dataset.answer,p_id:item.id});
        if(version!==generation)return;
        handled.add(item.id);refreshSequence++;
        if(popup===node)closePopup();
        if(button.dataset.answer==='accept')await options.onJoin(data);
        render();void refresh();
      } catch(error) {
        if(version!==generation)return;
        if(/invite_expired|invite_unavailable|room_unavailable/.test(String(error?.message||error))){
          handled.add(item.id);if(popup===node)closePopup();render();void refresh();
          options.notice?.(message(error));
        } else {
          const status=node.querySelector('[role=status]');status.hidden=false;status.textContent=message(error);
        }
      } finally {node._busy=false;node.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    node.addEventListener('cancel',event=>{event.preventDefault();node.querySelector('[data-answer="decline"],[data-answer="ack"]')?.click();});
    document.body.append(node);node.showModal();
    if(invite){
      const tick=()=>{const left=deadlines.get(item.id)-Date.now();if(left<=0){expire();return;}node.querySelector('[data-seconds]').textContent=Math.ceil(left/1000);};
      countdownTimer=setInterval(tick,1000);
      expiryTimer=setTimeout(expire,Math.max(0,deadlines.get(item.id)-Date.now()));
      tick();
    }
  }
  async function refresh() {
    if (!current()) { stop();return; }
    const version=generation,sequence=++refreshSequence,started=Date.now();
    try {
      const data=await rpc({p_action:'list'});
      if(version!==generation||sequence!==refreshSequence)return;
      const now=Date.now(),serverNow=Date.parse(data.server_now);
      incoming=data.invites||[];responses=data.responses||[];
      for(const invite of incoming){
        const expires=Date.parse(invite.expires_at);
        const remaining=expires-(Number.isFinite(serverNow)?serverNow+(now-started):now);
        const deadline=now+Math.max(0,Math.min(60000,remaining));
        deadlines.set(invite.id,Math.min(deadlines.get(invite.id)??Infinity,deadline));
      }
      render();
    } catch { /* Reconnect and visibility refresh retry without interrupting a game. */ }
  }
  async function pick({kind,prepare,onSent}={}) {
    if(!names[kind]||typeof prepare!=='function'||!current())return false;
    closePicker();const node=document.createElement('div');chooser=node;
    node.className='game-friend-picker-overlay';node._focus=document.activeElement;
    node.innerHTML=`<section class="game-entry" role="dialog" aria-modal="true" aria-label="초대할 친구 선택"><button class="ge-close" aria-label="친구 선택 닫기">×</button><div class="ge-icon" aria-hidden="true">👥</div><span class="ge-kicker">${names[kind]}</span><h2 class="ge-title">친구 초대</h2><p class="ge-copy">함께할 친구를 골라주세요.</p><div class="ge-friend-picker" data-entry-friends="${kind}"><div class="ge-friends-heading"><strong>친구목록</strong><span data-friend-count></span></div><input type="search" class="ge-friend-search" data-friend-search placeholder="친구 이름 검색" aria-label="초대할 친구 검색"><div class="ge-friend-list" data-friend-list><p class="ge-empty">친구목록을 불러오고 있어요.</p></div><p class="ge-empty" data-friend-empty hidden>찾는 친구가 없어요.</p></div><p class="ge-empty" role="status" data-status></p></section>`;
    node.querySelector('.ge-close').onclick=closePicker;document.body.append(node);node.querySelector('input').focus({preventScroll:true});
    try {await options.refresh?.();} catch {if(chooser===node)node.querySelector('[data-status]').textContent='친구목록을 새로 불러오지 못했어요.';}
    if(chooser!==node||!current())return false;
    const friends=options.list();
    node.querySelector('[data-friend-list]').innerHTML=friends.map(friend=>`<div class="ge-friend" data-friend-id="${escape(friend.id)}" data-friend-name="${escape(friend.nick)}" data-online="${friend.online===true?'true':friend.online===false?'false':'unknown'}"><span class="ge-friend-avatar" aria-hidden="true">${escape([...friend.nick][0]||'친')}</span><span class="ge-friend-copy"><strong>${escape(friend.nick)}</strong><small class="ge-presence"><i aria-hidden="true"></i>${friend.online===true?'접속 중':friend.online===false?'오프라인':'접속 확인 중'}</small></span><button class="ge-invite" data-friend-pick="${escape(friend.id)}">초대</button></div>`).join('')||'<p class="ge-empty">아직 등록한 친구가 없어요.</p>';
    window.dispatchEvent(new Event('ojjuda:friends-presence'));
    let sending=false;
    node.addEventListener('click',async event=>{
      const button=event.target.closest('[data-friend-pick]');if(!button||sending||!current())return;
      const friend=options.list().find(f=>f.id===button.dataset.friendPick);if(!friend)return;
      sending=true;node.querySelectorAll('[data-friend-pick]').forEach(b=>b.disabled=true);
      const status=node.querySelector('[data-status]');status.textContent='초대할 게임을 준비하고 있어요…';
      let prepared;
      try {
        prepared=await prepare(friend);
        if(chooser!==node||!current()){await prepared?.cancel?.();return;}
        if(!prepared?.code)throw Error('room_unavailable');
        const result=await rpc({p_action:'send',p_to:friend.id,p_kind:kind,p_code:prepared.code});
        closePicker();onSent?.(result.id);options.notice?.(friend.nick+'님에게 초대했어요.');
      } catch(error) {await prepared?.cancel?.();if(chooser===node)status.textContent=message(error);}
      finally {sending=false;node.querySelectorAll('[data-friend-pick]').forEach(b=>b.disabled=false);}
    });
    return true;
  }
  function install(config) {
    const uid=config.user();if(uid===owner&&options?.client===config.client)return;
    stop();options=config;if(!uid)return;owner=uid;
    authSubscription=config.client.auth?.onAuthStateChange?.((_event,session)=>{
      if(owner&&session?.user?.id!==owner)stop();
    })?.data?.subscription;
    channel=config.client.channel('arcade-friend-invites:'+uid)
      .on('postgres_changes',{event:'*',schema:'public',table:'arcade_friend_invites',filter:'recipient_id=eq.'+uid},()=>void refresh())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_friend_invites',filter:'sender_id=eq.'+uid},()=>void refresh())
      .subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
    timer=setInterval(()=>{if(!current())stop();else if(!document.hidden)void refresh();},10000);
    void refresh();
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&owner)void refresh();});
  document.addEventListener('keydown',event=>{
    if(popup){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();popup.querySelector('[data-answer=decline],[data-answer=ack]')?.click();}
      if(event.key==='Tab'){
        const buttons=[...popup.querySelectorAll('button:not([disabled])')];
        if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}
        else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}
      }
      return;
    }
    if(!chooser)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePicker();}
    if(event.key==='Tab'){
      const nodes=[...chooser.querySelectorAll('button:not([disabled]),input')].filter(el=>el.getClientRects().length);
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
    }
  },true);
  window.OjjudaFriendInvites={install,pick,stop,available:()=>!!current(),cancel:id=>rpc({p_action:'cancel',p_id:id}).catch(()=>{})};
})();

/* Invitations select their server-verified member; manual nickname search stays optional. */
(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFC').trim();
  const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
  window.OjjudaSignupReferral = { mount(container, client) {
    if (!container || !client) return null;
    container.innerHTML = '<label for="signup-referrer">추천인 닉네임 <span class="referral-optional">(선택)</span></label><div class="referral-search"><input id="signup-referrer" name="referrer" type="text" maxlength="12" autocomplete="off" placeholder="추천인의 닉네임" aria-describedby="referral-status"><button type="button" class="referral-button" data-referral-search>찾기</button></div><p id="referral-status" class="referral-status" role="status" aria-live="polite"></p><div class="referral-results"></div><div class="referral-confirm" hidden></div><button type="button" class="referral-skip" hidden>추천인 없이 가입</button>';
    const input=container.querySelector('input'), search=container.querySelector('[data-referral-search]');
    const status=container.querySelector('.referral-status'), results=container.querySelector('.referral-results');
    const confirmation=container.querySelector('.referral-confirm'), skip=container.querySelector('.referral-skip');
    let selected=null, candidate=null, active=false, locked=false, run=0, timer=null, composing=false;
    let pendingQuery=null;
    let searchDue=false;
    let inviteCode=null, inviteState='';
    const pendingInvite=()=>{const code=window.OjjudaInvite?.pending();return validId(code)?code.toLowerCase():null;};
    const button=(label,action) => { const b=document.createElement('button'); b.type='button'; b.className='referral-button'; b.textContent=label; b.disabled=locked; b.addEventListener('click',action); return b; };
    function cancel() { run++; clearTimeout(timer); timer=null; pendingQuery=null; searchDue=false; }
    // Closing the form resets its UI, while the shared invitation survives a reopen.
    function reset() { cancel(); selected=candidate=null; inviteCode=null; inviteState=''; input.value=''; status.textContent=''; results.replaceChildren(); confirmation.replaceChildren(); confirmation.hidden=true; skip.hidden=true; }
    function leaveInvitation() {
      if(inviteCode||pendingInvite())window.OjjudaInvite?.clear();
      inviteCode=null;inviteState='';
    }
    function inviteError(message) {
      selected=candidate=null;inviteState='error';status.textContent=message;skip.hidden=false;
      results.replaceChildren(button('초대 다시 확인',()=>void lookupInvite(inviteCode)));
    }
    function invitedPerson(data,code) {
      if(!Array.isArray(data)||data.length!==1)return null;
      const person=data[0];
      // A saved nickname can contain expanded hearts. The server owns its length rules.
      return person&&validId(person.id)&&person.id.toLowerCase()===code&&typeof person.nickname==='string'&&person.nickname.trim()
        ? {id:person.id,nickname:person.nickname,code}:null;
    }
    function showInvite(person) {
      selected=person;candidate=null;inviteState='ready';input.value=person.nickname;
      status.textContent=`${person.nickname}님의 초대로 가입해요.`;
      confirmation.hidden=true;results.replaceChildren();skip.hidden=false;
    }
    async function lookupInvite(code) {
      if(!active||locked||!validId(code)||(inviteCode===code&&inviteState==='loading'))return;
      cancel();const request=run;
      inviteCode=code;inviteState='loading';selected=candidate=null;input.value='';
      confirmation.hidden=true;results.replaceChildren();skip.hidden=false;
      status.textContent='초대한 회원을 확인하고 있어요.';
      try {
        const {data,error}=await client.rpc('resolve_signup_referrer',{p_ref:code});
        if(request!==run||inviteCode!==code)return;
        if(pendingInvite()!==code){reset();return;}
        if(error||!Array.isArray(data))throw error||Error('invalid_response');
        const person=invitedPerson(data,code);
        if(!person){inviteError('초대한 회원을 찾을 수 없어요. 다시 확인하거나 추천인 없이 가입할 수 있어요.');return;}
        showInvite(person);
      } catch {
        if(request===run)inviteError('초대한 회원을 확인하지 못했어요. 다시 확인하거나 추천인 없이 가입할 수 있어요.');
      }
    }
    function syncInvitation() {
      if(locked)return;
      const code=pendingInvite();
      if(code===inviteCode)return;
      if(code)void lookupInvite(code);
      else if(inviteCode)reset();
    }
    function choose(person) {
      if (!active || locked) return;
      cancel(); selected=null; candidate=person; status.textContent=''; results.replaceChildren(); confirmation.replaceChildren(); confirmation.hidden=false;
      const message=document.createElement('p'); message.textContent=`‘${person.nickname}’ 님이 추천인이 맞나요?`;
      confirmation.append(message,button('이 사람이 맞아요',() => {
        if (!active || locked || candidate!==person) return;
        selected={...person}; input.value=person.nickname; candidate=null; confirmation.hidden=true;
        status.textContent=`추천인: ${person.nickname} · 확인 완료`; skip.hidden=false;
      }),button('다시 찾기',() => { candidate=null; confirmation.hidden=true; void lookup(); input.focus(); }));
    }
    async function lookup() {
      if (!active || locked || composing) return;
      const query=normalize(input.value);
      if (pendingQuery===query) return;
      cancel(); const request=run;
      selected=candidate=null; confirmation.hidden=true; results.replaceChildren(); skip.hidden=!query;
      if (!query) { status.textContent=''; return; }
      if (query.length>12) { status.textContent='닉네임을 12자 이내로 입력해 주세요.'; return; }
      pendingQuery=query;
      status.textContent='비슷한 닉네임을 찾고 있어요.';
      try {
        const {data,error}=await client.rpc('search_signup_referrers',{p_query:query});
        if (request!==run || locked || normalize(input.value)!==query) return;
        if (error || !Array.isArray(data)) throw error || Error('invalid_response');
        const people=data.filter(p=>validId(p.id)&&typeof p.nickname==='string'&&p.nickname.length<=12).slice(0,5);
        status.textContent=people.length?'추천인을 선택해 주세요.':'같거나 비슷한 닉네임이 없어요. 이름을 다시 확인해 주세요.';
        for (const person of people) {
          const b=button(person.nickname,()=>choose(person)); b.classList.add('referral-candidate');
          b.setAttribute('aria-label',`${person.nickname} 추천인으로 선택`); results.append(b);
        }
      } catch { if (request===run) status.textContent='추천인을 찾지 못했어요. 다시 찾거나 추천인 없이 가입할 수 있어요.'; }
      finally { if (request===run) pendingQuery=null; }
    }
    function changed() {
      leaveInvitation();
      cancel(); selected=candidate=null; confirmation.hidden=true; results.replaceChildren(); status.textContent=''; skip.hidden=!normalize(input.value);
      searchDue=!locked && !composing && Boolean(normalize(input.value));
      if (active && searchDue) timer=setTimeout(lookup,300);
    }
    input.addEventListener('input',changed);
    input.addEventListener('compositionstart',()=>{composing=true;cancel();});
    input.addEventListener('compositionend',()=>{composing=false;changed();});
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing)return;
      if(inviteCode&&inviteState==='ready')return;
      event.preventDefault();if(inviteCode)void lookupInvite(inviteCode);else void lookup();
    });
    search.addEventListener('click',()=>{if(!locked){leaveInvitation();void lookup();}});
    skip.addEventListener('click',()=>{if(!locked){leaveInvitation();reset();input.focus();}});
    return {
      reset,
      setActive(value) {
        if(value)syncInvitation();
        if (active===Boolean(value)) return;
        active=Boolean(value);
        // Keep results and in-flight replies with this form. Only pause an unsent lookup.
        if (!active) { clearTimeout(timer); timer=null; }
        else {syncInvitation();if (searchDue) timer=setTimeout(lookup,300);}
      },
      setBusy(value) {
        locked=!!value;
        if(locked){
          cancel();
          // A login attempt can cancel a hidden signup lookup. Let reopening
          // signup (or unlocking its active form) request that invitation again.
          if(inviteState==='loading'){inviteCode=null;inviteState='';}
        }
        for(const el of container.querySelectorAll('input,button'))el.disabled=locked;
        if(!locked&&active)syncInvitation();
      },
      read() {
        syncInvitation();
        if(inviteCode){
          if(inviteState==='loading')throw Error('초대한 회원을 확인하고 있어요. 확인이 끝난 뒤 다시 가입해 주세요.');
          if(inviteState!=='ready'||selected?.code!==inviteCode||normalize(input.value)!==normalize(selected.nickname))
            throw Error('초대 정보를 다시 확인하거나 추천인 없이 가입을 선택해 주세요.');
          return {...selected};
        }
        if (!normalize(input.value)) return null;
        if (!selected || normalize(input.value)!==selected.nickname) { input.focus(); throw Error('추천인을 찾아 선택하고, 이 사람이 맞는지 확인해 주세요.'); }
        return {...selected};
      },
      async verify(person) {
        if(!person)return;
        if(person.code){
          const request=run,code=person.code;
          try {
            const {data,error}=await client.rpc('resolve_signup_referrer',{p_ref:code});
            if(error||!Array.isArray(data))throw error||Error('invalid_response');
            const current=invitedPerson(data,code);
            if(!current){
              if(request===run&&inviteCode===code)inviteError('초대한 회원을 찾을 수 없어요. 다시 확인하거나 추천인 없이 가입할 수 있어요.');
              throw Error('추천인 정보가 바뀌었어요. 초대를 다시 확인하거나 추천인 없이 가입해 주세요.');
            }
            if(request===run&&inviteCode===code)showInvite(current);
          } catch(error) {
            if(request===run&&inviteCode===code&&inviteState!=='error')inviteError('초대한 회원을 확인하지 못했어요. 다시 확인하거나 추천인 없이 가입할 수 있어요.');
            throw Error(String(error?.message||'').startsWith('추천인')?error.message:'추천인을 확인하지 못했어요. 초대를 다시 확인하거나 추천인 없이 가입해 주세요.');
          }
          return;
        }
        const {data,error}=await client.rpc('search_signup_referrers',{p_query:person.nickname});
        if(error)throw Error('추천인을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        if(!data?.some(p=>p.id===person.id&&p.nickname===person.nickname)) {
          selected=null; status.textContent='추천인 정보가 바뀌었어요. 다시 찾아 확인해 주세요.';
          throw Error(status.textContent);
        }
      }
    };
  }};
})();

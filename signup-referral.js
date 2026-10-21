/* Optional nickname lookup with explicit selection; the server owns attribution. */
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
    const button=(label,action) => { const b=document.createElement('button'); b.type='button'; b.className='referral-button'; b.textContent=label; b.addEventListener('click',action); return b; };
    function cancel() { run++; clearTimeout(timer); timer=null; }
    function reset() { cancel(); selected=candidate=null; input.value=''; status.textContent=''; results.replaceChildren(); confirmation.replaceChildren(); confirmation.hidden=true; skip.hidden=true; }
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
      cancel(); const request=run, query=normalize(input.value);
      selected=candidate=null; confirmation.hidden=true; results.replaceChildren(); skip.hidden=!query;
      if (!query) { status.textContent=''; return; }
      if (query.length>12) { status.textContent='닉네임을 12자 이내로 입력해 주세요.'; return; }
      status.textContent='비슷한 닉네임을 찾고 있어요.';
      try {
        const {data,error}=await client.rpc('search_signup_referrers',{p_query:query});
        if (request!==run || !active || locked || normalize(input.value)!==query) return;
        if (error || !Array.isArray(data)) throw error || Error('invalid_response');
        const people=data.filter(p=>validId(p.id)&&typeof p.nickname==='string'&&p.nickname.length<=12).slice(0,5);
        status.textContent=people.length?'추천인을 선택해 주세요.':'같거나 비슷한 닉네임이 없어요. 이름을 다시 확인해 주세요.';
        for (const person of people) {
          const b=button(person.nickname,()=>choose(person)); b.classList.add('referral-candidate');
          b.setAttribute('aria-label',`${person.nickname} 추천인으로 선택`); results.append(b);
        }
      } catch { if (request===run && active) status.textContent='추천인을 찾지 못했어요. 다시 찾거나 추천인 없이 가입할 수 있어요.'; }
    }
    function changed() {
      cancel(); selected=candidate=null; confirmation.hidden=true; results.replaceChildren(); status.textContent=''; skip.hidden=!normalize(input.value);
      if (active && !locked && !composing && normalize(input.value)) timer=setTimeout(lookup,300);
    }
    input.addEventListener('input',changed);
    input.addEventListener('compositionstart',()=>{composing=true;cancel();});
    input.addEventListener('compositionend',()=>{composing=false;changed();});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void lookup();}});
    search.addEventListener('click',()=>void lookup()); skip.addEventListener('click',()=>{if(!locked){reset();input.focus();}});
    return {
      reset,
      setActive(value) { active=!!value; if(!active){cancel();results.replaceChildren();confirmation.hidden=true;} },
      setBusy(value) { locked=!!value; if(locked)cancel(); for(const el of container.querySelectorAll('input,button')) el.disabled=locked; },
      read() {
        if (!normalize(input.value)) return null;
        if (!selected || normalize(input.value)!==selected.nickname) { input.focus(); throw Error('추천인을 찾아 선택하고, 이 사람이 맞는지 확인해 주세요.'); }
        return {...selected};
      },
      async verify(person) {
        if(!person)return;
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

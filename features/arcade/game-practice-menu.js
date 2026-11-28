(() => {
  'use strict';
  const practice = window.OjjudaArcadePractice;
  if (!practice) return;
  const cardSelector = '[data-arcade-games] .gbtn';
  function gameId(card) {
    return card.dataset.v || (card.dataset.act === 'matgo-open' ? 'matgo' : '');
  }
  function available(root) {
    return [...root.querySelectorAll(cardSelector)].filter(card =>
      !card.disabled && !card.closest('[hidden],[inert]') && practice.supports(gameId(card)));
  }
  function menu(button) {
    const root = button.closest('.arcade-card');
    if (!root) return;
    const dialog = document.createElement('dialog');
    dialog.className='arcade-practice ap-picker';
    dialog.setAttribute('aria-label','게임별 튜토리얼');
    const {el}=window.OjjudaLessonPanel;
    const heading=el('h2','ap-title','게임별 튜토리얼');
    const head=el('header','picker-head');
    const list=el('div','ap-game-list');
    const close=el('button','ap-skip','닫기');
    const search=el('input','picker-search');search.type='search';search.placeholder='게임 이름 검색';search.setAttribute('aria-label','게임 이름 검색');
    const empty=el('p','picker-empty','일치하는 게임이 없어요.');empty.hidden=true;
    const dismiss=()=>{dialog.close();dialog.remove();button.focus({preventScroll:true});};
    close.onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss();};
    for(const card of available(root)){
      const id=gameId(card),meta=practice.info(id);
      const item=el('button','ap-tile');
      const art=el('img','');art.alt='';art.src=meta.art;art.loading='lazy';
      item.append(art,el('span','',meta.name));item.dataset.name=meta.name;
      item.onclick=()=>{dismiss();practice.show(id,{replay:true});};list.append(item);
    }
    search.oninput=()=>{
      const term=search.value.replace(/\s/g,'').toLowerCase();
      for(const item of list.children)item.hidden=!item.dataset.name.replace(/\s/g,'').toLowerCase().includes(term);
      empty.hidden=!!list.querySelector('button:not([hidden])');
    };
    head.append(heading,close);dialog.append(head,search,list,empty);
    document.body.append(dialog);dialog.showModal();close.focus({preventScroll:true});
  }
  // Listen before the arcade's dedicated navigation handlers (including Chacha).
  // Continuing activates the current original card, preserving room/adult/access checks.
  window.addEventListener('click',event=>{
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const picker=event.target.closest?.('[data-arcade-practice-menu]');
    if (picker) { menu(picker); return; }
    const card=event.target.closest?.(cardSelector);
    if (!card || card.disabled || !practice.supports(gameId(card))) return;
    const root=card.closest('.arcade-card'), id=gameId(card);
    const shown=practice.show(id,{onContinue:()=>{
      if (card.isConnected) {card.click();return;}
      // Presence updates can redraw the lobby while the lesson is open.
      const activeRoot=document.querySelector('.arcade-card');
      if (root && activeRoot) available(activeRoot).find(item=>gameId(item)===id)?.click();
    }});
    if (shown) {event.preventDefault();event.stopImmediatePropagation();}
  },true);
})();

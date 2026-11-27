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
    const heading=document.createElement('h2');
    heading.className='ap-title'; heading.textContent='게임별 튜토리얼';
    const list=document.createElement('div');
    list.className='ap-game-list';
    const close=document.createElement('button');
    close.type='button'; close.className='ap-skip'; close.textContent='닫기';
    const dismiss=()=>{ dialog.close(); dialog.remove(); button.focus(); };
    close.onclick=dismiss;
    dialog.oncancel=event=>{event.preventDefault();dismiss();};
    for (const card of available(root)) {
      const item=document.createElement('button');
      item.type='button'; item.className='ap-tile';
      item.textContent=card.querySelector('.game-name,span:last-child')?.firstChild?.textContent.trim() || card.getAttribute('aria-label') || gameId(card);
      item.onclick=()=>{dismiss();practice.show(gameId(card),{replay:true});};
      list.append(item);
    }
    dialog.append(heading,list,close); document.body.append(dialog); dialog.showModal();
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

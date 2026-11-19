/** Keep secondary reading actions in one accessible, explicitly opened menu. */
export function attachReaderTools(doc, {resultId, dialogId}) {
  const result=doc.getElementById(resultId),dialog=doc.getElementById(dialogId);
  const trigger=doc.querySelector(`[data-reader-tools="${dialogId}"]`);
  if(!result||!dialog||!trigger)return {open(){},close(){}};
  const close=({restoreFocus=true}={})=>{
    if(!dialog.open)return;
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    trigger.setAttribute('aria-expanded','false');
    if(restoreFocus&&!result.hidden)trigger.focus({preventScroll:true});
  };
  const open=()=>{
    if(result.hidden||dialog.open)return;
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    trigger.setAttribute('aria-expanded','true');
    dialog.querySelector('[data-reader-tools-close]')?.focus({preventScroll:true});
  };
  trigger.addEventListener('click',open);
  dialog.querySelector('[data-reader-tools-close]')?.addEventListener('click',()=>close());
  dialog.addEventListener('cancel',()=>trigger.setAttribute('aria-expanded','false'));
  dialog.addEventListener('close',()=>trigger.setAttribute('aria-expanded','false'));
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
  });
  dialog.addEventListener('click',event=>{
    if(event.target.closest('button[data-reading-size]'))close();
  });
  new doc.defaultView.MutationObserver(()=>{
    if(result.hidden)close({restoreFocus:false});
  }).observe(result,{attributes:true,attributeFilter:['hidden']});
  return {open,close};
}

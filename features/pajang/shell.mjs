// The Agit host restores focus and scroll when it dismisses its entry dialog.
if(window.parent!==window && new URLSearchParams(location.search).get('embed')==='1'){
  let agitHost=false;
  try{agitHost=window.parent.location.origin===location.origin &&
    window.parent.location.pathname==='/world.html' &&
    window.frameElement?.closest('dialog.agit-pajang-dialog[open]');}catch{}
  if(agitHost){
    document.querySelector('.agit-return')?.addEventListener('click',event=>{
      if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();
      window.parent.postMessage('pajang:close',location.origin);
    });
  }
}

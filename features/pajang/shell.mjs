// The Agit host restores focus and scroll when it dismisses its entry dialog.
if(window.parent!==window && new URLSearchParams(location.search).get('embed')==='1'){
  let agitHost=false;
  try{agitHost=window.parent.location.origin===location.origin &&
    window.parent.location.pathname==='/world.html' &&
    window.frameElement?.closest('dialog.agit-pajang-dialog[open]');}catch{}
  if(agitHost){
    const host=window.parent.document;
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();window.parent.postMessage('pajang:close',location.origin);}
    });
    if(!host.getElementById('pajang-dialog-surface')){
      const link=host.createElement('link');
      link.id='pajang-dialog-surface';
      link.rel='stylesheet';
      link.href=new URL('./dialog-surface.css?v=letter1',import.meta.url).href;
      host.head.append(link);
    }
    document.querySelector('.agit-return')?.addEventListener('click',event=>{
      if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();
      window.parent.postMessage('pajang:close',location.origin);
    });
  }
}

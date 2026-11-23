// Keep notifications and charging out of the member entry's critical module
// graph. A first tap still loads them immediately and replays that one tap.
let toolbarLoad=null, toolbarReady=false, earlyControl=null;
function prepareToolbar(){
  if(toolbarLoad)return toolbarLoad;
  toolbarLoad=import('./account-toolbar.mjs?v=20261123-independent-toolbar1')
    .then(({installPajangToolbar})=>{
      installPajangToolbar();
      toolbarReady=true;
      document.removeEventListener('click',onEarlyToolbarClick,true);
      const target=earlyControl;earlyControl=null;
      if(target?.isConnected)target.click();
    }).catch(()=>{toolbarLoad=null;earlyControl=null;});
  return toolbarLoad;
}
function onEarlyToolbarClick(event){
  if(toolbarReady)return;
  const control=event.target.closest?.('[data-ju-charge-open],[data-notifications-open]');
  if(!control)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  earlyControl=control;
  void prepareToolbar();
}
document.addEventListener('click',onEarlyToolbarClick,true);
// The first entry frame is paintable before the shared wallet/inbox scripts run.
if(typeof requestAnimationFrame==='function'){
  requestAnimationFrame(()=>setTimeout(()=>void prepareToolbar(),0));
}else{
  setTimeout(()=>void prepareToolbar(),0);
}
// Optional measurement never delays or blocks the member app and its toolbar.
void import('./usage.mjs?v=20261121-pajang-visits1')
  .then(({installPajangUsage})=>installPajangUsage()).catch(()=>{});

// The Agit host restores focus and scroll when it dismisses its entry dialog.
if(window.parent!==window && new URLSearchParams(location.search).get('embed')==='1'){
  let agitHost=false;
  try{agitHost=window.parent.location.origin===location.origin &&
    window.parent.location.pathname==='/world.html' &&
    window.frameElement?.closest('dialog.agit-pajang-dialog[open]');}catch{}
  if(agitHost){
    const host=window.parent.document;
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();window.parent.postMessage('pajang:close',location.origin);}
    });
    if(!host.getElementById('pajang-dialog-surface')){
      const link=host.createElement('link');
      link.id='pajang-dialog-surface';
      link.rel='stylesheet';
      link.href=new URL('./dialog-surface.css?v=20261119-auto-theme1',import.meta.url).href;
      host.head.append(link);
    }
    document.addEventListener('click',event=>{
      if(!(event.target instanceof Element)||!event.target.closest('a.agit-return'))return;
      if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();
      window.parent.postMessage('pajang:close',location.origin);
    });
  }
}

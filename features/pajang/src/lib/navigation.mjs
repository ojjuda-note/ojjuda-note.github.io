// Keep tab visits and the open dialog in the browser's real history. Private
// dialog contents stay in memory; history contains only an opaque dialog ID.
const key='pajangNavigation';

export function createStationHistory(win,onRestore){
  const {history,location}=win;
  const initial=history.state?.[key];
  const scope=typeof initial?.scope==='string'?initial.scope:
    (win.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36));
  const dialogs=new Map(),scrolls=new Map();
  let serial=0,pending=null,traversing=false;
  let current=read()||{scope,index:0,modal:null,scroll:win.scrollY||0};

  function read(){
    const value=history.state?.[key];
    return value?.scope===scope&&Number.isSafeInteger(value.index)&&value.index>=0?value:null;
  }
  function write(value,href=location.href,replace=true){
    try{
      history[replace?'replaceState':'pushState']({...history.state,[key]:value},'',href);
      current=value;return true;
    }catch{return false;}
  }
  function rememberScroll(){
    if(!current.modal){trackScroll();write({...current,scroll:win.scrollY||0});}
  }
  function trackScroll(){if(!current.modal)scrolls.set(current.index,win.scrollY||0);}
  function restore(cause){
    onRestore(current.modal?dialogs.get(current.modal)||null:null,scrolls.get(current.index)??current.scroll,cause);
  }
  function pop(){
    traversing=false;
    current=read()||{scope,index:0,modal:null,scroll:0};
    if(pending){
      const target=pending;pending=null;
      visit(target.href,target.replace);return;
    }
    // A reload deliberately clears a dialog's private in-memory contents.
    if(current.modal&&!dialogs.has(current.modal))write({...current,modal:null});
    restore('pop');
  }
  function visit(href,replace=false){
    if(traversing)return true;
    if(current.modal){
      pending={href,replace};traversing=true;history.back();return true;
    }
    rememberScroll();
    const target=new URL(href,location.href).href;
    if(target!==location.href){
      const value={scope,index:current.index+(replace?0:1),modal:null,scroll:0};
      if(!write(value,target,replace))return false;
      scrolls.delete(value.index);
    }
    restore('route');return true;
  }
  function open(dialog){
    if(traversing)return true;
    rememberScroll();
    const id=scope+':'+(++serial);
    dialogs.set(id,dialog);
    const value={...current,index:current.index+(current.modal?0:1),modal:id};
    if(!write(value,location.href,Boolean(current.modal))){dialogs.delete(id);return false;}
    restore('modal');return true;
  }
  function close(){
    if(traversing)return true;
    if(!current.modal)return false;
    traversing=true;history.back();return true;
  }
  function back(fallback){
    if(traversing)return;
    if(current.index>0){traversing=true;history.back();}
    else if(win.OjjudaSectionNavigation?.hasPreviousPage)win.OjjudaSectionNavigation.back();
    else visit(fallback,true);
  }
  // Mark the actual current entry, without adding an artificial tab visit.
  // A reload cannot restore private form contents. Consume its overlay entry
  // as a normal close so that the next Back still reaches the previous tab.
  const reloadedDialog=Boolean(current.modal&&current.index>0);
  if(!reloadedDialog)write({...current,modal:null});
  win.addEventListener('popstate',pop);
  win.addEventListener('pagehide',rememberScroll);
  win.addEventListener('scroll',trackScroll,{passive:true});
  if(reloadedDialog){traversing=true;history.back();}
  return {visit,open,close,back,dispose(){
    win.removeEventListener('popstate',pop);
    win.removeEventListener('pagehide',rememberScroll);
    win.removeEventListener('scroll',trackScroll);
    dialogs.clear();
  }};
}

// Keep tab visits and the open dialog in the browser's real history. Private
// dialog contents stay in memory; history contains only an opaque dialog ID.
const key='pajangNavigation';
const controllers=new WeakMap();
export const getStationHistory=win=>controllers.get(win);

export function createStationHistory(win,onRestore,options={}){
  const {history,location}=win;
  const initial=history.state?.[key];
  const scope=typeof initial?.scope==='string'?initial.scope:
    (win.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36));
  const dialogs=new Map(),externals=new Map(),backgrounds=new Map(),scrolls=new Map();
  let serial=0,pending=null,pendingClose=null,traversing=false,activeExternal=null,returning=false,closeAfterReturn=false;
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
  function canLeave(){return (!current.modal||!options.canLeave||options.canLeave())&&(!activeExternal||activeExternal.canLeave());}
  function restore(cause){
    const next=externals.get(current.modal)||null;
    if(activeExternal!==next){
      const previous=activeExternal;activeExternal=next;
      previous?.hide();next?.show();
    }
    let dialog=current.modal;
    while(dialog&&externals.has(dialog))dialog=backgrounds.get(dialog)||null;
    onRestore(dialog?dialogs.get(dialog)||null:null,scrolls.get(current.index)??current.scroll,cause);
  }
  function pop(event){
    const next=read()||{scope,index:0,modal:null,scroll:0};
    if(!canLeave()&&next.modal!==current.modal){
      // Return to the existing overlay entry while a send is pending. Pushing a
      // replacement would discard Forward and create a second close step.
      event.stopImmediatePropagation?.();traversing=true;returning=true;
      history.go(current.index-next.index||1);return;
    }
    if(returning&&next.modal===current.modal){
      event.stopImmediatePropagation?.();returning=false;traversing=false;
      if(closeAfterReturn){closeAfterReturn=false;close();}
      return;
    }
    traversing=false;
    current=next;
    if(pending){
      const target=pending;pending=null;
      visit(target.href,target.replace);return;
    }
    if(current.modal&&externals.has(current.modal)&&!externals.get(current.modal).isCurrent()){
      // Never reopen support belonging to a settings component/account that left.
      traversing=true;history.back();return;
    }
    // Only explicitly allowed, content-free dialog kinds can restart after reload.
    if(current.modal&&!dialogs.has(current.modal)){
      const resumed=options.restoreDialog?.(current.resume);
      if(resumed)dialogs.set(current.modal,resumed);
      else if(current.index>0){traversing=true;history.back();return;}
      else write({...current,modal:null,resume:null});
    }
    restore('pop');
    const finished=pendingClose;pendingClose=null;finished?.();
  }
  function visit(href,replace=false){
    if(traversing||!canLeave())return true;
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
  function open(dialog,external=null,{stack=false}={}){
    if(traversing||!canLeave())return true;
    rememberScroll();
    const id=scope+':'+(++serial);
    dialogs.set(id,dialog);
    if(external)externals.set(id,external);
    if(external&&stack&&current.modal)backgrounds.set(id,current.modal);
    const replace=Boolean(current.modal&&!stack);
    const value={...current,index:current.index+(replace?0:1),modal:id,resume:options.persistDialog?.(dialog)||null};
    if(!write(value,location.href,replace)){dialogs.delete(id);externals.delete(id);backgrounds.delete(id);return false;}
    restore('modal');return true;
  }
  function close(){
    if(traversing){if(returning&&canLeave())closeAfterReturn=true;return true;}
    if(!canLeave())return true;
    if(!current.modal)return false;
    traversing=true;history.back();return true;
  }
  function closeExternal(external,finished){
    if(externals.get(current.modal)!==external)return false;
    if(!canLeave())return true;
    if(finished)pendingClose=finished;
    return close();
  }
  function back(fallback){
    if(traversing||!canLeave())return;
    if(current.index>0){traversing=true;history.back();}
    else if(win.OjjudaSectionNavigation?.hasPreviousPage)win.OjjudaSectionNavigation.back();
    else visit(fallback,true);
  }
  // Mark the actual current entry, without adding an artificial tab visit.
  // A reload cannot restore private form contents. Consume its overlay entry
  // as a normal close so that the next Back still reaches the previous tab.
  const resumedDialog=current.modal&&options.restoreDialog?.(current.resume);
  if(resumedDialog)dialogs.set(current.modal,resumedDialog);
  const reloadedDialog=Boolean(current.modal&&current.index>0&&!resumedDialog);
  if(resumedDialog)write(current);
  else if(!reloadedDialog)write({...current,modal:null,resume:null});
  win.addEventListener('popstate',pop,true);
  win.addEventListener('pagehide',rememberScroll);
  win.addEventListener('scroll',trackScroll,{passive:true});
  if(reloadedDialog){traversing=true;history.back();}
  const controller={visit,open,close,back,canLeave,openExternal:(external,options)=>open(null,external,options),closeExternal,dispose(){
    win.removeEventListener('popstate',pop,true);
    win.removeEventListener('pagehide',rememberScroll);
    win.removeEventListener('scroll',trackScroll);
    dialogs.clear();
    externals.clear();backgrounds.clear();controllers.delete(win);
  }};
  controllers.set(win,controller);
  if(resumedDialog)restore('reload');
  return controller;
}

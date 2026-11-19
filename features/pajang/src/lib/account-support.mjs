import '../../../../note/support.js';
import {client} from '../../member.mjs';
import {getStationHistory} from './navigation.mjs';

let styles, connection, currentContext;

function loadStyle(href) {
  const existing=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.getAttribute('href')===href);
  if(existing?.sheet)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const link=existing||document.createElement('link');
    let timer;
    const finish=error=>{
      clearTimeout(timer);
      link.removeEventListener('load',loaded);link.removeEventListener('error',failed);
      if(error){link.remove();reject(Error('support_unavailable'));}else resolve();
    };
    const loaded=()=>finish(),failed=()=>finish(true);
    link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});
    timer=setTimeout(failed,12000);
    if(!existing){link.rel='stylesheet';link.href=href;document.head.append(link);}
  });
}

function prepareStyles() {
  if(!styles)styles=Promise.all([
    loadStyle('/note/support.css?v=20261119-support-layout1'),
    loadStyle('/features/pajang/support.css?v=20261119-withdrawal-disclosure1')
  ]).catch(error=>{styles=null;throw error;});
  return styles;
}

function valid(context) {
  return currentContext===context&&!context.invalidated&&context.isCurrent()&&context.userId===connection?.userId;
}

function openWithdrawal() {
  const context=currentContext;
  if(!context?.userId||!valid(context))return;
  const next=()=>{
    if(!valid(context))return;
    context.invalidated=true;
    context.onOpen('withdraw');
  };
  // The inquiry footer closes first; replace its consumed entry with the
  // existing withdrawal confirmation rather than stacking two dialogs.
  if(!getStationHistory(window)?.closeExternal(context.overlay,next))next();
}

function connect(db,userId) {
  if(connection){
    if(connection.db!==db)throw Error('support_unavailable');
    if(connection.userId!==userId)throw Error('account_changed');
    return;
  }
  connection={db,userId,revision:0};
  db.auth.onAuthStateChange((_event,session)=>{
    const next=session?.user&&!session.user.is_anonymous?session.user.id:null;
    if(connection.userId!==next){connection.userId=next;connection.revision++;}
    if(currentContext?.userId&&currentContext.userId!==connection.userId)currentContext.invalidated=true;
  });
  window.OjjudaNoteSupport.install({
    client:db,getUserId:()=>connection.userId,source:'pajang',getScreen:()=>'profile',
    onWithdrawal:openWithdrawal
  });
  const layer=document.querySelector('.note-support-layer');
  layer?.classList.add('pajang-support-layer');
  if(layer)new MutationObserver(()=>{
    if(layer.hidden&&currentContext?.overlay)getStationHistory(window)?.closeExternal(currentContext.overlay);
  }).observe(layer,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('beforeunload',event=>{
    const support=window.OjjudaNoteSupport;
    if(support.isOpen()&&!support.canLeave()){
      event.preventDefault();event.returnValue='';
    }
  });
  document.addEventListener('click',event=>{
    const support=window.OjjudaNoteSupport,link=event.target.closest?.('a[href]');
    if(link&&support.isOpen()&&!support.canLeave()&&link.closest('.note-support-layer')){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
}

export async function openPajangSupport({owner,isCurrent,onOpen}) {
  const context={owner,isCurrent,onOpen,userId:null,invalidated:false,overlay:null};
  currentContext=context;
  const [db]=await Promise.all([client(),prepareStyles()]);
  if(currentContext!==context||!isCurrent())return false;
  const authConnection=connection,authRevision=connection?.revision;
  const {data,error}=await db.auth.getSession();
  if(currentContext!==context||!isCurrent())return false;
  if(authConnection&&(connection!==authConnection||authConnection.revision!==authRevision))throw Error('account_changed');
  const user=data?.session?.user;
  if(error||!user?.id||user.is_anonymous)throw Error('account_changed');
  context.userId=user.id;
  connect(db,user.id);
  if(!valid(context))return false;
  const support=window.OjjudaNoteSupport;
  context.overlay={
    isCurrent:()=>valid(context),canLeave:()=>!support.isOpen()||support.canLeave(),
    show:()=>{if(valid(context)&&!support.isOpen())support.open();},hide:()=>support.close()
  };
  if(!getStationHistory(window)?.openExternal(context.overlay))support.open();
  return true;
}

export function closePajangSupport(owner) {
  if(currentContext?.owner!==owner)return;
  const context=currentContext;context.invalidated=true;
  window.OjjudaNoteSupport.close();
  getStationHistory(window)?.closeExternal(context.overlay);
  currentContext=null;
}

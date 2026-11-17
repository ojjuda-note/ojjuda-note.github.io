/* A separate storage entry per completion keeps simultaneous games from replacing each other's records. */
(()=>{
 'use strict';
 const sessionRecords=new Map();
 function guestIdentity(){
  const key='ojjuda.guest-ranking.v1';
  try{
   let token=localStorage.getItem(key);
   if(!/^[0-9a-f]{64}$/.test(token||'')){
    token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,token);
   }
   return token;
  }catch{return 'session';}
 }
 function open(game,owner){
  const guest=!owner||owner==='guest',identity=guest?guestIdentity():owner;
  const prefix='ojjuda.puzzle.pending.v1:'+game+':'+identity+':';
  if(!sessionRecords.has(prefix))sessionRecords.set(prefix,new Map());
  const memory=sessionRecords.get(prefix);
  function list(){
   const items=new Map(memory);
   try{
    for(let i=0;i<localStorage.length;i++){
     const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;
     try{
      const item=JSON.parse(localStorage.getItem(key));
      if(item?.id===key.slice(prefix.length)&&Number.isFinite(Date.parse(item.completedAt)))items.set(item.id,item);
     }catch{}
    }
   }catch{}
   return Array.from(items.values()).sort((a,b)=>a.completedAt.localeCompare(b.completedAt));
  }
  function put(item){
   const key=prefix+item.id;
   try{
    const existing=JSON.parse(localStorage.getItem(key));
    if(existing?.id===item.id&&Number.isFinite(Date.parse(existing.completedAt)))return existing;
    localStorage.setItem(key,JSON.stringify(item));
    memory.delete(item.id);
   }catch{if(!memory.has(item.id))memory.set(item.id,item);}
   return memory.get(item.id)||item;
  }
  function remove(id){memory.delete(id);try{localStorage.removeItem(prefix+id);}catch{}}
  function durable(id){try{return localStorage.getItem(prefix+id)!==null;}catch{return false;}}
  return {list,put,remove,durable,current:()=>!guest||guestIdentity()===identity};
 }
 function putPicture(store,stage,completedAt){
  const time=Date.parse(completedAt);
  if(!Number.isFinite(time))return null;
  const month=new Date(time+8*3600000).toISOString().slice(0,7);
  return store.put({id:month+':'+stage,stage,completedAt});
 }
 function rememberPicture(game,owner,stage,completedAt){
  const store=open(game,owner),item=putPicture(store,stage,completedAt);
  return !!item&&store.durable(item.id);
 }
 function pictures({game,owner,active,submit,status}){
  const store=open(game,owner);let busy=false,requested=false,disposed=false;
  const canSend=()=>!disposed&&active()&&store.current();
  async function flush(){
   if(!canSend())return;
   if(busy){requested=true;return;}
   busy=true;
   try{
    do{
     requested=false;
     for(const item of store.list()){
      if(!canSend())return;
      try{
       const result=await submit(item);
       if(result?.ok!==true)throw Error('pending');
       store.remove(item.id);
       if(canSend())status('saved',result,item);
      }catch{if(canSend())status('failed');}
     }
    }while(requested&&canSend());
    if(canSend()&&store.list().length)status('failed');
   }finally{busy=false;}
  }
  function add(stage,completedAt=new Date(Date.now()).toISOString()){
   if(!canSend()||!putPicture(store,stage,completedAt))return;
   status('saving');void flush();
  }
  addEventListener('online',flush);
  return {add,flush,dispose(){disposed=true;removeEventListener('online',flush);}};
 }
 window.OjjudaPuzzleRecords={open,pictures,rememberPicture};
})();

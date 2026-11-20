import {openRoom,roomIdentity} from './room.mjs?v=20261120-yut-lobby1';

const MESSAGES={
  not_signed_in:'로그인하면 대전방을 만들고 참여할 수 있어요.',
  banned:'지금은 대전방을 이용할 수 없어요.',
  room_full:'다른 사람이 먼저 참여했어요. 다른 방을 골라 주세요.',
  room_unavailable:'이미 닫혔거나 참여할 수 없는 방이에요.',
  room_already_started:'이미 시작한 방이에요. 다른 방을 골라 주세요.',
  room_in_progress:'참여 중인 대전방으로 먼저 돌아가 주세요.',
  room_identity_mismatch:'다른 창에서 참여한 방이에요. 그 창에서 나간 뒤 다시 참여해 주세요.',
  room_rate_limit:'방을 너무 빠르게 만들었어요. 잠시 후 다시 시도해 주세요.',
  not_room_owner:'방장만 시작하거나 방을 닫을 수 있어요.',
  not_room_member:'이 방의 참가자가 아니에요.',
  need_players:'참가자를 기다리거나 빈자리를 컴퓨터로 채워 주세요.',
  state_conflict:'참가자가 바뀌었어요. 확인한 뒤 다시 시작해 주세요.',
  invalid_title:'방 제목을 1~40자로 입력해 주세요.',
  invalid_capacity:'참가 인원은 2~8명으로 골라 주세요.',
  invalid_options:'놀이 설정을 다시 확인해 주세요.',
  unavailable:'연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
};
function problem(value){
  const code=Object.keys(MESSAGES).find(key=>String(value?.code||'')===key||String(value?.message||value||'').includes(key))||'unavailable';
  const error=Error(MESSAGES[code]);error.code=code;return error;
}
const number=value=>{const n=Number(typeof value==='object'?value?.room_no:value);if(!Number.isSafeInteger(n)||n<1001)throw problem('room_unavailable');return n;};
const stored=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
const store=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}};

/** Authenticated discovery wraps the existing signed Broadcast game. */
export function createYutLobby(client,{onAuthChange=()=>{},timeoutMs=14000}={}){
  let userId=null,closed=false,subscription=null,epoch=0,authRevision=0,opening=false;
  const active=new Set(),identities=new Map();
  const identityKey=(owner,suffix)=>`ojjuda-yut-key:${owner}:${suffix}`;
  function changeUser(next){
    if(next===userId)return;
    const previous=userId;userId=next;epoch++;
    if(previous)for(const game of active)void game.close().catch(()=>{});
    onAuthChange(userId);
  }
  async function enter(){
    if(closed)throw problem('unavailable');
    if(!subscription&&client.auth.onAuthStateChange)subscription=client.auth.onAuthStateChange((_event,session)=>{
      authRevision++;
      changeUser(session?.user&&!session.user.is_anonymous?session.user.id:null);
    }).data?.subscription;
    const stamp=authRevision,{data,error}=await client.auth.getSession();
    if(closed)throw problem('unavailable');
    if(error)throw problem(error);
    const next=data?.session?.user&&!data.session.user.is_anonymous?data.session.user.id:null;
    if(stamp===authRevision||next===userId)changeUser(next);
    return userId;
  }
  async function call(action,roomNo=null,options={},signal,expected=userId){
    if(closed||!expected||expected!==userId)throw problem('not_signed_in');
    const stamp=epoch;
    const controller=signal?null:new AbortController(),requestSignal=signal||controller.signal;
    let timer;
    try{
      const request=client.rpc('yut_room_service',{p_action:action,p_room:roomNo,p_options:options});
      const response=request.abortSignal?request.abortSignal(requestSignal):request;
      const {data,error}=await Promise.race([response,new Promise((_,reject)=>{
        timer=setTimeout(()=>{controller?.abort();reject(problem('unavailable'));},timeoutMs);
      })]);
      if(closed||epoch!==stamp||userId!==expected)throw problem('not_signed_in');
      if(error)throw problem(error);
      if(!data?.ok)throw problem(data?.error||'unavailable');
      return data;
    }finally{clearTimeout(timer);}
  }
  async function open(action,roomNo,params,setup,update){
    if(opening)throw problem('unavailable');
    opening=true;
    let registered=null,owner=null;
    try{
      owner=await enter();
      if(!owner)throw problem('not_signed_in');
      const stamp=epoch;
      const requestId=params?.request_id||crypto.randomUUID();
      const savedKey=identityKey(owner,action==='create'?'request:'+requestId:'room:'+roomNo);
      if(!identities.has(savedKey))identities.set(savedKey,roomIdentity(stored(savedKey)).catch(error=>{identities.delete(savedKey);throw error;}));
      const me=await identities.get(savedKey);store(savedKey,me.jwk);
      if(closed||epoch!==stamp)throw problem('not_signed_in');
      const options=action==='create'?{key:me.id,title:params.title,capacity:params.capacity,request_id:requestId,setup:setup||{}}:{key:me.id};
      registered=(await call(action,roomNo,options,undefined,owner)).room;
      if(!registered?.players?.some(p=>p.key===me.id&&!p.departed))throw problem('not_room_member');
      const id=number(registered.room_no);
      store(identityKey(owner,'room:'+id),me.jwk);
      identities.set(identityKey(owner,'room:'+id),Promise.resolve(me));
      const game=await openRoom(registered.host,update,()=>client,registered.setup,{
        identity:me,initial:registered,
        read:async()=>(await call('heartbeat',id,{},undefined,owner)).room,
        start:async(keys,fillBots)=>(await call('start',id,{keys,fill_bots:fillBots},undefined,owner)).room,
        leave:()=>call('leave',id,{},undefined,owner)
      });
      if(closed||epoch!==stamp){await game.close().catch(()=>{});throw problem('not_signed_in');}
      const close=game.close.bind(game);
      game.close=async()=>{active.delete(game);await close();};active.add(game);
      return game;
    }catch(error){
      // A failed realtime subscription must not leave a phantom public seat.
      if(registered&&userId===owner&&!closed)await call('leave',registered.room_no,{},undefined,owner).catch(()=>{});
      throw error;
    }finally{opening=false;}
  }
  return {
    get userId(){return userId;},enter,
    async list(signal){if(!userId)await enter();return call('list',null,{},signal);},
    create(params,setup,update){return open('create',null,params,setup,update);},
    join(roomNo,update){return open('join',number(roomNo),null,null,update);},
    async cancel(room){if(!userId)await enter();return call('leave',number(room));},
    async close(){
      if(closed)return;
      subscription?.unsubscribe();subscription=null;
      // Permit the current actor's final leave before invalidating the client.
      await Promise.allSettled([...active].map(game=>game.close()));
      closed=true;epoch++;userId=null;identities.clear();
    }
  };
}

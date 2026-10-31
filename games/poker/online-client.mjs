const messages={gold_empty:'포커 골드를 먼저 충전해 주세요.',gold_not_empty:'1,000골드 미만일 때 충전할 수 있어요.',round_in_progress:'진행 중인 판을 마친 뒤 충전해 주세요.',paid_confirmation_required:'5쭈 충전 버튼을 눌러 확인해 주세요.',insufficient_zzu:'쭈가 부족해요. 5쭈가 필요합니다.',no_account:'계정 정보를 확인하지 못했어요.',adult_required:'만 19세 이상 회원만 참여할 수 있어요.',member_identity_required:'생년월일 확인 후 다시 입장해 주세요.',not_signed_in:'다시 로그인해 주세요.',banned:'이용이 제한된 계정이에요.',room_in_progress:'참여 중인 방으로 돌아갈게요.',room_rate_limit:'잠시 후 다시 방을 만들어 주세요.',room_full:'다른 사람이 먼저 참여했어요.',room_not_found:'방 코드를 다시 확인해 주세요.',room_unavailable:'이미 시작하거나 종료된 방이에요.',not_room_owner:'방장만 시작할 수 있어요.',need_players:'두 명 이상 모이면 시작할 수 있어요.',state_conflict:'차례가 바뀌었어요. 현재 판을 불러왔습니다.',not_your_turn:'내 차례를 기다려 주세요.',invalid_move:'지금 가능한 동작을 다시 골라 주세요.',unavailable:'연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.'};
export function rotateView(room){
 if(!room.game)return null;
 const g=structuredClone(room.game),n=g.players.length,seat=room.seat,at=i=>i<0?i:(i-seat+n)%n;
 g.players=Array.from({length:n},(_,i)=>({...g.players[(seat+i)%n],computer:room.computerSeats?.includes((seat+i)%n)||false}));
 g.turn=at(g.turn);g.dealer=at(g.dealer);
 if(g.result){g.result.payouts=Array.from({length:n},(_,i)=>g.result.payouts[(seat+i)%n]);g.result.net=Array.from({length:n},(_,i)=>g.result.net[(seat+i)%n]);g.result.pots.forEach(p=>p.winners=p.winners.map(at));}
 const legal=g.legal;g.legal=()=>legal;return g;
}
// Wake just after an automatic turn is due, instead of adding a full polling interval.
export function pollDelay(room,{hidden=false,now=Date.now(),failures=0}={}){
 if(hidden)return 5000;
 if(failures)return Math.min(10000,1200*2**Math.min(failures,3));
 const g=room?.game,automatic=room?.status==='active'&&g&&(['between','runout'].includes(g.phase)||room.mode==='solo'&&g.turn>0||room.computerSeats?.includes(g.turn));
 if(automatic){
  const remaining=Date.parse(room.deadline)-(room.serverTime+now-room.receivedAt);
  if(Number.isFinite(remaining))return Math.max(80,Math.min(1200,remaining+50));
 }
 return 1200;
}
export function createOnlineClient({onRoom=()=>{},onError=()=>{},onConnection=()=>{},onWallet=()=>{},isPaused=()=>false}={}){
 let room=null,closed=false,pollTimer=null,busy=false,reading=false,readTask=null,retry=null,walletKey='',walletLocked=false,failures=0;
 const pending=new Map();
 function rpc(body){
  if(closed)return Promise.reject(Error('closed'));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);const e=Error(messages.unavailable);e.code='unavailable';reject(e);},18000);
   pending.set(id,{resolve,reject,timer});parent.postMessage({source:'ojjuda-poker',type:'rpc',id,body},location.origin);
  });
 }
 function receive(event){
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='ojjuda-world'||event.data.type!=='poker-rpc')return;
  const entry=pending.get(event.data.id);if(!entry)return;pending.delete(event.data.id);clearTimeout(entry.timer);
  if(event.data.error){const e=Error(messages[event.data.error]||messages.unavailable);e.code=event.data.error;entry.reject(e);}else entry.resolve(event.data.data);
 }
 window.addEventListener('message',receive);
 function accept(next,force=false){
  const changed=force||!room||!next||room.id!==next.id||room.version!==next.version;
  if(next)next.receivedAt=Date.now();room=next;if(changed)onRoom(room);onConnection('');
 }
 function acceptData(data){let changed=false;if(data.wallet){const key=JSON.stringify(data.wallet);changed=!!walletKey&&key!==walletKey;walletKey=key;walletLocked=data.wallet.locked===true;onWallet(data.wallet);}if(Object.hasOwn(data,'room'))accept(data.room,changed);}
 function schedule(){clearTimeout(pollTimer);if(!closed&&(room||walletLocked)&&!isPaused())pollTimer=setTimeout(read,room?pollDelay(room,{hidden:document.hidden,failures}):document.hidden?8000:4000);}
 async function read(){
  if(closed||reading||busy||!room&&!walletLocked||isPaused()){schedule();return;}
  reading=true;
  readTask=(async()=>{
   try{const data=await rpc(room?{action:'read',room_id:room.id}:{action:'mine'});if(closed)return;failures=0;acceptData(data);}
   catch(error){if(closed)return;failures++;onConnection(error.message);if(['room_not_found','room_unavailable','adult_required','not_signed_in'].includes(error.code)){accept(null);onError(error.message);}}
   finally{reading=false;schedule();}
  })();
  await readTask;
 }

 async function enter(){
  const data=await rpc({action:'mine'});acceptData(data);schedule();return data.room;
 }
 async function list(){return (await rpc({action:'list'})).rooms||[];}
 async function act(action,values={}){
  if(busy)return false;busy=true;
  if(reading)await readTask;
  const prior=room;
  try{
   const fingerprint=JSON.stringify([action,room?.id||null,values]);
   const request_id=retry?.fingerprint===fingerprint?retry.id:crypto.randomUUID();retry={fingerprint,id:request_id};
   const data=await rpc({action,...(room?{room_id:room.id,version:room.version}:{}),...values,request_id});retry=null;
   failures=0;acceptData(data);return true;
  }catch(error){
   if(error.code!=='unavailable')retry=null;
   if(action==='leave'&&['room_not_found','room_unavailable'].includes(error.code)){accept(null);return true;}
   onError(error.message);
   if(error.code==='room_in_progress')try{await enter();}catch{}
   else if(prior&&['state_conflict','not_your_turn','unavailable'].includes(error.code))try{acceptData(await rpc({action:'read',room_id:prior.id}));if(action==='leave'&&room){acceptData(await rpc({action:'leave',room_id:room.id,version:room.version,request_id:crypto.randomUUID()}));return true;}}catch(recovery){if(action==='leave'&&['room_not_found','room_unavailable'].includes(recovery.code)){accept(null);return true;}}
   return false;
  }finally{busy=false;schedule();}
 }
 function visible(){if(document.hidden)schedule();else void read();}
 document.addEventListener('visibilitychange',visible);
 function close(){closed=true;clearTimeout(pollTimer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('message',receive);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();}
 return {enter,list,act,read,close,refill:paid=>act('refill',{paid}),get room(){return room;},get busy(){return busy;}};
}

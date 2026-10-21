const messages={adult_required:'만 19세 이상 회원만 참여할 수 있어요.',member_identity_required:'생년월일 확인 후 다시 입장해 주세요.',not_signed_in:'다시 로그인해 주세요.',banned:'이용이 제한된 계정이에요.',room_in_progress:'참여 중인 방으로 돌아갈게요.',room_rate_limit:'잠시 후 다시 방을 만들어 주세요.',room_full:'다른 사람이 먼저 참여했어요.',room_not_found:'방 코드를 다시 확인해 주세요.',room_unavailable:'이미 시작하거나 종료된 방이에요.',not_room_owner:'방장만 시작할 수 있어요.',need_players:'두 명 이상 모이면 시작할 수 있어요.',state_conflict:'차례가 바뀌었어요. 현재 판을 불러왔습니다.',not_your_turn:'내 차례를 기다려 주세요.',invalid_move:'지금 가능한 동작을 다시 골라 주세요.',unavailable:'연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.'};
export function rotateView(room){
 if(!room.game)return null;
 const g=structuredClone(room.game),n=g.players.length,seat=room.seat,at=i=>i<0?i:(i-seat+n)%n;
 g.players=Array.from({length:n},(_,i)=>g.players[(seat+i)%n]);
 g.turn=at(g.turn);g.dealer=at(g.dealer);
 if(g.result){g.result.payouts=Array.from({length:n},(_,i)=>g.result.payouts[(seat+i)%n]);g.result.net=Array.from({length:n},(_,i)=>g.result.net[(seat+i)%n]);g.result.pots.forEach(p=>p.winners=p.winners.map(at));}
 const legal=g.legal;g.legal=()=>legal;return g;
}
export function createOnlineClient({onRoom=()=>{},onError=()=>{},onConnection=()=>{}}={}){
 let room=null,closed=false,pollTimer=null,busy=false,reading=false,readTask=null;
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
 function accept(next){
  const changed=!room||!next||room.id!==next.id||room.version!==next.version;
  if(next)next.receivedAt=Date.now();room=next;if(changed)onRoom(room);onConnection('');
 }
 function schedule(){clearTimeout(pollTimer);if(!closed&&room)pollTimer=setTimeout(read,document.hidden?5000:1200);}
 async function read(){
  if(closed||reading||busy||!room){schedule();return;}
  reading=true;
  readTask=(async()=>{
   try{const data=await rpc({action:'read',room_id:room.id});accept(data.room);}
   catch(error){onConnection(error.message);if(['room_not_found','room_unavailable','adult_required','not_signed_in'].includes(error.code)){accept(null);onError(error.message);}}
   finally{reading=false;schedule();}
  })();
  await readTask;
 }

 async function enter(){
  const data=await rpc({action:'mine'});accept(data.room);schedule();return data.room;
 }
 async function list(){return (await rpc({action:'list'})).rooms||[];}
 async function act(action,values={}){
  if(busy)return false;busy=true;
  if(reading)await readTask;
  const prior=room;
  try{
   const data=await rpc({action,...(room?{room_id:room.id,version:room.version}:{}),...values,request_id:crypto.randomUUID()});
   accept(data.room);return true;
  }catch(error){
   onError(error.message);
   if(error.code==='room_in_progress')try{await enter();}catch{}
   else if(prior&&['state_conflict','not_your_turn','unavailable'].includes(error.code))try{accept((await rpc({action:'read',room_id:prior.id})).room);if(action==='leave'&&room){accept((await rpc({action:'leave',room_id:room.id,version:room.version,request_id:crypto.randomUUID()})).room);return true;}}catch{}
   return false;
  }finally{busy=false;schedule();}
 }
 function close(){closed=true;clearTimeout(pollTimer);window.removeEventListener('message',receive);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();}
 return {enter,list,act,read,close,get room(){return room;},get busy(){return busy;}};
}

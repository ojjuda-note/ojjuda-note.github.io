// Persist the request before charging so an uncertain response can be retried safely.
function requestId(){
 if(crypto.randomUUID)return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function createHintPurchase({storage,request,uuid=requestId}){
 const key=owner=>'ojjuda-bang-hint-v1:'+owner;
 let flight=null;
 function read(owner){
  try{const r=JSON.parse(storage().getItem(key(owner)));return r?.owner===owner&&['pending','ready'].includes(r.status)?r:null;}catch{return null;}
 }
 function write(owner,record){
  const s=storage(),value=JSON.stringify(record);s.setItem(key(owner),value);
  if(s.getItem(key(owner))!==value)throw Error('storage');
 }
 async function buy(owner,room){
  if(flight)return flight;
  flight=(async()=>{
   let record=read(owner);
   if(record?.status==='ready')return {ok:true,record};
   if(!record){
    record={owner,id:uuid(),roomId:room.id,version:room.version,status:'pending'};
    try{write(owner,record);}catch{return {ok:false,reason:'storage'};}
   }
   let result;
   try{result=await request({action:'hint',request_id:record.id,room_id:record.roomId,version:record.version});}
   catch{return {ok:false,reason:'pending'};}
   if(result?.ok&&result.kind==='bang_hint'&&result.price===1&&result.request_id===record.id&&result.room_id===record.roomId&&result.version===record.version){
    record={...record,status:'ready'};
    try{write(owner,record);}catch{return {ok:false,reason:'pending'};}
    return {ok:true,record};
   }
   const reason=result?.reason||result?.error;
   if(['coins','banned','invalid','not_signed_in','sign_in','wallet_unavailable','request_conflict','room_unavailable','state_conflict','not_your_turn'].includes(reason)){
    try{write(owner,{...record,status:'declined'});}catch{return {ok:false,reason:'pending'};}
    return {ok:false,reason};
   }
   return {ok:false,reason:'pending'};
  })();
  try{return await flight;}finally{flight=null;}
 }
 function consume(owner,id){
  const record=read(owner);if(record?.status!=='ready'||record.id!==id)return false;
  try{write(owner,{...record,status:'used'});return true;}catch{return false;}
 }
 return {read,buy,consume,get busy(){return !!flight;}};
}

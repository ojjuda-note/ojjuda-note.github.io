// This service stays in World. Only room geometry crosses the house MessagePort.
// The caller owns the local backup, pending edits and the revision it loaded.
const roomKeys=['x','y','decor','curtains','shelf','furniture'];
const poseKeys=['x','y','direction','elevation','mode','attachedTo','accessories'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function geometry(value){
 if(!object(value)||!Number.isInteger(value.version)||value.version<1||value.version>100||!Array.isArray(value.rooms)||!value.rooms.length||value.rooms.length>35)throw new Error('방 배치를 확인해 주세요.');
 const pose=value=>{
  if(!object(value))throw new Error('가구 배치를 확인해 주세요.');
  const result=pick(value,poseKeys);
  if(!Number.isFinite(result.x)||!Number.isFinite(result.y)||result.x<0||result.x>10||result.y<0||result.y>7||!['left','center','right'].includes(result.direction))throw new Error('가구 배치를 확인해 주세요.');
  if(result.accessories!==undefined){if(!object(result.accessories)||Object.keys(result.accessories).length>128||Object.entries(result.accessories).some(([id,v])=>!validId(id)||typeof v!=='boolean'))throw new Error('가구 배치를 확인해 주세요.');result.accessories={...result.accessories};}
  if(result.elevation!==undefined&&(!Number.isFinite(result.elevation)||result.elevation<0||result.elevation>4.5))throw new Error('가구 높이를 확인해 주세요.');
  if(result.mode!==undefined&&!['floor','sofa'].includes(result.mode)||result.attachedTo!==undefined&&result.attachedTo!=='desk')throw new Error('가구 배치를 확인해 주세요.');
  return result;
 };
 const rooms=value.rooms.map(value=>{
  if(!object(value)||!Number.isInteger(value.x)||Math.abs(value.x)>2||!Number.isInteger(value.y)||Math.abs(value.y)>3)throw new Error('방 배치를 확인해 주세요.');
  const result=pick(value,roomKeys);
  for(const key of ['decor','curtains'])if(result[key]!==undefined&&typeof result[key]!=='boolean')throw new Error('방 배치를 확인해 주세요.');
  if(result.shelf!=null)result.shelf=pose(result.shelf);
  if(result.furniture!==undefined){if(!object(result.furniture)||Object.keys(result.furniture).length>128)throw new Error('가구 배치를 확인해 주세요.');result.furniture=Object.fromEntries(Object.entries(result.furniture).map(([id,value])=>{if(!validId(id))throw new Error('가구 배치를 확인해 주세요.');return[id,pose(value)];}));}
  return result;
 });
 const snapshot={version:value.version,rooms};
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>131072)throw new Error('방 배치가 너무 커서 저장하지 못했어요.');
 return snapshot;
}
const validId=id=>/^[a-zA-Z0-9_-]{1,128}$/.test(id);
const revision=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function createWorldRoom({client,owner,authorized}){
 const check=()=>{if(typeof owner!=='string'||!owner||typeof authorized!=='function'||!authorized())throw new Error('로그인을 다시 확인해 주세요.');};
 async function rpc(name,args){
  check();let timeout;
  try{
   const result=await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('house_room_timeout')),15000);})]);check();
   if(result?.error)throw result.error;if(!object(result?.data)||typeof result.data.ok!=='boolean')throw new Error('house_room_bad_response');return result.data;
  }catch(error){
   check();const raw=String(error?.message||error||''),message=/house_room_unavailable/.test(raw)?'지금은 이 집을 방문할 수 없어요.':/house_room_not_owner|house_room_not_authenticated|42501|permission denied/.test(raw)?'로그인과 방 저장 권한을 다시 확인해 주세요.':/house_room_bad_snapshot/.test(raw)?'방 배치를 확인해 주세요. 이 기기의 배치는 그대로 남아 있어요.':'방을 불러오거나 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
   const failure=new Error(message);failure.code=error?.code||(/house_room_unavailable/.test(raw)?'house_room_unavailable':'house_room_request_failed');throw failure;
  }finally{clearTimeout(timeout);}
 }
 return async(action,args={})=>{
  check();
  if(action==='load'){
   const data=await rpc('house_room_load',{p_owner:owner});
   if(data.ok!==true||typeof data.found!=='boolean'||typeof data.canEdit!=='boolean')throw new Error('방 정보를 확인하지 못했어요. 다시 시도해 주세요.');
   const door=typeof data.doorClosed==='boolean'?{doorClosed:data.doorClosed}:{};
   if(!data.found)return{ok:true,found:false,canEdit:data.canEdit,...door};
   if(!revision(data.revision)||typeof data.updatedAt!=='string')throw new Error('방 정보를 확인하지 못했어요. 다시 시도해 주세요.');
   return{ok:true,found:true,snapshot:geometry(data.snapshot),revision:data.revision,updatedAt:data.updatedAt,canEdit:data.canEdit,...door};
  }
  if(action==='save'){
   if(args.revision!==null&&!revision(args.revision))throw new Error('저장된 방을 먼저 확인해 주세요.');
   const data=await rpc('house_room_save',{p_owner:owner,p_snapshot:geometry(args.snapshot),p_revision:args.revision});
   if(data.ok===false&&data.reason==='conflict')return{ok:false,reason:'conflict'};
   if(data.ok!==true||!revision(data.revision)||typeof data.updatedAt!=='string')throw new Error('저장 결과를 확인하지 못했어요. 이 기기의 배치를 보존하고 다시 시도해 주세요.');
   return{ok:true,revision:data.revision,updatedAt:data.updatedAt};
  }
  throw new Error('지원하지 않는 방 작업이에요.');
 };
}

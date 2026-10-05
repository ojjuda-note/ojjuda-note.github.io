// Files stay in this browser, separately from the existing room and diary save.
const database='ojjuda-house-record-media',metadata='records',files='files';
export const MEDIA_TYPES={photo:['image/jpeg','image/png','image/webp','image/gif','image/avif'],video:['video/mp4','video/webm','video/ogg','video/quicktime']};
export const MEDIA_LIMITS={photo:20*1024*1024,video:100*1024*1024};
function open(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open(database,1);let blocked=false;
 request.onupgradeneeded=()=>{const db=request.result,store=db.createObjectStore(metadata,{keyPath:['owner','id']});store.createIndex('category',['owner','kind']);db.createObjectStore(files,{keyPath:['owner','id']});};
 request.onerror=()=>reject(request.error);
 request.onblocked=()=>{blocked=true;reject(new Error('다른 우리집 창을 닫고 다시 시도해 주세요.'));};
 request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
});}
async function transaction(owner,mode,operation,signal){
 if(typeof owner!=='string'||!owner||owner.length>180)throw new Error('계정을 확인해 주세요.');
 signal?.throwIfAborted();const db=await open();
 try{signal?.throwIfAborted();return await new Promise((resolve,reject)=>{
  const tx=db.transaction([metadata,files],mode);let result;
  const abort=()=>tx.abort();signal?.addEventListener('abort',abort,{once:true});
  const cleanup=()=>signal?.removeEventListener('abort',abort);
  tx.oncomplete=()=>{cleanup();resolve(result);};tx.onabort=()=>{cleanup();reject(tx.error||new DOMException('저장을 취소했어요.','AbortError'));};tx.onerror=()=>{};
  try{operation(tx.objectStore(metadata),tx.objectStore(files),value=>{result=value;});}catch(error){tx.abort();reject(error);}
 });}finally{db.close();}
}
export async function listRecordMedia(owner,kind,signal){
 return transaction(owner,'readonly',(records,blobs,done)=>{
  const request=records.index('category').getAll([owner,kind]);
  request.onsuccess=()=>done(request.result.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id)));
 },signal);
}
export async function readRecordMedia(owner,id,signal){
 return transaction(owner,'readonly',(records,blobs,done)=>{const request=blobs.get([owner,id]);request.onsuccess=()=>done(request.result?.blob);},signal);
}
export async function addRecordMedia(owner,kind,selected,signal){
 const batch=Array.from(selected);
 if(!MEDIA_TYPES[kind]||!batch.length)throw new Error('추가할 파일을 선택해 주세요.');
 if(batch.length>10)throw new Error('한 번에 10개까지 추가할 수 있어요.');
 for(const file of batch){
  if(!(file instanceof Blob)||!MEDIA_TYPES[kind].includes(file.type))throw new Error(kind==='photo'?'JPG, PNG, WEBP, GIF, AVIF 사진을 선택해 주세요.':'MP4, WEBM, OGG, MOV 동영상을 선택해 주세요.');
  if(!file.size||file.size>MEDIA_LIMITS[kind])throw new Error(`${kind==='photo'?'사진은 20':'동영상은 100'}MB 이하의 비어 있지 않은 파일을 선택해 주세요.`);
 }
 // Both stores commit together. A failed batch never leaves partial entries.
 return transaction(owner,'readwrite',(records,blobs,done)=>{
  const added=batch.map((file,index)=>({owner,id:crypto.randomUUID(),kind,name:(file.name||'기록').slice(0,240),type:file.type,size:file.size,createdAt:Date.now()+index}));
  added.forEach((record,index)=>{records.add(record);blobs.add({owner,id:record.id,blob:batch[index]});});done(added);
 },signal);
}
export async function deleteRecordMedia(owner,id,signal){
 return transaction(owner,'readwrite',(records,blobs)=>{records.delete([owner,id]);blobs.delete([owner,id]);},signal);
}

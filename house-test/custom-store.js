// Administrator-local items; no credentials or images are put in localStorage.
const database='ojjuda-house-made-items',storeName='items';
const validOwner=owner=>typeof owner==='string'&&owner.length>0&&owner.length<=180;
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore(storeName,{keyPath:['owner','id']});s.createIndex('owner','owner');};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('다른 제작실 창을 닫고 다시 시도해 주세요.'));r.onsuccess=()=>resolve(r.result);});}
async function transaction(owner,mode,operation){
 if(!validOwner(owner))throw new Error('관리자 계정을 확인해 주세요.');
 const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction(storeName,mode);let result;const r=operation(t.objectStore(storeName));r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>resolve(result);t.onabort=()=>reject(t.error||new Error('아이템 저장을 완료하지 못했어요.'));t.onerror=()=>{};});}finally{db.close();}
}
export async function listMadeItems(owner){return (await transaction(owner,'readonly',s=>s.index('owner').getAll(owner))).filter(r=>r.owner===owner&&/^made-[a-f0-9]{24}$/.test(r.id));}
export async function saveMadeItem(owner,runtime,project){
 const serialized=JSON.stringify(runtime);if(serialized.length>120000000)throw new Error('아이템 파일이 너무 커요. 그림 크기를 줄여 주세요.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));const id='made-'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
 const records=await listMadeItems(owner);if(records.length>=20&&!records.some(r=>r.id===id))throw new Error('이 기기에 등록한 제작 아이템이 20개예요. 작업 파일을 따로 보관해 주세요.');
 const record={owner,id,runtime,project,updatedAt:new Date().toISOString()};
 try{await transaction(owner,'readwrite',s=>s.put(record));}catch(e){if(e.name==='QuotaExceededError')throw new Error('기기 저장 공간이 부족해요. 작업 파일로 먼저 저장해 주세요.');throw e;}return record;
}

import {useEffect, useRef, useState} from "react";

const bucket = "pajang-exchange-photos";
const maxSize = 2 * 1024 * 1024;
const maxCount = 10;
type Photo = {id:string; slot:number; path:string};
type Db = Awaited<ReturnType<typeof window.OjjudaGetClient>>;

async function photos<T>(db:Db, action:string, peer?:string, id?:string):Promise<T> {
  const {data,error} = await db.rpc("pajang_photos",{p_action:action,p_peer:peer??null,p_photo:id??null});
  if (error) throw Object.assign(new Error(error.message), {code:error.code});
  return data as T;
}

export async function removeAllExchangePhotos() {
  const db = await window.OjjudaGetClient();
  const files = await photos<Photo[]>(db,"list");
  if (!files.length) return;
  const {error} = await db.storage.from(bucket).remove(files.map(item=>item.path));
  if (error) throw new Error("사진을 모두 지우지 못했어요. 다시 시도해 주세요.");
  // The profile-delete transaction releases all now-empty reservations via its FK cascade.
}

async function downloadPhoto(file:Photo, signal:AbortSignal):Promise<Blob> {
  const db = await window.OjjudaGetClient();
  const {data:{session}} = await db.auth.getSession();
  if (!session || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(file.path)) throw Error();
  const config = (window as Window & {OJJUDA_CONFIG:{supabaseUrl:string;supabaseKey:string}}).OJJUDA_CONFIG;
  const url = new URL("/storage/v1/object/authenticated/"+bucket+"/"+file.path,config.supabaseUrl);
  const response = await fetch(url,{headers:{Authorization:"Bearer "+session.access_token,apikey:config.supabaseKey},cache:"no-store",signal});
  if (!response.ok) throw Error();
  const bytes = await response.blob();
  if (!bytes.size || bytes.size>maxSize) throw Error();
  const signature = new Uint8Array(await bytes.slice(0,3).arrayBuffer());
  if (signature[0]!==255 || signature[1]!==216 || signature[2]!==255) throw Error();
  return bytes.slice(0,bytes.size,"image/jpeg");
}

async function jpeg(file:File) {
  if (!file.size || file.size>32*1024*1024) throw new Error("32MB 이하의 사진을 골라 주세요.");
  if (file.type==="image/svg+xml" || /\.svgz?$/i.test(file.name)) throw new Error("휴대폰 사진이나 JPG·PNG 이미지를 골라 주세요.");
  const url=URL.createObjectURL(file);
  const image=new Image();
  try {
    await new Promise<void>((ok,fail)=>{image.onload=()=>ok();image.onerror=()=>fail(new Error("사진을 열 수 없어요. JPG나 PNG로 저장해서 다시 골라 주세요."));image.src=url;});
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const ctx=canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 준비하지 못했어요.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [0.86,0.68,0.50]) {
      const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if (result && result.size<=maxSize) return result;
    }
    throw new Error("사진 크기를 줄인 뒤 다시 올려 주세요.");
  } finally {URL.revokeObjectURL(url);}
}

function PrivatePhoto({photo,number}:{photo:Photo;number:number}) {
  const [url,setUrl]=useState(""),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    let objectUrl="";
    setUrl("");setFailed(false);
    downloadPhoto(photo,abort.signal).then(blob=>{
      if (!abort.signal.aborted) {objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}
    }).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
    return ()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[photo.path,retry]);
  return url?<img src={url} alt={"교환 사진 "+number}/>:failed?
    <button type="button" className="secondary" aria-label={number+"번 사진 다시 보기"} onClick={()=>setRetry(x=>x+1)}>사진 다시 보기</button>:
    <span className="photo-pending" role="status">사진을 불러오는 중…</span>;
}

async function uploadOne(db:Db,file:File,owner:string) {
  const body=await jpeg(file);
  const {data:{session}}=await db.auth.getSession();
  if(session?.user?.id!==owner) throw new Error("로그인 계정이 바뀌었어요. 사진을 다시 선택해 주세요.");
  const id=crypto.randomUUID();
  const item=await photos<Photo>(db,"reserve",undefined,id);
  try {
    const {error}=await db.storage.from(bucket).upload(item.path,body,{contentType:"image/jpeg",cacheControl:"0",upsert:false});
    if(error) throw error;
  } catch (cause) {
    // A connection can drop after Storage accepted the file. Re-read before freeing the reservation.
    const listed=await photos<Photo[]>(db,"list");
    if (listed.some(p=>p.id===id)) return;
    await photos(db,"release",undefined,id);
    throw new Error("사진을 올리지 못했어요. 다시 시도해 주세요.",{cause});
  }
}

function PhotoLibrary({peer}:{peer?:string}) {
  const [items,setItems]=useState<Photo[]>([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const working=useRef(false),mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let alive=true, sequence=0;
    const pull=async()=>{
      const request=++sequence;
      try {
        const db=await window.OjjudaGetClient();
        const list=await photos<Photo[]>(db,"list",peer);
        if(alive && request===sequence){setItems(list);setError("");}
      } catch {
        if(alive && request===sequence){setItems([]);setError(peer?"사진 교환 상태를 확인해 주세요.":"사진 목록을 불러오지 못했어요.");}
      } finally {if(alive && request===sequence)setLoading(false);}
    };
    setLoading(true);setError("");void pull();
    const onVisibility=()=>{
      if(document.hidden && peer){sequence++;setItems([]);setLoading(true);}
      else if(!document.hidden)void pull();
    };
    document.addEventListener("visibilitychange",onVisibility);
    const timer=peer?window.setInterval(()=>{if(!document.hidden)void pull();},12000):undefined;
    return ()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[peer,revision]);
  async function change(work:(db:Db)=>Promise<string>) {
    if(working.current) return;
    working.current=true;setBusy(true);setNote("");
    try {
      const db=await window.OjjudaGetClient();
      const result=await work(db);
      if(mounted.current)setNote(result);
    } catch (err) {if(mounted.current)setNote(err instanceof Error?err.message:"다시 시도해 주세요.");}
    finally {working.current=false;if(mounted.current){setBusy(false);setRevision(v=>v+1);}}
  }
  const upload=async(files:File[])=>{
    if(!files.length)return;
    if(files.length+items.length>maxCount){setNote("사진은 10장까지예요. 남은 자리에 맞춰 골라 주세요.");return;}
    await change(async db=>{
      const {data:{session}}=await db.auth.getSession();
      if(!session?.user?.id)throw new Error("다시 로그인해 주세요.");
      for(const file of files){if(!mounted.current)break;await uploadOne(db,file,session.user.id);}
      return "선택한 사진을 등록했어요.";
    });
  };
  const remove=(item:Photo)=>change(async db=>{
    const {error}=await db.storage.from(bucket).remove([item.path]);
    if(error) throw new Error("사진을 지우지 못했어요. 다시 시도해 주세요.");
    await photos(db,"release",undefined,item.id);
    return "사진을 삭제했어요.";
  });
  return <section className="exchange-photos" aria-label={peer?"교환한 사진":"내 교환 사진"}>
    {!peer&&<><p>사진은 선택 사항이에요. 최대 10장까지 올릴 수 있어요.</p>
      <label className="photo-picker">사진 추가하기 <span>({items.length}/10)</span>
        <input type="file" accept="image/*" multiple disabled={loading||busy||items.length>=maxCount||!!error}
          onChange={event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void upload(files);}}/>
      </label></>}
    {error?<p role="alert">{error} <button type="button" className="textbtn" onClick={()=>setRevision(v=>v+1)}>다시 시도</button></p>:
      !items.length?<p className="photo-empty" role="status">{loading?"사진 목록을 불러오는 중…":peer?"상대가 등록한 사진이 없어요.":"아직 등록한 사진이 없어요."}</p>:null}
    {items.length>0&&<ul>{items.map((photo,i)=><li key={photo.id}><PrivatePhoto photo={photo} number={i+1}/>
      {!peer&&<button type="button" className="photo-remove" disabled={busy} aria-label={(i+1)+"번 사진 삭제"} onClick={()=>void remove(photo)}>삭제</button>}</li>)}</ul>}
    <p role="status">{busy?"사진을 정리하고 있어요.":note}</p>
  </section>;
}

export function MyExchangePhotos() { return <PhotoLibrary/>; }
export function SharedExchangePhotos({peer}:{peer:string}) { return <PhotoLibrary key={peer} peer={peer}/>; }

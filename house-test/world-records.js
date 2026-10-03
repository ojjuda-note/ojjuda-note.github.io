// Runs in the signed-in World page. Only scoped records and short-lived URLs
// cross the house MessagePort; the Supabase client and session stay here.
const columns='id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at';
export function createWorldRecords({client,owner,authorized,getFriends=()=>[],prepareMedia,onChange=()=>{}}){
 const check=()=>{if(!authorized())throw new Error('로그인을 다시 확인해 주세요.');};
 async function result(query){check();const {data,error}=await query;check();if(error)throw new Error('앨범을 불러오거나 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');return data;}
 const own=table=>client.from(table).select(table==='media'?columns:'id,name,visibility,allowed').eq('user_id',owner);
 const media=id=>result(own('media').eq('id',id).single());
 async function sign(paths){if(!paths.length)return new Map();const data=await result(client.storage.from('media').createSignedUrls(paths.filter(Boolean),900));return new Map((data||[]).map(row=>[row.path,row.signedUrl]));}
 async function list({kind,folder='all',offset=0}={}){
  if(!['photo','video'].includes(kind)||!Number.isSafeInteger(offset)||offset<0)throw new Error('기록 종류를 확인해 주세요.');
  let query=own('media').eq('type',kind==='photo'?'image':'video').order('created_at',{ascending:false}).order('id',{ascending:false});
  if(folder==='none')query=query.is('folder_id',null);else if(folder!=='all')query=query.eq('folder_id',folder);
  const [rows,folders]=await Promise.all([result(query.range(offset,offset+12)),result(own('media_folders').order('created_at',{ascending:true}))]);
  const visible=rows.slice(0,12),urls=await sign(visible.map(row=>row.thumb_path||row.path));check();
  return {records:visible.map(({path,thumb_path,...row})=>({...row,thumbnail:urls.get(thumb_path||path)||null})),folders,friends:getFriends().map(({id,nick})=>({id,nick})),more:rows.length>12};
 }
 async function open({id}){const row=await media(id),urls=await sign([row.path]);return {url:urls.get(row.path),type:row.type,caption:row.caption};}
 const visibility=value=>{if(!['all','friends','me'].includes(value))throw new Error('공개범위를 골라 주세요.');return value;};
 async function folder(id){if(id)await result(own('media_folders').eq('id',id).single());return id||null;}
 async function saveFolder({id,name,visibility:vis,allowed=[]}){
  if(typeof name!=='string'||!name.trim()||name.trim().length>20)throw new Error('폴더 이름을 20자 이내로 적어 주세요.');
  if(vis!=='chosen')visibility(vis);
  const friends=new Set(getFriends().map(row=>row.id));
  if(vis==='chosen'&&(!Array.isArray(allowed)||!allowed.length||allowed.some(id=>!friends.has(id))))throw new Error('볼 수 있는 친구를 골라 주세요.');
  const values={name:name.trim(),visibility:vis,allowed:vis==='chosen'?[...new Set(allowed)]:[]};
  const query=id?client.from('media_folders').update(values).eq('user_id',owner).eq('id',id):client.from('media_folders').insert({...values,user_id:owner});
  const saved=await result(query.select('id,name,visibility,allowed').single());onChange({folder:saved});return saved;
 }
 async function saveMedia({id,caption='',visibility:vis,folder_id}){
  if(typeof caption!=='string'||caption.length>100)throw new Error('설명은 100자 이내로 적어 주세요.');
  const values={caption:caption.trim(),visibility:visibility(vis),folder_id:await folder(folder_id)};check();
  const saved=await result(client.from('media').update(values).eq('user_id',owner).eq('id',id).select(columns).single());onChange({media:saved});return {id:saved.id};
 }
 async function upload({file,kind,visibility:vis='me',folder_id}){
  if(!(file instanceof Blob)||!['photo','video'].includes(kind)||!file.type.startsWith(kind==='photo'?'image/':'video/'))throw new Error('사진이나 동영상 파일을 선택해 주세요.');
  visibility(vis);const folderId=await folder(folder_id);check();
  const prepared=await prepareMedia(file);check();if(!prepared)throw new Error('사진은 20MB, 영상은 1분·50MB 이내의 지원 파일을 선택해 주세요.');
  const extensions={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'};
  if(!extensions[prepared.mime])throw new Error('지원하지 않는 파일 형식이에요.');
  const id=crypto.randomUUID(),path=`${owner}/${id}.${extensions[prepared.mime]}`,thumbPath=`${owner}/${id}_thumb.jpg`,box=client.storage.from('media');
  const thumb=prepared.thumb instanceof Blob?prepared.thumb:await(await fetch(prepared.thumb)).blob();check();
  // Roll back only newly uploaded objects, never an existing album record.
  const uploaded=[];let committed=false,attemptedInsert=false;
  try{
   let response=await box.upload(path,prepared.body,{contentType:prepared.mime,upsert:false});if(response.error)throw response.error;uploaded.push(path);check();
   response=await box.upload(thumbPath,thumb,{contentType:'image/jpeg',upsert:false});if(response.error)throw response.error;uploaded.push(thumbPath);check();
   attemptedInsert=true;response=await client.from('media').insert({id,user_id:owner,type:prepared.kind,path,thumb_path:thumbPath,duration:prepared.duration||0,visibility:vis,folder_id:folderId,caption:''}).select(columns).single();
   if(response.error)throw response.error;committed=true;check();onChange({media:response.data});return {id};
  }catch(error){
   if(!committed&&uploaded.length){
    let absent=!attemptedInsert;
    // A lost insert response may still have committed. Never delete its files
    // unless a subsequent owner-scoped read confirms there is no album row.
    if(attemptedInsert&&authorized()){const probe=await Promise.resolve(client.from('media').select('id').eq('user_id',owner).eq('id',id).maybeSingle()).catch(()=>({error:true}));absent=!probe.error&&!probe.data;}
    if(absent)await box.remove(uploaded).catch(()=>{});
   }
   throw new Error('앨범에 저장하지 못했어요. 연결과 파일을 확인한 뒤 다시 시도해 주세요.');
  }
 }
 const actions={list,open,'save-folder':saveFolder,'save-media':saveMedia,upload};
 return async(action,args={})=>{check();if(!Object.hasOwn(actions,action))throw new Error('지원하지 않는 앨범 작업이에요.');return actions[action](args);};
}

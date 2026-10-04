// Runs in the signed-in World page. Only scoped records and short-lived URLs
// cross the house MessagePort; the Supabase client and session stay here.
const columns='id,type,path,thumb_path,caption,duration,visibility,folder_id,created_at';
export function createWorldRecords({client,owner,authorized,getFriends=()=>[],prepareMedia,onChange=()=>{}}){
 const check=()=>{if(!authorized())throw new Error('로그인을 다시 확인해 주세요.');};
 async function result(query){check();const {data,error}=await query;check();if(error)throw new Error('앨범을 불러오거나 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');return data;}
 const own=table=>client.from(table).select(table==='media_folders'?'id,name,visibility,allowed,allowed_groups':table==='house_friend_groups'?'id,name,members':columns).eq('user_id',owner);
 const media=id=>result(own('media').eq('id',id).single());
 async function sign(paths){if(!paths.length)return new Map();const data=await result(client.storage.from('media').createSignedUrls(paths.filter(Boolean),900));return new Map((data||[]).map(row=>[row.path,row.signedUrl]));}
 async function list({kind,folder='all',offset=0,trash=false}={}){
  if(!['all','text','photo','video'].includes(kind)||!Number.isSafeInteger(offset)||offset<0)throw new Error('기록 종류를 확인해 주세요.');
  let query=own(trash?'house_trash_records':'house_records').in('type',trash||kind==='all'?['image','video','text']:[kind==='photo'?'image':kind==='text'?'text':'video']).order('created_at',{ascending:false}).order('id',{ascending:false}).order('type',{ascending:false});
  if(!trash&&folder==='none')query=query.is('folder_id',null);else if(!trash&&folder!=='all')query=query.eq('folder_id',folder);
  const [rows,folders,groups]=await Promise.all([result(query.range(offset,offset+12)),result(own('media_folders').order('created_at',{ascending:true})),result(own('house_friend_groups').order('created_at',{ascending:true}))]);
  const visible=rows.slice(0,12),urls=await sign(visible.map(row=>row.thumb_path||row.path).filter(Boolean));check();
  return {records:visible.map(({path,thumb_path,...row})=>({...row,thumbnail:urls.get(thumb_path||path)||null})),folders,groups,friends:getFriends().map(({id,nick})=>({id,nick})),more:rows.length>12};
 }
 async function open({id,type,trash=false}){
  const row=type?await result(own(trash?'house_trash_records':'house_records').eq('id',id).eq('type',type).single()):await media(id);
  if(row.type==='text')return {type:'text',caption:row.caption};
  const urls=await sign([row.path]);return {url:urls.get(row.path),type:row.type,caption:row.caption};
 }
 const visibility=value=>{if(!['all','friends','me'].includes(value))throw new Error('공개범위를 골라 주세요.');return value;};
 async function folder(id){if(id)await result(own('media_folders').eq('id',id).single());return id||null;}
 async function saveFolder({id,name,visibility:vis,allowed=[],allowed_groups=[]}){
  if(typeof name!=='string'||!name.trim()||name.trim().length>20)throw new Error('폴더 이름을 20자 이내로 적어 주세요.');
  if(vis!=='chosen')visibility(vis);
  const friends=new Set(getFriends().map(row=>row.id));
  if(vis==='chosen'){
   if(!Array.isArray(allowed)||!Array.isArray(allowed_groups)||allowed.some(id=>!friends.has(id)))throw new Error('볼 수 있는 친구·그룹을 확인해 주세요.');
   const groups=new Set((await result(own('house_friend_groups'))).map(row=>row.id));
   if(allowed_groups.some(id=>!groups.has(id)))throw new Error('선택한 그룹이 없어졌어요. 새로고침 후 다시 골라 주세요.');
  }
  const values={name:name.trim(),visibility:vis,allowed:vis==='chosen'?[...new Set(allowed)]:[],allowed_groups:vis==='chosen'?[...new Set(allowed_groups)]:[]};
  const query=id?client.from('media_folders').update(values).eq('user_id',owner).eq('id',id):client.from('media_folders').insert({...values,user_id:owner});
  const saved=await result(query.select('id,name,visibility,allowed,allowed_groups').single());onChange({folder:saved});return saved;
 }
 async function saveGroup({id,name,members=[],create=false}){
  if(typeof id!=='string'||!id||typeof name!=='string'||!name.trim()||name.trim().length>20)throw new Error('그룹 이름을 20자 이내로 적어 주세요.');
  const friends=new Set(getFriends().map(row=>row.id));
  if(!Array.isArray(members)||members.length>500||members.some(id=>!friends.has(id)))throw new Error('그룹에 넣을 친구를 다시 확인해 주세요.');
  return result(client.rpc('house_save_friend_group',{p_id:id,p_name:name.trim(),p_members:[...new Set(members)],p_create:!!create}));
 }
 async function deleteGroup({id}){
  if(typeof id!=='string'||!id)throw new Error('삭제할 그룹을 골라 주세요.');
  const data=await result(client.rpc('house_delete_friend_group',{p_id:id}));onChange({deletedGroup:id});return data;
 }
 async function saveMedia({id,caption='',visibility:vis,folder_id}){
  if(typeof caption!=='string'||caption.length>100)throw new Error('설명은 100자 이내로 적어 주세요.');
  const values={caption:caption.trim(),visibility:visibility(vis),folder_id:await folder(folder_id)};check();
  const saved=await result(client.from('media').update(values).eq('user_id',owner).eq('id',id).select(columns).single());onChange({media:saved});return {id:saved.id};
 }
 async function deleteFolder({id}){
  if(typeof id!=='string'||!id)throw new Error('삭제할 폴더를 골라 주세요.');
  const data=await result(client.rpc('house_delete_media_folder',{p_folder_id:id}));onChange({deletedFolder:id});return data;
 }
 async function moveMedia({ids,folder_id=null}){
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!id||id.length>128))throw new Error('옮길 게시물을 1개부터 100개까지 골라 주세요.');
  const data=await result(client.rpc('house_move_media',{p_ids:[...new Set(ids)],p_folder_id:folder_id||null}));onChange({movedMedia:{ids:data.ids,folder: data.folder_id}});return data;
 }
 async function savePost({id,body='',folder_id=null,visibility:vis='me',create=false}){
  if(typeof id!=='string'||!id||id.length>128||typeof body!=='string'||!body.trim()||body.trim().length>4000)throw new Error('글을 1자부터 4,000자까지 적어 주세요.');
  visibility(vis);return result(client.rpc('house_save_post',{p_id:id,p_body:body,p_folder_id:folder_id||null,p_visibility:vis,p_create:!!create}));
 }
 async function manageRecords({action,media_ids=[],post_ids=[],folder_id=null}){
  if(!['move','trash','restore'].includes(action)||!Array.isArray(media_ids)||!Array.isArray(post_ids)||media_ids.length+post_ids.length<1||media_ids.length+post_ids.length>100||[...media_ids,...post_ids].some(id=>typeof id!=='string'||!id||id.length>128))throw new Error('게시물을 1개부터 100개까지 골라 주세요.');
  const data=await result(client.rpc('house_manage_records',{p_action:action,p_media_ids:[...new Set(media_ids)],p_post_ids:[...new Set(post_ids)],p_folder_id:folder_id||null}));
  if(action==='move')onChange({movedMedia:{ids:data.media_ids,folder:data.folder_id}});
  if(action==='trash')onChange({trashedMedia:data.media_ids});
  if(action==='restore')for(const row of data.media||[])onChange({media:row});
  return {count:data.media_ids.length+data.post_ids.length};
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
 const actions={list,open,'save-group':saveGroup,'delete-group':deleteGroup,'save-folder':saveFolder,'save-media':saveMedia,'delete-folder':deleteFolder,'move-media':moveMedia,'save-post':savePost,'manage-records':manageRecords,upload};
 return async(action,args={})=>{check();if(!Object.hasOwn(actions,action))throw new Error('지원하지 않는 앨범 작업이에요.');return actions[action](args);};
}

/* One comment/photo service and one visual editor for both restaurant views. */
(function (global) {
 'use strict';
 const BUCKET='restaurant-comment-photos',MAX_SOURCE=20*1024*1024,MAX_OUTPUT=2*1024*1024;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const CERTIFIED=/^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/;
 const MIME=['image/jpeg','image/png','image/webp'];
 const pathValid=path=>typeof path==='string'&&path.length<130&&path.split('/').length===3&&UUID.test(path.split('/')[0])&&UUID.test(path.split('/')[1])&&UUID.test(path.split('/')[2].replace(/\.jpg$/,''))&&path.endsWith('.jpg');
 const valid=(kind,id)=>typeof id==='string'&&id.length>0&&id.length<=80&&(kind==='recommended'?UUID.test(id):kind==='certified'&&CERTIFIED.test(id));
 const node=(tag,cls,content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;};
 const button=(label,cls)=>{const b=node('button',cls,label);b.type='button';return b;};
 const messageFor=(error,defaultText)=>{
  const s=String(error?.message||'')+' '+String(error?.code||'');
  if(/sign_in_required|member_unavailable|session|jwt|42501|auth/i.test(s))return '로그인 상태를 확인하고 다시 열어 주세요.';
  if(/daily_limit/i.test(s))return '오늘 남길 수 있는 댓글을 모두 사용했어요.';
  if(/too_fast/i.test(s))return '댓글은 5초 간격으로 올려 주세요.';
  if(/photo_missing/i.test(s))return '사진 업로드에 실패했어요. 다시 선택해 주세요.';
  if(/target_unavailable/i.test(s))return '이 맛집의 댓글을 작성할 수 없어요.';
  return defaultText;
 };
 async function jpeg(file){
  if(!file||typeof file.size!=='number'||!file.size||file.size>MAX_SOURCE||!MIME.includes(String(file.type).toLowerCase()))throw new Error('JPG·PNG·WEBP 사진(20MB 이하)을 골라 주세요.');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value);
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!jpg&&!png&&!webp)throw new Error('사진 파일 형식을 확인해 주세요.');
  let bitmap,objectUrl;
  try{
   if(typeof global.createImageBitmap==='function')bitmap=await global.createImageBitmap(file,{imageOrientation:'from-image'});
   else{objectUrl=URL.createObjectURL(file);bitmap=new Image();bitmap.src=objectUrl;await bitmap.decode();}
   const w=bitmap.width||bitmap.naturalWidth,h=bitmap.height||bitmap.naturalHeight;
   if(!w||!h||w*h>64000000)throw new Error('사진 해상도가 너무 커요.');
   const ratio=Math.min(1,1280/Math.max(w,h)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
   const context=canvas.getContext('2d');if(!context)throw new Error('사진을 준비할 수 없어요.');
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const encode=quality=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진을 줄이지 못했어요.')),'image/jpeg',quality));
   let blob=await encode(.82);if(blob.size>MAX_OUTPUT)blob=await encode(.6);
   if(!blob.size||blob.size>MAX_OUTPUT)throw new Error('사진 용량을 줄이지 못했어요.');
   return blob;
  }finally{bitmap?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);}
 }
 function create({client,getUser}={}){
  let destroyed=false,epoch=0;const pending=new Set();
  const member=()=>{const user=getUser?.();return user?.id&&!user.is_anonymous&&UUID.test(user.id)?user.id:null;};
  let observed=member();
  const subscription=client?.auth?.onAuthStateChange?.((event,session)=>{
   const next=session?.user?.id&&!session.user.is_anonymous?session.user.id:null;
   if(event==='SIGNED_OUT'||session?.user&&next!==observed){epoch++;for(const controller of pending)controller.abort();}
   if(event==='SIGNED_OUT'||session?.user)observed=next;
  });
  async function rpc(name,args,{write=false}={}){
   const id=member(),generation=epoch;
   if(destroyed||typeof client?.rpc!=='function'||write&&!id)throw new Error('sign_in_required');
   const controller=new AbortController();pending.add(controller);let timer;
   try{
    let request=client.rpc(name,args);if(typeof request?.abortSignal==='function')request=request.abortSignal(controller.signal);
    const result=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('restaurant_comment_timeout'));},25000);})]);
    if(destroyed||generation!==epoch||member()!==id)throw new Error('restaurant_comment_session_changed');
    if(result?.error)throw result.error;
    return result?.data;
   }finally{clearTimeout(timer);pending.delete(controller);}
  }
  function photoUrl(path){
   if(!pathValid(path))return '';
   const url=client?.storage?.from(BUCKET)?.getPublicUrl(path)?.data?.publicUrl;
   try{const target=new URL(url),base=new URL(client.supabaseUrl);return target.protocol==='https:'&&target.origin===base.origin&&target.pathname.includes('/storage/v1/object/public/'+BUCKET+'/')?target.href:'';}catch{return '';}
  }
  const cleanupKey=owner=>'ojjuda.restaurant-comment-cleanup.v1.'+owner;
  function queue(owner,path){
   if(!UUID.test(owner||'')||!pathValid(path)||!path.startsWith(owner+'/'))return;
   try{const old=JSON.parse(localStorage.getItem(cleanupKey(owner))||'[]');localStorage.setItem(cleanupKey(owner),JSON.stringify([...new Set([...(Array.isArray(old)?old:[]),path])].slice(-100)));}catch{}
  }
  async function erase(owner,path){
   if(member()!==owner||!pathValid(path)||!path.startsWith(owner+'/'))return;
   try{const result=await client.storage.from(BUCKET).remove([path]);if(result?.error)throw result.error;}
   catch{queue(owner,path);}
  }
  async function flush(){
   const owner=member();if(!owner)return;
   let paths=[];try{paths=JSON.parse(localStorage.getItem(cleanupKey(owner))||'[]');}catch{}
   if(!Array.isArray(paths)||!paths.length)return;
   // Referenced photos cannot be removed: the Storage DELETE guard checks the
   // database again, so uncertain saves remain intact.
   for(const path of paths.slice(0,20)){
    if(member()!==owner)return;
    if(!pathValid(path)||!path.startsWith(owner+'/'))continue;
    try{
     const result=await client.storage.from(BUCKET).remove([path]);if(result?.error)continue;
     paths=paths.filter(item=>item!==path);
     localStorage.setItem(cleanupKey(owner),JSON.stringify(paths));
    }catch{}
   }
  }
  function normalize(row){
   if(!row||!UUID.test(row.id)||typeof row.body!=='string'||row.body.length>500)return null;
   return {id:row.id,body:row.body,author_name:String(row.author_name||'회원').slice(0,60),created_at:row.created_at,
    mine:row.mine===true,photo_url:photoUrl(row.photo_path)};
  }
  return {
   async list(kind,id,offset=0){
    if(!valid(kind,id)||!Number.isSafeInteger(offset)||offset<0||offset>1000)throw new Error('restaurant_comment_invalid_input');
    const rows=await rpc('list_restaurant_comments',{p_kind:kind,p_id:id,p_limit:20,p_offset:offset});
    if(!Array.isArray(rows)||rows.length>20||rows.some(row=>!normalize(row)))throw new Error('restaurant_comment_response_invalid');
    return rows.map(normalize);
   },
   async save(kind,id,body,file){
    if(!valid(kind,id)||typeof body!=='string'||body.trim().length>500||!body.trim()&&!file)throw new Error('restaurant_comment_invalid_input');
    const owner=member();if(!owner)throw new Error('sign_in_required');
    const commentId=crypto.randomUUID();let path=null;
    if(file){
     const photo=await jpeg(file);
     if(member()!==owner||destroyed)throw new Error('restaurant_comment_session_changed');
     path=owner+'/'+commentId+'/'+crypto.randomUUID()+'.jpg';
     const result=await client.storage.from(BUCKET).upload(path,photo,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
     if(result?.error)throw result.error;
    }
    try{
     const data=await rpc('save_restaurant_comment',{p_comment_id:commentId,p_kind:kind,p_id:id,p_body:body.trim(),p_photo_path:path},{write:true});
     if(!data?.saved||data.id!==commentId)throw new Error('restaurant_comment_response_invalid');
     void flush();return data;
    }catch(error){if(path)await erase(owner,path);throw error;}
   },
   async remove(id){
    if(!UUID.test(id||''))throw new Error('restaurant_comment_invalid_input');
    const owner=member();const result=await rpc('delete_restaurant_comment',{p_comment_id:id},{write:true});
    if(result?.deleted&&result.photo_path)await erase(owner,result.photo_path);
    void flush();return result;
   },
   destroy(){destroyed=true;epoch++;for(const controller of pending)controller.abort();pending.clear();subscription?.data?.subscription?.unsubscribe?.();},
   flush
  };
 }
 function mountEditor(container,{name='',canPost=false,load,save,remove,isCurrent=()=>true}={}){
  let disposed=false,loading=false,busy=false,offset=0,selected=null,previewUrl='',generation=0;
  const current=()=>{try{return !disposed&&isCurrent();}catch{return false;}};
  container.classList.add('orc-editor');container.setAttribute('aria-label',name+' 댓글과 사진');
  const heading=node('h3','orc-title','댓글 · 사진'),help=node('p','orc-help','가게에 다녀온 이야기와 사진을 공유해 주세요. 사진과 댓글은 다른 사람에게 공개돼요.'),
   list=node('div','orc-list'),status=node('p','orc-status'),more=button('댓글 더 보기','orc-more');
  status.setAttribute('role','status');list.setAttribute('aria-live','polite');more.hidden=true;
  container.append(heading,help,list,more,status);
  const form=node('form','orc-form'),input=node('textarea','orc-input'),photo=node('input','orc-file'),photoLabel=node('label','orc-photo-label','사진 추가'),thumb=node('div','orc-photo-preview'),send=button('댓글 올리기','orc-submit');
  input.maxLength=500;input.rows=3;input.placeholder='이 맛집은 어떠셨나요?';input.setAttribute('aria-label','댓글 내용 (최대 500자)');
  photo.type='file';photo.accept='image/jpeg,image/png,image/webp';photo.setAttribute('aria-label','댓글 사진 선택');photoLabel.append(photo);
  if(canPost){
   const controls=node('div','orc-controls');send.type='submit';controls.append(photoLabel,send);form.append(input,thumb,controls);container.append(form);
  }else{
   const login=node('a','orc-login','로그인하고 댓글·사진 올리기');login.href='/?auth=login&next=world';login.target='_top';container.append(login);
  }
  const clearPreview=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';thumb.replaceChildren();};
  photo.addEventListener('change',()=>{
   clearPreview();selected=photo.files?.[0]||null;
   if(!selected)return;
   if(selected.size>MAX_SOURCE||!MIME.includes(selected.type)){status.textContent='JPG·PNG·WEBP 사진(20MB 이하)을 골라 주세요.';selected=null;photo.value='';return;}
   previewUrl=URL.createObjectURL(selected);const image=node('img');image.src=previewUrl;image.alt='올릴 사진 미리보기';
   const discard=button('사진 제거','orc-discard');discard.onclick=()=>{selected=null;photo.value='';clearPreview();};thumb.append(image,discard);status.textContent='';
  });
  function render(row){
   const article=node('article','orc-comment'),header=node('div','orc-comment-head');
   header.append(node('strong','orc-author',row.author_name));
   const date=new Date(row.created_at);if(Number.isFinite(date.getTime()))header.append(node('time','orc-date',date.toLocaleDateString('ko-KR')));
   article.append(header);
   if(row.body)article.append(node('p','orc-body',row.body));
   if(row.photo_url){const image=node('img','orc-image');image.src=row.photo_url;image.alt=row.author_name+'님이 올린 맛집 사진';image.loading='lazy';article.append(image);}
   if(row.mine&&canPost){const del=button('내 댓글 삭제','orc-delete');del.onclick=async()=>{
    if(busy||!current()||!global.confirm('내 댓글과 사진을 삭제할까요?'))return;
    busy=true;del.disabled=true;status.textContent='댓글을 삭제하는 중이에요.';
    try{await remove(row.id);if(current()){status.textContent='댓글을 삭제했어요.';await refresh();}}
    catch(error){if(current())status.textContent=messageFor(error,'삭제하지 못했어요. 다시 시도해 주세요.');}
    finally{busy=false;if(del.isConnected)del.disabled=false;}
   };article.append(del);}
   return article;
  }
  async function fetchPage(append=false){
   if(loading||!current())return;
   loading=true;more.disabled=true;const seq=generation;
   if(!append){offset=0;list.replaceChildren();list.append(node('p','orc-empty','댓글을 불러오는 중이에요…'));}
   try{
    const rows=await load(offset);if(!current()||seq!==generation)return;
    if(!Array.isArray(rows))throw new Error('restaurant_comment_response_invalid');
    if(!append)list.replaceChildren();
    if(!rows.length&&!offset)list.append(node('p','orc-empty','첫 번째 이야기를 남겨 주세요.'));
    rows.forEach(row=>list.append(render(row)));offset+=rows.length;more.hidden=rows.length<20||offset>=1000;
    if(!append)status.textContent='';
   }catch(error){if(current()&&seq===generation){if(!append)list.replaceChildren();status.textContent=messageFor(error,'댓글을 불러오지 못했어요. 다시 눌러 주세요.');more.hidden=false;more.textContent='다시 불러오기';}}
   finally{loading=false;more.disabled=false;}
  }
  const refresh=async()=>{generation++;more.textContent='댓글 더 보기';await fetchPage();};
  more.onclick=()=>{if(more.textContent==='다시 불러오기')void refresh();else void fetchPage(true);};
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!canPost||busy||!current())return;
   const body=input.value.trim();if(!body&&!selected){status.textContent='댓글이나 사진을 하나 이상 넣어 주세요.';return;}
   busy=true;send.disabled=true;photo.disabled=true;input.disabled=true;status.textContent='댓글을 올리는 중이에요…';
   try{await save(body,selected);if(current()){input.value='';selected=null;photo.value='';clearPreview();await refresh();status.textContent='댓글을 올렸어요.';}}
   catch(error){if(current())status.textContent=messageFor(error,'등록하지 못했어요. 다시 시도해 주세요.');}
   finally{busy=false;send.disabled=false;photo.disabled=false;input.disabled=false;}
  });
  void refresh();
  return {dispose(){disposed=true;generation++;clearPreview();}};
 }
 global.OjjudaRestaurantComments={create,mountEditor,valid};
})(window);

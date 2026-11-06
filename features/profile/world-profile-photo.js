(function(global){
 'use strict';
 const SIZE=512,MAX_BYTES=20*1024*1024,SOURCE_SIZE=2048;
 const PATH=/^[0-9a-f-]{36}\/profile(?:-source)?\/[0-9a-f-]{36}\.jpg$/;
 const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
 const button=(text,cls)=>{const el=node('button',cls,text);el.type='button';return el;};
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
 const safeCrop=value=>({v:1,zoom:clamp(Number(value?.zoom)||1,1,4),cx:clamp(Number.isFinite(Number(value?.cx))?Number(value.cx):.5,0,1),cy:clamp(Number.isFinite(Number(value?.cy))?Number(value.cy):.5,0,1)});
 const jpeg=(canvas,quality=.9)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진을 만들지 못했어요. 다른 사진을 골라 주세요.')),'image/jpeg',quality));
 const timed=(promise,ms=10000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('사진 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 function create({client,getUser,onSaved=()=>{},notify=()=>{}}){
  let current=null,destroyed=false;const urls=new Map();
  const userId=()=>getUser?.()?.id||null;
  async function getUrl(path){
   if(!path||!PATH.test(path)||!userId())return null;
   const key=userId()+':'+path,cached=urls.get(key);if(cached&&cached.until>Date.now())return cached.url;
   const owner=userId(),{data,error}=await timed(client.storage.from('media').createSignedUrl(path,3600));
   if(error)throw new Error('사진을 불러오지 못했어요. 연결을 확인해 주세요.');
   if(owner!==userId()||destroyed)return null;
   if(!data?.signedUrl)throw new Error('사진 주소를 확인하지 못했어요.');
   urls.set(key,{url:data.signedUrl,until:Date.now()+50*60000});return data.signedUrl;
  }
  function close(force=false,result=null){if(!current)return true;if(current.saving&&!force)return false;current.cleanup(result);current=null;return true;}
  async function open({path=null,sourcePath=null,crop=null}={}){
   const owner=userId();if(!owner||destroyed){notify('로그인한 뒤 사진을 바꿀 수 있어요.');return null;}
   if(!close())return null;
   const dialog=node('dialog','profile-photo-dialog'),heading=node('h2','','프로필 사진'),help=node('p','profile-photo-help','사진을 움직이거나 확대해 위치를 맞춰 주세요.'),canvas=node('canvas','profile-photo-stage');
   dialog.setAttribute('aria-label','프로필 사진 편집');canvas.width=SIZE;canvas.height=SIZE;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','프로필 사진 위치 조정. 드래그하거나 방향키로 움직이세요.');canvas.setAttribute('aria-disabled','true');
   const input=node('input');input.type='file';input.accept='image/*';input.hidden=true;input.setAttribute('aria-label','프로필 사진 파일 선택');
   const zoom=node('input');zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='.01';zoom.value='1';zoom.disabled=true;zoom.setAttribute('aria-label','사진 확대');
   const zoomLabel=node('label','profile-photo-zoom','확대'),zoomValue=node('output','','100%');zoomLabel.append(zoom,zoomValue);
   const actions=node('div','profile-photo-actions'),choose=button('사진 선택'),cancel=button('취소'),save=button('저장','profile-photo-save'),status=node('p','profile-photo-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');save.disabled=true;actions.append(choose,cancel,save);
   dialog.append(heading,help,canvas,zoomLabel,input,actions,status);document.body.append(dialog);
   const previousFocus=document.activeElement;let bitmap=null,selection=0,sourceNew=false,sourceBlob=null,state=safeCrop(crop),disposed=false;
   let source=sourcePath&&sourcePath.startsWith(owner+'/profile-source/')?sourcePath:null;
   const pointers=new Map();let gesture=null;
   let resolveOutcome;const outcome=new Promise(resolve=>{resolveOutcome=resolve;});
   const session={saving:false,uncertain:false,cleanup(result=null){disposed=true;selection++;bitmap?.close?.();bitmap=null;dialog.close();dialog.remove();if(previousFocus?.isConnected)previousFocus.focus();resolveOutcome(result);}};
   current=session;
   const active=()=>!disposed&&!destroyed&&current===session&&userId()===owner;
   function check(){if(!active())throw new Error('계정이 바뀌었어요. 사진 편집을 다시 열어 주세요.');}
   function fit(){if(!bitmap)return;const scale=Math.max(SIZE/bitmap.width,SIZE/bitmap.height)*state.zoom,halfX=SIZE/(2*scale*bitmap.width),halfY=SIZE/(2*scale*bitmap.height);state.cx=clamp(state.cx,halfX,1-halfX);state.cy=clamp(state.cy,halfY,1-halfY);return scale;}
   function render(){const ctx=canvas.getContext('2d');ctx.fillStyle='#eee8f0';ctx.fillRect(0,0,SIZE,SIZE);if(bitmap){const scale=fit();ctx.drawImage(bitmap,SIZE/2-state.cx*bitmap.width*scale,SIZE/2-state.cy*bitmap.height*scale,bitmap.width*scale,bitmap.height*scale);}zoom.value=String(state.zoom);zoomValue.textContent=Math.round(state.zoom*100)+'%';canvas.setAttribute('aria-disabled',String(!bitmap));}
   function controls(){choose.disabled=session.saving;cancel.disabled=session.saving;save.disabled=session.saving||session.uncertain||!bitmap;zoom.disabled=session.saving||!bitmap;}
   async function decode(blob){
    try{if(typeof createImageBitmap==='function')return await createImageBitmap(blob,{imageOrientation:'from-image'});
     const url=URL.createObjectURL(blob),img=new Image();try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
    }catch{throw new Error('이 사진 형식을 열 수 없어요. JPG·PNG·WEBP 사진으로 다시 골라 주세요.');}
   }
   async function selectBlob(blob,{fresh=true}={}){
    const version=++selection;status.textContent='사진을 불러오는 중이에요…';save.disabled=true;
    try{if(!blob?.size)throw new Error('비어 있는 사진이에요. 다른 파일을 골라 주세요.');if(blob.size>MAX_BYTES)throw new Error('20MB 이하의 사진을 골라 주세요.');
     let next=await decode(blob);if(!active()||version!==selection){next.close?.();return;}
     if(!next.width||!next.height||next.width*next.height>64000000){next.close?.();throw new Error('사진 해상도가 너무 커요. 크기를 줄인 사진을 골라 주세요.');}
     if(fresh){const ratio=Math.min(1,SOURCE_SIZE/Math.max(next.width,next.height)),original=document.createElement('canvas');original.width=Math.max(1,Math.round(next.width*ratio));original.height=Math.max(1,Math.round(next.height*ratio));const ctx=original.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,original.width,original.height);ctx.drawImage(next,0,0,original.width,original.height);const nextBlob=await jpeg(original,.92);next.close?.();next=await decode(nextBlob);if(!active()||version!==selection){next.close?.();return;}sourceBlob=nextBlob;state=safeCrop(null);sourceNew=true;}
     bitmap?.close?.();bitmap=next;render();status.textContent='';
    }catch(error){if(active()&&version===selection)status.textContent=error.message;}finally{if(active()&&version===selection)controls();}
   }
   choose.onclick=()=>input.click();input.onchange=()=>{const file=input.files?.[0];input.value='';if(!file||session.saving)return;if(file.type&&!file.type.startsWith('image/')){status.textContent='사진 파일을 골라 주세요.';return;}void selectBlob(file);};
   cancel.onclick=()=>close();dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
   zoom.oninput=()=>{if(!bitmap||session.saving)return;state.zoom=Number(zoom.value);render();};
   function position(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*SIZE/rect.width,y:(event.clientY-rect.top)*SIZE/rect.height};}
   function startGesture(){const points=[...pointers.values()];gesture=points.length>1?{zoom:state.zoom,distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)}:null;}
   canvas.onpointerdown=event=>{if(!bitmap||session.saving)return;event.preventDefault();canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,position(event));startGesture();};
   canvas.onpointermove=event=>{if(!pointers.has(event.pointerId)||!bitmap||session.saving)return;const old=pointers.get(event.pointerId),point=position(event);pointers.set(event.pointerId,point);if(pointers.size>1){const points=[...pointers.values()];if(gesture?.distance)state.zoom=clamp(gesture.zoom*Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)/gesture.distance,1,4);}else{const scale=fit();state.cx-=(point.x-old.x)/(scale*bitmap.width);state.cy-=(point.y-old.y)/(scale*bitmap.height);}render();};
   const release=event=>{pointers.delete(event.pointerId);startGesture();};canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onlostpointercapture=release;
   canvas.onkeydown=event=>{if(!bitmap||session.saving||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const amount=(event.shiftKey?40:10)/fit();if(event.key==='ArrowLeft')state.cx+=amount/bitmap.width;if(event.key==='ArrowRight')state.cx-=amount/bitmap.width;if(event.key==='ArrowUp')state.cy+=amount/bitmap.height;if(event.key==='ArrowDown')state.cy-=amount/bitmap.height;render();};
   save.onclick=async()=>{
    if(session.saving||session.uncertain||!bitmap)return;session.saving=true;controls();status.textContent='사진을 저장하는 중이에요…';const uploads=[];let committed=false,uncertain=false,updatePending=false;
    const nextPath=owner+'/profile/'+crypto.randomUUID()+'.jpg',nextSource=sourceNew||!source?owner+'/profile-source/'+crypto.randomUUID()+'.jpg':source,metadata={profile_photo_path:nextPath,profile_photo_source_path:nextSource,profile_photo_crop:{...state}};
    try{check();render();const cropped=await jpeg(canvas);check();
     if(nextSource!==source){if(!sourceBlob){const raw=document.createElement('canvas');raw.width=bitmap.width;raw.height=bitmap.height;raw.getContext('2d').drawImage(bitmap,0,0);sourceBlob=await jpeg(raw,.92);}check();const result=await timed(client.storage.from('media').upload(nextSource,sourceBlob,{contentType:'image/jpeg',upsert:false}));if(result.error)throw result.error;uploads.push(nextSource);check();}
     const result=await timed(client.storage.from('media').upload(nextPath,cropped,{contentType:'image/jpeg',upsert:false}));if(result.error)throw result.error;uploads.push(nextPath);check();
     let updated;try{updatePending=true;updated=await timed(Promise.resolve(client.from('profiles').update(metadata).eq('id',owner).select('profile_photo_path,profile_photo_source_path,profile_photo_crop').single()).finally(()=>{updatePending=false;}));if(updated.error)throw updated.error;if(updated.data?.profile_photo_path!==nextPath)throw new Error('프로필 저장을 확인하지 못했어요.');committed=true;}catch(error){
      uncertain=true;check();let probe;try{probe=await timed(client.from('profiles').select('profile_photo_path,profile_photo_source_path,profile_photo_crop').eq('id',owner).maybeSingle());}catch{throw new Error('저장 결과를 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요.');}check();if(probe.error)throw new Error('저장 결과를 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요.');if(probe.data?.profile_photo_path===nextPath){committed=true;uncertain=false;}else if(updatePending)throw new Error('저장 결과를 확인하지 못했어요. 새로고침한 뒤 다시 확인해 주세요.');else{uncertain=false;throw error;}
     }
     check();let url=null;try{url=await getUrl(nextPath);}catch{}check();await onSaved(nextPath,url,nextSource,metadata.profile_photo_crop);notify('프로필 사진을 저장했어요.');close(true,{path:nextPath,url,sourcePath:nextSource,crop:metadata.profile_photo_crop});
    }catch(error){session.uncertain=uncertain;if(!committed&&!uncertain&&userId()===owner&&uploads.length)await timed(client.storage.from('media').remove(uploads)).catch(()=>{});if(!disposed&&current===session&&userId()!==owner){notify('계정이 바뀌었어요. 사진 편집을 다시 열어 주세요.');close(true);}else if(active())status.textContent=committed?'사진은 저장됐지만 화면을 새로 불러오지 못했어요. 잠시 후 다시 열어 주세요.':error?.message&&/저장 결과/.test(error.message)?error.message:'사진을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';}
    finally{session.saving=false;if(active())controls();}
   };
   render();dialog.showModal();choose.focus();
   if(source||path)void(async()=>{try{const url=await getUrl(source||path);check();if(url&&selection===0){const response=await timed(fetch(url));if(!response.ok)throw new Error('사진을 불러오지 못했어요. 다른 사진을 골라 주세요.');const blob=await timed(response.blob());if(selection===0)await selectBlob(blob,{fresh:false});}}catch(error){if(active()&&selection===0)status.textContent=error.message;}})();
   return outcome;
  }
  return {open,getUrl,close,destroy(){destroyed=true;close(true);urls.clear();},isOpen:()=>!!current};
 }
 global.OjjudaProfilePhoto={create};
})(window);

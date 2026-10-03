const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
const button=(text,click)=>{const el=node('button','',text);el.type='button';el.onclick=click;return el;};
const scopes=[['me','나만 보기'],['friends','친구 공개'],['all','전체 공개']];
function select(label,options,value){const el=node('select');el.setAttribute('aria-label',label);for(const [id,text]of options){const option=node('option','',text);option.value=id;el.append(option);}el.value=value;return el;}
function field(label,control){const wrap=node('label','record-field');wrap.append(node('span','',label),control);return wrap;}
export function mountCloudRecords({container,kind,request,active}){
 let run=0,busy=false,folderId='all',snapshot={folders:[],friends:[]};const label=kind==='photo'?'사진':'동영상';
 const status=node('p','record-status');status.setAttribute('role','status');
 const toolbar=node('div','record-toolbar'),gallery=node('div','record-gallery '+kind),editor=node('div','record-editor');gallery.setAttribute('aria-label','우리집 앨범 '+label);
 const folders=select('앨범 폴더',[['all','모든 폴더'],['none','폴더 없음']],'all');folders.onchange=()=>{folderId=folders.value;editor.replaceChildren();void load();};
 const refresh=button('↻',()=>{editor.replaceChildren();void load();}),newFolder=button('새 폴더',()=>folderEditor()),editFolder=button('폴더 설정',()=>folderEditor(snapshot.folders.find(row=>row.id===folderId)));
 editFolder.hidden=true;refresh.setAttribute('aria-label','새로고침');refresh.title='새로고침';const tools=node('details','record-tools'),manage=node('summary','','관리'),menu=node('div','record-tools-menu');manage.setAttribute('aria-label','폴더 관리');menu.append(newFolder,editFolder);tools.append(manage,menu);toolbar.append(folders,tools,refresh);
 const file=node('input');file.type='file';file.multiple=true;file.accept=kind==='photo'?'image/jpeg,image/png,image/gif,image/webp':'video/mp4,video/quicktime,video/webm';file.hidden=true;file.setAttribute('aria-label',label+' 앨범에 올리기');
 const uploads=node('div','record-toolbar record-upload'),uploadVisibility=select('새 파일 공개범위',scopes,'me'),add=button(label+' 올리기',()=>{uploads.hidden=!uploads.hidden;});
 const scopeNote=node('p','panel-note');uploads.hidden=true;uploads.append(uploadVisibility,button('파일 선택',()=>file.click()),node('span','panel-note',kind==='photo'?'사진 20MB까지':'영상 1분 · 50MB까지'),scopeNote);toolbar.append(add);
 container.append(toolbar,uploads,file,status,editor,gallery);
 const failure=error=>{if(active()&&error.name!=='AbortError')status.textContent=error.message||'앨범을 불러오지 못했어요.';};
 function lock(value){busy=value;for(const el of container.querySelectorAll('button,input,select'))el.disabled=value;syncScope();}
 function syncScope(){const folder=snapshot.folders.find(row=>row.id===folderId);editFolder.hidden=!folder;uploadVisibility.hidden=!!folder;scopeNote.textContent=folder?`새 파일은 ‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'사진과 영상은 계정에 저장돼요. 다른 기기에서도 볼 수 있어요.';}
 function scopeLabel(value){return [...scopes,['chosen','고른 친구만']].find(([id])=>id===value)?.[1]||'공개범위 확인';}
 async function save(action,args,message,after){
  if(busy||!active())return;lock(true);status.textContent='저장 중이에요…';
  try{const result=await request(action,args);if(!active())return;after?.(result);editor.replaceChildren();const loaded=await load();if(active()&&loaded)status.textContent=message;}
  catch(error){failure(error);}finally{if(active())lock(false);}
 }
 function folderEditor(folder){
  if(busy)return;tools.open=false;editor.replaceChildren();const form=node('form'),name=node('input');name.type='text';name.maxLength=20;name.value=folder?.name||'';name.required=true;
  const scope=select('폴더 공개범위',[...scopes,['chosen','고른 친구만']],folder?.visibility||'me'),friends=node('div','record-friends');
  for(const friend of snapshot.friends){const check=node('input');check.type='checkbox';check.value=friend.id;check.checked=!!folder?.allowed?.includes(friend.id);const option=node('label');option.append(check,document.createTextNode(friend.nick||'친구'));friends.append(option);}
  if(!snapshot.friends.length)friends.append(node('p','panel-note','친구가 생기면 여기서 고를 수 있어요.'));
  const show=()=>friends.hidden=scope.value!=='chosen';scope.onchange=show;show();
  form.append(node('p','record-form-title',folder?'폴더 설정':'새 폴더'),field('폴더 이름',name),field('볼 수 있는 사람',scope),friends,node('p','panel-note','폴더 안의 사진과 영상은 이 공개범위를 따라요.'));
  const submit=button(folder?'폴더 저장':'폴더 만들기');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()));
  form.onsubmit=event=>{event.preventDefault();void save('save-folder',{id:folder?.id,name:name.value,visibility:scope.value,allowed:[...friends.querySelectorAll('input:checked')].map(el=>el.value)},'폴더를 저장했어요.',result=>folderId=result.id);};
  editor.append(form);name.focus();
 }
 function mediaEditor(record){
  if(busy)return;tools.open=false;editor.replaceChildren();const form=node('form'),caption=node('input');caption.type='text';caption.maxLength=100;caption.value=record.caption||'';
  const destination=select('파일 폴더',[['','폴더 없음'],...snapshot.folders.map(folder=>[folder.id,folder.name])],record.folder_id||''),scope=select('파일 공개범위',scopes,record.visibility),note=node('p','panel-note');
  function update(){const folder=snapshot.folders.find(row=>row.id===destination.value);scope.disabled=!!folder;scope.hidden=!!folder;note.textContent=folder?`‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'';}
  destination.onchange=update;update();form.append(node('p','record-form-title',label+' 설정'),field('설명',caption),field('폴더',destination),field('볼 수 있는 사람',scope),note);
  const submit=button('파일 설정 저장');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()));form.onsubmit=event=>{event.preventDefault();void save('save-media',{id:record.id,caption:caption.value,visibility:scope.value,folder_id:destination.value||null},'설정을 저장했어요.');};editor.append(form);caption.focus();
 }
 async function showMedia(record){
  const current=run;try{const result=await request('open',{id:record.id});if(!active()||current!==run)return;if(!result.url)throw new Error('파일을 불러오지 못했어요. 새로고침해 주세요.');
   const dialog=node('dialog','record-viewer'),media=node(kind==='photo'?'img':'video'),close=button('닫기',()=>dialog.close());media.src=result.url;
   if(kind==='photo')media.alt=record.caption||'사진';else{media.controls=true;media.preload='none';media.playsInline=true;}
   media.onerror=()=>dialog.append(node('p','panel-note','파일을 불러오지 못했어요. 닫고 앨범을 새로고침해 주세요.'));
   dialog.append(close,media);dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>{if(kind==='video'){media.pause();media.removeAttribute('src');media.load();}dialog.remove();};container.append(dialog);dialog.showModal();
  }catch(error){failure(error);}
 }
 file.onchange=async()=>{
  const files=[...file.files||[]];file.value='';if(busy||!active()||!files.length)return;
  if(files.length>10){status.textContent='한 번에 10개까지 올려 주세요.';return;}
  const target=folderId==='all'||folderId==='none'?null:folderId,visibility=uploadVisibility.value;let count=0,error=null;lock(true);
  try{for(const selected of files){if(active())status.textContent=`${count+1}/${files.length}개 저장 중이에요…`;await request('upload',{file:selected,kind,folder_id:target,visibility});count++;}}
  catch(caught){error=caught;}finally{if(active()){uploads.hidden=true;await load();lock(false);status.textContent=(count?`${count}개를 앨범에 저장했어요. `:'')+(error?error.message:'');}}
 };
 async function load(offset=0){
  const current=++run;status.textContent='앨범을 불러오는 중이에요…';
  try{const data=await request('list',{kind,folder:folderId,offset});if(!active()||current!==run)return;
   snapshot=data;folders.replaceChildren();for(const [id,text]of [['all','모든 폴더'],['none','폴더 없음'],...data.folders.map(folder=>[folder.id,folder.name+' · '+scopeLabel(folder.visibility)])]){const option=node('option','',text);option.value=id;folders.append(option);}folders.value=folderId;syncScope();
   status.textContent='';if(!offset)gallery.replaceChildren();container.querySelector('.cloud-more')?.remove();
   if(!data.records.length&&!offset)gallery.append(node('p','record-empty','아직 '+label+'이 없어요.'));
   for(const record of data.records){
    const card=node('article','record-card'),preview=button('',()=>showMedia(record));preview.className='record-open';preview.setAttribute('aria-label',label+' 크게 보기');
    if(record.thumbnail){const image=node('img');image.src=record.thumbnail;image.alt=record.caption||label;image.loading='lazy';image.decoding='async';image.onerror=()=>{image.remove();preview.textContent=label+' 열기';};preview.append(image);}else preview.textContent=label+' 열기';
    const stage=node('div','record-preview'),actions=node('div','record-actions'),folder=data.folders.find(row=>row.id===record.folder_id);stage.append(preview);actions.append(node('span','panel-note',scopeLabel(folder?.visibility||record.visibility)),button('설정',()=>mediaEditor(record)));
    card.dataset.cloudRecordId=record.id;card.append(stage,node('p','record-filename',record.caption||label),actions);gallery.append(card);
   }
   if(data.more){const more=button('더 보기',()=>load(offset+12));more.className='cloud-more';container.append(more);}
   return true;
  }catch(error){if(current===run)failure(error);return false;}
 }
 void load();
}

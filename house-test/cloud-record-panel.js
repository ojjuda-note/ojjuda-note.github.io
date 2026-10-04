const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
const button=(text,click)=>{const el=node('button','',text);el.type='button';el.onclick=click;return el;};
const scopes=[['me','나만 보기'],['friends','친구 공개'],['all','전체 공개']];
function select(label,options,value){const el=node('select');el.setAttribute('aria-label',label);for(const [id,text]of options){const option=node('option','',text);option.value=id;el.append(option);}el.value=value;return el;}
function field(label,control){const wrap=node('label','record-field');wrap.append(node('span','',label),control);return wrap;}
export function mountCloudRecords({container,kind,request,active,foldersHost,settingsButton,initialFolder='all',onFolderChange=()=>{}}){
 let run=0,busy=false,folderId=initialFolder,snapshot={folders:[],friends:[]},displayed=[],managing=false,loaded=false;const selected=new Set();const label=kind==='photo'?'사진':kind==='video'?'동영상':'기록';
 const status=node('p','record-status');status.setAttribute('role','status');
 const toolbar=node('div','record-toolbar'),gallery=node('div','record-gallery '+kind),editor=node('div','record-editor');gallery.setAttribute('aria-label','우리집 앨범 '+label);
 const folders=node('div','record-folders');folders.setAttribute('role','group');folders.setAttribute('aria-label','앨범 폴더');
 const refresh=button('↻',()=>{editor.replaceChildren();void load();}),newFolder=button('+ 새폴더',()=>folderEditor());
 refresh.setAttribute('aria-label','새로고침');refresh.title='새로고침';toolbar.append(refresh);
 if(settingsButton){settingsButton.disabled=true;settingsButton.onclick=openSettings;}
 const selection=node('div','record-selection-tools'),count=node('span','record-selection-count'),destination=select('선택한 게시물을 옮길 폴더',[['','미분류 · 나만 보기']],'');
 const move=button('선택한 게시물 이동',()=>moveEditor()),chooseAll=button('목록에서 최대 100개 선택',()=>{selected.clear();for(const row of displayed.slice(0,100))selected.add(row.id);renderCards();syncSelection();}),done=button('선택 끝내기',()=>{managing=false;selected.clear();selection.hidden=true;renderCards();});
 selection.hidden=true;selection.append(count,chooseAll,field('이동할 폴더',destination),move,done);
 function syncSelection(){count.textContent=`${selected.size}개 선택`;move.disabled=busy||!selected.size;chooseAll.disabled=busy||!displayed.length;}
 function openSettings(){
  if(busy||!active()||!loaded)return;
  const dialog=node('dialog','record-viewer record-settings-dialog'),heading=node('h3','','우리집 설정'),close=button('닫기',()=>dialog.close());
  dialog.setAttribute('aria-label','우리집 설정');dialog.append(close,heading,node('h4','','폴더 관리'));
  const leave=callback=>()=>{dialog.close();callback();};dialog.append(button('+ 새폴더',leave(()=>folderEditor())));
  for(const folder of snapshot.folders){const row=node('div','record-folder-setting'),text=node('div');text.append(node('strong','',folder.name),node('p','panel-note',scopeLabel(folder.visibility)));const edit=button('수정',leave(()=>folderEditor(folder))),remove=button('삭제',leave(()=>deleteFolderEditor(folder)));edit.setAttribute('aria-label',folder.name+' 폴더 수정');remove.setAttribute('aria-label',folder.name+' 폴더 삭제');row.append(text,edit,remove);dialog.append(row);}
  if(!snapshot.folders.length)dialog.append(node('p','panel-note','아직 만든 폴더가 없어요.'));
  dialog.append(node('h4','','사진·동영상 관리'),button('게시물 선택·이동',leave(()=>{managing=true;selection.hidden=false;renderCards();syncSelection();chooseAll.focus();})),node('p','panel-note','각 게시물의 설정에서 설명과 폴더도 바꿀 수 있어요.'));
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>dialog.remove();container.append(dialog);dialog.showModal();
 }
 function deleteFolderEditor(folder){
  if(busy)return;editor.replaceChildren();const title=node('p','record-form-title',`‘${folder.name}’ 폴더를 삭제할까요?`),note=node('p','panel-note','사진·동영상은 삭제되지 않고 미분류로 옮겨져요. 옮긴 파일은 나만 볼 수 있어요.'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('폴더만 삭제',()=>save('delete-folder',{id:folder.id},'폴더를 삭제했어요. 사진·동영상은 미분류에 보관했어요.',()=>{folderId='none';onFolderChange(folderId);}));const box=node('div','record-management-confirm');box.append(title,note,cancel,accept);editor.append(box);cancel.focus();
 }
 function moveEditor(){
  if(busy||!selected.size)return;const ids=[...selected],target=destination.value||null,folder=snapshot.folders.find(row=>row.id===target);editor.replaceChildren();const box=node('div','record-management-confirm'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('이동하기',()=>save('move-media',{ids,folder_id:target},`${ids.length}개 게시물을 옮겼어요.`,()=>{folderId=target||'none';onFolderChange(folderId);selected.clear();}));box.append(node('p','record-form-title',`${ids.length}개를 ‘${folder?.name||'미분류'}’로 옮길까요?`),node('p','panel-note',folder?`이동한 게시물은 폴더 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'미분류로 옮기면 나만 볼 수 있어요.'),cancel,accept);editor.append(box);cancel.focus();
 }
 const file=node('input');file.type='file';file.multiple=true;file.accept=kind==='photo'?'image/jpeg,image/png,image/gif,image/webp':kind==='video'?'video/mp4,video/quicktime,video/webm':'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';file.hidden=true;file.setAttribute('aria-label',label+' 앨범에 올리기');
 const uploads=node('div','record-toolbar record-upload'),uploadVisibility=select('새 파일 공개범위',scopes,'me'),add=button(label+' 올리기',()=>{uploads.hidden=!uploads.hidden;});
 const scopeNote=node('p','panel-note');uploads.hidden=true;uploads.append(uploadVisibility,button('파일 선택',()=>file.click()),node('span','panel-note',kind==='photo'?'사진 20MB까지':kind==='video'?'영상 1분 · 50MB까지':'사진 20MB · 영상 1분 / 50MB까지'),scopeNote);toolbar.append(add);
 (foldersHost||container).append(folders);container.append(toolbar,uploads,file,status,editor,selection,gallery);if(kind==='text'){add.hidden=true;gallery.hidden=true;}
 function renderFolders(){const focused=folders.contains(document.activeElement)?document.activeElement.dataset.folderId:null;folders.replaceChildren();for(const [id,text]of [['all','전체'],...snapshot.folders.map(row=>[row.id,row.name]),['none','미분류']]){const b=button(text,()=>{if(busy)return;folderId=id;onFolderChange(id);editor.replaceChildren();selected.clear();renderFolders();void load();});b.dataset.folderId=id;b.setAttribute('aria-pressed',String(folderId===id));folders.append(b);if(id===focused)b.focus({preventScroll:true});}folders.append(newFolder);newFolder.disabled=busy||!loaded;}
 const failure=error=>{if(active()&&error.name!=='AbortError')status.textContent=error.message||'앨범을 불러오지 못했어요.';};
 function lock(value){busy=value;for(const el of [...container.querySelectorAll('button,input,select'),...folders.querySelectorAll('button')])el.disabled=value;if(settingsButton)settingsButton.disabled=value||!loaded;syncScope();syncSelection();}
 function syncScope(){const folder=snapshot.folders.find(row=>row.id===folderId);uploadVisibility.hidden=!!folder;scopeNote.textContent=folder?`새 파일은 ‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'사진과 영상은 계정에 저장돼요. 다른 기기에서도 볼 수 있어요.';}
 function scopeLabel(value){return [...scopes,['chosen','고른 친구만']].find(([id])=>id===value)?.[1]||'공개범위 확인';}
 async function save(action,args,message,after){
  if(busy||!active())return;lock(true);status.textContent='저장 중이에요…';
  try{const result=await request(action,args);if(!active())return;after?.(result);editor.replaceChildren();const loaded=await load();if(active()&&loaded)status.textContent=message;}
  catch(error){failure(error);}finally{if(active())lock(false);}
 }
 function folderEditor(folder){
  if(busy)return;editor.replaceChildren();const form=node('form'),name=node('input');name.type='text';name.maxLength=20;name.value=folder?.name||'';name.required=true;name.placeholder='익명, 친구, 여행…';
  const scope=select('폴더 공개범위',[...scopes,['chosen','고른 친구만']],folder?.visibility||'me'),friends=node('div','record-friends');
  for(const friend of snapshot.friends){const check=node('input');check.type='checkbox';check.value=friend.id;check.checked=!!folder?.allowed?.includes(friend.id);const option=node('label');option.append(check,document.createTextNode(friend.nick||'친구'));friends.append(option);}
  if(!snapshot.friends.length)friends.append(node('p','panel-note','친구가 생기면 여기서 고를 수 있어요.'));
  const show=()=>friends.hidden=scope.value!=='chosen';scope.onchange=show;show();
  form.append(node('p','record-form-title',folder?'폴더 설정':'새 폴더'),field('폴더 이름',name),field('볼 수 있는 사람',scope),friends,node('p','panel-note','폴더 안의 사진과 영상은 이 공개범위를 따라요.'));
  const submit=button(folder?'폴더 저장':'폴더 만들기');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()));
  form.onsubmit=event=>{event.preventDefault();void save('save-folder',{id:folder?.id,name:name.value,visibility:scope.value,allowed:[...friends.querySelectorAll('input:checked')].map(el=>el.value)},'폴더를 저장했어요.',result=>{folderId=result.id;onFolderChange(folderId);});};
  editor.append(form);name.focus();
 }
 function mediaEditor(record){
  if(busy)return;editor.replaceChildren();const form=node('form'),caption=node('input');caption.type='text';caption.maxLength=100;caption.value=record.caption||'';
  const destination=select('파일 폴더',[['','폴더 없음'],...snapshot.folders.map(folder=>[folder.id,folder.name])],record.folder_id||''),scope=select('파일 공개범위',scopes,record.visibility),note=node('p','panel-note');
  function update(){const folder=snapshot.folders.find(row=>row.id===destination.value);scope.disabled=!!folder;scope.hidden=!!folder;note.textContent=folder?`‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'';}
  destination.onchange=()=>{if(!destination.value)scope.value='me';update();};update();form.append(node('p','record-form-title',label+' 설정'),field('설명',caption),field('폴더',destination),field('볼 수 있는 사람',scope),note);
  const submit=button('파일 설정 저장');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()));form.onsubmit=event=>{event.preventDefault();void save('save-media',{id:record.id,caption:caption.value,visibility:scope.value,folder_id:destination.value||null},'설정을 저장했어요.');};editor.append(form);caption.focus();
 }
 async function showMedia(record){
  const current=run;try{const result=await request('open',{id:record.id});if(!active()||current!==run)return;if(!result.url)throw new Error('파일을 불러오지 못했어요. 새로고침해 주세요.');
   const isPhoto=record.type==='image',dialog=node('dialog','record-viewer'),media=node(isPhoto?'img':'video'),close=button('닫기',()=>dialog.close());media.src=result.url;
   if(isPhoto)media.alt=record.caption||'사진';else{media.controls=true;media.preload='none';media.playsInline=true;}
   media.onerror=()=>dialog.append(node('p','panel-note','파일을 불러오지 못했어요. 닫고 앨범을 새로고침해 주세요.'));
   dialog.append(close,media,node('p','record-viewer-caption',record.caption||''));dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>{if(!isPhoto){media.pause();media.removeAttribute('src');media.load();}dialog.remove();};container.append(dialog);dialog.showModal();
  }catch(error){failure(error);}
 }
 file.onchange=async()=>{
  const files=[...file.files||[]];file.value='';if(busy||!active()||!files.length)return;
  if(files.length>10){status.textContent='한 번에 10개까지 올려 주세요.';return;}
  const target=folderId==='all'||folderId==='none'?null:folderId,visibility=uploadVisibility.value;let count=0,error=null;lock(true);
  try{for(const selected of files){if(active())status.textContent=`${count+1}/${files.length}개 저장 중이에요…`;await request('upload',{file:selected,kind:kind==='all'?(selected.type.startsWith('image/')?'photo':'video'):kind,folder_id:target,visibility});count++;}}
  catch(caught){error=caught;}finally{if(active()){uploads.hidden=true;await load();lock(false);status.textContent=(count?`${count}개를 앨범에 저장했어요. `:'')+(error?error.message:'');}}
 };
 function renderCards(){gallery.replaceChildren();if(!displayed.length)gallery.append(node('p','record-empty','아직 '+label+'이 없어요.'));
   for(const record of displayed){
    const mediaLabel=record.type==='image'?'사진':'동영상',card=node('article','record-card'),preview=button('',()=>showMedia(record));preview.className='record-open';preview.setAttribute('aria-label',mediaLabel+' 크게 보기');
    if(record.thumbnail){const image=node('img');image.src=record.thumbnail;image.alt='';image.loading='lazy';image.decoding='async';image.onerror=()=>{image.remove();preview.textContent=mediaLabel+' 열기';};preview.append(image);}else preview.textContent=mediaLabel+' 열기';
    const stage=node('div','record-preview'),actions=node('div','record-actions'),folder=snapshot.folders.find(row=>row.id===record.folder_id);stage.append(preview);actions.append(node('span','panel-note',scopeLabel(folder?.visibility||record.visibility)),button('설정',()=>mediaEditor(record)));
    const copy=node('div','record-copy'),title=node('p','record-filename',record.caption||mediaLabel),meta=node('p','record-meta',mediaLabel+(folder?' · '+folder.name:''));if(managing){const check=node('input'),choice=node('label','record-selection-label');check.type='checkbox';check.checked=selected.has(record.id);check.setAttribute('aria-label',(record.caption||mediaLabel)+' 선택');check.onchange=()=>{if(check.checked&&selected.size>=100){check.checked=false;status.textContent='한 번에 100개까지 선택할 수 있어요.';return;}check.checked?selected.add(record.id):selected.delete(record.id);syncSelection();};choice.append(check,document.createTextNode(meta.textContent));copy.append(choice);}else copy.append(meta);copy.append(title,actions);if(record.type==='video')preview.append(node('span','record-play','▶'));card.dataset.cloudRecordId=record.id;card.append(copy,stage);gallery.append(card);
   }
 }
 async function load(offset=0){
  const current=++run;if(!offset){displayed=[];selected.clear();gallery.replaceChildren();container.querySelector('.cloud-more')?.remove();syncSelection();}status.textContent='앨범을 불러오는 중이에요…';
  try{const data=await request('list',{kind,folder:folderId,offset});if(!active()||current!==run)return;
   snapshot=data;loaded=true;if(settingsButton)settingsButton.disabled=busy;renderFolders();syncScope();const target=destination.value;destination.replaceChildren();for(const [id,text]of [['','미분류 · 나만 보기'],...data.folders.map(row=>[row.id,row.name+' · '+scopeLabel(row.visibility)])]){const option=node('option','',text);option.value=id;destination.append(option);}destination.value=data.folders.some(row=>row.id===target)?target:'';
   status.textContent='';if(!offset)gallery.replaceChildren();container.querySelector('.cloud-more')?.remove();
   displayed.push(...data.records);renderCards();syncSelection();
   if(data.more){const more=button('더 보기',()=>load(offset+12));more.className='cloud-more';container.append(more);}
   return true;
  }catch(error){if(current===run)failure(error);return false;}
 }
 renderFolders();void load();
}

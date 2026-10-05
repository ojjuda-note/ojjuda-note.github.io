import {bindRecordHold} from './record-hold.js?v=20261004-folder-kind1';
import {icon} from './icons.js?v=20261004-home-clean1';
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
const button=(text,click)=>{const el=node('button','',text);el.type='button';el.onclick=click;return el;};
const folderKinds=[['text','노트'],['photo','앨범'],['video','비디오']];
const recordKind=row=>row.type==='image'?'photo':row.type==='text'?'text':'video';
const scopes=[['all','전체 공개'],['friends','친구 공개'],['me','나만 보기']];
function select(label,options,value){const el=node('select');el.setAttribute('aria-label',label);for(const [id,text]of options){const option=node('option','',text);option.value=id;el.append(option);}el.value=value;return el;}
function field(label,control){const wrap=node('label','record-field');wrap.append(node('span','',label),control);return wrap;}
function folderScopeFields(folder,scope){const row=node('div','record-location-fields');row.append(field('공개범위',scope),field('폴더',folder));return row;}
export function mountCloudRecords({container,kind,request,active,foldersHost,settingsButton,initialFolder='all',onFolderChange=()=>{},postDrafts=new Map(),committedPostIds=new Set(),pendingPostIds=new Set()}){
 let run=0,busy=false,folderId=kind==='all'?'all':initialFolder,snapshot={folders:[],friends:[],groups:[]},displayed=[],managing=false,loaded=false,trash=false;const selected=new Set(),recordKey=row=>(row.type==='text'?'text:':'media:')+row.id;const label=kind==='photo'?'사진':kind==='video'?'동영상':'기록';
 let folderHolds=[],cardHolds=[];const release=holds=>{for(const stop of holds)stop();};
 const foldersFor=value=>snapshot.folders.filter(row=>row.kind===value);
 const chooseFolder=(id,value=kind)=>{if(kind==='all'||kind!==value)return;folderId=id;onFolderChange(id);};
 const status=node('p','record-status');status.setAttribute('role','status');
 const toolbar=node('div','record-toolbar'),gallery=node('div','record-gallery '+kind),editor=node('div','record-editor');gallery.setAttribute('aria-label','우리집 앨범 '+label);
 const folders=node('div','record-folders');folders.setAttribute('role','group');folders.setAttribute('aria-label','앨범 폴더');
 const refresh=button('↻',()=>{editor.replaceChildren();void load();}),newFolder=button('+ 새폴더',()=>folderEditor());
 refresh.setAttribute('aria-label','새로고침');refresh.title='새로고침';refresh.className='record-refresh';refresh.innerHTML=icon('refresh');toolbar.append(refresh);
 if(settingsButton){settingsButton.disabled=true;settingsButton.onclick=openSettings;}
 const selection=node('div','record-selection-tools'),count=node('span','record-selection-count'),destination=select('선택한 게시물을 옮길 폴더',[['','미분류 · 나만 보기']],'');
 const moveNote=node('p','panel-note');moveNote.hidden=true;
 const move=button('선택한 게시물 이동',()=>moveEditor()),chooseAll=button('목록에서 최대 100개 선택',()=>{selected.clear();for(const row of displayed.slice(0,100))selected.add(recordKey(row));renderCards();syncSelection();}),done=button('선택 끝내기',()=>{managing=false;selected.clear();selection.hidden=true;editor.replaceChildren();renderCards();});
 const trashSelected=button('선택한 게시물 휴지통으로',()=>trashEditor(displayed.filter(row=>selected.has(recordKey(row)))));
 selection.hidden=true;selection.append(count,chooseAll,field('이동할 폴더',destination),move,trashSelected,done,moveNote);
 function syncSelection(){
  count.textContent=`${selected.size}개 선택`;move.disabled=busy||!selected.size;trashSelected.disabled=busy||!selected.size;chooseAll.disabled=busy||!displayed.length;
  const kinds=[...new Set(displayed.filter(row=>selected.has(recordKey(row))).map(recordKind))],scope=kinds.length===1?kinds[0]:kind==='all'?null:kind,prior=destination.value;
  destination.replaceChildren();for(const [id,text]of [['','미분류 · 나만 보기'],...(kinds.length>1?[]:foldersFor(scope)).map(row=>[row.id,row.name+' · '+scopeLabel(row.visibility)])]){const option=node('option','',text);option.value=id;destination.append(option);}destination.value=[...destination.options].some(option=>option.value===prior)?prior:'';destination.disabled=busy;
  moveNote.hidden=kinds.length<2;moveNote.textContent='다른 종류를 함께 선택하면 미분류로만 옮길 수 있어요.';
 }

 function openSettings(){
  if(busy||!active()||!loaded)return;
  const dialog=node('dialog','record-viewer record-settings-dialog'),header=node('div','record-settings-header'),heading=node('h3','','우리집 설정'),body=node('div','record-settings-body');
  const paths={folder:'M3 7h6l2 2h10v11H3Z M3 7V4h6l2 3',group:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0',records:'M9 5h11 M9 12h11 M9 19h11 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',next:'m9 6 6 6-6 6',back:'m15 6-6 6 6 6',close:'m6 6 12 12 M18 6 6 18'};
  const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[name]);svg.append(path);return svg;};
  const close=button('',()=>dialog.close()),back=button('',()=>render(currentView.startsWith('folders:')?'folders':'home'));
  close.setAttribute('aria-label','닫기');close.autofocus=true;close.append(icon('close'));back.setAttribute('aria-label','뒤로');back.append(icon('back'));back.hidden=true;
  dialog.setAttribute('aria-label','우리집 설정');header.append(back,heading,close);dialog.append(header,body);
  const leave=callback=>()=>{dialog.close();callback();};let currentView='home';
  const row=(title,detail,onClick,symbol)=>{const control=button('',onClick);control.className='record-settings-row';control.setAttribute('aria-label',title);if(symbol){const badge=node('span','record-settings-icon');badge.append(icon(symbol));control.append(badge);}const copy=node('span','record-settings-copy');copy.append(node('span','record-settings-label',title));control.append(copy);if(detail)control.append(node('span','record-settings-detail',detail));const arrow=icon('next');arrow.classList.add('record-settings-arrow');control.append(arrow);body.append(control);return control;};
  function render(view){
   const priorView=currentView;currentView=view;body.replaceChildren();body.scrollTop=0;back.hidden=view==='home';heading.textContent=view==='folders'?'폴더 관리':view.startsWith('folders:')?folderKinds.find(([id])=>id===view.split(':')[1])[1]+' 폴더':view==='groups'?'친구 그룹':'우리집 설정';dialog.dataset.settingsView=view;
   if(view==='home'){
    const foldersRow=row('폴더 관리',`${snapshot.folders.length}개`,()=>render('folders'),'folder'),groupsRow=row('친구 그룹',`${snapshot.groups?.length||0}개`,()=>render('groups'),'group');
    if(!trash)row('게시물 정리','',leave(()=>{managing=true;selection.hidden=false;renderCards();syncSelection();chooseAll.focus();}),'records');
    row('휴지통','',leave(()=>setTrash(true)),'trash');
    if(dialog.open)(priorView==='folders'?foldersRow:groupsRow).focus();
   }else if(view==='folders'){
    for(const [id,name]of folderKinds)row(name+' 폴더',`${foldersFor(id).length}개`,()=>render('folders:'+id),'folder');
    if(dialog.open)(priorView.startsWith('folders:')?[...body.querySelectorAll('button')][folderKinds.findIndex(([id])=>id===priorView.split(':')[1])]:back).focus();
   }else{
    const isFolder=view.startsWith('folders:'),folderKind=isFolder?view.split(':')[1]:null,items=isFolder?foldersFor(folderKind):snapshot.groups||[],add=button(isFolder?'새 폴더':'새 그룹',leave(()=>isFolder?folderEditor(null,folderKind):groupEditor()));add.className='record-settings-add';body.append(add);
    for(const item of items){const detail=isFolder?scopeLabel(item.visibility):`${item.members.filter(id=>snapshot.friends.some(friend=>friend.id===id)).length}명`,edit=row(item.name,detail,leave(()=>isFolder?folderEditor(item):groupEditor(item)));edit.setAttribute('aria-label',item.name+(isFolder?' 폴더 수정':' 그룹 수정'));}
    if(!items.length)body.append(node('p','record-settings-empty',isFolder?'폴더가 없어요.':'그룹이 없어요.'));
    if(dialog.open)back.focus();
   }
  }
  render('home');
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>dialog.remove();container.append(dialog);dialog.showModal();
 }
 function deleteFolderEditor(folder){
  if(busy)return;editor.replaceChildren();const title=node('p','record-form-title',`‘${folder.name}’ 폴더를 삭제할까요?`),note=node('p','panel-note','글·사진·동영상은 삭제되지 않고 미분류로 옮겨져요. 옮긴 기록은 나만 볼 수 있어요.'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('폴더만 삭제',()=>save('delete-folder',{id:folder.id},'폴더를 삭제했어요. 글·사진·동영상은 미분류에 보관했어요.',()=>chooseFolder('none',folder.kind)));const box=node('div','record-management-confirm');box.append(title,note,cancel,accept);editor.append(box);cancel.focus();
 }
 function moveEditor(){
  if(busy||!selected.size)return;const rows=displayed.filter(row=>selected.has(recordKey(row))),target=destination.value||null,folder=snapshot.folders.find(row=>row.id===target);editor.replaceChildren();const box=node('div','record-management-confirm'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('이동하기',()=>save('manage-records',{action:'move',...recordArgs(rows),folder_id:target},`${rows.length}개 게시물을 옮겼어요.`,()=>{chooseFolder(target||'none');selected.clear();}));box.append(node('p','record-form-title',`${rows.length}개를 ‘${folder?.name||'미분류'}’로 옮길까요?`),node('p','panel-note',folder?`이동한 게시물은 폴더 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'미분류로 옮기면 나만 볼 수 있어요.'),cancel,accept);editor.append(box);cancel.focus();
 }
 function recordArgs(rows){return {media_ids:rows.filter(row=>row.type!=='text').map(row=>row.id),post_ids:rows.filter(row=>row.type==='text').map(row=>row.id)};}
 function trashEditor(rows){
  if(busy||!rows.length)return;editor.replaceChildren();const box=node('div','record-management-confirm'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('휴지통으로 보내기',()=>save('manage-records',{action:'trash',...recordArgs(rows)},'휴지통으로 옮겼어요. 설정에서 복원할 수 있어요.',()=>selected.clear()));
  box.append(node('p','record-form-title',`${rows.length}개 게시물을 휴지통으로 옮길까요?`),node('p','panel-note','목록과 공유에서는 숨겨지고, 원본은 휴지통에 보관돼요.'),cancel,accept);editor.append(box);cancel.focus();
 }
 function restoreEditor(record){
  if(busy)return;editor.replaceChildren();const box=node('div','record-management-confirm'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('복원하기',()=>save('manage-records',{action:'restore',...recordArgs([record])},'미분류·나만 보기로 복원했어요.'));
  box.append(node('p','record-form-title','게시물을 복원할까요?'),node('p','panel-note','미분류·나만 보기로 복원해요. 이후 원하는 폴더로 옮길 수 있어요.'),cancel,accept);editor.append(box);cancel.focus();
 }
 function setTrash(value){if(busy)return;trash=value;container.dataset.trash=String(value);managing=false;selection.hidden=true;selected.clear();editor.replaceChildren();folders.hidden=value||kind==='all';if(foldersHost)foldersHost.hidden=folders.hidden;uploads.hidden=true;add.hidden=value||kind==='text';newPost.hidden=value||!['all','text'].includes(kind);trashHeading.hidden=!value;void load();}
 const newPost=button('＋ 글쓰기',()=>postEditor()),trashHeading=node('div','record-trash-heading');newPost.hidden=!['all','text'].includes(kind);newPost.disabled=true;toolbar.append(newPost);trashHeading.hidden=true;trashHeading.append(node('strong','','휴지통'),button('기록으로 돌아가기',()=>setTrash(false)),node('p','panel-note','삭제한 기록을 보관하는 곳이에요. 여기서는 나만 볼 수 있어요.'));
 function postEditor(record,initialBody='',draftName='new'){
  if(busy)return;editor.replaceChildren();const draftKey=record?.id||draftName;let draft=postDrafts.get(draftKey)||{id:record?.id||crypto.randomUUID(),body:record?.caption||initialBody,folder_id:record?.folder_id||(['all','none'].includes(folderId)?null:folderId),visibility:record?.visibility||'all',create:!record};
  // A reopened new-post editor must not share the ID of a write still in flight.
  if(draft.create&&pendingPostIds.has(draft.id))draft={...draft,id:crypto.randomUUID()};
  const form=node('form','record-post-form'),body=node('textarea');body.maxLength=4000;body.required=true;body.value=draft.body;body.rows=6;
  const target=select('글 폴더',[['','미분류'],...foldersFor('text').map(row=>[row.id,row.name])],draft.folder_id||''),scope=select('글 공개범위',scopes,draft.visibility),note=node('p','panel-note');
  if(!target.value)target.value='';if(draft.folder_id&&!foldersFor('text').some(row=>row.id===draft.folder_id))scope.value='me';
  const remember=()=>{if(draft.create&&committedPostIds.has(draft.id))draft={...draft,id:crypto.randomUUID()};postDrafts.set(draftKey,{...draft,body:body.value,folder_id:target.value||null,visibility:scope.value});};
  const sync=()=>{const folder=snapshot.folders.find(row=>row.id===target.value);scope.hidden=!!folder;note.textContent=folder?`글은 ‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'계정에 저장되어 다른 기기에서도 볼 수 있어요.';remember();};
  body.oninput=remember;target.onchange=()=>{if(!target.value)scope.value='me';sync();};scope.onchange=remember;sync();
  const submit=button(record?'글 수정 저장':'노트에 저장');submit.type='submit';
  form.append(node('p','record-form-title',record?'글 수정':'새 글'),folderScopeFields(target,scope),note,field('노트 글',body),submit,button('닫기',()=>editor.replaceChildren()));
  if(record)form.append(button('휴지통으로',()=>trashEditor([record])));
  form.onsubmit=event=>{event.preventDefault();if(busy||!active())return;remember();const submitted=postDrafts.get(draftKey);if(pendingPostIds.has(submitted.id)){status.textContent='이 글의 이전 저장을 마치는 중이에요. 입력한 내용은 그대로예요. 잠시 후 다시 저장해 주세요.';return;}pendingPostIds.add(submitted.id);void save('save-post',submitted,'글을 계정에 저장했어요.',()=>chooseFolder(target.value||'none','text'),()=>{committedPostIds.add(submitted.id);if(postDrafts.get(draftKey)===submitted)postDrafts.delete(draftKey);}).finally(()=>pendingPostIds.delete(submitted.id));};editor.append(form);body.focus();
 }
 const file=node('input');file.type='file';file.multiple=true;file.accept=kind==='photo'?'image/jpeg,image/png,image/gif,image/webp':kind==='video'?'video/mp4,video/quicktime,video/webm':'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';file.hidden=true;file.setAttribute('aria-label',label+' 앨범에 올리기');
 const uploads=node('div','record-toolbar record-upload'),uploadVisibility=select('새 파일 공개범위',scopes,'all'),add=button((kind==='all'?'사진·동영상':label)+' 올리기',()=>{uploads.hidden=!uploads.hidden;});
 add.className='record-upload-toggle';
 const uploadCaption=node('textarea');uploadCaption.rows=3;uploadCaption.maxLength=100;uploadCaption.placeholder='사진이나 영상에 대한 설명을 적어 주세요';
 const captionField=field('설명 (선택 · 100자까지)',uploadCaption);captionField.classList.add('record-upload-caption');
 const captionHelp=node('p','panel-note','설명을 적은 뒤 파일을 선택해 주세요. 여러 개를 선택하면 같은 설명으로 저장돼요.');captionField.append(captionHelp);
 const scopeNote=node('p','panel-note');uploads.hidden=true;uploads.append(uploadVisibility,captionField,button('파일 선택',()=>file.click()),node('span','panel-note',kind==='photo'?'사진 20MB까지':kind==='video'?'영상 1분 · 50MB까지':'사진 20MB · 영상 1분 / 50MB까지'),scopeNote);toolbar.append(add,refresh);
 (foldersHost||container).append(folders);container.append(trashHeading,toolbar,uploads,file,status,editor,selection,gallery);if(kind==='text')add.hidden=true;
 function renderFolders(){
  release(folderHolds);folderHolds=[];const focused=folders.contains(document.activeElement)?document.activeElement.dataset.folderId:null;folders.replaceChildren();folders.hidden=kind==='all'||trash;if(foldersHost)foldersHost.hidden=folders.hidden;if(folders.hidden)return;
  for(const [id,text]of [['all','전체'],...foldersFor(kind).map(row=>[row.id,row.name]),['none','미분류']]){const b=button(text,()=>{if(busy)return;chooseFolder(id);editor.replaceChildren();selected.clear();renderFolders();void load();});b.dataset.folderId=id;b.setAttribute('aria-pressed',String(folderId===id));const folder=snapshot.folders.find(row=>row.id===id);if(folder){folderHolds.push(bindRecordHold(b,{active:()=>active()&&!busy,open:()=>openFolderMenu(folder)}));}folders.append(b);if(id===focused)b.focus({preventScroll:true});}folders.append(newFolder);newFolder.disabled=busy||!loaded;
 }
 function openRecordMenu(record){openContextMenu('기록 메뉴',record.caption||({text:'글',image:'사진',video:'동영상'}[record.type]),[['수정',()=>record.type==='text'?postEditor(record):mediaEditor(record)],['삭제',()=>trashEditor([record])]]);}
 function openFolderMenu(folder){openContextMenu('폴더 메뉴',folder.name,[['폴더 삭제',()=>deleteFolderEditor(folder)]]);}
 function openContextMenu(label,title,actions){
  if(busy||!active()||container.querySelector('dialog[open]'))return;
  const dialog=node('dialog','record-viewer record-context-dialog');dialog.setAttribute('aria-label',label);dialog.append(node('h3','',title));
  for(const [name,action]of actions){const control=button(name,()=>{dialog.close();action();});if(name.includes('삭제'))control.className='record-context-delete';dialog.append(control);}
  const close=button('닫기',()=>dialog.close());close.className='record-context-close';dialog.append(close);dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>dialog.remove();container.append(dialog);dialog.showModal();
 }

 const failure=error=>{if(active()&&error.name!=='AbortError')status.textContent=error.message||'앨범을 불러오지 못했어요.';};
 function lock(value){busy=value;for(const el of [...container.querySelectorAll('button,input,textarea,select'),...folders.querySelectorAll('button')])el.disabled=value;if(settingsButton)settingsButton.disabled=value||!loaded;syncScope();syncSelection();}
 function syncScope(){const folder=snapshot.folders.find(row=>row.id===folderId);uploadVisibility.hidden=!!folder;scopeNote.textContent=folder?`새 파일은 ‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'사진과 영상은 계정에 저장돼요. 다른 기기에서도 볼 수 있어요.';}
 function scopeLabel(value){return [...scopes,['chosen','선택한 친구·그룹']].find(([id])=>id===value)?.[1]||'공개범위 확인';}
 // Successful writes can finish after a category switch; retire only their saved draft.
 async function save(action,args,message,after,onCommitted){
  if(busy||!active())return;lock(true);status.textContent='저장 중이에요…';
  try{const result=await request(action,args);onCommitted?.(result);if(!active())return;after?.(result);editor.replaceChildren();const loaded=await load();if(active()&&loaded)status.textContent=message;}
  catch(error){failure(error);}finally{if(active())lock(false);}
 }
 function folderEditor(folder,folderKind=folder?.kind||kind){
  if(busy||!folderKinds.some(([id])=>id===folderKind))return;editor.replaceChildren();const form=node('form'),name=node('input');name.type='text';name.maxLength=20;name.value=folder?.name||'';name.required=true;name.placeholder='익명, 친구, 여행…';
  const scope=select('폴더 공개범위',[...scopes,['chosen','선택한 친구·그룹']],folder?.visibility||'all'),choices=node('div'),groups=node('div','record-friends record-group-choices'),friends=friendChecks(folder?.allowed);
  for(const group of snapshot.groups||[]){const check=node('input');check.type='checkbox';check.value=group.id;check.checked=!!folder?.allowed_groups?.includes(group.id);const option=node('label');option.append(check,document.createTextNode(group.name+` · ${group.members.filter(id=>snapshot.friends.some(friend=>friend.id===id)).length}명`));groups.append(option);}
  if(!snapshot.groups?.length)groups.append(node('p','panel-note','설정에서 친구 그룹을 만들 수 있어요.'));
  choices.append(node('h4','','친구 그룹 선택'),groups,node('h4','','개별 친구 선택'),friends,node('p','panel-note','선택한 친구와 그룹의 친구가 볼 수 있어요. 아무도 선택하지 않으면 나만 볼 수 있어요.'));
  const show=()=>choices.hidden=scope.value!=='chosen';scope.onchange=show;show();
  form.append(node('p','record-form-title',(folderKinds.find(([id])=>id===folderKind)[1])+(folder?' 폴더 설정':' 새 폴더')),field('볼 수 있는 사람',scope),field('폴더 이름',name),choices,node('p','panel-note','폴더 안의 기록은 이 공개범위를 따라요.'));
  const submit=button(folder?'폴더 저장':'폴더 만들기');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()));
  if(folder){const remove=button('폴더 삭제',()=>deleteFolderEditor(folder));remove.setAttribute('aria-label',folder.name+' 폴더 삭제');remove.className='record-settings-delete';form.append(remove);}
  form.onsubmit=event=>{event.preventDefault();void save('save-folder',{id:folder?.id,kind:folderKind,name:name.value,visibility:scope.value,allowed:[...friends.querySelectorAll('input:checked')].map(el=>el.value),allowed_groups:[...groups.querySelectorAll('input:checked')].map(el=>el.value)},'폴더를 저장했어요.',result=>chooseFolder(result.id,folderKind));};
  editor.append(form);name.focus();
 }
 function friendChecks(selected=[]){
  const box=node('div','record-friends');for(const friend of snapshot.friends){const check=node('input');check.type='checkbox';check.value=friend.id;check.checked=selected.includes(friend.id);const option=node('label');option.append(check,document.createTextNode(friend.nick||'친구'));box.append(option);}
  if(!snapshot.friends.length)box.append(node('p','panel-note','친구가 생기면 여기서 고를 수 있어요.'));return box;
 }
 function groupEditor(group){
  if(busy)return;editor.replaceChildren();const id=group?.id||crypto.randomUUID(),form=node('form','record-group-form'),name=node('input'),friends=friendChecks(group?.members),count=node('p','panel-note');name.type='text';name.maxLength=20;name.required=true;name.value=group?.name||'';name.placeholder='가족, 학교 친구…';
  const update=()=>count.textContent=`${friends.querySelectorAll('input:checked').length}명 선택`;friends.onchange=update;update();
  const submit=button(group?'그룹 저장':'그룹 만들기');submit.type='submit';form.append(node('p','record-form-title',group?'친구 그룹 수정':'새 친구 그룹'),field('그룹 이름',name),node('p','panel-note','그룹 이름과 구성원은 나만 볼 수 있어요. 그룹을 바꾸면 연결된 폴더를 볼 수 있는 친구도 바뀌어요.'),friends,count,submit,button('취소',()=>editor.replaceChildren()));
  if(group){const remove=button('그룹 삭제',()=>deleteGroupEditor(group));remove.setAttribute('aria-label',group.name+' 그룹 삭제');remove.className='record-settings-delete';form.append(remove);}
  form.onsubmit=event=>{event.preventDefault();void save('save-group',{id,name:name.value,members:[...friends.querySelectorAll('input:checked')].map(el=>el.value),create:!group},'친구 그룹을 저장했어요.');};editor.append(form);name.focus();
 }
 function deleteGroupEditor(group){
  if(busy)return;editor.replaceChildren();const box=node('div','record-management-confirm'),cancel=button('취소',()=>editor.replaceChildren()),accept=button('그룹만 삭제',()=>save('delete-group',{id:group.id},'친구 그룹을 삭제했어요.'));
  box.append(node('p','record-form-title',`‘${group.name}’ 그룹을 삭제할까요?`),node('p','panel-note','친구와 게시물은 그대로 두고 폴더의 이 그룹 선택만 해제해요. 다른 친구·그룹도 선택하지 않은 폴더는 나만 볼 수 있어요.'),cancel,accept);editor.append(box);cancel.focus();
 }
 function mediaEditor(record){
  if(busy)return;editor.replaceChildren();const form=node('form'),caption=node('textarea');caption.rows=3;caption.maxLength=100;caption.placeholder='사진이나 영상에 대한 설명을 적어 주세요 (100자까지)';caption.value=record.caption||'';
  const destination=select('파일 폴더',[['','폴더 없음'],...foldersFor(recordKind(record)).map(folder=>[folder.id,folder.name])],record.folder_id||''),scope=select('파일 공개범위',scopes,record.visibility),note=node('p','panel-note');
  function update(){const folder=snapshot.folders.find(row=>row.id===destination.value);scope.disabled=!!folder;scope.hidden=!!folder;note.textContent=folder?`‘${folder.name}’ 폴더의 공개범위를 따라요. (${scopeLabel(folder.visibility)})`:'';}
  destination.onchange=()=>{if(!destination.value)scope.value='me';update();};update();form.append(node('p','record-form-title',label+' 설정'),folderScopeFields(destination,scope),note,field('설명',caption));
  const submit=button('파일 설정 저장');submit.type='submit';form.append(submit,button('취소',()=>editor.replaceChildren()),button('휴지통으로',()=>trashEditor([record])));form.onsubmit=event=>{event.preventDefault();void save('save-media',{id:record.id,caption:caption.value,visibility:scope.value,folder_id:destination.value||null},'설정을 저장했어요.');};editor.append(form);caption.focus();
 }
 async function showMedia(record){
  const current=run;try{const result=await request('open',{id:record.id,type:record.type,trash});if(!active()||current!==run)return;if(result.type==='text'){const dialog=node('dialog','record-viewer record-post-viewer');dialog.setAttribute('aria-label','노트 글 보기');dialog.append(button('닫기',()=>dialog.close()),node('p','record-full-text',result.caption));dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>dialog.remove();container.append(dialog);dialog.showModal();return;}if(!result.url)throw new Error('파일을 불러오지 못했어요. 새로고침해 주세요.');
   const isPhoto=record.type==='image',dialog=node('dialog','record-viewer'),media=node(isPhoto?'img':'video'),close=button('닫기',()=>dialog.close());media.src=result.url;
   if(isPhoto)media.alt=record.caption||'사진';else{media.controls=true;media.preload='none';media.playsInline=true;}
   media.onerror=()=>dialog.append(node('p','panel-note','파일을 불러오지 못했어요. 닫고 앨범을 새로고침해 주세요.'));
   dialog.append(close,media,node('p','record-viewer-caption',record.caption||''));dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>{if(!isPhoto){media.pause();media.removeAttribute('src');media.load();}dialog.remove();};container.append(dialog);dialog.showModal();
  }catch(error){failure(error);}
 }
 file.onchange=async()=>{
  const files=[...file.files||[]];file.value='';if(busy||!active()||!files.length)return;
  if(files.length>10){status.textContent='한 번에 10개까지 올려 주세요.';return;}
  const target=folderId==='all'||folderId==='none'?null:folderId,visibility=target?'me':uploadVisibility.value,caption=uploadCaption.value;let count=0,error=null;lock(true);
  try{for(const selected of files){if(active())status.textContent=`${count+1}/${files.length}개 저장 중이에요…`;await request('upload',{file:selected,kind:kind==='all'?(selected.type.startsWith('image/')?'photo':'video'):kind,folder_id:target,visibility,caption});count++;}}
  catch(caught){error=caught;}finally{if(active()){uploads.hidden=!error;if(!error)uploadCaption.value='';await load();lock(false);status.textContent=(count?`${count}개를 앨범에 저장했어요. `:'')+(error?error.message:'');}}
 };
 function renderCards(){release(cardHolds);cardHolds=[];gallery.replaceChildren();if(!displayed.length)gallery.append(node('p','record-empty',trash?'휴지통이 비어 있어요.':'아직 '+label+'이 없어요.'));
   for(const record of displayed){
    const mediaLabel=record.type==='text'?'노트':record.type==='image'?'사진':'동영상',card=node('article','record-card'),preview=button('',()=>showMedia(record));preview.className='record-open';preview.setAttribute('aria-label',mediaLabel+' 크게 보기');
    if(record.thumbnail){const image=node('img');image.src=record.thumbnail;image.alt='';image.loading='lazy';image.decoding='async';image.onerror=()=>{image.remove();preview.textContent=mediaLabel+' 열기';};preview.append(image);}else preview.textContent=mediaLabel+' 열기';
    const stage=node('div','record-preview'),actions=node('div','record-actions'),folder=snapshot.folders.find(row=>row.id===record.folder_id);stage.append(preview);actions.append(node('span','panel-note',trash?'휴지통':scopeLabel(folder?.visibility||record.visibility)),trash?button('복원',()=>restoreEditor(record)):button('설정',()=>record.type==='text'?postEditor(record):mediaEditor(record)));
    const copy=node('div','record-copy'),title=record.type==='text'?button(record.caption,()=>showMedia(record)):node('p','record-filename',record.caption||mediaLabel),meta=node('p','record-meta',mediaLabel+(folder?' · '+folder.name:''));if(managing){const check=node('input'),choice=node('label','record-selection-label');check.type='checkbox';check.checked=selected.has(recordKey(record));check.setAttribute('aria-label',(record.caption||mediaLabel)+' 선택');check.onchange=()=>{if(check.checked&&selected.size>=100){check.checked=false;status.textContent='한 번에 100개까지 선택할 수 있어요.';return;}check.checked?selected.add(recordKey(record)):selected.delete(recordKey(record));syncSelection();};choice.append(check,document.createTextNode(meta.textContent));copy.append(choice);}else copy.append(meta);copy.append(title,actions);if(record.type==='video')preview.append(node('span','record-play','▶'));card.dataset.cloudRecordId=record.id;card.dataset.recordType=record.type;if(record.type==='text'){title.className='record-text-open';title.setAttribute('aria-label','글 보기: '+record.caption.slice(0,40));card.classList.add('record-text-card');card.append(copy);}else card.append(copy,stage);gallery.append(card);if(!trash)cardHolds.push(bindRecordHold(card,{active:()=>active()&&!busy,open:()=>openRecordMenu(record)}));
   }
 }
 async function load(offset=0){
  const current=++run;if(!offset){displayed=[];selected.clear();gallery.replaceChildren();container.querySelector('.cloud-more')?.remove();syncSelection();}status.textContent='앨범을 불러오는 중이에요…';
  try{const data=await request('list',{kind,folder:folderId,offset,trash});if(!active()||current!==run)return;
   // Another window or device may have deleted the selected folder.
   if(!trash&&!['all','none'].includes(folderId)&&!data.folders.some(row=>row.id===folderId&&row.kind===kind)){folderId='all';onFolderChange(folderId);return load();}
   snapshot=data;loaded=true;newPost.disabled=busy;if(settingsButton)settingsButton.disabled=busy;renderFolders();syncScope();
   status.textContent='';if(!offset)gallery.replaceChildren();container.querySelector('.cloud-more')?.remove();
   displayed.push(...data.records);renderCards();syncSelection();
   if(data.more){const more=button('더 보기',()=>load(offset+12));more.className='cloud-more';container.append(more);}
   return true;
  }catch(error){if(current===run)failure(error);return false;}
 }
 renderFolders();void load();return {dispose:()=>{release(folderHolds);release(cardHolds);folderHolds=[];cardHolds=[];},refresh:()=>busy||editor.childElementCount?false:load(),composePost:body=>{setTrash(false);postEditor(null,body,'legacy');}};
}

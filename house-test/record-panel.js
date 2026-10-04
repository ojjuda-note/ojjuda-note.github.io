import {mountCloudRecords} from './cloud-record-panel.js?v=20261004-audit1';
import {MEDIA_TYPES,addRecordMedia,listRecordMedia,readRecordMedia,deleteRecordMedia} from './record-media-store.js?v=20261004-records1';
const categories=[['all','전체'],['text','게시판'],['photo','사진'],['video','동영상']];
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
function button(text,click){const el=node('button','',text);el.type='button';el.onclick=click;return el;}
export function createRecordPanel({owner,getText,changeText,saveText,notify,request}){
 let category='all',folderId='all',container=null,generation=0,urls=[],busy=false,limit=12,disposed=false;
 const lifetime=new AbortController(),postDrafts=new Map(),committedPostIds=new Set(),pendingPostIds=new Set();
 function unmount(){generation++;for(const dialog of container?.querySelectorAll('dialog')||[])dialog.close();for(const video of container?.querySelectorAll('video')||[]){video.pause();video.removeAttribute('src');video.load();}urls.forEach(url=>URL.revokeObjectURL(url));urls=[];container=null;}
 function mount(body){
  unmount();if(disposed)return;container=body;body.replaceChildren();const current=generation,active=()=>!disposed&&container===body&&current===generation;
  const wrapper=node('div','record-panel'),tabs=node('div','record-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','기록 종류');
  for(const [value,label]of categories){const tab=button(label,()=>select(value));tab.id='record-tab-'+value;tab.dataset.recordKind=value;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(category===value));tab.setAttribute('aria-controls','record-content');tab.tabIndex=category===value?0:-1;tabs.append(tab);
   tab.onkeydown=event=>{const index=categories.findIndex(([id])=>id===value);let next;if(event.key==='ArrowRight')next=(index+1)%categories.length;if(event.key==='ArrowLeft')next=(index+categories.length-1)%categories.length;if(event.key==='Home')next=0;if(event.key==='End')next=categories.length-1;if(next!==undefined){event.preventDefault();select(categories[next][0]);}};
  }
  function select(value){if(category===value)return;category=value;limit=12;mount(body);body.scrollTop=0;body.querySelector('[aria-selected="true"]').focus({preventScroll:true});}
  const content=node('section','record-content');content.id='record-content';content.setAttribute('role','tabpanel');content.setAttribute('aria-labelledby','record-tab-'+category);
  const foldersHost=node('div','record-folder-strip'),topbar=node('div','record-topbar'),settingsButton=button('⚙︎');settingsButton.className='record-settings-button';settingsButton.setAttribute('aria-label','우리집 설정');settingsButton.setAttribute('aria-haspopup','dialog');settingsButton.disabled=!request;topbar.append(tabs,settingsButton);wrapper.append(topbar,foldersHost,content);body.append(wrapper);
  if(request){
   const cloud=node('div','cloud-records');content.append(cloud);
   mountCloudRecords({postDrafts,committedPostIds,pendingPostIds,container:cloud,kind:category,request,active,foldersHost,settingsButton,initialFolder:folderId,onFolderChange:id=>{folderId=id;}});
   return;
  }
  // Isolated/offline fixtures retain their local records. Account-backed views
  // never read, copy or alter this older storage through the records panel.
  const diarySection=node('section','record-diary');
  if(category==='text'||category==='all'){
   const editor=node('details','record-diary-editor'),summary=node('summary','',getText()?'글 수정':'＋ 글 기록');editor.open=category==='text';
   const label=node('label','','오늘은 어떤 하루였나요?'),field=node('textarea');field.id='diary';field.maxLength=4000;field.value=getText();label.htmlFor=field.id;field.oninput=()=>changeText(field.value);
   editor.append(summary,label,field,button('기록 저장',()=>{saveText(field.value);preview.textContent=field.value||'아직 쓴 글이 없어요.';card.hidden=!field.value.trim();summary.textContent=field.value.trim()?'글 수정':'＋ 글 기록';}),node('p','panel-note','이 기기에 보관한 글이에요.'));
   const card=node('article','record-card record-text-card'),copy=node('div','record-copy'),preview=button(getText(),()=>{editor.open=true;field.focus();});preview.className='record-text-open';
   copy.append(node('p','record-meta','게시판 · 이 기기'),preview);card.append(copy);card.hidden=!getText().trim();diarySection.append(card,editor);
  }
  const localContent=content,folders=node('div','record-folders'),all=button('전체',()=>{});all.setAttribute('aria-pressed','true');folders.append(all);foldersHost.append(folders);content.append(diarySection);
  if(category==='text')return;
  const kind=category,label=kind==='photo'?'사진':kind==='video'?'동영상':'사진·동영상',input=node('input');input.type='file';input.multiple=true;input.accept=(MEDIA_TYPES[kind]||[]).join(',');input.hidden=true;input.setAttribute('aria-label',label+' 파일 선택');
  const add=button(label+' 추가',()=>input.click());add.disabled=busy;
  const status=node('p','record-status',busy?'저장 중이에요…':'');status.setAttribute('role','status');
  const toolbar=node('div','record-toolbar');toolbar.append(add,node('span','panel-note',kind==='photo'?'파일당 20MB · 한 번에 10개':'파일당 100MB · 한 번에 10개'));
  if(kind==='all'){add.hidden=true;toolbar.replaceChildren(button('사진 추가',()=>{select('photo');body.querySelector('.record-content>input[type=file]')?.click();}),button('동영상 추가',()=>{select('video');body.querySelector('.record-content>input[type=file]')?.click();}));}
  const gallery=node('div','record-gallery '+kind);gallery.setAttribute('aria-label',label+' 기록');
  localContent.append(toolbar,input,status,gallery,node('p','panel-note','이 계정의 기록은 이 기기에 저장돼요. 브라우저 데이터를 지우면 사라져요.'));
  function failure(error){if(disposed||error.name==='AbortError')return;const message=error.name==='QuotaExceededError'?'기기 저장 공간이 부족해요. 기존 기록은 그대로 두었어요.':['SecurityError','InvalidStateError','UnknownError'].includes(error.name)?'이 브라우저에서는 사진과 동영상을 저장할 수 없어요. 브라우저 설정을 확인해 주세요.':error.message||'기록을 저장하지 못했어요. 다시 시도해 주세요.';if(active())status.textContent=message;else notify(message);}
  input.onchange=async()=>{
   const selected=Array.from(input.files||[]);input.value='';if(!selected.length||busy||!active())return;
   busy=true;add.disabled=true;status.textContent='저장 중이에요…';let saved=false;
   try{await addRecordMedia(owner,kind,selected,lifetime.signal);saved=true;if(!disposed)notify(label+'을 이 기기에 저장했어요.');}
   catch(error){failure(error);}finally{busy=false;if((saved||!active())&&container&&category!=='text')mount(container);else if(active())add.disabled=false;}
  };
  status.textContent=busy?'저장 중이에요…':'기록을 불러오는 중이에요…';
  (kind==='all'?Promise.all(['photo','video'].map(value=>listRecordMedia(owner,value,lifetime.signal))).then(rows=>rows.flat().sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id))):listRecordMedia(owner,kind,lifetime.signal)).then(async records=>{
   if(!active())return;if(!busy)status.textContent='';
   if(!records.length){gallery.append(node('p','record-empty','아직 '+label+' 기록이 없어요.'));return;}
   for(const record of records.slice(0,limit)){
    if(!active())return;
    const mediaKind=record.kind,mediaLabel=mediaKind==='photo'?'사진':'동영상',card=node('article','record-card'),title=node('p','record-filename',record.name),stage=node('div','record-preview'),actions=node('div','record-actions');card.dataset.recordId=record.id;
    const remove=button('삭제',()=>{
     if(busy||!active())return;
     const confirm=node('div','record-confirm'),question=node('p','','이 '+mediaLabel+'을 삭제할까요?');
     const cancel=button('취소',()=>{confirm.remove();remove.hidden=false;remove.focus();});
     const accept=button('삭제하기',async()=>{if(busy||!active())return;busy=true;accept.disabled=true;cancel.disabled=true;add.disabled=true;let deleted=false;try{await deleteRecordMedia(owner,record.id,lifetime.signal);deleted=true;}catch(error){failure(error);}finally{busy=false;if((deleted||!active())&&container&&category!=='text'){const target=container;mount(target);target.querySelector('.record-toolbar button')?.focus({preventScroll:true});}else if(active()){accept.disabled=false;cancel.disabled=false;add.disabled=false;}}});
     confirm.append(question,cancel,accept);remove.hidden=true;card.after(confirm);cancel.focus();
    });remove.setAttribute('aria-label',record.name+' 삭제');actions.append(remove);const copy=node('div','record-copy');copy.append(node('p','record-meta',mediaLabel+' · 이 기기'),title,actions);card.append(copy,stage);gallery.append(card);
    try{
     const blob=await readRecordMedia(owner,record.id,lifetime.signal);if(!active())return;
     if(!blob)throw new Error('파일을 찾지 못했어요.');const url=URL.createObjectURL(blob);urls.push(url);
     const media=node(mediaKind==='photo'?'img':'video');
     if(mediaKind==='photo'){media.alt=record.name;media.loading='lazy';media.decoding='async';}else{media.controls=false;media.preload='none';media.playsInline=true;media.setAttribute('aria-label',record.name);}
     media.onerror=()=>{if(active()&&!stage.querySelector('p'))stage.append(node('p','panel-note','이 브라우저에서 볼 수 없는 파일이에요. 파일 저장 후 열어 주세요.'));};media.src=url;
     const open=button('',()=>{const dialog=node('dialog','record-viewer'),full=node(mediaKind==='photo'?'img':'video'),close=button('닫기',()=>dialog.close());full.src=url;if(mediaKind==='photo')full.alt=record.name;else{full.controls=true;full.preload='metadata';full.playsInline=true;}dialog.append(close,full,node('p','record-viewer-caption',record.name));dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});dialog.onclose=()=>{if(mediaKind==='video'){full.pause();full.removeAttribute('src');full.load();}dialog.remove();open.focus();};localContent.append(dialog);dialog.showModal();});open.className='record-open';open.setAttribute('aria-label',record.name+' 크게 보기');open.append(media);if(mediaKind==='video')open.append(node('span','record-play','▶'));stage.append(open);
     const download=node('a','','파일 저장');download.href=url;download.download=record.name;actions.prepend(download);
    }catch(error){if(active()&&error.name!=='AbortError')stage.append(node('p','panel-note','파일을 불러오지 못했어요. 다시 열어 주세요.'));}
   }
   if(active()&&records.length>limit){const more=button('더 보기',()=>{const scroll=body.scrollTop;limit+=12;mount(body);body.scrollTop=scroll;});localContent.insertBefore(more,localContent.lastChild);}
  }).catch(failure);
 }
 return {mount,unmount,dispose(){disposed=true;lifetime.abort();unmount();}};
}

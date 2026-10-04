(()=>{
// The visit loader supplies only rows permitted by the current viewer's session.
// Keep this renderer read-only; owner settings and record RPCs stay in our home.
const categories=[['all','전체'],['diary','노트'],['album','앨범'],['video','비디오']];
const kinds={diary:'text',album:'photo',video:'video'};
const labels={text:'노트',photo:'앨범',video:'비디오'};
const timestamp=value=>{const at=typeof value==='number'?value:Date.parse(value);return Number.isFinite(at)?at:0;};
function visitorRecordRows(home){
 const posts=(home.housePosts||[]).filter(row=>!row.deleted_at).map(row=>({id:row.id,source:'post',kind:'text',title:'',body:row.body||'',folder:row.folder_id||null,at:timestamp(row.created_at)}));
 const diary=(home.diary||[]).filter(row=>row.vis!=='me').map(row=>({id:row.id,source:'diary',kind:'text',title:row.title||'',body:row.body||'',folder:null,at:timestamp(row.at),likes:Math.max(0,Number(row.likes)||0),liked:!!row.liked,media:row.media}));
 const media=(home.album||[]).filter(row=>!row.deleted_at&&(home.real||row.vis!=='me')).map(row=>({id:row.id,source:'media',kind:row.type==='video'?'video':'photo',title:row.caption||'',body:'',folder:row.folder||null,at:timestamp(row.at),art:row.type==='art'?row.art:null}));
 return [...posts,...diary,...media].sort((a,b)=>b.at-a.at||String(a.id).localeCompare(String(b.id)));
}
function visitorRecordsMarkup(home,{section='all',folder='all',escape:w,time,mediaCache={},guestbook,intro}){
 const community=section==='guestbook'||section==='intro';
 const navigation=`<div class="visit-sections" aria-label="집 메뉴">${[['all','기록'],['guestbook','방명록'],['intro','소개글']].map(([id,label])=>`<button type="button" data-act="sec" data-sec="${id}" aria-pressed="${community?section===id:id==='all'}">${label}</button>`).join('')}</div>`;
 if(community)return navigation+`<div class="panel-body visit-community">${section==='guestbook'?guestbook(home):intro(home)}</div>`;
 const selected=categories.some(([id])=>id===section)?section:'all',kind=kinds[selected],rows=visitorRecordRows(home);
 const tabs=`<div class="visit-record-tabs" data-visit-tabs role="tablist" aria-label="기록 종류">${categories.map(([id,label])=>`<button type="button" id="visit-tab-${id}" role="tab" aria-controls="visit-record-content" aria-selected="${selected===id}" tabindex="${selected===id?0:-1}" data-act="sec" data-sec="${id}">${label}</button>`).join('')}</div>`;
 const folders=kind?(home.folders||[]).filter(item=>item.kind===kind||!item.kind&&rows.some(row=>row.kind===kind&&row.folder===item.id)):[];
 const chosen=kind&&(folder==='none'||folders.some(item=>item.id===folder))?folder:'all';
 const folderBar=kind?`<div class="visit-folders" aria-label="${labels[kind]} 폴더">${[['all','전체'],['none','미분류'],...folders.map(item=>[item.id,item.name])].map(([id,name])=>`<button type="button" data-act="visit-folder" data-id="${w(id)}" aria-pressed="${chosen===id}">${w(name)}</button>`).join('')}</div>`:'';
 const visible=rows.filter(row=>(!kind||row.kind===kind)&&(!kind||chosen==='all'||chosen==='none'&&!row.folder||row.folder===chosen));
 const content=visible.map(row=>{
  const action=row.kind==='text'?`data-act="visit-note" data-id="${w(row.id)}" data-source="${row.source}"`:`data-act="open-media" data-id="${w(row.id)}"`;
  const caption=(row.kind==='text'?[row.title,row.body].filter(Boolean).join('\n'):row.title)||labels[row.kind],thumb=mediaCache[row.id]?.thumb;
  const preview=row.kind==='text'?'':`<button type="button" class="visit-record-preview" ${action} aria-label="${labels[row.kind]} 크게 보기: ${w(caption)}">${row.art?`<span aria-hidden="true">${w(row.art.emoji||'🖼️')}</span>`:thumb?`<img src="${w(thumb)}" alt="" loading="lazy" data-protect-photo="true">`:'<span aria-hidden="true">▧</span>'}${row.kind==='video'?'<span class="visit-record-play" aria-hidden="true">▶</span>':''}</button>`;
  return `<article class="visit-record${row.kind==='text'?' visit-record-note':''}" data-visit-record="${w(row.id)}" data-record-kind="${row.kind}"><div class="visit-record-copy"><span class="visit-record-meta">${labels[row.kind]} · ${w(time(row.at))}</span><button type="button" class="visit-record-title" ${action}>${w(caption)}</button>${row.source==='diary'?`<button class="visit-record-like" data-act="like" data-id="${w(row.id)}" aria-pressed="${row.liked}" aria-label="노트 좋아요 ${row.likes}">♥ ${row.likes}</button>`:''}</div>${preview}</article>`;
 }).join('')||'<div class="empty">아직 볼 수 있는 기록이 없어요.</div>';
 return navigation+tabs+folderBar+`<div id="visit-record-content" role="tabpanel" aria-labelledby="visit-tab-${selected}" class="visit-record-list">${content}</div>`;
}
function handleVisitorTabKey(event){
 const tab=event.target.closest?.('[data-visit-tabs] [role="tab"]');if(!tab)return;
 const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);let next;
 if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
 if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next===undefined)return;
 event.preventDefault();const id=tabs[next].id;tabs[next].click();document.getElementById(id)?.focus({preventScroll:true});
}

window.OjjudaVisitRecords={rows:visitorRecordRows,markup:visitorRecordsMarkup};
document.addEventListener("keydown",handleVisitorTabKey);
})();

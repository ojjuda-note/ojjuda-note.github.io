/* Adult administrator editor. Originals stay private; save swaps the manifest atomically. */
(()=>{'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n};
const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b};
window.OjjudaComicEditor={create({client,getSession,onOpen,onDone,notice,compare,imageInfo}){
 const host=document.getElementById('editComic');let state=null,run=0,busy=false,dirty=false,previewUrl=null,previewRun=0;
 const result=async q=>{const {data,error}=await q;if(error)throw error;return data};
 const valid=s=>state===s&&s.owner===getSession().user?.id&&s.generation===getSession().generation&&getSession().admin;
 function dropPreview(){previewRun++;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null}
 function reset(){run++;state=null;busy=false;dirty=false;dropPreview();host.replaceChildren();host.hidden=true}
 function changed(){dirty=true;dropPreview();host.querySelector('.edit-preview')?.replaceChildren()}
 function lock(value){busy=value;host.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=value);if(!value&&state)drawPages()}
 function field(label,type,value){const box=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';box.append(input);input.oninput=changed;return {box,input}}
 async function cancel(){if(busy)return;if(dirty&&!confirm('저장하지 않은 수정을 취소할까요?'))return;reset();await onDone()}
 async function preview(item){const s=state;if(!s||busy)return;dropPreview();const token=previewRun,target=host.querySelector('.edit-preview');target.replaceChildren(el('p','이미지를 불러오는 중…'));
  try{const blob=item.file||await result(client.storage.from('creative-comics').download(item.path));if(!valid(s)||token!==previewRun)return;previewUrl=URL.createObjectURL(blob);const img=el('img');img.src=previewUrl;img.alt=item.filename||item.file.name;target.replaceChildren(img,btn('미리보기 닫기',()=>{dropPreview();target.replaceChildren()}));target.scrollIntoView({block:'nearest'})}catch{if(valid(s)&&token===previewRun)target.replaceChildren(el('p','이미지를 불러오지 못했어요.'),btn('다시 시도',()=>preview(item)))}
 }
 function move(from,to){if(busy||!state)return;const list=state.pages;to=Math.max(0,Math.min(list.length-1,to));list.splice(to,0,list.splice(from,1)[0]);changed();drawPages()}
 function drawPages(){const s=state;if(!s)return;s.list.replaceChildren();s.count.textContent=s.pages.length+'장 · 저장 전에는 기존 내용이 유지돼요.';
  s.pages.forEach((item,i)=>{const li=el('li',null,'edit-page'),name=item.filename||item.file.name;li.append(el('span',(i+1)+'. '+name,'edit-page-name'));if(item.file)li.append(el('small','새 이미지','edit-new'));
   const actions=el('div',null,'edit-page-actions');actions.append(btn('미리보기',()=>preview(item)));
   const replace=el('input');replace.type='file';replace.accept='image/png,image/jpeg,image/webp';replace.hidden=true;replace.onchange=()=>{if(busy||!replace.files?.[0])return;s.pages[i]={file:replace.files[0]};changed();drawPages()};
   actions.append(btn('교체',()=>replace.click()),replace);
   for(const [text,d] of [['↑',-1],['↓',1]]){const b=btn(text,()=>move(i,i+d));b.disabled=i+d<0||i+d>=s.pages.length;b.setAttribute('aria-label',name+(d<0?' 앞으로':' 뒤로'));actions.append(b)}
   const number=el('input');number.type='number';number.min=1;number.max=s.pages.length;number.value=i+1;number.setAttribute('aria-label',name+' 이동할 순서');number.onchange=()=>{const n=Number(number.value);if(Number.isInteger(n)&&n>0&&n<=s.pages.length)move(i,n-1);else number.value=i+1};actions.append(number);
   actions.append(btn('빼기',()=>{if(busy)return;s.pages.splice(i,1);changed();drawPages()}));li.append(actions);s.list.append(li);
  });
 }
 async function save(event){event.preventDefault();const s=state;if(!s||busy||!valid(s))return;
  if(!s.pages.length||s.pages.length>500){s.message.textContent='페이지는 1~500장이어야 해요.';return}
  if(s.pages.some(p=>p.file?.size>20971520)){s.message.textContent='한 장의 용량은 20MB 이하여야 해요.';return}
  lock(true);let committed=false;
  try{
   const pages=[];
   for(let i=0;i<s.pages.length;i++){
    if(!valid(s))throw Error('session');const p=s.pages[i];
    if(!p.file){pages.push({id:p.id});continue}
    if(!p.staged){const info=await imageInfo(p.file);if(!valid(s))throw Error('session');const path=s.owner+'/'+s.book.id+'/'+crypto.randomUUID()+'.'+info.ext;
     s.message.textContent=`바뀐 이미지 업로드 중 ${i+1} / ${s.pages.length}`;
     await result(client.storage.from('creative-comics').upload(path,p.file,{contentType:info.mime,cacheControl:'0',upsert:false}));
     p.staged={path,filename:p.file.name,width:info.width,height:info.height};
    }pages.push(p.staged);
   }
   if(!valid(s))throw Error('session');
   const payload={p_id:s.book.id,p_revision:s.book.revision,p_title:s.title.value.trim(),p_description:s.description.value.trim(),p_series_title:s.series.value.trim(),p_series_order:Number(s.order.value),p_pages:pages,p_next_id:s.next.value||null};
   const signature=JSON.stringify(payload);if(s.signature!==signature){s.signature=signature;s.requestId=crypto.randomUUID()}
   s.message.textContent='수정 내용을 저장하고 있어요.';
   await result(client.rpc('comics_save_edit',{...payload,p_request_id:s.requestId}));committed=true;
   if(!valid(s))return;reset();notice('수정 내용을 저장했어요.');await onDone();
  }catch(error){if(valid(s))s.message.textContent=error.code==='40001'?'다른 곳에서 먼저 수정했어요. 현재 화면을 취소하고 다시 열어 주세요.':(committed?'저장은 완료됐어요. 목록을 새로고침해 주세요.':'저장하지 못했어요. 기존 만화는 유지됩니다. 연결 상태를 확인하고 다시 저장해 주세요.');}
  finally{if(valid(s))lock(false)}
 }
 async function open(book,seriesNames=[]){if(busy)return;reset();const token=run,session=getSession();if(!session.admin)return;onOpen();host.hidden=false;host.replaceChildren(el('p','수정할 만화를 불러오는 중…'));
  try{const [fresh,pages,books]=await Promise.all([result(client.from('creative_comics').select('id,title,description,revision,series_title,series_order,next_comic_id').eq('id',book.id).single()),result(client.from('creative_comic_pages').select('id,filename,path,width,height,position').eq('comic_id',book.id).order('position')),result(client.from('creative_comics').select('id,title,published,series_title,series_order').order('created_at',{ascending:false}))]);
   if(token!==run||session.generation!==getSession().generation||!getSession().admin)return;
   state={book:fresh,pages:pages.map(p=>({...p})),owner:session.user.id,generation:session.generation};const s=state;
   host.replaceChildren();const heading=el('div',null,'heading');heading.append(el('h1','만화 수정'),btn('취소',cancel));host.append(heading);
   const form=el('form');form.onsubmit=save;
   for(const [key,label,type,value,max] of [['title','만화 제목','text',fresh.title,120],['description','소개','textarea',fresh.description,1000],['series','묶음 이름 (선택)','text',fresh.series_title,120],['order','묶음 안에서의 순서','number',fresh.series_order,0]]){const f=field(label,type,value);s[key]=f.input;if(max)f.input.maxLength=max;form.append(f.box)}
   s.title.required=true;s.order.min=1;s.order.max=9999;s.order.required=true;
   s.series.setAttribute('list','comicSeriesNames');const names=el('datalist');names.id='comicSeriesNames';for(const name of [...new Set(seriesNames)].filter(Boolean)){const option=el('option');option.value=name;names.append(option)}
   form.append(names,el('p','같은 묶음 이름을 입력하면 한 시리즈로 모여요. 이름을 비우면 묶음에서 빠집니다.','hint'));
   const nextLabel=el('label','다음화 연결'),next=el('select');next.id='comicNext';s.next=next;next.onchange=changed;const none=el('option','연결 안 함');none.value='';next.append(none);
   for(const target of books.filter(b=>b.id!==fresh.id)){const option=el('option',target.title+(target.published?'':' (비공개)'));option.value=target.id;next.append(option)}next.value=fresh.next_comic_id||'';nextLabel.append(next);form.append(nextLabel,el('p','마지막 페이지의 ‘다음화’ 버튼으로 연결돼요. 비공개 만화는 일반 독자가 열 수 없어요.','hint'));
   const add=field('페이지 추가','file','');add.input.multiple=true;add.input.accept='image/png,image/jpeg,image/webp';add.input.onchange=()=>{if(busy)return;const files=[...add.input.files].sort(compare);if(s.pages.length+files.length>500){s.message.textContent='최대 500장까지 넣을 수 있어요.';add.input.value='';return}s.pages.push(...files.map(file=>({file})));add.input.value='';changed();drawPages()};form.append(add.box);
   s.count=el('p',null,'hint');s.list=el('ol',null,'edit-pages');form.append(s.count,btn('파일 번호순 정렬',()=>{s.pages.sort((a,b)=>compare({name:a.filename||a.file.name},{name:b.filename||b.file.name}));changed();drawPages()}),el('div',null,'edit-preview'),s.list);
   s.message=el('p');s.message.setAttribute('role','status');const submit=el('button','수정 저장','primary');submit.type='submit';form.append(s.message,submit);host.append(form);drawPages();
  }catch{if(token===run)host.replaceChildren(el('p','수정 화면을 불러오지 못했어요.'),btn('목록으로',cancel))}
 }
 window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue=''}});
 return {open,reset,isBusy:()=>busy};
}};
})();

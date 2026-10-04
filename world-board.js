/* Shared public board. All queries use the viewer's session and source RLS. */
(()=>{
 'use strict';
 const labels={card:'익명카드',image:'앨범',video:'비디오',text:'노트'};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,action,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=action;return n;};
 const excerpt=row=>(row.title||row.body||'내용 없는 '+labels[row.kind]).replace(/\s+/g,' ').trim();
 let dispose=null,controller=null;
 function mount(host,{client,owner,authorized=()=>true}={}){
  dispose?.();dispose=null;controller=null;if(!host)return;
  let alive=true,request=0,view=null,rows=[],more=false,busy=false,snapshot=new Date().toISOString(),dialog=null;
  const active=()=>alive&&host.isConnected&&authorized();
  const status=el('p','','board-status');status.setAttribute('role','status');
  const content=el('div');host.replaceChildren(el('h2','게시판','h2'),status,content);
  async function result(query){const {data,error}=await query;if(error)throw error;if(!active())throw Error('stale');return data||[];}
  function query(kind,sort,offset=0,size=20){
   if(kind==='card')return result(client.schema('ojjuda_note').rpc('list_cards',{p_sort:sort==='best'?'popular':'recent',p_lat:null,p_lon:null,p_radius_m:30000,p_limit:size+1,p_cursor:{offset,snapshot}}));
   let q=client.from('world_board_feed').select('id,source,kind,title,body,created_at,like_count,is_liked').eq('kind',kind);
   q=q.lte('created_at',snapshot);if(sort==='best')q=q.order('like_count',{ascending:false});
   q=q.order('created_at',{ascending:false}).order('id',{ascending:false});if(kind!=='card')q=q.order('source',{ascending:false});
   return result(q.range(offset,offset+size)).then(data=>thumbnails(data,kind,size));
  }
  async function thumbnails(data,kind,size){
   if(!['image','video'].includes(kind)||!data.length)return data;
   try{
    const media=await result(client.from('media').select('id,thumb_path,path').eq('type',kind).in('id',data.slice(0,size).map(row=>row.id)));
    const paths=new Map(media.map(row=>[row.id,row.thumb_path||(kind==='image'?row.path:null)]));
    const wanted=[...new Set([...paths.values()].filter(Boolean))];if(!wanted.length)return data;
    const signed=await result(client.storage.from('media').createSignedUrls(wanted,900));
    const urls=new Map(signed.filter(row=>row.signedUrl).map(row=>[row.path,row.signedUrl]));
    return data.map(row=>({...row,thumbnail:urls.get(paths.get(row.id))||null}));
   }catch{return data;}
  }
  function close(){if(!dialog)return false;dialog.querySelectorAll('video').forEach(n=>n.pause());dialog.remove();dialog=null;return true;}
  async function open(row,kind){
   if(kind==='card'){location.assign('/world.html?place=park&card='+encodeURIComponent(row.id));return;}
   close();const focus=document.activeElement,overlay=el('div','','board-backdrop'),panel=el('section','','board-detail');dialog=overlay;
   panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',labels[kind]);panel.tabIndex=-1;
   const done=()=>{close();if(focus?.isConnected)focus.focus();};
   panel.append(button('닫기',done,'btn board-close'));const body=el('div','불러오는 중이에요…');panel.append(body);overlay.append(panel);host.append(overlay);panel.focus();
   overlay.onclick=e=>{if(e.target===overlay)done();};overlay.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();done();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not([disabled]),video')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
   try{
    const item=(await result(client.from('world_board_feed').select('*').eq('id',row.id).eq('source',row.source).limit(1)))[0];
    if(!active()||dialog!==overlay)return;if(!item)throw Error('unavailable');body.replaceChildren();
    if(item.title)body.append(el('h3',item.title));body.append(el('p',item.body,'board-full-text'));
    if(item.path){const signed=await client.storage.from('media').createSignedUrl(item.path,900);if(signed.error||!signed.data?.signedUrl)throw Error('media');if(!active()||dialog!==overlay)return;
     const media=el(kind==='video'?'video':'img');media.src=signed.data.signedUrl;if(kind==='video'){media.controls=true;media.playsInline=true;}else{media.alt=item.body||'앨범 사진';media.dataset.protectPhoto='true';}body.append(media);}
    const like=button('',async()=>{if(busy||!active())return;busy=true;like.disabled=true;try{
     const q=client.from('world_board_likes');await result(item.is_liked?q.delete().eq('user_id',owner).eq('source',item.source).eq('record_id',item.id):q.insert({user_id:owner,source:item.source,record_id:item.id}));
     if(dialog!==overlay)return;item.like_count=Number(item.like_count)+(item.is_liked?-1:1);item.is_liked=!item.is_liked;paintLike();
    }catch{if(dialog===overlay)message.textContent='공감을 저장하지 못했어요. 다시 눌러 주세요.';}finally{busy=false;like.disabled=false;}},'btn');
    const message=el('p');message.setAttribute('role','status');function paintLike(){like.textContent='♥ '+Number(item.like_count).toLocaleString('ko-KR');like.setAttribute('aria-pressed',String(item.is_liked));like.setAttribute('aria-label','공감 '+item.like_count);}paintLike();body.append(like,message);
   }catch{if(active()&&dialog===overlay)body.textContent='이 글을 볼 수 없거나 불러오지 못했어요. 공개범위가 바뀌었을 수 있어요.';}
  }
  function list(items,kind){
   const ul=el('ul','','board-list');
   for(const row of items){
    const li=el('li'),text=excerpt({...row,kind}),b=button('',()=>open(row,kind),'board-row');b.title=text;
    b.append(el('span',text,'board-row-text'));
    if(kind==='image'||kind==='video'){
     const thumb=el('span','','board-thumb');thumb.setAttribute('aria-hidden','true');
     const fallback=el('span',kind==='video'?'':'▧','board-thumb-fallback');thumb.append(fallback);
     if(row.thumbnail){const img=el('img');img.src=row.thumbnail;img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>img.remove();thumb.append(img);}
     if(kind==='video')thumb.append(el('span','▶','board-thumb-play'));b.append(thumb);
    }
    li.append(b);ul.append(li);
   }
   if(!items.length)ul.append(el('li','아직 공개된 글이 없어요.','board-empty'));return ul;
  }
  function error(target,retry){target.replaceChildren(el('p','글을 불러오지 못했어요.','board-empty'),button('다시 시도',retry,'btn sm'));}
  async function home(){
   const token=++request;view=null;rows=[];snapshot=new Date().toISOString();content.replaceChildren();status.textContent='';
   const grid=el('div','','board-best-grid');grid.setAttribute('aria-label','종류별 BEST');content.append(grid);
   const tasks=[];
   for(const kind of ['card','image','video','text']){const box=el('section','','board-best');box.dataset.best=kind;
    box.append(button(labels[kind]+' BEST',()=>all(kind,'best'),'board-section-title'),el('small',kind==='card'?'최근 7일 · 공감순':'공감순'));
    const target=el('div','불러오는 중이에요…','board-best-content');box.append(target);grid.append(box);
    tasks.push(query(kind,'best',0,3).then(data=>{if(active()&&token===request)target.replaceChildren(list(data.slice(0,3),kind));}).catch(()=>{if(active()&&token===request)error(target,home);}));}
   for(const kind of ['text','image','video']){const section=el('section','','board-latest');section.dataset.latest=kind;const head=el('header');head.append(el('h3',labels[kind]+' 최신글'),button('더보기',()=>all(kind,'latest'),'board-more'));section.append(head);const target=el('div','불러오는 중이에요…');section.append(target);content.append(section);
    tasks.push(query(kind,'latest',0,5).then(data=>{if(active()&&token===request)target.replaceChildren(list(data.slice(0,5),kind));}).catch(()=>{if(active()&&token===request)error(target,home);}));}
   await Promise.all(tasks);return active()&&token===request;
  }
  function renderAll(){
   const head=el('header','','board-list-heading');head.append(button('‹ 게시판',home,'btn sm'),el('h3',labels[view.kind]+(view.sort==='best'?' BEST':' 전체글')),button(view.sort==='best'?'최신순':'공감순',()=>all(view.kind,view.sort==='best'?'latest':'best'),'btn sm'));
   content.replaceChildren(head,list(rows,view.kind));if(more)content.append(button('더 불러오기',()=>loadPage(false),'btn board-load'));else if(rows.length)content.append(el('p','모든 글을 보았어요.','board-empty'));
  }
  async function loadPage(reset){
   if(busy)return false;busy=true;const token=++request,offset=reset?0:rows.length;status.textContent='불러오는 중이에요…';content.querySelector('.board-load')?.setAttribute('disabled','');
   try{const data=await query(view.kind,view.sort,offset,20);if(!active()||request!==token)return false;rows=reset?data.slice(0,20):rows.concat(data.slice(0,20));more=data.length>20;status.textContent='';renderAll();return true;}
   catch{if(active()&&request===token){status.replaceChildren(el('span','목록을 불러오지 못했어요. '),button('다시 시도',()=>loadPage(reset),'btn sm'));}return false;}
   finally{busy=false;content.querySelector('.board-load')?.removeAttribute('disabled');}
  }
  function all(kind,sort){if(busy)return;view={kind,sort};snapshot=new Date().toISOString();rows=[];more=false;renderAll();void loadPage(true);}
  dispose=()=>{alive=false;request++;close();};
  controller={back(){if(close())return true;if(view){void home();return true;}return false;},refresh(){if(dialog)return Promise.resolve(false);snapshot=new Date().toISOString();return view?loadPage(true):home();}};
  if(!client||!owner){status.textContent='로그인하면 게시판의 공개 글을 볼 수 있어요.';content.append(Object.assign(el('a','로그인','btn'),{href:'/?auth=login&next=world'}));return;}
  void home();
 }
 window.OjjudaBoard={mount,back:()=>controller?.back()||false,refresh:()=>controller?.refresh()??Promise.resolve(false)};
})();

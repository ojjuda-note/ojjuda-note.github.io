/* Source visibility and author permissions are enforced again by database RLS. */
(()=>{
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function mount(host,{client,owner,item,active=()=>true,focus=false}){
  host.classList.add('board-comments');
  const stylesheet=document.querySelector('link[href*="/world-board.css"]');
  if(stylesheet){const url=new URL(stylesheet.href);url.searchParams.set('v','20261009-compact1');if(stylesheet.href!==url.href)stylesheet.href=url.href;}
  const current=()=>host.isConnected&&active();
  const media=item.source==='media',table=media?'media_comments':'world_board_comments';
  const fields=media?'id,body,author_id,author_nick,created_at':'id,body,author_id,created_at,author:profiles(nickname)';
  let loading=false,posting=false,offset=0,more=false,pending=null,seen=new Set();
  const heading=el('div','','board-comments-heading'),list=el('ul','','board-comment-list'),status=el('p','','board-comment-status');
  const credits=el('ul','','board-comment-list board-media-credits'),source=el('button','출처','board-credit-toggle');
  credits.hidden=true;credits.setAttribute('aria-label','사진·영상 출처');source.type='button';source.hidden=true;source.setAttribute('aria-expanded','false');
  source.onclick=()=>{credits.hidden=!credits.hidden;source.setAttribute('aria-expanded',String(!credits.hidden));};
  heading.append(el('h4','댓글'),source);
  status.setAttribute('role','status');list.setAttribute('aria-label','댓글 목록');
  const older=el('button','이전 댓글 더 보기','btn sm');older.type='button';older.hidden=true;
  const form=el('form','','board-comment-form'),input=el('textarea'),send=el('button','댓글 등록','btn pri');
  input.rows=1;input.required=true;input.placeholder='댓글 쓰기';input.setAttribute('aria-label','댓글 내용');send.type='submit';
  const resize=()=>{input.style.height='auto';input.style.height=Math.min(140,Math.max(44,input.scrollHeight+2))+'px';};input.addEventListener('input',resize);
  form.append(input,send);host.replaceChildren(heading,credits,list,older,status,form);
  function parent(q){return media?q.eq('media_id',item.id):q.eq('source',item.source).eq('record_id',item.id);}
  function draw(row){
   if(seen.has(row.id))return;seen.add(row.id);
   const credit=media&&row.id===item.id+'_source'&&/^\s*출처\s*[·•]\s*제작\s*:/.test(row.body)&&row.body.includes('https://commons.wikimedia.org/')&&row.body.includes('https://creativecommons.org/');
   const li=el('li'),meta=el('div','','board-comment-meta');
   const nick=!row.author_id?'탈퇴한 사용자':media?(row.author_nick||'회원'):(row.author?.nickname||'회원');
   const time=el('time',new Date(row.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=row.created_at;
   const text=el('p');
   if(credit){for(const [index,line] of row.body.split('\n').entries()){if(index)text.append('\n');let url;try{url=new URL(line.trim());}catch{}if(url?.protocol==='https:'&&['commons.wikimedia.org','creativecommons.org'].includes(url.hostname)){const link=el('a',url.hostname==='commons.wikimedia.org'?'원본 보기':'이용 조건');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';text.append(link);}else text.append(line);}}
   else text.textContent=row.body;
   meta.append(el('strong',nick),time);li.append(meta,text);
   if(row.author_id===owner){const remove=el('button','삭제','board-comment-delete');remove.type='button';remove.setAttribute('aria-label','내 댓글 삭제');
    remove.onclick=async()=>{if(!current()||remove.disabled)return;remove.disabled=true;try{const {data,error}=await parent(client.from(table).delete().eq('id',row.id)).select('id');if(error||!data?.length)throw error||Error('not_deleted');if(!current())return;li.remove();if(!credits.children.length){source.hidden=true;credits.hidden=true;source.setAttribute('aria-expanded','false');}offset=Math.max(0,offset-1);status.textContent='댓글을 삭제했어요.';}catch{if(current()){remove.disabled=false;status.textContent='댓글을 삭제하지 못했어요.';}}};meta.append(remove);}
   if(credit){credits.append(li);source.hidden=false;}else list.append(li);
  }
  async function load(reset=false){
   if(loading||!current())return;loading=true;older.disabled=true;input.disabled=true;send.disabled=true;
   if(reset){offset=0;seen=new Set();list.replaceChildren();credits.replaceChildren();credits.hidden=true;source.hidden=true;source.setAttribute('aria-expanded','false');status.textContent='댓글을 불러오는 중이에요…';}
   try{const {data,error}=await parent(client.from(table).select(fields)).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+30);
    if(error)throw error;if(!current())return;more=data.length>30;const page=data.slice(0,30);page.forEach(draw);offset+=page.length;
    status.textContent='';older.textContent='이전 댓글 더 보기';older.hidden=!more;
   }catch{if(current()){status.textContent='댓글을 불러오지 못했어요. 다시 눌러 주세요.';older.textContent='댓글 다시 불러오기';older.hidden=false;}}
   finally{loading=false;if(current()){older.disabled=false;input.disabled=posting;send.disabled=posting;}}
  }
  older.onclick=()=>load(offset===0);
  form.onsubmit=async event=>{
   event.preventDefault();const body=input.value.replace(/\r\n?/g,'\n').trim();if(!body||posting||!current())return;
   posting=true;input.disabled=true;send.disabled=true;status.textContent='댓글을 등록하는 중이에요…';
   if(!pending||pending.body!==body)pending={id:crypto.randomUUID(),body};
   const record={id:pending.id,body,author_id:owner,...(media?{media_id:item.id}:item.source==='post'?{post_id:item.id}:{diary_id:item.id})};
   try{
    const {error}=await client.from(table).insert(record);
    if(error){
     if(error.code!=='23505')throw error;
     const check=await parent(client.from(table).select('id,body,author_id').eq('id',pending.id)).limit(1);
     if(check.error||check.data?.[0]?.body!==body||check.data[0].author_id!==owner)throw error;
    }
    if(!current())return;pending=null;input.value='';resize();await load(true);if(current())status.textContent='댓글을 등록했어요.';
   }catch{if(current())status.textContent='댓글을 등록하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.';}
   finally{posting=false;if(current()){input.disabled=false;send.disabled=false;}}
  };
  void load(true).then(()=>{if(focus&&current())input.focus();});
 }
 window.OjjudaBoardComments={mount,version:'20261009-compact1'};
})();

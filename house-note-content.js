// Notes remain plain text in storage. Only vetted HTTPS image links become media.
export function imageUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['upload.wikimedia.org','thumb.wikimedia.org'].includes(u.hostname)&&u.pathname.startsWith('/wikipedia/commons/')&&/\.(jpe?g|png|webp|gif)$/i.test(u.pathname)?u.href:null;}catch{return null;}
}
export function parseNote(value){
 const text=String(value||''),parts=[];let end=0,count=0;
 const pattern=/!\[([^\]\n]{0,200})\]\((https:\/\/[^\s<>"')]+)\)/g;
 for(const match of text.matchAll(pattern)){
  const url=imageUrl(match[2]);if(!url||count>=3)continue;
  if(match.index>end)parts.push({text:text.slice(end,match.index)});
  parts.push({url,alt:match[1]||'웃긴 짤'});end=match.index+match[0].length;count++;
 }
 if(end<text.length)parts.push({text:text.slice(end)});
 return parts;
}
const selector='.visit-note-body,.record-full-text,.visit-record-title,.record-text-open';
const previews='.visit-record-title,.record-text-open';
export function enhanceNote(el){
 if(el.dataset.noteImages==='ready')return;
 const body=el.textContent,parts=parseNote(body);if(!parts.some(part=>part.url))return;
 const preview=el.matches(previews),doc=el.ownerDocument;
 el.dataset.noteImages='ready';el.classList.add('house-note-images');
 const frag=doc.createDocumentFragment();
 if(preview){
  const caption=parts.filter(part=>'text'in part).map(part=>part.text).join('').split(/\n출처:/)[0].trim();
  const text=doc.createElement('span');text.textContent=caption;frag.append(text);
  el.setAttribute('aria-label',caption.split('\n')[0]+' · 짤 보기');
 }
 let shown=0;
 for(const part of parts){
  if(part.url){
   if(preview&&shown++)continue;
   const img=doc.createElement('img');img.src=part.url;img.alt=part.alt;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>{img.hidden=true;const hint=doc.createElement('span');hint.className='house-note-image-error';hint.textContent='이미지를 불러오지 못했어요. 출처에서 확인해 주세요.';img.after(hint);},{once:true});
   frag.append(img);
  }else if(!preview){
   const spans=part.text.split(/(https:\/\/[^\s<>"']+)/g);
   for(const s of spans){
    if(/^https:\/\//.test(s)){
     try{const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password){const a=doc.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=/creativecommons\.org$/.test(u.hostname)?'이용 조건 보기':u.hostname==='commons.wikimedia.org'?'원본 출처 보기':s;frag.append(a);continue;}}catch{}
    }
    frag.append(doc.createTextNode(s));
   }
  }
 }
 el.replaceChildren(frag);
}
export function enhanceTree(root){
 if(root.nodeType!==1)return;
 if(root.matches(selector))enhanceNote(root);
 root.querySelectorAll(selector).forEach(enhanceNote);
}
if(typeof document!=='undefined'){
 const style=document.createElement('style');
 style.textContent='.house-note-images{white-space:pre-wrap;overflow-wrap:anywhere}.house-note-images img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;margin:14px auto;border-radius:12px;background:#f5f3ef}.visit-record-title.house-note-images,.record-text-open.house-note-images{display:block!important;max-height:none!important;-webkit-line-clamp:unset!important;overflow:visible!important;width:100%;text-align:left}.visit-record-title.house-note-images img,.record-text-open.house-note-images img{max-height:280px}.house-note-images a{color:inherit;text-decoration:underline;font-size:.85em}.house-note-image-error{display:block;font-size:.85em;opacity:.7}';
 document.head.append(style);
 const start=()=>{
  enhanceTree(document.body);
  new MutationObserver(changes=>{for(const change of changes){for(const added of change.addedNodes){if(added.nodeType===1)enhanceTree(added);else if(added.parentElement?.matches(selector))enhanceNote(added.parentElement);}}}).observe(document.body,{childList:true,subtree:true});
 };
 document.body?start():document.addEventListener('DOMContentLoaded',start,{once:true});
}

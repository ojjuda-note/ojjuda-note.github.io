/* Resize live widgets without detaching their iframes or inputs. */
const limits={calendar:300,weather:260,news:240,ledger:360,calculator:340};
const openHeights={calendar:530,weather:350,news:330,ledger:630,calculator:410};
export function attachWidgetSizing(host,boxes,{active,isWidget,getSize,onCommit}){
 let gesture=null,alive=true;
 const nodes=new Map(),observers=[];
 const make=(tag,cls)=>{const e=document.createElement(tag);e.className=cls;return e;};
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
 const minWidth=()=>Math.min(160,Math.max(120,(host.clientWidth-12)/2));
 function geometry(id){const size=getSize(id);return {width:clamp(size?size.w*host.clientWidth:minWidth(),minWidth(),host.clientWidth),height:clamp(size?.h||160,160,1200)};}
 function previewText(id){
  const box=boxes.get(id),c=nodes.get(id);if(!box||!c)return;
  let value='',hint='';
  if(id==='calendar'){
   const date=box.querySelector('[data-date][aria-pressed=true]')?.dataset.date,d=date?new Date(date+'T12:00:00'):new Date();
   value=d.toLocaleDateString('ko-KR',{month:'long',day:'numeric'});hint=d.toLocaleDateString('ko-KR',{weekday:'long'});
  }else if(id==='weather'){value=box.querySelector('.life-weather-now>strong')?.textContent||'—';hint=box.querySelector('.life-weather-now>span')?.textContent||'날씨를 확인해 보세요.';}
  else if(id==='calculator'){value=box.querySelector('output')?.textContent||'0';hint='계산기';}
  else if(id==='news'){value='오늘의 뉴스';hint='주요 · 경제 · 생활';}
  else{value='내 가계부';hint='수입 · 지출 · 최근 내역';}
  c.value.textContent=value;c.hint.textContent=hint;
 }
 function paint(id,width,height){
  const box=boxes.get(id),c=nodes.get(id);if(!box||!c)return;
  box.style.width=width+'px';box.style.height=height+'px';
  const head=box.querySelector('summary').offsetHeight;box.style.setProperty('--widget-head',head+'px');
  const compact=width<({weather:150,news:150,calculator:180}[id]||270)||height<limits[id]||height-head<150;
  box.classList.toggle('life-widget-narrow',width<270);
  box.classList.toggle('life-widget-compact',compact);c.preview.hidden=!compact;
  for(const [edge,handle] of c.handles){handle.setAttribute('aria-description',`현재 가로 ${Math.round(width)}, 세로 ${Math.round(height)}. 방향키로도 조절할 수 있어요.`);handle.title=`${edge==='e'?'가로':edge==='s'?'세로':'가로·세로'} 크기 조절 · 방향키도 사용할 수 있어요.`;}
 }
 function refresh(){
  if(!alive)return;
  for(const [id,box] of boxes){const c=nodes.get(id);if(!box||!c)continue;
   const enabled=isWidget();c.preview.hidden=!enabled;for(const [,handle]of c.handles)handle.hidden=!enabled;
   if(!enabled){box.style.removeProperty('width');box.style.removeProperty('height');box.style.removeProperty('--widget-head');box.classList.remove('life-widget-compact','life-widget-narrow');continue;}
   const g=gesture?.id===id?gesture.current:geometry(id);paint(id,g.width,g.height);previewText(id);
  }
 }
 function finish(apply){
  if(!gesture)return;const g=gesture;gesture=null;
  if(g.handle.hasPointerCapture(g.pointer))g.handle.releasePointerCapture(g.pointer);
  host.classList.remove('life-widget-resizing');g.box.classList.remove('life-widget-sizing');
  if(apply&&g.moved&&active())onCommit(g.id,{w:clamp(g.current.width/host.clientWidth,.05,1),h:Math.round(g.current.height)});
  refresh();
 }
 for(const [id,box]of boxes){
  if(!box)continue;
  const title=box.querySelector('summary strong').textContent;
  const preview=make('div','life-widget-preview'),value=make('strong','life-widget-value'),hint=make('span','life-widget-hint'),open=make('button','life-widget-open');
  open.type='button';open.textContent='내용 보기';open.setAttribute('aria-label',title+' 내용 보기');open.dataset.worldSwipe='off';
  open.onclick=()=>{if(active())onCommit(id,{w:1,h:openHeights[id]});};preview.append(value,hint,open);box.append(preview);
  const handles=[];
  for(const [edge,label]of [['e','가로'],['s','세로'],['se','모서리']]){
   const handle=make('button','life-widget-resize life-widget-resize-'+edge);handle.type='button';handle.dataset.worldSwipe='off';handle.setAttribute('aria-label',title+' '+label+' 크기 조절');
   handle.onpointerdown=event=>{
    if(!active()||!isWidget()||event.button!==0)return;
    event.preventDefault();event.stopPropagation();const r=box.getBoundingClientRect();
    gesture={id,box,handle,pointer:event.pointerId,edge,x:event.clientX,y:event.clientY,original:{width:r.width,height:r.height},current:{width:r.width,height:r.height},moved:false};
    handle.setPointerCapture(event.pointerId);host.classList.add('life-widget-resizing');box.classList.add('life-widget-sizing');
   };
   handle.onkeydown=event=>{
    if(!active()||!isWidget()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const g=geometry(id),step=event.shiftKey?50:20;
    if(event.key==='Home'){g.width=minWidth();g.height=160;}
    if((edge==='e'||edge==='se')&&event.key==='ArrowLeft')g.width-=step;
    if((edge==='e'||edge==='se')&&event.key==='ArrowRight')g.width+=step;
    if((edge==='s'||edge==='se')&&event.key==='ArrowUp')g.height-=step;
    if((edge==='s'||edge==='se')&&event.key==='ArrowDown')g.height+=step;
    onCommit(id,{w:clamp(g.width,minWidth(),host.clientWidth)/host.clientWidth,h:clamp(g.height,160,1200)});
   };
   handle.onclick=event=>{event.preventDefault();event.stopPropagation();};box.append(handle);handles.push([edge,handle]);
  }
  nodes.set(id,{preview,value,hint,handles});
  const observer=new MutationObserver(()=>previewText(id));observer.observe(box.querySelector('.life-tool-body'),{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-pressed']});observers.push(observer);
 }
 const move=event=>{
  if(!gesture||event.pointerId!==gesture.pointer)return;event.preventDefault();const g=gesture,dx=event.clientX-g.x,dy=event.clientY-g.y;
  g.moved ||=Math.hypot(dx,dy)>3;
  g.current={width:clamp(g.original.width+(g.edge.includes('e')?dx:0),minWidth(),host.clientWidth),height:clamp(g.original.height+(g.edge.includes('s')?dy:0),160,1200)};
  paint(g.id,g.current.width,g.current.height);
 };
 const up=event=>{if(gesture&&event.pointerId===gesture.pointer)finish(true);},cancel=event=>{if(gesture&&event.pointerId===gesture.pointer)finish(false);};
 const escape=event=>{if(event.key==='Escape'&&gesture){event.preventDefault();finish(false);}};
 document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);
 const headerObserver=new ResizeObserver(()=>refresh());for(const box of boxes.values())if(box)headerObserver.observe(box.querySelector('summary'));observers.push(headerObserver);
 let width=host.clientWidth;const resizeObserver=new ResizeObserver(()=>{if(host.clientWidth!==width){width=host.clientWidth;finish(false);refresh();}});resizeObserver.observe(host);
 return {refresh,cancel:()=>finish(false),destroy(){alive=false;finish(false);resizeObserver.disconnect();observers.forEach(o=>o.disconnect());document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);for(const [id,c]of nodes){c.preview.remove();c.handles.forEach(([,h])=>h.remove());const box=boxes.get(id);box.style.removeProperty('width');box.style.removeProperty('height');box.style.removeProperty('--widget-head');box.classList.remove('life-widget-compact','life-widget-narrow');}}};
}

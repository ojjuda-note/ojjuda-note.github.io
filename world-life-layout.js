import {attachWidgetSizing} from './world-life-resize.js?v=20261005-resize1';
/* Personal Life layout. Geometry only: financial and schedule data stay in their tools. */
const catalog = [
 ['calendar','스케줄 달력'],['weather','날씨'],['news','뉴스'],['ledger','가계부'],['calculator','계산기']
];
const ids = catalog.map(([id])=>id);
const defaults = () => ({version:2,mode:'list',order:[...ids],hidden:[],sizes:{}});
function normalize(value) {
 const out=defaults();
 if(!value||![1,2].includes(value.version))return out;
 if(value.mode==='widgets')out.mode='widgets';
 if(Array.isArray(value.order))out.order=[...new Set(value.order.filter(id=>ids.includes(id))),...ids].filter((id,i,a)=>a.indexOf(id)===i);
 if(Array.isArray(value.hidden))out.hidden=[...new Set(value.hidden.filter(id=>ids.includes(id)))];
 if(value.version===2&&value.sizes&&typeof value.sizes==='object')for(const id of ids){
  const size=value.sizes[id];if(size&&Number.isFinite(size.w)&&Number.isFinite(size.h))out.sizes[id]={w:Math.min(1,Math.max(.05,size.w)),h:Math.min(1200,Math.max(160,size.h))};
 }
 return out;
}
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,label,fn)=>{const b=node('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();fn();});return b;};
export function mountLayout(host,{owner,authorized=()=>true}={}) {
 let alive=true,editing=false,drag=null,hold=null,raf=0,sizing=null;
 const key='ojjuda-life-layout-v1:'+(owner||'guest');
 let config;try{config=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{config=defaults();}
 let saved=structuredClone(config);
 const boxes=new Map(ids.map(id=>[id,host.querySelector(`[data-life-tool="${id}"]`)]));
 const listOpen=new Map([...boxes].map(([id,box])=>[id,!!box?.open]));
 const active=()=>alive&&host.isConnected&&authorized();
 const cleanup=[];
 if(!document.querySelector('link[data-life-layout-style]')){
  const style=node('link');style.rel='stylesheet';style.href='/world-life-layout.css?v=20261005-drag2';style.dataset.lifeLayoutStyle='';document.head.append(style);
 }
 host.classList.add('life-layout');
 const toolbar=node('div','','life-layout-toolbar');toolbar.dataset.worldSwipe='off';
 const modes=node('div','','life-layout-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','생활 보기 방식');
 const status=node('p','','life-layout-status');status.setAttribute('role','status');
 const report=text=>{status.textContent=text;};
 function persist(){try{localStorage.setItem(key,JSON.stringify(config));saved=structuredClone(config);return true;}catch{report('배치를 저장하지 못했어요. 기기의 저장 공간이나 브라우저 설정을 확인해 주세요.');return false;}}
 function setMode(mode){if(!active()||drag)return;cancelHold();sizing?.cancel();config.mode=mode;if(!editing&&!persist()){config=structuredClone(saved);render();return;}render();report(mode==='widgets'?'위젯을 길게 눌러 옮기고, ×로 숨기세요. 테두리를 끌면 크기가 바뀌어요.':'목록으로 바꿨어요.');}
 const list=button('목록',null,()=>setMode('list')),widgets=button('위젯',null,()=>setMode('widgets'));modes.append(list,widgets);
 const edit=button('배치 편집',null,()=>{if(!active())return;saved=structuredClone(config);editing=true;render();report('손잡이로 위치를 옮기고, 테두리로 크기를 조절하세요. 끝나면 배치 저장을 눌러 주세요.');});
 const restore=button('숨긴 위젯',null,()=>{edit.click();picker.querySelector('button:not(:disabled)')?.focus();});restore.hidden=true;toolbar.append(modes,restore,edit);
 const editor=node('div','','life-layout-editor');editor.dataset.worldSwipe='off';editor.hidden=true;
 const tip=node('p','원하는 순서로 옮기고, 필요한 도구만 꺼내 놓으세요.','life-layout-tip');
 const picker=node('div','','life-layout-picker');picker.setAttribute('role','group');picker.setAttribute('aria-label','위젯 추가');
 const addButtons=new Map();
 for(const [id,title] of catalog){const add=button('+ '+title,title+' 위젯 추가',()=>{if(!active()||!editing)return;config.hidden=config.hidden.filter(x=>x!==id);delete config.sizes[id];render();report(title+' 위젯을 추가했어요.');});picker.append(add);addButtons.set(id,add);}
 const actions=node('div','','life-layout-actions');
 const save=button('배치 저장',null,()=>{if(!active()||!persist())return;editing=false;render();report('배치를 저장했어요. 이 계정으로 같은 기기에서 다시 볼 수 있어요.');edit.focus();});
 const cancel=button('취소',null,()=>{if(!active())return;finishDrag(false);sizing?.cancel();config=structuredClone(saved);editing=false;render();report('원래 배치로 돌아왔어요.');edit.focus();});
 const reset=button('기본 배치',null,()=>{if(!active())return;config=defaults();render();report('기본 배치로 바꿨어요. 배치 저장을 누르면 적용돼요.');});
 actions.append(reset,cancel,save);editor.append(tip,picker,actions);
 const empty=node('div','','life-layout-empty');empty.hidden=true;empty.append(node('p','아직 꺼내 놓은 도구가 없어요.'),button('위젯 추가',null,()=>{if(editing)picker.querySelector('button:not(:disabled)')?.focus();else edit.click();}));
 const heading=host.querySelector('h2');heading.after(toolbar,editor,status,empty);
 const controls=new Map();
 function move(id,delta){
  if(!active()||!editing)return;
  const visible=config.order.filter(x=>!config.hidden.includes(x)),i=visible.indexOf(id),target=visible[i+delta];if(!target)return;
  const a=config.order.indexOf(id),b=config.order.indexOf(target);[config.order[a],config.order[b]]=[config.order[b],config.order[a]];
  render();report(catalog.find(x=>x[0]===id)[1]+' 위치를 옮겼어요.');
 }
 for(const [id,title] of catalog){
  const box=boxes.get(id);if(!box)continue;
  const summary=box.querySelector('summary');
  const tools=node('span','','life-layout-item-tools');tools.dataset.worldSwipe='off';tools.hidden=true;
  const handle=button('⠿',title+' 끌어서 이동',()=>{});handle.className='life-layout-handle';handle.title='끌어서 위치 바꾸기';
  const up=button('↑',title+' 위로 이동',()=>move(id,-1)),down=button('↓',title+' 아래로 이동',()=>move(id,1));
  const hide=button('×',title+' 숨기기',()=>{if(!active()||(!editing&&config.mode!=='widgets'))return;cancelHold();finishDrag(false);const before=structuredClone(config);config.hidden=[...new Set([...config.hidden,id])];if(!editing&&!persist()){config=before;render();return;}render();report(title+'을 숨겼어요. 숨긴 위젯에서 다시 꺼낼 수 있어요.');(editing?addButtons.get(id):restore).focus();});hide.className='life-layout-hide';hide.title='위젯 숨기기';
  tools.append(handle,up,down,hide);summary.append(tools);controls.set(id,{tools,up,down,handle});
  const click=event=>{if(event.target.closest('button,select,input,option'))return;if(config.mode==='widgets'||editing)event.preventDefault();};summary.addEventListener('click',click);cleanup.push(()=>summary.removeEventListener('click',click));
  const toggled=()=>{if(config.mode==='list'&&!config.hidden.includes(id))listOpen.set(id,box.open);};box.addEventListener('toggle',toggled);cleanup.push(()=>box.removeEventListener('toggle',toggled));
  const start=event=>{
   if(!active()||!editing||event.button!==0)return;
   event.preventDefault();event.stopPropagation();beginDrag(id,handle,event);
  };
  handle.addEventListener('pointerdown',start);cleanup.push(()=>handle.removeEventListener('pointerdown',start));
  const press=event=>{
   if(!active()||config.mode!=='widgets'||drag||hold||event.button!==0||!event.isPrimary)return;
   if(event.target.closest('button,a,input,select,textarea,[contenteditable],.life-tool-body'))return;
   const point={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};
   hold={...point,id,timer:setTimeout(()=>{
    if(!hold||!active())return;hold=null;beginDrag(id,box,point);report('옮길 위치로 끌어 주세요. 놓으면 저장돼요.');
   },450)};
  };
  const context=event=>{if(config.mode==='widgets'&&!event.target.closest('.life-tool-body,button,a,input,select,textarea'))event.preventDefault();};
  box.addEventListener('pointerdown',press);box.addEventListener('contextmenu',context);
  cleanup.push(()=>{box.removeEventListener('pointerdown',press);box.removeEventListener('contextmenu',context);});
 }
 function cancelHold(){if(hold){clearTimeout(hold.timer);hold=null;}}
 function beginDrag(id,handle,event){
  cancelHold();sizing?.cancel();
  const box=boxes.get(id),rect=box.getBoundingClientRect();
  drag={id,handle,box,dx:0,dy:0,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,target:null,after:false};
  handle.setPointerCapture(event.pointerId);boxes.get(id).classList.add('life-layout-dragging');host.classList.add('life-layout-moving');raf=requestAnimationFrame(scrollDrag);

 }
 function paintDrag(){
  if(!drag)return;
  const r=drag.box.getBoundingClientRect(),left=r.left-drag.dx,top=r.top-drag.dy;
  drag.dx=drag.x-drag.offsetX-left;drag.dy=drag.y-drag.offsetY-top;
  drag.box.style.setProperty('--life-drag-x',drag.dx+'px');drag.box.style.setProperty('--life-drag-y',drag.dy+'px');
 }
 function clearTargets(){for(const box of boxes.values())if(box){delete box.dataset.layoutDrop;box.classList.remove('life-layout-dragging');box.style.removeProperty('--life-drag-x');box.style.removeProperty('--life-drag-y');}}
 function targetDrag(){
  if(!drag)return;
  for(const box of boxes.values())if(box)delete box.dataset.layoutDrop;
  if(!drag.moved)return;
  const box=document.elementsFromPoint(drag.x,drag.y).map(e=>e.closest?.('[data-life-tool]')).find(e=>e&&host.contains(e)&&!e.hidden&&e.dataset.lifeTool!==drag.id);
  drag.target=box?.dataset.lifeTool||null;
  if(box){const r=box.getBoundingClientRect();const source=boxes.get(drag.id).getBoundingClientRect();drag.after=Math.abs(source.top-drag.dy-r.top)<20?drag.x>r.left+r.width/2:drag.y>r.top+r.height/2;box.dataset.layoutDrop=drag.after?'after':'before';}
 }
 function scrollDrag(){
  if(!drag||!active())return;
  if(drag.moved){const edge=70,dy=drag.y<edge?-10:drag.y>innerHeight-edge?10:0;if(dy)window.scrollBy(0,dy);paintDrag();targetDrag();}
  raf=requestAnimationFrame(scrollDrag);
 }
 function finishDrag(apply){
  if(!drag)return;const current=drag;drag=null;cancelAnimationFrame(raf);
  if(current.handle.hasPointerCapture(current.pointer))current.handle.releasePointerCapture(current.pointer);
  clearTargets();host.classList.remove('life-layout-moving');
  if(apply&&current.moved&&current.target&&active()){
   const before=structuredClone(config);config.order=config.order.filter(x=>x!==current.id);const i=config.order.indexOf(current.target)+(current.after?1:0);config.order.splice(i,0,current.id);if(!editing&&!persist()){config=before;render();return;}render();report(editing?'위치를 옮겼어요. 배치 저장을 누르면 유지돼요.':'위치를 옮겨 저장했어요.');
  }
 }
 const pointerMove=event=>{if(hold&&event.pointerId===hold.pointerId&&Math.hypot(event.clientX-hold.clientX,event.clientY-hold.clientY)>8)cancelHold();if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();drag.x=event.clientX;drag.y=event.clientY;if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7)drag.moved=true;paintDrag();targetDrag();};
 const pointerUp=event=>{if(hold&&event.pointerId===hold.pointerId)cancelHold();if(drag&&event.pointerId===drag.pointer)finishDrag(true);};
 const pointerCancel=event=>{if(hold&&event.pointerId===hold.pointerId)cancelHold();if(drag&&event.pointerId===drag.pointer)finishDrag(false);};
 const escape=event=>{if(event.key==='Escape'&&(drag||hold)){event.preventDefault();cancelHold();finishDrag(false);report('이동을 취소했어요.');}};
 document.addEventListener('pointermove',pointerMove,{passive:false});document.addEventListener('pointerup',pointerUp);document.addEventListener('pointercancel',pointerCancel);document.addEventListener('keydown',escape);
 function render(){
  host.dataset.lifeView=config.mode;host.classList.toggle('life-layout-editing',editing);
  list.setAttribute('aria-pressed',String(config.mode==='list'));widgets.setAttribute('aria-pressed',String(config.mode==='widgets'));editor.hidden=!editing;edit.hidden=editing;restore.hidden=editing||!config.hidden.length;
  const visible=config.order.filter(id=>!config.hidden.includes(id));empty.hidden=!!visible.length;
  config.order.forEach((id,index)=>{
   const box=boxes.get(id),c=controls.get(id);if(!box||!c)return;
   const hidden=config.hidden.includes(id);box.hidden=hidden;if(config.mode==='widgets')box.dataset.worldSwipe='off';else delete box.dataset.worldSwipe;box.style.order=String(index);
   box.open=!hidden&&(config.mode==='widgets'||!!listOpen.get(id));
   c.tools.hidden=!editing&&config.mode!=='widgets';c.handle.hidden=!editing;c.up.hidden=!editing;c.down.hidden=!editing;c.up.disabled=visible[0]===id;c.down.disabled=visible.at(-1)===id;
   const add=addButtons.get(id);add.disabled=!hidden;add.textContent=(hidden?'+ ':'✓ ')+catalog.find(x=>x[0]===id)[1];
  });
  sizing?.refresh();
 }
 sizing=attachWidgetSizing(host,boxes,{active,isWidget:()=>config.mode==='widgets',getSize:id=>config.sizes[id],onCommit:(id,size)=>{
  if(!active())return;const before=structuredClone(config);config.sizes[id]=size;
  if(!editing&&!persist()){config=before;render();return;}
  render();report(editing?'크기를 바꿨어요. 배치 저장을 눌러 주세요.':'위젯 크기를 저장했어요.');
 }});
 render();if(config.mode==='widgets')report('위젯을 길게 눌러 옮기고, ×로 숨기세요. 테두리를 끌면 크기가 바뀌어요.');
 return()=>{
  alive=false;cancelHold();sizing?.destroy();finishDrag(false);cleanup.forEach(fn=>fn());
  document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerUp);document.removeEventListener('pointercancel',pointerCancel);document.removeEventListener('keydown',escape);
  host.classList.remove('life-layout','life-layout-editing');delete host.dataset.lifeView;
  for(const box of boxes.values())if(box){box.hidden=false;delete box.dataset.worldSwipe;box.style.removeProperty('order');box.style.removeProperty('grid-column');box.classList.remove('life-widget-wide');}
  controls.forEach(c=>c.tools.remove());[toolbar,editor,status,empty].forEach(e=>e.remove());
 };
}

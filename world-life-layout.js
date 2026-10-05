/* Personal Life layout. Geometry only: financial and schedule data stay in their tools. */
const catalog = [
 ['calendar','스케줄 달력'],['weather','날씨'],['news','뉴스'],['ledger','가계부'],['calculator','계산기']
];
const ids = catalog.map(([id])=>id);
const defaults = () => ({version:1,mode:'list',order:[...ids],hidden:[],wide:['calendar','ledger'],side:{}});
function normalize(value) {
 const out=defaults();
 if(!value||value.version!==1)return out;
 if(value.mode==='widgets')out.mode='widgets';
 if(Array.isArray(value.order))out.order=[...new Set(value.order.filter(id=>ids.includes(id))),...ids].filter((id,i,a)=>a.indexOf(id)===i);
 for(const key of ['hidden','wide'])if(Array.isArray(value[key]))out[key]=[...new Set(value[key].filter(id=>ids.includes(id)))];
 if(value.side&&typeof value.side==='object')for(const id of ids)if(['left','right'].includes(value.side[id]))out.side[id]=value.side[id];
 return out;
}
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,label,fn)=>{const b=node('button',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();fn();});return b;};
export function mountLayout(host,{owner,authorized=()=>true}={}) {
 let alive=true,editing=false,drag=null,raf=0;
 const key='ojjuda-life-layout-v1:'+(owner||'guest');
 let config;try{config=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{config=defaults();}
 let saved=structuredClone(config);
 const boxes=new Map(ids.map(id=>[id,host.querySelector(`[data-life-tool="${id}"]`)]));
 const listOpen=new Map([...boxes].map(([id,box])=>[id,!!box?.open]));
 const active=()=>alive&&host.isConnected&&authorized();
 const cleanup=[];
 if(!document.querySelector('link[data-life-layout-style]')){
  const style=node('link');style.rel='stylesheet';style.href='/world-life-layout.css?v=20261005-widgets1';style.dataset.lifeLayoutStyle='';document.head.append(style);
 }
 host.classList.add('life-layout');
 const toolbar=node('div','','life-layout-toolbar');toolbar.dataset.worldSwipe='off';
 const modes=node('div','','life-layout-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','생활 보기 방식');
 const status=node('p','','life-layout-status');status.setAttribute('role','status');
 const report=text=>{status.textContent=text;};
 function persist(){try{localStorage.setItem(key,JSON.stringify(config));saved=structuredClone(config);return true;}catch{report('배치를 저장하지 못했어요. 기기의 저장 공간이나 브라우저 설정을 확인해 주세요.');return false;}}
 function setMode(mode){if(!active()||drag)return;config.mode=mode;if(!editing&&!persist()){config=structuredClone(saved);render();return;}render();}
 const list=button('목록',null,()=>setMode('list')),widgets=button('위젯',null,()=>setMode('widgets'));modes.append(list,widgets);
 const edit=button('배치 편집',null,()=>{if(!active())return;saved=structuredClone(config);editing=true;render();report('손잡이를 끌거나 위아래 버튼으로 옮기세요. 끝나면 배치 저장을 눌러 주세요.');});
 toolbar.append(modes,edit);
 const editor=node('div','','life-layout-editor');editor.dataset.worldSwipe='off';editor.hidden=true;
 const tip=node('p','원하는 순서로 옮기고, 필요한 도구만 꺼내 놓으세요.','life-layout-tip');
 const picker=node('div','','life-layout-picker');picker.setAttribute('role','group');picker.setAttribute('aria-label','위젯 추가');
 const addButtons=new Map();
 for(const [id,title] of catalog){const add=button('+ '+title,title+' 위젯 추가',()=>{if(!active()||!editing)return;config.hidden=config.hidden.filter(x=>x!==id);render();report(title+' 위젯을 추가했어요.');});picker.append(add);addButtons.set(id,add);}
 const actions=node('div','','life-layout-actions');
 const save=button('배치 저장',null,()=>{if(!active()||!persist())return;editing=false;render();report('배치를 저장했어요. 이 계정으로 같은 기기에서 다시 볼 수 있어요.');edit.focus();});
 const cancel=button('취소',null,()=>{if(!active())return;finishDrag(false);config=structuredClone(saved);editing=false;render();report('원래 배치로 돌아왔어요.');edit.focus();});
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
  const size=button('넓게',title+' 크기 변경',()=>{if(!active()||!editing)return;config.wide=config.wide.includes(id)?config.wide.filter(x=>x!==id):[...config.wide,id];render();});
  const hide=button('숨기기',title+' 숨기기',()=>{if(!active()||!editing)return;config.hidden=[...new Set([...config.hidden,id])];render();report(title+'을 숨겼어요. 위젯 추가에서 다시 꺼낼 수 있어요.');addButtons.get(id).focus();});
  const side=node('select');side.setAttribute('aria-label',title+' 가로 위치');
  for(const [value,label] of [['auto','자동 위치'],['left','왼쪽 배치'],['right','오른쪽 배치']]){const option=node('option',label);option.value=value;side.append(option);}
  side.addEventListener('change',()=>{if(!active()||!editing)return;if(side.value==='auto')delete config.side[id];else config.side[id]=side.value;render();});
  tools.append(handle,up,down,size,side,hide);summary.append(tools);controls.set(id,{tools,up,down,size,side,handle});
  const click=event=>{if(event.target.closest('button,select,input,option'))return;if(config.mode==='widgets'||editing)event.preventDefault();};summary.addEventListener('click',click);cleanup.push(()=>summary.removeEventListener('click',click));
  const toggled=()=>{if(config.mode==='list'&&!config.hidden.includes(id))listOpen.set(id,box.open);};box.addEventListener('toggle',toggled);cleanup.push(()=>box.removeEventListener('toggle',toggled));
  const start=event=>{
   if(!active()||!editing||event.button!==0)return;
   event.preventDefault();event.stopPropagation();
   drag={id,handle,pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,target:null,after:false};
   handle.setPointerCapture(event.pointerId);box.classList.add('life-layout-dragging');raf=requestAnimationFrame(scrollDrag);
  };
  handle.addEventListener('pointerdown',start);cleanup.push(()=>handle.removeEventListener('pointerdown',start));
 }
 function clearTargets(){for(const box of boxes.values())if(box){delete box.dataset.layoutDrop;box.classList.remove('life-layout-dragging');}}
 function targetDrag(){
  if(!drag)return;
  for(const box of boxes.values())if(box)delete box.dataset.layoutDrop;
  if(!drag.moved)return;
  const box=document.elementsFromPoint(drag.x,drag.y).map(e=>e.closest?.('[data-life-tool]')).find(e=>e&&host.contains(e)&&!e.hidden&&e.dataset.lifeTool!==drag.id);
  drag.target=box?.dataset.lifeTool||null;
  if(box){const r=box.getBoundingClientRect();drag.after=drag.y>r.top+r.height/2;box.dataset.layoutDrop=drag.after?'after':'before';}
 }
 function scrollDrag(){
  if(!drag||!active())return;
  if(drag.moved){const edge=70,dy=drag.y<edge?-10:drag.y>innerHeight-edge?10:0;if(dy)window.scrollBy(0,dy);targetDrag();}
  raf=requestAnimationFrame(scrollDrag);
 }
 function finishDrag(apply){
  if(!drag)return;const current=drag;drag=null;cancelAnimationFrame(raf);
  if(current.handle.hasPointerCapture(current.pointer))current.handle.releasePointerCapture(current.pointer);
  clearTargets();
  if(apply&&current.moved&&current.target&&active()){
   config.order=config.order.filter(x=>x!==current.id);const i=config.order.indexOf(current.target)+(current.after?1:0);config.order.splice(i,0,current.id);render();report('위치를 옮겼어요. 배치 저장을 누르면 유지돼요.');
  }
 }
 const pointerMove=event=>{if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();drag.x=event.clientX;drag.y=event.clientY;if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7)drag.moved=true;targetDrag();};
 const pointerUp=event=>{if(drag&&event.pointerId===drag.pointer)finishDrag(true);};
 const pointerCancel=event=>{if(drag&&event.pointerId===drag.pointer)finishDrag(false);};
 const escape=event=>{if(event.key==='Escape'&&drag){event.preventDefault();finishDrag(false);report('이동을 취소했어요.');}};
 document.addEventListener('pointermove',pointerMove,{passive:false});document.addEventListener('pointerup',pointerUp);document.addEventListener('pointercancel',pointerCancel);document.addEventListener('keydown',escape);
 function render(){
  host.dataset.lifeView=config.mode;host.classList.toggle('life-layout-editing',editing);
  list.setAttribute('aria-pressed',String(config.mode==='list'));widgets.setAttribute('aria-pressed',String(config.mode==='widgets'));editor.hidden=!editing;edit.hidden=editing;
  const visible=config.order.filter(id=>!config.hidden.includes(id));empty.hidden=!!visible.length;
  config.order.forEach((id,index)=>{
   const box=boxes.get(id),c=controls.get(id);if(!box||!c)return;
   const hidden=config.hidden.includes(id);box.hidden=hidden;box.style.order=String(index);box.classList.toggle('life-widget-wide',config.wide.includes(id));
   box.open=!hidden&&(config.mode==='widgets'||!!listOpen.get(id));
   c.tools.hidden=!editing;c.up.disabled=visible[0]===id;c.down.disabled=visible.at(-1)===id;
   c.size.textContent=config.wide.includes(id)?'반쪽 크기':'전체 크기';c.size.hidden=config.mode!=='widgets';c.size.setAttribute('aria-pressed',String(config.wide.includes(id)));
   c.side.hidden=config.mode!=='widgets'||config.wide.includes(id);c.side.value=config.side[id]||'auto';
   const column=config.mode==='widgets'&&!config.wide.includes(id)?config.side[id]:null;
   if(column)box.style.gridColumn=column==='left'?'1':'2';else box.style.removeProperty('grid-column');
   const add=addButtons.get(id);add.disabled=!hidden;add.textContent=(hidden?'+ ':'✓ ')+catalog.find(x=>x[0]===id)[1];
  });
 }
 render();
 return()=>{
  alive=false;finishDrag(false);cleanup.forEach(fn=>fn());
  document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerUp);document.removeEventListener('pointercancel',pointerCancel);document.removeEventListener('keydown',escape);
  host.classList.remove('life-layout','life-layout-editing');delete host.dataset.lifeView;
  for(const box of boxes.values())if(box){box.hidden=false;box.style.removeProperty('order');box.style.removeProperty('grid-column');box.classList.remove('life-widget-wide');}
  controls.forEach(c=>c.tools.remove());[toolbar,editor,status,empty].forEach(e=>e.remove());
 };
}

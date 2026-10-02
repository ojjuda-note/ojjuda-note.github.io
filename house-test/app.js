import {loadMadeItems,registerMadeItem} from './custom-furniture.js?v=20261003-house-fix1';
import {icon} from './icons.js?v=20261003-house-fix1';
import {normalize,roomKey,canAdd,normalizePlacement,normalizeAccessories,canPlaceFurniture,canDrawFurniture,furniturePlacements,findPlacement,floorPoint,roomPoint,floorCell,roomPeriod,ROOM,FLOOR,defaultShelf} from './model.js?v=20261003-house-fix1';
import {renderFurniture,furnitureGeometry} from './furniture.js?v=20261003-house-fix1';
import {FURNITURE,itemSize,SOFA_ACCESSORIES} from './furniture-catalog.js?v=20261003-house-fix1';
const $=s=>document.querySelector(s),view=$('#viewport'),world=$('#world');
for(const [key,value]of Object.entries({'room-width':ROOM.width+'px','room-height':ROOM.height+'px','room-clip':ROOM.clip,'world-width':(ROOM.width+40)*5+'px','world-height':(ROOM.height+40)*7+'px'}))document.documentElement.style.setProperty('--'+key,value);
const stepX=ROOM.width+40,stepY=ROOM.height+40;
let state,port,key,initialized=false,selected='0:0',tab='room',expanding=false,scale=1,pan={x:0,y:0},timer,saveFailed=false;
let editing=false,editingId='bookshelf',draft=null,period=roomPeriod(),periodTimer;
let itemCategory='furniture',previewMode=false,connecting=false,disposed=false;
const clonePlacement=p=>({...p,...(p.accessories?{accessories:{...p.accessories}}:{})});
const bounds=r=>({x:(r.x+2)*stepX,y:(3-r.y)*stepY});
function toast(message){$('#notice').textContent=message;$('#notice').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#notice').classList.remove('show'),2400);}
function persist(){if(previewMode||!initialized||disposed)return false;try{localStorage.setItem(key,JSON.stringify(state));if(saveFailed){saveFailed=false;$('#save-warning').hidden=true;}return true;}catch{saveFailed=true;$('#save-warning').hidden=false;return false;}}
function save(){return persist();}
function saveChange(change){
 const before=state;state=structuredClone(state);change();
 if(save())return true;
 state=before;toast('저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.');return false;
}
function current(){return state.rooms.find(r=>roomKey(r)===selected)||state.rooms[0];}
function title(r){if(!r.x&&!r.y)return '거실';return `${r.y>0?'위 '+r.y+'층':r.y<0?'아래 '+(-r.y)+'층':'시작 층'} · ${r.x<0?'왼쪽 '+(-r.x):r.x>0?'오른쪽 '+r.x:'가운데'}`;}
function applyCamera(){const w=view.clientWidth,h=view.clientHeight;pan.x=Math.max(-stepX*5*scale+w*.1,Math.min(w*.9,pan.x));pan.y=Math.max(-stepY*7*scale+h*.1,Math.min(h*.9,pan.y));world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;}
const roomInset=()=>Math.min(20,Math.min(view.clientWidth,view.clientHeight)*.028);
function clampRoomPan(){
 const b=bounds(current()),w=view.clientWidth,h=view.clientHeight,inset=roomInset();
 if((ROOM.width-24)*scale>=w-inset*2-.01)pan.x=Math.max(w-inset-(b.x+ROOM.width-12)*scale,Math.min(inset-(b.x+12)*scale,pan.x));
 if((ROOM.bottom-ROOM.top)*scale>=h-inset*2-.01)pan.y=Math.max(h-inset-(b.y+ROOM.bottom)*scale,Math.min(inset-(b.y+ROOM.top)*scale,pan.y));
}
function focusRoom(all=false){
 const r=current(),b=bounds(r),w=view.clientWidth,h=view.clientHeight;
 if(all){
  const a=expanding?[{x:-2,y:-3},{x:2,y:3}]:state.rooms;
  const minX=Math.min(...a.map(x=>bounds(x).x)),maxX=Math.max(...a.map(x=>bounds(x).x))+ROOM.width,minY=Math.min(...a.map(x=>bounds(x).y)),maxY=Math.max(...a.map(x=>bounds(x).y))+ROOM.bottom;
  scale=Math.max(.045,Math.min(w/(maxX-minX+110),(h-80)/(maxY-minY+90),1));
  pan={x:(w-(maxX-minX)*scale)/2-minX*scale,y:(h-(maxY-minY)*scale)/2-minY*scale-10};
 }else{
  // Keep the room large, with only a narrow glimpse of its apartment wall.
  const inset=roomInset();
  scale=Math.max((w-inset*2)/(ROOM.width-24),(h-inset*2)/(ROOM.bottom-ROOM.top));
  const art=editing&&draft?furnitureGeometry(editingId,draft):r.shelf?furnitureGeometry('bookshelf',r.shelf):null;
  const cx=art?art.left+art.width/2:ROOM.width/2,cy=art?art.top+art.height/2:(ROOM.top+ROOM.bottom)/2;
  pan={x:w/2-(b.x+cx)*scale,y:h/2-(b.y+cy)*scale};clampRoomPan();
 }
 applyCamera();
}
function revealFurniture(){
 if(!editing||!draft)return;
 const b=bounds(current()),g=furnitureGeometry(editingId,draft),w=view.clientWidth,h=view.clientHeight;
 const left=pan.x+(b.x+g.left)*scale,top=pan.y+(b.y+g.top)*scale,right=left+g.width*scale,bottom=top+g.height*scale;
 if(g.width*scale>w-24)pan.x+=w/2-(left+right)/2;
 else if(left<12)pan.x+=12-left;else if(right>w-12)pan.x+=w-12-right;
 if(g.height*scale>h-24)pan.y+=h/2-(top+bottom)/2;
 else if(top<12)pan.y+=12-top;else if(bottom>h-12)pan.y+=h-12-bottom;
 clampRoomPan();applyCamera();
}
function zoom(factor,point={x:view.clientWidth/2,y:view.clientHeight/2}){const limit=Math.max(1.6,2*view.clientWidth/(ROOM.width-24),2*view.clientHeight/(ROOM.bottom-ROOM.top)),next=Math.min(limit,Math.max(.045,scale*factor)),ratio=next/scale;pan.x=point.x-(point.x-pan.x)*ratio;pan.y=point.y-(point.y-pan.y)*ratio;scale=next;applyCamera();}
function element(tag,classes,text){const n=document.createElement(tag);if(classes)n.className=classes;if(text)n.textContent=text;return n;}



function renderWorld(){view.classList.toggle('editing-right',editing&&draft?.direction==='right');world.replaceChildren();
 for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++){
  if(state.rooms.some(r=>r.x===x&&r.y===y))continue;
  const b=bounds({x,y}),facade=element('div','apartment-neighbor');facade.setAttribute('aria-hidden','true');facade.style.left=b.x+'px';facade.style.top=b.y+'px';world.append(facade);
 }
 for(const r of state.rooms){const b=bounds(r),active=roomKey(r)===selected,room=element('div','room'+(active?' selected':''));room.dataset.room=roomKey(r);room.style.left=b.x+'px';room.style.top=b.y+'px';
 const image=element('img','room-bg');image.src=`assets/room-${period}-v${ROOM.assetVersion}.webp`;image.alt='파스텔 아파트 빈방';image.draggable=false;room.append(image);
 if(r.curtains!==false){const curtain=element('img','curtains');curtain.src='assets/curtains.webp';curtain.alt='아이보리 커튼';curtain.draggable=false;room.append(curtain);}
 const placed=furniturePlacements(r).filter(p=>!(active&&editing&&p.id===editingId));
 if(active&&editing){placed.push({id:editingId,...draft});room.append(makeWallGrid(draft),makeGrid(draft));}
 for(const {id,...placement}of placed)room.append(makeFurniture(id,placement,active));
 world.append(room);}

 if(expanding)for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++){if(state.rooms.some(r=>r.x===x&&r.y===y))continue;const cell={x,y},b=bounds(cell),button=element('button','expansion');button.type='button';button.dataset.cell=roomKey(cell);button.disabled=!canAdd(state.rooms,cell);button.append(element('strong','',button.disabled?'·':'＋'),element('span','',title(cell)));button.setAttribute('aria-label',title(cell)+(button.disabled?' · 먼저 옆방을 연결해 주세요':' 확장'));button.style.left=b.x+'px';button.style.top=b.y+'px';button.onclick=()=>addRoom(cell);world.append(button);}
 $('#room-name').textContent=title(current());$('#room-count').textContent=state.rooms.length+' / 35개 방';}
function addRoom(cell){if(!canAdd(state.rooms,cell)){toast('열린 방 옆으로만 확장할 수 있어요.');return;}if(!saveChange(()=>state.rooms.push({...cell,decor:false,curtains:false,shelf:null,furniture:{}})))return;selected=roomKey(cell);renderWorld();renderPanel();toast('새 방이 연결됐어요.');}
function selectRoom(id){if(!state.rooms.some(r=>roomKey(r)===id))return;editing=false;draft=null;selected=id;renderWorld();renderPanel();if(!expanding)focusRoom();}
function actionButton(label,fn,symbol){const b=element('button');b.type='button';b.setAttribute('aria-label',label);if(symbol){const mark=element('span','symbol');mark.innerHTML=icon('room');b.append(mark);}b.append(document.createTextNode(label));b.onclick=fn;return b;}
function furnitureGap(s=draft){const {w}=itemSize(editingId,s.direction);return s.direction==='right'?FLOOR.width-w-s.x:s.x;}
function syncPlacementControls(){
 if(!draft)return;
 const {w,d}=itemSize(editingId,draft.direction),depth=$('#bookshelf-depth'),gap=$('#bookshelf-gap');
 if(depth){depth.max=String(FLOOR.depth-d);depth.value=String(draft.y);$('#bookshelf-depth-value').textContent=draft.y+'칸';depth.setAttribute('aria-valuetext',draft.y+'칸');}
 if(gap){const value=furnitureGap(),center=draft.direction==='center',label=FURNITURE[editingId].shortLabel;gap.max=String(FLOOR.width-w);gap.value=String(value);$('#bookshelf-gap-label').textContent=center?'좌우 위치':'벽과 간격';gap.setAttribute('aria-label',center?label+' 좌우 위치':'옆벽과 '+label+' 사이의 간격');$('#bookshelf-gap-value').textContent=value+'칸';gap.setAttribute('aria-valuetext',value+'칸');}
}
function makeFurnitureControls(){
 const controls=element('div','bookshelf-position-controls');
 const itemLabel=FURNITURE[editingId].shortLabel;
 for(const [name,text,description]of [['depth','앞뒤 위치','뒷벽에서 '+itemLabel+'까지의 거리'],['gap','벽과 간격','옆벽과 '+itemLabel+' 사이의 간격']]){
  const label=element('label','bookshelf-position-control'),title=element('span','bookshelf-control-title'),labelText=element('span','',text),value=element('output'),input=element('input');
  input.id='bookshelf-'+name;input.type='range';input.min='0';input.step=String(FLOOR.step);input.setAttribute('aria-label',description);label.htmlFor=input.id;
  labelText.id=input.id+'-label';value.id=input.id+'-value';value.setAttribute('for',input.id);title.append(labelText,value);label.append(title,input);controls.append(label);
  input.oninput=()=>{if(!editing||!draft)return;const number=Number(input.value);if(!Number.isFinite(number))return;
   const {w}=itemSize(editingId,draft.direction),position=name==='depth'?{y:number}:{x:draft.direction==='right'?FLOOR.width-w-number:number};
   const next=normalizePlacement(editingId,{...draft,...position});if(!canDrawFurniture(editingId,next)){toast('이 방향의 그림으로 놓을 수 있는 범위를 벗어났어요. 다른 방향을 골라 주세요.');syncPlacementControls();return;}draft=next;renderWorld();syncPlacementControls();revealFurniture();
  };
 }
 return controls;
}
function makeAccessoryControls(){
 const group=element('fieldset','sofa-accessories');group.append(element('legend','','소파 위 소품'));
 const values=normalizeAccessories(draft.accessories);
 for(const {id,label:text}of SOFA_ACCESSORIES){
  const label=element('label'),input=element('input'),name=element('span','',text);
  input.type='checkbox';input.dataset.accessory=id;input.checked=values[id];input.setAttribute('aria-label',text+' 보이기');
  input.onchange=()=>{if(!editing||editingId!=='sofa')return;draft={...draft,accessories:{...normalizeAccessories(draft.accessories),[id]:input.checked}};renderWorld();};
  label.append(input,name);group.append(label);
 }
 group.append(element('p','panel-note','체크를 해제하면 해당 물건만 치워요. 소파와 함께 이동·회전하며, 배치 완료에서 저장합니다.'));
 return group;
}
function itemCard(label,images,placed,fn){
 const button=actionButton(label,fn);button.className='item-card';
 button.replaceChildren();const preview=element('span','item-preview');
 for(const src of images){const img=element('img');img.src=src;img.alt='';img.draggable=false;preview.append(img);}
 const caption=element('span','item-caption');caption.append(element('strong','',label.replace(/ (놓기|배치|넣기|치우기)$/,'')),element('span','item-status'+(placed?' is-placed':''),placed?'배치됨 · 변경':'놓기'));
 button.append(preview,caption);return button;
}
function renderItemMenu(body){
 if(previewMode){body.append(element('p','panel-note','빈자리가 부족해요. 제작실에서 크기를 줄이거나 우리집에서 공간을 비워 주세요.'),actionButton('미리보기 닫기',()=>port.postMessage({type:'close'})));return;}
 const tabs=element('div','item-categories');tabs.setAttribute('aria-label','아이템 분류');
 for(const [id,label]of [['furniture','가구'],['accessories','소품'],['settings','방 설정']]){
  const b=actionButton(label,()=>{itemCategory=id;renderPanel();$('#panel').scrollTop=0;});b.dataset.category=id;b.setAttribute('aria-pressed',String(itemCategory===id));tabs.append(b);
 }
 body.append(tabs);
 if(itemCategory==='settings'){
  const row=element('div','actions room-settings');
  row.append(actionButton(current().curtains?'커튼 걷기':'커튼 달기',()=>{if(!saveChange(()=>{current().curtains=!current().curtains;}))return;renderWorld();renderPanel();}),actionButton('빈방 보기',()=>{if(!saveChange(()=>{current().shelf=null;current().furniture={};current().curtains=false;}))return;renderWorld();renderPanel();}));
  row.append(actionButton('가구 제작실',()=>port.postMessage({type:'studio'})));
  body.append(row,element('p','panel-note','치운 가구와 소품은 아이템 메뉴에서 다시 놓을 수 있어요.'));return;
 }
 const placements=furniturePlacements(current()),grid=element('div','item-grid');grid.setAttribute('aria-label',itemCategory==='furniture'?'가구 목록':'소품 목록');
 const pictures={bookshelf:['assets/bookshelf-center-v2.webp'],desk:['assets/desk-center-v7.webp'],sofa:['assets/sofa-center-body-v1.png','assets/sofa-center-left-arm-v1.png','assets/sofa-center-right-arm-v1.png'],'side-table':['assets/side-table-center-v2.webp'],'blanket-floor':['assets/blanket-floor-center.png']};
 const ids=itemCategory==='furniture'?['bookshelf',...Object.keys(FURNITURE).filter(id=>id!=='bookshelf'&&FURNITURE[id].layer!=='floor').sort((a,b)=>FURNITURE[a].introduced-FURNITURE[b].introduced)]:Object.keys(FURNITURE).filter(id=>FURNITURE[id].layer==='floor');
 for(const id of ids){const item=FURNITURE[id],placed=placements.some(p=>p.id===id),label=(item.shortLabel||item.label)+(placed?' 배치':' 놓기');grid.append(itemCard(label,pictures[id]||(item.preview?[item.preview]:[]),placed,()=>startPlacement(id)));}
 if(itemCategory==='accessories'){
  const sofa=placements.find(p=>p.id==='sofa');
  for(const {id,label}of SOFA_ACCESSORIES){
   const placed=!!sofa&&normalizeAccessories(sofa.accessories)[id];
   const b=itemCard(label+(placed?' 치우기':' 넣기'),['assets/'+id+'-center-v1.png'],placed,()=>{
    startPlacement('sofa');draft.accessories={...normalizeAccessories(draft.accessories),[id]:!placed};renderWorld();renderPanel();focusRoom();
   });b.querySelector('strong').textContent={'cream-floral-cushion':'꽃무늬 쿠션','sage-cushion':'세이지 쿠션','peach-cushion':'피치 쿠션','pink-check-cushion':'체크 쿠션','blanket-sofa':'소파 담요'}[id];b.disabled=!sofa;if(!sofa)b.querySelector('.item-status').textContent='소파에 놓는 소품';grid.append(b);
  }
  body.append(element('p','item-menu-help',sofa?'쿠션과 소파용 담요는 소파와 함께 움직여요.':'소파를 먼저 놓으면 쿠션과 소파용 담요를 사용할 수 있어요.'));
 }
 body.append(grid);
}
function renderPanel(){const body=$('#panel-body');body.replaceChildren();$('#panel-title').textContent=expanding?'집 확장':{room:editing?FURNITURE[editingId].shortLabel+' 배치':'아이템',diary:'오늘의 기록'}[tab];if(expanding){const row=element('div','row'),select=element('select');select.setAttribute('aria-label','확장 기준 방');for(const r of state.rooms){const option=element('option','',title(r));option.value=roomKey(r);option.selected=option.value===selected;select.append(option);}select.onchange=()=>selectRoom(select.value);row.append(select);body.append(row);const controls=element('div','actions expansion-actions');for(const [dx,dy,label]of [[-1,0,'← 왼쪽'],[1,0,'오른쪽 →'],[0,1,'↑ 위층'],[0,-1,'↓ 아래층']]){const r=current(),cell={x:r.x+dx,y:r.y+dy},existing=state.rooms.find(x=>x.x===cell.x&&x.y===cell.y),b=actionButton(label+ (existing?' 보기':' 확장'),()=>existing?selectRoom(roomKey(cell)):addRoom(cell));b.disabled=!existing&&!canAdd(state.rooms,cell);controls.append(b);}body.append(controls,element('p','panel-note','가운데에서 좌우 2칸 · 위아래 3층, 최대 35개 방'));return;}

 if(tab==='room'){
  if(editing){
   const item=FURNITURE[editingId],directions=element('div','directions');
   for(const [id,text]of [['left','왼쪽'],['center','정면'],['right','오른쪽']]){
    if(!item.directions.includes(id))continue;
    const button=actionButton(text,()=>{const size=itemSize(editingId,id);const next=normalizePlacement(editingId,{...draft,direction:id,x:id==='left'?0:id==='right'?FLOOR.width-size.w:(FLOOR.width-size.w)/2,y:id==='center'?0:draft.y});if(!canDrawFurniture(editingId,next)){toast('이 위치에서는 해당 방향의 그림을 놓을 수 없어요. 앞뒤 위치를 먼저 조절해 주세요.');return;}draft=next;renderWorld();renderPanel();focusRoom();});
    button.dataset.direction=id;button.setAttribute('aria-pressed',String(draft.direction===id));directions.append(button);
   }
   body.append(directions);
   body.append(makeFurnitureControls());if(editingId==='sofa')body.append(makeAccessoryControls());
   const row=element('div','directions'),done=actionButton(previewMode?'미리보기 닫기':'배치 완료',()=>finishPlacement(true));done.id='placement-done';done.disabled=!validDraft();
   row.append(actionButton('취소',()=>finishPlacement(false)));if(!previewMode)row.append(actionButton('치우기',removeFurniture));row.append(done);
   const warning=element('p','placement-warning','다른 가구의 배치 공간과 겹쳐요. 옆으로 옮겨 주세요.');warning.id='placement-warning';warning.hidden=validDraft();warning.setAttribute('role','status');
   body.append(row,warning,element('p','panel-note',item.clearance||'0.5칸씩 이동 · 책장 밑면은 배치 공간의 ⅔만 채워요.'));
   syncPlacementControls();
  }else{
   renderItemMenu(body);$('#panel').scrollTop=0;
  }
 }


 if(tab==='diary'){const label=element('label','','오늘은 어떤 하루였나요?'),field=element('textarea');field.id='diary';field.maxLength=4000;field.value=state.diary;label.htmlFor='diary';field.oninput=()=>{state.diary=field.value;save();};body.append(label,field,actionButton('기록 저장',()=>{state.diary=field.value;persist();toast(saveFailed?'저장할 수 없어요. 내용을 복사해 주세요.':'이 기기에 기록을 저장했어요.');}),element('p','panel-note','테스트 기록은 이 기기에 저장돼요.'));}}
function setTab(next){if(previewMode)return;if(!['room','diary'].includes(next))return;editing=false;draft=null;tab=next;if(expanding){expanding=false;$('#expand').setAttribute('aria-pressed','false');renderWorld();focusRoom();}document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));renderWorld();renderPanel();}
function toggleExpansion(next=!expanding){if(previewMode)return;editing=false;draft=null;expanding=next;$('#expand').setAttribute('aria-pressed',String(next));$('#hint').textContent=next?'연결된 방 옆의 ＋로 확장하세요':'방을 끌어 둘러보세요';renderWorld();renderPanel();focusRoom(next);}


const pointers=new Map();let gesture=null;
function point(e){const b=view.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
view.addEventListener('pointerdown',e=>{if(e.target.closest('button,select')||e.button>0)return;const p=point(e);pointers.set(e.pointerId,p);view.setPointerCapture(e.pointerId);if(pointers.size===1)gesture={start:p,last:p,moved:false,multi:false};else if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={multi:true,moved:true,distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}});
view.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=point(e);pointers.set(e.pointerId,p);if(pointers.size>=2){const [a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(a.x-b.x,a.y-b.y);if(gesture.distance>0){zoom(distance/gesture.distance,gesture.center);pan.x+=center.x-gesture.center.x;pan.y+=center.y-gesture.center.y;applyCamera();}gesture.distance=distance;gesture.center=center;gesture.multi=true;}else if(!gesture.multi){if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>7)gesture.moved=true;if(gesture.moved){pan.x+=p.x-gesture.last.x;pan.y+=p.y-gesture.last.y;applyCamera();}gesture.last=p;}});
function end(e,canceled=false){if(!pointers.has(e.pointerId))return;const p=point(e),tap=!canceled&&gesture&&!gesture.moved&&!gesture.multi;pointers.delete(e.pointerId);if(view.hasPointerCapture(e.pointerId))view.releasePointerCapture(e.pointerId);if(tap){const wx=(p.x-pan.x)/scale,wy=(p.y-pan.y)/scale,r=state.rooms.find(r=>{const b=bounds(r);const cell=floorCell(wx-b.x,wy-b.y);return cell.x>=0&&cell.x<=FLOOR.width&&cell.y>=0&&cell.y<=FLOOR.depth;});if(r){if(roomKey(r)!==selected)selectRoom(roomKey(r));else {}}}if(!pointers.size)gesture=null;}
view.addEventListener('pointerup',e=>end(e));view.addEventListener('pointercancel',e=>end(e,true));view.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001),point(e));},{passive:false});view.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.2);}else if(e.key==='-'){e.preventDefault();zoom(1/1.2);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();pan.x+=e.key==='ArrowLeft'?65:e.key==='ArrowRight'?-65:0;pan.y+=e.key==='ArrowUp'?65:e.key==='ArrowDown'?-65:0;applyCamera();}});
$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);$('#overview').onclick=()=>focusRoom(true);$('#home-view').onclick=()=>focusRoom();$('#expand').onclick=()=>toggleExpansion();$('#exit').onclick=()=>{if(initialized)persist();port?.postMessage({type:'close'});};document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#exit').click();});document.querySelectorAll('[data-tab]').forEach(b=>{b.querySelector('span').innerHTML=icon(b.dataset.tab);b.onclick=()=>setTab(b.dataset.tab);});
new ResizeObserver(()=>{if(initialized)focusRoom(expanding);}).observe(view);
window.addEventListener('message',async e=>{
 if(connecting||initialized||window.parent===window||e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='ojjuda-house-test-init'||!e.ports[0]||typeof e.data.owner!=='string'||!e.data.owner||e.data.owner.length>180)return;
 connecting=true;port=e.ports[0];key='ojjuda-house-playtest-v1:'+encodeURIComponent(e.data.owner);previewMode=!!e.data.preview;
 port.onmessage=event=>{if(event.data?.type==='dispose'){persist();disposed=true;clearInterval(periodTimer);initialized=false;$('#app').hidden=true;$('#locked').hidden=false;port.close();}};
 try{
  await loadMadeItems(e.data.owner);if(disposed)return;
  if(previewMode)await registerMadeItem(e.data.preview);if(disposed)return;
  let stored;try{stored=JSON.parse(localStorage.getItem(key));}catch{}
  // Never normalize a saved room until its owner-specific catalog is ready.
  const missing=stored?.rooms?.some(r=>Object.keys(r.furniture||{}).some(id=>id.startsWith('made-')&&!FURNITURE[id]));
  if(missing)throw new Error('저장한 제작 아이템을 찾지 못했어요. 이 기기의 제작실에서 작업을 다시 적용해 주세요. 기존 배치는 보존됩니다.');
  state=normalize(stored);initialized=true;$('#locked').hidden=true;$('#app').hidden=false;
  if(previewMode){$('#expand').hidden=true;$('nav').hidden=true;$('header h1 small').textContent='미리보기';$('#hint').textContent='미리보기 · 기존 배치는 바뀌지 않아요';}
  renderWorld();renderPanel();focusRoom();updatePeriod();periodTimer=setInterval(updatePeriod,15000);
  const item=previewMode?e.data.preview.id:e.data.studioItem;
  if(item&&FURNITURE[item]){startPlacement(item);if(!editing&&previewMode){const next=state.rooms.find(r=>findPlacement(item,furniturePlacements(r)));if(next){selected=roomKey(next);startPlacement(item);}else toast('이 방에 빈자리가 없어요. 제작실에서 크기를 줄이거나 우리집에서 공간을 비워 주세요.');}}
  port.postMessage({type:'ready'});
 }catch(error){$('#locked p').textContent=error.message||'제작 아이템을 읽지 못했어요. 닫은 뒤 다시 열어 주세요.';port.postMessage({type:'failed'});}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(initialized)persist();}else if(initialized)updatePeriod();});window.addEventListener('pagehide',()=>{if(initialized)persist();});

function updatePeriod(){const next=roomPeriod();document.documentElement.dataset.period=next;$('#period-name').textContent={day:'낮',dusk:'새벽 · 저녁',night:'밤'}[next];if(next!==period){period=next;world.querySelectorAll('.room-bg').forEach(im=>im.src=`assets/room-${period}-v${ROOM.assetVersion}.webp`);}}
function otherFurniture(){return furniturePlacements(current()).filter(p=>p.id!==editingId);}
function validDraft(){return !!draft&&canPlaceFurniture(editingId,draft,otherFurniture());}
function startPlacement(id='bookshelf'){
 editingId=id;const existing=furniturePlacements(current()).find(p=>p.id===id),placed=existing?normalizePlacement(id,existing):findPlacement(id,otherFurniture(),id==='bookshelf'?defaultShelf():undefined);
 if(!placed){toast('가구를 놓을 자리가 부족해요. 먼저 다른 가구를 옮겨 주세요.');return;}
 editing=true;draft=clonePlacement(placed);renderWorld();renderPanel();focusRoom();
}
function finishPlacement(commit){
 if(previewMode){port.postMessage({type:'close'});return;}
 if(commit){if(!validDraft()){toast('다른 가구와 겹치지 않게 옮겨 주세요.');return;}if(!saveChange(()=>{if(editingId==='bookshelf')current().shelf=clonePlacement(draft);else current().furniture[editingId]=clonePlacement(draft);}))return;}
 const label=FURNITURE[editingId].shortLabel||FURNITURE[editingId].label;editing=false;draft=null;renderWorld();renderPanel();toast(commit?label+' 배치를 저장했어요.':'이전 배치로 돌아왔어요.');
}
function removeFurniture(){if(!saveChange(()=>{if(editingId==='bookshelf')current().shelf=null;else delete current().furniture[editingId];}))return;editing=false;draft=null;renderWorld();renderPanel();toast('가구를 치웠어요.');}
function updatePlacementStatus(button){
 const valid=validDraft();button.classList.toggle('placement-invalid',!valid);
 const done=$('#placement-done'),warning=$('#placement-warning');if(done)done.disabled=!valid;if(warning)warning.hidden=valid;
}
function makeFurniture(id,s,active){
 const button=element('button','furniture '+id),item=FURNITURE[id];button.type='button';button.setAttribute('aria-label',(item.shortLabel||item.label)+' 배치 변경');button.disabled=!active||expanding||tab!=='room'||(editing&&editingId!==id);
 renderFurniture(button,id,s);if(active&&editing&&editingId===id)updatePlacementStatus(button);
 button.onclick=()=>{if(!editing){setTab('room');startPlacement(id);}};
 if(active)button.addEventListener('pointerdown',e=>{
  if(!editing||editingId!==id||e.button>0)return;e.stopPropagation();const start=point(e),original=clonePlacement(draft),{w,d}=itemSize(id,draft.direction),anchor=floorPoint(draft.x+w/2,draft.y+d),startCell=floorCell(anchor.x,anchor.y);button.setPointerCapture(e.pointerId);
  const drag=ev=>{const p=point(ev),cell=floorCell(anchor.x+(p.x-start.x)/scale,anchor.y+(p.y-start.y)/scale);const next=normalizePlacement(id,{...original,x:original.x+cell.x-startCell.x,y:original.y+cell.y-startCell.y});if(!canDrawFurniture(id,next)){toast('이 방향의 그림으로 놓을 수 있는 범위를 벗어났어요. 다른 방향을 골라 주세요.');return;}draft=next;renderFurniture(button,id,draft);updatePlacementStatus(button);const grid=button.parentElement.querySelector('.floor-grid');if(grid)grid.replaceWith(makeGrid(draft));syncPlacementControls();};
  const up=ev=>{button.removeEventListener('pointermove',drag);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',cancel);if(button.hasPointerCapture(ev.pointerId))button.releasePointerCapture(ev.pointerId);};
  const cancel=ev=>{draft=original;renderFurniture(button,id,draft);up(ev);renderWorld();renderPanel();};button.addEventListener('pointermove',drag);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',cancel);
 });return button;
}
function makeGrid(s){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('floor-grid');svg.setAttribute('viewBox',`0 0 ${ROOM.width} ${ROOM.height}`);
 for(let axis=0;axis<2;axis++)for(let n=0;n<=(axis?FLOOR.depth:FLOOR.width);n+=FLOOR.step){
  const a=axis?floorPoint(0,n):floorPoint(n,0),b=axis?floorPoint(FLOOR.width,n):floorPoint(n,FLOOR.depth),line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${a.x},${a.y}L${b.x},${b.y}`);line.classList.add(Number.isInteger(n)?'whole':'half');svg.append(line);
 }
 if(s){const geometry=furnitureGeometry(editingId,s);for(const [name,points]of [['contact',geometry.footprint],['reserved',geometry.reserved]]){const polygon=document.createElementNS(svg.namespaceURI,'polygon');polygon.classList.add(name);polygon.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));svg.append(polygon);}
  for(const p of geometry.anchors||geometry.footprint){const anchor=document.createElementNS(svg.namespaceURI,'circle');anchor.classList.add('bookshelf-anchor');anchor.setAttribute('cx',p.x);anchor.setAttribute('cy',p.y);anchor.setAttribute('r','7');svg.append(anchor);}
 }
 return svg;
}

function makeWallGrid(s){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('wall-grid');svg.setAttribute('viewBox',`0 0 ${ROOM.width} ${ROOM.height}`);
 const line=(a,b,kind='',wall='')=>{const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',`M${a.x},${a.y}L${b.x},${b.y}`);if(kind)path.classList.add(kind);if(wall)path.dataset.wall=wall;svg.append(path);};
 for(let x=0;x<=FLOOR.width;x+=FLOOR.step)line(roomPoint(x,0),roomPoint(x,0,ROOM.wallHeight));
 for(let y=0;y<=FLOOR.depth;y+=FLOOR.step)for(const x of [0,FLOOR.width])line(roomPoint(x,y),roomPoint(x,y,ROOM.wallHeight));
 const level=(z,kind='')=>{
  line(roomPoint(0,0,z),roomPoint(FLOOR.width,0,z),kind,'center');
  line(roomPoint(0,0,z),roomPoint(0,FLOOR.depth,z),kind,'left');
  line(roomPoint(FLOOR.width,0,z),roomPoint(FLOOR.width,FLOOR.depth,z),kind,'right');
 };
 for(let z=0;z<=ROOM.wallHeight;z+=FLOOR.step)level(z);
 if(s)level(FURNITURE[editingId].height,'furniture-height');
 return svg;
}

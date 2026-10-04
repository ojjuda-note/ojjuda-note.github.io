import {createRecordRPC} from './record-rpc.js?v=20261004-album1';
import {createRecordPanel} from './record-panel.js?v=20261004-homelist2';
import {loadBuiltInItems,builtInItemReady,loadMadeItems,registerMadeItem} from './custom-furniture.js?v=20261004-chairfarrear1';
import {icon} from './icons.js?v=20261004-chairfarrear1';
import {normalize,roomKey,canAdd,normalizePlacement,canPlaceFurniture,canDrawFurniture,furniturePlacements,findPlacement,chairForDesk,isDeskChairPair,canPlaceGroup,findDeskChairPlacement,floorPoint,roomPoint,floorCell,roomPeriod,ROOM,FLOOR,defaultShelf} from './model.js?v=20261004-chairfarrear1';
import {renderFurniture,furnitureGeometry} from './furniture.js?v=20261004-chairfarrear1';
import {FURNITURE,itemSize,itemLayer,itemHeight,isBlanket} from './furniture-catalog.js?v=20261004-chairfarrear1';
import {resolveAccessoryDrag,sofaAccessoryFromSofa} from './sofa-accessory-placement.js?v=20261004-chairfarrear1';
const $=s=>document.querySelector(s),view=$('#viewport'),world=$('#world');
for(const [key,value]of Object.entries({'room-width':ROOM.width+'px','room-height':ROOM.height+'px','room-clip':ROOM.clip,'world-width':(ROOM.width+40)*5+'px','world-height':(ROOM.height+40)*7+'px'}))document.documentElement.style.setProperty('--'+key,value);
const stepX=ROOM.width+40,stepY=ROOM.height+40;
let state,port,key,initialized=false,selected='0:0',tab='diary',expanding=false,overview=false,scale=1,pan={x:0,y:0},timer,saveFailed=false;
let editing=false,editingId='bookshelf',draft=null,period=roomPeriod(),periodTimer;
let linkedDraft=false,deskDraft=null,standaloneChairDraft=null,editSession=0,activeDragCleanup=null;
let recordsPanel=null;
let itemCategory='furniture',previewMode=false,emptyRoomPreview=false,canUseStudio=false,connecting=false,disposed=false;
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
function stopFurnitureDrag(){if(activeDragCleanup){const cleanup=activeDragCleanup;activeDragCleanup=null;cleanup();}}
function clearPlacement(){stopFurnitureDrag();editSession++;editing=false;draft=null;linkedDraft=false;deskDraft=null;standaloneChairDraft=null;$('#placement-actions').hidden=true;emptyRoomPreview=false;view.classList.remove('empty-room-preview');}
function placementControlId(){return linkedDraft?'desk':editingId;}
function placementControlPose(){return linkedDraft&&editingId==='chair'?deskDraft:draft;}
function draftPlacements(){
 if(!draft)return [];
 if(!linkedDraft)return [{id:editingId,...draft}];
 const desk=placementControlPose(),chair=chairForDesk(desk);
 return [{id:'desk',...desk},{id:'chair',...chair}];
}
function isEditingFurniture(id){return editing&&(id===editingId||(linkedDraft&&(id==='desk'||id==='chair')));}
function setPlacementControlPose(next){
 if(linkedDraft){const chair=chairForDesk(next);deskDraft=clonePlacement(next);draft=clonePlacement(editingId==='desk'?next:chair);}
 else draft=clonePlacement(next);
}
function canDrawDraftPose(next){return linkedDraft?canDrawFurniture('desk',next)&&canDrawFurniture('chair',chairForDesk(next)):canDrawFurniture(editingId,next);}
function linkedOthers(){return furniturePlacements(current()).filter(p=>p.id!=='desk'&&p.id!=='chair');}
function startLinkedDraft(group){linkedDraft=true;setPlacementControlPose(group.desk);}
function title(r){if(!r.x&&!r.y)return '거실';return `${r.y>0?'위 '+r.y+'층':r.y<0?'아래 '+(-r.y)+'층':'시작 층'} · ${r.x<0?'왼쪽 '+(-r.x):r.x>0?'오른쪽 '+r.x:'가운데'}`;}
function applyCamera(){
 const area=cameraBounds(cameraRooms()),inset=roomInset();
 const clampAxis=(position,start,length,size)=>{const a=inset-start*scale,b=size-inset-(start+length)*scale;return Math.max(Math.min(a,b),Math.min(Math.max(a,b),position));};
 pan.x=clampAxis(pan.x,area.left,area.width,view.clientWidth);pan.y=clampAxis(pan.y,area.top,area.height,view.clientHeight);
 world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;$('#zoom-out').disabled=scale<=minimumZoom()+.000001;layoutPlacementActions();
}
function layoutPlacementActions(){
 const actions=$('#placement-actions');actions.hidden=!initialized||!editing||!draft||tab!=='room'||expanding||disposed;if(actions.hidden)return;
 const item=world.querySelector('.room.selected [data-furniture="'+CSS.escape(editingId)+'"]');if(!item){actions.hidden=true;return;}
 const recall=$('#placement-recall'),done=$('#placement-done'),recallLabel=editingId==='desk'&&linkedDraft?'책상과 의자 회수':'회수';
 recall.hidden=previewMode;recall.title=recallLabel;recall.setAttribute('aria-label',recallLabel);done.textContent=previewMode?'미리보기 닫기':'설치';done.disabled=!validDraft();
 // Use the rendered bounds: CSS rounds subpixels differently from the room model
 // after resize, especially when a selected item is centered in the viewport.
 const viewport=view.getBoundingClientRect(),rect=item.getBoundingClientRect();
 const left=rect.left-viewport.left,top=rect.top-viewport.top,right=rect.right-viewport.left,bottom=rect.bottom-viewport.top;
 const leftHalf=(rect.left+rect.right)/2<(viewport.left+viewport.right)/2,topHalf=(rect.top+rect.bottom)/2<(viewport.top+viewport.bottom)/2,gap=8;
 const x=leftHalf?right+gap:left-actions.offsetWidth-gap,y=topHalf?bottom+gap:top-actions.offsetHeight-gap;
 actions.dataset.quadrant=(topHalf?'top':'bottom')+'-'+(leftHalf?'left':'right');actions.dataset.placement=(topHalf?'below':'above')+'-'+(leftHalf?'right':'left');
 actions.style.left=Math.max(gap,Math.min(view.clientWidth-actions.offsetWidth-gap,x))+'px';actions.style.top=Math.max(gap,Math.min(view.clientHeight-actions.offsetHeight-gap,y))+'px';
}
const roomInset=()=>Math.min(20,Math.min(view.clientWidth,view.clientHeight)*.028);
function cameraRooms(){
 const rooms=overview||expanding?[...state.rooms]:[current()];
 if(expanding)for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++)if(canAdd(state.rooms,{x,y}))rooms.push({x,y});
 return rooms;
}
function cameraBounds(rooms){
 const positions=rooms.map(bounds),left=Math.min(...positions.map(b=>b.x))+12,top=Math.min(...positions.map(b=>b.y))+ROOM.top;
 return {left,top,width:Math.max(...positions.map(b=>b.x))+ROOM.width-12-left,height:Math.max(...positions.map(b=>b.y))+ROOM.bottom-top};
}
function fitScale(area){const inset=roomInset();return Math.min((view.clientWidth-inset*2)/area.width,(view.clientHeight-inset*2)/area.height);}
function minimumZoom(){
 // Decorative neighboring apartments must never make our rooms tiny.
 const single=fitScale({width:ROOM.width-24,height:ROOM.bottom-ROOM.top});
 return Math.min(single*.68,fitScale(cameraBounds(cameraRooms())));
}
function focusRoom(all=false){
 overview=all;
 const r=current(),b=bounds(r),w=view.clientWidth,h=view.clientHeight;
 if(all){
  const area=cameraBounds(cameraRooms());scale=fitScale(area);
  pan={x:(w-area.width*scale)/2-area.left*scale,y:(h-area.height*scale)/2-area.top*scale};
 }else{
  // Keep the entire room visible on short screens; placement keeps its closer view.
  const inset=roomInset();
  const art=editing&&draft?furnitureGeometry(editingId,draft):null;
  scale=fitScale({width:ROOM.width-24,height:ROOM.bottom-ROOM.top});
  if(art)scale=Math.max((w-inset*2)/(ROOM.width-24),(h-inset*2)/(ROOM.bottom-ROOM.top));
  const cx=art?art.left+art.width/2:ROOM.width/2,cy=art?art.top+art.height/2:(ROOM.top+ROOM.bottom)/2;
  pan={x:w/2-(b.x+cx)*scale,y:h/2-(b.y+cy)*scale};
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
 applyCamera();
}
function zoom(factor,point={x:view.clientWidth/2,y:view.clientHeight/2}){const limit=Math.max(1.6,2*view.clientWidth/(ROOM.width-24),2*view.clientHeight/(ROOM.bottom-ROOM.top)),next=Math.min(limit,Math.max(minimumZoom(),scale*factor)),ratio=next/scale;pan.x=point.x-(point.x-pan.x)*ratio;pan.y=point.y-(point.y-pan.y)*ratio;scale=next;applyCamera();}
function element(tag,classes,text){const n=document.createElement(tag);if(classes)n.className=classes;if(text)n.textContent=text;return n;}



function renderWorld(){view.classList.toggle('editing-right',editing&&draft?.direction==='right');world.replaceChildren();
 for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++){
  if(state.rooms.some(r=>r.x===x&&r.y===y))continue;
  const b=bounds({x,y}),facade=element('div','apartment-neighbor');facade.setAttribute('aria-hidden','true');facade.style.left=b.x+'px';facade.style.top=b.y+'px';world.append(facade);
 }
 for(const r of state.rooms){const b=bounds(r),active=roomKey(r)===selected,room=element('div','room'+(active?' selected':''));room.dataset.room=roomKey(r);room.style.left=b.x+'px';room.style.top=b.y+'px';
 const image=element('img','room-bg');image.fetchPriority=active?'high':'auto';image.src=`assets/room-${period}-v${ROOM.assetVersion}.webp`;image.alt='파스텔 아파트 빈방';image.draggable=false;room.append(image);
 if(r.curtains!==false){const curtain=element('img','curtains');curtain.src='assets/curtains.webp';curtain.alt='아이보리 커튼';curtain.draggable=false;room.append(curtain);}
 const placed=furniturePlacements(r).filter(p=>!(active&&isEditingFurniture(p.id)));
 if(active&&editing){placed.push(...draftPlacements());room.append(makeWallGrid(draft),makeGrid(draft));}
 const desk=placed.find(p=>p.id==='desk'),sofa=placed.find(p=>p.id==='sofa');
 for(const {id,...placement}of placed)room.append(makeFurniture(id,placement,active,desk,sofa,placed));
 world.append(room);}

 if(expanding)for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++){if(state.rooms.some(r=>r.x===x&&r.y===y))continue;const cell={x,y},b=bounds(cell),button=element('button','expansion');button.type='button';button.dataset.cell=roomKey(cell);button.disabled=!canAdd(state.rooms,cell);button.append(element('strong','',button.disabled?'·':'＋'),element('span','',title(cell)));button.setAttribute('aria-label',title(cell)+(button.disabled?' · 먼저 옆방을 연결해 주세요':' 확장'));button.style.left=b.x+'px';button.style.top=b.y+'px';button.onclick=()=>addRoom(cell);world.append(button);}
 $('#room-name').textContent=title(current());$('#room-count').textContent=state.rooms.length+' / 35개 방';layoutPlacementActions();}
function addRoom(cell){if(!canAdd(state.rooms,cell)){toast('열린 방 옆으로만 확장할 수 있어요.');return;}if(!saveChange(()=>state.rooms.push({...cell,decor:false,curtains:false,shelf:null,furniture:{}})))return;selected=roomKey(cell);renderWorld();renderPanel();if(expanding)focusRoom(true);toast('새 방이 연결됐어요.');}
function selectRoom(id){if(!state.rooms.some(r=>roomKey(r)===id))return;clearPlacement();selected=id;renderWorld();renderPanel();if(!expanding)focusRoom();}
function actionButton(label,fn,symbol){const b=element('button');b.type='button';b.setAttribute('aria-label',label);if(symbol){const mark=element('span','symbol');mark.innerHTML=icon('room');b.append(mark);}b.append(document.createTextNode(label));b.onclick=fn;return b;}
function furnitureGap(s=placementControlPose()){const {w}=itemSize(placementControlId(),s.direction,s);return s.direction==='right'?FLOOR.width-w-s.x:s.x;}
function syncPlacementControls(){
 if(!draft)return;
 const pose=placementControlPose(),{w,d}=itemSize(placementControlId(),pose.direction,pose),depth=$('#bookshelf-depth'),gap=$('#bookshelf-gap');
 if(depth){depth.max=String(FLOOR.depth-d);depth.value=String(pose.y);$('#bookshelf-depth-value').textContent=pose.y+'칸';depth.setAttribute('aria-valuetext',pose.y+'칸');}
 if(gap){const value=furnitureGap(),center=pose.direction==='center',label=FURNITURE[placementControlId()].shortLabel;gap.max=String(FLOOR.width-w);gap.value=String(value);$('#bookshelf-gap-label').textContent=center?'좌우 위치':'벽과 간격';gap.setAttribute('aria-label',center?label+' 좌우 위치':'옆벽과 '+label+' 사이의 간격');$('#bookshelf-gap-value').textContent=value+'칸';gap.setAttribute('aria-valuetext',value+'칸');}
 document.querySelectorAll('#panel-body [data-direction]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.direction===pose.direction)));
 const height=$('#accessory-height');if(height){height.value=String(draft.elevation||0);const value=Number(draft.elevation||0).toFixed(2).replace(/0$/,'')+'칸';height.setAttribute('aria-valuetext',value);height.closest('label').querySelector('output').textContent=value;}
 view.classList.toggle('editing-right',editing&&draft.direction==='right');
}

function makeFurnitureControls(){
 const controls=element('div','bookshelf-position-controls');
 const itemLabel=FURNITURE[placementControlId()].shortLabel;
 for(const [name,text,description]of [['depth','앞뒤 위치','뒷벽에서 '+itemLabel+'까지의 거리'],['gap','벽과 간격','옆벽과 '+itemLabel+' 사이의 간격']]){
  const label=element('label','bookshelf-position-control'),title=element('span','bookshelf-control-title'),labelText=element('span','',text),value=element('output'),input=element('input');
  input.id='bookshelf-'+name;input.type='range';input.min='0';input.step=String(FLOOR.step);input.setAttribute('aria-label',description);label.htmlFor=input.id;
  labelText.id=input.id+'-label';value.id=input.id+'-value';value.setAttribute('for',input.id);title.append(labelText,value);label.append(title,input);controls.append(label);
  input.oninput=()=>{if(!editing||!draft)return;const number=Number(input.value);if(!Number.isFinite(number))return;
   const pose=placementControlPose(),id=placementControlId(),{w}=itemSize(id,pose.direction,pose),position=name==='depth'?{y:number}:{x:pose.direction==='right'?FLOOR.width-w-number:number};
   const candidate={...pose,...position},next=normalizePlacement(id,isBlanket(id)?resolveAccessoryDrag(id,candidate,current().furniture.sofa):candidate);if(!canDrawDraftPose(next)){toast('이 방향의 그림으로 놓을 수 있는 범위를 벗어났어요. 다른 방향을 골라 주세요.');syncPlacementControls();return;}stopFurnitureDrag();setPlacementControlPose(next);renderWorld();syncPlacementControls();revealFurniture();
  };
 }
 return controls;
}
function makeChairLinkControl(){
 const group=element('fieldset','sofa-accessories'),label=element('label'),input=element('input');
 input.type='checkbox';input.id='chair-desk-link';input.checked=linkedDraft;input.setAttribute('aria-label','책상과 연결');
 input.onchange=()=>{
  if(!editing||editingId!=='chair')return;
  stopFurnitureDrag();
  if(input.checked){
   const desk=current().furniture.desk,groupPlacement=desk&&findDeskChairPlacement(linkedOthers(),desk);
   if(!groupPlacement){input.checked=false;toast('책상과 의자를 함께 놓을 자리가 부족해요. 다른 가구를 먼저 옮겨 주세요.');return;}
   standaloneChairDraft=clonePlacement(draft);startLinkedDraft(groupPlacement);
   if(groupPlacement.desk.x!==desk.x||groupPlacement.desk.y!==desk.y)toast('의자 그림이 자연스럽게 보이는 가까운 자리로 함께 옮겼어요.');
  }else{
   const standalone=findPlacement('chair',furniturePlacements(current()).filter(p=>p.id!=='chair'),standaloneChairDraft||FURNITURE.chair.preferred);
   if(!standalone){input.checked=true;toast('의자를 따로 놓을 자리가 부족해요. 연결을 유지했어요.');return;}
   linkedDraft=false;deskDraft=null;draft=clonePlacement(standalone);
  }
  renderWorld();renderPanel();focusRoom();
 };
 label.append(input,element('span','','책상과 연결'));group.append(label,element('p','panel-note','연결하면 의자가 책상 아래로 0.5칸 들어가고 함께 이동·회전해요. 설치하면 저장됩니다.'));
 return group;
}
function makeAccessoryHeightControl(){
 const label=element('label','bookshelf-position-control'),title=element('span','bookshelf-control-title'),value=element('output'),input=element('input');
 input.id='accessory-height';input.type='range';input.min='0';input.max=String(ROOM.wallHeight-FURNITURE[editingId].height);input.step='.01';input.value=String(draft.elevation||0);input.setAttribute('aria-label','소품 높이');label.htmlFor=input.id;
 const update=()=>{value.textContent=Number(draft.elevation||0).toFixed(2).replace(/0$/,'')+'칸';input.setAttribute('aria-valuetext',value.textContent);};update();
 value.setAttribute('for',input.id);title.append(element('span','','높이 · 0은 바닥'),value);label.append(title,input);
 input.oninput=()=>{if(!editing||!draft)return;const next=normalizePlacement(editingId,{...draft,elevation:Number(input.value)});if(!canDrawDraftPose(next))return;stopFurnitureDrag();draft=next;update();renderWorld();revealFurniture();};
 return label;
}
function itemCard(label,images,placed,fn){
 const button=actionButton(label,fn);button.className='item-card';
 button.replaceChildren();const preview=element('span','item-preview');
 for(const src of images){const img=element('img');img.loading='lazy';img.decoding='async';img.fetchPriority='low';img.src=src;img.alt='';img.draggable=false;preview.append(img);}
 const caption=element('span','item-caption');caption.append(element('strong','',label.replace(/ (놓기|배치|넣기|치우기)$/,'')),element('span','item-status'+(placed?' is-placed':''),placed?'배치됨 · 변경':'놓기'));
 button.append(preview,caption);return button;
}
function renderItemMenu(body){
 if(previewMode){body.append(element('p','panel-note','빈자리가 부족해요. 제작실에서 크기를 줄이거나 우리집에서 공간을 비워 주세요.'),actionButton('미리보기 닫기',()=>port.postMessage({type:'close'})));return;}
 const tabs=element('div','item-categories');tabs.setAttribute('aria-label','아이템 분류');
 for(const [id,label]of [['furniture','가구'],['accessories','소품'],['settings','방 설정']]){
  const b=actionButton(label,()=>{editSession++;itemCategory=id;renderPanel();$('#panel-body').scrollTop=0;});b.dataset.category=id;b.setAttribute('aria-pressed',String(itemCategory===id));tabs.append(b);
 }
 body.append(tabs);
 if(itemCategory==='settings'){
  const row=element('div','actions room-settings');
  const curtain=actionButton(current().curtains?'커튼 걷기':'커튼 달기',()=>{if(!saveChange(()=>{current().curtains=!current().curtains;}))return;renderWorld();renderPanel();});curtain.disabled=emptyRoomPreview;row.append(curtain);
  if(canUseStudio)row.append(actionButton('가구 제작실',()=>{if(canUseStudio)port.postMessage({type:'studio'});}));
  body.append(row);return;
 }
 const placements=furniturePlacements(current()),grid=element('div','item-grid');grid.setAttribute('aria-label',itemCategory==='furniture'?'가구 목록':'소품 목록');
 const pictures={bookshelf:['assets/bookshelf-center-v2.webp'],desk:['assets/desk-center-v7.webp'],sofa:['assets/sofa-center-body-v1.png','assets/sofa-center-left-arm-v1.png','assets/sofa-center-right-arm-v1.png'],'side-table':['assets/side-table-center-v3.webp']};
 const blanketId=current().furniture['blanket-floor']?'blanket-floor':current().furniture['blanket-sofa']?'blanket-sofa':'blanket-floor';
 const ids=itemCategory==='furniture'?['bookshelf',...Object.keys(FURNITURE).filter(id=>id!=='bookshelf'&&!['floor','surface'].includes(FURNITURE[id].layer)).sort((a,b)=>FURNITURE[a].introduced-FURNITURE[b].introduced)]:Object.keys(FURNITURE).filter(id=>['floor','surface'].includes(FURNITURE[id].layer)&&(!isBlanket(id)||id===blanketId));
 for(const id of ids){const item=FURNITURE[id],placed=placements.some(p=>p.id===id),label=(item.shortLabel||item.label)+(placed?' 배치':' 놓기');grid.append(itemCard(label,pictures[id]||(item.preview?[item.preview]:[]),placed,event=>requestPlacement(id,event.currentTarget)));}
 if(itemCategory==='accessories')body.append(element('p','item-menu-help','쿠션과 담요를 소파로 끌면 알맞게 놓이고, 바닥으로 끌면 바닥에 놓여요.'));
 body.append(grid);
}
function syncHomeSummary(){
 const summary=tab==='diary'&&!previewMode&&!expanding;
 $('#app').classList.toggle('records-home',summary);
 $('#home-profile').hidden=!summary;
 $('#home-room-open').hidden=!summary;
 // The thumbnail reuses the live room renderer; it never changes the room save.
 world.inert=summary;
 view.tabIndex=summary?-1:0;
 view.setAttribute('aria-label',summary?'내 방 미리보기':'아파트 단면, 드래그로 이동하고 두 손가락으로 확대');
}
function renderPanel(){syncHomeSummary();recordsPanel?.unmount();const empty=$('#empty-room-toggle');empty.hidden=tab!=='room'||editing||expanding||previewMode;empty.textContent=emptyRoomPreview?'가구 복구':'빈방 보기';empty.setAttribute('aria-pressed',String(emptyRoomPreview));const body=$('#panel-body');body.replaceChildren();$('#panel').classList.toggle('placement-panel',tab==='room'&&editing&&!expanding);$('#panel-title').hidden=!editing&&!expanding&&!previewMode;document.querySelectorAll('#panel-tabs [data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));layoutPlacementActions();$('#panel-title').textContent=expanding?'집 확장':{room:editing?(linkedDraft?'책상과 함께 배치':FURNITURE[editingId].shortLabel+' 배치'):'아이템',diary:'오늘의 기록'}[tab];if(expanding){const row=element('div','row'),select=element('select');select.setAttribute('aria-label','확장 기준 방');for(const r of state.rooms){const option=element('option','',title(r));option.value=roomKey(r);option.selected=option.value===selected;select.append(option);}select.onchange=()=>selectRoom(select.value);row.append(select);body.append(row);const controls=element('div','actions expansion-actions');for(const [dx,dy,label]of [[-1,0,'← 왼쪽'],[1,0,'오른쪽 →'],[0,1,'↑ 위층'],[0,-1,'↓ 아래층']]){const r=current(),cell={x:r.x+dx,y:r.y+dy},existing=state.rooms.find(x=>x.x===cell.x&&x.y===cell.y),b=actionButton(label+ (existing?' 보기':' 확장'),()=>existing?selectRoom(roomKey(cell)):addRoom(cell));b.disabled=!existing&&!canAdd(state.rooms,cell);controls.append(b);}body.append(controls,element('p','panel-note','가운데에서 좌우 2칸 · 위아래 3층, 최대 35개 방'));return;}

 if(tab==='room'){
  if(editing){
   const item=FURNITURE[editingId],controlId=placementControlId(),controlItem=FURNITURE[controlId],directions=element('div','directions placement-directions');
   for(const [id,text]of [['left','왼쪽'],['center','정면'],['right','오른쪽']]){
    if(!controlItem.directions.includes(id))continue;
    const button=actionButton(text,()=>{
     const pose=placementControlPose(),size=itemSize(controlId,id,pose),preferred=linkedDraft?{left:{x:3.5,y:4},center:{x:3.5,y:0},right:{x:9,y:3.5}}[id]:controlItem.preferredViews?.[id];
     const candidate={...pose,direction:id,x:preferred?preferred.x:id==='left'?0:id==='right'?FLOOR.width-size.w:(FLOOR.width-size.w)/2,y:preferred?preferred.y:id==='center'?0:pose.y};
     const next=normalizePlacement(controlId,isBlanket(controlId)?resolveAccessoryDrag(controlId,candidate,current().furniture.sofa):candidate);
     if(linkedDraft){const group=findDeskChairPlacement(linkedOthers(),next);if(!group){toast('이 방향으로 책상과 의자를 함께 놓을 자리가 부족해요.');return;}stopFurnitureDrag();setPlacementControlPose(group.desk);if(group.desk.x!==next.x||group.desk.y!==next.y)toast('의자 그림이 자연스럽게 보이는 가까운 자리로 함께 옮겼어요.');}
     else{if(!canDrawDraftPose(next)){toast('이 위치에서는 해당 방향의 그림을 놓을 수 없어요. 앞뒤 위치를 먼저 조절해 주세요.');return;}stopFurnitureDrag();setPlacementControlPose(next);}
     renderWorld();renderPanel();focusRoom();
    });
    button.dataset.direction=id;button.setAttribute('aria-pressed',String(placementControlPose().direction===id));directions.append(button);
   }
   const toolbar=element('div','placement-toolbar');toolbar.append(directions,actionButton('취소',()=>finishPlacement(false)));body.append(toolbar);
   body.append(makeFurnitureControls());if(!isBlanket(editingId)&&itemLayer(editingId,draft)==='surface')body.append(makeAccessoryHeightControl());if(editingId==='chair'&&current().furniture.desk)body.append(makeChairLinkControl());
   const warning=element('p','placement-warning','다른 가구의 배치 공간과 겹쳐요. 옆으로 옮겨 주세요.');warning.id='placement-warning';warning.hidden=validDraft();warning.setAttribute('role','status');
   const feedback=element('div','placement-feedback');feedback.append(warning,element('p','panel-note',linkedDraft?'책상 위치를 기준으로 함께 움직여요. 의자만 회수하면 책상은 그대로 남아요.':item.clearance||'0.5칸씩 이동 · 책장 밑면은 배치 공간의 ⅔만 채워요.'));body.append(feedback);
   syncPlacementControls();
  }else{
   renderItemMenu(body);$('#panel-body').scrollTop=0;
  }
 }


 if(tab==='diary')recordsPanel?.mount(body);}
function setTab(next){if(previewMode)return;if(!['room','diary'].includes(next))return;clearPlacement();tab=next;if(expanding){expanding=false;$('#expand').setAttribute('aria-pressed','false');}renderWorld();renderPanel();focusRoom();}
function toggleExpansion(next=!expanding){if(previewMode)return;clearPlacement();expanding=next;$('#expand').setAttribute('aria-pressed',String(next));$('#hint').textContent=next?'연결된 방 옆의 ＋로 확장하세요':'방을 끌어 둘러보세요';renderWorld();renderPanel();focusRoom(next);}


const pointers=new Map();let gesture=null;
function point(e){const b=view.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
view.addEventListener('pointerdown',e=>{if(e.target.closest('button,select')||e.button>0)return;const p=point(e);pointers.set(e.pointerId,p);view.setPointerCapture(e.pointerId);if(pointers.size===1)gesture={start:p,last:p,moved:false,multi:false};else if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={multi:true,moved:true,distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}});
view.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=point(e);pointers.set(e.pointerId,p);if(pointers.size>=2){const [a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(a.x-b.x,a.y-b.y);if(gesture.distance>0){zoom(distance/gesture.distance,gesture.center);pan.x+=center.x-gesture.center.x;pan.y+=center.y-gesture.center.y;applyCamera();}gesture.distance=distance;gesture.center=center;gesture.multi=true;}else if(!gesture.multi){if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>7)gesture.moved=true;if(gesture.moved){pan.x+=p.x-gesture.last.x;pan.y+=p.y-gesture.last.y;applyCamera();}gesture.last=p;}});
function end(e,canceled=false){if(!pointers.has(e.pointerId))return;const p=point(e),tap=!canceled&&gesture&&!gesture.moved&&!gesture.multi;pointers.delete(e.pointerId);if(view.hasPointerCapture(e.pointerId))view.releasePointerCapture(e.pointerId);if(tap){const wx=(p.x-pan.x)/scale,wy=(p.y-pan.y)/scale,r=state.rooms.find(r=>{const b=bounds(r);const cell=floorCell(wx-b.x,wy-b.y);return cell.x>=0&&cell.x<=FLOOR.width&&cell.y>=0&&cell.y<=FLOOR.depth;});if(r){if(roomKey(r)!==selected)selectRoom(roomKey(r));else {}}}if(!pointers.size)gesture=null;}
view.addEventListener('pointerup',e=>end(e));view.addEventListener('pointercancel',e=>end(e,true));view.addEventListener('wheel',e=>{if(tab==='diary'&&!previewMode&&!expanding)return;e.preventDefault();zoom(Math.exp(-e.deltaY*.001),point(e));},{passive:false});view.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.2);}else if(e.key==='-'){e.preventDefault();zoom(1/1.2);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();pan.x+=e.key==='ArrowLeft'?65:e.key==='ArrowRight'?-65:0;pan.y+=e.key==='ArrowUp'?65:e.key==='ArrowDown'?-65:0;applyCamera();}});
$('#home-room-open').onclick=()=>{setTab('room');view.focus({preventScroll:true});};
$('#empty-room-toggle').onclick=()=>{emptyRoomPreview=!emptyRoomPreview;view.classList.toggle('empty-room-preview',emptyRoomPreview);renderPanel();};
$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);$('#overview').onclick=()=>focusRoom(true);$('#home-view').onclick=()=>focusRoom();$('#expand').onclick=()=>toggleExpansion();$('#exit').onclick=()=>{clearPlacement();if(initialized)persist();port?.postMessage({type:'close'});};document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#exit').click();});document.querySelectorAll('[data-tab]').forEach(b=>{b.querySelector('span').innerHTML=icon(b.dataset.tab);b.onclick=()=>setTab(b.dataset.tab);});
new ResizeObserver(()=>{if(initialized)focusRoom(expanding||overview);}).observe(view);
$('#placement-recall').onclick=()=>{if(editing&&!previewMode)removeFurniture();};$('#placement-done').onclick=()=>{if(editing)finishPlacement(true);};$('#placement-actions').addEventListener('pointerdown',event=>event.stopPropagation());new ResizeObserver(layoutPlacementActions).observe($('#placement-actions'));
window.addEventListener('message',async e=>{
 if(connecting||initialized||window.parent===window||e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='ojjuda-house-test-init'||!e.ports[0]||typeof e.data.owner!=='string'||!e.data.owner||e.data.owner.length>180)return;
 connecting=true;port=e.ports[0];key='ojjuda-house-playtest-v1:'+encodeURIComponent(e.data.owner);previewMode=!!e.data.preview;canUseStudio=e.data.canUseStudio===true;
 const recordRPC=e.data.hasRecords===true?createRecordRPC(port):null;
 port.onmessage=event=>{
  if(event.data?.type==='dispose'){$('#home-profile-nick').textContent='';$('#home-profile-bio').textContent='';clearPlacement();persist();disposed=true;recordsPanel?.dispose();recordRPC?.dispose();clearInterval(periodTimer);initialized=false;$('#app').hidden=true;$('#locked').hidden=false;port.close();}
  else if(event.data?.type==='studio-access'){canUseStudio=event.data.canUseStudio===true;if(initialized&&!previewMode)renderPanel();}
 };
 try{
  if((previewMode||e.data.studioItem!=null)&&!canUseStudio)throw new Error('가구 제작 권한을 확인해 주세요.');
  // Fetch the visible room while restoring only furniture used by saved rooms.
  const background=new Image();background.fetchPriority='high';background.src=`assets/room-${period}-v${ROOM.assetVersion}.webp`;
  const readSaved=()=>{try{return localStorage.getItem(key);}catch{return null;}};
  let stored;
  for(;;){
   const snapshot=readSaved();stored=null;try{stored=JSON.parse(snapshot);}catch{}
   const needed=(Array.isArray(stored?.rooms)?stored.rooms:[]).flatMap(r=>Object.entries(r?.furniture||{}).filter(([,pose])=>pose&&typeof pose==='object').map(([id])=>id));
   if(e.data.studioItem)needed.push(e.data.studioItem);
   await loadBuiltInItems(needed);if(disposed)return;
   await loadMadeItems(e.data.owner);if(disposed)return;
   if(previewMode)await registerMadeItem(e.data.preview);if(disposed)return;
   // Another open window may save while artwork loads. Restore its latest
   // snapshot, including newly placed runtime furniture, before enabling saves.
   if(readSaved()===snapshot)break;
  }
  // Never normalize a saved room until its owner-specific catalog is ready.
  const missing=stored?.rooms?.some(r=>Object.keys(r.furniture||{}).some(id=>id.startsWith('made-')&&!FURNITURE[id]));
  if(missing)throw new Error('저장한 제작 아이템을 찾지 못했어요. 이 기기의 제작실에서 작업을 다시 적용해 주세요. 기존 배치는 보존됩니다.');
  $('#home-profile-nick').textContent=String(e.data.profile?.nick||'우리집').slice(0,80);
  $('#home-profile-bio').textContent=String(e.data.profile?.bio||'').replace(/\s+/g,' ').trim().slice(0,200);
  state=normalize(stored);recordsPanel=createRecordPanel({owner:e.data.owner,request:recordRPC?.request,getText:()=>state.diary,changeText:value=>{state.diary=value;save();},saveText:value=>{state.diary=value;persist();toast(saveFailed?'저장할 수 없어요. 내용을 복사해 주세요.':'이 기기에 기록을 저장했어요.');},notify:toast});tab=previewMode||e.data.studioItem?'room':'diary';initialized=true;$('#locked').hidden=true;$('#app').hidden=false;
  if(previewMode){$('#expand').hidden=true;$('nav').hidden=true;$('header h1 small').hidden=false;$('#hint').textContent='미리보기 · 기존 배치는 바뀌지 않아요';}
  renderWorld();renderPanel();focusRoom();updatePeriod();periodTimer=setInterval(updatePeriod,15000);
  const item=previewMode?e.data.preview.id:e.data.studioItem;
  if(item&&FURNITURE[item]){startPlacement(item);if(!editing&&previewMode){const next=state.rooms.find(r=>findPlacement(item,furniturePlacements(r)));if(next){selected=roomKey(next);startPlacement(item);}else toast('이 방에 빈자리가 없어요. 제작실에서 크기를 줄이거나 우리집에서 공간을 비워 주세요.');}}
  port.postMessage({type:'ready'});
 }catch(error){$('#locked p').textContent=error.message||'제작 아이템을 읽지 못했어요. 닫은 뒤 다시 열어 주세요.';port.postMessage({type:'failed'});}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(initialized)persist();}else if(initialized)updatePeriod();});window.addEventListener('pagehide',()=>{if(initialized)persist();});

function updatePeriod(){const next=roomPeriod();document.documentElement.dataset.period=next;$('#period-name').textContent={day:'낮',dusk:'새벽 · 저녁',night:'밤'}[next];if(next!==period){period=next;world.querySelectorAll('.room-bg').forEach(im=>im.src=`assets/room-${period}-v${ROOM.assetVersion}.webp`);}}
function otherFurniture(){return furniturePlacements(current()).filter(p=>linkedDraft?p.id!=='desk'&&p.id!=='chair':p.id!==editingId);}
function validDraft(){return !!draft&&(linkedDraft?canPlaceGroup(draftPlacements(),otherFurniture()):canPlaceFurniture(editingId,draft,otherFurniture()));}
async function requestPlacement(id,button){
 const session=++editSession;
 if(!builtInItemReady(id)){
  toast(FURNITURE[id].shortLabel+'을 불러오고 있어요…');
  const status=button?.querySelector('.item-status'),label=status?.textContent;
  button?.setAttribute('aria-busy','true');if(button)button.disabled=true;if(status)status.textContent='불러오는 중…';
  try{await loadBuiltInItems([id]);}catch(error){if(!disposed&&session===editSession)toast(error.message);return;}
  finally{button?.removeAttribute('aria-busy');if(button)button.disabled=false;if(status)status.textContent=label;}
 }
 if(disposed||!initialized||session!==editSession||tab!=='room'||expanding)return;
 startPlacement(id);
}
function startPlacement(id='bookshelf'){
 clearPlacement();editingId=id;
 const placements=furniturePlacements(current()),existing=placements.find(p=>p.id===id),desk=placements.find(p=>p.id==='desk'),chair=placements.find(p=>p.id==='chair');
 const linkedExisting=!!desk&&!!chair&&isDeskChairPair(desk,chair),wantsLink=(id==='chair'&&desk&&(!existing||linkedExisting))||(id==='desk'&&linkedExisting);
 if(wantsLink){
  const group=findDeskChairPlacement(linkedOthers(),desk);
  if(group){startLinkedDraft(group);editing=true;renderWorld();renderPanel();focusRoom();if(group.desk.x!==desk.x||group.desk.y!==desk.y)toast('의자 그림이 자연스럽게 보이는 가까운 자리로 함께 옮겼어요.');return;}
  if(linkedExisting){toast('책상과 의자를 함께 놓을 자리가 부족해요.');return;}
 }
 const placed=existing?normalizePlacement(id,existing):findPlacement(id,otherFurniture(),id==='bookshelf'?defaultShelf():FURNITURE[id].layer==='surface'&&current().furniture.sofa?sofaAccessoryFromSofa(id,current().furniture.sofa):undefined);
 if(!placed){toast('가구를 놓을 자리가 부족해요. 먼저 다른 가구를 옮겨 주세요.');return;}
 editing=true;draft=clonePlacement(placed);renderWorld();renderPanel();focusRoom();
}
function finishPlacement(commit){
 if(previewMode){port.postMessage({type:'close'});return;}
 stopFurnitureDrag();
 if(commit){if(!validDraft()){toast('다른 가구와 겹치지 않게 옮겨 주세요.');return;}const placements=draftPlacements();if(!saveChange(()=>{for(const {id,...placement}of placements){if(id==='bookshelf')current().shelf=clonePlacement(placement);else current().furniture[id]=clonePlacement(placement);}}))return;}
 const label=linkedDraft?'책상과 의자':FURNITURE[editingId].shortLabel||FURNITURE[editingId].label;clearPlacement();renderWorld();renderPanel();toast(commit?label+' 배치를 저장했어요.':'이전 배치로 돌아왔어요.');
}
function removeFurniture(){
 stopFurnitureDrag();const removePair=editingId==='desk'&&linkedDraft;
 if(!saveChange(()=>{if(editingId==='bookshelf')current().shelf=null;else delete current().furniture[editingId];if(removePair)delete current().furniture.chair;}))return;
 clearPlacement();renderWorld();renderPanel();toast(removePair?'책상과 연결된 의자를 함께 치웠어요.':'가구를 치웠어요.');
}
function updatePlacementStatus(button){
 const valid=validDraft();button.classList.toggle('placement-invalid',!valid);
 const done=$('#placement-done'),warning=$('#placement-warning');if(done)done.disabled=!valid;if(warning)warning.hidden=valid;layoutPlacementActions();
}
function makeFurniture(id,s,active,desk=null,sofa=null,placements=[]){
 const button=element('button','furniture '+id),item=FURNITURE[id];button.type='button';button.setAttribute('aria-label',(item.shortLabel||item.label)+' 배치 변경');button.disabled=!active||expanding||tab!=='room'||(editing&&!isEditingFurniture(id));
 renderFurniture(button,id,s,desk,sofa,placements);if(active&&isEditingFurniture(id))updatePlacementStatus(button);
 button.onclick=()=>{if(!editing){setTab('room');startPlacement(id);}};
 if(active)button.addEventListener('pointerdown',e=>{
  if(!isEditingFurniture(id)||e.button>0)return;e.stopPropagation();stopFurnitureDrag();
  const session=editSession,controlId=placementControlId(),start=point(e),original=clonePlacement(placementControlPose()),{w,d}=itemSize(controlId,original.direction,original),anchor=floorPoint(original.x+w/2,original.y+d),startCell=floorCell(anchor.x,anchor.y),pointerId=e.pointerId;button.setPointerCapture(pointerId);
  const drag=ev=>{
   if(!editing||session!==editSession||ev.pointerId!==pointerId)return;
   const p=point(ev),cell=floorCell(anchor.x+(p.x-start.x)/scale,anchor.y+(p.y-start.y)/scale),candidate=normalizePlacement(controlId,{...original,x:original.x+cell.x-startCell.x,y:original.y+cell.y-startCell.y});
   const next=normalizePlacement(controlId,resolveAccessoryDrag(controlId,candidate,current().furniture.sofa));
   if(!canDrawDraftPose(next)){toast('이 방향의 그림으로 놓을 수 있는 범위를 벗어났어요. 다른 방향을 골라 주세요.');return;}
   setPlacementControlPose(next);
   const room=button.parentElement;if(!room)return;
   const visible=[...furniturePlacements(current()).filter(p=>!isEditingFurniture(p.id)),...draftPlacements()];
   for(const {id:placedId,...placement}of draftPlacements()){const node=room.querySelector('[data-furniture="'+placedId+'"]');if(node){renderFurniture(node,placedId,placement,linkedDraft?placementControlPose():current().furniture.desk,editingId==='sofa'?draft:current().furniture.sofa,visible);updatePlacementStatus(node);}}
   if(itemLayer(editingId,draft)==='standing'||isBlanket(editingId))for(const {id:propId,...prop}of furniturePlacements(current()).filter(p=>!isEditingFurniture(p.id)&&itemLayer(p.id,p)==='surface')){const node=room.querySelector('[data-furniture="'+propId+'"]');if(node)renderFurniture(node,propId,prop,current().furniture.desk,editingId==='sofa'?draft:current().furniture.sofa,visible);}
   const grid=room.querySelector('.floor-grid');if(grid)grid.replaceWith(makeGrid(draft));syncPlacementControls();
  };
  const cleanup=()=>{button.removeEventListener('pointermove',drag);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',cancel);if(button.hasPointerCapture(pointerId))button.releasePointerCapture(pointerId);if(activeDragCleanup===cleanup)activeDragCleanup=null;};
  const up=ev=>{if(ev.pointerId===pointerId)cleanup();};
  const cancel=ev=>{if(ev.pointerId!==pointerId)return;cleanup();if(!editing||session!==editSession)return;setPlacementControlPose(original);renderWorld();renderPanel();};
  activeDragCleanup=cleanup;button.addEventListener('pointermove',drag);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',cancel);
 });return button;
}
function makeGrid(s){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('floor-grid');svg.setAttribute('viewBox',`0 0 ${ROOM.width} ${ROOM.height}`);
 for(let axis=0;axis<2;axis++)for(let n=0;n<=(axis?FLOOR.depth:FLOOR.width);n+=FLOOR.step){
  const a=axis?floorPoint(0,n):floorPoint(n,0),b=axis?floorPoint(FLOOR.width,n):floorPoint(n,FLOOR.depth),line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${a.x},${a.y}L${b.x},${b.y}`);line.classList.add(Number.isInteger(n)?'whole':'half');svg.append(line);
 }
 if(s){for(const {id,...placement}of linkedDraft?draftPlacements():[{id:editingId,...s}]){const geometry=furnitureGeometry(id,placement);for(const [name,points]of [['contact',geometry.footprint],['reserved',geometry.reserved]]){const polygon=document.createElementNS(svg.namespaceURI,'polygon');polygon.classList.add(name);polygon.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));svg.append(polygon);}
  for(const p of geometry.anchors||geometry.footprint){const anchor=document.createElementNS(svg.namespaceURI,'circle');anchor.classList.add('bookshelf-anchor');anchor.setAttribute('cx',p.x);anchor.setAttribute('cy',p.y);anchor.setAttribute('r','7');svg.append(anchor);}
 }}
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
 if(s)level((s.elevation||0)+itemHeight(editingId,s),'furniture-height');
 return svg;
}

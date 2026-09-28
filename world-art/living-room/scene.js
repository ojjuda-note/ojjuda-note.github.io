/* Standalone room study: individual image layers, local drag state only. */
const SVG_NS='http://www.w3.org/2000/svg';
const CONFIG_URL=new URL('./scene.json',import.meta.url);
const copy=value=>JSON.parse(JSON.stringify(value));
const lerp=(a,b,t)=>a+(b-a)*t;
const bounded=(v,min,max)=>Math.min(max,Math.max(min,v));
const number=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
export function projectPoint(gx,gy,geometry){
  const {back,left,front,right}=geometry.floor;
  return [0,1].map(k=>(1-gx)*(1-gy)*back[k]+gx*(1-gy)*right[k]+(1-gx)*gy*left[k]+gx*gy*front[k]);
}
export function unprojectPoint(x,y,geometry){
  const {back,left,front,right}=geometry.floor;
  let gx=.5,gy=.5;
  for(let n=0;n<8;n++){
    const p=projectPoint(gx,gy,geometry),dx=x-p[0],dy=y-p[1];
    const ax=(1-gy)*(right[0]-back[0])+gy*(front[0]-left[0]);
    const ay=(1-gy)*(right[1]-back[1])+gy*(front[1]-left[1]);
    const bx=(1-gx)*(left[0]-back[0])+gx*(front[0]-right[0]);
    const by=(1-gx)*(left[1]-back[1])+gx*(front[1]-right[1]);
    const determinant=ax*by-ay*bx;
    if(Math.abs(determinant)<.001)throw new Error('Degenerate room floor');
    gx+=(dx*by-dy*bx)/determinant;gy+=(ax*dy-ay*dx)/determinant;
    if(Math.abs(dx)+Math.abs(dy)<.001)break;
  }
  return [gx,gy];
}
export function clampPlacement(gx,gy,item,geometry){
  const limit={minX:0,maxX:1,minY:0,maxY:1,...geometry.bounds,...item.bounds};
  return [bounded(gx,limit.minX,limit.maxX),bounded(gy,limit.minY,limit.maxY)];
}
export function wallTransform(item,geometry){
  const left=item.wall.side==='left';
  const from=left?geometry.floor.left:geometry.floor.back;
  const to=left?geometry.floor.back:geometry.floor.right;
  const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);
  const u=bounded(number(item.wall.u,.5),0,1);
  const x=lerp(from[0],to[0],u),y=lerp(from[1],to[1],u)-number(item.wall.elevation,geometry.wallHeight*.55);
  return [dx/length,dy/length,0,1,x,y];
}
export function imageBox(item,natural={}){
  const sourceWidth=number(item.source?.width,natural.width||1),sourceHeight=number(item.source?.height,natural.height||1);
  const width=number(item.width,200),height=number(item.height,width*sourceHeight/sourceWidth),anchor=item.footAnchor||[.5,.96];
  return {x:-width*anchor[0],y:-height*anchor[1],width,height};
}
function svgElement(tag,attributes={}){
  const element=document.createElementNS(SVG_NS,tag);
  for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}
function imageUrl(src){return new URL(src,CONFIG_URL).href;}
function loadImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image();let settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;error?reject(error):resolve({width:image.naturalWidth,height:image.naturalHeight});};
    const timer=setTimeout(()=>finish(new Error('Image timeout')),15000);
    image.onload=()=>finish();image.onerror=()=>finish(new Error('Image unavailable'));image.src=url;
  });
}
function shapePoints(points){return points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ');}
function patchPoint(points,x,y){return[0,1].map(k=>(1-x)*(1-y)*points[0][k]+x*(1-y)*points[1][k]+x*y*points[2][k]+(1-x)*y*points[3][k]);}
function lightingLayers(config,wallLayer,floorLayer){
  if(!config.lighting?.enabled)return;
  const windowItem=config.items.find(item=>item.id===config.lighting.windowItem);
  const glow=config.lighting.wallGlow||{};
  if(windowItem){
    const m=wallTransform(windowItem,config.geometry),side=windowItem.wall.side;
    const a=side==='left'?config.geometry.floor.left:config.geometry.floor.back;
    const b=side==='left'?config.geometry.floor.back:config.geometry.floor.right;
    const h=config.geometry.wallHeight;
    const clip=svgElement('clipPath',{id:'living-wall-light-clip'});
    clip.append(svgElement('polygon',{points:shapePoints([a,b,[b[0],b[1]-h],[a[0],a[1]-h]])}));wallLayer.append(clip);
    wallLayer.append(svgElement('ellipse',{cx:m[4],cy:m[5],rx:number(glow.width,410)/2,ry:number(glow.height,470)/2,fill:'url(#living-wall-glow)',opacity:number(glow.opacity,.13),'clip-path':'url(#living-wall-light-clip)','pointer-events':'none'}));
  }
  const patch=config.lighting.floorPatch;if(!patch?.points?.length)return;
  const points=patch.points.map(([gx,gy])=>projectPoint(gx,gy,config.geometry));
  floorLayer.append(svgElement('polygon',{points:shapePoints(points),fill:'url(#living-floor-light)',opacity:number(patch.opacity,.16),'pointer-events':'none'}));
  const gap=number(patch.crossbarWidth,.035)/2;
  for(const box of [[.5-gap,0,.5+gap,1],[0,.5-gap,1,.5+gap]]){
    const [x0,y0,x1,y1]=box;
    floorLayer.append(svgElement('polygon',{points:shapePoints([[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>patchPoint(points,x,y))),fill:'#977653',opacity:number(patch.crossbarOpacity,.045),filter:'url(#living-light-soften)','pointer-events':'none'}));
  }
}
function validateConfig(config){
  if(!Array.isArray(config.items)||!config.geometry?.floor||!config.shell?.src)throw new Error('Room configuration is missing');
  const ids=new Set();
  for(const item of config.items){if(!item.id||ids.has(item.id)||!item.src)throw new Error('Invalid item');ids.add(item.id);if(!['wall','floor','rug'].includes(item.layer))throw new Error('Unknown item layer');const box=imageBox(item);if(!Object.values(box).every(Number.isFinite)||box.width<=0||box.height<=0)throw new Error('Invalid image dimensions');}
  for(const key of ['back','left','front','right'])if(!config.geometry.floor[key]?.every(Number.isFinite))throw new Error('Invalid floor geometry');
  unprojectPoint(...projectPoint(.5,.5,config.geometry),config.geometry);
}
export async function startRoom(){
  const svg=document.getElementById('living-scene'),panel=document.getElementById('scene-panel'),status=document.getElementById('load-status');
  const editButton=document.getElementById('edit-room'),resetButton=document.getElementById('reset-room'),announcement=document.getElementById('move-status');
  let initial,config,editing=false,drag=null,selected=null,loadVersion=0;
  let nodes=new Map(),floorLayer=null;
  const statusMessage=(message,error=false,retry=false)=>{
    status.replaceChildren();status.textContent=message;status.hidden=!message;status.classList.toggle('error',error);
    if(retry){const button=document.createElement('button');button.type='button';button.textContent='다시 불러오기';button.addEventListener('click',load);status.append(button);}
  };
  function select(id){selected=id;for(const [key,record]of nodes)record.group.dataset.selected=String(key===id);}
  function position(item){const record=nodes.get(item.id);if(!record)return;const point=projectPoint(item.gx,item.gy,config.geometry);record.group.setAttribute('transform',`translate(${point[0]} ${point[1]})`);record.group.dataset.gx=item.gx.toFixed(5);record.group.dataset.gy=item.gy.toFixed(5);}
  function sortFurniture(){if(!floorLayer)return;for(const item of config.items.filter(item=>item.layer==='floor').sort((a,b)=>(a.gx+a.gy)-(b.gx+b.gy)))if(nodes.has(item.id))floorLayer.append(nodes.get(item.id).group);}
  function setEditing(value){editing=Boolean(value);panel.classList.toggle('is-editing',editing);editButton.setAttribute('aria-pressed',String(editing));for(const item of config.items){const record=nodes.get(item.id);if(!record||!item.movable||item.layer!=='floor')continue;record.group.setAttribute('tabindex',editing?'0':'-1');record.group.setAttribute('aria-label',item.name+(editing?', 방향키로 옮기기':''));}if(!editing)select(null);}
  function updatePlacement(item,x,y){[item.gx,item.gy]=clampPlacement(...unprojectPoint(x,y,config.geometry),item,config.geometry);position(item);}
  function pointerPosition(event){const matrix=svg.getScreenCTM();if(!matrix)return null;const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;return point.matrixTransform(matrix.inverse());}
  function endDrag(event){if(!drag||event.pointerId!==drag.pointerId)return;const current=drag;drag=null;nodes.get(current.id)?.group.classList.remove('dragging');if(svg.hasPointerCapture(current.pointerId))svg.releasePointerCapture(current.pointerId);sortFurniture();nodes.get(current.id)?.group.focus({preventScroll:true});announcement.textContent=`${current.item.name} 위치를 옮겼어요.`;}
  svg.addEventListener('pointerdown',event=>{
    if(!editing||drag||event.button!==0)return;
    const group=event.target.closest('[data-item-id]'),item=config?.items.find(item=>item.id===group?.dataset.itemId);
    if(!item?.movable||item.layer!=='floor')return;
    const p=pointerPosition(event);if(!p)return;
    const anchor=projectPoint(item.gx,item.gy,config.geometry);
    drag={pointerId:event.pointerId,id:item.id,item,offset:[p.x-anchor[0],p.y-anchor[1]]};
    select(item.id);group.classList.add('dragging');group.focus({preventScroll:true});svg.setPointerCapture(event.pointerId);event.preventDefault();
  });
  svg.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointerId)return;const p=pointerPosition(event);if(!p)return;updatePlacement(drag.item,p.x-drag.offset[0],p.y-drag.offset[1]);sortFurniture();event.preventDefault();});
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
  svg.addEventListener('lostpointercapture',event=>{if(drag&&event.pointerId===drag.pointerId){nodes.get(drag.id)?.group.classList.remove('dragging');drag=null;sortFurniture();}});
  svg.addEventListener('focusin',event=>{const group=event.target.closest('[data-item-id]');if(editing&&group)select(group.dataset.itemId);});
  svg.addEventListener('keydown',event=>{
    if(!editing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const group=event.target.closest('[data-item-id]'),item=config.items.find(item=>item.id===group?.dataset.itemId);
    if(!item?.movable||item.layer!=='floor')return;
    const point=projectPoint(item.gx,item.gy,config.geometry),step=event.shiftKey?32:12;
    if(event.key==='ArrowLeft')point[0]-=step;if(event.key==='ArrowRight')point[0]+=step;if(event.key==='ArrowUp')point[1]-=step;if(event.key==='ArrowDown')point[1]+=step;
    updatePlacement(item,...point);sortFurniture();group.focus({preventScroll:true});select(item.id);announcement.textContent=`${item.name} 위치를 옮겼어요.`;event.preventDefault();
  });
  editButton.addEventListener('click',()=>setEditing(!editing));
  resetButton.addEventListener('click',()=>{if(!initial||!config)return;const pointerId=drag?.pointerId;drag=null;if(pointerId!==undefined&&svg.hasPointerCapture(pointerId))svg.releasePointerCapture(pointerId);for(const item of config.items){const before=initial.items.find(original=>original.id===item.id);if(item.layer==='floor'){item.gx=before.gx;item.gy=before.gy;position(item);nodes.get(item.id)?.group.classList.remove('dragging');}}sortFurniture();select(null);announcement.textContent='처음 배치로 돌렸어요.';});
  function render(loaded){
    svg.replaceChildren();nodes=new Map();svg.setAttribute('viewBox',config.canvas.viewBox.join(' '));svg.style.aspectRatio=`${config.canvas.viewBox[2]}/${config.canvas.viewBox[3]}`;
    const defs=svgElement('defs');
    const shadow=svgElement('filter',{id:'living-contact-soften',x:'-50%',y:'-150%',width:'200%',height:'400%'});shadow.append(svgElement('feGaussianBlur',{stdDeviation:3}));
    const soften=svgElement('filter',{id:'living-light-soften',x:'-10%',y:'-10%',width:'120%',height:'120%'});soften.append(svgElement('feGaussianBlur',{stdDeviation:2}));
    const wallGlow=svgElement('radialGradient',{id:'living-wall-glow'});wallGlow.append(svgElement('stop',{offset:0,'stop-color':'#fff5d6'}),svgElement('stop',{offset:1,'stop-color':'#fff5d6','stop-opacity':0}));
    const floorGlow=svgElement('linearGradient',{id:'living-floor-light',x1:'80%',y1:'0%',x2:'15%',y2:'100%'});floorGlow.append(svgElement('stop',{offset:0,'stop-color':'#fff9e7'}),svgElement('stop',{offset:1,'stop-color':'#ffe8b6','stop-opacity':.3}));
    const contact=svgElement('radialGradient',{id:'living-contact-shadow'});contact.append(svgElement('stop',{offset:0,'stop-color':'#584335','stop-opacity':1}),svgElement('stop',{offset:.45,'stop-color':'#69503d','stop-opacity':.75}),svgElement('stop',{offset:1,'stop-color':'#775b48','stop-opacity':0}));
    defs.append(shadow,soften,wallGlow,floorGlow,contact);svg.append(defs);
    const shell=config.shell;
    if(shell.clip){const clip=svgElement('clipPath',{id:'living-shell-clip'});clip.append(svgElement('polygon',{points:shapePoints(shell.clip)}));defs.append(clip);}
    svg.append(svgElement('image',{href:imageUrl(shell.src),x:shell.x,y:shell.y,width:shell.width,height:shell.height,preserveAspectRatio:'xMidYMid meet','data-shell':'true','pointer-events':'none',...(shell.clip?{'clip-path':'url(#living-shell-clip)'}:{})}));
    const wallLighting=svgElement('g',{'data-layer':'wall-light'}),walls=svgElement('g',{'data-layer':'wall'}),rug=svgElement('g',{'data-layer':'rug'}),floorLighting=svgElement('g',{'data-layer':'floor-light'});floorLayer=svgElement('g',{'data-layer':'furniture'});
    svg.append(wallLighting,walls,rug,floorLighting,floorLayer);lightingLayers(config,wallLighting,floorLighting);
    for(const item of config.items){
      if(!loaded.has(item.src))continue;
      const group=svgElement('g',{'data-item-id':item.id,class:'item'+(item.movable&&item.layer==='floor'?' movable':''),role:item.movable&&item.layer==='floor'?'button':'img','aria-label':item.name});
      const title=svgElement('title');title.textContent=item.name;group.append(title);
      if(item.layer==='floor'&&item.shadow!==false){const sh=item.shadow||{};group.append(svgElement('ellipse',{cx:0,cy:-3,rx:number(sh.width,item.width*.42)/2,ry:number(sh.height,item.width*.08)/2,fill:'url(#living-contact-shadow)',opacity:number(sh.opacity,.32),filter:'url(#living-contact-soften)','pointer-events':'none'}));}
      const box=imageBox(item,loaded.get(item.src));group.append(svgElement('image',{href:imageUrl(item.src),...box,preserveAspectRatio:'xMidYMid meet','data-art-source':item.src}));
      if(item.movable&&item.layer==='floor')group.append(svgElement('ellipse',{class:'selection-ring',cx:0,cy:0,rx:Math.max(32,item.width*.24),ry:Math.max(12,item.width*.065)}));
      nodes.set(item.id,{group});
      if(item.layer==='wall'){group.setAttribute('transform',`matrix(${wallTransform(item,config.geometry).join(' ')})`);walls.append(group);}
      else{position(item);(item.layer==='rug'?rug:floorLayer).append(group);}
    }
    sortFurniture();setEditing(editing);
  }
  async function load(){
    const version=++loadVersion;editButton.disabled=true;resetButton.disabled=true;drag=null;statusMessage('거실을 불러오고 있어요.');
    try{
      const response=await fetch(CONFIG_URL,{cache:'no-cache'});if(!response.ok)throw new Error('Scene unavailable');const incoming=await response.json();validateConfig(incoming);
      const sources=[...new Set([incoming.shell.src,...incoming.items.map(item=>item.src)])];
      const results=await Promise.allSettled(sources.map(src=>loadImage(imageUrl(src))));if(version!==loadVersion)return;
      const loaded=new Map(),failed=[];results.forEach((result,index)=>{result.status==='fulfilled'?loaded.set(sources[index],result.value):failed.push(sources[index]);});
      if(!loaded.has(incoming.shell.src)){svg.replaceChildren();statusMessage('거실 그림을 불러오지 못했어요.',true,true);return;}
      initial=copy(incoming);config=copy(incoming);render(loaded);editButton.disabled=false;resetButton.disabled=false;
      statusMessage(failed.length?`그림 ${failed.length}개를 불러오지 못했어요.`:'',Boolean(failed.length),Boolean(failed.length));
    }catch(error){if(version===loadVersion){svg.replaceChildren();statusMessage('거실을 불러오지 못했어요.',true,true);}}
  }
  await load();
}
if(typeof document!=='undefined')startRoom();

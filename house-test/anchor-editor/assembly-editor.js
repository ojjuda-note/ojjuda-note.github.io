import {normalizeAssembly,assemblyCheck,assemblyGeometry,drawAssembly,prepareAssemblyImages,approvedSofaAssembly} from './picture-assembly.js?v=20261006-assembly1';
import {alphaBounds} from './cutout.js?v=20261006-assembly1';

const clone=structuredClone;
const labels={near:'가까운 옆판',body:'몸통',far:'먼 옆판'};
const pointLabels=['가까운 위','먼 위','먼 아래','가까운 아래'];
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function sourceOf(image,name){const c=canvas(image.naturalWidth||image.width,image.naturalHeight||image.height);c.getContext('2d').drawImage(image,0,0);return {data:c.toDataURL('image/png'),width:c.width,height:c.height,name};}

export function mountAssemblyEditor(api){
 const dialog=document.createElement('dialog');dialog.id='assembly-dialog';dialog.setAttribute('aria-labelledby','assembly-title');
 dialog.innerHTML=`<header><div><h2 id="assembly-title">그림 겹쳐 만들기</h2><p>옆판과 다리는 붙여 두고, 몸통 밑면을 나무판 윗면에 맞춥니다.</p></div><button id="assembly-cancel" type="button">닫기</button></header>
 <div class="assembly-layout"><section class="assembly-pictures"><div class="assembly-tabs" role="group" aria-label="편집할 부위">${Object.entries(labels).map(([id,label])=>`<button type="button" data-assembly-part="${id}">${label}</button>`).join('')}</div>
 <canvas id="assembly-source" width="800" height="530" aria-label="부위 그림의 기준점 선택"></canvas>
 <p id="assembly-point-hint" role="status"></p><div class="button-row"><label class="button" for="assembly-file">부위 그림 넣기<input id="assembly-file" type="file" accept="image/png,image/webp,image/jpeg" class="file-input"></label><button id="assembly-use-cutout" type="button">편집 중인 그림 가져오기</button></div>
 <div class="button-row"><button id="assembly-copy-side" type="button">이 옆판을 반대쪽에도 사용</button><button id="assembly-crop" type="button">영역을 그려 자르기</button><button id="assembly-remove-black" type="button">검정 배경 지우기</button></div>
 <div id="assembly-side-points" class="button-row"><button type="button" data-assembly-point="support">나무판 윗면 찍기</button><button type="button" data-assembly-point="foot">발끝 높이 찍기</button></div>
 <div id="assembly-body-points" class="assembly-tabs">${pointLabels.map((label,i)=>`<button type="button" data-assembly-point="${i}">${i+1}. ${label}</button>`).join('')}</div>
 </section><section class="assembly-result"><h3>겹친 모습 <span id="assembly-direction"></span></h3><canvas id="assembly-preview" width="760" height="650" aria-label="겹친 가구 미리보기"></canvas><label class="assembly-guides"><input id="assembly-guides" type="checkbox" checked>다리 윗면 연결선 보기</label><p id="assembly-status" role="status"></p>
 <div class="assembly-dimensions"><label>가구 폭 (칸)<input id="assembly-width" type="number" min=".1" max="7" step=".1"></label><label>깊이 (칸)<input id="assembly-depth" type="number" min=".1" max="7" step=".1"></label><label>전체 높이 (칸)<input id="assembly-height" type="number" min=".1" max="4.5" step=".1"></label></div>
 <div class="assembly-adjustments"><label>가까운 팔·옆판 높이<input id="assembly-near-height" type="range" min=".2" max="1.8" step=".01"><output></output></label><label>먼 팔·옆판 높이<input id="assembly-far-height" type="range" min=".2" max="1.8" step=".01"><output></output></label><label>가까운 몸통 높이<input id="assembly-body-near" type="range" min=".2" max="1.8" step=".01"><output></output></label><label>먼 몸통 높이<input id="assembly-body-far" type="range" min=".2" max="1.8" step=".01"><output></output></label><label>가까운 옆판 길이<input id="assembly-near-length" type="range" min=".05" max="1" step=".01"><output></output></label><label>먼 옆판 길이<input id="assembly-far-length" type="range" min=".05" max="1" step=".01"><output></output></label></div>
 <details><summary>다리·몸통 위치 세부 조절</summary><div class="assembly-details"><label>가까운 나무판 높이<input id="assembly-near-support" type="number" min=".01" step=".01"></label><label>먼 나무판 높이<input id="assembly-far-support" type="number" min=".01" step=".01"></label><label>가까운 몸통 안쪽 위치<input id="assembly-near-inset" type="range" min="0" max="1" step=".01"></label><label>먼 몸통 안쪽 위치<input id="assembly-far-inset" type="range" min="0" max="1" step=".01"></label></div></details>
 <p class="help-text">몸통 높이와 옆판 길이를 바꿔도 밑면은 계속 붙어 있습니다. 각 방향에는 그 방향의 원본 그림을 넣으세요.</p></section></div>
 <footer><button id="assembly-example" type="button">이번 소파 불러오기</button><button id="assembly-reset" type="button">변경 되돌리기</button><button id="assembly-apply" type="button" class="primary">현재 방향에 사용</button></footer>`;
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
 let draft=null,initial=null,images=new Map(),selected='near',point='support',cropStart=null,cropEnd=null,busy=false,raf=0;
 const part=()=>selected==='body'?draft.body:draft.sides[selected];
 const pose=()=>{const p={...api.get().placement,...draft.dimensions,direction:draft.direction};if(p.direction!==api.get().placement.direction){p.x=0;p.y=3;}p.x=Math.max(0,Math.min(10-(p.direction==='center'?p.width:p.depth),p.x));p.y=Math.max(0,Math.min(7-(p.direction==='center'?p.depth:p.width),p.y));return p;};
 const tell=text=>{$('assembly-status').textContent=text;};
 const run=async fn=>{if(busy)return;busy=true;let error;dialog.setAttribute('aria-busy','true');try{await fn();}catch(e){error=e.message;}finally{busy=false;dialog.removeAttribute('aria-busy');render();if(error)tell(error);}};
 const newPanel=()=>({source:null,supportY:0,footY:0,feetX:[0,1],height:.55*draft.dimensions.height,supportHeight:.1*draft.dimensions.height,length:draft.direction==='center'?.14:1,supportX:.98});
 const fresh=()=>{const {placement}=api.get();draft={version:1,direction:placement.direction,dimensions:{width:placement.width,depth:placement.depth,height:placement.height},sides:{},body:{source:null,anchors:[],nearHeight:.81*placement.height,farHeight:.75*placement.height,nearInset:placement.direction==='center'?.08:.1,farInset:placement.direction==='center'?.92:.28}};draft.sides={near:newPanel(),far:newPanel()};};
 const decode=async source=>{const im=await api.loadImage(source.data);if((im.naturalWidth||im.width)!==source.width||(im.naturalHeight||im.height)!==source.height)throw new Error('그림 크기가 맞지 않아요.');return im;};
 async function putSource(source){
  const image=await decode(source),p=part();p.source=source;images.set(selected,image);
  if(selected==='body'){p.anchors=[];point=0;}else{p.supportY=Math.round(source.height*.81);p.footY=source.height-1;p.feetX=[source.width*.07,source.width*.93];point='support';}
  cropStart=cropEnd=null;sync();
 }
 async function loadImages(){images=new Map();for(const id of ['near','body','far']){const source=id==='body'?draft.body.source:draft.sides[id].source;if(source)images.set(id,await decode(source));}}
 const fields=[['near-height',()=>draft.sides.near,'height'],['far-height',()=>draft.sides.far,'height'],['body-near',()=>draft.body,'nearHeight'],['body-far',()=>draft.body,'farHeight'],['near-length',()=>draft.sides.near,'length'],['far-length',()=>draft.sides.far,'length'],['near-support',()=>draft.sides.near,'supportHeight'],['far-support',()=>draft.sides.far,'supportHeight'],['near-inset',()=>draft.body,'nearInset'],['far-inset',()=>draft.body,'farInset']];
 const schedule=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});};
 for(const [id,get,key]of fields){const input=$('assembly-'+id);input.oninput=()=>{if(busy)return;get()[key]=Number(input.value);const output=input.nextElementSibling;if(output?.tagName==='OUTPUT')output.value=key==='length'?Math.round(Number(input.value)*100)+'%':Number(input.value).toFixed(2);schedule();};}
 for(const key of ['width','depth','height'])$('assembly-'+key).onchange=e=>{if(busy)return;const n=Number(e.target.value);if(!Number.isFinite(n)||n<.1||n>(key==='height'?4.5:7)){e.target.value=draft.dimensions[key];tell('크기는 표시된 범위 안에서 입력해 주세요.');return;}if(key==='height'){const scale=n/draft.dimensions.height;for(const side of Object.values(draft.sides)){side.height*=scale;side.supportHeight*=scale;}draft.body.nearHeight*=scale;draft.body.farHeight*=scale;}draft.dimensions[key]=n;sync();};
 function sync(){
  for(const key of ['width','depth','height'])$('assembly-'+key).value=draft.dimensions[key];
  for(const [id,get,key]of fields){const input=$('assembly-'+id),isHeight=['height','nearHeight','farHeight'].includes(key);if(isHeight){input.max=draft.dimensions.height;input.min=Math.ceil(((get().supportHeight??Math.max(draft.sides.near.supportHeight,draft.sides.far.supportHeight))+.02)*100)/100;}input.value=get()[key];const output=input.nextElementSibling;if(output?.tagName==='OUTPUT')output.value=key==='length'?Math.round(get()[key]*100)+'%':get()[key].toFixed(2);}
  dialog.querySelectorAll('[data-assembly-part]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.assemblyPart===selected)));
  dialog.querySelectorAll('[data-assembly-point]').forEach(b=>b.setAttribute('aria-pressed',String(String(point)===b.dataset.assemblyPoint)));
  $('assembly-side-points').hidden=selected==='body';$('assembly-body-points').hidden=selected!=='body';$('assembly-copy-side').disabled=selected==='body'||!part().source;
  $('assembly-use-cutout').disabled=!api.get().cutout;$('assembly-direction').textContent={left:'좌측',center:'정면',right:'우측'}[draft.direction];
  $('assembly-point-hint').textContent=point==='crop'?'그림에서 남길 영역을 끌어 선택하세요.':selected==='body'?`${Number(point)+1}. ${pointLabels[point]} 모서리를 찍으세요. 네 점은 끌어서 고칠 수 있어요.`:point==='foot'?'다리가 바닥에 닿는 높이를 찍으세요.':'다리 위 나무판의 윗면을 찍으세요.';
  render();
 }
 function sourceCamera(){const c=$('assembly-source'),s=part()?.source;if(!s)return null;const k=Math.min((c.width-40)/s.width,(c.height-40)/s.height);return {k,x:(c.width-s.width*k)/2,y:(c.height-s.height*k)/2};}
 function renderSource(){const c=$('assembly-source'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);const image=images.get(selected),v=sourceCamera();if(!image||!v){ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillStyle='#6b5879';ctx.fillText(labels[selected]+' 그림을 넣어 주세요',c.width/2,c.height/2);return;}
  ctx.save();ctx.translate(v.x,v.y);ctx.scale(v.k,v.k);ctx.drawImage(image,0,0);ctx.lineWidth=2/v.k;ctx.strokeStyle='#167b67';ctx.fillStyle='#167b67';ctx.font=`600 ${17/v.k}px sans-serif`;ctx.textAlign='center';
  if(selected==='body')draft.body.anchors.forEach((p,i)=>{if(!p)return;ctx.beginPath();ctx.arc(p.x,p.y,11/v.k,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(String(i+1),p.x,p.y+6/v.k);ctx.fillStyle='#167b67';});
  else for(const [y,label]of [[part().supportY,'나무판 윗면'],[part().footY,'발끝']]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(part().source.width,y);ctx.stroke();ctx.fillText(label,part().source.width/2,y-7/v.k);}
  if(cropStart&&cropEnd){ctx.strokeStyle='#e48820';ctx.strokeRect(cropStart.x,cropStart.y,cropEnd.x-cropStart.x,cropEnd.y-cropStart.y);}ctx.restore();
 }
 function render(){if(!draft||!dialog.open)return;renderSource();const c=$('assembly-preview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);let value;
  try{value=normalizeAssembly(draft);const full=canvas(1507,1044),g=drawAssembly(full.getContext('2d'),value,images,pose()),b=alphaBounds(full);if(!b)throw new Error('표시할 그림이 없어요.');const k=Math.min((c.width-36)/b.width,(c.height-36)/b.height),x=(c.width-b.width*k)/2,y=(c.height-b.height*k)/2;ctx.drawImage(full,b.x,b.y,b.width,b.height,x,y,b.width*k,b.height*k);
   if($('assembly-guides').checked){ctx.strokeStyle='#167b67';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.beginPath();for(const [i,p]of g.body.supports.entries()){const px=x+(p.x-b.x)*k,py=y+(p.y-b.y)*k;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();ctx.setLineDash([]);for(const p of g.body.supports){ctx.beginPath();ctx.arc(x+(p.x-b.x)*k,y+(p.y-b.y)*k,5,0,Math.PI*2);ctx.fillStyle='#167b67';ctx.fill();}}
   tell('밑면 맞춤 유지 중 · 옆판과 다리는 한 장, 몸통도 한 장');$('assembly-apply').disabled=busy;
  }catch(e){tell(e.message);$('assembly-apply').disabled=true;}
 }
 dialog.querySelectorAll('[data-assembly-part]').forEach(b=>b.onclick=()=>{if(busy)return;selected=b.dataset.assemblyPart;point=selected==='body'?0:'support';cropStart=cropEnd=null;sync();});
 dialog.querySelectorAll('[data-assembly-point]').forEach(b=>b.onclick=()=>{point=/^\d$/.test(b.dataset.assemblyPoint)?Number(b.dataset.assemblyPoint):b.dataset.assemblyPoint;sync();});
 const sourcePoint=e=>{const c=$('assembly-source'),r=c.getBoundingClientRect(),v=sourceCamera();return v?{x:Math.max(0,Math.min(part().source.width,((e.clientX-r.left)*c.width/r.width-v.x)/v.k)),y:Math.max(0,Math.min(part().source.height,((e.clientY-r.top)*c.height/r.height-v.y)/v.k))}:null;};
 let drag=null;
 $('assembly-source').onpointerdown=e=>{if(busy||!part().source)return;const p=sourcePoint(e);e.currentTarget.setPointerCapture(e.pointerId);if(point==='crop'){cropStart=cropEnd=p;drag='crop';}else if(selected==='body'){const v=sourceCamera(),i=draft.body.anchors.findIndex(q=>q&&Math.hypot(q.x-p.x,q.y-p.y)*v.k<25);drag=i>=0?i:Number(point);draft.body.anchors[drag]=p;}else {drag=point;part()[point==='foot'?'footY':'supportY']=Math.round(p.y);}render();};
 $('assembly-source').onpointermove=e=>{if(drag===null)return;const p=sourcePoint(e);if(drag==='crop')cropEnd=p;else if(selected==='body')draft.body.anchors[drag]=p;else part()[drag==='foot'?'footY':'supportY']=Math.round(p.y);schedule();};
 const end=()=>{if(drag===null)return;const previous=drag;drag=null;if(previous==='crop')run(async()=>{const image=images.get(selected),x=Math.floor(Math.min(cropStart.x,cropEnd.x)),y=Math.floor(Math.min(cropStart.y,cropEnd.y)),w=Math.floor(Math.abs(cropEnd.x-cropStart.x)),h=Math.floor(Math.abs(cropEnd.y-cropStart.y));if(w<8||h<8)throw new Error('남길 영역을 조금 더 크게 선택하세요.');const c=canvas(w,h);c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);await putSource(sourceOf(c,part().source.name));});else{if(selected==='body')point=(Number(previous)+1)%4;sync();}};
 $('assembly-source').onpointerup=end;$('assembly-source').onpointercancel=()=>{drag=null;cropStart=cropEnd=null;sync();};
 $('assembly-file').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;run(async()=>{if(file.size>25000000||!/^image\/(png|webp|jpeg)$/.test(file.type))throw new Error('25MB 이하 PNG·JPG·WebP 그림을 넣어 주세요.');const image=await api.loadImage(await api.readFile(file));await putSource(sourceOf(image,file.name));});};
 $('assembly-use-cutout').onclick=()=>run(()=>putSource(sourceOf(api.get().cutout,'잘라낸 그림.png')));
 $('assembly-copy-side').onclick=()=>{const other=selected==='near'?'far':'near';draft.sides[other]=clone(part());images.set(other,images.get(selected));sync();};
 $('assembly-crop').onclick=()=>{if(!part().source)return;point='crop';cropStart=cropEnd=null;sync();};
 $('assembly-remove-black').onclick=()=>run(async()=>{const image=images.get(selected);if(!image)return;const c=canvas(part().source.width,part().source.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),d=pixels.data,seen=new Uint8Array(c.width*c.height),queue=new Int32Array(c.width*c.height);let head=0,tail=0;const add=i=>{if(i<0||i>=seen.length||seen[i])return;seen[i]=1;const o=i*4;if(d[o+3]===0||Math.max(d[o],d[o+1],d[o+2])<45)queue[tail++]=i;};for(let x=0;x<c.width;x++){add(x);add((c.height-1)*c.width+x);}for(let y=0;y<c.height;y++){add(y*c.width);add(y*c.width+c.width-1);}while(head<tail){const i=queue[head++];d[i*4+3]=0;if(i%c.width)add(i-1);if(i%c.width<c.width-1)add(i+1);add(i-c.width);add(i+c.width);}ctx.putImageData(pixels,0,0);const s=sourceOf(c,part().source.name);part().source=s;images.set(selected,await decode(s));sync();});
 $('assembly-guides').onchange=render;
 $('assembly-example').onclick=()=>run(async()=>{const read=async name=>{const response=await fetch(new URL('../assets/sofa-original-layers-v1/'+name+'.png',import.meta.url));if(!response.ok)throw new Error('소파 예시 그림을 불러오지 못했어요.');return sourceOf(await api.loadImage(await api.readFile(await response.blob())),name+'.png');};const side=await read('side'),body=await read('body');draft=approvedSofaAssembly(side,body);await loadImages();selected='body';point=0;sync();});
 $('assembly-reset').onclick=()=>run(async()=>{draft=clone(initial);await loadImages();sync();});
 const close=()=>{if(busy)return;dialog.close();};$('assembly-cancel').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('assembly-apply').onclick=()=>run(async()=>{const value=normalizeAssembly(draft);const check=assemblyCheck(value,pose());if(!check.ok)throw new Error(check.error);await api.commit(value);dialog.close();});
 async function open(){if(dialog.open)return;const existing=api.get().state.pictureAssembly;if(existing)draft=clone(existing);else fresh();initial=clone(draft);selected=existing?'body':'near';point=selected==='body'?0:'support';dialog.showModal();await run(async()=>{await loadImages();sync();});}
 document.getElementById('assembly-open').onclick=open;
 return {isOpen:()=>dialog.open,isBusy:()=>busy,open};
}

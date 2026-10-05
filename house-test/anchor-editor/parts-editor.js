import {createParts,getPartCanvases} from './parts.js?v=20261005-sofalegs3';
import {PICTURE_LIBRARY} from './accessory-library.js?v=20261005-sofalegs3';
import {validatePolygon} from './cutout.js?v=20261005-sofalegs3';
import {nextEmptyPart,suggestObjectRect} from './automation.js?v=20261005-sofalegs3';
import {getSofaBlanketDrape} from '../sofa-blanket-drape.js?v=20261005-sofalegs3';
import {SOFA_CUSHION_SEATS} from '../sofa-cushion-placement.js?v=20261005-sofalegs3';

const $=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value));
const SLOT_NAMES={surface:'윗면·좌판 위 물건',under:'상판 아래 물건',front:'가구 전체 앞 물건'};
const uid=()=>crypto.randomUUID?.()||'object-'+Date.now();
// Ordinary objects use source-frame positions. The known sofa blanket is
// automatically attached through its own fold registration, not sofa seams.
export function mountPartsEditor(api){
 let selected='',objectId='',orderId='',partPreview=false;
 let currentDirection=null;const viewSelections=new Map();
 const get=()=>api.get(),part=()=>get().parts?.parts.find(p=>p.id===selected),object=()=>get().parts?.objects.find(p=>p.id===objectId);
 const edit=fn=>{const next=clone(get().parts);if(!next)return;fn(next);api.commit(next);};
 const event=(id,type,fn)=>$(id).addEventListener(type,()=>api.run(fn));
 const sync=()=>{
  const {parts,frame,baseImage,direction}=get(),p=parts;
  if(currentDirection!==direction){
   if(currentDirection)viewSelections.set(currentDirection,{selected,objectId,orderId,partPreview});
   ({selected='',objectId='',orderId='',partPreview=false}=viewSelections.get(direction)||{});currentDirection=direction;$('parts-preview-selected').checked=partPreview;
  }
  $('parts-create').disabled=!baseImage;$('parts-controls').hidden=!p;
  if(!p){selected='';objectId='';orderId='';partPreview=false;$('parts-preview-selected').checked=false;return;}
  $('parts-preset').value=p.preset;
  if(!p.parts.some(v=>v.id===selected))selected=nextEmptyPart(p)||p.parts[0].id;
  if(!p.objects.some(v=>v.id===objectId))objectId=p.objects[0]?.id||'';
  if(!p.order.includes(orderId))orderId=selected;
  const current=part();$('part-selected').replaceChildren(...p.parts.map(v=>new Option(v.name+(v.remainder?' · 나머지 원본':''),v.id,false,v.id===selected)));
  $('parts-frame').textContent=`${frame.width}×${frame.height}px 원본 좌표 고정 · 좌우 이름은 가구를 정면에서 볼 때를 기준으로 고정합니다.`;
  $('part-visible').checked=current.visible!==false;$('part-outline').disabled=current.remainder;$('part-clear').disabled=current.remainder||!current.polygon.length;$('part-finish').disabled=current.remainder||get().draft.length<3||get().tool!=='part-outline';
  $('part-reset-source').disabled=!current.source;
  const label=id=>id.startsWith('slot:')?SLOT_NAMES[id.slice(5)]:p.parts.find(v=>v.id===id)?.name||id;
  $('parts-order').replaceChildren(...p.order.map(id=>new Option(label(id),id,false,id===orderId)));
  $('part-back').disabled=p.order.indexOf(orderId)<=0;$('part-forward').disabled=p.order.indexOf(orderId)>=p.order.length-1;
  $('insert-selected').replaceChildren(...p.objects.map(v=>new Option(v.name,v.id,false,v.id===objectId)));
  $('insert-controls').hidden=!object();
  if(object()){
   const o=object();$('insert-slot').replaceChildren(...p.order.filter(v=>v.startsWith('slot:')).map(v=>new Option(SLOT_NAMES[v.slice(5)],v.slice(5),false,o.slot===v.slice(5))));
   for(const key of ['x','y','width','height']){$('insert-'+key).value=o.rect[key];$('insert-'+key).max=String(frame[key==='x'||key==='width'?'width':'height']);}
   $('insert-visible').checked=o.visible!==false;
   const ratio=o.rect.width/o.rect.height,maxWidth=Math.min(frame.width,frame.height*ratio),percent=o.rect.width/maxWidth*100;
   $('insert-scale').value=percent;$('insert-scale-value').textContent=Math.round(percent)+'%';
   const draped=!!o.registration;
   for(const id of ['insert-slot','insert-x','insert-y','insert-width','insert-height','insert-scale','insert-move'])$(id).disabled=draped;
   if(draped){$('insert-slot').replaceChildren(new Option('소파 접힘선에 자동 연결 · 쿠션 아래와 앞쪽','surface'));$('insert-scale-value').textContent='소파 크기에 맞춤';}
  }
  $('insert-library-add').textContent=`${{left:'좌측',center:'정면',right:'우측'}[direction]} 물건 그림 넣기`;
 };
 event('parts-create','click',()=>{const {parts,frame,direction}=get();if(parts&&!confirm('현재 방향의 부위와 삽입 물건을 새 구성으로 바꿀까요?'))return;selected='';objectId='';api.commit(createParts($('parts-preset').value,direction,frame));api.message('부위 구성만 만들었어요. 실제 보이는 부위의 윤곽을 직접 찍어 주세요.');});
 event('parts-remove','click',()=>{if(!confirm('현재 방향의 부위 구성과 삽입 물건을 해제할까요?'))return;api.commit(null);});
 event('part-selected','change',()=>{selected=$('part-selected').value;orderId=selected;api.clearDraft();sync();api.redraw();});
 event('part-outline','click',()=>{if(part()?.remainder)return;api.startOutline();api.message('선택한 부위의 실제 윤곽을 원본 창에서 둘레 순서로 찍어 주세요.');});
 const finish=()=>{const polygon=clone(get().draft);if(!validatePolygon(polygon))throw new Error('부위 윤곽이 교차하거나 겹쳤어요. 둘레 순서로 다시 찍어 주세요.');edit(p=>p.parts.find(v=>v.id===selected).polygon=polygon);api.clearDraft();const next=nextEmptyPart(get().parts);
  if(document.body.dataset.mode==='simple'&&next){selected=next;orderId=next;api.startOutline();sync();api.message('이 부위를 나눴어요. 다음 부위의 실제 윤곽을 찍어 주세요.');}
  else api.message('원본에서 이 부위가 차지하는 영역을 나눴어요. 숨은 그림은 자동 생성하지 않습니다.');};
 event('part-finish','click',finish);
 event('part-clear','click',()=>edit(p=>p.parts.find(v=>v.id===selected).polygon=[]));
 event('part-visible','change',()=>edit(p=>p.parts.find(v=>v.id===selected).visible=$('part-visible').checked));
 event('parts-preview-selected','change',()=>{partPreview=$('parts-preview-selected').checked;api.redraw();});
 event('parts-order','change',()=>{orderId=$('parts-order').value;sync();});
 for(const [id,delta]of [['part-back',-1],['part-forward',1]])event(id,'click',()=>edit(p=>{const at=p.order.indexOf(orderId),to=at+delta;if(at>=0&&to>=0&&to<p.order.length)[p.order[at],p.order[to]]=[p.order[to],p.order[at]];}));
 const readPNG=async file=>{if(!file)return null;if(file.type!=='image/png'||file.size>25000000)throw new Error('25MB 이하의 투명 PNG를 넣어 주세요.');const data=await api.readFile(file),image=await api.loadImage(data);return {image,source:{name:file.name,data,width:image.naturalWidth,height:image.naturalHeight}};};
 event('part-file','change',async()=>{const file=$('part-file').files[0];$('part-file').value='';const loaded=await readPNG(file);if(!loaded)return;const {frame}=get();if(loaded.source.width!==frame.width||loaded.source.height!==frame.height)throw new Error(`부위 PNG는 원본과 같은 ${frame.width}×${frame.height}px여야 해요. 잘라낸 그림을 자동 확대하지 않습니다.`);edit(p=>p.parts.find(v=>v.id===selected).source=loaded.source);});
 event('part-reset-source','click',()=>edit(p=>p.parts.find(v=>v.id===selected).source=null));
 const insert=async(source,name,libraryId)=>{const {frame,direction,parts}=get(),registration=libraryId==='blanket-sofa'&&parts.preset==='sofa'?getSofaBlanketDrape(direction):null;objectId=uid();edit(p=>{const slots=p.order.filter(v=>v.startsWith('slot:')).map(v=>v.slice(5));if(registration&&!slots.includes('front'))p.order.push('slot:front');if(registration&&!slots.includes('surface'))p.order.splice(p.order.indexOf('body')+1,0,'slot:surface');p.objects.push({id:objectId,name,source,rect:suggestObjectRect(frame,source),slot:registration?'surface':slots.includes('surface')?'surface':slots[0],visible:true,...(registration?{registration}:{}),...(parts.preset==='sofa'&&Object.hasOwn(SOFA_CUSHION_SEATS,libraryId)?{sofaAccessoryId:libraryId}:{})});});if(document.body.dataset.mode==='simple')api.setTool(registration?'inspect':'object');};
 event('insert-file','change',async()=>{const file=$('insert-file').files[0];$('insert-file').value='';const loaded=await readPNG(file);if(loaded)await insert(loaded.source,file.name.replace(/\.png$/i,''));});
 $('insert-library').replaceChildren(...PICTURE_LIBRARY.items.map(v=>new Option(v.name,v.id)));
 event('insert-library-add','click',async()=>{const item=PICTURE_LIBRARY.items.find(v=>v.id===$('insert-library').value),direction=get().direction,url=item.views[direction];let data=url;if(!data.startsWith('data:')){const response=await fetch(new URL(url,import.meta.url));if(!response.ok)throw new Error('물건 그림을 읽지 못했어요.');data=await api.readFile(new Blob([await response.blob()],{type:'image/png'}));}const image=await api.loadImage(data);await insert({name:item.id+'-'+direction+'.png',data,width:image.naturalWidth,height:image.naturalHeight},item.name,item.id);api.message(object()?.registration?'담요를 소파 접힘선에 연결했어요. 윗부분은 쿠션 아래, 늘어진 부분은 앞쪽에 그립니다.':'현재 방향의 물건 그림을 넣었어요. 위치·크기·앞뒤 순서를 확인해 주세요.');});
 event('insert-selected','change',()=>{objectId=$('insert-selected').value;sync();if(document.body.dataset.mode==='simple')api.setTool('object');});
 event('insert-slot','change',()=>edit(p=>p.objects.find(v=>v.id===objectId).slot=$('insert-slot').value));
 for(const key of ['x','y','width','height'])event('insert-'+key,'change',()=>{const value=Number($('insert-'+key).value);if(!Number.isFinite(value))throw new Error('물건 위치와 크기에 숫자를 넣어 주세요.');edit(p=>p.objects.find(v=>v.id===objectId).rect[key]=value);});
 event('insert-visible','change',()=>edit(p=>p.objects.find(v=>v.id===objectId).visible=$('insert-visible').checked));
 event('insert-remove','click',()=>edit(p=>p.objects=p.objects.filter(v=>v.id!==objectId)));
 event('insert-move','click',()=>{api.setTool('object');api.message('선택한 물건을 원본 그림에서 끌어 놓으세요. 부위 전체와 함께 저장됩니다.');});
 let scaleTransaction=false;
 const scaleStart=()=>{if(!object()||scaleTransaction)return;api.checkpoint();scaleTransaction=true;};
 $('insert-scale').addEventListener('input',()=>{if(!object())return;scaleStart();const {frame}=get(),o=object(),ratio=o.rect.width/o.rect.height,width=Math.min(frame.width,frame.height*ratio)*Number($('insert-scale').value)/100,height=width/ratio;const next=clone(get().parts),rect=next.objects.find(v=>v.id===objectId).rect;Object.assign(rect,{x:Math.max(0,Math.min(frame.width-width,o.rect.x+(o.rect.width-width)/2)),y:Math.max(0,Math.min(frame.height-height,o.rect.y+(o.rect.height-height)/2)),width,height});api.preview(next);$('insert-scale-value').textContent=$('insert-scale').value+'%';});
 const finishScale=()=>{if(scaleTransaction){scaleTransaction=false;api.finish();sync();}};
 for(const type of ['change','pointerup','pointercancel','blur'])$('insert-scale').addEventListener(type,finishScale);
 const selectedRect=()=>!object()?.registration&&object()?.visible!==false?object()?.rect:null;
 const hit=point=>{const r=selectedRect();return r&&point.x>=r.x&&point.x<=r.x+r.width&&point.y>=r.y&&point.y<=r.y+r.height?clone(r):null;};
 const drag=(start,dx,dy)=>{if(!object())return;const next=clone(get().parts),{frame}=get(),r=next.objects.find(v=>v.id===objectId).rect;r.x=Math.max(0,Math.min(frame.width-r.width,start.x+dx));r.y=Math.max(0,Math.min(frame.height-r.height,start.y+dy));api.preview(next);};
 return {sync,finish,hit,drag,selectedRect,isAdjusting:()=>scaleTransaction,getSelected:()=>selected,sourcePreview:fallback=>{const {parts,baseImage,imageMap}=get();return partPreview&&parts?getPartCanvases(baseImage,parts,imageMap).get(selected)||fallback:fallback;},polygon:()=>part()?.polygon||[]};
}

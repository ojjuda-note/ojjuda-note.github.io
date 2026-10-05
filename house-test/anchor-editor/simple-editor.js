import {analyseAlpha,nextEmptyPart} from './automation.js?v=20261005-blanketdata1';
import {saveDraft,loadDraft,clearDraft} from './draft-store.js?v=20261005-blanketdata1';
const $=id=>document.getElementById(id);
// Presentation and recovery only. The app remains the owner of project changes.
export function mountSimpleEditor(api){
 let timer,version=0,recovery=null;const alphaCache=new WeakMap();
 const advanced=node=>node?.classList.add('advanced-only');
 for(const id of ['object-type','object-usage'])advanced($(id).closest('.button-row'));
 advanced($('object-type').closest('.button-row').nextElementSibling);
 for(const id of ['parts-preset','parts-order','plane-offset']){advanced($(id));advanced(document.querySelector(`label[for="${id}"]`));}
 for(const id of ['parts-create','parts-remove','part-clear','part-reset-source','example','clear-view'])advanced($(id));
 advanced($('part-file').closest('label'));advanced($('part-back').closest('.button-row'));
 advanced($('parts-preview-selected').closest('.check-list'));advanced($('parts-frame'));
 advanced($('insert-x').closest('.two-fields'));advanced($('geometry-mode').closest('details'));
 advanced($('width').closest('.dimension-fields'));advanced($('width').closest('.dimension-fields').nextElementSibling);
 advanced($('direction').closest('.two-fields'));advanced($('grid-bind').closest('.button-row'));
 advanced($('plane-offset').nextElementSibling);advanced($('opacity').closest('label'));
 advanced($('grid-visible').closest('.check-list'));advanced(document.querySelector('.export-group'));
 $('reset-cutout').classList.add('advanced-only');$('brush-size').closest('label').classList.add('advanced-only');
 $('finish-outline').closest('details').open=false;
 $('mode-toggle').onclick=()=>{const simple=document.body.dataset.mode!=='simple';document.body.dataset.mode=simple?'simple':'advanced';$('mode-toggle').textContent=simple?'고급 설정':'간편 모드';$('mode-toggle').setAttribute('aria-pressed',String(!simple));api.mode(simple);sync();};
 $('quick-undo').onclick=()=>$('undo').click();
 const sync=()=>{
  const {state,image,pending}=api.get();$('quick-undo').disabled=$('undo').disabled;document.body.dataset.tool=api.get().tool;
  let text=!image?'그림을 넣으면 방향·부위 구성을 준비해요.':state.dimensionStatus==='suggested'?'종류별 크기는 임시 추천값입니다.':'기존 크기와 편집 내용을 유지합니다.';
  if(image){
   if(!alphaCache.has(image)){try{alphaCache.set(image,analyseAlpha(image));}catch{alphaCache.set(image,null);}}
   const alpha=alphaCache.get(image);text+='\n'+(alpha?.empty?'그림이 비어 있어요. 원본을 확인하세요.':alpha?.hasTransparency?'투명영역은 유지했어요. 필요하면 그림 정리.':'주변 그림이 있으면 「필요하면 그림 정리」에서 지워 주세요.');
   const missing=state.parts?.parts.filter(p=>!p.remainder&&!p.source&&!p.polygon.length).length||0;
   text+='\n'+(missing?`부위 윤곽 ${missing}개 확인 필요 · ${state.parts.parts.find(p=>p.id===nextEmptyPart(state.parts))?.name||''}부터 찍으세요.`:state.parts?'부위 구성 준비됨 · 가림·숨은 부분은 직접 확인해 주세요.':'종류를 선택하면 부위 구성을 준비합니다.');
   text+='\n격자·원근 검수는 별도입니다. 미등록 그림도 저장할 수 있어요.';
  }
  $('quick-status').textContent=text;
  if(pending)$('draft-status').textContent='윤곽 작성 중 · 완성한 뒤 자동 임시저장';
 };
 async function persist(at,{strict=false}={}){
  if(at!==version)return;
  if(api.get().pending){$('draft-status').textContent='윤곽 작성 중 · 완성한 뒤 자동 임시저장';if(strict)throw new Error('그림 정리를 마치거나 Esc로 취소한 뒤 닫아 주세요.');return;}
  if(api.get().busy){if(strict)throw new Error('현재 편집이 끝난 뒤 다시 닫아 주세요.');timer=setTimeout(()=>persist(at),600);return;}
  const project=api.snapshot();if(!Object.values(project.views).some(Boolean))return;
  $('draft-status').textContent='자동 임시저장 중…';
  try{const result=await saveDraft(project);if(at===version&&!api.get().pending){$('draft-status').textContent='자동 임시저장됨 · '+new Date(result.savedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});recovery=null;$('draft-resume').hidden=true;$('draft-dismiss').hidden=false;}}
  catch(error){if(at===version)$('draft-status').textContent=error.message+' 작업 파일 저장은 계속 사용할 수 있어요.';if(strict)throw error;}
 }
 const schedule=()=>{clearTimeout(timer);const at=++version;$('draft-status').textContent=api.get().pending?'윤곽 작성 중 · 완성한 뒤 자동 임시저장':'자동 임시저장 대기';timer=setTimeout(()=>persist(at),800);};
 $('draft-resume').onclick=()=>api.run(async()=>{if(!recovery)return;const saved=recovery;clearTimeout(timer);version++;if(await api.restore(saved.project)===false){recovery=saved;schedule();return;}recovery=null;$('draft-resume').hidden=true;schedule();$('draft-status').textContent='자동 임시저장에서 복원됨 · 파일 저장은 별도입니다.';});
 $('draft-dismiss').onclick=()=>api.run(async()=>{clearTimeout(timer);version++;await clearDraft();recovery=null;$('draft-resume').hidden=true;$('draft-dismiss').hidden=true;$('draft-status').textContent='자동 임시저장 지움 · 현재 편집은 유지됩니다.';});
 loadDraft().then(saved=>{if(!saved||version)return;recovery=saved;$('draft-resume').hidden=false;$('draft-dismiss').hidden=false;$('draft-status').textContent='이전에 자동 임시저장한 작업이 있어요.';}).catch(error=>{$('draft-status').textContent=error.message;});
 const flush=()=>{clearTimeout(timer);return persist(++version,{strict:true});};
 return {sync,schedule,flush};
}

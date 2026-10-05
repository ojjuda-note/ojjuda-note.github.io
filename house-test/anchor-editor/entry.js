import {setDraftOwner} from './draft-store.js?v=20261005-sofalegs3';
import {validateRuntime} from './runtime.js?v=20261005-sofalegs3';
import {loadBundledExample} from './example-project.js?v=20261005-sofalegs3';
let connected=false,port,alive=false,pending=new Map(),editor,operating=false,closingRequest=null;
function request(type,payload={}){
 if(!alive)return Promise.reject(new Error('관리자 모드에서 제작실을 다시 열어 주세요.'));
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'));},30000);pending.set(requestId,{resolve,reject,timer});port.postMessage({type,requestId,...payload});});
}
window.addEventListener('message',async event=>{
 if(connected||parent===window||event.source!==parent||event.origin!==location.origin||event.data?.type!=='ojjuda-furniture-studio-init'||!event.ports[0]||typeof event.data.owner!=='string'||!event.data.owner||event.data.owner.length>180)return;
 connected=true;alive=true;port=event.ports[0];setDraftOwner(event.data.owner);
 port.onmessage=async e=>{const d=e.data;if(d?.type==='dispose'){alive=false;document.querySelector('#studio-editor').hidden=true;document.querySelector('#studio-locked').hidden=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('관리자 연결이 종료됐어요.'));}pending.clear();port.close();return;}
  if(d?.type==='close-cancel'&&closingRequest===d.requestId){closingRequest=null;document.querySelector('#studio-editor').inert=false;return;}
  if(d?.type==='before-close'){
   const panel=document.querySelector('#studio-editor');
   try{if(!editor||operating)throw new Error('현재 작업이 끝난 뒤 다시 닫아 주세요.');closingRequest=d.requestId;panel.inert=true;await editor.studioFlush();if(alive&&closingRequest===d.requestId)port.postMessage({type:'close-ready',requestId:d.requestId});}
   catch(error){closingRequest=null;panel.inert=false;if(alive)port.postMessage({type:'close-failed',requestId:d.requestId,error:error.message||'마지막 변경을 저장하지 못했어요. 작업 파일을 먼저 저장해 주세요.'});}
   return;
  }
  const p=pending.get(d?.requestId);if(p){clearTimeout(p.timer);pending.delete(d.requestId);d.error?p.reject(new Error(d.error)):p.resolve(d);}};
 try{
  editor=await import('./app.js?v=20261005-sofalegs3');if(!alive)return;
  document.querySelector('#studio-locked').hidden=true;document.querySelector('#studio-editor').hidden=false;window.dispatchEvent(new Event('resize'));
  const operate=async task=>{
   if(operating||!alive)return;operating=true;
   const panel=document.querySelector('#studio-editor');
   const controls=[...panel.querySelectorAll('#studio-preview,#studio-home,#studio-apply,#studio-side-table,#studio-open-saved,#studio-refresh')].map(button=>[button,button.disabled]);
   panel.setAttribute('aria-busy','true');controls.forEach(([button])=>{button.disabled=true;});
   try{await task();}catch(error){if(alive)editor.studioMessage(error.message||'작업을 완료하지 못했어요.');}
   finally{operating=false;panel.removeAttribute('aria-busy');controls.forEach(([button,disabled])=>{button.disabled=disabled;});if(alive)editor.studioRefresh();}
  };
  const run=async(type)=>{const button=document.querySelector(type==='apply'?'#studio-apply':'#studio-preview');button.disabled=true;try{const bundle=editor.studioBundle();validateRuntime(bundle.runtime);await request(type,bundle);editor.studioMessage(type==='apply'?'우리집 아이템 목록에 등록했어요. 원하는 위치에 놓고 배치 완료를 눌러 주세요.':'우리집 미리보기를 열었어요.');}catch(e){editor.studioMessage(e.message);}finally{editor.studioRefresh();}};
  document.querySelector('#studio-apply').onclick=()=>operate(()=>run('apply'));
  document.querySelector('#studio-preview').onclick=()=>operate(()=>run('preview'));
  document.querySelector('#studio-side-table').onclick=()=>operate(async()=>{const project=await loadBundledExample(new URL('./examples/side-table.furniture-set.json?v=20261005-sofalegs3',import.meta.url));if(alive)await editor.studioRestore(project);});
  document.querySelector('#studio-home').onclick=()=>operate(()=>request('home'));
  document.querySelector('#studio-open-saved').onclick=()=>operate(async()=>{const id=document.querySelector('#studio-saved-items').value;if(!id)return;const result=await request('project',{id});if(alive)await editor.studioRestore(result.project);});
  const refresh=async()=>{try{const result=await request('list');const select=document.querySelector('#studio-saved-items');select.replaceChildren(new Option('등록한 제작 아이템 다시 열기',''),...result.items.map(i=>new Option(i.name,i.id)));}catch(e){editor.studioMessage(e.message);}};
  document.querySelector('#studio-refresh').onclick=()=>operate(refresh);await operate(refresh);port.postMessage({type:'ready'});
 }catch(e){document.querySelector('#studio-locked p').textContent='제작실을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.';port.postMessage({type:'failed'});console.error(e);}
});

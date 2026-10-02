let activeClose=null;
export function openHouseTest({owner,authorized,preview=null,studioItem=null,onClose}){
 if(typeof owner!=='string'||!owner||owner.length>180||typeof authorized!=='function'||!authorized())return;
 activeClose?.();const oldOverflow=document.body.style.overflow,lastFocus=document.activeElement;
 const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','새 우리집 테스트');
 Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'10000',background:'#f8f2fc',display:'flex',flexDirection:'column'});
 const status=document.createElement('div');status.textContent='우리집을 준비하고 있어요…';Object.assign(status.style,{padding:'8px 110px 8px 15px',fontSize:'12px',color:'#65526f',background:'#fffaf4'});
 const close=document.createElement('button');close.textContent='테스트 닫기';close.style.cssText='position:absolute;right:10px;top:8px;z-index:2;border:1px solid #dbcee5;background:#fffaf4;color:#65526f;border-radius:12px;padding:6px 10px;min-height:36px;cursor:pointer';
 const frame=document.createElement('iframe');frame.title='새 우리집 플레이 테스트';frame.src=new URL('./index.html?v=20261003-studio-v1',import.meta.url).href;frame.style.cssText='width:100%;flex:1;border:0;min-height:0';
 overlay.append(status,close,frame);document.body.append(overlay);document.body.style.overflow='hidden';close.focus();
 let channel=null,closed=false;
 function cleanup(){if(closed)return;closed=true;clearInterval(watcher);clearTimeout(deadline);channel?.port1.postMessage({type:'dispose'});channel?.port1.close();overlay.remove();document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',escape,true);if(lastFocus?.isConnected)lastFocus.focus();if(activeClose===cleanup)activeClose=null;onClose?.();}
 const escape=e=>{if(e.key==='Escape'){e.preventDefault();cleanup();}};window.addEventListener('keydown',escape,true);close.onclick=cleanup;activeClose=cleanup;
 const watcher=setInterval(()=>{if(!authorized()||!overlay.isConnected)cleanup();},400);
 const deadline=setTimeout(()=>{status.textContent='화면을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.';},20000);
 frame.addEventListener('load',()=>{if(closed||!authorized()){cleanup();return;}channel?.port1.close();channel=new MessageChannel();channel.port1.onmessage=e=>{if(closed)return;if(!authorized()){cleanup();return;}if(e.data?.type==='ready'){clearTimeout(deadline);status.textContent=preview?'제작 가구 미리보기 · 기존 배치는 저장하지 않습니다':'관리자 테스트 · 변경 내용은 이 기기에만 저장됩니다';}else if(e.data?.type==='failed'){clearTimeout(deadline);status.textContent='제작 아이템을 읽지 못했어요. 닫은 뒤 다시 열어 주세요.';}else if(e.data?.type==='close')cleanup();else if(e.data?.type==='studio'){cleanup();import('./studio-host.js?v=20261003-studio-v1').then(({openFurnitureStudio})=>openFurnitureStudio({owner,authorized}));}};frame.contentWindow.postMessage({type:'ojjuda-house-test-init',owner,preview,studioItem},location.origin,[channel.port2]);});
 return cleanup;
}

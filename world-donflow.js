/* DonFlow is bundled from the MIT-licensed upstream; the host reuses Ojjuda login. */
(() => {
 'use strict';
 const sessions = new Map();
 window.OjjudaDonflowHost = {connect(source){const record=sessions.get(source);return record?.active()?record:null;}};
 window.OjjudaDonflow = {mount(host,{owner,client,authorized=()=>true}={}){
  const p=document.createElement('p');p.className='life-storage';
  if(!owner||!client){p.textContent='로그인 후 사용할 수 있어요.';host.append(p);return()=>{};}
  const frame=document.createElement('iframe');frame.title='오쭈다 가계부 · 돈플로우';frame.className='life-donflow';frame.dataset.worldSwipe='off';
  let alive=true,started=false;const active=()=>alive&&host.isConnected&&authorized();
  const record={owner,client,active,expand(){if(!active())return;host.classList.toggle('donflow-expanded');}};
  const start=()=>{if(started||!active())return;started=true;host.append(frame);sessions.set(frame.contentWindow,record);frame.src='/ledger/index.html?v=20261004-donflow2';};
  const details=host.closest('details');const toggle=()=>{if(details.open)start();};details?.addEventListener('toggle',toggle);if(!details||details.open)start();
  return()=>{alive=false;details?.removeEventListener('toggle',toggle);sessions.delete(frame.contentWindow);frame.remove();host.classList.remove('donflow-expanded');};
 }};
})();

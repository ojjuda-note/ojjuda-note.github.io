// unchanged production source at line 1
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 12px;flex:none;color:#684a8a;background:#fff9ee;border-bottom:1px solid #e5d5ef;font-size:12px';
  const status=document.createElement('span');status.id='ttang-save-status';status.setAttribute('role','status');status.textContent='월드땅따먹기';
  const done=document.createElement('button');done.type='button';done.textContent='오락실로 ✕';done.setAttribute('aria-label','월드땅따먹기 닫기');done.style.cssText='font:inherit;color:inherit;border:1px solid #ddccec;background:#eee2f8;border-radius:12px;min-height:36px;padding:0 12px;cursor:pointer';done.onclick=close;
  frame=document.createElement('iframe');frame.title='월드땅따먹기';frame.src='/games/ttang.html?v=20261113-game-popup-order1';frame.allow='web-share; clipboard-write';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';
  const current=session,openedFrame=frame;
  if(/^[a-f0-9]{24}$/.test(hostCode||''))frame.addEventListener('load',async()=>{
   if(session!==current||!current.authorized())return;
// unchanged production source at line 95

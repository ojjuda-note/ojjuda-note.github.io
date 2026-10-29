/* Popularity uses saved play records; release dates never change with patch versions. */
(() => {
 'use strict';
 const releases = Object.freeze({
  mole:'2026-09-27T00:00:00+09:00',runner:'2026-09-27T00:00:00+09:00',stacker:'2026-09-27T00:00:00+09:00',breakout:'2026-09-27T00:00:00+09:00',screw:'2026-09-27T00:00:00+09:00',
  janggi:'2026-09-27T00:00:00+09:00',chess:'2026-09-27T00:00:00+09:00',billiards:'2026-09-27T00:00:00+09:00',
  spot:'2026-10-03T05:03:34+09:00',matgo:'2026-10-03T05:21:43+09:00',ttang:'2026-10-05T15:10:58+09:00',photo_ttang:'2026-10-05T21:58:56+09:00',
  tour:'2026-10-11T20:26:33+09:00',saetbyeol:'2026-10-13T00:41:20+09:00',mines:'2026-10-13T01:25:19+09:00',
  tank:'2026-10-18T15:21:54+09:00',poker:'2026-10-21T09:05:39+09:00',sacheonseong:'2026-10-28T18:44:38+09:00',bang:'2026-10-29T12:51:03+09:00'
 });
 const canonical = key => ['carom4','carom3','pool8'].includes(key)?'billiards':key;
 const keyOf = button => canonical(button.dataset.act === 'matgo-open'?'matgo':button.dataset.v);
 const month = 30*24*60*60*1000, ttl = 5*60*1000;
 let counts = new Map(), received = 0, attempted = 0, serverTime = 0, client, pending, queued = false;
 const now = () => serverTime ? serverTime + Math.max(0,Date.now()-received) : Date.now();
 function apply() {
  queued = false;
  for (const list of document.querySelectorAll('[data-arcade-games]')) {
   const allButtons = [...list.children].filter(el => el.matches('.gbtn'));
   for (let i=0;i<allButtons.length;i++) if (!allButtons[i].dataset.arcadeOrder) allButtons[i].dataset.arcadeOrder=String(i+1);
   const buttons = allButtons.filter(b=>!b.hidden&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden');
   const original = button => Number(button.dataset.arcadeOrder);
   const current = now();
   const fresh = key => { const date=Date.parse(releases[key]);return Number.isFinite(date)&&date<=current&&current-date<month; };
   const popular = buttons.filter(b => !fresh(keyOf(b))&&(counts.get(keyOf(b))||0)>0).sort((a,b)=>(counts.get(keyOf(b))||0)-(counts.get(keyOf(a))||0)||original(a)-original(b)).slice(0,3);
   const rank = new Map(popular.map((button,i)=>[keyOf(button),i+1]));
   for (const button of allButtons) {
    const key=keyOf(button), place=rank.get(key), isNew=fresh(key), signature=`${place||0}:${isNew}`;
    if (button.dataset.arcadeBadge === signature) continue;
    button.dataset.arcadeBadge=signature;
    button.querySelector('.arcade-badges')?.remove();
    const labels=[];
    if (place || isNew) {
     const badges=document.createElement('span');badges.className='arcade-badges';badges.setAttribute('aria-hidden','true');
     // New releases are excluded from popularity until the 30-day period ends.
     const badge=document.createElement('span');
     badge.className=`arcade-badge ${isNew?'new':'popular'}`;badge.textContent=isNew?'신규':'인기';badges.append(badge);
     labels.push(isNew?'출시 후 30일 이내 신규 게임':`최근 30일 인기 ${place}위 · 저장된 플레이 기록 기준`);
     button.querySelector('.ge')?.append(badges);
    }
    if (labels.length) button.setAttribute('aria-description',labels.join('. ')); else button.removeAttribute('aria-description');
   }
   const order=buttons.slice().sort((a,b)=>{
    const x=keyOf(a),y=keyOf(b),ra=rank.get(x),rb=rank.get(y);
    if (ra || rb) return (ra||99)-(rb||99);
    if (fresh(x)!==fresh(y)) return fresh(x)?-1:1;
    if (fresh(x)) return Date.parse(releases[y])-Date.parse(releases[x])||original(a)-original(b);
    return original(a)-original(b);
   });
   if (order.some((button,i)=>button!==buttons[i])) {
    const focused=document.activeElement; order.forEach(button=>list.append(button));
    if (list.contains(focused)) focused.focus({preventScroll:true});
   }
  }
 }
 function schedule() { if (!queued) { queued=true;requestAnimationFrame(apply); } }
 async function refresh(force=false) {
  if (pending || !document.querySelector('[data-arcade-games]') || (!force&&((received&&Date.now()-received<ttl)||(attempted&&Date.now()-attempted<60000)))) return pending;
  const config=window.OJJUDA_CONFIG;
  if (!config?.supabaseUrl || !config.supabaseKey || !window.supabase?.createClient) return;
  client ||= window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'ojjuda-popularity-api'}});
  attempted=Date.now();pending=(async()=>{
   try {
    const {data,error}=await client.rpc('arcade_popularity').abortSignal(AbortSignal.timeout(10000));
    if (error || !Array.isArray(data?.games) || !Number.isFinite(Date.parse(data.generated_at))) throw Error('unavailable');
    counts=new Map(data.games.filter(row=>typeof row.game==='string'&&Number.isSafeInteger(row.plays)&&row.plays>=0).map(row=>[canonical(row.game),row.plays]));
    received=Date.now();serverTime=Date.parse(data.generated_at);apply();
   } catch { if (received && Date.now()-received>3*ttl) { counts.clear();apply(); } }
   finally { pending=null; }
  })(); return pending;
 }
 window.OjjudaArcadePromotions=Object.freeze({refresh});
 function start() {
  new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.target.matches?.('.gbtn'))){schedule();if(!received)void refresh();}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
  apply();void refresh();
  setInterval(()=>{if(!document.hidden){apply();void refresh();}},60000);
 }
 addEventListener('ojjuda:game-record-saved',()=>void refresh(true));
 addEventListener('online',()=>void refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){apply();void refresh();}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

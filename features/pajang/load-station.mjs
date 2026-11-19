import {call,client,sameMember,showGate} from './member.mjs?v=20261119-guest-account1';

// Each protected read uses the current member token. No member data is stored between pages.
export async function prepareProgram(db,ready){
  const {data:manifest,error}=await db.functions.invoke('pajang-assets');
  if(error||!manifest?.files?.['station.js'])throw Error('missing_program');
  // A first-time participant needs only the question until they choose to enter.
  if(ready)await ready;
  const bucket=db.storage.from(manifest.bucket),hash=manifest.files['station.js'];
  const {data,error:downloadError}=await bucket.download([hash,'station.js'].join('/'));
  if(downloadError||!data)throw Error('missing_program');
  return {bucket,files:manifest.files,bytes:await verifiedBytes(data,hash)};
}

async function verifiedBytes(data,hash){
  const bytes=await data.arrayBuffer();
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(fingerprint!==hash)throw Error('release_unavailable');
  return bytes;
}

function startFeed(db,station){
    const controller=new AbortController();
    const scope=JSON.stringify([station.me.id,station.day,station.slot]);
    const query=db.rpc('pajang_discovery_feed',{p_cursor:null,p_interest:'all',p_order:'latest',p_gender:'all'});
    const response=Promise.resolve(query.abortSignal(controller.signal)).catch(error=>({error}));
    const expires=Math.min(Date.now()+15000,Date.parse(station.nextAt));
    function clear(){
      controller.abort();delete window.pajangTakeOpeningFeed;
      document.removeEventListener('visibilitychange',onHidden);
      window.removeEventListener('pagehide',clear);
      clearTimeout(timer);
    }
    function onHidden(){if(document.hidden)clear();}
    const timer=setTimeout(clear,Math.max(0,expires-Date.now()));
    document.addEventListener('visibilitychange',onHidden);
    window.addEventListener('pagehide',clear,{once:true});
    window.pajangTakeOpeningFeed=(key,signal)=>{
      if(key!==scope||document.hidden||Date.now()>=expires){clear();return;}
      delete window.pajangTakeOpeningFeed;
      signal.addEventListener('abort',clear,{once:true});
      return response.finally(()=>{signal.removeEventListener('abort',clear);clear();});
    };
    return clear;
}

export async function mountStation(beforeMount,savedStation,prepared,destination=location.href){
  const urls=new Set();
  let closed=false;
  function dispose(){
    closed=true;
    for(const url of urls)URL.revokeObjectURL(url);
    urls.clear();
  }
  async function download(bucket,name,hash){
    const {data,error}=await bucket.download(hash+'/'+name);
    if(error)throw error;
    const bytes=await verifiedBytes(data,hash);
    if(closed)throw Error('release_unavailable');
    const url=URL.createObjectURL(new Blob([bytes],{type:name==='station.js'?'text/javascript':'image/webp'}));
    urls.add(url);
    return url;
  }
  let cancelFeed=()=>{};
  try{
    const db=await client();
    const params=new URL(destination,location.href).searchParams;
    const stationRequest=Promise.resolve(savedStation??call('state')).then(async station=>{
      if(closed||!station?.authenticated||!station.me||!await sameMember(db)||closed)throw Error('signed_out');
      const tab=params.get('tab');
      if(!document.hidden && !params.get('chat') && !params.get('view') && (!tab||tab==='today')){
        cancelFeed=startFeed(db,station);
      }
      return station;
    });
    const [release,station]=await Promise.all([prepared??prepareProgram(db),stationRequest]);
    if(!station?.authenticated||!await sameMember(db))throw Error('signed_out');
    const script=URL.createObjectURL(new Blob([release.bytes],{type:'text/javascript'}));
    urls.add(script);
    if (beforeMount) await beforeMount();
    window.pajangArt={};
    const pending=new Map();
    window.pajangLoadArt=key=>{
      const name=key+'.webp',hash=release.files[name];
      if(closed||!hash)return Promise.resolve();
      if(window.pajangArt[key])return Promise.resolve(window.pajangArt[key]);
      if(!pending.has(key)){
        const load=download(release.bucket,name,hash).then(url=>{
          window.pajangArt[key]=url;
          return url;
        }).catch(()=>undefined).finally(()=>pending.delete(key));
        pending.set(key,load);
      }
      return pending.get(key);
    };
    window.pajangState=station;
    await import(script);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const welcome=document.getElementById('welcome');
    if(welcome)welcome.hidden=true;
    document.getElementById('gate').hidden=true;
    const root=document.getElementById('station');
    root.hidden=false;
    requestAnimationFrame(()=>{
      const answers=location.hash==='#answers' ? document.getElementById('answers') : null;
      if(answers)answers.scrollIntoView({block:'start'});
      if(welcome){
        const heading=answers?.querySelector('h2') || root.querySelector('main h1');
        if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
      }
    });
    window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();},{once:true});

  }catch{
    closed=true;cancelFeed();dispose();
    showGate('파장 메인을 불러오지 못했어요. 저장한 답변은 그대로예요.');
    const retry=document.createElement('button');retry.textContent='다시 열기';retry.onclick=()=>location.reload();
    document.getElementById('gate').append(' ',retry);
  }
}

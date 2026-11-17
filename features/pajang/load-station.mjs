import {call,client,showGate} from './member.mjs?v=3';

export async function mountStation(beforeMount){
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
    const bytes=await data.arrayBuffer();
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(fingerprint!==hash||closed)throw Error('release_unavailable');
    const url=URL.createObjectURL(new Blob([bytes],{type:name==='station.js'?'text/javascript':'image/webp'}));
    urls.add(url);
    return url;
  }
  async function loadProgram(db){
    const {data:manifest,error}=await db.functions.invoke('pajang-assets');
    if(error||!manifest?.files?.['station.js'])throw Error('missing_program');
    const bucket=db.storage.from(manifest.bucket);
    const script=await download(bucket,'station.js',manifest.files['station.js']);
    return {script,bucket,files:manifest.files};
  }
  try{
    const db=await client();
    const [release,station]=await Promise.all([loadProgram(db),call('state')]);
    const {data:{user}}=await db.auth.getUser();
    if(!user||user.is_anonymous)throw Error('signed_out');
    if (beforeMount) await beforeMount();
    window.pajangArt={};
    window.pajangState=station;
    await import(release.script);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const welcome=document.getElementById('welcome');
    if(welcome)welcome.hidden=true;
    document.getElementById('gate').hidden=true;
    document.getElementById('station').hidden=false;
    window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();},{once:true});
    for(const [name,hash] of Object.entries(release.files)){
      if(!name.endsWith('.webp'))continue;
      download(release.bucket,name,hash).then(url=>{
        if(closed)return;
        window.pajangArt[name.slice(0,-5)]=url;
        window.dispatchEvent(new Event('pajang-art-ready'));
      }).catch(()=>{/* An optional image can be unavailable while the feed is in use. */});
    }
  }catch{
    dispose();
    showGate('파장 메인을 불러오지 못했어요. 저장한 답변은 그대로예요.');
    const retry=document.createElement('button');retry.textContent='다시 열기';retry.onclick=()=>location.reload();
    document.getElementById('gate').append(' ',retry);
  }
}

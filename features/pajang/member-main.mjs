import {call,client,requireMember,showGate} from './member.mjs?v=3';
const entry=await requireMember();
if(entry && !entry.joined)location.replace('./');
if(entry?.joined){
  const urls=[];
  try{
    const db=await client();
    const [{data:manifest,error},station]=await Promise.all([
      db.functions.invoke('pajang-assets'),call('state')
    ]);
    if(error||!manifest?.files)throw Error('release_unavailable');
    const bucket=db.storage.from(manifest.bucket);
    const images={};
    const program=await Promise.all(Object.entries(manifest.files).map(async([name,hash])=>{
      const {data,error}=await bucket.download(hash+'/'+name);
      if(error)throw error;
      const bytes=await data.arrayBuffer();
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      if(fingerprint!==hash)throw Error('release_mismatch');
      const url=URL.createObjectURL(new Blob([bytes],{type:name==='station.js'?'text/javascript':'image/webp'}));urls.push(url);
      if(name==='station.js')return url;
      images[name.replace(/\.webp$/,'')]=url;
    }));
    const script=program.find(Boolean);
    if(!script)throw Error('missing_program');
    window.pajangArt=images;window.pajangState=station;
    if(!(await db.auth.getUser()).data.user)throw Error('signed_out');
    document.getElementById('gate').hidden=true;document.getElementById('station').hidden=false;
    await import(script);
  }catch{
    for(const url of urls)URL.revokeObjectURL(url);
    showGate('파장 메인을 불러오지 못했어요. 저장한 답변은 그대로예요.');
    const retry=document.createElement('button');retry.textContent='다시 열기';retry.onclick=()=>location.reload();
    document.getElementById('gate').append(' ',retry);
  }
}

// Resample continuously across G2 audio packets; do not reset the phase per packet.
export function upsampleG2() {
  let previous=0,count=0,next=0;
  return bytes=>{
    const input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const out=new Uint8Array((Math.ceil(bytes.byteLength*.75)+2)*2);
    const view=new DataView(out.buffer);let pos=0;
    for(let i=0;i<bytes.byteLength;i+=2) {
      const sample=input.getInt16(i,true);
      // Input times are multiples of 3, output times multiples of 2.
      while(next<=count*3) {
        const mix=count ? (next-(count-1)*3)/3 : 1;
        view.setInt16(pos,Math.round(previous+(sample-previous)*mix),true);pos+=2;next+=2;
      }
      previous=sample;count++;
    }
    return btoa(String.fromCharCode(...out.subarray(0,pos)));
  };
}

export function liveRelay({client,connect,claim,answer}) {
  let phase='auth',provider,history=[],total=0,draft='',idle,captionTimer;
  const resample=upsampleG2(),abort=new AbortController();
  client.binaryType='arraybuffer';
  const send=data=>{if(client.readyState===1)client.send(JSON.stringify(data));};
  const timeout=ms=>{clearTimeout(idle);idle=setTimeout(()=>fail('timeout'),ms);};
  const hard=setTimeout(()=>fail('timeout'),140000);
  function close(){
    if(phase==='closed')return;phase='closed';
    clearTimeout(idle);clearTimeout(hard);clearTimeout(captionTimer);abort.abort();
    try{provider?.close();}catch{}try{client.close();}catch{}
  }
  function fail(code){if(phase==='closed')return;try{send({type:'error',code});}finally{close();}}
  function upstream(event){provider.send(JSON.stringify(event));}
  function caption(){
    captionTimer=null;
    if(phase==='audio'||phase==='commit') send({type:'caption',text:draft});
  }
  async function providerEvent(raw) {
    if(phase==='closed'||phase==='answer')return;
    const e=JSON.parse(raw);
    if(e.type==='error'||e.type==='conversation.item.input_audio_transcription.failed'){fail('provider');return;}
    if(e.type==='session.updated' && phase==='setup'){
      phase='audio';timeout(16000);send({type:'ready'});return;
    }
    if(e.type==='conversation.item.input_audio_transcription.delta' && typeof e.delta==='string'){
      draft=(draft+e.delta).slice(0,5000);
      if(!captionTimer) captionTimer=setTimeout(caption,100);
    }
    if(e.type==='conversation.item.input_audio_transcription.completed' && phase==='commit'){
      const question=e.transcript?.trim().slice(0,5000);
      if(!question){fail('silent');return;}
      phase='answer';clearTimeout(captionTimer);timeout(29000);
      send({type:'question',text:question});provider.close();
      const result=await answer(question,history,abort.signal);
      if(phase==='closed')return;
      if(!result){fail('provider');return;}
      send({type:'answer',question,answer:result});close();
    }
  }
  async function message(raw) {
    if(phase==='closed')return;
    if(raw instanceof ArrayBuffer){
      if(phase!=='audio'||!raw.byteLength||raw.byteLength%2||raw.byteLength>16384||
          (total+=raw.byteLength)>90*32000 || provider.bufferedAmount>512000){fail('input');return;}
      timeout(14000);upstream({type:'input_audio_buffer.append',audio:resample(new Uint8Array(raw))});return;
    }
    if(typeof raw!=='string'||raw.length>17000){fail('input');return;}
    const msg=JSON.parse(raw);
    if(phase==='auth' && msg.type==='start'){
      if(typeof msg.token!=='string'||!/^[a-f0-9]{64}$/.test(msg.token)){fail('pair');return;}
      history=msg.history??[];
      if(!Array.isArray(history)||history.length>3||history.some(t=>!t||typeof t.question!=='string'||t.question.length>5000||typeof t.answer!=='string'||t.answer.length>500)){fail('input');return;}
      phase='setup';timeout(14000);
      const access=await claim(msg.token);
      if(phase==='closed')return;
      if(access!=='ok'){fail(access==='pair'?'pair':'limit');return;}
      provider=connect();
      provider.onopen=()=>{if(phase==='setup')upstream({type:'session.update',session:{type:'transcription',audio:{input:{
        format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-live-transcribe'},turn_detection:null}}}});};
      provider.onmessage=e=>{void providerEvent(e.data).catch(()=>fail('provider'));};
      provider.onerror=()=>{if(phase!=='answer')fail('provider');};
      provider.onclose=()=>{if(phase!=='answer')fail('provider');};
      return;
    }
    if(msg.type==='finish' && phase==='audio'){
      if(total<3200){fail('silent');return;}
      phase='commit';timeout(22000);upstream({type:'input_audio_buffer.commit'});return;
    }
    fail('input');
  }
  timeout(7000);
  client.onmessage=e=>{void message(e.data).catch(()=>fail('network'));};
  client.onclose=close;client.onerror=close;
}

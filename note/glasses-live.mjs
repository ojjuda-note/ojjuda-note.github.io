// G2 audio is mono, little-endian 16-bit PCM at 16 kHz.
export function speechBoundary() {
  let floor=60, voiced=0, quiet=0, started=false, sum=0, samples=0;
  return {push(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let i=0;i+1<bytes.length;i+=2) {
      const sample=view.getInt16(i,true);
      sum+=sample*sample;
      if(++samples!==320) continue;
      const rms=Math.sqrt(sum/samples);sum=0;samples=0;
      const speech=rms>Math.max(125,floor*2.6);
      if(!speech) floor=Math.max(30,Math.min(1000,floor*.94+rms*.06));
      if(speech) {voiced+=20;quiet=0;if(voiced>=100) started=true;}
      else {quiet+=20;if(quiet>=120) voiced=0;}
    }
    return {started,ended:started && quiet>=1800};
  }};
}

// The socket relays only this turn. Buffer the start of speech while it authenticates.
export function openLiveTurn({url,token,history,onText,onFinal,onAnswer,onError,Socket=WebSocket}) {
  const socket=new Socket(url);
  let ready=false,ending=false,done=false,queued=[],queuedBytes=0;
  function close() {
    done=true;queued=[];queuedBytes=0;
    try {socket.close();} catch {}
  }
  function fail(code='network') {if(done)return;close();onError(code);}
  function sendAudio(piece) {
    if(socket.bufferedAmount>512000) {fail();return;}
    socket.send(piece);
  }
  socket.onopen=()=>{if(!done) socket.send(JSON.stringify({type:'start',token,history}));};
  socket.onerror=()=>fail();
  socket.onclose=()=>fail();
  socket.onmessage=event=>{
    if(done) return;
    try {
      const msg=JSON.parse(event.data);
      if(msg.type==='ready' && !ready) {
        ready=true;
        for(const piece of queued) {if(done)return;sendAudio(piece);}
        queued=[];queuedBytes=0;
        if(ending && !done) socket.send('{"type":"finish"}');
      } else if(msg.type==='caption' && typeof msg.text==='string') onText(msg.text);
      else if(msg.type==='question' && typeof msg.text==='string') onFinal(msg.text);
      else if(msg.type==='answer' && typeof msg.answer==='string' && typeof msg.question==='string') {
        close();onAnswer({question:msg.question,answer:msg.answer});
      } else if(msg.type==='error') fail(msg.code);
    } catch {fail();}
  };
  return {audio(bytes) {
    if(done || ending) return;
    for(let i=0;i<bytes.length;i+=16384) {
      const piece=bytes.subarray(i,i+16384);
      if(ready) {try{sendAudio(piece);}catch{fail();}if(done)return;}
      else {queuedBytes+=piece.length;if(queuedBytes>480000){fail();return;}queued.push(piece.slice());}
    }
  },finish() {
    if(done||ending)return;ending=true;
    if(ready) {try{socket.send('{"type":"finish"}');}catch{fail();}}
  },close};
}

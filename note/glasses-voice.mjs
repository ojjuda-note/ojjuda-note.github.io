// The Even SDK supplies mono 16-bit PCM at 16 kHz. Keep at most one short question.
const maxBytes = 15 * 32000;
const errors = {
  pair:'휴대폰에서 공원 계정을 연결해 주세요.', code:'연결 코드를 다시 확인해 주세요.',
  limit:'사용 한도에 도달했어요. 나중에 다시 시도해 주세요.',
  silent:'목소리를 듣지 못했어요. 다시 말해 주세요.',
  provider:'GPT에 연결하지 못했어요. 다시 시도해 주세요.'
};
function toBase64(parts) {
  let binary = '';
  for (const part of parts) {
    for (let i=0; i<part.length; i+=8192) binary+=String.fromCharCode(...part.subarray(i,i+8192));
  }
  return btoa(binary);
}

export function createG2Voice({microphone, request, changed, forgetToken}) {
  let token='', phase='idle', message='', page=0, history=[], current=null, sequence=0;
  let micWork=Promise.resolve(), controller=null, timer=null;
  // Serialize on/off, including a release before the host acknowledges opening.
  function setMic(on) {
    micWork=micWork.catch(()=>{}).then(()=>microphone(on));
    return micWork;
  }
  function update(next,text='') { phase=next;message=text;page=0;changed(); }
  function reset() {
    ++sequence;
    clearTimeout(timer); controller?.abort(); controller=null;
    if(current) { current=null;void setMic(false).catch(()=>{}); }
    history=[]; update('idle');
  }
  function setToken(value) { reset(); token=value || ''; }
  async function start() {
    if(current || phase==='sending') return;
    if(!token) { update('pair',errors.pair);return; }
    const run=++sequence;
    current={parts:[],bytes:0,peak:0};
    update('starting','마이크 켜는 중…');
    timer=setTimeout(()=>{if(run===sequence) void finish();},15000);
    try {
      if(await setMic(true)!==true) throw Error();
      if(run===sequence && current) update('listening','듣는 중…');
    } catch {
      if(run!==sequence) return;
      clearTimeout(timer);current=null;void setMic(false).catch(()=>{});
      update('error','Even 앱에서 안경 마이크 권한을 확인해 주세요.');
    }
  }
  function audio(bytes) {
    if(!current || !bytes?.byteLength) return;
    const piece=new Uint8Array(bytes.buffer,bytes.byteOffset,Math.min(bytes.byteLength,maxBytes-current.bytes));
    if(!piece.length) return;
    const view=new DataView(piece.buffer,piece.byteOffset,piece.byteLength);
    for(let i=0;i+1<piece.length;i+=2) current.peak=Math.max(current.peak,Math.abs(view.getInt16(i,true)));
    current.parts.push(piece.slice());current.bytes+=piece.length;
    if(current.bytes===maxBytes) void finish();
  }
  async function finish() {
    if(!current) return;
    const capture=current, run=++sequence;
    current=null;clearTimeout(timer);
    const close=setMic(false).catch(()=>{});
    if(capture.bytes<8000 || capture.peak<32) { update('error',errors.silent);return; }
    update('sending','GPT가 답하는 중…');
    const abort=new AbortController();controller=abort;
    const deadline=setTimeout(()=>abort.abort(),37000);
    try {
      const result=await request({pcm:toBase64(capture.parts),history},token,abort.signal);
      if(run!==sequence) return;
      if(typeof result.answer!=='string' || typeof result.question!=='string') throw Error('provider');
      history=[...history,result].slice(-3);
      update('answer',result.answer);
    } catch(error) {
      if(run!==sequence) return;
      if(error.message==='pair') {token='';history=[];forgetToken();}
      update(error.message==='pair'?'pair':'error',errors[error.message] || '연결을 확인하고 다시 말해 주세요.');
    } finally {
      clearTimeout(deadline); if(controller===abort) controller=null;
      await close;
    }
  }
  function screen() {
    if(phase!=='answer') return message && 'GPT\n'+message;
    const chars=Array.from(message),size=42,count=Math.max(1,Math.ceil(chars.length/size));
    return 'GPT '+(count>1?(page+1)+'/'+count+' · ':'')+'탭 닫기\n'+chars.slice(page*size,(page+1)*size).join('');
  }
  function scroll(direction) {
    if(phase!=='answer') return false;
    page=Math.max(0,Math.min(Math.ceil(Array.from(message).length/42)-1,page+direction));changed();return true;
  }
  function dismiss() {
    if(phase==='answer'||phase==='error'||phase==='pair') {update('idle');return true;}
    return false;
  }
  return {start,finish,audio,reset,setToken,scroll,dismiss,screen,
    toggle:()=>current?finish():start(),
    get phase(){return phase;},get message(){return message;},get paired(){return !!token;}};
}

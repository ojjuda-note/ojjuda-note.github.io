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

// Older servers and phone WebViews can still deliver an ordinary or buffered response.
export async function readVoiceReply(response,onQuestion) {
  if(!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const data=await response.json();
    if(!response.ok) throw Error(data.error || 'unavailable');
    return data;
  }
  let question,answer,buffer='';
  function event(line) {
    if(!line.trim()) return;
    const item=JSON.parse(line);
    if(item.error) throw Error(item.error);
    if(typeof item.question==='string' && !question) {question=item.question;onQuestion?.(question);}
    if(typeof item.answer==='string') answer=item.answer;
  }
  if(response.body?.getReader) {
    const reader=response.body.getReader(),decoder=new TextDecoder();
    try {
      while(true) {
        const {value,done}=await reader.read();
        if(done) break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');
        buffer=lines.pop();
        for(const line of lines) event(line);
      }
      event(buffer+decoder.decode());
    } finally {reader.releaseLock();}
  } else {
    for(const line of (await response.text()).split('\n')) event(line);
  }
  if(!answer || !question) throw Error('provider');
  return {question,answer};
}

function conversationPages(question,reply) {
  const lines=[];
  for(const [label,text] of [['내 질문',question],['GPT',reply]]) {
    const chars=Array.from(label+' · '+text.replace(/\s+/g,' ').trim());
    for(let i=0;i<chars.length;i+=12) lines.push(chars.slice(i,i+12).join(''));
  }
  const pages=[];
  for(let i=0;i<lines.length;i+=4) pages.push(lines.slice(i,i+4).join('\n'));
  return pages;
}

export function createG2Voice({microphone, request, changed, forgetToken}) {
  let token='', phase='idle', message='', page=0, history=[], current=null, sequence=0;
  let question='', pages=[];
  let micWork=Promise.resolve(), controller=null, timer=null;
  // Serialize on/off, including a release before the host acknowledges opening.
  function setMic(on) {
    micWork=micWork.catch(()=>{}).then(()=>microphone(on));
    return micWork;
  }
  function update(next,text='') {
    phase=next;message=text;pages=question?conversationPages(question,text):[];
    page=Math.min(page,Math.max(0,pages.length-1));changed();
  }
  function reset() {
    ++sequence;
    clearTimeout(timer); controller?.abort(); controller=null;
    if(current) { current=null;void setMic(false).catch(()=>{}); }
    history=[]; question='';update('idle');
  }
  function setToken(value) { reset(); token=value || ''; }
  async function start() {
    if(current || phase==='sending') return;
    question='';
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
    update('sending','질문을 글로 바꾸는 중…');
    const abort=new AbortController();controller=abort;
    const deadline=setTimeout(()=>abort.abort(),37000);
    try {
      const result=await request({pcm:toBase64(capture.parts),history},token,abort.signal,text=>{
        if(run!==sequence || !text) return;
        question=text;update('sending','답변 작성 중…');
      });
      if(run!==sequence) return;
      if(typeof result.answer!=='string' || typeof result.question!=='string') throw Error('provider');
      question=result.question;
      history=[...history,result].slice(-3);
      update('answer',result.answer);
    } catch(error) {
      if(run!==sequence) return;
      if(error.message==='pair') {token='';history=[];question='';forgetToken();}
      update(error.message==='pair'?'pair':'error',errors[error.message] || '연결을 확인하고 다시 말해 주세요.');
    } finally {
      clearTimeout(deadline); if(controller===abort) controller=null;
      await close;
    }
  }
  function screen() {
    if(!pages.length) return message && 'GPT\n'+message;
    return (pages.length>1 ? (page+1)+'/'+pages.length+' ↕\n' : '')+pages[page];
  }
  function scroll(direction) {
    if(!pages.length) return false;
    page=Math.max(0,Math.min(pages.length-1,page+direction));changed();return true;
  }
  function dismiss() {
    if(phase==='answer'||phase==='error'||phase==='pair') {question='';update('idle');return true;}
    return false;
  }
  return {start,finish,audio,reset,setToken,scroll,dismiss,screen,
    toggle:()=>current?finish():start(),
    get phase(){return phase;},get message(){return message;},get question(){return question;},get paired(){return !!token;}};
}

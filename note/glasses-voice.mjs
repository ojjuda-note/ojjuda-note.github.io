import {speechBoundary} from './glasses-live.mjs?v=20261126-live1';

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

const errors={
  pair:'휴대폰에서 공원 계정을 연결해 주세요.',limit:'오늘의 질문 한도에 도달했어요.',
  silent:'목소리를 듣지 못했어요. 다시 질문해 주세요.',mic:'안경 마이크 연결과 권한을 확인해 주세요.',
  provider:'실시간 음성 인식에 연결하지 못했어요. 다시 질문해 주세요.',
  timeout:'음성 연결이 늦어졌어요. 다시 질문해 주세요.',network:'음성 연결이 끊겼어요. 다시 질문해 주세요.'
};

export function createG2Voice({microphone,openTurn,changed,forgetToken}) {
  let token='',history=[],turn=null,phase='idle',message='',question='',page=0,pages=[];
  let micWork=Promise.resolve();
  const setMic=on=>micWork=micWork.catch(()=>{}).then(()=>microphone(on));
  function update(next,text) {
    phase=next;message=text;
    pages=question && phase!=='listening'?conversationPages(question,message):[];
    page=Math.min(page,Math.max(0,pages.length-1));changed();
  }
  function stopMic(t) {
    clearTimeout(t.timer);clearTimeout(t.gap);
    if(t.listening){t.listening=false;void setMic(false).catch(()=>{});}
  }
  function dispose() {
    const t=turn;turn=null;
    if(t){stopMic(t);t.link?.close();}
  }
  function reset(){dispose();history=[];question='';update('idle','');}
  function fail(t,code) {
    if(turn!==t)return;
    dispose();
    if(code==='pair'){token='';question='';history=[];forgetToken();}
    update(code==='pair'?'pair':'error',errors[code]||errors.network);
  }
  function finish() {
    const t=turn;
    if(!t?.listening)return;
    stopMic(t);
    if(!t.link){fail(t,'silent');return;}
    update('sending','질문 마무리 중…');t.link.finish();
    if(turn===t)t.timer=setTimeout(()=>fail(t,'timeout'),50000);
  }
  async function start() {
    if(turn)return;
    question='';page=0;
    if(!token){update('pair',errors.pair);return;}
    const t={listening:true,detector:speechBoundary(),pre:[],preBytes:0,bytes:0,link:null};
    turn=t;update('starting','마이크 켜는 중…');
    t.timer=setTimeout(()=>fail(t,'silent'),10000);
    try {
      if(await setMic(true)!==true)throw Error();
      if(turn===t && t.listening && phase==='starting')update('listening','듣는 중…');
    }catch{fail(t,'mic');}
  }
  function audio(bytes) {
    const t=turn;
    if(!t?.listening || !bytes?.byteLength)return;
    const length=Math.min(bytes.byteLength-(bytes.byteLength%2),90*32000-t.bytes);
    if(length<=0){finish();return;}
    const piece=new Uint8Array(bytes.buffer,bytes.byteOffset,length);
    t.bytes+=length;
    const {started,ended}=t.detector.push(piece);
    if(!t.link){
      t.pre.push(piece.slice());t.preBytes+=length;
      while(t.pre.length>1 && t.preBytes-t.pre[0].length>=24000)t.preBytes-=t.pre.shift().length;
      if(!started)return;
      clearTimeout(t.timer);
      t.timer=setTimeout(finish,90000);
      try{
        t.link=openTurn({token,history,
          onText:text=>{if(turn===t){question=text;update(t.listening?'listening':'sending',t.listening?'듣는 중…':'질문 마무리 중…');}},
          onFinal:text=>{if(turn===t){question=text;page=0;update('sending','답변 작성 중…');}},
          onAnswer:result=>{
            if(turn!==t)return;
            dispose();question=result.question;history=[...history,result].slice(-3);page=0;update('answer',result.answer);
          },onError:code=>fail(t,code)});
        for(const pre of t.pre)t.link.audio(pre);
        t.pre=[];
      }catch{fail(t,'network');return;}
    }else t.link.audio(piece);
    if(turn!==t)return;
    clearTimeout(t.gap);
    if(ended||t.bytes===90*32000){finish();return;}
    // Some hosts stop delivering silent frames after speech.
    t.gap=setTimeout(finish,2800);
  }
  function screen() {
    if(phase==='listening'&&question) {
      const chars=Array.from(question.replace(/\s+/g,' ')).slice(-48),lines=[];
      for(let i=0;i<chars.length;i+=12)lines.push(chars.slice(i,i+12).join(''));
      return '내 질문 · 듣는 중\n'+lines.join('\n');
    }
    if(!pages.length)return message && 'GPT\n'+message;
    return (pages.length>1?(page+1)+'/'+pages.length+' ↕\n':'')+pages[page];
  }
  function scroll(direction) {
    if(turn?.listening)return true;
    if(!pages.length)return false;
    page=Math.max(0,Math.min(pages.length-1,page+direction));changed();return true;
  }
  function dismiss(){
    if(!['answer','error','pair'].includes(phase))return false;
    question='';update('idle','');return true;
  }
  return {start,finish,audio,reset,scroll,dismiss,screen,setToken(value){token=value||'';reset();},
    toggle:()=>turn?.listening?finish():start(),
    get phase(){return phase;},get message(){return message;},get question(){return question;},get paired(){return !!token;}};
}

const maxBytes = 16 * 32000;
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'apikey, authorization, x-park-device, content-type, x-client-info',
  'Cache-Control':'no-store'};
const json = (status,body) => Response.json(body,{status,headers:cors});
async function readBody(req) {
  const limit = Math.ceil(maxBytes / 3) * 4 + 12000;
  if (Number(req.headers.get('content-length')) > limit || !req.body) return null;
  const reader = req.body.getReader(), chunks = [];
  let total = 0;
  while (true) {
    const {value,done} = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks).text());
}
function wave(pcm) {
  const header = new Uint8Array(44), view = new DataView(header.buffer);
  const tag = (i,s) => { for (const c of s) header[i++]=c.charCodeAt(0); };
  tag(0,'RIFF'); view.setUint32(4,pcm.length+36,true); tag(8,'WAVE'); tag(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true);
  view.setUint16(34,16,true); tag(36,'data'); view.setUint32(40,pcm.length,true);
  return new Blob([header,pcm],{type:'audio/wav'});
}
export function makeHandler({rpc,openaiKey,send}) {
  return async req => {
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(req.method!=='POST') return json(405,{error:'method'});
    let body;
    try { body=await readBody(req); } catch { return json(400,{error:'input'}); }
    if(!body || typeof body!=='object') return json(400,{error:'input'});
    try {
      if(body.action==='complete-link') {
        const proof=req.headers.get('x-park-device');
        if(!/^[a-f0-9]{64}$/.test(proof || '') || !Number.isSafeInteger(body.until)) return json(400,{error:'input'});
        const linked=await rpc('park_g2_voice_complete',{p_proof:proof,p_until:body.until});
        return json(200,{linked:linked===true});
      }
      if(!openaiKey) return json(503,{error:'setup'});
      if(body.action==='pair') {
        if(typeof body.code!=='string' || !/^[A-F0-9]{12}$/.test(body.code)) return json(400,{error:'code'});
        const token=await rpc('park_g2_voice_redeem',{p_code:body.code});
        return token ? json(200,{token}) : json(401,{error:'code'});
      }
      const token=req.headers.get('x-park-device');
      if(!/^[a-f0-9]{64}$/.test(token || '')) return json(401,{error:'pair'});
      const {pcm,history=[]}=body;
      if(typeof pcm!=='string' || pcm.length>Math.ceil(maxBytes/3)*4 || !Array.isArray(history) || history.length>3 ||
          history.some(t=>!t || typeof t.question!=='string' || typeof t.answer!=='string' || t.question.length>500 || t.answer.length>500)) return json(400,{error:'input'});
      let samples;
      try { samples=Uint8Array.from(atob(pcm),c=>c.charCodeAt(0)); } catch { return json(400,{error:'input'}); }
      if(samples.length<8000 || samples.length>maxBytes || samples.length%2) return json(400,{error:'input'});
      const allowance=await rpc('park_g2_voice_claim',{p_token:token});
      if(allowance==='pair') return json(401,{error:'pair'});
      if(allowance!=='ok') return json(429,{error:'limit'});
      const signal=AbortSignal.any([req.signal,AbortSignal.timeout(30000)]);
      const auth={Authorization:'Bearer '+openaiKey};
      const form=new FormData();
      form.append('file',wave(samples),'question.wav');
      form.append('model','gpt-4o-mini-transcribe');
      form.append('language','ko');
      const speech=await send('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:auth,body:form,signal});
      if(!speech.ok) return json(502,{error:'provider'});
      const question=(await speech.json()).text?.trim().slice(0,500);
      if(!question) return json(422,{error:'silent'});
      const messages=[{role:'system',content:'스마트 안경 사용자와 대화합니다. 한국어로 핵심을 한두 문장, 가능하면 70자 이내의 평문으로 답하세요. 보이지 않는 카드, 위치, 주변 상황을 지어내지 마세요.'}];
      for(const turn of history) messages.push({role:'user',content:turn.question},{role:'assistant',content:turn.answer});
      messages.push({role:'user',content:question});
      async function getAnswer() {
        const response=await send('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{...auth,'Content-Type':'application/json'},signal,
          body:JSON.stringify({model:'gpt-4.1-mini',messages,max_completion_tokens:180,store:false})});
        if(!response.ok) return null;
        return (await response.json()).choices?.[0]?.message?.content?.trim().slice(0,500);
      }
      if(req.headers.get('accept')==='application/x-ndjson') {
        const encoder=new TextEncoder();
        const encode=event=>encoder.encode(JSON.stringify(event)+'\n');
        let cancelled=false;
        const stream=new ReadableStream({
          start(controller) {
            controller.enqueue(encode({question}));
            void (async()=>{
              let answer;
              try {answer=await getAnswer();} catch {}
              if(cancelled) return;
              controller.enqueue(encode(answer ? {answer} : {error:'provider'}));
              controller.close();
            })();
          },
          cancel() {cancelled=true;}
        });
        return new Response(stream,{headers:{...cors,'Content-Type':'application/x-ndjson; charset=utf-8'}});
      }
      const answer=await getAnswer();
      return answer ? json(200,{question,answer}) : json(502,{error:'provider'});
    } catch { return json(503,{error:'unavailable'}); }
  };
}

import ProviderSocket from 'npm:ws@8.18.3';
import {makeHandler,answerQuestion} from './handler.mjs';
import {liveRelay} from './live.mjs';

const root = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, args: object) {
  const res = await fetch(root + '/rest/v1/rpc/' + name, {
    method:'POST', headers:{'Content-Type':'application/json',apikey:service,Authorization:'Bearer '+service},
    body:JSON.stringify(args), signal:AbortSignal.timeout(7000)
  });
  if (!res.ok) throw Error('database');
  return res.json();
}
const openaiKey=Deno.env.get('OPENAI_API_KEY');
const post=makeHandler({rpc,openaiKey,send:fetch});
Deno.serve(req=>{
  if(req.method!=='GET' || req.headers.get('upgrade')?.toLowerCase()!=='websocket')return post(req);
  const {socket,response}=Deno.upgradeWebSocket(req);
  liveRelay({client:socket,claim:(token:string)=>rpc('park_g2_voice_claim',{p_token:token}),
    connect:()=>new ProviderSocket('wss://api.openai.com/v1/realtime?intent=transcription',{
      headers:{Authorization:'Bearer '+openaiKey},handshakeTimeout:9000}),
    answer:(question:string,history:unknown[],signal:AbortSignal)=>answerQuestion({question,history,signal,openaiKey,send:fetch})});
  return response;
});

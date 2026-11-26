import {makeHandler} from './handler.mjs';

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
Deno.serve(makeHandler({rpc, openaiKey:Deno.env.get('OPENAI_API_KEY'), send:fetch}));

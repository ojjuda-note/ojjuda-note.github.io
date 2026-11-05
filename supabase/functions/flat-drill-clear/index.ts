import replay from './replay.cjs';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({ok:false},405);
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=req.headers.get('authorization');
  if(!auth)return json({ok:false},401);
  const user=await fetch(url+'/auth/v1/user',{headers:{apikey:service,Authorization:auth}});
  if(!user.ok)return json({ok:false},401);
  const {id}=await user.json();
  const input=await req.text();if(input.length>90000)return json({ok:false},413);
  let data;try{data=JSON.parse(input);}catch{return json({ok:false},400);}
  if(!data||!uuid(data.run)||!uuid(data.attempt)||!replay.verifyClear(data.stage,data.events,data.endTick))
    return json({ok:false,reason:'replay'});
  const result=await fetch(url+'/rest/v1/rpc/flat_drill_verified_clear',{method:'POST',headers:{
    apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'
  },body:JSON.stringify({p_user:id,p_stage:data.stage,p_run:data.run,p_moves:data.events.length,p_attempt:data.attempt})});
  if(!result.ok)return json({ok:false,reason:'database'},503);
  return json(await result.json());
});

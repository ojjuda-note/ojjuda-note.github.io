// Only a five-minute, one-use database-issued job token authorizes an import.
// Files must match reviewed hashes and come from the fixed Wikimedia hosts.
const base = Deno.env.get('SUPABASE_URL')!;
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const key = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const auth: Record<string,string> = {apikey:key};
if (!key.startsWith('sb_secret_')) auth.Authorization = `Bearer ${key}`;
const externalHeaders = {'User-Agent':'OjjudaMediaCuration/1.0 (https://ojjuda.kr)'};
const allowedHosts = new Set(['upload.wikimedia.org','thumb.wikimedia.org']);
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256',bytes));

async function rpc(name:string, body:unknown) {
 const r = await fetch(`${base}/rest/v1/rpc/${name}`,{
  method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(body),
  signal:AbortSignal.timeout(15000)
 });
 if(!r.ok) {
  const error=await r.json().catch(()=>({}));
  const message=String(error.message||'').replace(/[^a-z_]/gi,'').slice(0,70);
  throw new Error(`rpc_${name}_${r.status}_${message}`);
 }
 return r.json();
}
function checkUrl(raw:string) {
 const u=new URL(raw);
 if(u.protocol!=='https:' || !allowedHosts.has(u.hostname) || u.port || u.username || u.password
 || !u.pathname.startsWith('/wikipedia/commons/')) throw new Error('source_not_allowed');
 return u;
}
async function bounded(r:Response, limit:number) {
 if(!r.body) throw new Error('empty_body');
 const declared=Number(r.headers.get('content-length'));
 if(declared>limit) throw new Error('file_too_large');
 const reader=r.body.getReader(); const chunks:Uint8Array[]=[]; let total=0;
 for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;
  if(total>limit){await reader.cancel();throw new Error('file_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;
}
function validMagic(b:Uint8Array,mime:string) {
 const s=(a:number,n:number)=>new TextDecoder().decode(b.slice(a,a+n));
 return mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:
 mime==='image/png'?b[0]===137&&s(1,3)==='PNG':
 mime==='image/gif'?s(0,3)==='GIF':
 mime==='image/webp'?s(0,4)==='RIFF'&&s(8,4)==='WEBP':
 mime==='video/webm'?b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3:
 mime==='video/mp4'?s(4,4)==='ftyp':false;
}
async function download(url:string,size:number,mime:string,digest:string) {
 const r=await fetch(checkUrl(url),{headers:externalHeaders,redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!r.ok) throw new Error(`download_${r.status}`);
 const body=await bounded(r,size);
 if(body.length!==size || await sha(body)!==digest || !validMagic(body,mime)) throw new Error('content_mismatch');
 return body;
}
async function upload(path:string,body:Uint8Array,mime:string,digest:string) {
 const encoded=path.split('/').map(encodeURIComponent).join('/');
 const r=await fetch(`${base}/storage/v1/object/media/${encoded}`,{
  method:'POST',headers:{...auth,'Content-Type':mime,'x-upsert':'false','Cache-Control':'max-age=3600'},
  body,signal:AbortSignal.timeout(30000)
 });
 if(r.ok)return;
 const error=await r.json().catch(()=>({}));
 if(![400,409].includes(r.status)|| !/duplicate|already exists|resource already exists/i.test(JSON.stringify(error)))
  throw new Error(`upload_${r.status}`);
 // An uncertain previous completion may have uploaded this exact job already.
 const previous=await fetch(`${base}/storage/v1/object/authenticated/media/${encoded}`,{
  headers:auth,signal:AbortSignal.timeout(30000)
 });
 if(!previous.ok || await sha(await bounded(previous,body.length))!==digest) throw new Error('existing_file_mismatch');
}
export async function handler(req:Request) {
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=req.headers.get('X-Ojjuda-Media-Token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Unauthorized',{status:401});
 let id:string|undefined;let claimed=false;
 try {
  const input=await req.text();if(input.length>150)throw new Error('invalid_request');
  id=JSON.parse(input).id;
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('invalid_request');
  const j=await rpc('auto_house_media_claim',{p_id:id,p_token:token});
  if(!j)return new Response('Unauthorized',{status:403});
  claimed=true;
  const file=await download(j.download_url,j.file_size,j.mime,j.content_sha256);
  const thumb=await download(j.thumb_url,j.thumb_size,j.thumb_mime,j.thumb_sha256);
  await upload(j.path,file,j.mime,j.content_sha256);
  await upload(j.thumb_path,thumb,j.thumb_mime,j.thumb_sha256);
  const result=await rpc('auto_house_media_complete',{p_id:id,p_token:token});
  return Response.json(result);
 } catch(error) {
  const code=error instanceof Error?error.message.slice(0,100):'import_failed';
  if(claimed&&id)await rpc('auto_house_media_fail',{p_id:id,p_token:token,p_error:code}).catch(()=>{});
  console.error('auto-house-media',id||'invalid',code);
  return Response.json({status:'failed',error:code},{status:500});
 }
}
Deno.serve(handler);

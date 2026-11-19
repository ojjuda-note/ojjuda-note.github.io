const files: Record<string,string> = {
  "coffee.webp": "9b5ae2c3ad00a1560ac7910db7f4954d52d7134651704fbf760148c504fab078",
  "tennis.webp": "b08bba061750c39a8f9f2ee5910b239bf7e2d95d1fbed0f7709ae771c1875b53",
  "walk.webp": "47bc50f315c0dcf65cdccb6e2af76b120c134d8d8e55034f8511efa633f27266",
  "book.webp": "2a76a993ac3a690eb73a17ee79d4180863ba20c991dd34459abc333d90a6b95a",
  "vinyl.webp": "dfe33b7665d0ecbf952d2004710940635e4879f589ae4680ef85ac6109a23d77",
  "station.js": "b10e5832f2e930a6d632f6c6d8af4ea6b0f88ceabc1ebb120308059484648d15",
  "camera.webp": "b686b71a0517be69e02f61a3028d18e2f406a1087dcebc060d588bcae3df046d"
};
const bucket='pajang-member-assets';
const cors={'Access-Control-Allow-Origin':'https://ojjuda.kr','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Cache-Control':'private, no-store','Vary':'Origin'};
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const base=Deno.env.get('SUPABASE_URL')!;
  if(!['GET','POST'].includes(req.method))return respond({},405);
  const authorization=req.headers.get('Authorization');
  if(!authorization)return respond({},401);
  const auth=await fetch(base+'/rest/v1/rpc/pajang_art_allowed',{method:'POST',headers:{'Authorization':authorization,'apikey':Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json'},body:'{}'});
  if(!auth.ok||await auth.json()!==true)return respond({},403);
  return respond({bucket, files});
});

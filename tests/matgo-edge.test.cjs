const assert=require('node:assert/strict');
(async()=>{
 const {createHandler}=await import('../supabase/functions/matgo/handler.mjs');
 const calls=[],actor='00000000-0000-4000-8000-000000000001';let authValid=true;
 const handler=createHandler({env:name=>({SUPABASE_URL:'https://supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'secret-server-key',SUPABASE_ANON_KEY:'public'})[name],fetchImpl:async(url,options)=>{
   calls.push({url,...options});
   if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:actor}),{status:authValid?200:401});
   return new Response(JSON.stringify({ok:true,gold:5000,coins:15,free_left:0}));
 }});
 const request=(body,authorization='Bearer user-session')=>handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization,origin:'https://ojjuda.kr'},body:JSON.stringify(body)}));
 let response=await request({action:'refill',user_id:'forged',amount:9999,price:0,paid:true,request_id:'00000000-0000-4000-9000-000000000001'});
 assert.equal(response.status,200);const params=JSON.parse(calls.at(-1).body);
 assert.equal(params.p_actor,actor);assert.equal(params.p_action,'refill');assert.equal(params.p_paid,true);assert.equal('amount' in params,false);assert.equal('price' in params,false);
 assert.equal(JSON.stringify(await response.json()).includes('secret-server-key'),false);
 calls.length=0;authValid=false;response=await request({action:'status'});assert.equal(response.status,401);assert.equal(calls.length,1);
 response=await request({action:'status'},'');assert.equal(response.status,401);
 response=await request({action:'refill',paid:true});assert.equal(response.status,400);
 response=await request({action:'settle',round_id:'not-a-uuid',actions:[]});assert.equal(response.status,400);
 console.log('PASS: Edge live authentication, actor isolation, server-only price and amount, malformed inputs and secret protection');
})().catch(error=>{console.error(error);process.exitCode=1});

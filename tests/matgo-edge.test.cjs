const assert=require('node:assert/strict');
(async()=>{
 const {createHandler}=await import('../supabase/functions/matgo/handler.mjs');
 const calls=[],actor='00000000-0000-4000-8000-000000000001';let authValid=true,roundSnapshot=null;
 const handler=createHandler({env:name=>({SUPABASE_URL:'https://supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'secret-server-key',SUPABASE_ANON_KEY:'public'})[name],fetchImpl:async(url,options)=>{
   calls.push({url,...options});
   if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:actor}),{status:authValid?200:401});
   if(roundSnapshot&&JSON.parse(options.body).p_action==='round')return new Response(JSON.stringify({round:roundSnapshot}));
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
 authValid=true;roundSnapshot={seed:9,gold:5000,first:0,carry:1};
 const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop}=await import('../supabase/functions/matgo/engine-v1.mjs');let g;
 g=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(g,p,ids),goStop:async(p,s)=>p===1?aiGoStop(g,p,s):'stop'});g.random=seededRandom(9);g.deal();
 while(!g.over){
   const p=g.turn,card=p===1?aiChooseCard(g,p):g.hand[p][0]||null;
   const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
   const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
   if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
   await g.play(p,card,bomb);
 }
 const oldBody={action:'settle',round_id:'00000000-0000-4000-9000-000000000001',actions:g.actions};
 response=await request(oldBody);assert.equal(response.status,200,'already-open v1 clients still settle');assert.equal(JSON.parse(calls.at(-1).body).p_gold,g.bank[0]);
 response=await request({...oldBody,rules_version:2});assert.equal(response.status,409,'new rules require the chongtong decision');
 response=await request({...oldBody,actions:[{type:'chongtong',p:0,decision:'win'}],rules_version:2});
 assert.equal(response.status,200);assert.equal(JSON.parse(calls.at(-1).body).p_gold,5700,'v2 total is derived by the server');
 response=await request({...oldBody,rules_version:999});assert.equal(response.status,400);
 console.log('PASS: Edge authentication, actor isolation, fixed prices, secret protection, legacy round settlement and v2 rule selection');
})().catch(error=>{console.error(error);process.exitCode=1});

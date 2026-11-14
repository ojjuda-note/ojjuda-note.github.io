'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'fixed-submissions.js'),'utf8');
function player(owner,storage,respond){
 const events={},timers=new Map(),calls=[];let id=0,current=owner;
 const localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const window={DrinkingPromptCatalog:{king:[],fingers:[],imagevote:[]},addEventListener:(e,f)=>{events[e]=f;},OjjudaGetClient:async()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:current}}}})},rpc:async(_name,{p_action,p_options})=>{
   if(p_action==='pool')return {data:{truthFull:true,truth:{mild:[],spicy:[]}}};
   calls.push(p_options.text);return await respond(p_options.text);
  }})};
 vm.runInNewContext(source,{window,localStorage,navigator:{onLine:true},document:{getElementById:()=>({dataset:{member:owner}}),addEventListener(){}},setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i)});
 return {calls,timers,submit:text=>window.DrinkingPrompts.submit('king',text),retry:()=>events.online(),setMember:next=>{current=next;}};
}
const tick=()=>new Promise(r=>setImmediate(r));
const ok=()=>({data:{ok:true}});
(async()=>{
 const cache=new Map(),stored=text=>cache.set('oj.party.suggestions.member.'+JSON.stringify(['king','',text]),JSON.stringify({kind:'king',text}));
 stored('\u200b');stored('정상 질문');stored('둘째 질문');
 let server='offline';
 let client=player('member',cache,text=>server==='offline'?{error:{message:'Failed to fetch'}}:text==='\u200b'?{error:{message:'invalid_prompt',code:'P0001'}}:ok());
 await tick();
 assert.deepEqual(client.calls,['\u200b']);assert.equal(cache.size,3);assert.equal(client.timers.size,1);
 // Reload while offline queues exist. A different signed-in account must not consume these rows.
 const other=player('other',cache,ok);await tick();assert.deepEqual(other.calls,[]);assert.equal(cache.size,3);
 server='online';client=player('member',cache,text=>text==='\u200b'?{error:{message:'invalid_prompt',code:'P0001'}}:ok());await tick();
 assert.deepEqual(client.calls,['\u200b','정상 질문','둘째 질문']);assert.equal(cache.size,0);assert.equal(client.timers.size,0);
 client.retry();await tick();assert.equal(client.calls.length,3);
 // Don't drop valid submissions after a transport error. Retry once the server recovers.
 let available=false;
 client=player('member',cache,()=>available?ok():Promise.reject(new Error('network')));client.submit('다시 보낼 문구');await tick();
 assert.equal(cache.size,1);assert.equal(client.timers.size,1);
 client.setMember('other');client.retry();await tick();assert.equal(client.calls.length,1);assert.equal(cache.size,1);
 available=true;client.setMember('member');client.retry();await tick();assert.deepEqual(client.calls,['다시 보낼 문구','다시 보낼 문구']);assert.equal(cache.size,0);
 console.log('PASS permanent invalid entry skipped; two valid entries delivered, survives offline/reload, account isolation, network recovery and no duplicate after reconnect.');
})().catch(e=>{console.error(e);process.exitCode=1;});

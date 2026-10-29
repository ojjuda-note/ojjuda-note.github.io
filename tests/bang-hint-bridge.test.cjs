const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('hint purchases use the wallet callback, validate context and reject other frames or owners',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync(require('node:path').join(__dirname,'../world-bang-game.js'),'utf8'));
 let authorized=true;const buys=[],games=[],replies=[];
 w.OjjudaBangGame.open({owner:'user',authorized:()=>authorized,onHintBuy:async(...args)=>{buys.push(args);return {ok:true,coins:2};},client:{functions:{invoke:async(...args)=>{games.push(args);return {data:{ok:true}};}}}});
 const frame=w.document.querySelector('iframe').contentWindow;frame.postMessage=m=>replies.push(m);
 const requestId='11111111-1111-4111-8111-111111111111',room='22222222-2222-4222-8222-222222222222';
 const send=async(body,source=frame,origin=w.location.origin)=>{w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{source:'ojjuda-bang',type:'ojjuda-bang-request',requestId,body}}));await new Promise(r=>setTimeout(r,0));};
 const body={action:'hint',request_id:requestId,room_id:room,version:3};
 try{
  await send(body);assert.deepEqual(buys,[[requestId,room,3]]);assert.equal(games.length,0);assert.equal(replies[0].result.coins,2);
  await send({...body,version:-1});assert.equal(replies.at(-1).result.reason,'invalid');assert.equal(buys.length,1);
  await send(body,w);await send(body,frame,'https://other.invalid');authorized=false;await send(body);assert.equal(buys.length,1);
  authorized=true;await send({action:'read',room_id:room});assert.equal(games.length,1);
 }finally{dom.window.close();}
});

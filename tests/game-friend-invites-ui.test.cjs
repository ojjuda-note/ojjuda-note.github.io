const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<meta charset="utf-8"><button id="open">친구 초대</button>');
 await page.addStyleTag({path:path.join(__dirname,'../game-entry.css')});await page.addScriptTag({path:path.join(__dirname,'../game-entry.js')});await page.addScriptTag({path:path.join(__dirname,'../game-friend-invites.js')});
 await page.evaluate(()=>{
  window.uid='me';window.calls=[];window.inbox=[];window.prepared=[];window.cancelled=0;window.joined=null;
  window.friends=[{id:'off',nick:'가람',online:false},{id:'on',nick:'초록친구',online:true}];
  OjjudaGameFriends={list:()=>friends};
  const channel={on(){return this},subscribe(){return this}};
  window.client={auth:{onAuthStateChange(fn){window.authChanged=fn;return {data:{subscription:{unsubscribe(){}}}}}},channel:()=>channel,removeChannel(){},rpc:async(name,args)=>{calls.push(args);if(args.p_action==='accept'||args.p_action==='decline')inbox=[];return{data:args.p_action==='list'?{ok:true,invites:inbox}:args.p_action==='send'?{ok:true,id:'inv-1'}:{ok:true,kind:'ttang',code:'abcdefabcdefabcdefabcdef'}}}};
  OjjudaFriendInvites.install({client,user:()=>uid,list:()=>friends,refresh:async()=>{},onJoin:data=>{joined=data}});
  document.querySelector('#open').onclick=()=>OjjudaFriendInvites.pick({kind:'ttang',prepare:async friend=>{prepared.push(friend.id);return{code:'abcdefabcdefabcdefabcdef',cancel:()=>cancelled++}}});
 });
 await page.click('#open');await page.locator('[data-friend-pick=on]').waitFor();
 assert.equal(await page.locator('[data-friend-id]').first().getAttribute('data-friend-id'),'on');
 await page.locator('[data-friend-search]').fill('초록');assert.equal(await page.locator('[data-friend-id]:visible').count(),1);
 await page.click('[data-friend-pick=on]');await page.waitForSelector('.game-friend-picker-overlay',{state:'detached'});
 assert.deepEqual(await page.evaluate(()=>prepared),['on']);assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.p_action==='send')),{p_action:'send',p_to:'on',p_kind:'ttang',p_code:'abcdefabcdefabcdefabcdef'});
 await page.evaluate(()=>{inbox=[{id:'in-1',sender_name:'초록친구',kind:'ttang'}];document.dispatchEvent(new Event('visibilitychange'));});
 await page.locator('[data-answer=accept]').click();assert.equal(await page.evaluate(()=>joined.code),'abcdefabcdefabcdefabcdef');
 assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.p_action==='accept')),{p_action:'accept',p_id:'in-1'});
 // Closing the picker while a room is being prepared must not send an invitation.
 await page.evaluate(()=>{window.before=calls.filter(c=>c.p_action==='send').length;OjjudaFriendInvites.pick({kind:'matgo',prepare:()=>new Promise(resolve=>{window.ready=()=>resolve({code:'A1B2C3D4',cancel:()=>cancelled++})})});});
 await page.click('[data-friend-pick=on]');await page.click('.game-friend-picker-overlay .ge-close');await page.evaluate(()=>ready());
 await page.waitForFunction(()=>cancelled===1);assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='send').length),await page.evaluate(()=>before));
 await page.click('#open');await page.locator('[data-friend-pick=on]').waitFor();await page.evaluate(()=>{uid=null;authChanged('SIGNED_OUT',null)});assert.equal(await page.locator('.game-friend-picker-overlay,.game-friend-banner').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: selected friend recipient, presence sorting/search, accepted-game routing, cancelled preparation and sign-out cleanup');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

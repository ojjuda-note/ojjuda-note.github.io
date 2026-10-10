const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-10T12:00:00Z')});
 await page.setContent('<meta charset="utf-8"><style>body{margin:0}#app{padding:16px}</style><button id="open">친구 초대</button><div id="app"><main class="main"><button data-act="notice-open">공지</button><div data-game-friend-invite-slot></div></main></div>');
 await page.addStyleTag({path:path.join(__dirname,'../game-entry.css')});await page.addScriptTag({path:path.join(__dirname,'../game-entry.js')});await page.addScriptTag({path:path.join(__dirname,'../game-friend-invites.js')});
 await page.evaluate(()=>{
  window.uid='me';window.calls=[];window.inbox=[];window.replies=[];window.subscriptions=[];window.clockSkew=0;window.failList=false;window.prepared=[];window.cancelled=0;window.joined=null;
  window.friends=[{id:'off',nick:'가람',online:false},{id:'on',nick:'초록친구',online:true}];
  OjjudaGameFriends={list:()=>friends};
  const channel={on(type,filter,callback){subscriptions.push({filter,callback});return this},subscribe(){return this}};
  window.signal=direction=>subscriptions.find(s=>s.filter.filter.startsWith(direction+'_id')).callback();
  window.receive=(id,kind='ttang',left=60000)=>{inbox=[{id,sender_name:'초록친구',kind,expires_at:new Date(Date.now()+clockSkew+left).toISOString()}];signal('recipient')};
  window.client={auth:{onAuthStateChange(fn){window.authChanged=fn;return {data:{subscription:{unsubscribe(){}}}}}},channel:()=>channel,removeChannel(){},rpc:async(name,args)=>{calls.push(args);if(args.p_action==='list'&&failList)throw Error('offline');if(args.p_action==='accept'||args.p_action==='decline')inbox=inbox.filter(i=>i.id!==args.p_id);if(args.p_action==='ack')replies=replies.filter(i=>i.id!==args.p_id);return{data:args.p_action==='list'?{ok:true,invites:structuredClone(inbox),responses:structuredClone(replies),server_now:new Date(Date.now()+clockSkew).toISOString()}:args.p_action==='send'?{ok:true,id:'inv-1'}:{ok:true,kind:'ttang',code:'abcdefabcdefabcdefabcdef'}}}};
  OjjudaFriendInvites.install({client,user:()=>uid,list:()=>friends,refresh:async()=>{},onJoin:data=>{joined=data}});
  document.querySelector('#open').onclick=()=>OjjudaFriendInvites.pick({kind:'ttang',prepare:async friend=>{prepared.push(friend.id);return{code:'abcdefabcdefabcdefabcdef',cancel:()=>cancelled++}}});
 });
 await page.click('#open');await page.locator('[data-friend-pick=on]').waitFor();
 assert.equal(await page.locator('[data-friend-id]').first().getAttribute('data-friend-id'),'on');
 await page.locator('[data-friend-search]').fill('초록');assert.equal(await page.locator('[data-friend-id]:visible').count(),1);
 await page.click('[data-friend-pick=on]');await page.waitForSelector('.game-friend-picker-overlay',{state:'detached'});
 assert.deepEqual(await page.evaluate(()=>prepared),['on']);assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.p_action==='send')),{p_action:'send',p_to:'on',p_kind:'ttang',p_code:'abcdefabcdefabcdefabcdef'});
 await page.evaluate(()=>receive('in-1'));
 assert.equal(await page.locator('.game-friend-inline').evaluate(n=>n.parentElement.previousElementSibling.dataset.act),'notice-open','invitation sits directly below the notice');
 assert.equal(await page.locator('.game-friend-popup').count(),0,'incoming row does not open a popup');
 assert.equal(await page.locator('.ge-inline-copy').textContent(),'친구가 게임에 초대했습니다.');
 await page.locator('[data-answer=accept]').click();assert.equal(await page.evaluate(()=>joined.code),'abcdefabcdefabcdefabcdef');
 assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.p_action==='accept')),{p_action:'accept',p_id:'in-1'});
 // The row expires at 60 seconds without a server refresh and never records a rejection.
 await page.clock.pauseAt(new Date('2026-10-10T13:00:00Z'));
 await page.evaluate(()=>receive('timeout','matgo'));await page.locator('.game-friend-inline').waitFor();
 assert.equal(await page.locator('[data-seconds]').textContent(),'60');
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  const layout=await page.locator('.game-friend-inline').evaluate(n=>{const copy=n.querySelector('.ge-inline-copy'),parts=[copy,...n.querySelectorAll('button'),n.querySelector('.ge-inline-time')];return{width:n.scrollWidth,fits:n.scrollWidth<=n.clientWidth+2,copyFits:copy.scrollWidth<=copy.clientWidth+1,centers:parts.map(p=>{const r=p.getBoundingClientRect();return r.y+r.height/2})}});
  assert.ok(layout.fits&&layout.copyFits,width+': the complete invitation fits');assert.ok(Math.max(...layout.centers)-Math.min(...layout.centers)<2,width+': all controls stay on one line');
 }
 await page.setViewportSize({width:390,height:844});
 await page.clock.runFor(5000);
 await page.evaluate(()=>{document.querySelector('#app .main').innerHTML='<button data-act="notice-open">새 공지</button><div data-game-friend-invite-slot></div>'});
 await page.locator('.game-friend-inline').waitFor();assert.equal(await page.locator('[data-seconds]').textContent(),'55','shell redraw preserves the deadline');
 await page.evaluate(()=>{failList=true});await page.clock.runFor(54000);
 assert.equal(await page.locator('[data-seconds]').textContent(),'1');
 await page.clock.runFor(1000);assert.equal(await page.locator('.game-friend-inline').count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='decline'&&c.p_id==='timeout').length),0);
 await page.evaluate(()=>{failList=false;signal('recipient')});await page.clock.runFor(1000);
 assert.equal(await page.locator('.game-friend-inline').count(),0,'expired invitations never reappear');
 // Server time wins over a device clock that is five minutes behind; reopening never extends the deadline.
 await page.evaluate(()=>{clockSkew=300000;receive('late','ttang',15000)});await page.locator('.game-friend-inline').waitFor();
 assert.equal(await page.locator('[data-seconds]').textContent(),'15');await page.clock.runFor(10000);
 await page.evaluate(()=>signal('recipient'));await page.clock.runFor(5000);
 assert.equal(await page.locator('.game-friend-inline').count(),0);
 // Explicit rejection, sender subscription, persistent confirmation and deduplication.
 await page.evaluate(()=>{clockSkew=0;receive('reject','matgo')});await page.locator('[data-answer=decline]').click();
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='decline'&&c.p_id==='reject').length),1);
 await page.evaluate(()=>{replies=[{id:'out-1',recipient_name:'초록친구',kind:'matgo',status:'declined'}];signal('sender')});
 await page.locator('[data-answer=ack]').waitFor();assert.match(await page.locator('.game-friend-popup').innerText(),/초록친구님이 맞고 초대를 거절했어요/);
 assert.equal(await page.locator('.game-friend-popup').getAttribute('role'),'alertdialog');
 await page.evaluate(()=>{signal('sender');signal('sender')});assert.equal(await page.locator('.game-friend-popup').count(),1);
 await page.locator('[data-answer=ack]').click();await page.evaluate(()=>signal('sender'));
 assert.equal(await page.locator('.game-friend-popup').count(),0);assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='ack').length),1);
 // Cancellation on another device removes the row; a background pause does not prolong an invite.
 await page.evaluate(()=>receive('cancelled'));await page.locator('.game-friend-inline').waitFor();
 await page.evaluate(()=>{inbox=[];signal('recipient')});await page.locator('.game-friend-inline').waitFor({state:'detached'});
 await page.evaluate(()=>receive('sleep'));await page.locator('.game-friend-inline').waitFor();await page.clock.fastForward(61000);
 assert.equal(await page.locator('.game-friend-inline').count(),0);
 await page.evaluate(()=>receive('escape'));await page.locator('.game-friend-inline').waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='decline'&&c.p_id==='escape').length),0);
 await page.locator('[data-answer=decline]').click();
 // Closing the picker while a room is being prepared must not send an invitation.
 await page.evaluate(()=>{window.before=calls.filter(c=>c.p_action==='send').length;OjjudaFriendInvites.pick({kind:'matgo',prepare:()=>new Promise(resolve=>{window.ready=()=>resolve({code:'A1B2C3D4',cancel:()=>cancelled++})})});});
 await page.click('[data-friend-pick=on]');await page.click('.game-friend-picker-overlay .ge-close');await page.evaluate(()=>ready());
 await page.waitForFunction(()=>cancelled===1);assert.equal(await page.evaluate(()=>calls.filter(c=>c.p_action==='send').length),await page.evaluate(()=>before));
 await page.click('#open');await page.locator('[data-friend-pick=on]').waitFor();await page.evaluate(()=>{uid=null;authChanged('SIGNED_OUT',null)});assert.equal(await page.locator('.game-friend-picker-overlay,.game-friend-popup,.game-friend-inline').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: one-line invitations under notices at 320/390/1280px, redraw preservation, rejection popups, exact expiry without network, clock skew, background expiry, acknowledgement, keyboard focus, selected friend recipient, presence sorting/search, accepted-game routing, cancelled preparation and sign-out cleanup');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

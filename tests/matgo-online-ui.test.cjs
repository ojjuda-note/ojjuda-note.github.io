const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{fixture,A,B,C,MINOR}=require('./arcade-rooms-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await fixture();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.MATGO_CHROMIUM?{executablePath:process.env.MATGO_CHROMIUM}:{})});
 const errors=[],last=new Map(),failures=[];
 async function screen(actor,age=25){
  const context=await browser.newContext({viewport:{width:390,height:820},reducedMotion:'reduce'});
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.exposeBinding('onlineFixture',async(_,kind,body)=>{
   if(kind==='user')return{data:{user:{id:actor}}};
   if(kind==='identity')return{data:{age,locked:true}};
   if(kind==='arcade')return f.roomRpc(actor,body);
   const data=await f.call(actor,body);if(data.room)last.set(actor,data.room);if(data.error)failures.push({actor,body,error:data.error});return{data};
  });
  await context.addInitScript(({actor})=>{
   window.OJJUDA_CONFIG={supabaseUrl:'https://mock.invalid',supabaseKey:'public'};
   const client={auth:{getUser:()=>onlineFixture('user'),getSession:async()=>({data:{session:{access_token:actor}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:(name,params)=>name==='arcade_room_service'?onlineFixture('arcade',params):onlineFixture('identity'),functions:{invoke:(_,{body})=>onlineFixture('rpc',body)}};
   window.supabase={createClient:()=>client};
   // Exact visual timing is covered by matgo-online-effects-ui.test.cjs.
   const timeout=setTimeout;window.setTimeout=(fn,t,...args)=>timeout(fn,[2000,2400].includes(t)?20:t,...args);
   const interval=setInterval;window.setInterval=(fn,t,...args)=>interval(fn,t===1200?70:t,...args);
  },{actor});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://mock.invalid'&&url.pathname==='/functions/v1/matgo')return route.fulfill({contentType:'application/json',body:JSON.stringify(await f.call(actor,route.request().postDataJSON()))});
   if(url.origin!=='https://fixture.test')return route.fulfill({status:200,body:''});
   if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:''});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':url.pathname.endsWith('.css')?'text/css':undefined});
  });
  const page=await context.newPage();await page.goto('https://fixture.test/games/matgo-online.html');if(age>=19){await page.locator('[data-entry-mode=opponent]').click();await page.locator('details:has(#join-form)>summary').click();}return{page,context};
 }
 async function clickTurn(page){
  return page.evaluate(()=>{
   const dialog=document.querySelector('.dialog');
   if(dialog){const b=dialog.querySelector('#stop,#chongtong-continue,#single,#gukjin-pi');if(b){b.click();return true;}return false;}
   const b=document.querySelector('.stack.pick:not(:disabled),#hand button:not(:disabled),#flip:not(:disabled)');
   if(b){b.click();return true;}return false;
  });
 }
 try{
  const minor=await screen(MINOR,18);await minor.page.waitForSelector('#retry:not([hidden])');assert.equal(await minor.page.locator('#quick').count(),0);await minor.context.close();
  const solo=await screen(C);await solo.page.locator('#quick').click();await solo.page.locator('#quick-seconds').waitFor();
  assert.equal(await solo.page.locator('#invite-code,#copy-code').count(),0,'quick matchmaking does not show invitation controls');
  assert.doesNotMatch(await solo.page.locator('.waiting').innerText(),/두 사람 모두 입장/,'quick waiting explains its computer fallback without contradictory invitation instructions');
  assert.equal(await solo.page.locator('#cancel-wait').isVisible(),true);
  if(process.env.MATGO_WAIT_PROOF)await solo.page.screenshot({path:process.env.MATGO_WAIT_PROOF});
  await solo.page.locator('#cancel-wait').click();await solo.page.locator('#quick').waitFor();
  assert.equal((await f.call(C,{action:'status'})).online_room,null,'cancelling clears the waiting room');
  await solo.page.locator('#quick').click();await solo.page.locator('#quick-seconds').waitFor();
  await solo.page.waitForTimeout(2000);assert.ok(solo.page.url().includes('matgo-online.html'),'quick search waits before switching');
  await solo.page.waitForURL('**/matgo.html?*',{timeout:10000});await solo.page.locator('#matgo-start-play').click();
  try{await solo.page.locator('#handMe').waitFor({timeout:10000});}catch(error){console.error('Solo fallback state',await solo.page.locator('body').innerText(),JSON.stringify({errors,failures}));throw error;}
  assert.equal((await f.call(C,{action:'status'})).online_room,null);await solo.context.close();
  const a=await screen(A),b=await screen(B);
  await a.page.locator('#quick').waitFor();await b.page.locator('#quick').waitFor();
  await a.page.screenshot({path:'/tmp/matgo-online-lobby.png'});
  await a.page.locator('#create').click();await a.page.locator('#public-room-title').fill('맞고 친구들');await a.page.locator('#public-room-form button[type=submit]').click();const code=await a.page.locator('#invite-code').textContent();
  assert.match(code,/^#\d+$/);assert.equal(await a.page.locator('#copy-code').innerText(),'방번호 복사','public rooms retain their invitation controls');
  await b.page.locator('#room-code').fill(code);await b.page.locator('#join').click();
  await a.page.locator('#hand').waitFor();await b.page.locator('#hand').waitFor();
  assert.match(await a.page.locator('#op-name').textContent(),/별토끼/);assert.match(await b.page.locator('#op-name').textContent(),/봄고래/);
  assert.equal(await a.page.locator('.op-hand svg[aria-label="화투 뒷면"]').count(),10);
  for(const width of [320,390,768]){await a.page.setViewportSize({width,height:820});assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  for(const [width,height] of [[320,568],[360,640],[390,560]]){
    await a.page.setViewportSize({width,height});await a.page.evaluate(()=>document.documentElement.style.setProperty('--matgo-safe-bottom','34px'));await a.page.waitForTimeout(40);
    const box=await a.page.locator('#hand').boundingBox();assert.ok(box.y+box.height<=height-33,JSON.stringify({width,height,box}));
    assert.ok((await a.page.locator('.top').boundingBox()).height<=42);
    assert.equal(await a.page.locator('.caps-own .cap>span').first().isVisible(),false);
  }
  await a.page.setViewportSize({width:390,height:820});await a.page.screenshot({path:'/tmp/matgo-online-board.png'});
  const roomId=last.get(A).id;
  // Verify a real 15-second turn: no premature move, then both browsers advance.
  const version=last.get(A).version;
  await f.db.query("update ojjuda_matgo_internal.rooms set deadline=now()+interval '15 seconds' where id=$1",[roomId]);
  await a.page.waitForTimeout(12000);assert.equal(last.get(A).version,version,'a turn does not auto-play before its deadline');
  for(let i=0;i<300&&(last.get(A).version<=version||last.get(B).version<=version);i++)await a.page.waitForTimeout(20);
  assert.ok(last.get(A).autoCount>=1);assert.deepEqual(last.get(A).bots,[false,false]);
  for(let i=0;i<800&&!(last.get(A)?.status==='finished'&&last.get(B)?.status==='finished');i++){
    await clickTurn(a.page);await clickTurn(b.page);await a.page.waitForTimeout(15);
  }
  if(last.get(A).status!=='finished'){console.log('DEBUG',JSON.stringify({a:{version:last.get(A).version,prompt:last.get(A).game.prompt},b:{version:last.get(B).version,prompt:last.get(B).game.prompt},failures,dom:await a.page.locator('#content').innerText(),dialogs:await Promise.all([a.page.locator('.dialog').allTextContents(),b.page.locator('.dialog').allTextContents()])}));await a.page.screenshot({path:'/tmp/matgo-online-stuck.png'});}
  assert.equal(last.get(A).status,'finished');assert.equal(last.get(B).status,'finished');
  assert.deepEqual(last.get(A).gold,last.get(B).gold);assert.equal(last.get(A).gold.reduce((x,y)=>x+y,0),10000);
  await a.page.locator('#rematch').waitFor();
  await a.page.locator('.result-details').evaluate(el=>{el.insertAdjacentHTML('beforeend','<p>추가 정산 내역</p>'.repeat(15));});
  for(const [width,height] of [[320,568],[568,320]]){
    await a.page.setViewportSize({width,height});await a.page.waitForTimeout(40);
    const box=await a.page.locator('#result-exit').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height-34,'online result exit stays above phone navigation');
    assert.equal(await a.page.locator('#result-exit').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'online result exit stays clickable with long settlement details');
  }
  await a.page.screenshot({path:'/tmp/matgo-online-result.png'});
  await a.page.locator('#rematch').click();await b.page.locator('#rematch').click();
  for(let i=0;i<200&&last.get(A).round!==2;i++)await a.page.waitForTimeout(20);
  assert.equal(last.get(A).round,2);assert.equal((await f.arcade(A,'list')).mine.match_id,roomId,'public room stays registered across rematches');await a.page.waitForSelector('.dialog',{state:'detached'});
  // The iframe close handshake uses the same visible exit confirmation.
  await a.page.locator('#exit').click();await a.page.locator('#leave').waitFor();
  // Keep this standalone test on the page; the real bridge closes the iframe.
  await a.page.route('**/world.html',r=>r.fulfill({body:'<p>오락실</p>',contentType:'text/html'}));
  await a.page.locator('#leave').click();
  for(let i=0;i<200&&!last.get(B).bots[0];i++)await b.page.waitForTimeout(20);
  assert.equal(last.get(B).bots[0],true);assert.match(await b.page.locator('#op-name').textContent(),/PC 대행/);
  for(let i=0;i<800&&last.get(B).status!=='finished';i++){await clickTurn(b.page);await b.page.waitForTimeout(15);}
  assert.equal(last.get(B).status,'finished');assert.ok(last.get(B).result.paidDelta[0]<=0);
  await b.page.locator('#result-exit').waitFor();await b.page.screenshot({path:'/tmp/matgo-online-pc-result.png'});
  await b.page.route('**/world.html',r=>r.fulfill({body:'<p>오락실</p>',contentType:'text/html'}));
  await b.page.locator('#result-exit').click();await b.page.waitForURL('**/world.html');
  await a.context.close();await b.context.close();
  await f.db.query('update ojjuda_matgo_internal.wallets set gold=case when user_id=$1 then 200000 else 300000 end,stake_rate=100,stake_seen=100,round_id=null,round_seed=null where user_id in($1,$2)',[A,B]);
  const raisedA=await screen(A),raisedB=await screen(B);
  await raisedA.page.locator('#create').click();await raisedA.page.locator('#public-room-form button[type=submit]').click();
  await raisedA.page.locator('#matgo-stake').waitFor();
  assert.equal(await raisedA.page.locator('#matgo-stake-raise').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'the shared offer appears above the create-room dialog');
  await raisedA.page.locator('#matgo-stake-raise').click();
  const raisedCode=await raisedA.page.locator('#invite-code').textContent();
  await raisedB.page.locator('#room-code').fill(raisedCode);await raisedB.page.locator('#join').click();
  await raisedB.page.locator('#matgo-stake-raise').click();
  await raisedA.page.locator('#hand').waitFor();await raisedB.page.locator('#hand').waitFor();
  assert.equal(await raisedA.page.locator('#stakeRate').innerText(),'점당 200G');assert.equal(await raisedB.page.locator('#stakeRate').innerText(),'점당 200G');
  if(process.env.MATGO_PARITY_PROOF)await raisedA.page.screenshot({path:process.env.MATGO_PARITY_PROOF});
  await raisedA.context.close();await raisedB.context.close();assert.deepEqual(errors,[]);
  console.log('PASS: two browser members join by code, private hands, mobile layouts, 15-second automatic play, synchronized result, rematch and PC takeover after exit');
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

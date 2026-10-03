const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{fixture,A,B,MINOR}=require('./matgo-online-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await fixture();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.MATGO_CHROMIUM?{executablePath:process.env.MATGO_CHROMIUM}:{})});
 const errors=[],last=new Map(),failures=[];
 async function screen(actor,age=25){
  const context=await browser.newContext({viewport:{width:390,height:820}});
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.exposeBinding('onlineFixture',async(_,kind,body)=>{
   if(kind==='user')return{data:{user:{id:actor}}};
   if(kind==='identity')return{data:{age,locked:true}};
   const data=await f.call(actor,body);if(data.room)last.set(actor,data.room);if(data.error)failures.push({actor,body,error:data.error});return{data};
  });
  await context.addInitScript(({actor})=>{
   window.OJJUDA_CONFIG={supabaseUrl:'https://mock.invalid',supabaseKey:'public'};
   const client={auth:{getUser:()=>onlineFixture('user'),getSession:async()=>({data:{session:{access_token:actor}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:()=>onlineFixture('identity'),functions:{invoke:(_,{body})=>onlineFixture('rpc',body)}};
   window.supabase={createClient:()=>client};
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
  const page=await context.newPage();await page.goto('https://fixture.test/games/matgo-online.html');return{page,context};
 }
 async function clickTurn(page){
  return page.evaluate(()=>{
   const dialog=document.querySelector('.dialog');
   if(dialog){const b=dialog.querySelector('#stop,#chongtong-continue,#single');if(b){b.click();return true;}return false;}
   const b=document.querySelector('.stack.pick:not(:disabled),#hand button:not(:disabled),#flip:not(:disabled)');
   if(b){b.click();return true;}return false;
  });
 }
 try{
  const minor=await screen(MINOR,18);await minor.page.waitForSelector('#retry:not([hidden])');assert.equal(await minor.page.locator('#quick').count(),0);await minor.context.close();
  const a=await screen(A),b=await screen(B);
  await a.page.locator('#quick').waitFor();await b.page.locator('#quick').waitFor();
  await a.page.screenshot({path:'/tmp/matgo-online-lobby.png'});
  await a.page.locator('#create').click();const code=await a.page.locator('#invite-code').textContent();
  await b.page.locator('#room-code').fill(code);await b.page.locator('#join').click();
  await a.page.locator('#hand').waitFor();await b.page.locator('#hand').waitFor();
  assert.match(await a.page.locator('#op-name').textContent(),/별토끼/);assert.match(await b.page.locator('#op-name').textContent(),/봄고래/);
  assert.equal(await a.page.locator('.op-hand svg[aria-label="화투 뒷면"]').count(),10);
  for(const width of [320,390,768]){await a.page.setViewportSize({width,height:820});assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
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
  await a.page.locator('#rematch').waitFor();await a.page.screenshot({path:'/tmp/matgo-online-result.png'});
  await a.page.locator('#rematch').click();await b.page.locator('#rematch').click();
  for(let i=0;i<200&&last.get(A).round!==2;i++)await a.page.waitForTimeout(20);
  assert.equal(last.get(A).round,2);await a.page.waitForSelector('.dialog',{state:'detached'});
  // The iframe close handshake uses the same visible exit confirmation.
  await a.page.locator('#exit').click();await a.page.locator('#leave').waitFor();
  // Keep this standalone test on the page; the real bridge closes the iframe.
  await a.page.route('**/world.html',r=>r.fulfill({body:'<p>오락실</p>',contentType:'text/html'}));
  await a.page.locator('#leave').click();
  for(let i=0;i<200&&!last.get(B).bots[0];i++)await b.page.waitForTimeout(20);
  assert.equal(last.get(B).bots[0],true);assert.match(await b.page.locator('#op-name').textContent(),/PC 대행/);
  for(let i=0;i<800&&last.get(B).status!=='finished';i++){await clickTurn(b.page);await b.page.waitForTimeout(15);}
  assert.equal(last.get(B).status,'finished');assert.ok(last.get(B).result.paidDelta[0]<=0);
  await b.page.screenshot({path:'/tmp/matgo-online-pc-result.png'});
  assert.deepEqual(errors,[]);await a.context.close();await b.context.close();
  console.log('PASS: two browser members join by code, private hands, mobile layouts, 15-second automatic play, synchronized result, rematch and PC takeover after exit');
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
const fixture=`<meta charset="utf-8"><script src="/ttang-bridge.js"></script><script>
 window.channels=[];window.removed=[];window.scores=[];
 window.client={channel(name){const c={name,sent:[],on(_kind,_event,receive){this.receive=receive;return this;},subscribe(callback){this.ready=callback;return this;},send(value){this.sent.push(value.payload);return Promise.resolve('ok');}};channels.push(c);return c;},removeChannel(channel){removed.push(channel.name);return Promise.resolve('ok');}};
 window.openGame=options=>OjjudaTtangBridge.open({client,owner:'member',authorized:()=>true,onResult:async(won,round)=>{scores.push({won,round});return {ok:true};},...options});
 </script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://fresh.test')return route.fulfill({body:''});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
   const file=path.join(root,url.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file,contentType:/\.(js|mjs)$/.test(file)?'text/javascript':undefined}):route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://fresh.test/');
  const game=async()=>{const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.OjjudaTtang);return frame;};
  await page.evaluate(()=>{localStorage.setItem('saved-unlocks','keep');openGame();});let frame=await game();
  await frame.locator('#soloBtn').click();await frame.waitForFunction(()=>world.time>0);const first=await frame.evaluate(()=>{world.time=25;return roundId;});
  await page.evaluate(()=>OjjudaTtangBridge.close());assert.equal(await page.locator('iframe').count(),0);
  assert.deepEqual(await page.evaluate(()=>scores),[{won:false,round:first}]);
  await page.evaluate(()=>openGame());frame=await game();assert.deepEqual(await frame.evaluate(()=>({mode,round:roundId})),{mode:'attract',round:null});
  await frame.locator('#soloBtn').click();assert.notEqual(await frame.evaluate(()=>roundId),first);assert.ok(await frame.evaluate(()=>world.time<2));
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-unlocks')),'keep');await page.evaluate(()=>OjjudaTtangBridge.close());

  // Parent close cancels a subscribe that has not completed, before iframe removal.
  const a='a'.repeat(24),b='b'.repeat(24);
  await page.evaluate(hostCode=>openGame({hostCode}),a);await game();await page.waitForFunction(()=>channels.length===1);
  const removed=await page.evaluate(()=>{OjjudaTtangBridge.close();return [...window.removed];});assert.deepEqual(removed,['ttang-'+a]);
  await page.evaluate(()=>{channels[0].ready('SUBSCRIBED');openGame();});frame=await game();
  assert.equal(await frame.evaluate(()=>mode),'attract');assert.equal(await frame.locator('#soloBtn').isVisible(),true);

  // An old join retry and its channel callback cannot affect the next room.
  await frame.evaluate(code=>{void OjjudaTtang.join(code);},a);await page.waitForFunction(()=>channels.length===2);
  await page.evaluate(()=>channels[1].ready('SUBSCRIBED'));await page.waitForFunction(()=>channels[1].sent.some(message=>message.t==='join'));
  await frame.evaluate(code=>{OjjudaTtang.menu();void OjjudaTtang.host(code);},b);await page.waitForFunction(()=>channels.length===3);
  await page.evaluate(()=>channels[2].ready('SUBSCRIBED'));await frame.waitForFunction(()=>Net.kind==='online');
  await page.evaluate(()=>channels[1].receive({payload:{t:'init'}}));
  await page.waitForTimeout(900);
  assert.equal(await frame.evaluate(()=>mode),'attract','a late old init cannot restore the old match');
  assert.deepEqual(await page.evaluate(()=>channels[2].sent),[],'old join loop cannot broadcast into the new host room');
  await page.evaluate(()=>channels[2].receive({payload:{t:'join'}}));await frame.waitForFunction(()=>mode==='net'&&role==='host');
  assert.ok(await frame.evaluate(()=>roundId),'explicit invitation still starts a new network match');
  await page.evaluate(()=>OjjudaTtangBridge.close());assert.deepEqual(await page.evaluate(()=>removed),['ttang-'+a,'ttang-'+a,'ttang-'+b]);
  assert.deepEqual(errors,[]);console.log('PASS: fresh solo re-entry, one abandoned-round result, pending subscribe cleanup before iframe removal, stale init/retry isolation and explicit invitation play.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

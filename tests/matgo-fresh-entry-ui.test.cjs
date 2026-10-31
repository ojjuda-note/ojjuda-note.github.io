const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
const fixture=`<meta charset="utf-8"><div id="toast"></div><script>
 window.fixtureOwner='00000000-0000-4000-8000-000000000001';window.calls=[];window.roundNumber=1;window.finishOld=false;
 const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 window.funds={gold:7500,coins:17,free_left:1};window.soloRound={id:id(1),seed:42,gold:7500,first:0,carry:1,rate:100,cpu_level:1,rules_version:13};window.onlineRoom=null;
 const state=()=>({ok:true,...funds,round:soloRound,online_room:onlineRoom?.id||null});
 window.makeRoom=(n,status='waiting')=>({id:id(n),status,code:'A1B2C3D4',mode:'friend',version:1,round:1,seat:0,gold:[7500,5000],bots:[false,false],departed:[false,false],ready:[false,false],names:['나','친구'],eventCount:0,events:[],serverTime:Date.now()});
 window.fixtureClient={auth:{getSession:async()=>({data:{session:{user:{id:fixtureOwner},access_token:'fixture-token'}}})},rpc:async()=>({data:{ok:true,mine:null}}),functions:{invoke:async(_,{body})=>{
 calls.push(structuredClone(body));let data;
 if(body.action==='status')data=state();
 else if(body.action==='abandon'){const changed=soloRound?.id===body.round_id;if(changed)soloRound=null;data={...state(),abandoned:changed};}
 else if(body.action==='start'){soloRound||={id:id(++roundNumber),seed:40+roundNumber,gold:funds.gold,first:0,carry:1,rate:100,cpu_level:1,rules_version:13};data=state();}
 else if(body.action==='online_join'){onlineRoom=makeRoom(90);data={ok:true,room:onlineRoom};}
 else if(body.action==='online_leave'){const r=onlineRoom;if(r?.status==='waiting'){onlineRoom=null;data={ok:true,room:{...r,status:'cancelled'}};}else if(r){r.bots[0]=r.departed[0]=true;data={ok:true,room:r};}else data={ok:true,room:{id:body.room_id,status:'cancelled'}};}
 else if(body.action==='online_read'){if(finishOld&&onlineRoom){const r=onlineRoom;onlineRoom=null;finishOld=false;data={ok:true,room:{...r,status:'finished'}};}else data={ok:true,room:onlineRoom};}
 else throw Error(body.action);
 return {data:structuredClone(data)};
 }}};
 window.OjjudaMatgoAccess={check:async()=>({userId:fixtureOwner,age:25}),allowed:()=>true,getClient:()=>fixtureClient,subscribe:()=>()=>{}};
 </script><script src="/matgo-bridge.js"></script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://fresh.test'||url.pathname==='/config.js')return route.fulfill({body:''});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
   const file=path.join(root,url.pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   if(url.pathname==='/games/matgo.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8').replace('startRound();\n})();','window.freshMatgoTest={game,ui,getRound:()=>currentRound};\nstartRound();\n})();')});
   return route.fulfill({path:file,contentType:/\.(js|mjs)$/.test(file)?'text/javascript':undefined});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://fresh.test/');
  const currentFrame=async()=>{await page.waitForSelector('#matgo-overlay iframe');return(await page.locator('#matgo-overlay iframe').elementHandle()).contentFrame();};
  await page.evaluate(()=>openMatgo());let frame=await currentFrame();await frame.waitForSelector('#entry-loading',{state:'hidden'});
  assert.equal(await frame.locator('#resume-room').count(),0);assert.equal(await page.evaluate(()=>soloRound),null);
  assert.equal(await page.evaluate(()=>calls.filter(call=>call.action==='start').length),0,'re-entry does not auto-start a hand');
  await frame.locator('#solo').click();await frame.waitForURL('**/matgo.html?*');await frame.waitForFunction(()=>window.freshMatgoTest?.getRound()&&!freshMatgoTest.ui.dealing);
  const started=await frame.evaluate(()=>freshMatgoTest.getRound());assert.notEqual(started,'10000000-0000-4000-8000-000000000001');
  await page.evaluate(()=>closeMatgo());assert.equal(await page.locator('iframe').count(),0);await page.waitForFunction(()=>soloRound===null);
  assert.deepEqual(await page.evaluate(()=>funds),{gold:7500,coins:17,free_left:1});
  await page.evaluate(()=>openMatgo());frame=await currentFrame();await frame.waitForSelector('#entry-loading',{state:'hidden'});assert.equal(await frame.locator('#solo').isEnabled(),true);
  assert.equal(await page.evaluate(()=>calls.filter(call=>call.action==='start').length),1);await page.evaluate(()=>closeMatgo());

  await page.evaluate(()=>{onlineRoom=makeRoom(20);return openMatgo();});frame=await currentFrame();await frame.waitForFunction(()=>document.querySelector('#content:not([inert]) #solo:not(:disabled)'));
  assert.equal(await frame.locator('.waiting').count(),0,'old waiting room never renders');assert.equal(await page.evaluate(()=>onlineRoom),null);await page.evaluate(()=>closeMatgo());

  await page.evaluate(()=>{onlineRoom=makeRoom(30,'active');return openMatgo();});frame=await currentFrame();await frame.locator('#fresh-entry-state').waitFor();
  assert.equal(await frame.locator('#solo').isEnabled(),false);assert.equal(await frame.locator('.board').count(),0,'old active hand never renders');assert.equal(await frame.locator('#resume-room').count(),0);
  await page.waitForFunction(()=>calls.some(call=>call.action==='online_read'&&call.room_id.endsWith('000000000030')));
  await page.evaluate(()=>finishOld=true);await frame.waitForFunction(()=>!document.querySelector('#solo').disabled);assert.equal(await frame.locator('#fresh-entry-state').count(),0);
  assert.deepEqual(await page.evaluate(()=>funds),{gold:7500,coins:17,free_left:1});await page.evaluate(()=>closeMatgo());

  await page.evaluate(()=>{onlineRoom=makeRoom(40);return openMatgo({roomId:onlineRoom.id,roomNo:'4040'});});frame=await currentFrame();await frame.locator('.waiting').waitFor();
  assert.equal(await page.evaluate(()=>calls.filter(call=>call.action==='online_leave'&&call.room_id.endsWith('000000000040')).length),0,'explicit freshly created room is preserved');await page.evaluate(()=>closeMatgo());
  await page.evaluate(()=>openMatgo({inviteCode:'A1B2C3D4'}));frame=await currentFrame();await frame.locator('.waiting').waitFor();assert.ok(await page.evaluate(()=>calls.some(call=>call.action==='online_join'&&call.code==='A1B2C3D4')));
  await page.evaluate(()=>closeMatgo());assert.deepEqual(errors,[]);
  console.log('PASS: old solo round abandoned before a fresh hand, parent close cleanup, balances retained, no waiting/active resume, settlement reconciliation, explicit public-room entry and friend invitation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const scheduleFixture='window.createScheduleFixture='+require('./schedule-fixture.cjs').toString()+';';
const ledgerFixture='window.createLedgerFixture='+require('./ledger-fixture.cjs').toString()+';';
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-navigation.js'),'utf8')}\n${ledgerFixture}\n${scheduleFixture}\n${fs.readFileSync(path.join(root,'world-schedule.js'),'utf8')}\n${fs.readFileSync(path.join(root,'world-donflow.js'),'utf8')}\n${fs.readFileSync(path.join(root,'world-life.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert(boot>0);
world=world.slice(0,boot)+`
const fixtureRooms=new Map(),fixtureRoomCalls=[],fixtureUnexpected=[];
window.houseWorldTest={state:g,auth:D,actions:sr,render:H,rooms:fixtureRooms,roomCalls:fixtureRoomCalls,unexpected:fixtureUnexpected};
U.cleanupMedia=async()=>({});U.overview=async()=>({});U.contentFeed=async()=>[];U.chatFeed=async()=>[];
// Keep the production World -> room service -> host -> iframe flow. Replace
// only transport, including compare-and-swap room saves and empty record lists.
const fixtureLedger=createLedgerFixture(()=>D.user?.id);
S={auth:{signOut:async()=>{sessionStorage.setItem('fixture-logged-out','yes');D.user=null;D.online=false;D.isAdmin=false;H();}},
 from(table){if(table==='life_ledger_entries')return fixtureLedger.from(table);const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},range(){return q;},then(resolve,reject){if(!['house_records','media_folders','house_friend_groups'].includes(table)){fixtureUnexpected.push(table);return Promise.resolve({data:null,error:{message:'Unexpected fixture table: '+table}}).then(resolve,reject);}return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return q;},
 async rpc(name,args){if(name==='life_ledger_month')return fixtureLedger.rpc(name,args);
  fixtureRoomCalls.push({name,args:structuredClone(args)});
  if(!['house_room_load','house_room_save'].includes(name)){fixtureUnexpected.push(name);return{error:{message:'Unexpected fixture RPC: '+name}};}
  if(args.p_owner!==D.user?.id)return{error:{message:'house_room_not_owner'}};
  const saved=fixtureRooms.get(args.p_owner);
  if(name==='house_room_load')return{data:saved?{ok:true,found:true,canEdit:true,...structuredClone(saved)}:{ok:true,found:false,canEdit:true}};
  if(saved&&JSON.stringify(saved.snapshot)===JSON.stringify(args.p_snapshot))return{data:{ok:true,revision:saved.revision,updatedAt:saved.updatedAt}};
  if((saved?.revision||null)!==args.p_revision)return{data:{ok:false,reason:'conflict'}};
  const next={snapshot:structuredClone(args.p_snapshot),revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};fixtureRooms.set(args.p_owner,next);return{data:{ok:true,revision:next.revision,updatedAt:next.updatedAt}};
 }};
const fixtureSchedule=createScheduleFixture(()=>D.user?.id),originalRpc=S.rpc.bind(S),originalFrom=S.from.bind(S);S.rpc=(name,args)=>name==='life_schedule_month'?fixtureSchedule.rpc(name,args):originalRpc(name,args);S.from=table=>table==='life_schedule_events'?fixtureSchedule.from(table):originalFrom(table);
P.loaded=true;P.at=Date.now()+60000;
gm(()=>{g.tab='friends';g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
D.online=!sessionStorage.getItem('fixture-logged-out');D.user=D.online?{id:'world-member-a'}:null;D.isAdmin=false;g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/life-proof.ttf'&&process.env.WORLD_LIFE_PROOF_FONT)return route.fulfill({path:process.env.WORLD_LIFE_PROOF_FONT});if(u.pathname==='/ledger/index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>DonFlow host fixture</title>'});if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(process.env.WORLD_LIFE_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:LifeProof;src:url(/life-proof.ttf)}html,body,button,input,textarea,select{font-family:LifeProof,sans-serif!important}';document.head.append(s);},{once:true}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.houseWorldTest);
  const life=()=>page.evaluate(()=>houseWorldTest.actions.tab({tab:'life'})),status=text=>page.locator('[data-life-root] [role="status"]').filter({hasText:text}).waitFor();await life();
  assert.deepEqual(await page.locator('.bottomnav button > span:first-of-type').allTextContents(),['동네','우리집','게시판','공원','메뉴']);assert.deepEqual(await page.locator('[data-life-tool]').evaluateAll(els=>els.map(e=>e.dataset.lifeTool)),['calendar','weather','news','ledger','calculator']);assert.equal(await page.locator('.bottomnav [data-tab="life"]').count(),0);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width<900)assert(await page.locator('.bottomnav button').evaluateAll(nodes=>new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().top))).size===1));}
  await page.setViewportSize({width:390,height:844});if(process.env.WORLD_LIFE_PROOF_DIR){fs.mkdirSync(process.env.WORLD_LIFE_PROOF_DIR,{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(process.env.WORLD_LIFE_PROOF_DIR,'life-overview.png')});}const ledger=page.locator('[data-life-tool="ledger"]'),calc=page.locator('[data-life-tool="calculator"]');assert.equal(await page.locator('[data-life-tool=contacts]').count(),0);
  await ledger.locator('summary').click();await ledger.locator('iframe[title="오쭈다 가계부 · 돈플로우"]').waitFor();assert(await ledger.locator('iframe').getAttribute('src').then(src=>src.startsWith('/ledger/')));
  await page.locator('.bottomnav [data-tab="my"]').click();assert.equal(await page.locator('.life-donflow').count(),0);await life();await ledger.locator('iframe').waitFor();
  await calc.locator('summary').click();const key=k=>calc.getByRole('button',{name:k,exact:true}).click();for(const k of ['0','.','1','+','0','.','2','='])await key(k);assert.equal(await calc.locator('output').textContent(),'0.3');for(const k of ['C','9','÷','0','='])await key(k);assert.equal(await calc.locator('output').textContent(),'계산할 수 없어요');for(const k of ['C','2','+','3','×','4','='])await key(k);assert.equal(await calc.locator('output').textContent(),'20');
  for(const [keys,expected] of [
   [[...'1234567890123','+','1','='],'1234567890124'],
   [[...'9007199254740990','+','1','='],'9007199254740991'],
   [[...'9007199254740991','−','1','='],'9007199254740990'],
   [[...'0.1','+','0','.','2','='],'0.3'],
   [[...'0.1','×','0','.','2','='],'0.02']
  ]){await key('C');for(const k of keys)await key(k);assert.equal(await calc.locator('output').textContent(),expected,`calculator preserves ${keys.join(' ')} precision`);}
  await page.reload();await page.waitForFunction(()=>window.houseWorldTest);await life();await ledger.locator('summary').click();await ledger.locator('iframe').waitFor();
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));await page.frameLocator('iframe').locator('#app.records-home').waitFor();let f=page.frames().find(x=>x.url().includes('/house-test/index.html'));await f.waitForFunction(()=>document.querySelector('#app').getClientRects().length);
  await page.waitForFunction(()=>houseWorldTest.rooms.has('world-member-a'));assert.deepEqual(await page.evaluate(()=>houseWorldTest.roomCalls.slice(0,2).map(call=>call.name)),['house_room_load','house_room_save'],'house entry uses the real cloud load and initial save bridge');assert.equal(await page.evaluate(()=>Object.hasOwn(houseWorldTest.rooms.get('world-member-a').snapshot,'diary')),false,'personal local writing is not sent with room geometry');
  const cdp=await context.newCDPSession(page),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y])=>({x,y,id:1}))});
  const swipe=async(locator,dx,dy=0)=>{await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox(),x=b.x+b.width*(dx<0?.8:.2),y=b.y+Math.min(25,b.height/2);await touch('touchStart',[[x,y]]);for(let i=1;i<=6;i++)await touch('touchMove',[[x+dx*i/6,y+dy*i/6]]);await touch('touchEnd',[]);};
  await swipe(f.locator('#home-profile'),-100);await page.waitForFunction(()=>houseWorldTest.state.tab==='board');assert.equal(await page.locator('iframe').count(),0,'house-record swipe enters the adjacent board');await life();
  await page.locator('.bottomnav [data-tab="board"]').click();await page.waitForFunction(()=>houseWorldTest.state.tab==='board');await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));await page.frameLocator('iframe').locator('#app.records-home').waitFor();assert.equal(await page.evaluate(()=>houseWorldTest.roomCalls.filter(call=>call.name==='house_room_load').length),2,'returning from life reloads the saved account room');f=page.frames().find(x=>x.url().includes('/house-test/index.html'));await f.locator('[data-tab="room"]').click();await swipe(f.locator('#viewport'),-120);assert.equal(await page.evaluate(()=>houseWorldTest.state.tab),'home','room gestures never change World tabs');assert.deepEqual(await page.evaluate(()=>houseWorldTest.unexpected),[]);
  await life();await page.evaluate(()=>{houseWorldTest.auth.online=false;houseWorldTest.auth.user=null;houseWorldTest.render();});assert.equal(await ledger.locator('input').count(),0);await calc.locator('summary').click();await key('7');assert.equal(await calc.locator('output').textContent(),'7','guest calculator works without storing personal data');assert.deepEqual(errors,[]);
  console.log('PASS: five menus, one ordered life page, responsive layout, calendar/weather/news sections, DonFlow mounting and cleanup, calculator, iframe swipes and room gesture protection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

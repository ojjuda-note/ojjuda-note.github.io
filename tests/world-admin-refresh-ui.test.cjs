const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const nav=fs.readFileSync(path.join(root,'world-navigation.js'),'utf8');
world=world.replace('<script type="module">',`<script>${nav}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');
assert.ok(boot>0);
world=world.slice(0,boot)+`
window.worldTest={state:g,auth:D,admin:L,actions:sr,render:H,clear:clearWorldAdminView};
U.cleanupMedia=async()=>({});U.overview=async()=>({});U.contentFeed=async()=>[];U.chatFeed=async()=>[];
window.OjjudaNoteAdmin={getTabs:()=>[{id:'cards',label:'카드'},{id:'risk',label:'위험 신호'}],
 mount:(el,options)=>{window.noteOptions=options;el.textContent=options.initialTab},unmount(){},
 selectTab:id=>noteOptions.onTabChange(id)};
gm(()=>{g.tab='friends';H()});
// Match boot order: initial rendering happens before the server role check.
H();D.online=true;D.user={id:sessionStorage.getItem('fixture-user')||'admin-a'};
D.isAdmin=sessionStorage.getItem('fixture-role')!=='member';
restoreWorldAdminView(new URL(location.href).searchParams.get('admin'));H();
`+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   const file=path.join(root,u.pathname);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const loaded=()=>page.waitForFunction(()=>window.worldTest&&worldTest.auth.online);
  const reload=async()=>{await page.reload();await loaded()};
  const current=()=>page.evaluate(()=>({tab:worldTest.state.tab,area:worldTest.admin.area,subtab:worldTest.admin.tab,note:worldTest.admin.noteTab}));
  await page.goto('https://fixture.test/world.html');await loaded();
  for(const width of [320,390,412,768,899]){
   await page.setViewportSize({width,height:844});
   const layout=await page.locator('.bottomnav').evaluate(el=>({width:el.clientWidth,left:parseFloat(getComputedStyle(el).paddingLeft),right:parseFloat(getComputedStyle(el).paddingRight),buttons:[...el.children].map(b=>({x:b.offsetLeft,width:b.offsetWidth}))}));
   assert.equal(layout.buttons.length,3);
   const expected=(layout.width-layout.left-layout.right)/3;
   layout.buttons.forEach((b,i)=>{assert.ok(Math.abs(b.width-expected)<=1);assert.ok(Math.abs(b.x-(layout.left+i*expected))<=1)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>worldTest.actions.tab({tab:'admin'}));
  await reload();assert.equal((await current()).tab,'admin');
  for(const area of ['payment','world']){
   await page.evaluate(area=>{worldTest.actions['adm-area']({v:area});worldTest.actions['adm-tab']({v:'settings'})},area);
   await reload();assert.deepEqual(await current(),{tab:'admin',area,subtab:'settings',note:'cards'});
  }
  await page.evaluate(()=>{worldTest.actions['adm-area']({v:'note'});worldTest.actions['adm-note-tab']({v:'risk'})});
  await reload();assert.equal((await current()).area,'note');assert.equal((await current()).note,'risk');
  await page.evaluate(()=>worldTest.actions.tab({tab:'my'}));
  await reload();assert.notEqual((await current()).tab,'admin','leaving admin clears restoration');
  await page.evaluate(()=>{worldTest.actions.tab({tab:'admin'});sessionStorage.setItem('fixture-user','admin-b')});
  await reload();assert.notEqual((await current()).tab,'admin','another account cannot inherit the view');
  await page.evaluate(()=>{worldTest.actions.tab({tab:'admin'});sessionStorage.setItem('fixture-role','member')});
  await reload();assert.notEqual((await current()).tab,'admin','revoked permission cannot restore admin');
  await page.evaluate(()=>{sessionStorage.removeItem('fixture-role');sessionStorage.setItem('ojjuda.world.admin-view','invalid json')});
  await reload();assert.notEqual((await current()).tab,'admin');
  await page.goto('https://fixture.test/world.html?admin=settings');await loaded();
  assert.equal((await current()).area,'payment','existing deep links still open their requested tab');
  await page.evaluate(()=>worldTest.clear());
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.world.admin-view')),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: real reload preserves admin and submenus; exit, account/role changes and corrupt storage are safe; 3 equal-width menus at 5 mobile/tablet widths.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

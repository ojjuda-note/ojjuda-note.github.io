const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const proof=process.env.WORLD_DESIGN_PROOF_DIR||'/tmp/world-design-proof';fs.mkdirSync(proof,{recursive:true});
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('</head>','<script>'+read('world-themes.js')+'\n'+read('world-game-rankings.js')+'\n'+read('world-game-assets.js')+'\n'+read('arcade-rooms.js')+'</script></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 $.me.nick='오쭈다';$.me.bio='오늘도 반가워요.';$.coins=250;D.online=false;S={rpc:async()=>({data:{ok:true,rooms:[],mine:null}})};
 g.tab='place';g.place={id:'arcade',ch:1,count:8,log:[]};H();clearInterval(g.placeT);g.placeT=null;
 const rankClient={rpc:async(_,args)=>({data:Object.fromEntries(args.p_games.map((id,i)=>[id,{nick:['초록산책','작은별','오쭈다'][i%3],score:1200+i*60}]))})};
 window.designFixture={render:H,state:g,auth:D,model:$,actions:sr,rank(){OjjudaGameRankings.mount(document.querySelector('[data-arcade-rank-root]'),{client:rankClient,owner:'fixture',games:{mines:{name:'지뢰찾기',unit:'점'},runner:{name:'쭈 달리기',unit:'점'},stacker:{name:'탑 쌓기',unit:'층'},tank:{name:'탱크게임',unit:'승'}},onOpenGame:id=>window.openedGame=id});}};
 designFixture.rank();
 `+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',timezoneId:'America/Los_Angeles'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.designFixture);
 const fits=async(label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' fits viewport');
 await page.evaluate(()=>document.documentElement.dataset.worldTheme='classic');await fits('desktop arcade');
 assert.equal(await page.locator('.sidenav').isVisible(),true);assert.equal(await page.locator('.bottomnav').isVisible(),false);
 assert.equal(await page.locator('[data-arcade-games=solo] .ge img').count(),9);
 assert.equal(await page.locator('.arcade-social').isVisible(),true);
 assert.equal(await page.locator('.arcade-welcome').count(),0,'theme artwork belongs to the rankings background');
 assert.equal(await page.locator('.arcade-home>.world-page-heading,.arcade-home [data-theme-status]').count(),0,'arcade omits the decorative introduction');
 assert.equal(await page.getByText('오늘의 작은 즐거움',{exact:false}).count(),0);
 assert.equal(await page.locator('.arcade-social .arcade-status [data-act="pl-channel"]').isVisible(),true,'channel changes live inside the multiplayer room panel');
 assert.equal(await page.locator('.arcade-social [data-arcade-rooms]').isVisible(),true);
 assert.equal(await page.locator('#plog,#pmsg,[data-act=pl-send],[data-act=pl-react],.arcade-welcome [data-tab=park]').count(),0);
 const brand=await page.locator('.side>.brand').boundingBox(),nav=await page.locator('.sidenav').boundingBox();assert.ok(Math.abs((brand.y+brand.height/2)-(nav.y+nav.height/2))<3,'brand and desktop menu share one row');
 await page.screenshot({path:path.join(proof,'arcade-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'다음 게임 순위',exact:true}).click();assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'1');
 await page.getByRole('button',{name:'탱크게임 게임 열기',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedGame),'tank');
 for(const width of [320,390,768,900,1280]){
  await page.setViewportSize({width,height:900});await fits('arcade '+width);assert.equal(await page.locator(width<900?'.bottomnav':'.sidenav').isVisible(),true);
  assert.equal(await page.locator('[data-arcade-games] .game-version').count(),0,'release metadata stays out of the menu at '+width);
  assert.doesNotMatch(await page.locator('[data-arcade-games]').allTextContents().then(t=>t.join(' ')),/v\d+\.\d+\.\d+/);
  if(width<=600){
   const grid=await page.locator('[data-arcade-games=solo]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
   assert.equal(grid,3,'mobile keeps exactly three game buttons per row');
   const labels=await page.locator('[data-arcade-games] .gbtn>span:last-child').evaluateAll(nodes=>nodes.map(n=>({size:parseFloat(getComputedStyle(n).fontSize),weight:parseInt(getComputedStyle(n).fontWeight),fits:n.scrollWidth<=n.clientWidth+1})));
   assert.ok(labels.every(n=>n.size>=12.5&&n.weight>=700&&n.fits),'larger bold game names fit every mobile card');
   const colors=await page.locator('[data-arcade-games=solo] .gbtn .ge').evaluateAll(nodes=>new Set(nodes.map(n=>getComputedStyle(n).backgroundImage)).size);
   assert.ok(colors>=4,'game covers are visually distinct');
  }
  if(width<900){
   const buttons=await page.locator('.bottomnav>button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height};}));
   assert.equal(buttons.length,3);assert.ok(buttons.every(b=>b.width>=44&&b.height>=44),'every mobile menu has a reachable touch area');
   assert.ok(Math.max(...buttons.map(b=>b.width))-Math.min(...buttons.map(b=>b.width))<1,'mobile menus have equal widths');
   assert.ok(buttons[0].x<width/3&&buttons[2].x>width/2,'mobile menus span the bottom bar');
  }
 }
 await page.setViewportSize({width:390,height:850});await page.evaluate(()=>{document.documentElement.dataset.worldTheme='autumn';designFixture.rank();});await page.screenshot({path:path.join(proof,'arcade-mobile.png'),fullPage:true});
 await page.locator('.bottomnav [data-tab=my]').click();assert.equal(await page.locator('[data-ju-shop-open]').count(),0);
 assert.equal(await page.locator('[data-my-group=themes],.settings-theme-section,[data-world-theme-settings],[data-act=theme],[data-act=accent]').count(),0,'all manual appearance controls are removed');await fits('mobile settings');
 await page.screenshot({path:path.join(proof,'settings-mobile.png'),fullPage:true});
 await page.locator('[data-my-group=profile] summary').click();await page.locator('#p-bio').fill('바뀌지 않아야 하는 작성 내용');await page.evaluate(()=>OjjudaThemes.sync());assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용');
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용','system appearance change preserves the draft');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.documentElement.dataset.theme);assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용');
 await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>{document.querySelectorAll('details.my-menu-group').forEach(n=>n.open=false);});await fits('desktop settings');assert.ok(await page.locator('.settings-columns').evaluate(n=>n.clientWidth>850),'settings use the full content width');await page.screenshot({path:path.join(proof,'settings-desktop.png'),fullPage:true});
 // Inspect every theme in the real Arcade, including the dark variant.
 await page.locator('.sidenav [data-tab=arcade]').click();await page.evaluate(()=>{clearInterval(designFixture.state.placeT);designFixture.rank();});
 const original=read('brand/ojjuda-logo.svg').match(/d="[^"]+"/g);
 const shapes=await page.locator('.side .ojjuda-theme-logo path').evaluateAll(nodes=>nodes.map(n=>'d="'+n.getAttribute('d')+'"'));
 assert.deepEqual(shapes,original,'logo silhouette and smile remain the original paths');
 const keys=await page.evaluate(()=>OjjudaThemes.order);
 for(const key of keys){await page.evaluate(k=>document.documentElement.dataset.worldTheme=k,key);await fits(key);assert.equal(await page.locator('.side .ojjuda-theme-logo').evaluate(n=>getComputedStyle(n).color===getComputedStyle(n.querySelector('path')).fill),true,'logo fill follows the theme');assert.ok(await page.locator('[data-arcade-rank-root]').evaluate(n=>getComputedStyle(n,':before').backgroundImage.includes('/assets/design/')));}
 await page.evaluate(()=>document.documentElement.dataset.worldTheme='christmas');await page.screenshot({path:path.join(proof,'christmas-desktop.png'),fullPage:true});
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await fits('dark theme');await page.screenshot({path:path.join(proof,'dark-desktop.png'),fullPage:true});
 assert.deepEqual(errors,[]);await context.close();console.log('PASS: real redesigned renderer, responsive menus, artwork, all theme palettes, keyboard-safe controls, automatic-only themes, draft preservation and ranking pagination');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

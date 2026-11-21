const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {calendarCases,selectCalendarDate,palette,distinctPalettes}=require('./theme-browser-helpers.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const proof=process.env.WORLD_DESIGN_PROOF_DIR||'/tmp/world-design-proof';fs.mkdirSync(proof,{recursive:true});
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
world=world.replace('</head>','<script>'+read('features/home/agit-hub.js')+'\n'+read('shared/brand/service-banners.js')+'\n'+read('park/world-park-notes.js')+'\n'+read('app/world/world-themes.js')+'\n'+read('shared/games/world-game-rankings.js')+'\n'+read('shared/games/world-game-assets.js')+'\n'+read('features/arcade/arcade-rooms.js')+'\n'+read('app/world/world-navigation.js').split('/* World-only ambient audio;')[0]+'</script></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 $.me.nick='오쭈다';$.me.bio='오늘도 반가워요.';$.coins=250;D.online=false;S={rpc:async()=>({data:{ok:true,rooms:[],mine:null}})};
 g.tab='place';g.place={id:'arcade',ch:1,count:8,log:[]};H();clearInterval(g.placeT);g.placeT=null;
 const rankReads=[],rankClient={rpc:async(name,args)=>{rankReads.push({name,args});const rows=Object.fromEntries(args.p_games.map((id,i)=>[id,{nick:['초록산책','작은별','오쭈다'][i%3],score:1200+i*60}]));return {data:name==='community_game_monthly_history'?{month:args.p_month?.slice(0,7)||'2026-10',currentMonth:'2026-10',closed:!!args.p_month,months:[{month:'2026-10',hasRecords:true},{month:'2026-09',hasRecords:true}],leaders:args.p_month?{...rows,tank:{nick:'지난달우승자',score:25}}:rows}:rows};}};
 window.designFixture={render:H,state:g,auth:D,model:$,actions:sr,rankReads,rank(){OjjudaGameRankings.mount(document.querySelector('[data-arcade-rank-root]'),{client:rankClient,owner:'fixture',games:{mines:{name:'지뢰찾기',unit:'점'},runner:{name:'쭈 달리기',unit:'점'},stacker:{name:'탑 쌓기',unit:'층'},mole:{name:'두더지잡기',unit:'점'},tank:{name:'탱크게임',unit:'승'}},onOpenGame:id=>window.openedGame=id});}};
 designFixture.rank();gm(()=>{});designFixture.navigation=worldNavigation;
 `+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',timezoneId:'America/Los_Angeles'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});if(u.pathname==='/park/')return route.fulfill({contentType:'text/html',body:read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.includes('/app/world/world-themes.js')?tag:'')});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.designFixture);
 const fits=async(label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' fits viewport');
 await page.evaluate(()=>document.documentElement.dataset.worldTheme='classic');await fits('desktop arcade');
 assert.equal(await page.locator('.sidenav').isVisible(),true);assert.equal(await page.locator('.bottomnav').isVisible(),false);
 const soloGames=['chacha_rush','solitaire','archery','sacheonseong','mines','saetbyeol','mole','runner','stacker','breakout','spot','screw'];
 assert.deepEqual(await page.locator('[data-arcade-games=solo] .gbtn').evaluateAll(buttons=>buttons.map(button=>({id:button.dataset.v,images:button.querySelectorAll('.ge img').length}))),soloGames.map(id=>({id,images:1})),'solo cards retain exactly their intended games and cover images');
 assert.equal(await page.locator('[data-arcade-games=multi] [data-v=onecard]').count(),1,'One Card belongs to the multiplayer catalog');
 assert.equal(await page.locator('[data-arcade-games] [data-v=onecard]').count(),1,'One Card is not duplicated in the solo catalog');
 assert.deepEqual(await page.locator('[data-arcade-games]').evaluateAll(grids=>grids.map(grid=>grid.dataset.arcadeGames)),['solo','multi'],'Arcade contains game categories only');
 assert.equal(await page.locator('[data-arcade-games=test]').count(),0,'daily tools have moved out of Arcade');
 assert.equal(await page.locator('[data-arcade-games] [data-v=recommendations]').count(),0,'member recommendations are reached through the certified directory');
 assert.equal(await page.locator('[data-arcade-games] [data-v=archery]').count(),1,'Archery appears once across all game categories');
 assert.equal(await page.locator('[data-arcade-games=solo] [data-v=archery] .game-test-badge').count(),0,'released archery has no test badge');
 assert.equal(await page.locator('[data-arcade-adult]').count(),0,'guests have no adult section');
 assert.equal(await page.getByRole('button',{name:'사천성',exact:true}).count(),1);
 assert.equal(await page.locator('.arcade-social').isVisible(),true);
 assert.equal(await page.locator('.arcade-welcome').count(),0,'theme artwork belongs to the rankings background');
 assert.equal(await page.locator('.arcade-home>.world-page-heading,.arcade-home [data-theme-status]').count(),0,'arcade omits the decorative introduction');
 assert.equal(await page.getByText('오늘의 작은 즐거움',{exact:false}).count(),0);
 assert.equal(await page.locator('.arcade-social .arcade-status [data-act="pl-channel"]').isVisible(),true,'channel changes live inside the multiplayer room panel');
 assert.equal(await page.locator('.arcade-social [data-arcade-rooms]').isVisible(),true);
 assert.equal(await page.locator('#plog,#pmsg,[data-act=pl-send],[data-act=pl-react],.arcade-welcome [data-tab=park]').count(),0);
 const brand=await page.locator('.side>.brand').boundingBox(),nav=await page.locator('.sidenav').boundingBox();assert.ok(Math.abs((brand.y+brand.height/2)-(nav.y+nav.height/2))<3,'brand and desktop menu share one row');
 await page.screenshot({path:path.join(proof,'arcade-desktop.png'),fullPage:true});
 // The embedded rank carousel was retired: the Arcade now links directly to
 // the complete game ranking page, which owns the tables and paging behavior.
 const rankEntry=page.locator('.arcade-ranking-entry');
 assert.equal(await rankEntry.count(),1,'the Arcade has one compact ranking link');
 assert.equal(await rankEntry.getAttribute('href'),'/features/arcade/all-rankings.html');
 assert.match(await rankEntry.textContent(),/게임순위/);
 assert.equal(await page.locator('.board-leaders,.board-rank-controls').count(),0,'the old embedded ranking carousel is absent');
 for(const width of [320,390,768,900,1280]){
  await page.setViewportSize({width,height:900});await fits('arcade '+width);assert.equal(await page.locator(width<900?'.bottomnav':'.sidenav').isVisible(),true);
  assert.equal(await page.locator('[data-arcade-games] .game-version').count(),0,'release metadata stays out of the menu at '+width);
  assert.doesNotMatch(await page.locator('[data-arcade-games]').allTextContents().then(t=>t.join(' ')),/v\d+\.\d+\.\d+/);
  if(width<=600){
   const grid=await page.locator('[data-arcade-games=solo]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
   assert.equal(grid,3,'mobile keeps exactly three game buttons per row');
   const labels=await page.locator('[data-arcade-games] .gbtn>span:last-child').evaluateAll(nodes=>nodes.map(n=>({size:parseFloat(getComputedStyle(n).fontSize),weight:parseInt(getComputedStyle(n).fontWeight),fits:n.scrollWidth<=n.clientWidth+1})));
   assert.ok(labels.every(n=>n.size>=12.5&&n.weight>=700&&n.fits),'larger bold game names fit every mobile card');
   const rowGaps=await page.locator('[data-arcade-games=solo] .gbtn').evaluateAll(cards=>{
    const gaps=new Map();
    for(const card of cards){
     const box=card.getBoundingClientRect(),text=document.createRange();
     text.selectNodeContents(card.lastElementChild);
     const gap=box.bottom-text.getBoundingClientRect().bottom;
     gaps.set(box.top,Math.min(gap,gaps.get(box.top)??Infinity));
    }
    return [...gaps.values()];
   });
   assert.ok(rowGaps.every(gap=>gap>=0&&gap<=15),'mobile rows end just below their tallest caption at '+width);
   const colors=await page.locator('[data-arcade-games=solo] .gbtn .ge').evaluateAll(nodes=>new Set(nodes.map(n=>getComputedStyle(n).backgroundImage)).size);
   assert.ok(colors>=4,'game covers are visually distinct');
  }
  if(width<900){
   const buttons=await page.locator('.bottomnav>button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{id:n.dataset.tab,label:n.querySelector(':scope>span').textContent,x:r.x,width:r.width,height:r.height};}));
   assert.deepEqual(buttons.map(({id,label})=>({id,label})),[{id:'hub',label:'아지트'},{id:'arcade',label:'오락실'},{id:'my',label:'설정'}],'the main menu has exactly its three current destinations');
   assert.ok(buttons.every(b=>b.width>=44&&b.height>=44),'every mobile menu has a reachable touch area');
   assert.ok(Math.max(...buttons.map(b=>b.width))-Math.min(...buttons.map(b=>b.width))<1,'mobile menus have equal widths');
   assert.ok(buttons[0].x<width/4&&buttons.at(-1).x>width/2&&buttons.at(-1).x+buttons.at(-1).width<=width+1,'all three mobile menus span the bottom bar without overflow');
  }
 }
 await page.setViewportSize({width:390,height:850});await page.evaluate(()=>{document.documentElement.dataset.worldTheme='autumn';designFixture.rank();});await page.screenshot({path:path.join(proof,'arcade-mobile.png'),fullPage:true});
 await page.locator('.bottomnav [data-tab=hub]').click();
 assert.equal(await page.evaluate(()=>designFixture.state.tab),'hub');
 assert.equal(await page.locator('.bottomnav [aria-current=page]').getAttribute('data-tab'),'hub','the Agit click selects its own destination');
 assert.deepEqual(await page.locator('[data-act=agit-daily]').evaluateAll(buttons=>buttons.map(button=>({id:button.dataset.v,images:button.querySelectorAll('img').length}))),[{id:'group',images:1},{id:'restaurants',images:1},{id:'festival',images:1}],'Hub preserves the current daily card order and covers');
 assert.equal(await page.locator('#agit-daily h2').innerText(),'일상 둘러보기');
 assert.equal(await page.locator('#agit-daily a[href="/features/fanpages/index.html"]').count(),1,'Fanpage remains visible between Group and Restaurants');
 assert.deepEqual(await page.locator('[data-act=agit-daily][aria-label*="회원 전용"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.v)),['group'],'only Group requires membership in the current daily tools');
 const dailyCovers=page.locator('#agit-daily img, .agit-reading-grid img');
 assert.deepEqual(await dailyCovers.evaluateAll(images=>images.map(image=>image.getAttribute('src'))),
  ['group','fanpages','restaurants','festival','biorhythm','tarot','saju'].map(id=>'/features/home/daily-'+id+'.webp'));
 const readings=page.locator('.agit-reading-grid > a');
 assert.deepEqual(await readings.locator('strong').allTextContents(),['바이오리듬','타로','사주']);
 for(const width of [320,768,390]){
  await page.setViewportSize({width,height:850});
  const boxes=await readings.evaluateAll(cards=>cards.map(card=>{
   const {x,y,width}=card.getBoundingClientRect();return {x,y,width,fits:card.scrollWidth<=card.clientWidth+1};
  }));
  assert.ok(boxes.every((b,i)=>b.y===boxes[0].y&&b.width>=44&&b.fits&&(!i||b.x>=boxes[i-1].x+boxes[i-1].width-1)),'three readable links share one row at '+width);
  await fits('Hub '+width);
 }
 // The compact reciprocal links live together at the end of Settings.
 await page.locator('.bottomnav [data-tab=my]').click();
 const serviceBanners=page.locator('ojjuda-service-banners[current="agit"]');
 await serviceBanners.locator('.ojjuda-service-banner').first().waitFor();
 assert.equal(await serviceBanners.evaluate(node=>node.parentElement.lastElementChild===node),true,'service banners are last in Settings');
 assert.deepEqual(await serviceBanners.locator('.ojjuda-service-banner').evaluateAll(links=>links.map(link=>link.dataset.service)),['park','pajang']);
 for(const width of [320,390,750]){
  await page.setViewportSize({width,height:850});
  const boxes=await serviceBanners.locator('.ojjuda-service-banner').evaluateAll(links=>links.map(link=>{
   const {x,y,width,height}=link.getBoundingClientRect();return {x,y,width,height,fits:link.scrollWidth<=link.clientWidth+1};
  }));
  assert.ok(boxes.every(box=>box.fits&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1),'service banners fit at '+width);
  assert.ok(Math.abs(boxes[0].y-boxes[1].y)<=1&&boxes[1].x>=boxes[0].x+boxes[0].width,'both service banners share one row at '+width);
 }
 await page.setViewportSize({width:390,height:850});
 // Read rendered colors, not only the theme attribute or illustration URL.
 const placeAppearances={};
 for(const appearance of ['light','dark']){
  await page.emulateMedia({colorScheme:appearance});
  const samples=[];
  for(const [theme,date] of calendarCases){
   await selectCalendarDate(page,date);
   const colors=await palette(page,{park:'.ojjuda-service-banner[data-service="park"]',pajang:'.ojjuda-service-banner[data-service="pajang"]'});
   assert.equal(colors.theme,theme);assert.equal(colors.body,colors.bg,'Agit background follows '+theme);
   for(const name of ['park','pajang']){
    assert.notEqual(colors.nodes[name].image,'none',name+' has its own visible background');
    if(samples.length)assert.deepEqual(colors.nodes[name],samples[0].nodes[name],name+' keeps its identity across calendar themes in '+appearance);
   }
   assert.notEqual(colors.nodes.park.image,colors.nodes.pajang.image,'Park and Pajang remain visually distinct in '+appearance);
   samples.push(colors);
  }
  distinctPalettes(samples,'Agit '+appearance,['bg','accent']);
  placeAppearances[appearance]=samples[0].nodes;
 }
 for(const name of ['park','pajang']){
  assert.notEqual(placeAppearances.light[name].image,placeAppearances.dark[name].image,name+' entrance background adapts to dark mode');
  assert.notEqual(placeAppearances.light[name].color,placeAppearances.dark[name].color,name+' entrance text adapts to dark mode');
 }
 await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>OjjudaThemes.sync());
 await page.locator('.bottomnav [data-tab=my]').click();assert.equal(await page.locator('[data-ju-shop-open]').count(),0);
 await page.locator('.my-hub').waitFor();
 assert.equal(await page.evaluate(()=>designFixture.state.tab),'my');
 assert.equal(await page.locator('.world-settings-header h2').innerText(),'아지트 설정');
 assert.equal(await page.getByRole('button',{name:'설정 닫기',exact:true}).getAttribute('data-act'),'navigation-back','closing settings uses the actual previous visit');
 assert.equal(await page.locator('.bottomnav [aria-current=page]').getAttribute('data-tab'),'my','the Settings click opens and selects Settings');
 assert.equal(await page.locator('[data-guest-account="agit"]').count(),1,'guest settings expose the signup and login entry');
 assert.equal(await page.locator('[data-my-group=profile]').count(),0,'guests do not receive a member profile editor');
 assert.equal(await page.locator('[data-my-group=themes],.settings-theme-section,[data-world-theme-settings],[data-act=theme],[data-act=accent]').count(),0,'all manual appearance controls are removed');await fits('mobile settings');
 await page.screenshot({path:path.join(proof,'settings-mobile.png'),fullPage:true});
 // Check Hub -> Settings -> Back before subsection visits add their own history.
 await page.getByRole('button',{name:'설정 닫기',exact:true}).click();
 await page.locator('.agit-hub').waitFor();
 assert.equal(await page.evaluate(()=>designFixture.state.tab),'hub','the settings close button returns to the actual previous Agit visit');
 assert.equal(await page.locator('.bottomnav [aria-current=page]').getAttribute('data-tab'),'hub','the restored Agit is selected');
 assert.equal(await page.locator('.world-settings-page').count(),0,'the settings screen is closed after history traversal');
 await page.locator('.bottomnav [data-tab=my]').click();await page.locator('.my-hub').waitFor();
 await page.evaluate(()=>{
  const auth=designFixture.auth;
  designFixture.guestAuth={online:auth.online,user:auth.user,parkGuest:auth.parkGuest,isAdmin:auth.isAdmin};
  Object.assign(auth,{online:true,parkGuest:false,isAdmin:false,user:{id:'00000000-0000-4000-8000-000000000002',is_anonymous:false,email:'design-member@example.invalid'}});
  designFixture.render();
 });
 assert.equal(await page.locator('[data-guest-account="agit"]').count(),0,'signed-in settings retain the existing member menu');
 await page.locator('[data-my-group=profile] summary').click();await page.locator('#p-bio').fill('바뀌지 않아야 하는 작성 내용');await page.evaluate(()=>OjjudaThemes.sync());assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용');
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용','system appearance change preserves the draft');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.documentElement.dataset.theme);assert.equal(await page.locator('#p-bio').inputValue(),'바뀌지 않아야 하는 작성 내용');
 await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>{document.querySelectorAll('details.my-menu-group').forEach(n=>n.open=false);});await fits('desktop settings');
 const settingsLayout=await page.locator('.world-settings-page').evaluate(node=>{
  const {width}=node.getBoundingClientRect();
  const groups=[...node.querySelectorAll('.ojjuda-settings-group')].map(group=>{const {x,y,width,height}=group.getBoundingClientRect();return{x,y,width,height};});
  const rowHeights=[...node.querySelectorAll('.ojjuda-settings-row')].map(row=>row.getBoundingClientRect().height);
  return{width,groups,rowHeights};
 });
 assert.ok(settingsLayout.width>=749&&settingsLayout.width<=751,'desktop settings use one readable 750px panel');
 assert.ok(settingsLayout.groups.every((group,index)=>Math.abs(group.x-settingsLayout.groups[0].x)<=1&&Math.abs(group.width-settingsLayout.groups[0].width)<=1&&(!index||group.y>=settingsLayout.groups[index-1].y+settingsLayout.groups[index-1].height-1)),'desktop setting groups stay aligned in one column');
 assert.ok(settingsLayout.rowHeights.every(height=>height>=44),'settings rows retain touch-friendly targets');
 await page.screenshot({path:path.join(proof,'settings-desktop.png'),fullPage:true});
 await page.evaluate(()=>Object.assign(designFixture.auth,designFixture.guestAuth));
 await page.locator('.sidenav [data-tab=hub]').click();await page.locator('.agit-hub').waitFor();
 // Inspect every theme in the real Arcade, including the dark variant.
 await page.locator('.sidenav [data-tab=arcade]').click();await page.evaluate(()=>{clearInterval(designFixture.state.placeT);designFixture.rank();});
 assert.equal(await page.evaluate(()=>designFixture.state.tab==='place'&&designFixture.state.place?.id==='arcade'),true);
 assert.equal(await page.locator('.sidenav [aria-current=page]').getAttribute('data-tab'),'arcade','the Arcade click returns to its real game menu');
 const original=read('brand/ojjuda-logo.svg').match(/d="[^"]+"/g);
 const shapes=await page.locator('.side .ojjuda-theme-logo path').evaluateAll(nodes=>nodes.map(n=>'d="'+n.getAttribute('d')+'"'));
 assert.deepEqual(shapes,original,'logo silhouette and smile remain the original paths');
 const keys=await page.evaluate(()=>OjjudaThemes.order);
 for(const key of keys){await page.evaluate(k=>document.documentElement.dataset.worldTheme=k,key);await fits(key);assert.equal(await page.locator('.side .ojjuda-theme-logo').evaluate(n=>getComputedStyle(n).color===getComputedStyle(n.querySelector('path')).fill),true,'logo fill follows the theme');assert.ok(await page.locator('[data-arcade-rank-root]').evaluate(n=>getComputedStyle(n,':before').backgroundImage.includes('/assets/design/')));}
 await page.evaluate(()=>document.documentElement.dataset.worldTheme='christmas');await page.screenshot({path:path.join(proof,'christmas-desktop.png'),fullPage:true});
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await fits('dark theme');await page.screenshot({path:path.join(proof,'dark-desktop.png'),fullPage:true});
 // The live host and the real Park stylesheet order must resolve the same palette.
 await page.emulateMedia({colorScheme:'light'});
 await page.locator('.sidenav [data-tab=my]').click();
 await page.locator('.ojjuda-service-banner[data-service="park"]').click();
 await page.waitForFunction(()=>document.documentElement.classList.contains('world-park-active'));
 await page.waitForFunction(()=>document.querySelector('.park-app iframe')?.contentWindow?.OjjudaThemes);
 const park=page.frames().find(frame=>new URL(frame.url()).pathname==='/park/');
 assert.ok(park,'Park is mounted in the actual host iframe');
 await park.waitForFunction(()=>window.OjjudaThemes);
 for(const appearance of ['light','dark']){
  await page.emulateMedia({colorScheme:appearance});const samples=[];
  for(const [theme,date] of calendarCases){
   await selectCalendarDate(page,date);await selectCalendarDate(park,date);
   const host=await palette(page),inside=await palette(park,{primary:'#publish-card',reply:'.reply-heading [data-compose=reply]'});
   assert.equal(inside.theme,theme);assert.equal(inside.body,inside.bg);
   assert.deepEqual([inside.bg,inside.accent,inside.surface],[host.bg,host.accent,host.surface],theme+' Park host/frame match');
   assert.equal(inside.nodes.primary.background,inside.accent,'Park primary button follows '+theme);
   assert.equal(inside.nodes.reply.color,inside.accentInk,'Park reply button text follows '+theme);
   samples.push(inside);
  }
  distinctPalettes(samples,'Park '+appearance,['bg','accent','nodes.primary.background','nodes.reply.color']);
  const weather=[];
  for(const kind of [null,'rain','snow']){
   await selectCalendarDate(page,'2026-10-15',kind);await selectCalendarDate(park,'2026-10-15',kind);
   const host=await palette(page),inside=await palette(park);
   assert.equal(inside.weather,kind||'');assert.deepEqual([inside.bg,inside.accent],[host.bg,host.accent]);weather.push(inside);
  }
  assert.equal(new Set(weather.map(colors=>colors.bg)).size,3,'clear, rain and snow have distinct backgrounds');
  await selectCalendarDate(park,'2026-12-25','snow');assert.equal((await palette(park)).weather,'','Christmas keeps its holiday palette');
 }
 assert.deepEqual(errors,[]);await context.close();console.log('PASS: real redesigned renderer, responsive menus, artwork, all theme palettes, keyboard-safe monthly rankings, browser/native history back, automatic-only themes, draft preservation and ranking pagination');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

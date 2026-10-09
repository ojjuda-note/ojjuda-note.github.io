const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let html=fs.readFileSync(path.join(root,'world.html'),'utf8');
const boot=html.indexOf('j1(()=>H());gm(');assert(boot>0);
html=html.slice(0,boot)+`window.entryTest={open:Al,close:El,board:vn,billiards:xn,closeBoard:dt,current:()=>R,
 friends(){D.online=true;D.user={id:'me'};D.boardReady=true;P.loaded=true;P.at=Date.now();P.friends=[{id:'offline',nickname:'가람'},{id:'online',nickname:'초록친구'},{id:'unsafe',nickname:'<img src=x onerror=alert(1)>'}];Ze={state:'joined',presenceState:()=>({online:[{}]})};Xs=async()=>true;xh=async()=>true;jgOnlineReady=async()=>true;$h=async()=>[];window.OjjudaArcadeRooms=null;S={rpc:async(name,args)=>{window.invited={name,args};return {data:'invite-id',error:null}}};},
 presence(state){Ze.presenceState=()=>state;window.dispatchEvent(new Event('ojjuda:friends-presence'));}
};g.tab='friends';H();`+html.slice(html.indexOf('</script>',boot));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
try{fs.mkdirSync('/tmp/game-entry-proof',{recursive:true});
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1280,height:900}]){
 const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({body:html,contentType:'text/html'});if(u.pathname==='/config.js')return route.fulfill({body:'window.OJJUDA_CONFIG={};',contentType:'text/javascript'});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
 await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.entryTest);
 let expected;
 for(const id of ['mole','runner','stacker','breakout','screw']){
 await page.evaluate(id=>entryTest.open(id),id);await page.locator('#gov .game-entry').waitFor();
 const metrics=await page.locator('#gov .game-entry').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius,title:getComputedStyle(el.querySelector('.ge-title')).fontSize,width:Math.round(el.getBoundingClientRect().width)}));
 expected??=metrics;assert.deepEqual(metrics,expected,id+': same entry design');
 const card=page.locator('#gov .game-entry');assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 if(viewport.width===390)await page.screenshot({path:'/tmp/game-entry-proof/'+id+'.png'});
 if(id!=='screw'){await page.locator('[data-g=start]').click();await page.waitForFunction(()=>entryTest.current()?.running);assert.equal(await page.locator('#gov .game-entry').count(),0);}
 await page.evaluate(()=>entryTest.close());
 }
 await page.evaluate(()=>entryTest.friends());
 for(const id of ['chess','janggi','carom4','carom3','pool8']){
 await page.evaluate(id=>id==='chess'||id==='janggi'?entryTest.board(id):entryTest.billiards(id),id);await page.locator('.ge-board-entry[data-entry-ready]').waitFor();
 await page.locator('[data-entry-mode=opponent]').click();await page.locator('[data-friend-id=online]').waitFor();
 assert.equal(await page.locator('[data-friend-id]').first().getAttribute('data-friend-id'),'online');
 assert.equal(await page.locator('[data-friend-id=online] .ge-presence').textContent(),'접속 중');
 assert.equal(await page.locator('[data-friend-id=unsafe] img').count(),0);
 await page.locator('[data-friend-search]').fill('초록');assert.equal(await page.locator('[data-friend-id]:visible').count(),1);
 await page.locator('[data-friend-search]').fill('');
 if(id==='chess'){
 await page.evaluate(()=>entryTest.presence({offline:[{}]}));assert.equal(await page.locator('[data-friend-id]').first().getAttribute('data-friend-id'),'offline');
 assert.equal(await page.locator('[data-friend-id=online] .ge-presence').textContent(),'오프라인');await page.evaluate(()=>entryTest.presence({online:[{}]}));
 await page.locator('[data-friend-id=online] button').click();await page.waitForFunction(()=>window.invited);assert.deepEqual(await page.evaluate(()=>window.invited),{name:'game_invite',args:{p_kind:'chess',p_to:'online'}});
 }
 if(viewport.width===390&&id==='chess')await page.screenshot({path:'/tmp/game-entry-proof/friend-invite.png'});
 await page.locator('[data-entry-mode=computer]').click();assert.equal(await page.locator('[data-entry-panel=opponent]').isVisible(),false);
 if(viewport.width===390)await page.screenshot({path:'/tmp/game-entry-proof/'+id+'.png'});
 await page.evaluate(()=>entryTest.closeBoard());
 }
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: consistent entry cards at 320/390/1280px, four game starts, five opponent menus, live friend sorting, search, safe names and exact invite recipient');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-places.js','world-park-notes.js'].map(read).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.parkFixture={rows:[],calls:[],hold:false,fail:false,pending:[],state:g,
   enter(id){xf(id,1);clearInterval(g.placeT);g.placeT=null;}, refresh:()=>worldParkNotes.refresh(),
   user(id){D.user=id?{id}:null;worldParkNotes.sync();}, leave(){g.tab='friends';H();},
   repaint:()=>Bf(),changed:()=>eo(),close:()=>worldParkNotes.close()};
 S={schema(name){return {rpc(rpc,params){return {abortSignal(signal){
   parkFixture.calls.push({name,rpc,params});
   return new Promise((resolve,reject)=>{
     const done=()=>parkFixture.fail?reject(new Error('offline')):resolve({data:parkFixture.rows,error:null});
     if(parkFixture.hold)parkFixture.pending.push(done);else done();
   });
 }}}}}};
 D.isAdmin=false;g.tab='home';H();
 `+world.slice(world.indexOf('</script>',boot));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const card=(n,extra={})=>({id:id(n),kind:'memo',display_name:'즐거운 조개',body:'오늘도 반가워요.\n공원에서 만나요!',tags:['응원','오늘','산책','위로','행복'],background_key:'10',created_at:new Date(Date.now()-60000*n).toISOString(),like_count:2,reply_count:3,...extra});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext({viewport:{width:360,height:800}});
 await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(url.pathname==='/note/')return route.fulfill({contentType:'text/html',body:read('note/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',()=>'<script>'+read('note/preview.js')+'</script></body>')});
   const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.parkFixture);
 await page.evaluate(rows=>{parkFixture.rows=rows;parkFixture.enter('park');},[card(1),card(2),card(1),card(3,{body:null,kind:'event'}),card(4,{tags:['19금']})]);
 await page.waitForSelector('#plog .park-note-card');
 assert.equal(await page.locator('#plog .park-note-card').count(),2,'visible public cards only, deduplicated');
 assert.deepEqual(await page.locator('[data-park-card-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.parkCardId)),[id(2),id(1)],'notes appear oldest to newest');
 assert.match(await page.locator('[data-park-card-id]').first().textContent(),/공감 2 · 답글 3/);
 assert.deepEqual(await page.evaluate(()=>parkFixture.calls[0]),{name:'ojjuda_note',rpc:'list_cards',params:{p_sort:'recent',p_lat:null,p_lon:null,p_radius_m:30000,p_limit:20,p_cursor:{offset:0}}});
 await page.locator('#pmsg').fill('카드 아래에서 대화해요');await page.locator('[data-act="pl-send"]').click();
 assert.ok((await page.locator('#plog').textContent()).includes('카드 아래에서 대화해요'));
 assert.equal(await page.locator('#plog .park-note-card').count(),2,'chat updates retain cards');
 await page.locator('[data-park-note]').first().click();
 assert.match(await page.locator('.park-note-dialog iframe').getAttribute('src'),new RegExp('park=1&card='+id(2)));
 const detailFrame=await (await page.locator('.park-note-dialog iframe').elementHandle()).contentFrame();
 await detailFrame.waitForFunction(()=>typeof canCloseParkNote==='function');
 assert.equal(await detailFrame.evaluate(()=>{openCard=id=>{window.openedParkCard=id};authKnown=ready=true;consumeInitialCard();return openedParkCard;}),id(2));
 await page.locator('.park-note-dialog button').click();assert.equal(await page.locator('.park-note-dialog').count(),0);
 await page.locator('[data-park-note-write]').click();assert.equal(await page.locator('.park-note-dialog iframe').getAttribute('src'),'/note/?park=1&compose=memo');
 const composeFrame=await (await page.locator('.park-note-dialog iframe').elementHandle()).contentFrame();
 await composeFrame.waitForFunction(()=>typeof canCloseParkNote==='function');
 assert.equal(await composeFrame.evaluate(()=>{openComposer=mode=>{window.openedParkComposer=mode};authKnown=ready=true;consumeInitialCard();return openedParkComposer;}),'memo');
 assert.equal(await composeFrame.evaluate(()=>{backdrop.hidden=false;text.value='아직 작성 중';window.confirm=()=>false;return canCloseParkNote();}),false);
 await composeFrame.evaluate(()=>{backdrop.hidden=true;});
 await page.locator('.park-note-dialog button').focus();
 await page.keyboard.press('Escape');assert.equal(await page.locator('.park-note-dialog').count(),0);
 // Renders and background refreshes must preserve draft chat text and scroll position.
 await page.evaluate(rows=>{parkFixture.rows=rows;},Array.from({length:20},(_,i)=>({id:id(i+10),...card(i+10)})));
 await page.evaluate(()=>parkFixture.refresh());await page.locator('#pmsg').fill('아직 보내지 않은 말');
 await page.locator('#plog').evaluate(el=>el.scrollTop=75);
 await page.evaluate(()=>parkFixture.refresh());
 assert.equal(await page.locator('#pmsg').inputValue(),'아직 보내지 않은 말');
 assert.ok(Math.abs(await page.locator('#plog').evaluate(el=>el.scrollTop)-75)<2);
 for(const width of [320,768,1280]){await page.setViewportSize({width,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': no horizontal overflow');}
 await page.setViewportSize({width:360,height:800});
 await page.locator('#plog').scrollIntoViewIfNeeded();await page.locator('#plog').evaluate(el=>el.scrollTop=0);
 assert.ok(await page.locator('.park-note-card').first().evaluate(n=>n.getBoundingClientRect().height > 280),'cards do not flex-shrink inside chat');
 await page.screenshot({path:'/tmp/ojjuda-park-notes-chat.png',fullPage:true});
 // Escaping protects every dynamic preview field.
 await page.evaluate(rows=>{parkFixture.rows=rows;},[card(5,{display_name:'<img src=x onerror=alert(1)>',body:'<script>bad()</script>',tags:['<svg/onload=bad()>'],photo_key:"10');background:red"})]);
 await page.evaluate(()=>parkFixture.refresh());assert.equal(await page.locator('#plog .park-note-card img,#plog .park-note-card script,#plog .park-note-card svg').count(),0);
 assert.ok((await page.locator('#plog').textContent()).includes('<script>bad()</script>'));
 // Account changes and leaving park discard pending results immediately.
 await page.evaluate(()=>{parkFixture.hold=true;void parkFixture.refresh();parkFixture.user('other');});
 assert.equal(await page.locator('.park-note-card').count(),0);
 await page.evaluate(()=>{parkFixture.enter('cafe');parkFixture.pending.splice(0).forEach(done=>done());});
 assert.equal(await page.locator('.park-note-card,.park-note-toolbar').count(),0);
 await page.evaluate(()=>{parkFixture.hold=false;parkFixture.fail=true;parkFixture.enter('park');});
 await page.waitForFunction(()=>document.querySelector('#plog').textContent.includes('불러오지 못했어요'));
 assert.equal(await page.locator('.park-note-card').count(),0);
 await page.evaluate(rows=>{parkFixture.fail=false;parkFixture.rows=rows;},[card(9)]);
 await page.locator('[data-park-note-refresh]').click();await page.waitForSelector('.park-note-card');
 await page.evaluate(()=>{parkFixture.rows=[];return parkFixture.refresh();});assert.match(await page.locator('#plog').textContent(),/아직 공개된 노트가 없어요/);
 assert.deepEqual(errors,[]);
 console.log('PASS: park chat cards, public RPC, chronological order, deduplication, channel chat, modal navigation, draft/scroll preservation, responsive layout, escaping, account/room races and retry');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

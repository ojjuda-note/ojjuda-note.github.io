const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const notice='오쭈다월드는 지금 베타예요. 고장 난 곳이나 바라는 기능을 알려주시면 다음 업데이트에 반영할게요.';
for(const from of ['/park/','/park/index.html?card=abc#reply','/note/?compose=memo']){
 const url=new URL(from,'https://fixture.test');let redirected;
 const scope={URL,location:{href:url.href,origin:url.origin,replace:href=>redirected=new URL(href)}};scope.window=scope;scope.parent=scope;
 vm.runInNewContext(read('park/route.js'),scope);
 assert.equal(redirected.pathname,'/world.html');assert.equal(redirected.searchParams.get('place'),'park');assert.equal(redirected.hash,url.hash);
 for(const key of ['card','compose'])assert.equal(redirected.searchParams.get(key),url.searchParams.get(key));
}
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-places.js','world-park-notes.js'].map(read).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.noticeFixture={set(value){wt.notice=value;H()},tab(value){g.tab=value;H()},open:()=>sr['notice-open'](),close:dt};
 D.isAdmin=false;g.tab='friends';H();worldParkNotes.route();D.online=true;wt.notice=${JSON.stringify(notice)};H();
 `+world.slice(world.indexOf('</script>',boot));
const identity=`authKnown=ready=true;session={user:{id:'fixture-member'}};myIdentity={gender:'male'};myIdentityReady=true;myGender='male';updateAuth();
 document.getElementById('connection-status').hidden=true;
 document.getElementById('feed-list').replaceChildren(...Array.from({length:6},(_,i)=>cardElement({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),kind:'memo',body:'공원에서 나누는 오늘의 이야기 '+(i+1),tags:['일상'],background_key:'plain',created_at:'2026-10-04T09:00:00Z'})));
 window.loadNoticeStateFixture=async()=>{noteRpc=async()=>({notice:'서버의 공통 공지',is_restricted:false});await loadNoteState();};`;
const park=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',()=>'<script>'+['park/route.js','note/preview.js','note/navigation.js'].map(read).join('\n')+'\n'+identity+'\n'+read('park/integration.js')+'</script></body>');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:850}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(url.pathname==='/park/')return route.fulfill({contentType:'text/html',body:park});
   const file=path.join(root,url.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/world.html?place=park');
  const iframe=page.locator('[data-park-app] iframe');await iframe.waitFor();
  const frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.OjjudaParkFull?.navigate);
  await frame.evaluate(()=>loadNoticeStateFixture());
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:850});
   assert.equal(await page.locator('[data-act="notice-open"]:visible').count(),1,width+': one common notice');
   assert.equal(await frame.locator('#note-announcement,.note-announcement').count(),0,width+': no second Park announcement');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': shared notice fits');
   assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': Park fits');
   if(process.env.SERVICE_NOTICE_SCREENSHOT_DIR){fs.mkdirSync(process.env.SERVICE_NOTICE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SERVICE_NOTICE_SCREENSHOT_DIR,`service-notice-${width}.png`)});}
   await page.locator('[data-act="notice-open"]').click();
   assert.ok((await page.locator('#modal-root').textContent()).includes(notice),'whole announcement is accessible');await page.evaluate(()=>noticeFixture.close());
  }
  await page.evaluate(()=>noticeFixture.set('공지 <script>window.noticeInjection=true</script>'));
  assert.equal(await page.locator('.nb-text').textContent(),'공지 <script>window.noticeInjection=true</script>');assert.equal(await page.evaluate(()=>window.noticeInjection),undefined);
  await page.evaluate(()=>noticeFixture.set(''));assert.equal(await page.locator('[data-act="notice-open"]').count(),0,'clearing notice removes the banner');
  await page.evaluate(value=>{noticeFixture.set(value);noticeFixture.tab('my')},notice);
  assert.equal(await page.locator('[data-act="notice-open"]:visible').count(),1,'menu shares the same notice');
  // Old cached HTML may still create its details block; new CSS and legacy script suppress it.
  const cached=await context.newPage();await cached.setContent('<details class="note-announcement" id="note-announcement"><summary>이전 공지</summary></details>');
  await cached.addStyleTag({content:read('note/features.css')});assert.equal(await cached.locator('#note-announcement').isVisible(),false);
  await cached.addScriptTag({content:read('note/notice-ticker.js')});await cached.locator('#note-announcement').evaluate(el=>el.hidden=false);assert.equal(await cached.locator('#note-announcement').isVisible(),false,'cached preview cannot re-show the old notice');
  assert.deepEqual(errors,[]);console.log('PASS: direct Park entry, one shared notice at 320/390/1280, full text modal, clear/escape behavior, Park state compatibility and cached-page suppression');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

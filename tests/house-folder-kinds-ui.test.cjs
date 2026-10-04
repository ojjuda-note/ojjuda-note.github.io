const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),makeFixture=require('./fixtures/house-album.cjs'),root=path.resolve(__dirname,'..');
const fixture=`<!doctype html><meta charset="utf-8"><button id="open">우리집</button><script type="module">
import {openHouseTest} from '/house-test/host.js';import {createWorldRecords} from '/house-test/world-records.js';
const make=${makeFixture.toString()};window.fixture=make();window.owner=fixture.owner;
fixture.db.house_posts.push({id:'old-text',user_id:owner,body:'오늘의 첫 기록',folder_id:null,visibility:'me',created_at:'2026-10-01',deleted_at:null});
document.querySelector('#open').onclick=()=>openHouseTest({owner,profile:{nick:'오쭈다',bio:'오늘도 작은 기록을 남겨요.'},authorized:()=>owner===fixture.owner,records:createWorldRecords({client:fixture.client,owner,authorized:()=>owner===fixture.owner})});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});if(u.pathname==='/proof.ttf'&&process.env.HOUSE_RECORDS_PROOF_FONT)return route.fulfill({path:process.env.HOUSE_RECORDS_PROOF_FONT});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(process.env.HOUSE_RECORDS_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:FolderProof;src:url(/proof.ttf)}html,body,button,input,textarea,select{font-family:FolderProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('https://fixture.test/fixture');await page.locator('#open').click();await page.frameLocator('iframe').locator('[data-cloud-record-id="old-video"]').waitFor();
  const f=page.frames().find(frame=>frame.url().includes('/house-test/index.html')),cloud=f.locator('.cloud-records'),tab=name=>f.getByRole('tab',{name,exact:true}),status=text=>cloud.getByRole('status').filter({hasText:text}).waitFor();
  const folder=id=>f.locator(`[data-folder-id="${id}"]`),card=id=>f.locator(`[data-cloud-record-id="${id}"]`),gear=()=>f.getByRole('button',{name:'우리집 설정',exact:true}).click();
  const proof=async name=>{if(!process.env.HOUSE_FOLDER_PROOF_DIR)return;fs.mkdirSync(process.env.HOUSE_FOLDER_PROOF_DIR,{recursive:true});await f.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(process.env.HOUSE_FOLDER_PROOF_DIR,name+'.png')});};
  const kinds=[['text','노트'],['photo','앨범'],['video','비디오']],created={};
  assert.deepEqual(await f.getByRole('tab').allTextContents(),['전체','노트','앨범','비디오']);
  await proof('home-all');assert.equal(await f.getByRole('button',{name:'+ 새폴더',exact:true}).count(),0);assert.equal(await f.locator('.record-folders').isVisible(),false,'all contains records without a folder bar');
  for(const [kind,name]of kinds){
   await tab(name).click();await f.getByRole('button',{name:'+ 새폴더',exact:true}).click();await cloud.getByLabel('폴더 이름',{exact:true}).fill('일상');await cloud.getByRole('button',{name:'폴더 만들기',exact:true}).click();await status('폴더를 저장');
   created[kind]=await page.evaluate(k=>fixture.db.media_folders.find(row=>row.kind===k&&row.name==='일상').id,kind);
   assert.equal(await folder(created[kind]).getAttribute('aria-pressed'),'true');
   const ids=await f.locator('[data-folder-id]').evaluateAll(els=>els.map(el=>el.dataset.folderId).filter(id=>!['all','none'].includes(id)));
   const expected=await page.evaluate(k=>fixture.db.media_folders.filter(row=>row.kind===k).map(row=>row.id).sort(),kind);assert.deepEqual(ids.sort(),expected,'each folder bar contains only its category');
  }
  assert.equal(new Set(Object.values(created)).size,3,'the same folder name belongs to three independent categories');
  for(const [kind,name]of kinds){await tab(name).click();assert.equal(await folder(created[kind]).getAttribute('aria-pressed'),'true','switching categories restores that category selection');}
  await tab('전체').click();await card('old-video').waitFor();assert.equal(await f.getByRole('button',{name:'+ 새폴더',exact:true}).count(),0);
  // Settings can create a category folder while the all-records tab stays unfiltered.
  await gear();let settings=f.getByRole('dialog',{name:'우리집 설정',exact:true});await settings.getByRole('button',{name:'폴더 관리',exact:true}).click();
  for(const [,name]of kinds){await settings.getByRole('button',{name:name+' 폴더',exact:true}).click();assert.equal(await settings.getByRole('button',{name:'일상 폴더 수정',exact:true}).count(),1);await settings.getByRole('button',{name:'뒤로',exact:true}).click();}
  await settings.getByRole('button',{name:'노트 폴더',exact:true}).click();await settings.getByRole('button',{name:'새 폴더',exact:true}).click();await cloud.getByLabel('폴더 이름',{exact:true}).fill('마음');await cloud.getByRole('button',{name:'폴더 만들기',exact:true}).click();await status('폴더를 저장');assert.equal(await tab('전체').getAttribute('aria-selected'),'true');assert.equal(await cloud.locator('[data-cloud-record-id]').count(),4);
  assert.equal(await page.evaluate(()=>fixture.db.media_folders.find(row=>row.name==='마음').kind),'text');
  // Existing record editors also expose only matching folders from the all-records tab.
  for(const [id,kind,selectName]of [['old-text','text','글 폴더'],['old-photo','photo','파일 폴더'],['old-video','video','파일 폴더']]){
   await card(id).getByRole('button',{name:'설정',exact:true}).click();const values=await cloud.getByRole('combobox',{name:selectName,exact:true}).locator('option').evaluateAll(els=>els.map(el=>el.value).filter(Boolean));
   assert.deepEqual(values.sort(),await page.evaluate(k=>fixture.db.media_folders.filter(row=>row.kind===k).map(row=>row.id).sort(),kind));await cloud.getByRole('button',{name:kind==='text'?'닫기':'취소',exact:true}).click();
  }
  const cdp=await context.newCDPSession(page);
  const touch=async(locator,{hold=620,dx=0,cancel=false}={})=>{await f.waitForFunction(()=>!document.querySelector('.record-status').textContent.includes('불러오는 중'));await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox(),p={x:b.x+b.width/2,y:b.y+b.height/2,id:1};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});if(dx)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+dx}]});await page.waitForTimeout(hold);await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});};
  const menu=label=>f.getByRole('dialog',{name:label,exact:true}),closeMenu=label=>menu(label).getByRole('button',{name:'닫기',exact:true}).click();
  await tab('앨범').click();await folder('all').click();await folder('old-folder').click();assert.equal(await folder('old-folder').getAttribute('aria-pressed'),'true','a short tap still selects a folder');
  await touch(folder('old-folder'),{dx:-24});assert.equal(await menu('폴더 메뉴').count(),0,'moving a finger cancels long press');
  await touch(folder('old-folder'),{hold:80,cancel:true});await page.waitForTimeout(600);assert.equal(await menu('폴더 메뉴').count(),0,'cancelled touches do not open a delayed menu');
  await touch(folder('old-folder'));await menu('폴더 메뉴').waitFor();assert.equal(await menu('기록 메뉴').count(),0);assert.equal(await menu('폴더 메뉴').getByRole('button',{name:'폴더 삭제',exact:true}).isVisible(),true);await proof('folder-menu');await closeMenu('폴더 메뉴');
  await folder('old-folder').click({button:'right'});await menu('폴더 메뉴').waitFor();await closeMenu('폴더 메뉴');
  await folder('old-folder').focus();await page.keyboard.press('ContextMenu');await menu('폴더 메뉴').waitFor();await menu('폴더 메뉴').getByRole('button',{name:'폴더 삭제',exact:true}).click();await cloud.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.evaluate(()=>fixture.db.media_folders.some(row=>row.id==='old-folder')),true,'deletion is not committed without confirmation');
  await touch(folder('old-folder'));await menu('폴더 메뉴').getByRole('button',{name:'폴더 삭제',exact:true}).click();await cloud.getByRole('button',{name:'폴더만 삭제',exact:true}).click();await status('폴더를 삭제');assert.equal(await folder('old-folder').count(),0);assert.deepEqual(await page.evaluate(()=>{const row=fixture.db.media.find(row=>row.id==='old-photo');return [row.folder_id,row.path,row.visibility];}),[null,'member-a/photo.jpg','me']);
  assert.equal(await page.evaluate(()=>fixture.db.media.length),4,'deleting a folder preserves its contents');
  // Each record kind supports touch hold, while tapping and scrolling retain their ordinary behavior.
  await tab('전체').click();await card('old-text').waitFor();
  for(const [id,type]of [['old-text','text'],['old-photo','image'],['old-video','video']]){
   const target=type==='text'?card(id).locator('.record-text-open'):card(id).locator('.record-open');
   await touch(target,{dx:20});assert.equal(await menu('기록 메뉴').count(),0,'scrolling a record never opens its action menu');
   await touch(target);await menu('기록 메뉴').waitFor();assert.equal(await menu('기록 메뉴').getByRole('button',{name:'수정',exact:true}).isVisible(),true);assert.equal(await menu('기록 메뉴').getByRole('button',{name:'삭제',exact:true}).isVisible(),true);assert.equal(await f.locator('dialog:not(.record-context-dialog)').count(),0,'the release after a hold does not open the record viewer');if(type==='text')await proof('record-menu');
   await menu('기록 메뉴').getByRole('button',{name:'수정',exact:true}).click();assert.equal(await cloud.locator('form').isVisible(),true);await cloud.getByRole('button',{name:type==='text'?'닫기':'취소',exact:true}).click();
   await card(id).click({button:'right'});await menu('기록 메뉴').getByRole('button',{name:'삭제',exact:true}).click();await cloud.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await card(id).count(),1,'cancelling retains the record');
  }
  await card('old-photo').locator('.record-open').click();await f.locator('dialog img').waitFor();await page.keyboard.press('Escape');await f.locator('dialog').waitFor({state:'detached'});
  await card('old-text').locator('.record-text-open').focus();await page.keyboard.press('Shift+F10');await menu('기록 메뉴').waitFor();await closeMenu('기록 메뉴');
  await touch(card('old-video').locator('.record-open'));await menu('기록 메뉴').getByRole('button',{name:'삭제',exact:true}).click();await cloud.getByRole('button',{name:'휴지통으로 보내기',exact:true}).click();await status('휴지통으로 옮겼어요');assert.equal(await card('old-video').count(),0);assert.equal(await page.evaluate(()=>fixture.db.house_media_trash.find(row=>row.id==='old-video').path),'member-a/movie.mp4','record delete remains recoverable in trash');
  assert.equal(await page.evaluate(()=>fixture.calls.some(call=>call.remove)),false,'folder and record deletion never remove original stored files');assert.deepEqual(errors,[]);
  console.log('PASS: independent note/album/video folders, all-tab settings creation, per-kind editor destinations and selection, long-press/right-click/keyboard actions, gesture cancellation, record delete confirmation and original retention');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

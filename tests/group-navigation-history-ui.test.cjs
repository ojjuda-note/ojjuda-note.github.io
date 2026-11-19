const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'groups/app.js'),'utf8').replace('void initialize();',`
user={id:'member'};
rooms=[{id:'10000000-0000-4000-8000-000000000001'},{id:'20000000-0000-4000-8000-000000000002'}];
render=()=>{document.getElementById('app').textContent=roomId||'groups';};
loadFeed=async()=>{};showSharedInvitation=async()=>{};
window.groupNavFixture={route,dialog,confirmAction,
 room:index=>route(rooms[index].id),
 dirty(){const d=dialog('작성 중','<textarea>남겨 둘 글</textarea>');d.requestDismiss=()=>confirmAction('지울까요?','',()=>d.close());return d;}
};
render();
`);
async function fixture(browser){
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://group-history.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="app"></main><div id="toast"></div>'}));
 await page.goto('https://group-history.test/before');
 await page.goto('https://group-history.test/groups/');
 await page.evaluate(()=>history.replaceState({retained:'yes'},'',location.href));
 await page.addScriptTag({content:source});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return {page,errors,settle};
}
test('group routes and dialogs consume one real Back step in Chromium',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  {
   const {page,errors}=await fixture(browser);
   await page.evaluate(()=>groupNavFixture.room(0));await page.evaluate(()=>groupNavFixture.room(1));
   await page.goBack();assert.match(page.url(),/#room=1000/);
   await page.goBack();assert.equal(new URL(page.url()).hash,'');
   await page.goForward();assert.match(page.url(),/#room=1000/);
   assert.equal(await page.evaluate(()=>history.state.retained),'yes');
   await page.goBack();await page.goBack();assert.equal(new URL(page.url()).pathname,'/before');
   assert.deepEqual(errors,[]);await page.close();
  }
  for(const manual of [false,true]){
   const {page,errors,settle}=await fixture(browser);
   await page.evaluate(()=>groupNavFixture.dialog('팝업','<p>내용</p>'));
   if(manual)await page.locator('[data-close]').click();else await page.goBack();
   await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
   await settle();assert.equal(new URL(page.url()).pathname,'/groups/');
   await page.goBack();assert.equal(new URL(page.url()).pathname,'/before');
   assert.deepEqual(errors,[]);await page.close();
  }
  {
   const {page,errors,settle}=await fixture(browser);
   await page.evaluate(()=>{const d=groupNavFixture.dialog('완료','<p>내용</p>');d.close();groupNavFixture.room(0);});
   await settle();await page.goBack();assert.equal(new URL(page.url()).hash,'');
   await page.goBack();assert.equal(new URL(page.url()).pathname,'/before');
   assert.deepEqual(errors,[]);await page.close();
  }
  {
   const {page,errors,settle}=await fixture(browser);
   await page.evaluate(()=>groupNavFixture.dirty());await page.goBack();
   await page.locator('[data-no]').waitFor();
   assert.equal(await page.locator('dialog[open]').count(),2);
   await page.locator('[data-no]').click();await settle();
   assert.equal(await page.locator('dialog[open]').count(),1);
   assert.equal(await page.locator('textarea').inputValue(),'남겨 둘 글');
   await page.goBack();await page.locator('[data-yes]').waitFor();await page.locator('[data-yes]').click();
   await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await settle();
   assert.equal(new URL(page.url()).pathname,'/groups/');
   await page.goBack();assert.equal(new URL(page.url()).pathname,'/before');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});

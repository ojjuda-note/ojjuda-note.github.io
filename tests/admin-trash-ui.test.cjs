const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const proof=process.env.TRASH_PROOF_DIR||'/tmp/trash-proof';fs.mkdirSync(proof,{recursive:true});
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;margin:0;padding:20px;background:#f8f8f3;color:#263d31;box-sizing:border-box}.btn{padding:10px 16px;border:1px solid #cdd5ca;border-radius:12px;background:#f5f2e9;color:inherit;font:inherit;cursor:pointer}.btn.pri{background:#466a54;color:white}*{box-sizing:border-box}@media(prefers-color-scheme:dark){body{background:#16221b;color:#e0e8e1}.btn{background:#35463b;color:#e0e8e1;border-color:#526556}}</style><style>${read('admin/trash.css')}</style><main id="host"></main><script>${read('admin/trash.js')}</script></html>`;
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:850}});await context.route('**/*',route=>route.request().url()==='https://trash.test/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());await page.goto('https://trash.test/');
 await page.evaluate(()=>{
  const state=window.fixture={user:'admin',calls:[],listeners:[],pause:false,category:'all',rows:Array.from({length:27},(_,i)=>({id:'card:'+i,category:['accounts','cards','messages','other'][i%4],title:['탈퇴 계정','삭제한 카드','삭제한 쪽지','삭제한 문의'][i%4],body:i===0?'a***@example.invalid':i===1?'<img src=x onerror="window.injected=true">':'함께 나눈 이야기와 기록입니다.\n보관 기간이 끝나면 자동 삭제됩니다.',detail:{author_name:'초록산책',sender_name:'초록산책',recipient_name:'노을빛',created_at:'2026-10-20T01:30:00Z'},deleted_at:'2026-10-21T09:00:00Z',expires_at:'2026-11-21T09:00:00Z',restorable:i===1,card_id:i===1?'card-1':null}))};
  const client={schema(){return this;},auth:{onAuthStateChange(cb){state.listeners.push(cb);return{data:{subscription:{unsubscribe(){state.listeners=state.listeners.filter(x=>x!==cb);}}}};}},async rpc(name,args){state.calls.push({name,args});if(state.pause)return new Promise(resolve=>state.resolve=resolve);if(name==='restore_archived_card'){state.rows=state.rows.filter(x=>x.card_id!==args.p_card_id);return{data:1};}const rows=state.rows.filter(r=>(args.p_category==='all'||r.category===args.p_category)&&(!args.p_query||r.body.includes(args.p_query)));return{data:{items:rows.slice(args.p_offset,args.p_offset+20),total:rows.length}};}};
  state.mount=category=>{state.controller?.destroy();state.category=category;state.controller=OjjudaAdminTrash.mount({container:document.getElementById('host'),client,category,getAdminId:()=>state.user});};state.mount('all');
 });
 await page.waitForFunction(()=>document.querySelectorAll('.trash-card').length===20);
 assert.equal(await page.locator('.trash-card img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
 for(const width of [320,390,1280])for(const scheme of ['light','dark']){
  await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme:scheme});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`trash layout ${width} ${scheme}`);
  if(width===390)await page.screenshot({path:path.join(proof,'trash-'+scheme+'.png')});
 }
 await page.getByRole('button',{name:'다음',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.trash-card').length===7);
 // Expiry while viewing the last page recovers to a valid page instead of a false empty result.
 await page.evaluate(()=>{fixture.rows=fixture.rows.slice(0,19);return fixture.controller.refresh();});
 assert.equal(await page.locator('.trash-card').count(),19);assert.equal(await page.locator('.trash-pager').isVisible(),false);
 await page.getByLabel('휴지통 검색').fill('a***@');await page.getByRole('button',{name:'검색',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.trash-card').length===1);
 assert.ok((await page.locator('.trash-body').textContent()).includes('a***@'));assert.equal(await page.evaluate(()=>fixture.calls.at(-1).args.p_offset),0);
 await page.evaluate(()=>fixture.mount('cards'));await page.getByRole('button',{name:'카드 복구',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.trash-list').textContent.includes('<img'));
 assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.name==='restore_archived_card').length),1);
 for(const category of ['accounts','messages','other']){await page.evaluate(category=>fixture.mount(category),category);await page.waitForFunction(()=>document.querySelector('.trash-status').textContent.includes('총'));assert.equal(await page.evaluate(()=>fixture.calls.at(-1).args.p_category),category);}
 await page.evaluate(()=>{fixture.pause=true;fixture.controller.refresh();});await page.waitForFunction(()=>!!fixture.resolve);
 await page.evaluate(()=>{fixture.user=null;fixture.listeners.forEach(cb=>cb('SIGNED_OUT',null));fixture.resolve({data:{total:1,items:[fixture.rows[0]]}});});
 await page.waitForFunction(()=>document.querySelector('.trash-status').textContent.includes('관리자 계정'));
 assert.equal(await page.locator('.trash-card').count(),0,'a late response cannot expose data after logout');
 assert.equal(await page.getByLabel('휴지통 검색').isDisabled(),true);
 assert.deepEqual(errors,[]);await page.evaluate(()=>fixture.controller.destroy());await context.close();
 console.log('PASS: trash categories/search/pagination, expired last-page recovery, text-only content, card recovery, auth-switch and stale-response isolation, six mobile/desktop light/dark layouts');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});

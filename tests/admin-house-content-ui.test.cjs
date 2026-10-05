const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main style="max-width:960px;margin:auto;padding:14px"><div id="content"></div></main>');
  for(const style of fs.readFileSync(path.join(root,'world.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:style[1]});
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'admin/house-content.css'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'admin/house-content.js'),'utf8')});
  await page.evaluate(()=>{
   window.owner='admin-a';window.calls=[];window.pending=[];window.deferFeed=false;window.deferMutation=false;window.failFeed=false;window.failMutation=false;window.changed=[];window.throwChanged=false;window.confirmations=0;window.allowLeave=true;
   window.confirm=()=>{confirmations++;return allowLeave;};
   window.seed=()=>Array.from({length:33},(_,i)=>({kind:i===1?'comment':'post',id:i<2?'shared-id':'id-'+i,body:i===0?'<img src=x onerror=alert(1)>\n긴글'+('한글'.repeat(80)):'기록 '+i,author_id:'author',author_nick:'작성자',owner_id:'owner',owner_nick:'방 주인',created_at:'2026-10-04T00:00:00Z',visibility:i===1?'chosen':'all',folder_name:i===1?'친구와 나누는 앨범':'',is_private:i===1,is_risk:i===2,revision:'a'.repeat(32)}));
   window.records=seed();
   window.feed=args=>{let items=records.filter(x=>(args.p_kind==='all'||x.kind===args.p_kind)&&(args.p_filter==='all'||args.p_filter==='private'&&x.is_private||args.p_filter==='public'&&!x.is_private||args.p_filter==='risk'&&x.is_risk)&&(!args.p_q||(x.body+x.author_nick+x.owner_nick).includes(args.p_q)));const start=args.p_cursor?args.p_cursor.offset:0;return{data:{items:items.slice(start,start+30),has_more:items.length>start+30,next_cursor:items.length>start+30?{offset:start+30}:null}};};
   window.client={async rpc(name,args){
    calls.push({name,args});if(name==='admin_house_content_feed'){if(deferFeed)return new Promise(resolve=>pending.push({resolve,name,args}));if(failFeed)return{error:{message:typeof failFeed==='string'?failFeed:'synthetic network failure'}};return feed(args);}
    if(deferMutation)return new Promise(resolve=>pending.push({resolve,name,args}));
    if(failMutation)return{error:{message:'synthetic save failure'}};
    const row=records.find(x=>x.kind===args.p_kind&&x.id===args.p_id);if(!row)return{data:{ok:false,reason:'missing'}};
    if(row.revision!==args.p_revision)return{data:{ok:false,reason:'conflict'}};
    if(name.endsWith('_delete'))records=records.filter(x=>x!==row);else{row.body=args.p_body;row.revision='b'.repeat(32);}
    return{data:{ok:true,archived:name.endsWith('_delete')&&!row.is_private,revision:row.revision}};
   }};
   window.open=()=>{window.controller?.unmount();window.controller=OjjudaHouseContent.mount(document.querySelector('#content'),{client,getAdminId:()=>owner,isCurrent:()=>true,onChanged:async item=>{changed.push(item);if(throwChanged)throw new Error('summary refresh failed');}});};open();
  });
  const idle=()=>page.waitForFunction(()=>document.querySelector('.hc-list')?.getAttribute('aria-busy')==='false');
  const first=()=>page.locator('.hc-card').first();
  await idle();assert.equal(await page.locator('.hc-card').count(),30);assert.equal(await page.locator('.hc-card img').count(),0,'content is rendered as text');
  await page.getByRole('button',{name:'더 보기',exact:true}).click();await idle();assert.equal(await page.locator('.hc-card').count(),33,'same ID across content kinds remains distinct');
  await page.getByRole('button',{name:'앨범 댓글',exact:true}).click();await idle();assert.equal(await page.locator('.hc-card').count(),1);assert.match(await first().textContent(),/고른 친구 공개/);
  await page.getByRole('button',{name:'전체',exact:true}).click();await idle();await page.getByRole('button',{name:'위험 신호',exact:true}).click();await idle();assert.equal(await page.locator('.hc-card').count(),1);
  await page.getByRole('button',{name:'전체 범위',exact:true}).click();await idle();await page.getByRole('searchbox').fill('  기록 32  ');await page.getByRole('button',{name:'찾기',exact:true}).click();await idle();assert.equal(await page.locator('.hc-card').count(),1);assert.equal(await page.evaluate(()=>calls.at(-1).args.p_q),'기록 32');
  await page.evaluate(()=>{records=seed();open();});await idle();
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'cards fit viewport');
   assert.equal(await page.locator('.hc-button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),true);
   if(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR){fs.mkdirSync(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR,`house-content-${width}.png`)});}
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.setViewportSize({width:320,height:844});
  await first().getByRole('button',{name:'삭제',exact:true}).click();if(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR)await page.screenshot({path:path.join(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR,'house-content-delete-dark-320.png'),fullPage:false});
  await first().getByRole('button',{name:'취소',exact:true}).click();await first().getByRole('button',{name:'수정',exact:true}).click();
  assert.equal(await page.locator('.hc-editor').evaluate(e=>getComputedStyle(e).fontSize),'16px');await page.locator('.hc-editor').fill('보존할 초안');
  assert.deepEqual(await page.evaluate(()=>{const before=confirmations;return{canLeave:controller.canLeave(),draft:controller.hasDraft(),newConfirmations:confirmations-before};}),{canLeave:true,draft:true,newConfirmations:0},'canLeave is a pure state check for root navigation and beforeunload');
  await page.evaluate(()=>allowLeave=false);await page.getByRole('button',{name:'비공개',exact:true}).click();assert.equal(await page.locator('.hc-editor').inputValue(),'보존할 초안');
  await page.evaluate(()=>{allowLeave=true;failMutation=true;});await first().getByRole('button',{name:'저장',exact:true}).click();await idle();assert.equal(await page.locator('.hc-editor').inputValue(),'보존할 초안');assert.match(await page.locator('.hc-status').textContent(),/입력 내용은 남아/);
  if(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR)await page.screenshot({path:path.join(process.env.ADMIN_HOUSE_CONTENT_PROOF_DIR,'house-content-edit-dark-320.png')});
  // A row may change while the editor is open. It must retain its original revision.
  await page.evaluate(()=>{failMutation=false;records[0].revision='c'.repeat(32);});await first().getByRole('button',{name:'저장',exact:true}).click();await idle();
  assert.equal(await page.evaluate(()=>calls.at(-1).args.p_revision),'a'.repeat(32));assert.match(await page.locator('.hc-status').textContent(),/다른 곳에서 내용이 바뀌었어요/);assert.equal(await page.locator('.hc-editor').inputValue(),'보존할 초안');
  // Refresh locks existing cards, so an A editor cannot survive a response replacing A with B.
  await page.evaluate(()=>{deferFeed=true;pending=[];void controller.refresh();});await page.waitForFunction(()=>pending.length===1);
  assert.equal(await first().getByRole('button',{name:'수정',exact:true}).isDisabled(),true);assert.equal(await first().getByRole('button',{name:'삭제',exact:true}).isDisabled(),true);
  await first().getByRole('button',{name:'수정',exact:true}).dispatchEvent('click');assert.equal(await page.locator('.hc-editor').count(),0);
  await page.evaluate(()=>{records=[{...records[0],body:'새로 조회한 B',revision:'d'.repeat(32)}];deferFeed=false;pending[0].resolve(feed(pending[0].args));});await idle();
  await first().getByRole('button',{name:'수정',exact:true}).click();await page.locator('.hc-editor').fill('B에서 수정');
  // In-flight mutation cannot be abandoned, even through a programmatic refresh.
  await page.evaluate(()=>{deferMutation=true;pending=[];});await first().getByRole('button',{name:'저장',exact:true}).click();await page.waitForFunction(()=>pending.length===1);
  assert.equal(await page.evaluate(()=>controller.canLeave()),false);assert.equal(await page.evaluate(()=>controller.refresh()),false);
  assert.equal(await page.evaluate(()=>pending[0].args.p_revision),'d'.repeat(32));
  await page.evaluate(()=>{deferMutation=false;failFeed=true;throwChanged=true;records[0].body='B에서 수정';records[0].revision='e'.repeat(32);pending[0].resolve({data:{ok:true,revision:records[0].revision}});});await idle();
  assert.match(await page.locator('.hc-status').textContent(),/수정은 저장됐지만 목록/);assert.equal(await page.locator('.hc-card').count(),0);assert.equal(await page.evaluate(()=>changed.at(-1).action),'edit');assert.equal(await page.evaluate(()=>controller.hasDraft()),false);
  // A committed delete stays deleted even if reloading or summary updates fail.
  await page.evaluate(()=>{failFeed=false;return controller.refresh();});await idle();await first().getByRole('button',{name:'삭제',exact:true}).click();await page.evaluate(()=>failFeed=true);await first().getByRole('button',{name:'삭제 확인',exact:true}).click();await idle();
  assert.match(await page.locator('.hc-status').textContent(),/삭제는 완료됐지만 목록/);assert.equal(await page.locator('.hc-card').count(),0);assert.equal(await page.evaluate(()=>changed.at(-1).action),'delete');
  // Unmount and account changes fence delayed private responses.
  await page.evaluate(()=>{records=seed();failFeed=false;deferFeed=true;pending=[];open();controller.unmount();pending[0].resolve(feed(pending[0].args));});assert.equal(await page.locator('.hc-card').count(),0);
  await page.evaluate(()=>{pending=[];open();owner='admin-b';pending[0].resolve(feed(pending[0].args));});assert.equal(await page.locator('.hc-card').count(),0);
  await page.evaluate(()=>{deferFeed=false;failFeed='not_admin';open();});await idle();assert.match(await page.locator('.hc-status').textContent(),/관리자 권한/);assert.equal(await page.locator('.hc-card').count(),0);
  await page.evaluate(()=>controller.unmount());assert.deepEqual(errors,[]);
  console.log('PASS: kind/privacy/risk/search/paging, safe text, 320/390/1280 layout, dark editor, pure canLeave, draft and busy guards, revision locking, loading edit race, committed mutations with reload/callback failure, unmount/account fencing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

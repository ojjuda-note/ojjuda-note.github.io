const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main style="max-width:900px;margin:auto;padding:14px"><div id="directory"></div></main>');
  for(const style of fs.readFileSync(path.join(root,'world.html'),'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:style[1]});
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'admin/accounts.css'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'admin/accounts.js'),'utf8')});
  await page.evaluate(()=>{
   window.adminId='admin-a';window.calls=[];window.pending=[];window.defer=false;window.fail=false;window.unsubscribed=0;window.actions=[];
   window.members=Array.from({length:43},(_,i)=>({id:'member-'+i,nickname:i===0?'<img src=x onerror=alert(1)>':'회원 '+i,email:'person'+i+'@example.invalid',coins:i,created_at:i<3?'2026-10-04T00:00:00Z':'2026-09-01T00:00:00Z',last_seen:null,last_active:i===0?'2026-10-04T01:00:00Z':null,last_active_kind:i===0?'house_post':null,is_admin:i===1,banned_until:i===2?'2099-01-01T00:00:00Z':null}));
   window.withdrawn=[{id:'withdrawn-1',nickname:'보관한 회원',email_masked:'p***@example.invalid',account_created_at:'2026-08-01T00:00:00Z',withdrawn_at:'2026-10-01T00:00:00Z',expires_at:'2026-11-01T00:00:00Z',phone_number:'01099998888',birth_date:'2000-01-01',raw_snapshot:{password:'do-not-render'}}];
   window.client={auth:{onAuthStateChange(fn){window.authChanged=fn;return{data:{subscription:{unsubscribe(){unsubscribed++}}}}}},async rpc(name,args){
    calls.push({name,args});if(defer)return new Promise(resolve=>pending.push(resolve));if(fail)return{error:{message:fail===true?'synthetic transport failure':fail}};
    let rows=name==='admin_list_withdrawn_accounts'?withdrawn:members;
    if(args.p_filter==='banned')rows=rows.filter(x=>x.banned_until);if(args.p_filter==='admin')rows=rows.filter(x=>x.is_admin);if(args.p_filter==='today')rows=rows.filter(x=>x.created_at.startsWith('2026-10-04'));
    if(args.p_query)rows=rows.filter(x=>(x.nickname+' '+(x.email||x.email_masked)).includes(args.p_query));
    return{data:{items:rows.slice(args.p_offset,args.p_offset+args.p_limit),total:rows.length,offset:args.p_offset,limit:args.p_limit}};
   }};
   document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b)actions.push({...b.dataset});});
   window.openDirectory=(view='members',state)=>{controller?.destroy();window.controller=OjjudaAdminAccounts.mount({container:document.querySelector('#directory'),client,getAdminId:()=>adminId,view,initialState:state,renderActions:member=>'<button class="btn sm" type="button" data-act="adm-identity-open" data-uid="'+member.id+'">회원정보 수정</button>'});};
   window.controller=null;openDirectory();
  });
  const idle=()=>page.waitForFunction(()=>document.querySelector('.acct-directory')?.getAttribute('aria-busy')==='false');
  await idle();assert.equal(await page.locator('.acct-card').count(),20);assert.equal(await page.locator('.acct-count').textContent(),'총 43명');
  assert.match(await page.locator('.acct-card').first().textContent(),/우리집 글/);
  assert.equal(await page.locator('.acct-card img').count(),0,'member text cannot inject markup');
  assert.equal(await page.locator('.acct-card').first().getByText('기록 없음',{exact:true}).count(),1,'missing visit is not rendered as 1970');
  await page.getByRole('button',{name:'다음',exact:true}).click();await idle();assert.match(await page.locator('.acct-card').first().textContent(),/회원 20/);
  await page.getByRole('button',{name:'다음',exact:true}).click();await idle();assert.equal(await page.locator('.acct-card').count(),3);assert.equal(await page.getByRole('button',{name:'다음',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'정지 중',exact:true}).click();await idle();assert.equal(await page.locator('.acct-card').count(),1);
  assert.equal(await page.evaluate(()=>calls.at(-1).args.p_offset),0);await page.getByRole('button',{name:'정지 해제',exact:true}).click();
  assert.equal(await page.evaluate(()=>actions.at(-1).act),'adm-ban');assert.equal(await page.evaluate(()=>actions.at(-1).days),'0');
  await page.getByRole('button',{name:'회원정보 수정',exact:true}).click();assert.equal(await page.evaluate(()=>actions.at(-1).act),'adm-identity-open');
  await page.getByRole('button',{name:'관리자',exact:true}).click();await idle();assert.equal(await page.locator('[data-act="adm-ban"]').count(),0,'administrators never show restriction buttons');
  await page.getByRole('button',{name:'오늘 가입',exact:true}).click();await idle();assert.equal(await page.locator('.acct-card').count(),3);
  await page.getByRole('button',{name:'전체',exact:true}).click();await idle();await page.getByRole('searchbox',{name:'회원 검색'}).fill('  person42@  ');await page.getByRole('button',{name:'찾기',exact:true}).click();await idle();
  assert.equal(await page.locator('.acct-card').count(),1);assert.equal(await page.evaluate(()=>calls.at(-1).args.p_query),'person42@');
  await page.evaluate(()=>{const state=controller.getState();openDirectory('members',state)});await idle();assert.equal(await page.getByRole('searchbox').inputValue(),'person42@');
  await page.getByRole('button',{name:'초기화',exact:true}).click();await idle();
  // Removal while the last page is open goes back to the last available page.
  await page.getByRole('button',{name:'다음',exact:true}).click();await idle();await page.getByRole('button',{name:'다음',exact:true}).click();await idle();
  await page.evaluate(async()=>{members=members.slice(0,21);await controller.refresh()});await idle();assert.equal(await page.locator('.acct-page-label').textContent(),'2 / 2페이지');assert.equal(await page.locator('.acct-card').count(),1);
  // A transport error has an immediate retry and never retains stale action buttons.
  await page.evaluate(async()=>{fail=true;await controller.refresh()});await idle();assert.equal(await page.locator('.acct-card').count(),0);await page.getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();
  await page.evaluate(()=>fail=false);await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await idle();assert.equal(await page.locator('.acct-card').count(),1);
  // Out-of-order refresh results cannot replace newer information.
  await page.evaluate(()=>{defer=true;void controller.refresh();void controller.refresh();});
  await page.waitForFunction(()=>pending.length===2);
  await page.evaluate(()=>pending[1]({data:{items:[{id:'latest',nickname:'최신 결과'}],total:21}}));await idle();
  await page.evaluate(()=>pending[0]({data:{items:[{id:'old',nickname:'이전 결과'}],total:21}}));assert.match(await page.locator('.acct-card').textContent(),/최신 결과/);
  await page.evaluate(()=>{defer=false;openDirectory('withdrawn')});await idle();
  assert.equal(await page.locator('.acct-filters').count(),0);assert.equal(await page.locator('[data-act]').count(),0);assert.match(await page.locator('.acct-card').textContent(),/p\*\*\*@example.invalid/);
  assert.doesNotMatch(await page.locator('#directory').textContent(),/01099998888|2000-01-01|do-not-render/);
  assert.equal(await page.locator('.acct-details dt').allTextContents().then(x=>x.join(',')),'가입,탈퇴,자동 삭제 예정');
  for(const [width,height]of [[320,568],[390,844],[1280,900]]){
   await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(process.env.ADMIN_ACCOUNTS_PROOF_DIR){fs.mkdirSync(process.env.ADMIN_ACCOUNTS_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ADMIN_ACCOUNTS_PROOF_DIR,`withdrawn-${width}.png`),fullPage:true});}
  }
  await page.evaluate(()=>openDirectory());await idle();
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(process.env.ADMIN_ACCOUNTS_PROOF_DIR)await page.screenshot({path:path.join(process.env.ADMIN_ACCOUNTS_PROOF_DIR,`members-${width}.png`)});}
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');if(process.env.ADMIN_ACCOUNTS_PROOF_DIR)await page.screenshot({path:path.join(process.env.ADMIN_ACCOUNTS_PROOF_DIR,'members-dark-1280.png')});
  await page.evaluate(()=>{defer=true;pending=[];void controller.refresh();adminId='admin-b';authChanged('SIGNED_IN',{user:{id:'admin-b'}})});
  await page.evaluate(()=>pending[0]({data:{items:members,total:members.length}}));assert.equal(await page.locator('.acct-card').count(),0);assert.match(await page.locator('#directory').textContent(),/로그인 상태가 바뀌었어요/);
  await page.evaluate(()=>{controller.destroy();defer=false;openDirectory();fail='not_admin';return controller.refresh()});assert.match(await page.locator('#directory').textContent(),/관리자 권한/);assert.equal(await page.locator('.acct-card').count(),0);
  await page.evaluate(()=>controller.destroy());assert.ok(await page.evaluate(()=>unsubscribed)>=4);assert.deepEqual(errors,[]);
  console.log('PASS: member filters/search/count/paging, action delegation, restored query, removed final page, retry/stale-response/account safety, minimal withdrawn fields and three responsive widths');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});

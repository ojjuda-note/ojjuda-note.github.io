'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const OWNER='11111111-1111-4111-8111-111111111111';
const AWARD='22222222-2222-4222-8222-222222222222';
const PEER='33333333-3333-4333-8333-333333333333';
const couponBody=(product='편의점 상품권 5,000원')=>'2026년 10월 게임 순위 1위를 축하합니다!\n'+product+'\n사용기한: 2099-01-01\n기프티콘 확인: https://ojjuda.kr/gift.html?id='+AWARD;
const message=(id,body,created_at)=>({id,body,created_at,sender_id:PEER,recipient_id:OWNER});
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.OJJUDA_TEST_BROWSER||undefined});});
test.after(async()=>{await browser?.close();});
async function pageFor(t,route,options={}){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 t.after(()=>page.close());
 const failures=[];page.on('pageerror',error=>failures.push(error.message));t.after(()=>assert.deepEqual(failures,[]));
 await page.route('**/*',async request=>{
  const url=new URL(request.request().url()),name=url.pathname;
  if(url.hostname==='cdn.jsdelivr.net')return request.fulfill({contentType:'application/javascript',body:''});
  if(name==='/config.js')return request.fulfill({contentType:'application/javascript',body:'window.OJJUDA_CONFIG={supabaseUrl:"https://mock.invalid",supabaseKey:"test"};'});
  if(name==='/message-fixture')return request.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/friend-messages.css"><body><script src="/friend-messages.js"></script></body></html>'});
  if(name==='/admin/reward-coupon-reader.js')return request.fulfill({contentType:'application/javascript',body:'window.OjjudaCouponReader={async read(){return {code:"TESTCOUPON1234",expires:"2099-01-01",warnings:[]};}};'});
  const allowed=['/gift.html','/reward-coupon.js','/admin/rewards.html','/admin/rewards.js','/admin/rewards.css','/admin/style.css','/admin/reward-coupon-parser.js','/admin/reward-coupon-batch.js','/admin/reward-coupon-manager.js','/friend-messages.js','/friend-messages.css'];
  if(!allowed.includes(name))return request.fulfill({status:404,body:''});
  const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript';
  return request.fulfill({contentType:type,body:await fs.readFile(path.join(ROOT,name))});
 });
 await page.addInitScript(({owner,award,peer,options})=>{
  const state=window.couponTest={user:owner,award,peer,uploads:[],calls:[],delivered:false,failOnce:!!options.failOnce,denied:!!options.denied,holdDownload:!!options.holdDownload,authCallback:()=>{},canSend:!!options.canSend,threadCalls:[],threadError:false};
  state.switchUser=id=>{state.user=id;state.authCallback(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id}}:null);};
  const pending={id:award,nickname:'당첨자',month_start:'2026-10-01',game:'tank',amount:5000,blocked_reason:null};
  const client={auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null}}),onAuthStateChange:callback=>{state.authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}},
   storage:{from:()=>({upload:async(name,file)=>{state.uploads.push({name,size:file.size});return {data:{path:name}};},download:async()=>{
    if(state.holdDownload)await new Promise(resolve=>{state.releaseDownload=resolve;});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;return {data:await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))};
   }})},
   rpc:async(name,args)=>{
    if(name==='admin_reward_summary')return {data:{policy:{observation_days:14,active_days_required:7,referral_group_size:10,gift_label:'편의점 상품권 5,000원',referral_member_limit:500,referral_amount:5000,provider_status:'not_connected',dispatch_enabled:false},excluded_numbers:1,qualified_members:0,reserved_amount:0,sent_amount:0,referrers:[],awards:[],monthly_results:[],monthly_pending:state.delivered?[]:[pending],monthly_sent:state.delivered?[{...pending,title:'테스트 상품',expires_on:'2099-01-01',delivered_at:'2026-10-22T01:00:00Z'}]:[]}};
    if(name==='admin_send_reward_coupon'){
     state.calls.push(args);await new Promise(resolve=>setTimeout(resolve,70));
     if(state.failOnce){state.failOnce=false;return {error:{message:'temporary network error'}};}
     state.delivered=true;return {data:{ok:true,message_id:'test-message'}};
    }
    if(name==='my_reward_coupon')return state.denied?{error:{message:'coupon_unavailable'}}:{data:{title:'테스트 상품',expires_on:'2099-01-01',storage_path:'private/test.png'}};
    if(name==='friend_message_thread'){
     state.threadCalls.push(args);if(state.threadError)return {error:{message:'temporary network error'}};
     const page=options.threadPages?.[args.p_before_id?'older':args.p_anchor?'anchor':'recent'];
     return {data:{peer_id:peer,nickname:'관리자',can_send:state.canSend,items:page?.items||(options.messageBodies||[
      '2026년 10월 게임 순위 1위를 축하합니다!\n편의점 상품권 5,000원\n사용기한: 2099-01-01\n기프티콘 확인: https://ojjuda.kr/gift.html?id='+award,
      '<img src=x onerror=alert(1)>\n기프티콘 확인: https://evil.invalid/gift.html?id='+award
     ]).map((body,index)=>({id:'m'+(index+1),sender_id:peer,recipient_id:owner,created_at:'2026-10-22T01:00:0'+index+'Z',body})),has_more:page?.has_more||false,next_cursor:page?.next_cursor||null}};
    }
    throw Error('Unexpected RPC: '+name);
   }};
  window.supabase={createClient:()=>client};state.client=client;
 },{owner:OWNER,award:AWARD,peer:PEER,options});
 await page.goto('https://coupon.test'+route);
 return page;
}
test('Admin retries use the same uploaded coupon and award; mobile form fits',async t=>{
 const page=await pageFor(t,'/admin/rewards.html',{failOnce:true});
 await page.locator('#coupon-form').waitFor({state:'visible'});
 await page.fill('#coupon-title','테스트 상품');
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=1;const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));return [...new Uint8Array(await blob.arrayBuffer())];});
 await page.setInputFiles('#coupon-file',{name:'test-pixel.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
 await page.locator('.coupon-item[data-status="ready"]').waitFor({state:'visible'});
 assert.equal(await page.getByLabel('당첨자 배정 (1)',{exact:true}).inputValue(),AWARD);
 assert.equal(await page.getByLabel('쿠폰번호 (1)',{exact:true}).inputValue(),'TESTCOUPON1234');
 assert.equal(await page.getByLabel('사용기한 (1)',{exact:true}).inputValue(),'2099-01-01');
 await page.click('#coupon-send');
 await page.waitForFunction(()=>document.querySelector('.coupon-item[data-status="failed"] .coupon-item-error')?.textContent.includes('발송을 확인하지 못했어요')&&!document.querySelector('#coupon-send').disabled);
 await page.click('#coupon-send');
 await page.waitForFunction(()=>document.querySelector('.coupon-item[data-status="sent"] .coupon-item-note')?.textContent.includes('당첨자님에게 기프티콘 쪽지를 보냈어요')&&document.querySelector('#coupon-sent').textContent.includes('당첨자'));
 const state=await page.evaluate(()=>({uploads:couponTest.uploads,calls:couponTest.calls,delivered:couponTest.delivered,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(state.uploads.length,1);assert.equal(state.calls.length,2);assert.deepEqual(state.calls[0],state.calls[1]);assert.equal(state.calls[0].p_path,state.uploads[0].name);assert.equal(state.calls[0].p_award,AWARD);assert.equal(Object.hasOwn(state.calls[0],'p_recipient'),false);assert.equal(state.delivered,true);assert.equal(state.overflow,false);
 assert.equal(await page.locator('#coupon-form').isVisible(),false);
 assert.equal(await page.locator('.coupon-item[data-status="sent"]').count(),1);
 await page.getByRole('tab',{name:/지급 완료/}).click();
 assert.equal(await page.locator('#coupon-sent-panel').isVisible(),true);
 assert.equal(await page.locator('#coupon-send').isDisabled(),true);
 assert.match(await page.locator('#coupon-sent').innerText(),/당첨자/);
});
test('Recipient can view/download an image and logout removes it',async t=>{
 const page=await pageFor(t,'/gift.html?id='+AWARD);
 await page.locator('#gift-content').waitFor({state:'visible'});
 assert.match(await page.locator('#gift-download').getAttribute('href'),/^blob:/);
 await page.evaluate(()=>couponTest.switchUser(null));
 assert.equal(await page.locator('#gift-content').isVisible(),false);
 assert.equal(await page.locator('#gift-image').getAttribute('src'),null);
 assert.equal(await page.locator('#gift-download').getAttribute('href'),null);
});
test('Denied viewer can retry, and an account switch discards an in-flight image',async t=>{
 const page=await pageFor(t,'/gift.html?id='+AWARD,{denied:true,holdDownload:true});
 await page.waitForFunction(()=>document.querySelector('#gift-status').textContent.includes('볼 수 없거나'));
 assert.equal(await page.locator('#gift-retry').isEnabled(),true);
 await page.evaluate(()=>{couponTest.denied=false;});await page.click('#gift-retry');
 await page.waitForFunction(()=>!!couponTest.releaseDownload);
 await page.evaluate(()=>{couponTest.switchUser('44444444-4444-4444-8444-444444444444');couponTest.releaseDownload();});
 await page.waitForFunction(()=>document.querySelector('#gift-status').textContent.includes('로그인이 바뀌었어요'));
 assert.equal(await page.locator('#gift-content').isVisible(),false);
 assert.equal(await page.locator('#gift-image').getAttribute('src'),null);
});
async function openMessages(page,options={}){
 await page.evaluate(async options=>{const ui=OjjudaFriendMessages.install({client:couponTest.client,getUserId:()=>couponTest.user});await ui.open(couponTest.peer,options);},options);
}
test('Received coupon shows its product and expiry with one safe action instead of a raw URL',async t=>{
 const page=await pageFor(t,'/message-fixture');await openMessages(page);
 const gift=page.locator('[data-message-id="m1"]'),link=gift.getByRole('link',{name:'상품권 보기',exact:true});
 assert.equal(await gift.locator('.fm-gift-title').textContent(),'편의점 상품권 5,000원');
 assert.match(await gift.locator('.fm-gift-expiry').textContent(),/2099\D+0?1\D+0?1(?:\D|$)/);
 assert.equal(await gift.locator('.fm-direction').textContent(),'받은 상품권');assert.equal(await gift.locator('.fm-direction').isVisible(),true);
 assert.equal(await link.count(),1);assert.equal(await link.getAttribute('href'),'/gift.html?id='+AWARD);
 assert.equal(await link.getAttribute('target'),'_blank');
 assert.ok((await link.getAttribute('rel')).split(/\s+/).includes('noopener'));
 assert.ok((await link.getAttribute('rel')).split(/\s+/).includes('noreferrer'));
 assert.doesNotMatch(await gift.innerText(),/https?:|gift\.html|기프티콘 확인:/);
 const other=page.locator('[data-message-id="m2"]');
 assert.equal(await other.locator('img,a,.fm-gift').count(),0);
 assert.match(await other.innerText(),/<img src=x onerror=alert\(1\)>/);
 assert.match(await other.innerText(),/https:\/\/evil\.invalid/);
});
test('Generic coupon text stays escaped and malformed official links remain ordinary notes',async t=>{
 const note='고마워요. <img src=x onerror="window.injected=true"> 다음에도 함께해요!';
 const page=await pageFor(t,'/message-fixture',{messageBodies:[
  note+'\n기프티콘 확인: https://ojjuda.kr/gift.html?id='+AWARD,
  '확인해 주세요.\n기프티콘 확인: https://ojjuda.kr/gift.html?id='+AWARD+'&extra=1',
  '주소가 잘못됐어요.\n기프티콘 확인: https://ojjuda.kr/gift.html?id=not-a-coupon'
 ]});await openMessages(page);
 const gift=page.locator('[data-message-id="m1"]');
 assert.ok((await gift.innerText()).includes(note),'custom text is not discarded while the official URL is replaced');
 assert.equal(await gift.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.equal(await gift.getByRole('link',{name:'상품권 보기',exact:true}).getAttribute('href'),'/gift.html?id='+AWARD);
 for(const id of ['m2','m3']){
  const row=page.locator('[data-message-id="'+id+'"]');
  assert.equal(await row.locator('a,.fm-gift').count(),0);
  assert.match(await row.innerText(),/기프티콘 확인: https:\/\/ojjuda\.kr\/gift\.html/);
 }
});
test('Long coupon titles and their action fit small phones without truncation',async t=>{
 const product='편의점 모바일 상품권\n'+'자유롭게 골라 쓰는 특별 구성 '.repeat(5)+'5,000원';
 const page=await pageFor(t,'/message-fixture',{messageBodies:[couponBody(product)]});await openMessages(page);
 for(const width of [320,390,900]){
  await page.setViewportSize({width,height:844});
  const title=page.locator('.fm-gift-title'),link=page.getByRole('link',{name:'상품권 보기',exact:true});
  assert.equal(await title.textContent(),product);
  assert.equal(await title.evaluate(node=>node.scrollWidth<=node.clientWidth+1&&node.scrollHeight<=node.clientHeight+1),true,'complete product title wraps at '+width+'px');
  await link.scrollIntoViewIfNeeded();assert.equal(await link.isVisible(),true);
  const box=await link.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1&&box.height>=40,'coupon action stays reachable at '+width+'px');
  assert.equal(await page.locator('.fm-history').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }
});
test('Readonly coupon notices stay compact while permission refreshes and load recovery remain usable',async t=>{
 const page=await pageFor(t,'/message-fixture',{messageBodies:[couponBody()]});await openMessages(page);
 const form=page.locator('.fm-form'),input=page.locator('.fm-input'),status=page.locator('.fm-status'),recent=page.getByRole('button',{name:'최근 쪽지',exact:true});
 assert.equal(await form.isVisible(),false);assert.equal(await recent.isVisible(),false);
 assert.equal(await page.locator('.fm-direction').isVisible(),false);
 assert.equal(await status.textContent(),'');assert.equal(await page.locator('#friend-message-title').textContent(),'받은 상품권');
 // Only permission changes; the server returns the very same messages on each refresh.
 await page.evaluate(()=>{couponTest.canSend=true;window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(()=>couponTest.threadCalls.length>=2&&!document.querySelector('.fm-input').disabled);
 assert.equal(await form.isVisible(),true);assert.equal(await recent.isVisible(),true);assert.equal(await status.textContent(),'');
 assert.equal(await page.locator('.fm-direction').isVisible(),true);
 await page.evaluate(()=>{couponTest.canSend=false;window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(()=>couponTest.threadCalls.length>=3&&document.querySelector('.fm-form').hidden);
 assert.equal(await form.isVisible(),false);assert.equal(await input.isDisabled(),true);assert.equal(await status.textContent(),'');
 await page.evaluate(()=>{couponTest.threadError=true;window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('불러오지 못했어요'));
 assert.equal(await recent.isVisible(),true);assert.equal(await recent.isEnabled(),true);
 await page.evaluate(()=>{couponTest.threadError=false;});await recent.click();
 await page.waitForFunction(()=>document.querySelector('.fm-status').textContent==='');
 assert.equal(await form.isVisible(),false);assert.equal(await recent.isVisible(),false);
 assert.equal(await page.getByRole('link',{name:'상품권 보기',exact:true}).isVisible(),true);
});
test('Coupon notifications retain recent and older navigation when ordinary notes are outside the current page',async t=>{
 const latest=message('m-latest',couponBody(),'2026-10-22T01:00:00Z');
 const page=await pageFor(t,'/message-fixture',{threadPages:{
  anchor:{items:[message(AWARD,couponBody(),'2026-10-21T01:00:00Z')]},
  recent:{items:[latest],has_more:true,next_cursor:{id:latest.id,created_at:latest.created_at}},
  older:{items:[message('m-older','이전에 주고받은 일반 쪽지예요.','2026-10-20T01:00:00Z')]}
 }});await openMessages(page,{messageId:AWARD});
 const recent=page.getByRole('button',{name:'최근 쪽지',exact:true}),older=page.getByRole('button',{name:'이전 쪽지',exact:true}),form=page.locator('.fm-form');
 assert.equal(await form.isVisible(),false);assert.equal(await recent.isVisible(),true);assert.equal(await older.isVisible(),false);
 assert.equal(await page.evaluate(()=>couponTest.threadCalls.at(-1).p_anchor),AWARD);
 await recent.click();await page.locator('[data-message-id="m-latest"]').waitFor();
 assert.equal(await form.isVisible(),false);assert.equal(await older.isVisible(),true);
 await older.click();await page.locator('[data-message-id="m-older"]').waitFor();
 assert.equal(await page.evaluate(()=>couponTest.threadCalls.at(-1).p_before_id),'m-latest');
 assert.equal(await page.locator('[data-message-id="m-older"] .fm-body').textContent(),'이전에 주고받은 일반 쪽지예요.');
 assert.equal(await form.isVisible(),true);assert.equal(await page.locator('.fm-input').isDisabled(),true);
 assert.equal(await recent.isVisible(),true);assert.equal(await older.isVisible(),false);
 await recent.click();await page.locator('[data-message-id="m-older"]').waitFor({state:'detached'});
 assert.equal(await form.isVisible(),false);assert.equal(await older.isVisible(),true);
});

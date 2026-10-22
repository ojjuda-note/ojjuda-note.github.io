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
  if(name==='/message-fixture')return request.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body><script src="/friend-messages.js"></script></body>'});
  const allowed=['/gift.html','/reward-coupon.js','/admin/rewards.html','/admin/rewards.js','/admin/rewards.css','/admin/style.css','/friend-messages.js'];
  if(!allowed.includes(name))return request.fulfill({status:404,body:''});
  const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript';
  return request.fulfill({contentType:type,body:await fs.readFile(path.join(ROOT,name))});
 });
 await page.addInitScript(({owner,award,peer,options})=>{
  const state=window.couponTest={user:owner,award,peer,uploads:[],calls:[],delivered:false,failOnce:!!options.failOnce,denied:!!options.denied,holdDownload:!!options.holdDownload,authCallback:()=>{}};
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
    if(name==='friend_message_thread')return {data:{peer_id:peer,nickname:'관리자',can_send:false,items:[
     {id:'m1',sender_id:peer,recipient_id:owner,created_at:'2026-10-22T01:00:00Z',body:'선물\n기프티콘 확인: https://ojjuda.kr/gift.html?id='+award},
     {id:'m2',sender_id:peer,recipient_id:owner,created_at:'2026-10-22T01:00:01Z',body:'<img src=x onerror=alert(1)>\n기프티콘 확인: https://evil.invalid/gift.html?id='+award}
    ],has_more:false,next_cursor:null}};
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
 await page.selectOption('#coupon-winner',AWARD);
 await page.fill('#coupon-title','테스트 상품');await page.fill('#coupon-code','TEST-COUPON-1234');await page.fill('#coupon-expires','2099-01-01');
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=1;const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));return [...new Uint8Array(await blob.arrayBuffer())];});
 await page.setInputFiles('#coupon-file',{name:'test-pixel.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
 await page.click('#coupon-send');
 await page.waitForFunction(()=>document.querySelector('#coupon-status').textContent.includes('발송을 확인하지 못했어요')&&!document.querySelector('#coupon-send').disabled);
 await page.click('#coupon-send');
 await page.waitForFunction(()=>document.querySelector('#coupon-status').textContent.includes('당첨자님에게 기프티콘 쪽지를 보냈어요'));
 const state=await page.evaluate(()=>({uploads:couponTest.uploads,calls:couponTest.calls,delivered:couponTest.delivered,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.equal(state.uploads.length,1);assert.equal(state.calls.length,2);assert.deepEqual(state.calls[0],state.calls[1]);assert.equal(state.calls[0].p_award,AWARD);assert.equal(Object.hasOwn(state.calls[0],'p_recipient'),false);assert.equal(state.delivered,true);assert.equal(state.overflow,false);
 assert.equal(await page.locator('#coupon-form').isVisible(),false);
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
test('Private note exposes only the exact internal coupon link and escapes other text',async t=>{
 const page=await pageFor(t,'/message-fixture');
 await page.evaluate(async()=>{const ui=OjjudaFriendMessages.install({client:couponTest.client,getUserId:()=>couponTest.user});await ui.open(couponTest.peer);});
 const link=page.getByRole('link',{name:'기프티콘 열기'});
 assert.equal(await link.count(),1);assert.equal(await link.getAttribute('href'),'/gift.html?id='+AWARD);
 assert.equal(await page.locator('.fm-body img').count(),0);assert.match(await page.locator('.fm-body').last().innerText(),/<img/);
});

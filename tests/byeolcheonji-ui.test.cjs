const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '..', 'byeolcheonji') + path.sep;
const instances = new Set();
// Every browser/network/push operation is a fixture. No account, reservation or notification is created.
const html = fs.readFileSync(base + 'index.html','utf8');
const source = fs.readFileSync(base + 'app.js','utf8');
const pushSource = fs.readFileSync(base + 'sw.js','utf8');
const keyBytes = Buffer.alloc(65,5); keyBytes[0] = 4;
const publicKey = keyBytes.toString('base64url');
const userA = {id:'member-a',is_anonymous:false};
function makeMatch(date = '2026-11-06', id = '7618700') {
  const endDate = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const query = new URLSearchParams({ startDateTime: date + 'T00:00:00', endDateTime: endDate + 'T00:00:00' });
  return { date, endDate, roomId: id, roomName: '101호', capacity: 4, standard: 2, price: 80000,
    bookingUrl: `https://booking.naver.com/booking/3/bizes/1627625/items/${id}?${query}` };
}
const goodData = matches => ({checkedAt:'2026-11-04T14:00:00Z',window:{from:'2026-11-04',to:'2026-12-18'},rooms:[],matches,partial:false,unknownDates:0});
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,desc) { for(let i=0;i<200;i++){if(fn())return;await sleep(10);}throw new Error('timeout '+desc); }
function fixture({user=userA,url='https://ojjuda.kr/byeolcheonji/',getUser,availability,status,permission='default',existing=false,stored=false,subscriptionRead,registrationRead,testFailure}={}) {
  const dom = new JSDOM(html,{url,runScripts:'outside-only'}); const w=dom.window; instances.add(w);
  const calls=[], authCalls=[], pushes=[]; let subscriber=null; let callback, permissionCalls=0;
  let session=user?{user,access_token:'verified-access'}:null;
  let currentUser=user;
  let activeSubscription=existing?{options:{applicationServerKey:keyBytes},unsubscribe:async()=>{pushes.push('unsubscribe');activeSubscription=null;return true;},toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/old',keys:{}})}:null;
  const reg={scope:'https://ojjuda.kr/byeolcheonji/',active:{state:'activated'},pushManager:{getSubscription:async()=>subscriptionRead?subscriptionRead(activeSubscription):activeSubscription,subscribe:async opts=>{pushes.push('subscribe');return activeSubscription={options:{applicationServerKey:opts.applicationServerKey},unsubscribe:async()=>{pushes.push('unsubscribe');activeSubscription=null;return true;},toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/new',keys:{}})};}}};
  Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async(url,opt)=>{pushes.push({url,opt});return reg;},getRegistration:async()=>registrationRead?registrationRead(reg):reg}});
  w.PushManager=function(){};w.Notification={permission,requestPermission:async()=>{permissionCalls++;w.Notification.permission='granted';return 'granted';}};
  w.matchMedia=()=>({matches:false});w.isSecureContext=true;
  w.OJJUDA_CONFIG={supabaseUrl:'https://project.invalid',supabaseKey:'publishable'};
  w.supabase={createClient:()=>({auth:{getSession:async()=>{authCalls.push('session');return {data:{session}};},getUser:async()=>{authCalls.push('user');return getUser?getUser():{data:{user:currentUser}};},onAuthStateChange:cb=>{callback=cb;}}})};
  w.fetch=async(url,options)=>{const entry={url,options};calls.push(entry);
    assert.ok(authCalls.includes('user'),'identity verified before feature API');
    assert.equal(options.headers.Authorization,'Bearer verified-access');
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    const path=new URL(url).pathname;
    if(path.endsWith('/status'))return {ok:true,status:200,json:async()=>status||{vapidPublicKey:publicKey,subscription:subscriber}};
    if(path.endsWith('/availability'))return availability?availability(entry):{ok:true,status:200,json:async()=>goodData([makeMatch()])};
    if(path.endsWith('/subscription')&&options.method==='POST'){subscriber={enabled:true,filters:JSON.parse(options.body).filters};return{ok:true,status:200,json:async()=>subscriber};}
    if(path.endsWith('/subscription')&&options.method==='DELETE'){subscriber=null;return{ok:true,status:200,json:async()=>({enabled:false})};}
    if(path.endsWith('/test'))return testFailure?{ok:false,status:testFailure.status,json:async()=>({error:'기기 알림 전송 실패',code:testFailure.code})}:{ok:true,status:200,json:async()=>({accepted:true})};
    throw new Error('Unexpected request '+url);
  };
  if(stored){w.localStorage.setItem('ojjuda-byeolcheonji-device:'+user.id,'x'.repeat(43));w.localStorage.setItem('ojjuda-byeolcheonji-push-owner',user.id);}
  w.eval(source);
  return {w,calls,authCalls,pushes,get permissionCalls(){return permissionCalls;},emit:(event,nextUser)=>{currentUser=nextUser;session=nextUser?{user:nextUser,access_token:'verified-access'}:null;callback(event,session);},close:()=>{instances.delete(w);w.close();}};
}
(async()=>{
 let f=fixture({user:null}); await sleep(20);assert.equal(f.calls.length,0);assert.equal(f.w.document.querySelector('#member-content').hidden,true);assert.equal(f.w.document.querySelector('#gate-actions').hidden,false);f.close();
 f=fixture({user:{id:'anonymous',is_anonymous:true}});await sleep(20);assert.equal(f.calls.length,0);f.close();
 let release;f=fixture({getUser:()=>new Promise(r=>release=r)});await until(()=>release,'waiting Auth');assert.equal(f.calls.length,0);f.emit('SIGNED_OUT',null);release({data:{user:userA}});await sleep(20);assert.equal(f.calls.length,0);assert.equal(f.w.document.querySelector('#member-content').hidden,true);f.close();
 f=fixture({url:'https://ojjuda.kr/byeolcheonji/?date=2026-11-06&room=7618700&guests=4'});await until(()=>f.w.document.querySelector('.booking-link'),'matches');
 assert.equal(f.permissionCalls,0,'no auto notification opt-in');assert.equal(f.pushes.length,0,'no SW mutation without action');
 const bookingLink=f.w.document.querySelector('.booking-link');const url=new URL(bookingLink.href);assert.equal(url.origin,'https://search.naver.com');assert.equal(url.pathname,'/search.naver');assert.equal(url.searchParams.get('query'),'한우산별천지');assert.equal(bookingLink.target,'_blank');assert.ok(f.w.document.querySelector('.target-room'));
 assert.ok(f.w.document.querySelector('#login-link').href.includes('guests=4'));
 const weekday=f.w.document.querySelector('[name=dateMode][value=weekday]');weekday.checked=true;weekday.dispatchEvent(new f.w.Event('change',{bubbles:true}));await until(()=>f.calls.some(c=>c.url.includes('dateMode=weekday')),'weekday query');
 const optionValues=Array.from(f.w.document.querySelectorAll('[name=guests]'),e=>e.value);assert.deepEqual(optionValues,['all','2','4','6','8']);
 f.emit('SIGNED_OUT',null);assert.equal(f.w.document.querySelector('#member-content').hidden,true);assert.equal(f.w.document.querySelectorAll('.booking-link').length,0);f.close();
 f=fixture({existing:true});await until(()=>!f.w.document.querySelector('#alarm-enable').disabled,'alarm ready');f.w.document.querySelector('#alarm-enable').click();await until(()=>f.calls.some(c=>c.url.endsWith('/test')),'registered and tested');
 assert.equal(f.permissionCalls,1);assert.ok(f.pushes.indexOf('unsubscribe')<f.pushes.indexOf('subscribe'),'old endpoint removed without owner token');assert.ok(f.w.localStorage.getItem('ojjuda-byeolcheonji-device:member-a'));
 const registration=f.pushes.find(p=>p.url);assert.equal(registration.opt.scope,'/byeolcheonji/');assert.ok(registration.url.startsWith('/byeolcheonji/sw.js'));
 const subscribeCall=f.calls.find(c=>c.options.method==='POST'&&c.url.endsWith('/subscription'));assert.match(subscribeCall.options.headers['X-Device-Token'],/^[A-Za-z0-9_-]{43}$/);
 await until(()=>!f.w.document.querySelector('#alarm-disable').disabled,'alarm completion');f.w.document.querySelector('#alarm-disable').click();await until(()=>f.calls.some(c=>c.options.method==='DELETE'),'unsubscribe');assert.equal(f.w.document.querySelector('#alarm-enable').hidden,false);f.close();
 f=fixture({availability:()=>({ok:false,status:503,json:async()=>({error:'예약처에 연결하지 못했어요.',code:'provider_unavailable'})})});await until(()=>f.w.document.querySelector('.result-state.error'),'provider error');assert.equal(f.w.document.querySelectorAll('.booking-link').length,0);assert.ok(f.w.document.querySelector('#results').textContent.includes('연결하지 못했어요'));f.close();
 f=fixture({availability:()=>({ok:true,status:200,json:async()=>goodData([{...makeMatch(),bookingUrl:'https://evil.invalid/phish'}])})});await until(()=>f.w.document.querySelector('.room-card'),'unsafe link rejected');assert.equal(f.w.document.querySelectorAll('.booking-link').length,0);f.close();
 f=fixture({availability:()=>({ok:true,status:200,json:async()=>({...goodData([]),partial:true,unknownDates:20})})});await until(()=>f.w.document.querySelector('.result-state.empty'),'unknown empty');assert.ok(f.w.document.querySelector('#results').textContent.includes('확인된 빈방'));assert.equal(f.w.document.querySelector('#partial-note').hidden,false);f.close();
 // A 410 means the server deleted the expired device: offer re-registration without losing filters.
 f=fixture({testFailure:{status:410,code:'device_expired'}});
 await until(()=>!f.w.document.querySelector('#alarm-enable').disabled,'expiry enable ready');
 const six=f.w.document.querySelector('[name=guests][value="6"]');six.checked=true;six.dispatchEvent(new f.w.Event('change',{bubbles:true}));
 f.w.document.querySelector('#alarm-enable').click();
 await until(()=>f.w.document.querySelector('#alarm-feedback').textContent.includes('만료'),'expiry after first registration');
 assert.equal(f.w.document.querySelector('#alarm-enable').hidden,false);
 assert.equal(f.w.document.querySelector('#alarm-tools').hidden,true);
 assert.equal(f.w.document.querySelector('#alarm-saved').hidden,true);
 assert.equal(f.w.localStorage.getItem('ojjuda-byeolcheonji-device:member-a'),null);
 assert.equal(f.w.localStorage.getItem('ojjuda-byeolcheonji-push-owner'),null);
 assert.equal(f.w.document.querySelector('[name=guests][value="6"]').checked,true,'expiry keeps chosen filters');f.close();
 for(const failure of [{status:410,code:'device_expired'},{status:502,code:'push_delayed'}]){
   f=fixture({existing:true,stored:true,permission:'granted',status:{vapidPublicKey:publicKey,subscription:{enabled:true,filters:{dateMode:'all',guests:'all'}}},testFailure:failure});
   await until(()=>!f.w.document.querySelector('#alarm-tools').hidden&&!f.w.document.querySelector('#alarm-test').disabled,'test existing device');
   f.w.document.querySelector('#alarm-test').click();await until(()=>f.w.document.querySelector('#alarm-feedback').textContent,'test failure shown');
   const expired=failure.code==='device_expired';
   assert.equal(f.w.document.querySelector('#alarm-enable').hidden,!expired);
   assert.equal(f.w.document.querySelector('#alarm-tools').hidden,expired);
   assert.equal(f.w.localStorage.getItem('ojjuda-byeolcheonji-device:member-a')===null,expired,'only confirmed expiry clears registration');f.close();
 }
 // The UI trusts confirmed provider inventory; it must not hardcode Wednesday closures.
 f=fixture({availability:()=>({ok:true,status:200,json:async()=>goodData([makeMatch('2026-11-04')])})});
 await until(()=>f.w.document.querySelector('.booking-link'),'provider-open Wednesday');
 assert.equal(f.w.document.querySelector('.room-card').dataset.date,'2026-11-04'); f.close();
 // A stale action must not unsubscribe another account's shared browser registration.
 let finishSubscription;
 f=fixture({existing:true,subscriptionRead:sub=>new Promise(resolve=>{finishSubscription=()=>resolve(sub);})});
 await until(()=>!f.w.document.querySelector('#alarm-enable').disabled,'race alarm ready');
 f.w.document.querySelector('#alarm-enable').click();await until(()=>finishSubscription,'held getSubscription');
 f.emit('SIGNED_IN',{id:'member-b',is_anonymous:false});finishSubscription();await sleep(30);
 assert.equal(f.pushes.includes('unsubscribe'),false,'old enable cannot unsubscribe after account switch');
 assert.equal(f.calls.some(c=>c.options.method==='POST'&&c.url.endsWith('/subscription')),false);
 f.close();
 let finishRegistration;
 f=fixture({existing:true,stored:true,permission:'granted',status:{vapidPublicKey:publicKey,subscription:{enabled:true,filters:{dateMode:'all',guests:'all'}}},registrationRead:reg=>new Promise(resolve=>{finishRegistration=()=>resolve(reg);})});
 await until(()=>!f.w.document.querySelector('#alarm-tools').hidden&&!f.w.document.querySelector('#alarm-disable').disabled,'race disable ready');
 f.w.document.querySelector('#alarm-disable').click();await until(()=>finishRegistration,'held getRegistration');
 f.emit('SIGNED_IN',{id:'member-b',is_anonymous:false});finishRegistration();await sleep(30);
 assert.equal(f.pushes.includes('unsubscribe'),false,'old disable cannot unsubscribe after account switch');
 f.close();
 // Run actual service worker with isolated window stubs; no notifications are sent.
 const events={},notifications=[],opened=[];
 const worker={location:{origin:'https://ojjuda.kr'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting(){},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)},registration:{showNotification:async(title,options)=>notifications.push({title,options})}};
 vm.runInNewContext(pushSource,{self:worker,URL,Date});
 assert.equal(events.fetch,undefined,'push worker never caches fetches');
 let done;events.push({data:{json:()=>({url:'https://evil.invalid/x',title:'Fixture',body:'Test only'})},waitUntil:p=>done=p});await done;assert.equal(notifications[0].options.data.url,'https://ojjuda.kr/byeolcheonji/');
 events.notificationclick({notification:{close(){},data:{url:'https://ojjuda.kr/byeolcheonji/?date=2026-11-06&room=7618700&guests=4&access_token=never'}},waitUntil:p=>done=p});await done;assert.equal(opened[0],'https://ojjuda.kr/byeolcheonji/?date=2026-11-06&room=7618700&guests=4');
 console.log('PASS: guest/anonymous gating, auth race, exact filters, safe Naver booking search links, no auto permission, owner-bound device token, subscription lifecycle, upstream failure/unknown states, unsafe links, push URL safety and no caching');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const window of instances)window.close();instances.clear();});

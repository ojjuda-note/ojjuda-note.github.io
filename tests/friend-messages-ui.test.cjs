const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const proof=process.env.FRIEND_MESSAGE_PROOF_DIR||'/tmp/friend-message-proof';fs.mkdirSync(proof,{recursive:true});
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',()=>'<link rel="stylesheet" href="/admin/friend-messages.css"><script>'+['world-navigation.js','world-themes.js','friend-messages.js','note/notifications.js','admin/friend-messages.js'].map(read).join('\n')+'</script><script type="module">');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
function fixtureBoot(){
 const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
 const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),authListeners=[];
 const state=window.messageFixture={A,B,C,calls:[],seen:new Set(),requests:new Map(),offlineAfterSend:false,blocked:false,pause:false,pending:null,items:[
  {id:id(1),sender_id:B,recipient_id:A,body:'오늘도 반가워! 같이 게임할까?',created_at:'2026-10-20T10:01:00Z'},
  {id:id(2),sender_id:A,recipient_id:B,body:'좋아! 잠깐만 기다려 줘.',created_at:'2026-10-20T10:02:00Z'}
 ],async account(next){D.user=next?{id:next}:null;D.isAdmin=next===A;for(const cb of authListeners)cb('SIGNED_IN',next?{user:{id:next}}:null);},admin(){D.isAdmin=true;g.tab='admin';L.area='content';L.tab='messages';H();},back:()=>worldNavigation.back(),open:()=>worldFriendMessages.open(B),render:H};
 const notes=()=>state.items.filter(m=>m.recipient_id===D.user?.id).map(m=>({id:'world:message:'+m.id,kind:'world_message',source:'world',target_type:'message',target_id:m.id,created_at:m.created_at,read_at:state.seen.has(m.id)?m.created_at:null}));
 S={schema(){return this;},auth:{onAuthStateChange(cb){authListeners.push(cb);return {data:{subscription:{unsubscribe(){const index=authListeners.indexOf(cb);if(index>=0)authListeners.splice(index,1);}}}};}},async rpc(name,args={}){
  state.calls.push({name,args});
  if(name==='app_notification_summary')return {data:{notifications:notes().filter(m=>!m.read_at).length,retention:0}};
  if(name==='app_notification_unread_count')return {data:notes().filter(m=>!m.read_at).length};
  if(name==='list_retention_alerts')return {data:[]};
  if(name==='list_app_notifications')return {data:{items:notes(),unread_count:notes().filter(m=>!m.read_at).length,has_more:false,next_cursor:null,as_of:new Date().toISOString()}};
  if(name==='mark_app_notifications_read'){for(const id of args.p_ids||notes().map(m=>m.id))state.seen.add(id.replace('world:message:',''));return {data:1};}
  if(name==='friend_message_target')return {data:{peer_id:B,message_id:args.p_id}};
  if(name==='friend_message_thread'){
   if(state.blocked)return {error:{code:'42501',message:'friend_message_unavailable'}};
   for(const m of state.items)if(m.recipient_id===D.user?.id)state.seen.add(m.id);
   return {data:{peer_id:args.p_peer,nickname:'초록산책',can_send:true,items:state.items.slice(),has_more:false,next_cursor:null}};
  }
  if(name==='send_friend_message'){
   if(state.pause)return new Promise(resolve=>state.pending=resolve);
   if(!state.requests.has(args.p_request)){const m={id:id(20+state.items.length),sender_id:D.user.id,recipient_id:args.p_recipient,body:args.p_body,created_at:'2026-10-20T10:03:00Z'};state.requests.set(args.p_request,m);state.items.push(m);}
   if(state.offlineAfterSend){state.offlineAfterSend=false;return {error:{message:'synthetic connection lost'}};}
   return {data:{ok:true,id:state.requests.get(args.p_request).id}};
  }
  if(name==='admin_trash_friend_message'){state.removed=args.p_id;return {data:{ok:true,deleted:1}};}
  if(name==='admin_friend_messages'){
   let rows=Array.from({length:36},(_,i)=>({id:id(200-i),sender_id:i%2?B:A,recipient_id:i%2?A:B,sender_name:i%2?'초록산책':'오쭈다',recipient_name:i%2?'오쭈다':'초록산책',body:i===0?'<img src=x onerror="window.injected=true">':i===1?'내일 오후에 같이 게임해요.':'친구와 주고받은 쪽지 '+i,created_at:'2026-10-20T10:00:00Z'}));
   rows=rows.filter(m=>m.id!==state.removed);if(args.p_query)rows=rows.filter(m=>m.body.includes(args.p_query)||m.sender_name.includes(args.p_query));if(args.p_before_id)rows=rows.filter(m=>m.id<args.p_before_id);const page=rows.slice(0,30);
   return {data:{items:page,has_more:rows.length>30,next_cursor:page.length?{id:page.at(-1).id,created_at:page.at(-1).created_at}:null}};
  }
  return {data:{}};
 }};
 D.online=true;D.user={id:A};D.isAdmin=true;$.me.nick='오쭈다';$.me.bio='오늘도 함께 즐겨요.';
 g.tab='my';P.searchOwner=A;P.loaded=true;P.at=Date.now();P.communityOpen=true;P.friends=[{id:B,nickname:'초록산책',bio:'반가워요'}];P.rel=new Map([[B,{id:'friend',status:'accepted',dir:'out'}]]);
 gm(()=>sr.tab({tab:'arcade'}));H();
}
world=world.slice(0,boot)+'('+fixtureBoot.toString()+')();\n'+world.slice(world.indexOf('</script>',boot));
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:850}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://messages.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto('https://messages.test/world.html');await page.waitForFunction(()=>window.messageFixture);
 assert.equal(await page.locator('[data-my-group=themes]').count(),0);
 assert.equal(await page.getByRole('button',{name:'설정',exact:true}).isVisible(),true,'unread notifications preserve the Settings accessible name');
 await page.setViewportSize({width:1280,height:850});
 assert.equal(await page.getByRole('button',{name:'내 프로필과 설정',exact:true}).isVisible(),true,'profile shortcut retains its own accessible name');
 assert.equal(await page.getByRole('button',{name:'설정',exact:true}).isVisible(),true,'desktop Settings retains its accessible name');
 await page.setViewportSize({width:390,height:850});
 assert.equal(await page.locator('[data-friend-message]').count(),1);
 await page.locator('[data-friend-message]').click();await page.waitForFunction(()=>document.querySelector('.fm-list').textContent.includes('오늘도 반가워'));
 assert.equal(await page.locator('.fm-dialog').getByText('초록산책님과의 쪽지').isVisible(),true);
 assert.equal(await page.locator('.fm-dialog').getByText('관리자',{exact:false}).count(),0,'no extra administrator notice in the composer');
 await page.locator('.fm-input').fill('작성 중인 쪽지');await page.evaluate(()=>messageFixture.render());assert.equal(await page.locator('.fm-input').inputValue(),'작성 중인 쪽지','app redraw preserves the draft');
 await page.locator('.fm-input').fill('이따가 같이 해요!');await page.locator('.fm-send').click();await page.waitForFunction(()=>document.querySelector('.fm-status').textContent==='쪽지를 보냈어요.');assert.equal(await page.locator('.fm-body').last().textContent(),'이따가 같이 해요!');
 assert.equal(await page.locator('.fm-input').inputValue(),'');
 await page.screenshot({path:path.join(proof,'friend-notes-mobile.png')});
 await page.evaluate(()=>messageFixture.offlineAfterSend=true);await page.locator('.fm-input').fill('한 번만 도착하는 쪽지');await page.locator('.fm-send').click();await page.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('전송을 확인하지'));
 assert.equal(await page.locator('.fm-input').inputValue(),'한 번만 도착하는 쪽지');await page.locator('.fm-send').click();await page.waitForFunction(()=>document.querySelector('.fm-status').textContent==='쪽지를 보냈어요.');
 assert.equal(await page.evaluate(()=>messageFixture.items.filter(m=>m.body==='한 번만 도착하는 쪽지').length),1);assert.equal(await page.evaluate(()=>{const calls=messageFixture.calls.filter(c=>c.name==='send_friend_message');return calls.at(-1).args.p_request===calls.at(-2).args.p_request;}),true);
 await page.locator('.fm-head').getByRole('button',{name:'닫기',exact:true}).click();await page.locator('.nn-bell').click();await page.locator('[data-notification-open]').first().click();await page.locator('.fm-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.fm-input').disabled===false);
 assert.equal(await page.locator('.nn-backdrop').isVisible(),false);assert.equal(await page.evaluate(()=>messageFixture.calls.some(c=>c.name==='friend_message_thread'&&c.args.p_anchor)),true,'notifications open their specific message');
 await page.evaluate(()=>messageFixture.back());await page.locator('.fm-dialog').waitFor({state:'hidden'});assert.equal(new URL(page.url()).pathname,'/world.html');
 await page.evaluate(()=>{messageFixture.blocked=true;messageFixture.open();});await page.waitForFunction(()=>document.querySelector('.fm-status').textContent.includes('볼 수 없어요'));assert.equal(await page.locator('.fm-body').count(),0);assert.equal(await page.locator('.fm-send').isDisabled(),true);
 await page.locator('.fm-head').getByRole('button',{name:'닫기',exact:true}).click();await page.evaluate(()=>{messageFixture.blocked=false;messageFixture.admin();});
 await page.waitForFunction(()=>document.querySelectorAll('.afm-card').length===30);assert.equal(await page.locator('.afm-card img').count(),0,'message bodies are text, never markup');assert.equal(await page.evaluate(()=>window.injected),undefined);
 await page.screenshot({path:path.join(proof,'admin-notes-mobile.png'),fullPage:true});
 await page.locator('.afm-pager').getByRole('button',{name:'다음',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.afm-card').length===6);
 await page.locator('.afm-search input').fill('내일');await page.locator('.afm-search').getByRole('button',{name:'검색',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.afm-card').length===1);assert.ok((await page.locator('.afm-body').textContent()).includes('내일 오후'));
 await page.setViewportSize({width:1280,height:950});await page.screenshot({path:path.join(proof,'admin-notes-desktop.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.getByRole('button',{name:'휴지통으로 이동',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.afm-card').length===0);assert.equal(await page.evaluate(()=>messageFixture.calls.filter(c=>c.name==='admin_trash_friend_message').length),1);
 await page.evaluate(()=>messageFixture.open());await page.waitForFunction(()=>document.querySelector('.fm-input').disabled===false);await page.locator('.fm-input').fill('계정이 바뀌면 없어질 내용');await page.evaluate(()=>messageFixture.pause=true);await page.locator('.fm-send').click();await page.waitForFunction(()=>!!messageFixture.pending);
 await page.evaluate(()=>messageFixture.account(messageFixture.C));await page.locator('.fm-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('.fm-input').inputValue(),'');assert.equal(await page.locator('.afm-card').count(),0);
 await page.evaluate(()=>messageFixture.pending({data:{ok:true}}));assert.equal(await page.locator('.fm-dialog').isVisible(),false,'late send response cannot reopen another account');
 assert.deepEqual(errors,[]);await context.close();console.log('PASS: friend entry, send/reply, notification anchor, Back, redraw draft, retry idempotence, blocked history, admin search/pages/XSS, account-switch isolation and mobile/desktop layout');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

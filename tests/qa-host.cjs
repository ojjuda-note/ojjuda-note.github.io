'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const origin='https://ojjuda.kr';
const rights=mode=>({
  adult:{data:{locked:true,age:19},error:null},
  minor:{data:{locked:true,age:18},error:null},
  unregistered:{data:null,error:null},
  error:{data:null,error:{message:'offline'}},
  unlocked:{data:{locked:false,age:30},error:null}
})[mode]||{data:null,error:{message:'unknown'}};
async function makePage(browser,mock,actor,errors,mode='adult',gate){
  const context=await browser.newContext({viewport:{width:350,height:730},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',err=>errors.push(String(err)));
  const identity={actor,mode};
  const records=[];
  page.qa={records,identity};
  await page.exposeFunction('qaRpc',async(name,args={})=>{
    records.push([name,args,identity.actor]);
    if(name==='drinking_prompt_suggestions' && args.p_action==='pool' && identity.mode==='adult')return {data:{king:[],imagevote:[],fingers:[],truthFull:true,truth:{mild:['순한맛'],spicy:['빨간맛']}},error:null};
    if(name==='get_my_member_identity'){
      const recordedMode=identity.mode;
      if(gate)await gate.promise;
      return rights(recordedMode);
    }
    if(name!=='arcade_room_service'&&identity.mode!=='adult'){
      const detail='Game RPC before adult approval: '+name;
      errors.push(detail);return {data:null,error:{message:'adult_required'}};
    }
    return mock.rpc(identity.actor,name,args);
  });
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/world.html')return route.fulfill({contentType:'text/plain',body:'arcade'});
    if(pathname==='/config.js'){
      const user=identity.mode==='signedout'?null:{id:identity.actor,is_anonymous:identity.mode==='anonymous',user_metadata:{age:35,adult:true}};
      const body=`(() => {
        let user=${JSON.stringify(user)};
        const listeners=new Set();
        window.qaChangeAuth=next=>{
          user=next;for(const listener of [...listeners])listener(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null);
        };
        const client={auth:{getSession:async()=>({data:{session:user?{user}:null},error:null}),
          getUser:async()=>({data:{user},error:null}),onAuthStateChange:fn=>{
            listeners.add(fn);queueMicrotask(()=>{if(listeners.has(fn))fn('INITIAL_SESSION',user?{user}:null);});return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};
          }},
          rpc:(name,args)=>{const pending=window.qaRpc(name,args||{});pending.abortSignal=()=>pending;return pending;}};
        window.OjjudaGetClient=async()=>client;
      })();`;
      return route.fulfill({contentType:'text/javascript; charset=utf-8',body});
    }
    const file=path.join(process.cwd(),pathname.slice(1),pathname.endsWith('/')?'index.html':'');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'missing'});
    const contentType={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType,body:fs.readFileSync(file)});
  });
  return page;
}
const parent='A0B1C2', lobby=origin+'/games/drinking/?room='+parent, rooms=origin+'/games/drinking/?mode=multi';
const nick={me:'방울',a:'나비',b:'단비',c:'별이'};
const ok=data=>({data,error:null}), fail=message=>({data:null,error:{message}});
function model() {
  const m={members:['me','a','b','c'],phase:'lobby',revision:1,kind:null,round:0,child:null,calls:[],receipts:new Map(),pause:null,rejectNext:false};
  const state=who=>({code:parent,title:'방장 인계 점검',capacity:4,players:m.members.map(id=>nick[id]),me:m.members.indexOf(who),phase:m.phase,kind:m.kind,round:m.round,revision:m.revision,child:m.child});
  m.rpc=async(who,name,{p_code:code,p_action:action,p_options:o={}})=>{
    const me=m.members.indexOf(who);
    m.calls.push({who,name,code,action,o});
    if(name==='party_live_multiplayer'){
      if(!m.child||code!==m.child||me<0)return fail('room_unavailable');
      assert.equal(action,'state');
      return ok({code:m.child,title:'방장 인계 점검',capacity:m.members.length,players:m.members.map(id=>nick[id]),me,revision:1,phase:'setup',kind:m.kind,round:1,game:{phase:'setup',baseSeconds:20},serverMs:Date.now()});
    }
    assert.equal(name,'drinking_room');
    if(action==='list')return ok({rooms:m.members.length?[{code:parent,title:'방장 인계 점검',players:m.members.length,capacity:4,host:nick[m.members[0]],phase:m.phase,mine:me>=0}]:[]});
    if(action==='mine')return ok({room:me<0?null:state(who)});
    assert.equal(code,parent);
    if(action==='leave'&&m.receipts.has(who+o.request_id))return ok({left:true});
    if(!m.members.length)return fail('room_unavailable');
    if(me<0)return fail('not_room_member');
    if(action==='state')return ok(state(who));
    assert.match(o.request_id,/^[a-f0-9-]{36}$/i);
    if(o.revision!==m.revision)return fail('stale_state');
    if(action==='leave'){
      if(m.pause){const pause=m.pause;m.pause=null;await pause;}
      if(m.rejectNext){m.rejectNext=false;return fail('temporarily_offline');}
      m.members.splice(me,1);
      if(me===0&&m.members.length>1)m.members.unshift(m.members.pop());
      m.revision++;m.phase='lobby';m.child=null;
      m.receipts.set(who+o.request_id,true);
      return ok({left:true});
    }
    if(me!==0)return fail('host_only');
    if(action==='select'){assert.equal(m.phase,'lobby');m.kind=o.kind;}
    else if(action==='start'){assert.equal(m.phase,'lobby');assert.ok(m.members.length>=2);m.phase='playing';m.round++;m.child='C'+String(m.round).padStart(5,'0');}
    else if(action==='return'){assert.equal(m.phase,'playing');m.child=null;m.phase='lobby';}
    else throw Error(action);
    m.revision++;return ok(state(who));
  };
  return m;
}
const leaveCalls=(m,id)=>m.calls.filter(c=>c.who===id&&c.action==='leave');
async function checkLobby(page,host,members){
  await page.waitForURL(lobby);await page.locator('#lobby:visible').waitFor();
  await page.waitForFunction(({count,leader})=>{
    const rows=[...document.querySelectorAll('#members li')];
    return rows.length===count && rows[0].textContent.includes(leader) && rows[0].textContent.includes('방장');
  },{count:members.length,leader:nick[members[0]]});
  assert.equal(await page.locator('#start').isVisible(),host);
  assert.equal(await page.locator('[data-game=bomb]').isEnabled(),host);
  assert.equal(await page.locator('#lobby-code').textContent(),parent);
}
async function question(page,button,confirm){
  let text='';
  page.once('dialog',async dlg=>{text=dlg.message();if(confirm)await dlg.accept();else await dlg.dismiss();});
  await page.locator(button).click();
  assert.ok(text,'expected native confirmation');
  return text;
}
async function groupEntry(pages){
  for(const page of pages){await page.waitForURL(u=>u.pathname==='/games/bomb/'&&u.searchParams.get('party')===parent);
    await page.locator('#game h1').waitFor();await page.locator('[data-party-leave]').waitFor();}
}
async function waitUntil(predicate){
  for(let i=0;i<50;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}
  throw Error('timed out waiting for request');
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const errors=[],m=model(),windows={};
  try{
    for(const id of m.members)windows[id]=await makePage(browser,m,id,errors);
    await Promise.all(Object.values(windows).map(p=>p.goto(lobby)));
    await Promise.all(m.members.map(id=>checkLobby(windows[id],id==='me',m.members)));
    const a=windows.a,b=windows.b,c=windows.c;
    await windows.me.context().close();
    await a.reload();await checkLobby(a,false,m.members);
    assert.equal(leaveCalls(m,'me').length,0);
    const host=await makePage(browser,m,'me',errors);
    windows.me=host;await host.goto(lobby);await checkLobby(host,true,m.members);
    const canceled=await question(host,'#leave',false);assert.match(canceled,/방장/);
    assert.equal(leaveCalls(m,'me').length,0);
    m.rejectNext=true;
    await question(host,'#leave',true);await host.locator('#notice').filter({hasText:/연결|다시/}).waitFor();
    assert.equal(m.members[0],'me');
    let release; m.pause=new Promise(resolve=>{release=resolve;});
    host.once('dialog',dlg=>dlg.accept());
    await host.locator('#leave').evaluate(button=>{button.click();button.click();});
    await waitUntil(()=>leaveCalls(m,'me').length===2);
    assert.equal(leaveCalls(m,'me')[0].o.request_id,leaveCalls(m,'me')[1].o.request_id);
    assert.ok(await host.locator('#leave').isDisabled());
    release();await host.waitForURL(rooms);
    await Promise.all([checkLobby(a,false,['c','a','b']),checkLobby(b,false,['c','a','b']),checkLobby(c,true,['c','a','b'])]);
    await c.reload();await checkLobby(c,true,['c','a','b']);
    await c.locator('[data-game=bomb]').click();
    await c.locator('[data-game=bomb][aria-pressed=true]').waitFor();await c.locator('#start').click();
    await groupEntry([a,b,c]);
    assert.ok(await c.locator('[data-party-return]').isVisible());assert.equal(await a.locator('[data-party-return]').count(),0);
    assert.match(await question(c,'[data-party-leave]',false),/방장/);assert.equal(leaveCalls(m,'c').length,0);
    await question(c,'[data-party-return]',true);await Promise.all([checkLobby(a,false,m.members),checkLobby(b,false,m.members),checkLobby(c,true,m.members)]);
    await c.locator('#start').click();await groupEntry([a,b,c]);
    const hostDuring=await question(c,'[data-party-leave]',true);
    assert.match(hostDuring,/방장/);assert.match(hostDuring,/대기실/);
    await c.waitForURL(rooms);await Promise.all([checkLobby(b,true,['b','a']),checkLobby(a,false,['b','a'])]);
    await b.locator('#start').click();await groupEntry([a,b]);
    assert.ok(await b.locator('[data-party-return]').isVisible());
    await question(b,'[data-party-leave]',true);await b.waitForURL(rooms);
    await checkLobby(a,true,['a']);
    assert.ok(await a.locator('#start').isDisabled(),'a one-person room remains available but cannot deal');
    assert.match(await question(a,'#leave',false),/닫|종료|사라/);assert.equal(leaveCalls(m,'a').length,0);
    await question(a,'#leave',true);await a.waitForURL(rooms);assert.deepEqual(m.members,[]);
    await a.locator('#entry').waitFor();assert.equal(await a.locator('[data-room="'+parent+'"]').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS shared lobby and in-game host transfer; same code; host-only controls; transient disconnect; canceled, retried and duplicate clicks; 2-to-1 and last departure.');
  }catch(e){console.error(m.calls.slice(-12).map(c=>[c.who,c.name,c.action]),m.members,errors);throw e;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

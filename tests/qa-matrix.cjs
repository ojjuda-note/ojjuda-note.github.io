'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const origin='https://ojjuda.kr';
const kinds=['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
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
const parent='A0B1C2', names=['다은','하늘','바다'];
function mockRoom() {
  let selected=null, child=null, revision=1, phase='lobby', round=0;
  const calls=[],issues=[];
  const ok=data=>({data,error:null});
  function snapshot(actor){
    return {code:parent,title:'13종 점검',capacity:3,players:names,me:actor==='host'?0:1,phase,kind:selected,child,round,revision};
  }
  function firstState(actor){
    const me=actor==='host'?0:1;
    const common={code:child,capacity:3,me,players:names,title:'13종 점검',round:1,revision:1,serverMs:Date.now()};
    const top=(phase,rest)=>ok({...common,phase,...rest});
    const state=(phase,rest)=>top(phase,{kind:selected,game:{phase,...rest}});
    switch(selected){
      case 'croc':return top('playing',{turn:0,pressed:[]});
      case 'king':return top('cards',{card:me,ready:false,readyCount:0});
      case 'liar':return top('hints',{turn:0,role:me?'liar':'citizen',word:me?null:'수박',hints:[]});
      case 'minority':return top('vote',{kind:selected,choices:['구름','바다'],voted:false,voteCount:0});
      case 'mission':return top('cards',{kind:selected,word:'펭귄',ready:false,readyCount:0});
      case 'bottle':return state('table',{shape:'round',direction:'horizontal',positions:[null,null,null]});
      case 'bomb':return state('setup',{baseSeconds:25});
      case 'stopwatch':return state('setup',{target:50});
      case 'truth':return state('setup',{});
      case 'initial':return state('ready',{current:0,turn:0,alive:[0,1,2],initial:'ㄱㅅ'});
      case 'fingers':return state('prompt',{current:0,turn:0,fingers:[5,5,5]});
      case 'imagevote':return state('prompt',{current:0,turn:0});
      case 'updown':return state('guess',{current:0,turn:0,low:1,high:100});
      default:throw Error('unknown '+selected);
    }
  }
  function rpc(actor,name,args) {
    try {
      const {p_action:a,p_code:c,p_options:o}=args;
      calls.push([actor,name,a,selected]);
      if(name==='drinking_room'){
        if(a==='mine')return ok({room:snapshot(actor)});
        assert.equal(c,parent);
        if(a==='state')return ok(snapshot(actor));
        assert.equal(actor,'host');assert.equal(o.revision,revision);revision++;
        if(a==='select'){assert.equal(phase,'lobby');selected=o.kind;}
        else if(a==='start'){assert.equal(phase,'lobby');assert.equal(o.kind,selected);phase='playing';round++;child='E'+String(round).padStart(5,'0');}
        else if(a==='return'){assert.equal(phase,'playing');phase='lobby';child=null;}
        else throw Error('unexpected parent '+a);
        return ok(snapshot(actor));
      }
      const expected=({croc:'croc_multiplayer',liar:'liar_multiplayer',king:'king_multiplayer',minority:'party_vote_multiplayer',mission:'party_vote_multiplayer'})[selected]||'party_live_multiplayer';
      if(!child||c!==child)return {data:null,error:{message:'room_unavailable'}};
      assert.equal(name,expected);assert.equal(a,'state');
      return firstState(actor);
    }catch(e){issues.push(e.message);throw e;}
  }
  return {rpc,issues,calls};
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const errors=[],mock=mockRoom(),root=origin+'/games/drinking/?room='+parent;
  const host=await makePage(browser,mock,'host',errors),guest=await makePage(browser,mock,'guest',errors);
  host.on('dialog',d=>d.accept());
  try {
    await Promise.all([host.goto(root),guest.goto(root)]);
    for(const kind of kinds){
      const tile=host.locator('#games [data-game="'+kind+'"]');
      await tile.click();await host.locator('#games [data-game="'+kind+'"][aria-pressed=true]').waitFor();
      await host.locator('#start').click();
      for(const page of [host,guest]){
        await page.waitForURL(u=>u.pathname==='/games/'+kind+'/'&&u.searchParams.get('party')===parent);
        await page.locator('#view h1').waitFor();
        assert.equal(await page.locator('#entry:visible').count(),0);
        assert.equal(await page.locator('[data-party-return]:visible').count(),page===host?1:0);
        assert.equal(await page.locator('[data-party-leave]:visible').count(),1);
      }
      // A refresh must stay in the same child room without a second invitation/password.
      const currentUrl=guest.url();await guest.reload();await guest.locator('#view h1').waitFor();assert.equal(guest.url(),currentUrl);
      await host.locator('[data-party-return]').click();
      for(const page of [host,guest]){
        await page.waitForURL(root);
        await page.locator('#games').waitFor();
        assert.equal(await page.locator('#members li').count(),3);
      }
      console.log('Room entry, guest reload and group return passed:',kind);
    }
    assert.equal(mock.calls.filter(c=>c[0]==='host'&&c[1]==='drinking_room'&&c[2]==='start').length,13);
    assert.equal(mock.calls.filter(c=>c[0]==='host'&&c[1]==='drinking_room'&&c[2]==='return').length,13);
    assert.deepEqual(mock.issues,[]);assert.deepEqual(errors,[]);
  }catch(e){console.error('Recent calls',mock.calls.slice(-12),'UI errors',errors,'Mock errors',mock.issues);throw e;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

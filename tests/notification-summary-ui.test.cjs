const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(process.env.OJJUDA_NOTIFICATION_SOURCE||path.join(__dirname,'../note/notifications.js'),'utf8');
const settle=async()=>{await new Promise(setImmediate);await new Promise(setImmediate);};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const uuid=n=>'a0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const retention=(n,read=false)=>({id:uuid(n),card_id:uuid(n+100),created_at:'2026-10-30T00:00:00Z',
  archive_due_at:'2026-11-01T00:00:00Z',read_at:read?'2026-10-30T01:00:00Z':null,body:'합성 카드 본문'});
const missing=(code='PGRST202',name='public.app_notification_summary')=>({error:{code,
  message:code==='PGRST202'?`Could not find the function ${name} without parameters in the schema cache`:`function ${name}() does not exist`}});

function fixture({user='member-a',handle}={}){
  const dom=new JSDOM('<main><div data-notifications-slot></div><span data-notification-badge hidden></span><i data-notification-dot hidden></i><button data-note-my></button></main>',
    {url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[],timers=[],intervals=[],broadcasts=[],channels=[];
  let identity=user,visibility='visible',clock=1000000,authCallback;
  let responder=handle||((name)=>name==='app_notification_summary'?{data:{notifications:3,retention:2}}:
    name==='app_notification_unread_count'?{data:3}:name==='list_retention_alerts'?{data:[retention(1),retention(2)]}:
    name==='list_app_notifications'?{data:{items:[],unread_count:3,as_of:'2026-10-31T00:00:00Z',has_more:false,next_cursor:null}}:
    {error:{code:'unexpected_rpc',message:name}});
  Object.defineProperty(w.document,'visibilityState',{configurable:true,get:()=>visibility});
  w.Date.now=()=>clock;
  w.setTimeout=callback=>{timers.push(callback);return timers.length;};
  w.setInterval=callback=>{intervals.push(callback);return intervals.length;};
  w.BroadcastChannel=class {constructor(){channels.push(this);}postMessage(value){broadcasts.push(value);}close(){}};
  const invoke=async(schema,name,args)=>{calls.push({schema,name,user:identity,args});return responder(name,args,identity,schema);};
  const client={rpc:(name,args)=>invoke('public',name,args),schema:schema=>({rpc:(name,args)=>invoke(schema,name,args)}),
    auth:{onAuthStateChange(callback){authCallback=callback;}}};
  w.eval(source);const api=w.OjjudaNotifications.install({client,getUserId:()=>identity});
  return {dom,w,api,calls,channels,broadcasts,
    badge:()=>({hidden:w.document.querySelector('#note-notification-badge').hidden,text:w.document.querySelector('#note-notification-badge').textContent}),
    respond:callback=>{responder=callback;},advance:ms=>{clock+=ms;},
    async boot(){for(const callback of timers.splice(0))callback();await settle();},
    async poll(){for(const callback of intervals)callback();await settle();},
    async user(next){identity=next;authCallback(next?'SIGNED_IN':'SIGNED_OUT',next?{user:{id:next}}:null);for(const callback of timers.splice(0))callback();await settle();},
    visibility(value){visibility=value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    close:()=>w.close()
  };
}

test('closed notification badge uses one summary request and keeps the detail list on demand',async()=>{
  const f=fixture();try{
    await f.boot();assert.deepEqual(f.calls.map(c=>c.name),['app_notification_summary']);
    assert.equal(f.calls[0].schema,'public');assert.deepEqual(f.badge(),{hidden:false,text:'5'});
    assert.equal(f.w.document.querySelector('[data-notification-badge]').textContent,'5');
    assert.equal(f.w.document.querySelector('[data-notification-dot]').hidden,false);
    f.calls.length=0;f.api.open();await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts']);
    assert.equal(f.api.isOpen(),true);assert.equal(f.badge().text,'5');
  }finally{f.close();}
});

test('signed-out and hidden pages make no badge request; polling throttles and force refresh works',async()=>{
  const f=fixture({user:null});try{
    await f.boot();await f.api.refresh();await f.poll();assert.equal(f.calls.length,0);
    f.visibility('hidden');await f.user('member-a');await f.api.refresh();assert.equal(f.calls.length,0);
    f.visibility('visible');await settle();assert.equal(f.calls.length,1);
    await f.poll();assert.equal(f.calls.length,1);
    f.advance(15000);await f.poll();assert.equal(f.calls.length,2);
    await f.api.refresh({force:true});assert.equal(f.calls.length,3);
    await f.user(null);assert.equal(f.badge().hidden,true);await f.api.refresh();assert.equal(f.calls.length,3);
  }finally{f.close();}
});

test('simultaneous forced refreshes share one in-flight summary',async()=>{
  const pending=deferred(),f=fixture({handle:()=>pending.promise});try{
    await f.boot();const first=f.api.refresh(),second=f.api.refresh({force:true}),third=f.api.refresh();
    assert.equal(f.calls.length,1);pending.resolve({data:{notifications:2,retention:1}});
    await Promise.all([first,second,third]);assert.equal(f.badge().text,'3');assert.equal(f.calls.length,1);
  }finally{f.close();}
});

test('old-account summary and missing-function errors cannot affect the new account or start fallback',async()=>{
  for(const oldResponse of [{data:{notifications:99,retention:99}},missing()]){
    const pending=deferred(),f=fixture({handle:(_name,_args,user)=>user==='member-a'?pending.promise:{data:{notifications:1,retention:0}}});
    try{
      await f.boot();await f.user('member-b');assert.equal(f.calls.length,2);assert.equal(f.badge().text,'1');
      pending.resolve(oldResponse);await settle();assert.equal(f.calls.length,2);assert.equal(f.badge().text,'1');
    }finally{f.close();}
  }
});

test('a detail-list response supersedes an earlier badge summary',async()=>{
  const pending=deferred(),f=fixture({handle:name=>name==='app_notification_summary'?pending.promise:
    name==='list_app_notifications'?{data:{items:[],unread_count:2,as_of:'2026-10-31T00:00:00Z',has_more:false}}:{data:[retention(1)]}});
  try{
    await f.boot();f.api.open();await settle();assert.equal(f.badge().text,'3');
    pending.resolve({data:{notifications:80,retention:10}});await settle();assert.equal(f.badge().text,'3');
  }finally{f.close();}
});

test('only a missing summary RPC uses legacy counts and keeps retention validation',async()=>{
  for(const code of ['PGRST202','42883']){
    const f=fixture({handle:name=>name==='app_notification_summary'?missing(code):name==='app_notification_unread_count'?{data:4}:
      {data:[retention(1),retention(2,true),{...retention(3),id:'invalid'}, {...retention(4),archive_due_at:'bad'}]}});
    try{
      await f.boot();assert.deepEqual(f.calls.map(c=>c.name),['app_notification_summary','app_notification_unread_count','list_retention_alerts']);
      assert.equal(f.badge().text,'5');assert.equal(f.calls.at(-1).schema,'ojjuda_note');
    }finally{f.close();}
  }
});

test('ordinary errors and malformed summaries preserve last good values without duplicate requests',async()=>{
  const f=fixture();try{
    await f.boot();assert.equal(f.badge().text,'5');
    for(const response of [{error:{code:'42501',message:'permission denied'}},{error:{code:'NETWORK',message:'fetch failed'}},
      missing('42883','ojjuda_note.list_retention_alerts'),{data:{notifications:-1,retention:0}},
      {data:{notifications:2,retention:'1'}},{data:null}]){
      f.calls.length=0;f.respond(()=>response);await f.api.refresh();
      assert.deepEqual(f.calls.map(c=>c.name),['app_notification_summary']);assert.equal(f.badge().text,'5');
    }
    f.respond(()=>({data:{notifications:0,retention:0}}));await f.api.refresh();assert.equal(f.badge().hidden,true);
  }finally{f.close();}
});

test('legacy fallback retains each successful count when the other request fails',async()=>{
  const f=fixture();try{
    await f.boot();assert.equal(f.badge().text,'5');
    f.respond(name=>name==='app_notification_summary'?missing():name==='app_notification_unread_count'?{data:7}:{error:{code:'NETWORK'}});
    await f.api.refresh();assert.equal(f.badge().text,'9','new notification count plus prior retention count');
    f.respond(name=>name==='app_notification_summary'?missing():name==='app_notification_unread_count'?{error:{code:'NETWORK'}}:{data:[retention(1)]});
    await f.api.refresh();assert.equal(f.badge().text,'8','prior notification count plus new retention count');
  }finally{f.close();}
});

test('same-account read broadcasts force a fresh count and ignore other-account broadcasts',async()=>{
  const f=fixture();try{
    await f.boot();f.calls.length=0;f.respond(()=>({data:{notifications:0,retention:0}}));
    f.channels[0].onmessage({data:{type:'read',user:'member-b'}});await settle();assert.equal(f.calls.length,0);
    f.channels[0].onmessage({data:{type:'read',user:'member-a'}});await settle();assert.equal(f.calls.length,1);assert.equal(f.badge().hidden,true);
    f.w.dispatchEvent(new f.w.Event('ojjuda:messages-read'));await settle();assert.equal(f.calls.length,2);
    assert.equal(f.broadcasts.at(-1).type,'read');assert.equal(f.broadcasts.at(-1).user,'member-a');
  }finally{f.close();}
});

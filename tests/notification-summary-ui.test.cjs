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

function fixture({user='member-a',handle,refreshClosedBadge,options={}}={}){
  const dom=new JSDOM('<main><div data-notifications-slot></div><span data-notification-badge hidden></span><i data-notification-dot hidden></i><button data-note-my></button></main>',
    {url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[],timers=[],intervals=[],broadcasts=[],channels=[],openedGroups=[];
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
  w.eval(source);const api=w.OjjudaNotifications.install({client,getUserId:()=>identity,refreshClosedBadge,onOpenGroup:id=>openedGroups.push(id),...options});
  return {dom,w,api,calls,channels,broadcasts,openedGroups,
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

test('the notification toolbar is visible to members and hidden from guests',async()=>{
  const f=fixture({user:null});
  try {
    const {document}=f.w;
    const style=document.createElement('style');
    style.textContent=fs.readFileSync(path.join(__dirname,'../note/notifications.css'),'utf8');
    document.head.append(style);
    await f.boot();
    f.api.open();
    const toolbar=document.querySelector('.nn-toolbar');
    assert.equal(f.w.getComputedStyle(toolbar).display,'none');
    assert.match(document.querySelector('.nn-list').textContent,/로그인/);
    assert.equal(f.calls.length,0);
    await f.user('member-a');
    f.api.open();
    await settle();
    assert.equal(f.w.getComputedStyle(toolbar).display,'flex');
    assert.match(toolbar.querySelector('.nn-summary').textContent,/알림 5개/);
    await f.user(null);
    f.api.open();
    assert.equal(f.w.getComputedStyle(toolbar).display,'none');
  } finally { f.close(); }
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

test('a service inbox opens local targets and handles invitations without leaving the service',async()=>{
  const targets=[],time='2026-11-06T00:00:00Z';
  const items=['friends','guestbook','group_invite'].map((type,i)=>({
    id:'world:'+type+':'+uuid(i),source:'world',target_type:type,target_id:uuid(i),
    kind:['world_friend_request','world_guestbook','group_invite'][i],created_at:time
  }));
  const f=fixture({options:{canOpenWorldTarget:type=>type==='friends',allowInviteNavigation:false,
    onOpenWorld:(type,id)=>targets.push([type,id])},handle:name=>{
    if(name==='list_app_notifications')return {data:{items,unread_count:items.length,as_of:time,has_more:false}};
    if(name==='list_retention_alerts')return {data:[]};
    if(name==='group_invitation'){items.pop();return {data:{room_id:uuid(100)}};}
    return {data:0};
  }});
  try {
    await f.boot();f.api.open();await settle();
    const d=f.w.document;
    assert.equal(d.querySelectorAll('[data-notification-open]').length,1);
    assert.ok(d.querySelector('[data-notification-read]'));
    d.querySelector('[data-group-invite-action="accept"]').click();await settle();
    assert.equal(f.api.isOpen(),true);assert.deepEqual(f.openedGroups,[]);
    d.querySelector('[data-notification-open]').click();await settle();
    assert.deepEqual(targets,[['friends',uuid(0)]]);
  } finally {f.close();}
});

test('group notifications identify the inviter and join only after acceptance',async()=>{
  for(const action of ['accept','decline']){
    let pending=true;
    const notice={id:'world:group_invite:'+uuid(700),kind:'group_invite',source:'world',target_type:'group_invite',target_id:uuid(700),group_name:'우리 <script>모임',sender_name:'수빈',created_at:'2026-11-06T00:00:00Z',read_at:null};
    const f=fixture({handle:(name,args)=>{
      if(name==='group_invitation'){assert.equal(args.p_action,action);assert.equal(args.p_payload.id,notice.target_id);pending=false;return {data:{room_id:uuid(701)}};}
      if(name==='app_notification_summary')return {data:{notifications:pending?1:0,retention:0}};
      if(name==='list_retention_alerts')return {data:[]};
      if(name==='list_app_notifications')return {data:{items:pending?[notice]:[],unread_count:pending?1:0,as_of:'2026-11-06T01:00:00Z',has_more:false}};
      return {data:0};
    }});
    try{await f.boot();f.api.open();await settle();const d=f.w.document;
      assert.match(d.querySelector('.nn-copy').textContent,/수빈.*우리 <script>모임/);assert.equal(d.querySelector('.nn-copy script'),null);
      assert.equal(f.calls.some(c=>c.name==='group_invitation'),false);
      d.querySelector(`[data-group-invite-action="${action}"]`).click();await settle();
      assert.equal(f.calls.filter(c=>c.name==='group_invitation').length,1);
      assert.deepEqual(f.openedGroups,action==='accept'?[uuid(701)]:[]);
      if(action==='decline')assert.equal(d.querySelector('[data-group-invite-action]'),null);
    }finally{f.close();}
  }
});

test('a locked group notification retains its invitation through a wrong password and accepts on retry',async()=>{
 const notice={id:'world:group_invite:'+uuid(710),target_id:uuid(710),kind:'group_invite',source:'world',created_at:'2026-11-06T00:00:00Z'};
 const f=fixture({handle:(name,args)=>{
  if(name==='group_invitation'){
   const value=args.p_payload.password;
   if(value==='정확함')return {data:{room_id:uuid(711)}};
   return {data:{ok:false,reason:value?'password_incorrect':'password_required',message:value?'다시 입력해 주세요.':'그룹 비밀번호를 입력해 주세요.'}};
  }
  if(name==='app_notification_summary')return {data:{notifications:1,retention:0}};
  if(name==='list_retention_alerts')return {data:[]};
  if(name==='list_app_notifications')return {data:{items:[notice],unread_count:1,as_of:notice.created_at,has_more:false}};
  return {data:null};
 }});
 try{
  await f.boot();f.api.open();await settle();
  const d=f.w.document,accept=d.querySelector('[data-group-invite-action=accept]');
  accept.click();await settle();const input=d.querySelector('.nn-group-password input');
  assert.equal(input.type,'password');assert.equal(d.activeElement,input);assert.deepEqual(f.openedGroups,[]);
  input.value='틀림';accept.click();await settle();
  assert.match(d.querySelector('.nn-status').textContent,/다시 입력/);assert.deepEqual(f.openedGroups,[]);
  input.value='정확함';input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle();
  assert.deepEqual(f.openedGroups,[uuid(711)]);assert.equal(f.api.isOpen(),false);
 }finally{f.close();}
});

test('visit gifts need explicit confirmation even after mark-all; a repeated click sends one claim', async () => {
  const f=fixture(), pending=deferred(), created='2026-11-13T03:00:00Z';
  let read=false, claimed=false;
  const item=()=>({id:'world:visit_gift',kind:'visit_gift',source:'world',created_at:created,
    read_at:read?created:null,first_visit_ju:10000,launch_ju:10000,claimed});
  f.respond(async name=>{
    if(name==='app_notification_summary')return {data:{notifications:read?0:1,retention:0}};
    if(name==='list_app_notifications')return {data:{items:[item()],unread_count:read?0:1,as_of:created}};
    if(name==='list_retention_alerts')return {data:[]};
    if(name==='mark_app_notifications_read'){read=true;return {data:1};}
    if(name==='claim_visit_gift'){await pending.promise;claimed=true;return {data:{amount:20000,coins:20000,replayed:false}};}
    throw Error(name);
  });
  try {
    await f.boot();f.api.open();await settle();
    const d=f.w.document;
    const row=()=>d.querySelector('[data-notification-id="world:visit_gift"]');
    assert.match(row().textContent,/첫 방문 선물 10,000쭈.*타로카드·사주·바이오리듬 오픈 기념 10,000쭈.*총 20,000쭈/);
    d.querySelector('#note-notifications-read-all').click();await settle();
    assert.equal(f.calls.some(c=>c.name==='claim_visit_gift'),false);
    const confirm=row().querySelector('button');assert.equal(confirm.textContent,'확인');
    confirm.click();confirm.click();await settle();
    assert.equal(f.calls.filter(c=>c.name==='claim_visit_gift').length,1);
    pending.resolve();await settle();
    assert.match(row().textContent,/지급 완료/);assert.equal(row().querySelector('button'),null);
  } finally {f.close();}
});

test('the bell shows the drinking room title and can decline a friend invitation',async()=>{
  const target=uuid(712);
  let pending=true;
  const f=fixture({handle:async(name,args)=>{
    if(name==='arcade_friend_invite'){
      assert.equal(args.p_id,target);assert.equal(args.p_action,'decline');pending=false;return {data:{ok:true}};
    }
    if(name==='app_notification_summary')return {data:{notifications:pending?1:0,retention:0}};
    if(name==='list_retention_alerts')return {data:[]};
    if(name==='list_app_notifications')return {data:{items:pending?[{id:'world:drinking_invite:'+target,kind:'drinking_invite',
      source:'world',target_id:target,room_title:'수달의 테이블',sender_name:'친구',created_at:'2026-11-15T01:00:00Z'}]:[],
      unread_count:pending?1:0,as_of:'2026-11-15T01:00:01Z'}};
    return {data:0};
  }});
  try{
    await f.boot();f.api.open();await settle();
    const d=f.w.document;
    assert.match(d.querySelector('.nn-copy').textContent,/친구.*수달의 테이블/);
    assert.ok(d.querySelector('[data-drinking-invite-action="accept"]'));
    d.querySelector('[data-drinking-invite-action="decline"]').click();await settle();
    assert.equal(d.querySelector('[data-drinking-invite-action]'),null);
    assert.equal(f.calls.filter(c=>c.name==='arcade_friend_invite').length,1);
  }finally{f.close();}
});

test('read bursts during a pending badge request use one fresh snapshot',async()=>{
  const first=deferred(),latest=deferred(),f=fixture({handle:()=>first.promise});
  try {
    await f.boot();
    f.respond(()=>latest.promise);
    for(let i=0;i<5;i++)f.channels[0].onmessage({data:{type:'read',user:'member-a'}});
    await settle();
    assert.equal(f.calls.length,2,'the new snapshot starts without waiting for the obsolete one');
    first.resolve({data:{notifications:99,retention:0}});await settle();
    assert.equal(f.badge().hidden,true,'the superseded count stays off screen');
    assert.equal(f.calls.length,2);
    latest.resolve({data:{notifications:1,retention:0}});await settle();
    assert.equal(f.badge().text,'1');
  }finally{f.close();}
});

test('an open list reconciles reads received during loading without a manual refresh',async()=>{
  const f=fixture(),oldList=deferred();
  const list=n=>({data:{items:[],unread_count:n,as_of:'2026-11-15T00:00:00Z'}});
  try {
    await f.boot();f.calls.length=0;
    f.respond(name=>name==='list_app_notifications'?oldList.promise:{data:[]});
    f.api.open();
    for(let i=0;i<5;i++)f.channels[0].onmessage({data:{type:'read',user:'member-a'}});
    f.respond(name=>name==='list_app_notifications'?list(0):{data:[]});
    oldList.resolve(list(9));await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts','list_app_notifications','list_retention_alerts']);
    assert.equal(f.badge().hidden,true);
    assert.equal(f.w.document.querySelector('.nn-summary').textContent,'새 알림이 없어요.');
  }finally{f.close();}
});

test('reads that arrive during a refresh leave at most one trailing count for that account',async()=>{
  const f=fixture(),pending=deferred();
  try {
    await f.boot();f.calls.length=0;
    f.respond(()=>pending.promise);
    const signal=()=>f.channels[0].onmessage({data:{type:'read',user:'member-a'}});
    signal();await settle();
    for(let i=0;i<4;i++){signal();await settle();}
    assert.equal(f.calls.length,1);
    f.respond(()=>({data:{notifications:0,retention:0}}));
    pending.resolve({data:{notifications:8,retention:0}});await settle();
    assert.equal(f.calls.length,2);assert.equal(f.badge().hidden,true);
  }finally{f.close();}
});

test('retry after a failed next page resumes at the same cursor without replacing earlier rows', async () => {
  const page = id => ({id:uuid(id), kind:'like', created_at:'2026-10-30T00:00:00Z'});
  const f = fixture();
  try {
    await f.boot();
    const retry = deferred();
    let thirdPageAttempts = 0;
    f.respond((name,args) => {
      if (name === 'list_retention_alerts') return {data:[retention(20)]};
      const last = args.p_before_id;
      if (last === uuid(2)) {
        if (++thirdPageAttempts === 1) return {error:{message:'temporary'}};
        return retry.promise;
      }
      const item = page(last ? 2 : 1);
      return {data:{items:[item], unread_count:3, as_of:item.created_at, has_more:true, next_cursor:item}};
    });
    const doc = f.w.document;
    f.api.open(); await settle();
    doc.querySelector('#note-notifications-more').click(); await settle();
    const firstRow = doc.querySelector('[data-notification-id="'+uuid(1)+'"]');
    doc.querySelector('#note-notifications-more').click(); await settle();
    const retryButton = [...doc.querySelectorAll('.nn-pagination button')].find(b=>b.textContent==='다시 시도');
    assert.ok(retryButton);
    f.calls.length = 0;
    retryButton.click(); retryButton.click(); await settle();
    assert.deepEqual(f.calls.map(c=>[c.name,c.args.p_before_id]),[['list_app_notifications',uuid(2)]]);
    assert.equal(doc.querySelector('[data-notification-id="'+uuid(1)+'"]'),firstRow);
    retry.resolve({data:{items:[page(3)],unread_count:3,has_more:false,next_cursor:null}});
    await settle();
    assert.equal(doc.querySelectorAll('[data-notification-id]').length,4);
    assert.equal(doc.querySelector('.nn-pagination button'),null);
  } finally { f.close(); }
});

test('retry on initial load still refreshes both notification sources', async () => {
  const f = fixture();
  try {
    await f.boot();
    f.respond(()=>({error:{message:'temporary'}}));
    f.api.open(); await settle();
    f.calls.length=0;
    f.respond(name=>name==='list_retention_alerts'?{data:[]}:{data:{items:[],unread_count:0,has_more:false}});
    f.w.document.querySelector('.nn-pagination button').click(); await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts']);
    assert.equal(f.w.document.querySelector('.nn-pagination button'),null);
  } finally { f.close(); }
});

test('the embedded Park skips hidden badge reads and still reconciles its open inbox', async () => {
  const f = fixture({refreshClosedBadge:false});
  try {
    await f.boot();
    f.advance(15000); await f.poll();
    f.visibility('hidden'); f.visibility('visible');
    await f.api.refresh();
    f.channels[0].onmessage({data:{type:'read',user:'member-a'}});
    await settle();
    assert.deepEqual(f.calls, [], 'the World header owns the visible badge');

    f.api.open(); await settle();
    assert.deepEqual(f.calls.map(c=>c.name), ['list_app_notifications','list_retention_alerts']);
    f.calls.length=0;
    f.channels[0].onmessage({data:{type:'read',user:'member-a'}});
    await settle();
    assert.deepEqual(f.calls.map(c=>c.name), ['list_app_notifications','list_retention_alerts']);

    f.api.close(); f.calls.length=0;
    await f.user('member-b'); await f.poll();
    assert.deepEqual(f.calls, []);
    f.api.open(); await settle();
    assert.deepEqual(f.calls.map(c=>c.user), ['member-b','member-b']);
  } finally { f.close(); }
});

test('polling and returning to an expanded inbox keep older rows and a pending page retry', async () => {
  const f = fixture();
  try {
    await f.boot();
    let failNext = true;
    const first = {id:uuid(1),kind:'like',created_at:'2026-11-01T10:00:00Z'};
    const older = {...first,id:uuid(2),created_at:'2026-10-31T10:00:00Z'};
    f.respond((name,args) => {
      if (name === 'app_notification_summary') return {data:{notifications:4,retention:0}};
      if (name === 'list_retention_alerts') return {data:[]};
      const more = Boolean(args.p_before_id);
      if (more && failNext) return {error:{message:'temporary'}};
      return {data:{items:[more ? older : first],unread_count:3,as_of:first.created_at,
        has_more:!more,next_cursor:more ? null : first}};
    });
    const doc = f.w.document;
    f.api.open(); await settle();
    doc.querySelector('#note-notifications-more').click(); await settle();
    const retry = doc.querySelector('.nn-pagination button');
    assert.equal(retry.textContent,'다시 시도');
    f.calls.length = 0; f.advance(15001); await f.poll();
    assert.equal(doc.querySelector('.nn-pagination button'),retry,'polling preserves the retry cursor');
    assert.deepEqual(f.calls.map(c=>c.name),['app_notification_summary']);
    assert.equal(f.badge().text,'4');

    failNext = false;
    retry.click(); await settle();
    const oldRow = doc.querySelector('[data-notification-id="'+older.id+'"]');
    assert.ok(oldRow);
    f.calls.length = 0; f.advance(15001);
    f.visibility('hidden'); f.visibility('visible');
    f.w.dispatchEvent(new f.w.Event('focus')); await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['app_notification_summary']);
    assert.equal(doc.querySelector('[data-notification-id="'+older.id+'"]'),oldRow);

    f.calls.length = 0;
    f.channels[0].onmessage({data:{type:'read',user:'member-a'}}); await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts']);
    assert.equal(oldRow.isConnected,false);

    doc.querySelector('#note-notifications-more').click(); await settle();
    f.calls.length = 0;
    [...doc.querySelectorAll('.nn-toolbar button')].find(b=>b.textContent==='새로고침').click();
    await settle();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts']);
    assert.equal(doc.querySelector('[data-notification-id="'+older.id+'"]'),null);

    doc.querySelector('#note-notifications-more').click(); await settle();
    f.api.close(); f.api.open(); await settle();
    f.calls.length = 0; f.advance(15001); await f.poll();
    assert.deepEqual(f.calls.map(c=>c.name),['list_app_notifications','list_retention_alerts']);
  } finally { f.close(); }
});

test('keyboard pagination focuses the new notification or retry, and respects a move to Close', async () => {
  const f = fixture();
  try {
    const doc = f.w.document;
    f.w.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{}]; };
    const item = n => ({ id:uuid(n), kind:'like', created_at:'2026-11-01T00:00:00Z', read_at:'2026-11-02T00:00:00Z' });
    const first = item(3), second = item(2), last = item(1);
    const page = (items, next) => ({ data:{ items, unread_count:0,
      as_of:first.created_at, has_more:Boolean(next), next_cursor:next } });
    const pending = deferred();
    let attempts = 0;
    f.respond((name, args) => {
      if (name === 'list_retention_alerts') return {data:[]};
      if (!args.p_before_id) return page([first], first);
      if (++attempts === 1) return {error:{message:'temporary'}};
      if (attempts === 2) return page([first, second], second);
      return pending.promise;
    });
    const bell = doc.querySelector('#note-notifications');
    bell.focus(); bell.click(); await settle();
    const activateFooter = () => {
      const control = doc.querySelector('.nn-pagination button');
      control.focus(); control.click();
    };
    activateFooter(); await settle();
    assert.equal(doc.activeElement.textContent, '다시 시도');
    activateFooter(); await settle();
    assert.equal(doc.activeElement.dataset.notificationId, second.id);
    activateFooter();
    const close = doc.querySelector('.nn-heading button');
    close.focus();
    pending.resolve(page([last], null)); await settle();
    assert.equal(doc.activeElement, close);
    close.click();
    assert.equal(doc.activeElement, bell);
  } finally { f.close(); }
});

test('a timed-out badge read waits for the next polling interval and keeps the last good count', async () => {
  const f = fixture();
  try {
    await f.boot();
    f.advance(15000);
    f.calls.length = 0;
    f.respond(() => ({error:{code:'57014',message:'statement timeout'}}));
    await f.poll();
    f.w.dispatchEvent(new f.w.Event('focus'));
    f.visibility('visible');
    await settle();
    assert.equal(f.calls.length, 1);
    assert.equal(f.badge().text, '5');
    f.respond(() => ({data:{notifications:1,retention:0}}));
    f.advance(15000);
    await f.poll();
    assert.equal(f.badge().text, '1');
  } finally { f.close(); }
});

test('Park settings keeps its accessible name when notifications change', async () => {
  const f = fixture();
  try {
    const button = f.w.document.querySelector('[data-note-my]');
    button.dataset.settingsLabel = '설정';
    await f.boot();
    assert.equal(button.getAttribute('aria-label'), '설정, 읽지 않은 알림 5개');
    f.respond(() => ({data:{notifications:0,retention:0}}));
    await f.api.refresh();
    assert.equal(button.getAttribute('aria-label'), '설정');
  } finally { f.close(); }
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..');
const id='00000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',entry='20000000-0000-4000-8000-000000000001';
const tick=()=>new Promise(r=>setTimeout(r,10));
function fixture({empty=false,guest=false,publicGroups=true,hash='',deleting=false,invited=false,respond,coldReads=false}={}){
  const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://ojjuda.kr/groups/'+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.IntersectionObserver=class{observe(){}disconnect(){}};w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
  let pendingInvite=invited;
  let list=empty?[]:[{id:room,name:'주말 여행단',description:'우리의 다음 여행',owner_id:id,member_count:2,created_at:'2026-11-01T00:00:00Z',deleting}],saved,requested=false;
  w.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:guest?null:{id}}}),onAuthStateChange:()=>{}},storage:{from:()=>({upload:async()=>({}),remove:async()=>({})})},rpc:async(name,args)=>{
    let {p_action:a,p_payload:p}=args;if(name==='group_home'){a='home';p={query:args.p_query};}
    calls.push([a,p]);const response=respond?.(a,p,name);if(response!==undefined)return response;let data=[];
    if(name==='group_invitation'){
      if(a==='search')data=[{user_id:other,nickname:'수빈',invited:false}];
      if(a==='send')data={sent:true};
      if(a==='link')data={code:entry,group_name:'주말 여행단'};
      if(a==='received')data=pendingInvite?[{id:entry,room_id:room,group_name:'주말 여행단',sender_name:'민준'}]:[];
      if(a==='preview_link')data={room_id:room,group_name:'주말 여행단',sender_name:'민준',member:false};
      if(a==='accept'||a==='accept_link'){pendingInvite=false;list=[{id:room,name:'주말 여행단',owner_id:other,member_count:2}];data={room_id:room};}
      if(a==='decline')pendingInvite=false;
      return {data};
    }
    if(a==='rooms')data=list;
    if(a==='create_room'){if(!list.some(r=>r.id===room))list.unshift({id:room,name:p.name,description:p.description,owner_id:id,member_count:1,created_at:'2026-11-06T10:00:00Z'});data={id:room};}
    if(a==='rename'){list=list.map(r=>r.id===p.room_id?{...r,name:p.name,description:p.description}:r);}
    if(a==='finish_delete')list=list.filter(r=>r.id!==p.room_id);
    if(a==='request')requested=true;
    if(a==='cancel_request')requested=false;
    if(a==='directory')data=[...list.filter(r=>!r.deleting).map(r=>({...r,owner_name:'민준',is_member:true})),...(publicGroups?[{id:other,name:'함께 걷기',description:'<script>test</script>',owner_name:'친구',member_count:3,requested}]:[])].filter(r=>(r.name+' '+r.description).includes(p.query||''));
    if(a==='home')data={rooms:list,directory:[...list.filter(r=>!r.deleting).map(r=>({...r,owner_name:'민준',is_member:true})),...(publicGroups?[{id:other,name:'함께 걷기',description:'<script>test</script>',owner_name:'친구',member_count:3,requested}]:[])].filter(r=>(r.name+' '+r.description).includes(p.query||'')),invitations:pendingInvite?[{id:entry,room_id:room,group_name:'주말 여행단',sender_name:'민준'}]:[]};
    if(a==='save'){saved=p;data={...p,media:p.media};}
    if(a==='feed'&&!empty)data=[{id:entry,room_id:room,room_name:'주말 여행단',author_id:id,author_name:'민준',kind:'trip',title:'부산에서 보내는 주말',body:'<img src=x onerror=alert(1)>',location:'부산역',starts_at:'2026-11-07T09:00:00+09:00',ends_at:'2026-11-09T18:00:00+09:00',created_at:'2026-11-06T08:00:00Z',updated_at:'2026-11-06T08:00:00Z',media:[],comment_count:2}];
    if(a==='calendar')data=Array.from({length:30},(_,i)=>({day:`2026-11-${String(i+1).padStart(2,'0')}`,count:i===7?1:0,events:i===7?1:0}));
    if(a==='members')data=[{user_id:id,nickname:'민준'},{user_id:'b',nickname:'수빈'}];
    if(a==='requests')data=[{user_id:'c',nickname:'지원'}];
    return {data};
  }})};
  if(coldReads){const make=w.supabase.createClient;w.supabase.createClient=()=>{const c=make(),invoke=c.rpc;c.rpc=(name,args)=>({then(resolve,reject){return invoke(name,args).then(resolve,reject);}});return c;};}
  w.eval(fs.readFileSync(path.join(root,'groups/app.js'),'utf8'));return {dom,w,calls,saved:()=>saved};
}
test('creating from the main directory keeps the new group in the list until entered',async()=>{
  const f=fixture({empty:true,publicGroups:false});try{
    await tick();const d=f.w.document;
    assert.match(d.body.textContent,/첫 그룹/);assert.ok(d.querySelector('#directory-query'));assert.equal(d.querySelector('[data-action=compose]'),null);
    // A previous search must not hide the newly created group.
    const search=d.querySelector('#directory-query');search.value='없는 이름';search.dispatchEvent(new f.w.Event('input'));await new Promise(r=>setTimeout(r,280));
    d.querySelector('[data-action=create]').click();const form=d.querySelector('#room-form');form.elements.name.value='우리 모임';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(d.querySelector('h1').textContent,'그룹');assert.equal(f.w.location.hash,'');assert.equal(d.querySelector('#directory-query').value,'');
    assert.equal(d.querySelectorAll('#directory [data-group]').length,1);assert.match(d.querySelector('#directory').textContent,/우리 모임/);
    assert.ok(d.querySelector('[data-action=create]').compareDocumentPosition(d.querySelector('#directory'))&f.w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(f.calls.some(([a])=>a==='feed'),false);assert.equal(d.querySelector('[data-action=compose]'),null);
    d.querySelector(`[data-room="${room}"]`).click();await tick();assert.equal(d.querySelector('h1').textContent,'우리 모임');
    d.querySelector('[data-action=compose]').click();const c=d.querySelector('#composer');c.elements.kind.value='trip';c.elements.kind.dispatchEvent(new f.w.Event('change'));
    assert.equal(d.querySelector('#schedule-fields').hidden,false);c.elements.title.value='제주 여행';c.elements.body.value='첫날 공항에서 만나기';c.elements.all_day.checked=true;c.elements.all_day.dispatchEvent(new f.w.Event('change'));c.elements.starts_at.value='2026-11-08';c.elements.ends_at.value='2026-11-10';c.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(f.saved().starts_at,'2026-11-08T00:00:00+09:00');assert.equal(f.saved().ends_at,'2026-11-10T23:59:59+09:00');assert.equal(f.saved().kind,'trip');assert.equal(f.saved().room_id,room);
    d.querySelector('[data-action=home]').click();await tick();assert.equal(d.querySelectorAll('#directory [data-group]').length,1);assert.equal(d.querySelector('#feed'),null);
  }finally{f.dom.window.close();}
});
test('main shows joined and available groups; calendar and owner controls stay inside the room',async()=>{
  const f=fixture();try{
    await tick();const d=f.w.document;assert.ok(d.querySelector('#directory'));assert.equal(d.querySelector('#feed'),null);assert.equal(f.calls.some(([a])=>a==='feed'),false);
    assert.ok(d.querySelector(`[data-room="${room}"]`));assert.ok(d.querySelector(`[data-request="${other}"]`));
    d.querySelector(`[data-room="${room}"]`).click();await tick();assert.equal(d.querySelector('.body img'),null,'post content stays text');assert.match(d.querySelector('.body').textContent,/<img/);
    d.querySelector('[data-view=calendar]').click();await tick();assert.equal(d.querySelectorAll('[data-date]').length,30);d.querySelector('[data-date="2026-11-08"]').click();await tick();assert.equal(f.calls.filter(([a])=>a==='feed').at(-1)[1].date,'2026-11-08');
    d.querySelector('[data-action=manage]').click();await tick();for(const selector of ['#rename-form','[data-approve]','[data-reject]','[data-invite]','[data-kick]','[data-transfer]','[data-delete-room]'])assert.ok(d.querySelector(selector),selector);
    d.querySelector('[data-approve]').click();await tick();assert.equal(f.calls.find(([a])=>a==='approve')[1].user_id,'c');
  }finally{f.dom.window.close();}
});
test('main requests and cancels admission without reading private content; guest sees sign-in',async()=>{
  const f=fixture({empty:true});try{
    await tick();const d=f.w.document;assert.equal(d.querySelector('#directory script'),null);
    d.querySelector('[data-request]').click();await tick();assert.equal(f.calls.find(([a])=>a==='request')[1].room_id,other);assert.match(d.querySelector('#directory').textContent,/가입 승인 대기/);
    d.querySelector('[data-cancel-request]').click();await tick();assert.ok(d.querySelector('[data-request]'));assert.equal(f.calls.some(([a])=>a==='feed'),false);
  }finally{f.dom.window.close();}
  const g=fixture({guest:true});try{await tick();assert.match(g.w.document.body.textContent,/로그인/);assert.equal(g.calls.length,0);}finally{g.dom.window.close();}
});
test('search survives room return and refresh; browser back restores directory',async()=>{
  const f=fixture();try{
    await tick();const d=f.w.document,search=d.querySelector('#directory-query');search.value='주말';search.dispatchEvent(new f.w.Event('input'));await new Promise(r=>setTimeout(r,280));
    assert.equal(d.querySelectorAll('[data-group]').length,1);d.querySelector(`[data-room="${room}"]`).click();await tick();
    f.w.history.back();await tick();await tick();assert.equal(d.querySelector('#directory-query').value,'주말');assert.equal(d.querySelector('#feed'),null);
    d.dispatchEvent(new f.w.Event('visibilitychange'));await tick();assert.equal(d.querySelector('#directory-query').value,'주말');assert.equal(d.querySelectorAll('[data-group]').length,1);
  }finally{f.dom.window.close();}
});
test('direct room links and interrupted deletion remain accessible',async()=>{
  const f=fixture({hash:'#room='+room});try{await tick();assert.equal(f.w.document.querySelector('h1').textContent,'주말 여행단');assert.ok(f.w.document.querySelector('#feed'));}finally{f.dom.window.close();}
  const g=fixture({deleting:true});try{await tick();const d=g.w.document;assert.match(d.querySelector(`[data-group="${room}"]`).textContent,/삭제 중/);d.querySelector(`[data-room="${room}"]`).click();await tick();assert.ok(d.querySelector('[data-action=resume-delete]'));}finally{g.dom.window.close();}
});

test('owner sends a member notification and shares an invitation through the native share sheet',async()=>{
  const f=fixture({hash:'#room='+room});try{
    await tick();const d=f.w.document,shared=[],copied=[];
    f.w.navigator.share=async data=>shared.push(data);f.w.navigator.clipboard={writeText:async value=>copied.push(value)};
    d.querySelector('[data-action=manage]').click();await tick();d.querySelector('[data-invite]').click();await tick();
    const form=d.querySelector('#invite-search');form.elements.query.value='수빈';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    d.querySelector('[data-send-invite]').click();await tick();assert.equal(f.calls.find(([a])=>a==='send')[1].user_id,other);assert.equal(d.querySelector('[data-send-invite]').disabled,true);
    d.querySelector('dialog[aria-label="회원 초대"] [data-close]').click();d.querySelector('[data-share]').click();await tick();
    d.querySelector('[data-share-link]').click();await tick();assert.equal(shared[0].url,'https://ojjuda.kr/groups/#invite='+entry);
    f.w.navigator.share=undefined;d.querySelector('[data-share-link]').click();await tick();assert.equal(copied[0],shared[0].url,'clipboard fallback keeps a usable invitation');
  }finally{f.dom.window.close();}
});
test('received and shared invitations require an explicit acceptance',async()=>{
  for(const shared of [false,true]){
    const f=fixture({empty:true,invited:!shared,hash:shared?'#invite='+entry:''});try{
      await tick();const d=f.w.document;assert.equal(f.calls.some(([a])=>a==='accept'||a==='accept_link'),false);assert.equal(d.querySelector('#feed'),null);
      d.querySelector(shared?'[data-accept-link]':'[data-accept-invite]').click();await tick();assert.equal(f.calls.find(([a])=>a===(shared?'accept_link':'accept'))[1][shared?'code':'id'],entry);
      assert.equal(f.w.location.hash,'#room='+room);assert.ok(d.querySelector('#feed'));
    }finally{f.dom.window.close();}
  }
  const guest=fixture({guest:true,hash:'#invite='+entry});try{await tick();const href=guest.w.document.querySelector('a').href;assert.equal(href,'https://ojjuda.kr/?auth=login&next=groups&invite='+entry);assert.equal(guest.calls.length,0);}finally{guest.dom.window.close();}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('home uses one request and simultaneous refreshes share their work',async()=>{
  const pending=deferred();let homeCalls=0;
  const f=fixture({respond:a=>{if(a==='home'&&++homeCalls>1)return pending.promise;}});try{
    await tick();assert.deepEqual(f.calls.map(([a])=>a),['home']);
    f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await tick();
    assert.equal(homeCalls,2,'overlapping background refreshes make one request');
    pending.resolve({data:{rooms:[],directory:[],invitations:[]}});await tick();
  }finally{f.dom.window.close();}
});
test('unchanged background refresh preserves post and loaded media elements',async()=>{
  const f=fixture({hash:'#room='+room});try{
    await tick();const d=f.w.document,post=d.querySelector('[data-post]');const media=d.createElement('img');media.src='blob:fixture';post.append(media);
    d.dispatchEvent(new f.w.Event('visibilitychange'));await tick();
    assert.equal(d.querySelector('[data-post]'),post);assert.equal(media.isConnected,true,'unchanged posts do not redownload media or restart video');
  }finally{f.dom.window.close();}
});
test('typing invalidates an earlier search before the debounce finishes',async()=>{
  const pending=deferred();const f=fixture({respond:(a,p)=>a==='directory'&&p.query==='먼저'?pending.promise:undefined});try{
    await tick();const d=f.w.document,input=d.querySelector('#directory-query');input.value='먼저';input.dispatchEvent(new f.w.Event('input'));await new Promise(r=>setTimeout(r,280));
    input.value='나중';input.dispatchEvent(new f.w.Event('input'));pending.resolve({data:[{id:other,name:'이전 검색 응답',member_count:1}]});await tick();
    assert.doesNotMatch(d.querySelector('#directory').textContent,/이전 검색 응답/);await new Promise(r=>setTimeout(r,280));
  }finally{f.dom.window.close();}
});
test('lost refresh after creation retries with the same request ID',async()=>{
  let fail=true;const f=fixture({empty:true,respond:a=>{if(a==='rooms'&&fail){fail=false;return {error:{message:'연결 실패'}};}}});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=create]').click();const form=d.querySelector('#room-form');form.elements.name.value='한 번만 만들기';
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(form.querySelector('.error').textContent,/연결 실패/);
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();const sends=f.calls.filter(([a])=>a==='create_room');assert.equal(sends.length,2);assert.equal(sends[0][1].id,sends[1][1].id);
    assert.equal(d.querySelectorAll(`[data-group="${room}"]`).length,1);
  }finally{f.dom.window.close();}
});
test('invitation decisions and delayed group management cannot conflict',async()=>{
  const pending=deferred();const f=fixture({empty:true,invited:true,respond:a=>a==='accept'?pending.promise:undefined});try{
    await tick();const d=f.w.document;d.querySelector('[data-accept-invite]').click();assert.equal(d.querySelector('[data-decline-invite]').disabled,true);d.querySelector('[data-decline-invite]').click();
    assert.equal(f.calls.some(([a])=>a==='decline'),false);pending.resolve({error:{message:'연결 실패'}});await tick();assert.equal(d.querySelector('[data-decline-invite]').disabled,false);
  }finally{f.dom.window.close();}
  const wait=deferred(),g=fixture({hash:'#room='+room,respond:a=>a==='members'?wait.promise:undefined});try{
    await tick();const d=g.w.document;d.querySelector('[data-action=manage]').click();d.querySelector('[data-action=home]').click();wait.resolve({data:[]});await tick();assert.equal(d.querySelector('dialog'),null);
  }finally{g.dom.window.close();}
});

test('an older comments response cannot replace a newly posted comment',async()=>{
  const pending=deferred();let count=0;const f=fixture({hash:'#room='+room,respond:a=>{
    if(a==='comments'){count++;return count===1?pending.promise:{data:[{id:other,author_id:id,author_name:'민준',body:'새 댓글',created_at:'2026-11-06T10:00:00Z'}]};}
  }});try{
    await tick();const d=f.w.document;d.querySelector('[data-comments]').click();await tick();const form=d.querySelector('dialog form');form.elements.body.value='새 댓글';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.match(d.querySelector('#comment-list').textContent,/새 댓글/);pending.resolve({data:[]});await tick();assert.match(d.querySelector('#comment-list').textContent,/새 댓글/);
  }finally{f.dom.window.close();}
});
test('repeated pagination clicks issue one request and never duplicate posts',async()=>{
  const pending=deferred();const row=n=>({id:'30000000-0000-4000-8000-'+String(n).padStart(12,'0'),room_id:room,room_name:'주말 여행단',author_id:id,author_name:'민준',kind:'post',body:'글 '+n,created_at:'2026-11-06T00:00:00Z',updated_at:'2026-11-06T00:00:00Z',media:[],comment_count:0});
  const f=fixture({hash:'#room='+room,respond:(a,p)=>a==='feed'?(p.before?pending.promise:{data:Array.from({length:41},(_,n)=>row(n))}):undefined});try{
    await tick();const d=f.w.document,more=d.querySelector('#load-more');more.click();more.click();await tick();assert.equal(f.calls.filter(([a])=>a==='feed').length,2);
    pending.resolve({data:[row(39),row(40)]});await tick();assert.equal(d.querySelectorAll('[data-post]').length,41);assert.equal(new Set([...d.querySelectorAll('[data-post]')].map(p=>p.dataset.post)).size,41);
  }finally{f.dom.window.close();}
});

test('identical reads coalesce even when the client returns a cold thenable',async()=>{
  const pending=deferred(),f=fixture({hash:'#room='+room,coldReads:true,respond:(a,p)=>a==='feed'&&p.date?pending.promise:undefined});try{
    await tick();const d=f.w.document;d.querySelector('[data-view=calendar]').click();await tick();const day=d.querySelector('[data-date="2026-11-08"]');day.click();day.click();await tick();
    assert.equal(f.calls.filter(([a,p])=>a==='feed'&&p.date==='2026-11-08').length,1,'the same thenable must not execute twice');pending.resolve({data:[]});await tick();
  }finally{f.dom.window.close();}
});


test('deleting the active group restores the main directory',async()=>{
  const f=fixture({hash:'#room='+room});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=manage]').click();await tick();d.querySelector('[data-delete-room]').click();d.querySelector('[data-yes]').click();await tick();await tick();
    assert.equal(d.querySelector('h1').textContent,'그룹');assert.ok(d.querySelector('#directory'));assert.equal(d.querySelector('#feed'),null);assert.equal(d.querySelector(`[data-group="${room}"]`),null);assert.equal(f.w.location.hash,'');
  }finally{f.dom.window.close();}
});
test('a save refresh does not reuse a request started before the mutation',async()=>{
  const pending=deferred();let count=0;
  const f=fixture({hash:'#room='+room,respond:a=>a==='rooms'&&++count===2?pending.promise:undefined});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=refresh]').click();await tick();d.querySelector('[data-action=manage]').click();await tick();
    const form=d.querySelector('#rename-form');form.elements.name.value='바뀐 그룹 이름';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(d.querySelector('h1').textContent,'바뀐 그룹 이름','save must refresh without waiting on an older request');pending.resolve({data:[]});await tick();assert.equal(d.querySelector('h1').textContent,'바뀐 그룹 이름');
  }finally{f.dom.window.close();}
});
test('approval and rejection cannot run together for the same applicant',async()=>{
  const pending=deferred(),f=fixture({hash:'#room='+room,respond:a=>a==='approve'?pending.promise:undefined});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=manage]').click();await tick();d.querySelector('[data-approve]').click();assert.equal(d.querySelector('[data-reject]').disabled,true);d.querySelector('[data-reject]').click();await tick();assert.equal(f.calls.some(([a])=>a==='reject'),false);
    pending.resolve({error:{message:'연결 실패'}});await tick();assert.equal(d.querySelector('[data-reject]').disabled,false);
  }finally{f.dom.window.close();}
});


test('invitation dialog immediately lists recent members and pages without duplicates',async()=>{
 const row=n=>({user_id:'50000000-0000-4000-8000-'+String(n).padStart(12,'0'),nickname:'새 회원 '+n,created_at:'2026-11-06T00:00:00Z',invited:false});
 const f=fixture({hash:'#room='+room,respond:(a,p)=>a==='search'?{data:p.query?[row(99)]:p.before?[row(29),row(30)]:Array.from({length:31},(_,n)=>row(n))}:undefined});try{
  await tick();const d=f.w.document;d.querySelector('[data-action=manage]').click();await tick();d.querySelector('[data-invite]').click();await tick();
  assert.equal(f.calls.find(([a])=>a==='search')[1].query,'');assert.equal(d.querySelectorAll('#invite-results .member').length,30);assert.match(d.querySelector('#invite-results').textContent,/새 회원 0/);
  const more=d.querySelector('#invite-more');more.click();more.click();await tick();assert.equal(d.querySelectorAll('#invite-results .member').length,31);assert.equal(f.calls.filter(([a])=>a==='search').length,2);
  const form=d.querySelector('#invite-search');form.elements.query.value='찾기';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(d.querySelectorAll('#invite-results .member').length,1);assert.match(d.querySelector('#invite-results').textContent,/새 회원 99/);
 }finally{f.dom.window.close();}
});


test('failed invitation search hides the old cursor and retries from the first page',async()=>{
 const row=n=>({user_id:'50000000-0000-4000-8000-'+String(n).padStart(12,'0'),nickname:'회원 '+n,created_at:'2026-11-06T00:00:00Z'});let failed=false;
 const f=fixture({hash:'#room='+room,respond:(a,p)=>a!=='search'?undefined:p.query&&!failed?(failed=true,{error:{message:'일시적인 연결 오류'}}):{data:p.query?[row(99)]:Array.from({length:31},(_,n)=>row(n))}});try{
  await tick();const d=f.w.document;d.querySelector('[data-action=manage]').click();await tick();d.querySelector('[data-invite]').click();await tick();
  const more=d.querySelector('#invite-more'),form=d.querySelector('#invite-search');assert.equal(more.hidden,false);
  form.elements.query.value='다른 회원';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(more.hidden,true);assert.equal(d.querySelectorAll('#invite-results .member').length,0);
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(f.calls.filter(([a])=>a==='search').at(-1)[1].before,undefined);assert.match(d.querySelector('#invite-results').textContent,/회원 99/);
 }finally{f.dom.window.close();}
});

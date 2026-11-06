const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..');
const id='00000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',entry='20000000-0000-4000-8000-000000000001';
const tick=()=>new Promise(r=>setTimeout(r,10));
function fixture({empty=false,guest=false,publicGroups=true,hash='',deleting=false}={}){
  const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://ojjuda.kr/groups/'+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.IntersectionObserver=class{observe(){}disconnect(){}};w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
  let list=empty?[]:[{id:room,name:'주말 여행단',description:'우리의 다음 여행',owner_id:id,member_count:2,created_at:'2026-11-01T00:00:00Z',deleting}],saved,requested=false;
  w.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:guest?null:{id}}}),onAuthStateChange:()=>{}},storage:{from:()=>({upload:async()=>({}),remove:async()=>({})})},rpc:async(name,{p_action:a,p_payload:p})=>{
    calls.push([a,p]);let data=[];
    if(a==='rooms')data=list;
    if(a==='create_room'){list.unshift({id:room,name:p.name,description:p.description,owner_id:id,member_count:1,created_at:'2026-11-06T10:00:00Z'});data={id:room};}
    if(a==='request')requested=true;
    if(a==='cancel_request')requested=false;
    if(a==='directory')data=[...list.filter(r=>!r.deleting).map(r=>({...r,owner_name:'민준',is_member:true})),...(publicGroups?[{id:other,name:'함께 걷기',description:'<script>test</script>',owner_name:'친구',member_count:3,requested}]:[])].filter(r=>(r.name+' '+r.description).includes(p.query||''));
    if(a==='save'){saved=p;data={...p,media:p.media};}
    if(a==='feed'&&!empty)data=[{id:entry,room_id:room,room_name:'주말 여행단',author_id:id,author_name:'민준',kind:'trip',title:'부산에서 보내는 주말',body:'<img src=x onerror=alert(1)>',location:'부산역',starts_at:'2026-11-07T09:00:00+09:00',ends_at:'2026-11-09T18:00:00+09:00',created_at:'2026-11-06T08:00:00Z',updated_at:'2026-11-06T08:00:00Z',media:[],comment_count:2}];
    if(a==='calendar')data=Array.from({length:30},(_,i)=>({day:`2026-11-${String(i+1).padStart(2,'0')}`,count:i===7?1:0,events:i===7?1:0}));
    if(a==='members')data=[{user_id:id,nickname:'민준'},{user_id:'b',nickname:'수빈'}];
    if(a==='requests')data=[{user_id:'c',nickname:'지원'}];
    return {data};
  }})};
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

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..');
const id='00000000-0000-4000-8000-000000000001',room='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',entry='20000000-0000-4000-8000-000000000001';
const tick=()=>new Promise(r=>setTimeout(r,10));
function fixture({empty=false,guest=false,member=false,publicGroups=true,hash='',deleting=false,invited=false,respond,coldReads=false}={}){
  const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://ojjuda.kr/groups/'+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.IntersectionObserver=class{observe(){}disconnect(){}};w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
  let pendingInvite=invited;
  let list=empty?[]:[{id:room,name:'주말 여행단',description:'우리의 다음 여행',owner_id:member?other:id,member_count:2,created_at:'2026-11-01T00:00:00Z',deleting}],saved,requested=false;
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
  w.eval(fs.readFileSync(path.join(root,'shared/art/cozy-scenes.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'groups/activities.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'groups/composer.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'groups/app.js'),'utf8'));return {dom,w,calls,saved:()=>saved};
}
test('writing tools preserve the same body, selection and draft while options open and close',async()=>{
  const f=fixture({hash:'#room='+room});try{
    await tick();const d=f.w.document,opener=d.querySelector('[data-action=compose]');opener.focus();opener.click();
    const form=d.querySelector('#composer'),dialog=form.closest('dialog'),body=form.elements.body;
    assert.ok(dialog.classList.contains('group-writing-dialog'));
    assert.ok(form.querySelector('.group-compose-head [type=submit]'));
    assert.equal(form.querySelector('.group-compose-toolbar').getAttribute('role'),'toolbar');
    assert.equal(form.querySelector('.group-compose-toolbar').getAttribute('aria-label'),'글쓰기 옵션');
    assert.deepEqual([...form.querySelectorAll('.group-compose-toolbar [data-group-tool]')].map(button=>button.dataset.groupTool),
      ['post','photo','plan','poll','bet'],'the five writing categories stay in the requested order');
    assert.ok([...form.querySelectorAll('.group-compose-toolbar [data-group-tool]')].every(button=>button.querySelector('svg')),
      'each category has a picture icon');
    assert.equal(d.activeElement,form.elements.title,'the initiating click synchronously focuses the title for writing');
    assert.deepEqual([form.elements.title.selectionStart,form.elements.title.selectionEnd],[0,0]);
    assert.equal(form.querySelector('[data-group-tool=room]').disabled,true,'one available group needs no picker');
    assert.equal(form.querySelector('[data-group-tool=room]').closest('.group-compose-toolbar'),null,'group context stays outside the five categories');
    assert.equal(form.querySelector('[data-group-tool=plan]').hidden,false,'plans remain directly available for an ordinary post');
    assert.ok([...form.querySelectorAll('[data-group-panel]')].every(panel=>panel.hidden));
    body.value='한글 조합과 선택한 내용을 그대로 남겨요.';body.focus();body.setSelectionRange(3,9,'backward');
    const selected=()=>[body.value,body.selectionStart,body.selectionEnd,body.selectionDirection];
    const before=selected();
    function tap(tool){
      const button=form.querySelector('[data-group-tool='+tool+']');
      const down=new f.w.Event('pointerdown',{bubbles:true,cancelable:true});
      Object.defineProperties(down,{button:{value:0},isPrimary:{value:true}});button.dispatchEvent(down);
      assert.equal(down.defaultPrevented,true,'pointer tap retains the writing focus');
      button.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
    }
    for(const tool of ['photo','bet']){
      tap(tool);
      assert.equal(form.querySelector('[data-group-panel='+tool+']').hidden,false);
      assert.equal([...form.querySelectorAll('[data-group-panel]')].filter(panel=>!panel.hidden).length,1);
      assert.equal(form.elements.body,body);assert.equal(d.activeElement,body);assert.deepEqual(selected(),before);
      assert.equal(form.elements.kind.value,'post','opening choices alone does not change the post kind');
    }
    tap('plan');
    assert.equal(form.elements.kind.value,'event','the plan icon starts a schedule directly');
    assert.equal(form.querySelector('[data-group-panel=plan]').hidden,false);
    assert.equal(form.querySelector('#schedule-fields').hidden,false);
    assert.equal(form.querySelector('[data-group-panel=plan]').querySelectorAll('[data-kind-choice]').length,0,
      'plans open without a second kind-selection row');
    assert.equal(form.elements.starts_at.required,true);assert.equal(form.elements.ends_at.required,true);
    assert.equal(form.elements.body,body);assert.equal(d.activeElement,body);assert.deepEqual(selected(),before);
    tap('plan');
    assert.ok([...form.querySelectorAll('[data-group-panel]')].every(panel=>panel.hidden),'tapping the same plan icon collapses its settings');
    assert.equal(form.elements.kind.value,'event');assert.deepEqual(selected(),before);
    tap('plan');
    const escape=new f.w.Event('cancel',{cancelable:true});dialog.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented,true);assert.equal(d.querySelectorAll('dialog').length,1);
    assert.ok([...form.querySelectorAll('[data-group-panel]')].every(panel=>panel.hidden));
    assert.deepEqual(selected(),before,'closing an option does not discard or replace writing');
    dialog.querySelector('[data-close]').click();assert.ok(d.querySelector('[data-no]'));d.querySelector('[data-no]').click();
    assert.equal(form.elements.body,body);assert.deepEqual(selected(),before);
    dialog.querySelector('[data-close]').click();d.querySelector('[data-yes]').click();
    assert.equal(d.querySelector('#composer'),null);
    assert.equal(d.activeElement,opener,'closing the writing screen restores its original opener');
  }finally{f.dom.window.close();}
});
test('plans open directly and save complete new schedules while existing trips retain their dates and kind',async()=>{
  const f=fixture({hash:'#room='+room});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=compose]').click();
    const form=d.querySelector('#composer'),body='한글로 적은 긴 기록\n'.repeat(1000).slice(0,10000);
    form.elements.body.value=body;form.elements.title.value='여행 일정';
    const startInput=form.elements.starts_at;
    form.querySelector('[data-group-tool=plan]').click();
    assert.equal(form.elements.kind.value,'event');
    assert.equal(form.querySelector('[data-group-tool=plan]').dataset.selected,'true');
    assert.equal(form.querySelector('[data-group-panel=plan]').hidden,false);
    assert.equal(d.querySelector('#schedule-fields').hidden,false);
    assert.equal(form.elements.starts_at,startInput,'opening plans retains the original date input');
    assert.equal(form.elements.starts_at.required,true);assert.equal(form.elements.ends_at.required,true);
    assert.equal(form.elements.body.value,body,'opening plans preserves the complete writing');
    assert.match(form.querySelector('.group-compose-context').textContent,/계획$/);
    form.elements.all_day.checked=true;form.elements.all_day.dispatchEvent(new f.w.Event('change'));
    form.elements.starts_at.value='2026-11-20';form.elements.ends_at.value='2026-11-21';form.elements.location.value='서울역';
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
    assert.equal(f.saved().body,body);assert.equal(f.saved().body.length,10000);
    assert.equal(f.saved().kind,'event');assert.equal(f.saved().room_id,room);assert.equal(f.saved().location,'서울역');
    assert.equal(f.saved().starts_at,'2026-11-20T00:00:00+09:00');assert.equal(f.saved().ends_at,'2026-11-21T23:59:59+09:00');
    assert.deepEqual(Array.from(f.saved().media),[]);
    d.querySelector('[data-action=compose]').click();const fresh=d.querySelector('#composer');
    assert.equal(fresh.elements.body.value,'');assert.equal(fresh.elements.kind.value,'post');
    assert.ok([...fresh.querySelectorAll('[data-group-panel]')].every(panel=>panel.hidden));
    assert.equal(fresh.querySelector('[data-group-tool=plan]').hidden,false);
    assert.equal(fresh.querySelector('#schedule-fields').hidden,true);
    fresh.closest('dialog').querySelector('[data-close]').click();
    d.querySelector('[data-edit]').click();const edit=d.querySelector('#composer');
    assert.equal(d.activeElement,edit.elements.title,'editing synchronously focuses the existing title');
    assert.deepEqual([edit.elements.title.selectionStart,edit.elements.title.selectionEnd],
      [edit.elements.title.value.length,edit.elements.title.value.length],'editing starts at the end of the existing title');
    assert.equal(edit.elements.room_id.disabled,true);assert.equal(edit.querySelector('[data-group-tool=room]').disabled,true);
    assert.equal(edit.querySelector('[data-group-tool=plan]').dataset.selected,'true');
    assert.equal(edit.elements.kind.value,'trip');assert.equal(edit.elements.title.value,'부산에서 보내는 주말');
    assert.match(edit.querySelector('.group-compose-context').textContent,/계획$/,'existing trips use the same plan label');
    const existing={body:edit.elements.body.value,start:edit.elements.starts_at.value,end:edit.elements.ends_at.value,location:edit.elements.location.value};
    edit.querySelector('[data-group-tool=plan]').click();
    assert.equal(edit.elements.kind.value,'trip','opening a saved trip never converts its stored kind');
    assert.equal(edit.querySelector('[data-group-panel=plan]').hidden,false);
    assert.equal(edit.querySelector('[data-group-panel=plan]').querySelectorAll('[data-kind-choice]').length,0);
    edit.querySelector('[data-group-tool=plan]').click();
    assert.equal(edit.querySelector('[data-group-panel=plan]').hidden,true);
    edit.querySelector('[data-group-tool=post]').click();
    assert.equal(edit.elements.kind.value,'post');
    edit.querySelector('[data-group-tool=plan]').click();
    assert.equal(edit.elements.kind.value,'trip','returning to a saved trip restores its original scheduled kind');
    assert.deepEqual({body:edit.elements.body.value,start:edit.elements.starts_at.value,end:edit.elements.ends_at.value,location:edit.elements.location.value},existing);
    edit.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
    assert.equal(f.saved().kind,'trip');assert.equal(f.saved().body,existing.body);assert.equal(f.saved().location,'부산역');
    assert.equal(f.saved().starts_at,'2026-11-07T09:00:00+09:00');assert.equal(f.saved().ends_at,'2026-11-09T18:00:00+09:00');
  }finally{f.dom.window.close();}
});
test('the group picker stays available for multiple memberships without losing the writing',async()=>{
  const rooms=[{id:room,name:'주말 여행단',owner_id:id,member_count:2},{id:other,name:'함께 걷기',owner_id:id,member_count:3}];
  const f=fixture({hash:'#room='+room,respond:action=>action==='rooms'?{data:rooms}:undefined});try{
    await tick();const d=f.w.document;d.querySelector('[data-action=compose]').click();const form=d.querySelector('#composer');
    form.elements.body.value='어느 모임에 올릴지 고르는 중이에요.';
    const button=form.querySelector('[data-group-tool=room]');assert.equal(button.disabled,false);button.click();
    assert.equal(form.querySelector('[data-group-panel=room]').hidden,false);
    form.elements.room_id.value=other;form.elements.room_id.dispatchEvent(new f.w.Event('change',{bubbles:true}));
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(f.saved().room_id,other);assert.equal(f.saved().body,'어느 모임에 올릴지 고르는 중이에요.');
  }finally{f.dom.window.close();}
});
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
    d.querySelector('[data-action=compose]').click();const c=d.querySelector('#composer');c.querySelector('[data-group-tool=plan]').click();
    assert.equal(d.querySelector('#schedule-fields').hidden,false);c.elements.title.value='제주 여행';c.elements.body.value='첫날 공항에서 만나기';c.elements.all_day.checked=true;c.elements.all_day.dispatchEvent(new f.w.Event('change'));c.elements.starts_at.value='2026-11-08';c.elements.ends_at.value='2026-11-10';c.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(f.saved().starts_at,'2026-11-08T00:00:00+09:00');assert.equal(f.saved().ends_at,'2026-11-10T23:59:59+09:00');assert.equal(f.saved().kind,'event');assert.equal(f.saved().room_id,room);
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
test('Back, close and Escape preserve a group draft until discard is confirmed',async()=>{
  const f=fixture();try{
    await tick();const d=f.w.document;
    d.querySelector(`[data-room="${room}"]`).click();await tick();
    d.querySelector('[data-action=compose]').click();const form=d.querySelector('#composer'),editor=form.closest('dialog');
    form.elements.title.value='입력 보존 점검';form.elements.body.value='뒤로 가도 사라지면 안 되는 내용';
    f.w.history.back();await tick();await tick();
    assert.equal(f.w.location.hash,'#room='+room);assert.equal(d.querySelector('#composer'),form);
    assert.match(d.querySelector('dialog:last-of-type').textContent,/작성 중인 내용을 지울까요/);
    d.querySelector('[data-no]').click();assert.equal(form.elements.body.value,'뒤로 가도 사라지면 안 되는 내용');
    editor.querySelector('[data-close]').click();d.querySelector('[data-no]').click();
    const escape=new f.w.Event('cancel',{cancelable:true});editor.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);d.querySelector('[data-no]').click();
    const unload=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
    editor.querySelector('[data-close]').click();d.querySelector('[data-yes]').click();await tick();
    assert.equal(d.querySelector('dialog'),null);assert.equal(f.calls.some(([a])=>a==='save'),false);
    const cleanUnload=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(cleanUnload);assert.equal(cleanUnload.defaultPrevented,false);
    f.w.history.back();await tick();await tick();assert.ok(d.querySelector('#directory'));
  }finally{f.dom.window.close();}
});
test('Back cannot dismiss a saving group post; success releases the unload guard',async()=>{
  let finish;
  const f=fixture({respond:(action,p)=>action==='save'?new Promise(resolve=>{finish=()=>resolve({data:{...p,media:p.media}});}):undefined});try{
    await tick();const d=f.w.document;d.querySelector(`[data-room="${room}"]`).click();await tick();
    d.querySelector('[data-action=compose]').click();const form=d.querySelector('#composer');form.elements.body.value='저장 중인 글';
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    f.w.history.back();await tick();await tick();assert.equal(d.querySelector('#composer'),form);assert.equal(f.w.location.hash,'#room='+room);
    form.closest('dialog').querySelector('[data-close]').click();assert.equal(d.querySelectorAll('dialog').length,1);
    const unload=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
    finish();await tick();await tick();assert.equal(d.querySelector('#composer'),null);
    const done=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(done);assert.equal(done.defaultPrevented,false);
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
test('failed invitation declines preserve age restrictions and can be retried',async()=>{
  for(const eligible of [false,true]){
    let pending=deferred();
    const f=fixture({empty:true,respond:a=>{
      if(a==='home')return {data:{rooms:[],directory:[],invitations:[{id:entry,room_id:room,group_name:'성인 모임',sender_name:'친구',age_policy:'adults',age_eligible:eligible}]}};
      if(a==='decline')return pending.promise;
      if(a==='received')return {data:[]};
    }});try{
      await tick();const d=f.w.document,accept=d.querySelector('[data-accept-invite]'),decline=d.querySelector('[data-decline-invite]');
      assert.equal(accept.disabled,!eligible);decline.click();await tick();
      assert.equal(accept.disabled,true);assert.equal(decline.disabled,true);
      pending.resolve({error:{message:'연결 실패'}});await tick();
      assert.equal(accept.disabled,!eligible,'a failed decline must preserve the age gate');
      assert.equal(decline.disabled,false);assert.match(d.querySelector('#toast').textContent,/연결 실패/);
      if(!eligible){accept.click();await tick();assert.equal(f.calls.some(([a])=>a==='accept'),false);}
      pending=deferred();decline.click();await tick();assert.equal(f.calls.filter(([a])=>a==='decline').length,2);
      pending.resolve({data:{ok:true}});await tick();assert.equal(d.querySelector('[data-decline-invite]'),null);
    }finally{f.dom.window.close();}
  }
});
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


test('every group member can share from the room while only the owner can rotate links',async()=>{
 for(const member of [false,true]){
  const f=fixture({member,hash:'#room='+room});try{
   await tick();const d=f.w.document,shared=[],copied=[];
   f.w.navigator.share=async data=>shared.push(data);f.w.navigator.clipboard={writeText:async text=>copied.push(text)};
   d.querySelector('[data-action=share]').click();await tick();
   assert.equal(f.calls.filter(([a])=>a==='link').length,1);assert.equal(f.calls.some(([a])=>a==='members'||a==='requests'),false,'sharing does not load management data');
   assert.equal(!!d.querySelector('[data-renew-link]'),!member);
   d.querySelector('[data-share-link]').click();await tick();assert.equal(shared[0].url,'https://ojjuda.kr/groups/#invite='+entry);
   d.querySelector('[data-copy-link]').click();await tick();assert.equal(copied[0],shared[0].url);
   assert.equal(f.calls.some(([a])=>a==='send'),false);
  }finally{f.dom.window.close();}
 }
 for(const options of [{},{guest:true,hash:'#room='+room},{deleting:true,hash:'#room='+room}]){
  const f=fixture(options);try{await tick();assert.equal(f.w.document.querySelector('[data-action=share]'),null);}finally{f.dom.window.close();}
 }
});

test('age settings support four modes, presets, invalid ranges and creation payloads',async()=>{
 const f=fixture({empty:true,publicGroups:false});try{
  await tick();const d=f.w.document;d.querySelector('[data-action=create]').click();const form=d.querySelector('#room-form'),mode=form.elements.age_policy,lo=form.elements.min_age,hi=form.elements.max_age;
  assert.equal(mode.options.length,4);assert.equal(mode.value,'all');assert.equal(lo.disabled,true);assert.match(form.textContent,/본인인증된 정보는 아니에요/);
  mode.value='adults';mode.dispatchEvent(new f.w.Event('change'));assert.equal(hi.disabled,true);
  mode.value='minors';mode.dispatchEvent(new f.w.Event('change'));assert.equal(lo.disabled,true);
  mode.value='range';mode.dispatchEvent(new f.w.Event('change'));assert.equal(lo.disabled,false);assert.equal(lo.required,true);
  const preset=form.querySelector('[data-age-preset]');preset.value='30-39';preset.dispatchEvent(new f.w.Event('change'));assert.equal(lo.value,'30');assert.equal(hi.value,'39');
  form.elements.name.value='나이별 그룹';lo.value='40';lo.dispatchEvent(new f.w.Event('input'));assert.equal(hi.validity.customError,true);
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(f.calls.filter(([a])=>a==='create_room').length,0);
  lo.value='25';hi.value='35';hi.dispatchEvent(new f.w.Event('input'));assert.equal(hi.validity.customError,false);
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const payload=f.calls.find(([a])=>a==='create_room')[1];assert.equal(payload.age_policy,'range');assert.equal(payload.min_age,'25');assert.equal(payload.max_age,'35');
 }finally{f.dom.window.close();}
});
test('age-restricted directory and invitation preview explain why joining is disabled',async()=>{
 const f=fixture({empty:true,hash:'#invite='+entry,respond:(a)=>{
  if(a==='home')return {data:{rooms:[],directory:[{id:other,name:'성인 모임',member_count:3,age_policy:'adults',age_eligible:false,age_note:'연령 조건이 맞지 않아요.'}],invitations:[]}};
  if(a==='preview_link')return {data:{room_id:other,group_name:'성인 모임',member:false,age_policy:'adults',age_eligible:false,age_note:'연령 조건이 맞지 않아요.'}};
 }});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('[data-request]').disabled,true);assert.equal(d.querySelector('#directory .age-tag').textContent,'만 19세 이상');
  assert.equal(d.querySelector('[data-accept-link]').disabled,true);d.querySelector('[data-accept-link]').click();await tick();assert.equal(f.calls.some(([a])=>a==='accept_link'),false);
 }finally{f.dom.window.close();}
});
test('aged-out members see an explanation and exit control, not cached posts or compose',async()=>{
 const r={id:room,name:'청소년 모임',owner_id:other,member_count:2,age_policy:'minors',age_eligible:false,age_note:'연령 조건이 맞지 않아요.'};
 const f=fixture({hash:'#room='+room,respond:a=>a==='rooms'?{data:[r]}:undefined});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('#feed'),null);assert.equal(d.querySelector('[data-action=compose]'),null);assert.ok(d.querySelector('[data-action=age-leave]'));assert.equal(f.calls.some(([a])=>a==='feed'),false);
 }finally{f.dom.window.close();}
});
test('owners can edit the age policy along with group settings',async()=>{
 const f=fixture({hash:'#room='+room});try{
  await tick();f.w.document.querySelector('[data-action=manage]').click();await tick();const form=f.w.document.querySelector('#rename-form');assert.ok(form.elements.age_policy);
  form.elements.age_policy.value='adults';form.elements.age_policy.dispatchEvent(new f.w.Event('change'));
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();const payload=f.calls.find(([a])=>a==='rename')[1];assert.equal(payload.age_policy,'adults');assert.equal(payload.min_age,undefined);
 }finally{f.dom.window.close();}
});


test('age badges use four explicit color keys and keep readable labels with safe fallbacks',async()=>{
 const rows=[['all','연령 제한 없음'],['adults','만 19세 이상'],['minors','만 14~18세'],['range','만 20~29세'],['adults" onclick="alert(1)','연령 제한 없음']].map(([age_policy,label],i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name:label,member_count:1,age_policy,min_age:20,max_age:29}));
 const f=fixture({respond:a=>a==='home'?{data:{rooms:[],directory:rows,invitations:[]}}:undefined});try{
  await tick();const badges=[...f.w.document.querySelectorAll('#directory .age-tag')];
  assert.deepEqual(badges.map(b=>b.dataset.agePolicy),['all','adults','minors','range','all']);
  for(let i=0;i<rows.length;i++)assert.equal(badges[i].textContent,rows[i].name,'each badge shows one concise age condition');
  assert.equal(f.w.document.querySelector('[onclick]'),null);
 }finally{f.dom.window.close();}
});
test('age selector previews colors and custom ages immediately without changing form behavior',async()=>{
 const f=fixture({empty:true,publicGroups:false});try{
  await tick();const d=f.w.document;d.querySelector('[data-action=create]').click();const form=d.querySelector('#room-form'),mode=form.elements.age_policy,settings=form.querySelector('.age-settings'),preview=form.querySelector('[data-age-preview]');
  assert.equal(preview.getAttribute('aria-live'),'polite');
  for(const value of ['all','adults','minors','range']){
   mode.value=value;mode.dispatchEvent(new f.w.Event('change'));
   assert.equal(settings.dataset.agePolicy,value);assert.equal(preview.querySelector('.age-tag').dataset.agePolicy,value);
   assert.equal(form.elements.min_age.disabled,value!=='range');
  }
  assert.match(preview.textContent,/20~29세/);
  const preset=form.querySelector('[data-age-preset]');preset.value='30-39';preset.dispatchEvent(new f.w.Event('change'));assert.match(preview.textContent,/30~39세/);
  form.elements.min_age.value='35';form.elements.max_age.value='45';form.elements.max_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/35~45세/);
  form.elements.max_age.value='30';form.elements.max_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/나이 범위를 확인/);assert.equal(form.elements.max_age.validity.customError,true);
  form.elements.min_age.value='';form.elements.min_age.dispatchEvent(new f.w.Event('input'));assert.match(preview.textContent,/나이 범위를 확인/);
  mode.value='all';mode.dispatchEvent(new f.w.Event('change'));assert.equal(preview.textContent,'연령 제한 없음');assert.equal(form.elements.max_age.validity.customError,false);
 }finally{f.dom.window.close();}
});
test('room header and management form share the same adult color key',async()=>{
 const row={id:room,name:'성인 모임',description:'',owner_id:id,member_count:1,age_policy:'adults',min_age:19,max_age:null};
 const f=fixture({hash:'#room='+room,respond:a=>a==='rooms'?{data:[row]}:undefined});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('.room-context .age-tag').dataset.agePolicy,'adults');
  d.querySelector('[data-action=manage]').click();await tick();const form=d.querySelector('#rename-form');
  assert.equal(form.querySelector('.age-settings').dataset.agePolicy,'adults');assert.equal(form.querySelector('[data-age-preview] .age-tag').dataset.agePolicy,'adults');
 }finally{f.dom.window.close();}
});
test('received and shared invitations keep age colors and admission restrictions',async()=>{
 const f=fixture({empty:true,hash:'#invite='+entry,respond:a=>{
  if(a==='home')return {data:{rooms:[],directory:[],invitations:[{id:entry,room_id:room,group_name:'청소년 모임',sender_name:'친구',age_policy:'minors',age_eligible:false}]}};
  if(a==='preview_link')return {data:{room_id:other,group_name:'30대 모임',member:false,age_policy:'range',min_age:30,max_age:39,age_eligible:false}};
 }});try{
  await tick();const d=f.w.document;assert.equal(d.querySelector('#group-invitations .age-tag').dataset.agePolicy,'minors');assert.equal(d.querySelector('[data-accept-invite]').disabled,true);
  assert.equal(d.querySelector('dialog .age-tag').dataset.agePolicy,'range');assert.match(d.querySelector('dialog .age-tag').textContent,/30~39세/);assert.equal(d.querySelector('[data-accept-link]').disabled,true);
 }finally{f.dom.window.close();}
});
test('age color palettes retain strong text contrast and do not depend on color alone',()=>{
 const css=fs.readFileSync(path.join(root,'groups/style.css'),'utf8');
 const palettes=[...css.matchAll(/--age-ink:(#[a-f0-9]{6});--age-bg:(#[a-f0-9]{6});--age-line:(#[a-f0-9]{6})/g)];assert.equal(palettes.length,4);
 const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 for(const [,ink,bg] of palettes){const a=luminance(ink),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,ink+' on '+bg);}
 assert.match(css,/\.age-tag\{[^}]*white-space:normal/);assert.match(css,/@media\(forced-colors:active\)/);
});

test('saved five-person ladders fill every column gap without changing their outcomes',async()=>{
  const f=fixture();
  try {
    const w=f.w, d=w.document;
    const names=['A','B','C','D','E'], options=['1','2','3','4','5'];
    await w.OjjudaGroupActivities.open({id:entry,title:'내기',activity:{kind:'ladder',names,options}},{
      dialog(_title,body){
        const dialog=d.createElement('dialog');dialog.innerHTML=body;d.body.append(dialog);dialog.showModal();return dialog;
      },
      api:async()=>({result:{rungs:[1,1]}}),esc:value=>value,failure:err=>err.message
    });
    const lines=[...d.querySelectorAll('.ladder-board svg line')];
    const rungs=lines.filter(line=>line.getAttribute('y1')===line.getAttribute('y2'));
    assert.equal(rungs.length,16);
    for(const rail of lines.slice(0,names.length-1)){
      assert.ok(rungs.filter(rung=>rung.getAttribute('x1')===rail.getAttribute('x1')).length>=2);
    }
    d.querySelector('[data-lane="0"]').click();await tick();
    assert.deepEqual([...d.querySelectorAll('.ladder-results dd')].map(el=>el.textContent),options);
    const points=d.querySelector('.ladder-board polyline').getAttribute('points').split(' ');
    assert.equal(points[0].split(',')[0],points.at(-1).split(',')[0]);
  } finally { f.w.close(); }
});

for (const kind of ['poll','ladder','wheel']) {
  test('compose and participate in a group '+kind,async()=>{
    let post, selection=null, drawn=null;
    const f=fixture({hash:'#room='+room,respond(action,p){
      if(action==='save'){
        post={...p,author_id:id,author_name:'작성자',room_name:'모임',created_at:'2026-11-17T00:00:00Z',updated_at:'2026-11-17T00:00:00Z'};
        return {data:post};
      }
      if(action==='feed')return {data:post?[post]:[]};
      if(action==='activity_vote')selection=p.choice;
      if(action==='activity_draw')drawn=kind==='wheel'?{winner:1}:{rungs:[0]};
      if(action.startsWith('activity_'))return {data:kind==='poll'?{counts:[1+Number(selection===0),1+Number(selection===1)],mine:selection}:{result:drawn}};
    }});
    try {
      await tick();const d=f.w.document;
      d.querySelector('[data-action=compose]').click();
      const form=d.querySelector('#composer');
      if(kind==='poll')form.querySelector('[data-group-tool=poll]').click();
      else{
        form.querySelector('[data-group-tool=bet]').click();
        assert.equal(form.elements.kind.value,'post','opening bet choices leaves the draft kind unchanged');
        form.querySelector('[data-kind-choice='+kind+']').click();
      }
      assert.equal(form.elements.kind.value,kind);
      assert.ok([...form.querySelectorAll('[data-group-panel]')].every(panel=>panel.hidden),'the chosen activity opens in the writing body');
      assert.equal(form.querySelector('[data-group-tool='+(kind==='poll'?'poll':'bet')+']').dataset.selected,'true');
      assert.equal(d.querySelector('#schedule-fields').hidden,true);
      assert.equal(form.querySelector('[data-title-label]').textContent,{poll:'질문',ladder:'사다리 제목',wheel:'추첨 주제'}[kind]);
      const group=form.querySelector('[data-editor="'+kind+'"]');
      assert.equal(group.hidden,false);assert.equal(group.disabled,false);
      form.elements.title.value='우리 모임';const inputs=group.querySelectorAll('[name=activity_option]');inputs[0].value='김밥';
      form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();
      assert.ok(form.querySelector('.error').textContent);assert.equal(post,undefined);
      inputs[1].value='떡볶이';
      group.querySelector('[data-add-row]').click();
      assert.equal(group.querySelectorAll('[data-entry-row]').length,3);
      group.querySelector('[data-entry-row]:last-child [data-remove-row]').click();
      if(kind==='ladder'){
        const names=group.querySelectorAll('[name=activity_name]');names[0].value='민지';names[1].value='서준';
      }
      form.dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();
      assert.equal(post.activity.kind,kind);assert.equal(post.starts_at,null);assert.deepEqual(Array.from(post.activity.options),['김밥','떡볶이']);
      d.querySelector('[data-activity]').click();await tick();
      if(kind==='poll'){
        assert.equal(d.querySelector('.poll-results'),null);assert.equal(d.querySelector('[data-cast]').disabled,true);
        d.querySelector('[name=poll_choice][value="1"]').click();assert.equal(selection,null);
        d.querySelector('[data-cast]').click();await tick();
        const results=d.querySelector('.poll-results');assert.match(results.textContent,/총 3표/);
        assert.match(results.querySelectorAll('li')[1].textContent,/내 선택/);
        assert.match(results.querySelectorAll('li')[1].textContent,/2표 · 66.7%/);
        assert.ok(Math.abs(parseFloat(results.querySelectorAll('.poll-track span')[1].style.width)-200/3)<0.01);
        d.querySelector('[data-change-vote]').click();d.querySelector('[name=poll_choice][value="0"]').click();
        d.querySelector('[data-show-results]').click();assert.equal(selection,1);
        d.querySelector('[data-change-vote]').click();d.querySelector('[name=poll_choice][value="0"]').click();
        d.querySelector('[data-cast]').click();await tick();
        assert.equal(selection,0);assert.match(d.querySelector('.poll-results').textContent,/총 3표/);
      }else{
        let finishSpin;
        if(kind==='wheel')f.w.Element.prototype.animate=()=>({
          finished:new Promise(resolve=>{finishSpin=resolve;}), cancel(){}
        });
        d.querySelector('[data-draw]').click();await tick();
        if(kind==='wheel'){
          assert.equal(d.querySelector('[data-phase=running]')!==null,true);
          assert.equal(d.querySelector('.wheel-hit, [data-copy-result]'),null);
          finishSpin();await tick();
        }
        assert.equal(d.querySelector('[data-draw-status] strong').textContent,'떡볶이');
        if(kind==='ladder'){
          assert.equal(d.querySelector('.draw-all').open,false);
          const lines = [...d.querySelectorAll('.ladder-board svg line')];
          const crossings = lines.filter(line=>line.getAttribute('y1')===line.getAttribute('y2'));
          assert.equal(crossings.length,13,'a saved two-person board has at least twelve crossings with outcome parity preserved');
          assert.equal(new Set(crossings.map(line=>line.getAttribute('y1'))).size,13);
          d.querySelector('[data-lane="1"]').click();await tick();
          assert.match(d.querySelector('[data-draw-status]').textContent,/서준 도착김밥/);
          assert.deepEqual([...d.querySelectorAll('.ladder-results dd')].map(el=>el.textContent),['떡볶이','김밥']);
        }else{
          assert.equal(d.querySelector('.wheel-hit').textContent,'2');
          d.querySelector('[data-draw]').click();await tick();
          assert.equal(d.querySelector('[data-draw-status] strong'),null);
          finishSpin();await tick();
          assert.equal(d.querySelector('[data-draw-status] strong').textContent,'떡볶이');
        }
        assert.equal(f.calls.filter(([action])=>action==='activity_draw').length,1,'replaying does not draw again');
      }
      d.querySelector('[data-close]').click();d.querySelector('[data-edit]').click();
      const edit=d.querySelector('#composer');
      assert.equal(edit.elements.kind.value,kind);assert.equal(edit.elements.kind.disabled,true);
      for(const key of ['post','plan','poll','bet'])assert.equal(edit.querySelector('[data-group-tool='+key+']').disabled,true,
        'editing an existing activity keeps its kind fixed');
      assert.equal(edit.querySelector('[data-group-tool=photo]').disabled,false,'attachments remain editable');
      assert.ok([...edit.querySelectorAll('[data-editor] input')].every(input=>input.readOnly));
    }finally{f.dom.window.close();}
  });
}

test('activity editors keep separate drafts and enforce the 2–10 row limits',async()=>{
  const f=fixture({hash:'#room='+room});
  try{
    await tick();const d=f.w.document;d.querySelector('[data-action=compose]').click();
    const form=d.querySelector('#composer');
    const choose=kind=>{form.elements.kind.value=kind;form.elements.kind.dispatchEvent(new f.w.Event('change'));return form.querySelector('[data-editor="'+kind+'"]');};
    const poll=choose('poll'),add=poll.querySelector('[data-add-row]');
    poll.querySelector('input').value='첫 번째 보기';
    for(let i=2;i<10;i++)add.click();
    assert.equal(add.disabled,true);assert.equal(poll.querySelectorAll('[data-entry-row]').length,10);
    const wheel=choose('wheel');assert.equal(poll.disabled,true);assert.equal(wheel.querySelector('input').value,'');
    wheel.querySelector('input').value='돌림판 전용';
    choose('poll');assert.equal(poll.querySelector('input').value,'첫 번째 보기');
    assert.equal(new f.w.FormData(form).getAll('activity_option').length,10);
    while(poll.querySelectorAll('[data-entry-row]').length>2)poll.querySelector('[data-entry-row]:last-child [data-remove-row]').click();
    assert.equal(add.disabled,false);assert.ok([...poll.querySelectorAll('[data-remove-row]')].every(b=>b.hidden));
    assert.equal(choose('wheel').querySelector('input').value,'돌림판 전용');
  }finally{f.dom.window.close();}
});

test('multiline activity paste preserves other entries and rejects over-capacity pastes atomically',async()=>{
  const f=fixture({hash:'#room='+room});
  try{
    await tick();const d=f.w.document;d.querySelector('[data-action=compose]').click();
    const form=d.querySelector('#composer');form.querySelector('[data-group-tool=poll]').click();
    const editor=form.querySelector('[data-editor=poll]'),inputs=()=>[...editor.querySelectorAll('[name=activity_option]')];
    assert.equal(form.elements.kind.value,'poll');assert.equal(form.querySelector('.composer-extras').open,true,'the writing body stays available below activity options');
    inputs()[1].value='이미 적은 보기';
    const paste=(input,text)=>{const e=new f.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>text}});input.dispatchEvent(e);assert.equal(e.defaultPrevented,true);};
    paste(inputs()[0],'가\r\n나\n다');const values=inputs().map(el=>el.value);
    assert.deepEqual(values,['가','이미 적은 보기','나','다']);
    paste(inputs()[0],Array(11).fill('추가').join('\n'));assert.deepEqual(inputs().map(el=>el.value),values);
    paste(inputs()[0],'추가\n'+'글'.repeat(41));assert.deepEqual(inputs().map(el=>el.value),values);
    form.querySelector('[data-group-tool=post]').click();assert.equal(form.elements.kind.value,'post');assert.equal(form.querySelector('.composer-extras').open,true);
  }finally{f.dom.window.close();}
});

test('ladder member picker fills empty names and keeps the manually entered pair',async()=>{
  const f=fixture({hash:'#room='+room});
  try{
    await tick();const d=f.w.document;d.querySelector('[data-action=compose]').click();
    d.querySelector('[data-kind-choice=ladder]').click();const editor=d.querySelector('[data-editor=ladder]');
    editor.querySelector('[name=activity_name]').value='손님';editor.querySelector('[name=activity_option]').value='요리';
    editor.querySelector('[data-pick-members]').click();await tick();
    for(const check of editor.querySelectorAll('[data-member-list] input'))check.click();
    editor.querySelector('[data-use-members]').click();
    assert.deepEqual([...editor.querySelectorAll('[name=activity_name]')].map(el=>el.value),['손님','민준','수빈']);
    assert.equal(editor.querySelector('[name=activity_option]').value,'요리');
    editor.querySelector('[data-pick-members]').click();await tick();
    assert.ok([...editor.querySelectorAll('[data-member-list] input')].every(el=>el.disabled));
    d.querySelector('[data-kind-choice=wheel]').click();assert.equal(editor.querySelector('[data-members-picker]').hidden,true);
  }finally{f.dom.window.close();}
});

test('automatic group artwork stays the same in the directory, room, rename and a new session',async()=>{
 const f=fixture({empty:true,publicGroups:false});let theme,src;
 try{
  await tick();const d=f.w.document;
  d.querySelector('[data-action=create]').click();const create=d.querySelector('#room-form');create.elements.name.value='자동 꾸미기 모임';create.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const card=d.querySelector('[data-group]');theme=card.dataset.groupTheme;src=card.querySelector('.group-artwork').getAttribute('src');
  assert.ok(theme);assert.ok(fs.existsSync(path.join(root,src)),'artwork must be an existing local asset');assert.equal(card.querySelector('.group-artwork').alt,'');
  assert.ok(!Object.keys(f.calls.find(([a])=>a==='create_room')[1]).some(k=>/theme|image|color/.test(k)),'automatic appearance needs no extra creation fields');
  card.querySelector('[data-room]').click();await tick();
  const check=()=>{const hero=d.querySelector('.group-room-hero');assert.equal(hero.dataset.groupTheme,theme);assert.equal(hero.querySelector('.group-artwork').getAttribute('src'),src);};
  check();d.querySelector('[data-action=manage]').click();await tick();const rename=d.querySelector('#rename-form');rename.elements.name.value='이름을 바꾼 모임';rename.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();check();
  d.querySelector('[data-action=home]').click();await tick();assert.equal(d.querySelector('[data-group]').dataset.groupTheme,theme);
 }finally{f.dom.window.close();}
 const fresh=fixture();try{
  await tick();const cards=fresh.w.document.querySelectorAll('[data-group]');
  assert.equal(cards[0].dataset.groupTheme,theme);assert.equal(cards[0].querySelector('.group-artwork').getAttribute('src'),src);
  assert.notEqual(cards[0].dataset.groupTheme,cards[1].dataset.groupTheme,'different rooms can receive different artwork');
  assert.equal(fresh.w.document.querySelector('#directory script'),null);
 }finally{fresh.dom.window.close();}
});

test('new group directory and room header use the same expanded shared illustration',async()=>{
 const r={id:room,name:'새로운 그림 모임',description:'함께 나누는 하루',owner_id:id,member_count:2,created_at:'2030-01-01T00:00:00Z'};
 const f=fixture({respond:action=>action==='home'?{data:{rooms:[r],directory:[{...r,is_member:true}],invitations:[]}}:action==='rooms'?{data:[r]}:undefined});
 try{await tick();const d=f.w.document,expected=f.w.OjjudaCozyArt.forGroup(r);assert.ok(expected.src.startsWith('/assets/cozy-scenes/'));
 assert.equal(d.querySelector('.group-card .group-artwork').getAttribute('src'),expected.src);
 d.querySelector('[data-room]').click();await tick();assert.equal(d.querySelector('.group-room-hero .group-artwork').getAttribute('src'),expected.src);
 assert.equal(d.querySelector('.group-room-hero').dataset.groupTheme,expected.theme);
 }finally{f.dom.window.close();}
});

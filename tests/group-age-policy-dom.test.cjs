const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../groups/app.js'),'utf8');
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',roomId='10000000-0000-4000-8000-000000000001',inviteId='20000000-0000-4000-8000-000000000001',postId='30000000-0000-4000-8000-000000000001';
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const room=extra=>({id:roomId,name:'우리 모임',description:'함께 이야기해요',owner_id:uid,member_count:2,created_at:'2026-11-01T00:00:00Z',...extra});
function fixture({joined=[],available=[],invitations=[],preview={},hash='',respond,media=false}={}){
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://ojjuda.kr/groups/'+hash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],revoked=[];
 let rooms=joined,directory=available;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.IntersectionObserver=class{observe(){}disconnect(){}unobserve(){}};
 w.URL.createObjectURL=()=> 'blob:private-group-photo';w.URL.revokeObjectURL=url=>revoked.push(url);
 w.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
 const post={id:postId,room_id:roomId,room_name:'우리 모임',author_id:uid,author_name:'회원',kind:'post',body:'그룹원만 볼 수 있는 글',title:'',created_at:'2026-11-10T00:00:00Z',updated_at:'2026-11-10T00:00:00Z',media:media?[{path:'private/photo.jpg',mime:'image/jpeg',name:'그룹 사진'}]:[],comment_count:0};
 w.supabase={createClient:()=>({
  auth:{getUser:async()=>({data:{user:{id:uid}}}),onAuthStateChange:()=>{}},
  storage:{from:()=>({download:async()=>({data:new w.Blob(['private-photo'])}),remove:async()=>({})})},
  rpc:async(name,args)=>{
   const action=name==='group_home'?'home':args.p_action,payload=name==='group_home'?{query:args.p_query}:args.p_payload;
   calls.push({action,payload});const result=respond?.(action,payload);if(result!==undefined)return result;
   if(action==='home')return {data:{rooms,directory:[...rooms.map(r=>({...r,is_member:true})),...directory],invitations}};
   if(action==='rooms')return {data:rooms};
   if(action==='directory')return {data:[...rooms.map(r=>({...r,is_member:true})),...directory]};
   if(action==='create_room'){rooms=[room({...payload,age_allowed:true})];return {data:{id:roomId}};}
   if(action==='preview_link')return {data:{room_id:roomId,group_name:'우리 모임',member:false,...preview}};
   if(action==='received')return {data:invitations};
   if(action==='feed')return {data:[post]};
   if(action==='leave'){rooms=[];return {data:{}};}
   return {data:[]};
  }
 })};
 w.eval(source);
 return {dom,w,calls,revoked,updateRoom:extra=>{rooms=rooms.map(r=>({...r,...extra}));},close:()=>dom.window.close()};
}
function selectPolicy(f,value){const input=f.w.document.querySelector(`[name="age_policy"][value="${value}"]`);input.checked=true;input.dispatchEvent(new f.w.Event('change',{bubbles:true}));}
function submit(f,form){form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));}
async function createForm(f){await tick();f.w.document.querySelector('[data-action="create"]').click();const form=f.w.document.querySelector('#room-form');form.elements.name.value='우리 모임';return form;}

test('creation defaults to unrestricted membership and sends no hidden age range',async()=>{
 const f=fixture();try{
  const form=await createForm(f),d=f.w.document;
  assert.equal(form.elements.age_policy.value,'all');assert.equal(d.querySelectorAll('[name="age_policy"]').length,4);
  assert.equal(d.querySelector('legend').textContent,'이용 연령');assert.equal(d.querySelector('#age-range-fields').hidden,true);
  assert.equal(form.elements.min_age.disabled,true);assert.match(d.querySelector('#age-help').textContent,/가입 시 등록한 생년월일/);
  submit(f,form);await tick();const p=f.calls.find(c=>c.action==='create_room').payload;
  assert.equal(p.age_policy,'all');assert.equal(p.min_age,null);assert.equal(p.max_age,null);
 }finally{f.close();}
});

test('age presets and a custom inclusive range are submitted as numbers',async()=>{
 const f=fixture();try{
  const form=await createForm(f),d=f.w.document;selectPolicy(f,'range');
  assert.equal(d.querySelector('#age-range-fields').hidden,false);assert.equal(form.elements.min_age.required,true);
  const preset=d.querySelector('#age-preset');preset.value='20,29';preset.dispatchEvent(new f.w.Event('change'));
  assert.equal(form.elements.min_age.value,'20');assert.equal(form.elements.max_age.value,'29');
  form.elements.max_age.value='39';form.elements.max_age.dispatchEvent(new f.w.Event('input'));
  assert.equal(preset.value,'');submit(f,form);await tick();
  const p=f.calls.find(c=>c.action==='create_room').payload;
  assert.equal(p.age_policy,'range');assert.equal(p.min_age,20);assert.equal(p.max_age,39);
  assert.match(d.querySelector('#directory .age-badge').textContent,/20~39세/);
 }finally{f.close();}
});

test('missing, reversed, fractional and out-of-bounds ages do not send a create request',async()=>{
 const f=fixture();try{
  const form=await createForm(f);selectPolicy(f,'range');
  for(const [min,max]of [['','29'],['30','20'],['20.5','29'],['13','19'],['20','151']]){
   form.elements.min_age.value=min;form.elements.max_age.value=max;
   form.elements.min_age.dispatchEvent(new f.w.Event('input'));submit(f,form);
   assert.match(form.querySelector('.error').textContent,/최소 나이와 최대 나이/);
  }
  assert.equal(f.calls.some(c=>c.action==='create_room'),false);
  selectPolicy(f,'minor');assert.equal(form.elements.min_age.required,false);submit(f,form);await tick();
  const p=f.calls.find(c=>c.action==='create_room').payload;
  assert.equal(p.age_policy,'minor');assert.equal(p.min_age,null);assert.equal(p.max_age,null);
 }finally{f.close();}
});

test('a server age rejection preserves creation inputs and the idempotent request ID',async()=>{
 let attempts=0;
 const f=fixture({respond:action=>action==='create_room'&&attempts++===0?{error:{code:'42501',message:'성인 회원만 만들 수 있어요.'}}:undefined});try{
  const form=await createForm(f);selectPolicy(f,'adult');submit(f,form);await tick();
  assert.equal(form.isConnected,true);assert.equal(form.elements.name.value,'우리 모임');
  assert.match(form.querySelector('.error').textContent,/성인 회원/);assert.equal(form.querySelector('[type="submit"]').disabled,false);
  selectPolicy(f,'all');submit(f,form);await tick();
  const attempts=f.calls.filter(c=>c.action==='create_room');assert.equal(attempts.length,2);assert.equal(attempts[0].payload.id,attempts[1].payload.id);
 }finally{f.close();}
});

test('directory badges block known-ineligible and unchecked restricted rooms while legacy groups stay usable',async()=>{
 const blocked=room({age_policy:'adult',age_allowed:false,age_message:'연령 확인이 필요해요.'});
 const unchecked=room({id:inviteId,name:'나이대 미확인',age_policy:'range',min_age:20,max_age:29});
 const legacy=room({id:postId,name:'기존 그룹'});
 const f=fixture({available:[blocked,unchecked,legacy]});try{
  await tick();const d=f.w.document;
  assert.match(d.querySelector(`[data-group="${roomId}"] .age-badge`).textContent,/성인 전용/);
  for(const id of [roomId,inviteId]){const button=d.querySelector(`[data-request="${id}"]`);assert.equal(button.disabled,true);button.click();}
  assert.equal(f.calls.some(c=>c.action==='request'),false);assert.equal(d.querySelector(`[data-request="${postId}"]`).disabled,false);
  assert.match(d.querySelector(`[data-group="${inviteId}"]`).textContent,/확인하지 못했어요/);
 }finally{f.close();}
});

test('ineligible invitations expose conditions and keep acceptance disabled after a failed decline',async()=>{
 const f=fixture({invitations:[{id:inviteId,room_id:roomId,group_name:'청소년 모임',sender_name:'친구',age_policy:'minor',age_allowed:false,age_message:'성인 회원은 입장할 수 없어요.'}],respond:action=>action==='decline'?{error:Error('다시 시도해 주세요.')}:undefined});try{
  await tick();const d=f.w.document;
  assert.match(d.querySelector('#group-invitations .age-badge').textContent,/성인 불가/);
  const accept=d.querySelector('[data-accept-invite]');assert.equal(accept.disabled,true);accept.click();
  d.querySelector('[data-decline-invite]').click();await tick();assert.equal(accept.disabled,true);
  assert.equal(d.querySelector('[data-decline-invite]').disabled,false);assert.equal(f.calls.some(c=>c.action==='accept'),false);
 }finally{f.close();}
 const shared=fixture({hash:'#invite='+inviteId,preview:{age_policy:'range',min_age:30,max_age:39,age_allowed:false,age_message:'만 30~39세 회원만 입장할 수 있어요.'}});try{
  await tick();const d=shared.w.document;assert.match(d.querySelector('dialog .age-badge').textContent,/30~39세/);
  assert.equal(d.querySelector('[data-accept-link]').disabled,true);d.querySelector('[data-accept-link]').click();
  assert.equal(shared.calls.some(c=>c.action==='accept_link'),false);
 }finally{shared.close();}
});

test('a restricted member can leave without reading private content, including direct room URLs',async()=>{
 const f=fixture({joined:[room({owner_id:other,age_policy:'minor',age_allowed:false,age_message:'성인 회원은 입장할 수 없어요.'})],hash:'#room='+roomId});try{
  await tick();const d=f.w.document;
  assert.equal(d.querySelector('#feed'),null);assert.equal(d.querySelector('[data-action="manage"]'),null);assert.equal(f.calls.some(c=>c.action==='feed'),false);
  d.querySelector('[data-action="age-leave"]').click();d.querySelector('[data-yes]').click();await tick();
  assert.equal(f.calls.find(c=>c.action==='leave').payload.room_id,roomId);assert.ok(d.querySelector('#directory'));
 }finally{f.close();}
});

test('rechecking a restricted room clears posts, media URLs and an open gallery after access expires',async()=>{
 const f=fixture({joined:[room({owner_id:other,age_policy:'minor',age_allowed:true})],hash:'#room='+roomId,media:true});try{
  await tick();const d=f.w.document;d.querySelector('[data-load-media]').click();await tick();d.querySelector('.media-slot img').click();await tick();
  assert.ok(d.querySelector('dialog.lightbox img'));f.updateRoom({age_allowed:false,age_message:'성인 회원은 입장할 수 없어요.'});
  d.dispatchEvent(new f.w.Event('visibilitychange'));await tick();
  assert.equal(d.querySelector('dialog'),null);assert.equal(d.querySelector('#feed'),null);assert.equal(d.querySelector('img[src^="blob:"]'),null);
  assert.ok(f.revoked.length>0);assert.match(d.querySelector('.age-restricted').textContent,/성인 회원은 입장할 수 없어요/);
 }finally{f.close();}
});

test('an owner outside the allowed age range must confirm before deleting the group',async()=>{
 const f=fixture({joined:[room({age_policy:'minor',age_allowed:false})],hash:'#room='+roomId});try{
  await tick();const d=f.w.document;d.querySelector('[data-action="age-delete"]').click();
  assert.match(d.querySelector('dialog').textContent,/되돌릴 수 없어요/);
  assert.equal(f.calls.some(c=>c.action==='delete_room'),false);d.querySelector('[data-no]').click();
  assert.equal(f.calls.some(c=>c.action==='delete_room'),false);assert.ok(d.querySelector('.age-restricted'));
 }finally{f.close();}
});

test('the composer only offers joined groups whose current age conditions are satisfied',async()=>{
 const f=fixture({joined:[room({age_policy:'adult',age_allowed:true}),room({id:inviteId,name:'예전 청소년 모임',age_policy:'minor',age_allowed:false})],hash:'#room='+roomId});try{
  await tick();const d=f.w.document;d.querySelector('[data-action="compose"]').click();
  const choices=[...d.querySelectorAll('#composer [name="room_id"] option')].map(option=>option.value);
  assert.deepEqual(choices,[roomId]);assert.doesNotMatch(d.querySelector('#composer [name="room_id"]').textContent,/예전 청소년 모임/);
 }finally{f.close();}
});

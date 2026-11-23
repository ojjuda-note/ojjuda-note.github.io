const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../groups/app.js'),'utf8').replace('void initialize();',`
user={id:'member'};
rooms=[{id:'10000000-0000-4000-8000-000000000001'},{id:'20000000-0000-4000-8000-000000000002'}];
render=()=>{document.getElementById('app').textContent=roomId||'groups';};
loadFeed=async()=>{};showSharedInvitation=async()=>{};
window.fixture={route,dialog,confirmAction,idle:()=>!pendingDialogDismiss,room:index=>route(rooms[index].id),
 dirty(){const d=dialog('작성 중','<textarea>남겨 둘 글</textarea>');d.requestDismiss=()=>confirmAction('지울까요?','',()=>d.close());return d;}};
render();
`);
function fixture(){
 const dom=new JSDOM('<!doctype html><main id="app"></main><div id="toast"></div>',{url:'https://group-history.test/before',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;w.setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
 w.history.pushState({retained:'yes'},'','/groups/');w.eval(source);
 const tick=()=>new Promise(resolve=>w.setTimeout(resolve,0));
 const settle=async()=>{
  await tick();await tick();await tick();
  for(let i=0;i<100;i++){
   const marker=w.history.state?.ojjudaGroupDialog,open=w.document.querySelector('dialog[open][data-group-dialog="'+marker+'"]');
   if(w.fixture.idle()&&(!marker||open))return;
   await tick();
  }
  throw Error('Group history did not settle');
 };
 return {w,api:w.fixture,settle,close:()=>w.close(),async go(delta){const popped=new Promise(resolve=>w.addEventListener('popstate',resolve,{once:true}));w.history.go(delta);await popped;await settle();},dialog:()=>w.document.querySelector('dialog[open]')};
}
test('group history preserves visited rooms and caller state',async()=>{
 const f=fixture();try{
  f.api.room(0);f.api.room(1);await f.go(-1);assert.match(f.w.location.hash,/1000/);
  await f.go(-1);assert.equal(f.w.location.hash,'');
  await f.go(1);assert.match(f.w.location.hash,/1000/);assert.equal(f.w.history.state.retained,'yes');
  await f.go(-1);await f.go(-1);assert.equal(f.w.location.pathname,'/before');
 }finally{f.close();}
});
test('group popup Back and explicit Close return to the same page without leaving a dead step',async()=>{
 for(const manual of [false,true]){
  const f=fixture();try{
   const d=f.api.dialog('팝업','내용');if(manual)d.close();else f.w.history.back();await f.settle();
   assert.equal(f.dialog(),null);assert.equal(f.w.location.pathname,'/groups/');
   await f.go(-1);assert.equal(f.w.location.pathname,'/before');
  }finally{f.close();}
 }
});
test('completing a group dialog then navigating records only the destination',async()=>{
 const f=fixture();try{
  const d=f.api.dialog('완료','내용');d.close();f.api.room(0);await f.settle();
  await f.go(-1);assert.equal(f.w.location.hash,'');await f.go(-1);assert.equal(f.w.location.pathname,'/before');
 }finally{f.close();}
});
test('Back keeps a dirty group composer until discard is confirmed',async()=>{
 const f=fixture();try{
  f.api.dirty();await f.go(-1);
  assert.equal(f.w.document.querySelectorAll('dialog[open]').length,2);
  f.w.document.querySelector('[data-no]').click();await f.settle();
  assert.equal(f.w.document.querySelectorAll('dialog[open]').length,1);
  assert.equal(f.w.document.querySelector('textarea').value,'남겨 둘 글');
  await f.go(-1);f.w.document.querySelector('[data-yes]').click();await f.settle();
  assert.equal(f.dialog(),null);assert.equal(f.w.location.pathname,'/groups/');
  await f.go(-1);assert.equal(f.w.location.pathname,'/before');
 }finally{f.close();}
});

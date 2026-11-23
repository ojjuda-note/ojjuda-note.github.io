const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {JSDOM} = require('jsdom');
const source = readFileSync(require('node:path').join(__dirname, '../shared/navigation/section-back.js'), 'utf8');
function fixture({reload=false,anchor=false}={}) {
  const dom = new JSDOM('<!doctype html><dialog id="photo"></dialog><dialog id="video"></dialog>', {url:'https://ojjuda.test/features/fanpages/artist.html?group=test',runScripts:'outside-only',...(reload?{referrer:'https://ojjuda.test/features/fanpages/index.html'}:{})});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  w.HTMLDialogElement.prototype.close = function(){if(!this.open)return;this.open=false;w.setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
  if(reload){
    w.history.replaceState({ojjudaSectionBack:true},'',w.location.href);
    if(anchor)w.history.pushState(null,'',w.location.href+'#photos');
    w.history.pushState({...w.history.state,ojjudaPublicDialog:'previous-document-viewer'},'',w.location.href);
  }
  w.eval(source);
  const settle = () => new Promise(resolve=>w.setTimeout(resolve,25));
  let restores=0;
  function open(id='photo') {
    const dialog=w.document.getElementById(id);
    dialog.showModal();
    w.OjjudaSectionNavigation.openDialog(dialog,()=>{restores++;open(id);});
    return dialog;
  }
  return {w,open,settle,get restores(){return restores;},close(){w.close();}};
}
test('Back closes a public viewer and Forward restores it without extra entries',async()=>{
  const f=fixture();try{
    const before=f.w.history.length,dialog=f.open();
    assert.equal(f.w.history.length,before+1);
    f.w.history.back();await f.settle();assert.equal(dialog.open,false);
    f.w.history.forward();await f.settle();assert.equal(dialog.open,true);
    assert.equal(f.restores,1);assert.equal(f.w.history.length,before+1);
  }finally{f.close();}
});
test('closing a viewer consumes its entry and does not skip the underlying page',async()=>{
  const f=fixture();try{
    const dialog=f.open();dialog.close();await f.settle();
    assert.equal(dialog.open,false);assert.equal(f.w.history.state.ojjudaPublicDialog,undefined);
    assert.equal(f.w.history.state.ojjudaSectionBack,true);
    f.w.history.forward();await f.settle();assert.equal(dialog.open,true);
  }finally{f.close();}
});
test('several viewer visits retain their own reopen callback and close listener',async()=>{
  const f=fixture();try{
    const photo=f.open();photo.close();await f.settle();
    const video=f.open('video');video.close();await f.settle();
    f.w.history.forward();await f.settle();
    assert.equal(video.open,true);assert.equal(photo.open,false);
    video.close();await f.settle();f.open('video');
    f.w.history.back();await f.settle();assert.equal(video.open,false);
    assert.equal(f.w.history.state.ojjudaSectionBack,true);
  }finally{f.close();}
});
test('viewer teardown during page departure never cancels the destination',async()=>{
  const f=fixture();try{
    const dialog=f.open(),state=f.w.history.state;
    f.w.dispatchEvent(new f.w.Event('pagehide'));dialog.close();await f.settle();
    assert.deepEqual(f.w.history.state,state);
  }finally{f.close();}
});
test('a reload consumes the lost viewer entry before the next deliberate Back',async()=>{
  const f=fixture({reload:true});try{
    await f.settle();
    assert.equal(f.w.history.state.ojjudaPublicDialog,undefined);
    assert.equal(f.w.history.state.ojjudaSectionBack,true);
    assert.equal(f.w.document.querySelector('dialog[open]'),null);
  }finally{f.close();}
});
test('reload cleanup retains a genuine anchor visit beneath the viewer',async()=>{
  const f=fixture({reload:true,anchor:true});try{
    await f.settle();
    assert.equal(f.w.location.hash,'#photos');assert.equal(f.w.history.state,null);
    f.w.history.back();await f.settle();
    assert.equal(f.w.location.hash,'');assert.equal(f.w.history.state.ojjudaSectionBack,true);
  }finally{f.close();}
});
test('BFCache return consumes a viewer released during departure, without a phantom Back stop',async()=>{
  const f=fixture();try{
    const dialog=f.open();
    f.w.dispatchEvent(new f.w.Event('pagehide'));dialog.close();await f.settle();
    assert.ok(f.w.history.state.ojjudaPublicDialog);
    f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await f.settle();
    assert.equal(f.w.history.state.ojjudaPublicDialog,undefined);
    assert.equal(f.w.history.state.ojjudaSectionBack,true);
  }finally{f.close();}
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../app/world/world-navigation.js'), 'utf8');

async function fixture({tab='hub',referrer,gameUrl,initialState,initialEntries,priorPage=false,navigationEntries}={}) {
  const dom = new JSDOM('<!doctype html><main class="main"></main>', {
    url:'https://world.test/world.html'+(gameUrl?'?game='+gameUrl:''),
    ...(referrer?{referrer}:{}),runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window, document=w.document;
  const observers=[];const Observer=w.MutationObserver;
  w.MutationObserver=class extends Observer{constructor(callback){super(callback);observers.push(this);}};
  w.scrollTo=(x,y)=>{w.scrollX=x;w.scrollY=y;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  if(initialEntries)for(const [index,entry] of initialEntries.entries())w.history[index?'pushState':'replaceState'](entry,'',w.location.href);
  if(priorPage)w.history.pushState(null,'',w.location.href);
  if(navigationEntries)Object.defineProperty(w,'navigation',{value:navigationEntries});
  if(initialState)w.history.replaceState(initialState,'',w.location.href);
  let route={tab}, parkSnapshot=null, depth=0, allowLeave=true, rootCalls=0, restores=0, running=false;
  w.eval(source);
  const navigation=w.OjjudaWorldNavigation.install({
    isMain:()=>route.tab==='hub',hasOverlay:()=>depth>0,
    entryOverlayPending:()=>new URL(w.location.href).searchParams.has('game'),
    captureRoute:()=>route.tab==='park'?{...route,park:parkSnapshot}:route,
    routeKey:value=>{const {park,...key}=value;return key;},
    rememberRoute:value=>value.tab==='park'?{...value,park:parkSnapshot}:value,
    restoreRoute:next=>{route=next;if(next.tab==='park')parkSnapshot=next.park;restores++;navigation.sync();},
    homeRoute:next=>({tab:next.tab==='park'?'park':'hub'}),
    routeUrl:next=>'https://world.test/world.html?tab='+next.tab,
    gameCloseUrl:()=>'https://world.test/world.html?tab=arcade',
    closeOverlay(){if(!depth)return false;depth--;renderOverlay();return true;},
    playingGame:()=>running?document.getElementById('game'):null,
    exitGame(){running=false;depth=0;renderOverlay();},
    canLeave:()=>allowLeave,onRootBack:()=>rootCalls++,
    tabs:['hub','arcade','my'],currentTab:()=>route.tab,changeTab:tab=>{route={tab};navigation.sync();}
  });
  function renderOverlay(){
    document.getElementById('game')?.remove();
    document.body.classList.toggle('gaming',depth>0);
    if(depth){const element=document.createElement('div');element.id='game';document.body.append(element);}
  }
  const settle=()=>new Promise(resolve=>w.setTimeout(resolve,15));
  navigation.sync();await settle();
  return {w,document,navigation,settle,
    get route(){return JSON.parse(JSON.stringify(route));},get rootCalls(){return rootCalls;},get restores(){return restores;},
    get overlay(){return depth;},get state(){return w.history.state;},get length(){return w.history.length;},
    setAllow(value){allowLeave=value;},
    updatePark(value,sync=true){parkSnapshot=value;if(sync)navigation.sync();},
    async navigate(tab,extra={}){route={tab,...extra};navigation.sync();await settle();},
    async show({game=false}={}){depth++;running=game;renderOverlay();await settle();},
    async closeOverlay(){depth=0;running=false;renderOverlay();await settle();await settle();},
    async back(){w.history.back();await settle();await settle();},
    async forward(){w.history.forward();await settle();await settle();},
    async nativeBack(){navigation.back();await settle();await settle();},
    emit(type,persisted=false){w.dispatchEvent(new w.PageTransitionEvent(type,{persisted}));},
    close(){for(const observer of observers)observer.disconnect();dom.window.close();}
  };
}

test('Back and Forward restore the actual Hub -> Arcade -> Settings -> Park visits',async()=>{
  const f=await fixture();try{
    await f.navigate('arcade');await f.navigate('my');await f.navigate('park');
    for(const tab of ['my','arcade','hub']){await f.back();assert.equal(f.route.tab,tab);}
    for(const tab of ['arcade','my','park']){await f.forward();assert.equal(f.route.tab,tab);}
    assert.equal(f.rootCalls,0);
  }finally{f.close();}
});

test('settings sections and administrator views retain their visit order',async()=>{
  const f=await fixture();try{
    await f.navigate('my',{open:[]});await f.navigate('my',{open:['help']});
    await f.navigate('admin',{area:'account',section:'overview'});
    await f.navigate('admin',{area:'content',section:'cards'});
    await f.back();assert.equal(f.route.section,'overview');
    await f.back();assert.deepEqual(f.route.open,['help']);
    await f.back();assert.deepEqual(f.route.open,[]);
    await f.forward();assert.deepEqual(f.route.open,['help']);
  }finally{f.close();}
});

test('an overlay closes before its route, and repeating open/close does not grow history',async()=>{
  const f=await fixture();try{
    await f.navigate('arcade');await f.show();await f.back();
    assert.equal(f.overlay,0);assert.equal(f.route.tab,'arcade');
    const length=f.length;
    for(let i=0;i<3;i++){await f.show();await f.closeOverlay();assert.equal(f.route.tab,'arcade');}
    assert.equal(f.length,length);
    await f.back();assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});

test('reopening an overlay before its close traversal finishes preserves the underlying visit',async()=>{
  const f=await fixture();try{
    await f.navigate('arcade');await f.show();
    f.navigation.back();await Promise.resolve();
    assert.equal(f.overlay,0);
    assert.equal(f.state.ojjudaWorldHistory.overlay,true,'the previous close is still traversing history');
    await f.show();
    assert.equal(f.state.ojjudaWorldHistory.index,2,'the new window retains a separate entry');
    await f.nativeBack();assert.equal(f.overlay,0);assert.equal(f.route.tab,'arcade');
    await f.nativeBack();assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});

test('a nested overlay consumes one Back at a time without changing the underlying tab',async()=>{
  const f=await fixture();try{
    await f.navigate('my');await f.show();await f.show();
    await f.back();assert.equal(f.overlay,1);assert.equal(f.route.tab,'my');
    await f.back();assert.equal(f.overlay,0);assert.equal(f.route.tab,'my');
    await f.back();assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});

test('running games ask before leaving; Continue retains the game and later Back works',async()=>{
  const f=await fixture();try{
    await f.navigate('arcade');await f.show({game:true});
    await f.back();assert.ok(f.document.querySelector('.arcade-exit-choice[open]'));assert.equal(f.overlay,1);
    f.document.querySelector('[data-exit-stay]').click();await f.settle();assert.equal(f.overlay,1);
    await f.back();f.document.querySelector('[data-exit-leave]').click();await f.settle();await f.settle();
    assert.equal(f.overlay,0);assert.equal(f.route.tab,'arcade');
    await f.back();assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});

test('unsaved work cancels route traversal without destroying Back/Forward entries',async()=>{
  const f=await fixture();try{
    await f.navigate('arcade');await f.navigate('my');f.setAllow(false);
    await f.back();assert.equal(f.route.tab,'my');
    f.setAllow(true);await f.back();assert.equal(f.route.tab,'arcade');
    await f.forward();assert.equal(f.route.tab,'my');
  }finally{f.close();}
});

test('direct Park remains at Park home; direct Settings has a Hub fallback and first-screen Back is deliberate',async()=>{
  for(const tab of ['park','my']){
    const f=await fixture({tab});try{
      await f.back();assert.equal(f.route.tab,tab==='park'?'park':'hub');
      await f.nativeBack();assert.ok(f.rootCalls>=1);
      assert.equal(f.w.location.pathname,'/world.html');
    }finally{f.close();}
  }
});

test('an internal incoming link keeps its true prior document instead of inventing a Hub entry',async()=>{
  const f=await fixture({tab:'my',referrer:'https://world.test/features/groups/index.html',priorPage:true});try{
    assert.equal(f.length,2);
    assert.equal(f.state.ojjudaWorldHistory.previousInternal,true);
    assert.equal(f.route.tab,'my');
  }finally{f.close();}
});

test('reloading a history entry restores its route without appending a duplicate',async()=>{
  const before=await fixture();let saved;
  try{await before.navigate('my',{open:['help']});saved=before.state;}finally{before.close();}
  const f=await fixture({initialState:saved});try{
    assert.equal(f.route.tab,'my');assert.deepEqual(f.route.open,['help']);assert.equal(f.length,1);
    f.navigation.sync();assert.equal(f.length,1);
  }finally{f.close();}
});

test('pagehide cleanup cannot replace login navigation with Back and BFCache restores normal closing',async()=>{
  const f=await fixture();try{
    await f.show();f.emit('pagehide');await f.closeOverlay();
    assert.equal(f.state.ojjudaWorldHistory.overlay,true,'teardown never traverses the departing document');
    f.emit('pageshow',true);await f.show();await f.closeOverlay();
    assert.equal(f.state.ojjudaWorldHistory.overlay,false);assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});

test('a shared game closes at Arcade with a clean URL and preserves the older Hub route',async()=>{
  const f=await fixture({tab:'arcade',gameUrl:'mines'});try{
    await f.show();assert.equal(new URL(f.w.location.href).searchParams.get('game'),'mines');
    await f.closeOverlay();assert.equal(f.route.tab,'arcade');
    assert.equal(new URL(f.w.location.href).searchParams.get('game'),null);
    await f.back();assert.equal(f.route.tab,'hub');
  }finally{f.close();}
});


test('a new window with an internal referrer still receives a usable direct-entry fallback',async()=>{
 const f=await fixture({tab:'my',referrer:'https://world.test/terms.html'});try{
  assert.equal(f.state.ojjudaWorldHistory.previousInternal,false);
  await f.back();assert.equal(f.route.tab,'hub');
 }finally{f.close();}
});

test('Navigation API rejects an external predecessor even with a stale internal referrer',async()=>{
 const f=await fixture({tab:'my',referrer:'https://world.test/terms.html',priorPage:true,navigationEntries:{
  currentEntry:{index:1},entries:()=>[{index:0,url:'https://outside.test/'}]
 }});try{
  assert.equal(f.state.ojjudaWorldHistory.previousInternal,false);
  await f.back();assert.equal(f.route.tab,'hub');
 }finally{f.close();}
});


test('Park child snapshots update one parent visit and survive leaving and returning',async()=>{
 const f=await fixture();try{
  await f.navigate('park');const length=f.length;
  f.updatePark({view:'saved',card:'card-a'});assert.equal(f.length,length);
  f.updatePark({view:'settings'},false);await f.navigate('my');
  await f.back();assert.equal(f.route.tab,'park');assert.deepEqual(f.route.park,{view:'settings'});
  await f.back();assert.equal(f.route.tab,'hub');
 }finally{f.close();}
});

test('legacy query cleanup cannot erase the route marker or duplicate the visit',async()=>{
 const f=await fixture();try{
  await f.navigate('my');const length=f.length;
  f.w.history.replaceState(null,'',f.w.location.href);f.navigation.sync();
  assert.equal(f.length,length);assert.equal(f.state.ojjudaWorldHistory.route.tab,'my');
  await f.back();assert.equal(f.route.tab,'hub');
 }finally{f.close();}
});


test('reloading a lost popup consumes its stale entry before the first user Back',async()=>{
 const f=await fixture();let entries;
 try{const hub=f.state;await f.navigate('arcade');const arcade=f.state;await f.show();entries=[hub,arcade,f.state];}finally{f.close();}
 const restored=await fixture({tab:'arcade',initialEntries:entries});try{
  await restored.settle();assert.equal(restored.state.ojjudaWorldHistory.index,1);
  await restored.back();assert.equal(restored.route.tab,'hub','one Back leaves the Arcade instead of landing on its duplicate');
 }finally{restored.close();}
});

test('a reloaded game query retains its pending game entry until the game mounts',async()=>{
 const f=await fixture();let entries;
 try{const hub=f.state;await f.navigate('arcade');const arcade=f.state;await f.show();entries=[hub,arcade,f.state];}finally{f.close();}
 const restored=await fixture({tab:'arcade',gameUrl:'mines',initialEntries:entries});try{
  assert.equal(restored.state.ojjudaWorldHistory.index,2);
  await restored.show();assert.equal(restored.state.ojjudaWorldHistory.index,2,'the mounted game reuses its pending entry');
  await restored.back();assert.equal(restored.route.tab,'arcade');assert.equal(restored.overlay,0);
  await restored.back();assert.equal(restored.route.tab,'hub');
 }finally{restored.close();}
});

test('BFCache restoration discards a popup removed during departure before ordinary Back',async()=>{
 const f=await fixture();try{
  await f.navigate('arcade');await f.show();f.emit('pagehide');await f.closeOverlay();
  f.emit('pageshow',true);await f.settle();await f.settle();
  assert.equal(f.state.ojjudaWorldHistory.overlay,false);
  await f.back();assert.equal(f.route.tab,'hub');
 }finally{f.close();}
});

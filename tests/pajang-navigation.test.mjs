import assert from 'node:assert/strict';
import test from 'node:test';
import {createStationHistory} from '../features/pajang/src/lib/navigation.mjs';

function fixture(path='/station.html',state={sharedMarker:'preserved'}){
  const listeners=new Map(),entries=[{url:'https://ojjuda.test'+path,state}];
  let cursor=0,queue=[];
  const win={location:new URL(entries[0].url),scrollY:0,crypto:{randomUUID:()=> 'document'},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);}};
  const emit=name=>{for(const fn of listeners.get(name)||[])fn({state:history.state});};
  function load(){win.location.href=entries[cursor].url;}
  const history=win.history={
    get state(){return structuredClone(entries[cursor].state);},
    get length(){return entries.length;},
    replaceState(value,_title,href){entries[cursor]={url:new URL(href,win.location).href,state:structuredClone(value)};load();},
    pushState(value,_title,href){entries.splice(cursor+1);entries.push({url:new URL(href,win.location).href,state:structuredClone(value)});cursor++;load();},
    back(){history.go(-1);},
    go(delta){queue.push(()=>{const next=cursor+delta;if(next<0||next>=entries.length)return;cursor=next;load();emit('popstate');});}
  };
  const restored=[];
  let controller=createStationHistory(win,(modal,scroll,cause)=>restored.push({modal,scroll,cause,path:win.location.pathname+win.location.search+win.location.hash}));
  return {win,history,restored,entries,
    get controller(){return controller;},
    flush(){while(queue.length){const tasks=queue;queue=[];tasks.forEach(fn=>fn());}},
    scroll(value){win.scrollY=value;emit('scroll');},
    reload(){controller.dispose();controller=createStationHistory(win,(modal,scroll,cause)=>restored.push({modal,scroll,cause,path:win.location.pathname+win.location.search+win.location.hash}));},
    get path(){return win.location.pathname+win.location.search+win.location.hash;},
    get modal(){return restored.at(-1)?.modal||null;}
  };
}

test('tabs follow the visited order in both directions, retaining unrelated state',()=>{
  const f=fixture();
  for(const tab of ['radar','inbox','profile'])f.controller.visit('/station.html?tab='+tab);
  for(const tab of ['inbox','radar','']){
    f.history.back();f.flush();assert.equal(f.path,'/station.html'+(tab?'?tab='+tab:''));
  }
  f.history.go(1);f.flush();assert.equal(f.path,'/station.html?tab=radar');
  assert.ok(f.entries.every(entry=>entry.state.sharedMarker==='preserved'));
  f.controller.visit('/station.html?tab=radar');assert.equal(f.entries.length,4,'same-tab clicks do not add entries');
});

test('Back closes the dialog first, and a close button consumes exactly its own entry',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=profile');
  f.controller.open({kind:'edit',privateBody:'private answer'});
  assert.equal(f.modal.kind,'edit');
  assert.ok(!JSON.stringify(f.entries).includes('private answer'),'history never stores the private form contents');
  f.history.back();f.flush();assert.equal(f.modal,null);assert.equal(f.path,'/station.html?tab=profile');
  f.history.go(1);f.flush();assert.equal(f.modal.kind,'edit','Forward restores the visited dialog while it is in memory');
  assert.equal(f.controller.close(),true);f.flush();assert.equal(f.modal,null);
  f.history.back();f.flush();assert.equal(f.path,'/station.html','a closed dialog cannot consume the next Back');
});

test('switching dialog contents keeps one overlay entry and leaving it clears the obsolete overlay',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=radar');
  f.controller.open({kind:'person',peer:'a'});f.controller.open({kind:'signal',peer:'a'});
  assert.equal(f.entries.length,3);
  f.controller.visit('/station.html?tab=chat&chat=a');f.flush();
  assert.equal(f.path,'/station.html?tab=chat&chat=a');assert.equal(f.modal,null);
  f.controller.back('/station.html?tab=inbox');f.flush();
  assert.equal(f.path,'/station.html?tab=radar');assert.equal(f.modal,null);
  f.history.go(1);f.flush();assert.equal(f.path,'/station.html?tab=chat&chat=a');
});

test('rapid repeated close and navigation cannot pop a second real page',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=profile');f.controller.open({kind:'help'});
  f.controller.close();f.controller.close();f.controller.visit('/station.html?tab=inbox');f.flush();
  assert.equal(f.path,'/station.html?tab=profile');assert.equal(f.modal,null);
});

test('a direct chat falls back to its list, while a proven previous document is honored',()=>{
  const f=fixture('/station.html?tab=chat&chat=a');
  f.controller.back('/station.html?tab=inbox');assert.equal(f.path,'/station.html?tab=inbox');
  assert.equal(f.entries.length,1);
  const g=fixture('/station.html?tab=chat&chat=a');let called=0;
  g.win.OjjudaSectionNavigation={hasPreviousPage:true,back(){called++;}};
  g.controller.back('/station.html?tab=inbox');assert.equal(called,1);assert.equal(g.entries.length,1);
});

test('each visit restores its own reading position on Back and Forward',()=>{
  const f=fixture();f.scroll(120);f.controller.visit('/station.html?tab=profile');
  f.scroll(260);f.history.back();f.flush();assert.equal(f.restored.at(-1).scroll,120);
  f.history.go(1);f.flush();assert.equal(f.restored.at(-1).scroll,260);
});

test('reloading a chat retains the prior tab order, without persisting dialog contents',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=radar');f.controller.visit('/station.html?tab=chat&chat=a');
  f.reload();f.controller.back('/station.html?tab=inbox');f.flush();assert.equal(f.path,'/station.html?tab=radar');
  f.controller.open({kind:'edit',privateBody:'private answer'});f.reload();f.flush();
  assert.equal(f.history.state.pajangNavigation.modal,null);
  f.history.back();f.flush();assert.equal(f.path,'/station.html','reload closes the overlay without a duplicate Back stop');
  assert.ok(!JSON.stringify(f.entries).includes('private answer'));
});

test('external support shares the one popup entry for Back, Forward and manual close',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=profile');
  let visible=false;
  const support={show(){visible=true;},hide(){visible=false;},canLeave:()=>true,isCurrent:()=>true};
  f.controller.openExternal(support);assert.equal(visible,true);assert.equal(f.entries.length,3);
  f.history.back();f.flush();assert.equal(visible,false);assert.equal(f.path,'/station.html?tab=profile');
  f.history.go(1);f.flush();assert.equal(visible,true);
  visible=false;f.controller.closeExternal(support);f.flush();
  f.history.back();f.flush();assert.equal(f.path,'/station.html','manual close consumes exactly the support entry');
});

test('busy support returns to its existing entry without losing Forward or the form',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=profile');
  let busy=true,shows=0,hides=0;
  const support={show(){shows++;},hide(){hides++;},canLeave:()=>!busy,isCurrent:()=>true};
  f.controller.openExternal(support);const state=f.history.state;
  f.history.back();f.flush();
  assert.deepEqual(f.history.state,state);assert.equal(f.entries.length,3);
  assert.equal(shows,1);assert.equal(hides,0,'blocked Back does not rebuild the draft');
  f.controller.closeExternal(support);f.controller.visit('/station.html?tab=inbox');f.flush();
  assert.deepEqual(f.history.state,state);
  busy=false;f.controller.closeExternal(support);f.flush();
  f.history.back();f.flush();assert.equal(f.path,'/station.html');
});

test('support to withdrawal replaces the closed support and invalid private contexts never reopen',()=>{
  const f=fixture();f.controller.visit('/station.html?tab=profile');
  let valid=true,shows=0;
  const support={show(){shows++;},hide(){},canLeave:()=>true,isCurrent:()=>valid};
  f.controller.openExternal(support);
  f.controller.closeExternal(support,()=>{valid=false;f.controller.open({kind:'withdraw'});});f.flush();
  assert.equal(f.modal.kind,'withdraw');assert.equal(f.entries.length,3);
  f.controller.close();f.flush();f.history.go(1);f.flush();assert.equal(f.modal.kind,'withdraw');assert.equal(shows,1);
  f.controller.close();f.flush();valid=true;f.controller.openExternal(support);
  f.controller.closeExternal(support);f.flush();valid=false;
  f.history.go(1);f.flush();assert.equal(f.history.state.pajangNavigation.modal,null);assert.equal(shows,2);
  f.history.back();f.flush();assert.equal(f.path,'/station.html');
});

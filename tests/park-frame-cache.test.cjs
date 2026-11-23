const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../park/world-park-notes.js'), 'utf8');

function fixture(search = '') {
  const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#704d30"></head><body><div id="app"></div></body></html>', {
    url: 'https://fixture.test/world.html'+search, runScripts: 'outside-only'
  });
  const {window} = dom;
  const timers = new Map();
  let nextTimer = 0, place = {id: 'park'}, owner = 'member-a', gestureAttach = 0, gestureDetach = 0, worldReturns = 0, restoring = false, admin = false, adminEntries = 0;
  window.setTimeout = (fn, delay) => {const id = ++nextTimer;timers.set(id, {fn, delay});return id;};
  window.clearTimeout = id => timers.delete(id);
  window.eval(source);
  const app = window.OjjudaParkNotes.install({
    place: () => place,
    userId: () => owner,
    restoringHistory: () => restoring,
    isAdmin: () => admin,
    enter: () => {place = {id: 'park'};render('park');},
    toWorld: () => {worldReturns++;render('hub');},
    toAdmin: () => {adminEntries++;render('admin');},
    onFrameReady: () => {gestureAttach++;return () => {gestureDetach++;};}
  });
  function markup(tab) {
    const main = tab === 'park' ? app.markup() : `<section data-view="${tab}">${tab}</section>`;
    const navigation = tab === 'park' ? ['feed','mine','saved','settings'].map(action=>`<button data-park-action="${action}">${action}</button>`).join('') : tab;
    return `<div class="shell"><aside class="side"><nav class="sidenav">${navigation}</nav></aside><div class="col"><header class="topbar">${tab}</header><main class="main">${main}</main></div></div><nav class="bottomnav">${navigation}</nav>`;
  }
  function render(tab) {
    place = tab === 'park' ? {id: 'park'} : tab === 'arcade' ? {id: 'arcade'} : null;
    if (!app.preserveShell(markup(tab))) window.document.querySelector('#app').innerHTML = markup(tab);
    app.sync();
  }
  const frame = () => window.document.querySelector('[data-park-app] iframe');
  return {window, dom, app, render, frame, timers, setRestoring: value=>{restoring=value;}, setOwner: id => {owner = id;}, setAdmin: value => {admin = value;},
    gestures: () => ({gestureAttach, gestureDetach}), worldReturns: () => worldReturns, adminEntries: () => adminEntries};
}

test('Park iframe survives a short visit to Arcade and returns without reloading', () => {
  const f = fixture();
  try {
    f.render('park');
    const first = f.frame();
    assert.ok(first?.isConnected);
    const calls = [];
    first.contentWindow.OjjudaParkFull = {returnHome() {calls.push('home'); return true;}, navigate(action) {calls.push(action);}};
    f.render('park');
    assert.deepEqual(calls, [], 'a repaint preserves the current card');
    f.render('arcade');
    assert.equal(f.frame(), first);
    assert.equal(first.closest('[data-park-app]').hidden, true);
    assert.equal(f.app.canLeave(), true, 'a hidden Park cannot block Arcade navigation');
    assert.equal(f.app.close(), false, 'a hidden Park cannot intercept Arcade Back');
    assert.equal(f.timers.size, 1, 'inactive frame has one retirement timer');
    f.render('park');
    assert.equal(f.frame(), first, 'the original browsing context remains connected');
    assert.equal(first.closest('[data-park-app]').hidden, false);
    assert.equal(f.timers.size, 0, 'returning cancels retirement');
    assert.equal(f.window.document.querySelector('.topbar').textContent, 'park');
    assert.deepEqual(calls, ['home']);
    f.render('my'); f.app.open('saved');
    assert.deepEqual(calls, ['home','home','saved'], 'an explicit shortcut still opens its target');
    f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', {persisted:true}));
    assert.equal(calls.at(-1),'saved','browser history restoration preserves the page the user was reading');
  } finally {f.dom.window.close();}
});

test('Park browser chrome follows the shared automatic palette across cached section visits', () => {
  const f = fixture();
  try {
    const root = f.window.document.documentElement;
    const theme = f.window.document.querySelector('meta[name="theme-color"]');
    let currentColor = '#704d30', refreshes = 0;
    f.window.OjjudaThemes = {syncAppearance() {refreshes++;theme.content=currentColor;}};
    root.dataset.theme = 'dark';
    f.render('hub');
    assert.equal(theme.content,currentColor);
    f.render('park');
    assert.equal(theme.content,currentColor,'entering Park keeps the current automatic browser color');
    assert.equal(root.classList.contains('world-park-active'),true);
    assert.equal(root.dataset.theme,'dark','Park preserves the member dark-mode preference');
    const frame = f.frame();
    frame.contentWindow.OjjudaParkFull={returnHome:()=>true};
    for (const other of ['hub','arcade','my']) {
      currentColor = {'hub':'#865668','arcade':'#2d6775','my':'#476d82'}[other];
      const before = refreshes;
      f.render(other);
      assert.equal(refreshes,before+1,'section changes ask the shared engine for its current palette');
      assert.equal(theme.content,currentColor,other+' uses the latest automatic color rather than a startup snapshot');
      assert.equal(root.classList.contains('world-park-active'),false);
      assert.equal(root.dataset.theme,'dark');
      f.render('park');
      assert.equal(f.frame(),frame,'color transitions preserve the cached Park frame');
      assert.equal(theme.content,currentColor,'returning to Park preserves the same latest palette');
    }
  } finally {f.dom.window.close();}
});

test('Park cache is retired after inactivity and never reused for another account', () => {
  const f = fixture();
  try {
    f.render('park');
    const first = f.frame();
    f.render('my');
    const [{fn, delay}] = [...f.timers.values()];
    assert.equal(delay, 60_000);
    fn();
    assert.equal(first.isConnected, false, 'expired Park is removed to release memory');
    f.render('park');
    const second = f.frame();
    assert.notEqual(second, first);
    f.setOwner('member-b');
    f.render('park');
    assert.notEqual(f.frame(), second, 'account change destroys the previous account frame');
    assert.equal(second.isConnected, false);
  } finally {f.dom.window.close();}
});

test('leaving a shared card before startup completes never reopens the old link', () => {
  const f = fixture('?place=park&card=test-card&keep=memo&source=link');
  try {
    f.render('park');
    const shared = f.frame();
    assert.equal(new URL(shared.src).searchParams.get('card'),'test-card');
    f.render('my'); f.render('park');
    assert.notEqual(f.frame(),shared);
    assert.equal(new URL(f.frame().src).searchParams.has('card'),false);
    assert.equal(f.window.location.search,'?place=park&source=link');
  } finally {f.dom.window.close();}
});

test('World URL normalization preserves the first Park entry options exactly once', () => {
  for(const [query,pathname,options,expectedNavigation=[]] of [
    ['compose=memo','/park/',{compose:'memo'}],
    ['card=10000000-0000-4000-8000-000000000001&keep=memo','/park/',{card:'10000000-0000-4000-8000-000000000001',keep:'memo'}],
    ['view=glasses','/park/glasses.html',{}],
    ['view=settings','/park/',{},['settings']]
  ]){
    const f=fixture('?place=park&'+query);
    try{
      f.window.history.replaceState({retained:true},'','/world.html?tab=hub');
      f.app.route();
      const first=f.frame(),url=new URL(first.src);
      assert.equal(url.pathname,pathname);
      for(const [key,value] of Object.entries(options))assert.equal(url.searchParams.get(key),value);
      const navigations=[];
      const ready=frame=>{
        frame.contentWindow.OjjudaParkFull={navigate:action=>navigations.push(action)};
        f.window.dispatchEvent(new f.window.MessageEvent('message',{origin:'https://fixture.test',source:frame.contentWindow,data:{type:'ojjuda:park-ready'}}));
      };
      ready(first);
      assert.deepEqual(navigations,expectedNavigation,'settings return opens its real Park settings');
      f.render('my');f.render('park');
      assert.notEqual(f.frame(),first,'a cold frame is recreated after leaving');
      const next=new URL(f.frame().src);
      assert.equal(next.pathname,'/park/');
      for(const key of ['card','keep','compose','view'])assert.equal(next.searchParams.has(key),false,'entry options do not replay');
      ready(f.frame());
      assert.deepEqual(navigations,expectedNavigation,'settings entry does not replay after leaving');
      assert.equal(f.window.history.state.retained,true);
    }finally{f.dom.window.close();}
  }
});

test('only the current visible Park composer hides the host navigation', () => {
  const f=fixture();
  const composing=()=>f.window.document.documentElement.classList.contains('world-park-composing');
  const report=(frame,data,origin='https://fixture.test')=>f.window.dispatchEvent(new f.window.MessageEvent('message',{
    origin,source:frame.contentWindow,data:{type:'ojjuda:park-state',overlayOpen:true,cardOpen:false,...data}
  }));
  try {
    f.render('park');
    const first=f.frame();
    first.contentWindow.OjjudaParkFull={returnHome:()=>true};
    report(first,{composerOpen:false});
    assert.equal(composing(),false,'another Park overlay does not hide page navigation');
    report(first,{composerOpen:true},'https://foreign.invalid');
    assert.equal(composing(),false,'foreign-origin messages cannot hide host controls');
    report(first,{composerOpen:true});
    assert.equal(composing(),true,'the active composer gets the full writing screen');
    f.render('park');
    assert.equal(composing(),true,'World repaint keeps the composer screen');
    report(first,{composerOpen:false,overlayOpen:false});
    assert.equal(composing(),false,'closing the writer restores host navigation');
    report(first,{composerOpen:true});
    f.render('my');
    assert.equal(composing(),false,'a hidden Park frame cannot hide another page navigation');
    report(first,{composerOpen:true});
    assert.equal(composing(),false,'late reports from the cached hidden frame stay isolated');
    f.setOwner('member-b');f.render('park');
    const current=f.frame();
    assert.notEqual(current,first);
    assert.equal(composing(),false,'account replacement clears composing state');
    report(first,{composerOpen:true});
    assert.equal(composing(),false,'the previous frame cannot affect the new account');
    report(current,{composerOpen:true});
    assert.equal(composing(),true);
    report(current,{composerOpen:false,overlayOpen:false});
    assert.equal(composing(),false);
  } finally {f.dom.window.close();}
});

test('Park menu selection follows the current card frame and survives shell repaint', () => {
  const f=fixture();
  const report=(frame,action,origin='https://fixture.test')=>f.window.dispatchEvent(new f.window.MessageEvent('message',{
    origin,source:frame.contentWindow,data:{type:'ojjuda:park-state',navigationAction:action}
  }));
  const selected=()=>[...f.window.document.querySelectorAll('.sidenav [aria-current="page"],.bottomnav [aria-current="page"]')].map(button=>button.dataset.parkAction);
  try {
    f.render('park');
    const frame=f.frame();let view='feed';
    frame.contentWindow.OjjudaParkFull={navigationAction:()=>view,returnHome:()=>{view='feed';return true;},navigate(action){view=action;return true;}};
    f.app.open('saved');
    assert.deepEqual(selected(),['saved','saved'],'phone and desktop use the same selection');
    assert.equal(f.app.navigationAction(),'saved');
    f.render('park');
    assert.equal(f.frame(),frame,'menu repaint keeps the existing card frame connected');
    assert.deepEqual(selected(),['saved','saved']);
    report(frame,'settings','https://foreign.invalid');
    assert.deepEqual(selected(),['saved','saved'],'another origin cannot select a Park menu');
    report(frame,'not-a-menu');
    assert.deepEqual(selected(),['saved','saved'],'unknown menu actions are ignored');
    view='settings';report(frame,'settings');
    assert.deepEqual(selected(),['settings','settings']);
    f.setOwner('member-b');f.render('park');
    const current=f.frame();
    assert.notEqual(current,frame);
    report(frame,'saved');
    assert.equal(f.app.navigationAction(),'feed','a previous account frame cannot change the selected menu');
    current.contentWindow.OjjudaParkFull={navigationAction:()=> 'mine'};
    report(current,'mine');
    assert.deepEqual(selected(),['mine','mine']);
  } finally {f.dom.window.close();}
});

test('Agit return from Park settings respects pending saves and the active frame', () => {
  const f=fixture();
  const go=(frame,origin='https://fixture.test')=>f.window.dispatchEvent(new f.window.MessageEvent('message',{
    origin,source:frame.contentWindow,data:{type:'ojjuda:park-navigate',action:'world'}
  }));
  try {
    f.render('park');
    const frame=f.frame();
    frame.contentWindow.canCloseParkNote=()=>false;
    go(frame);
    assert.equal(f.worldReturns(),0,'a pending card or account save blocks leaving Park');
    frame.contentWindow.canCloseParkNote=()=>true;
    go(frame,'https://foreign.invalid');
    assert.equal(f.worldReturns(),0);
    go(frame);
    assert.equal(f.worldReturns(),1);
    assert.equal(f.window.document.querySelector('.topbar').textContent,'hub');
    assert.equal(frame.closest('[data-park-app]').hidden,true,'returning to Agit keeps only an inactive cached Park');
  } finally {f.dom.window.close();}
});


test('World history restores a cached Park view and delivers its snapshot to a recreated frame', () => {
  const f=fixture();
  const saved={owner:'member-a',mode:'saved',card:'10000000-0000-4000-8000-000000000001',view:null};
  try {
    f.render('park');const first=f.frame();let homes=0;
    const restored=[];
    first.contentWindow.OjjudaParkFull={
      returnHome(){homes++;return true;},navigationAction:()=> 'saved',
      navigationSnapshot:()=>saved,restoreNavigation:route=>restored.push(route),cardOpen:()=>true
    };
    assert.deepEqual(f.app.snapshot(),saved);
    f.render('arcade');f.setRestoring(true);f.app.restoreSnapshot(saved);f.render('park');
    assert.equal(f.frame(),first);assert.equal(homes,0,'history Back does not reset the cached frame to feed');
    assert.deepEqual(restored,[saved]);assert.equal(f.app.navigationAction(),'saved');
    f.setRestoring(false);f.render('arcade');[...f.timers.values()][0].fn();
    f.setRestoring(true);f.app.restoreSnapshot(saved);f.render('park');const fresh=f.frame();
    assert.notEqual(fresh,first);
    fresh.contentWindow.OjjudaParkFull={restoreNavigation:route=>restored.push(route),navigationAction:()=> 'saved'};
    f.window.dispatchEvent(new f.window.MessageEvent('message',{origin:'https://fixture.test',source:fresh.contentWindow,data:{type:'ojjuda:park-ready'}}));
    assert.deepEqual(restored,[saved,saved],'retirement does not lose the saved menu/card route');
  } finally {f.dom.window.close();}
});

test('Park administrator entry uses the current host role, owner and visible frame', () => {
  const f = fixture();
  const send = (frame, data, origin = 'https://fixture.test') => f.window.dispatchEvent(new f.window.MessageEvent('message', {
    origin, source: frame.contentWindow, data
  }));
  const enter = (frame, userId = 'member-a', origin) => send(frame, {type:'ojjuda:park-navigate', action:'admin', userId}, origin);
  try {
    f.render('park');
    const frame = f.frame(), access = [], navigations = [];
    frame.contentWindow.OjjudaParkFull = {
      setAdminAccess(value) {access.push(JSON.parse(JSON.stringify(value)));},
      returnHome: () => true,
      navigate: action => navigations.push(action)
    };
    f.app.refreshAdmin();
    assert.deepEqual(access.at(-1), {userId:'member-a', allowed:false});
    enter(frame);
    assert.equal(f.adminEntries(),0,'a member cannot request administrator entry');
    f.setAdmin('true'); f.app.refreshAdmin(); enter(frame);
    assert.equal(access.at(-1).allowed,false,'only the verified boolean host role enables the shortcut');
    assert.equal(f.adminEntries(),0);
    f.setAdmin(true);
    send(frame,{type:'ojjuda:park-admin-refresh'});
    assert.deepEqual(access.at(-1), {userId:'member-a', allowed:true},'a late host role result updates the open settings');
    enter(frame,'member-a','https://foreign.invalid');
    enter(frame,'member-b');
    assert.equal(f.adminEntries(),0,'foreign origins and another member cannot enter');
    frame.contentWindow.canCloseParkNote = () => false;
    enter(frame);
    assert.equal(f.adminEntries(),0,'pending Park writes still block administrator entry');
    frame.contentWindow.canCloseParkNote = () => true;
    f.setOwner('member-b'); f.app.refreshAdmin(); enter(frame);
    assert.equal(access.at(-1).allowed,false,'an old frame loses its shortcut when the host account changes');
    assert.equal(f.adminEntries(),0);
    f.setOwner('member-a'); f.app.refreshAdmin();
    enter(frame);
    assert.equal(f.adminEntries(),1);
    assert.equal(f.window.document.querySelector('.topbar').textContent,'admin');
    assert.equal(access.at(-1).allowed,false,'the inactive cached frame loses the active administrator shortcut');
    enter(frame);
    assert.equal(f.adminEntries(),1,'hidden cached Park cannot reopen administrator mode');
    f.app.open('settings');
    assert.equal(f.frame(),frame,'returning to Park settings reuses the same frame');
    assert.equal(navigations.at(-1),'settings');
    assert.equal(access.at(-1).allowed,true);
    f.setAdmin(false); f.app.refreshAdmin(); enter(frame);
    assert.equal(access.at(-1).allowed,false,'revoking the host role removes access without reopening Park');
    assert.equal(f.adminEntries(),1);
    f.setOwner(null); f.setAdmin(true); f.app.refreshAdmin(); enter(frame,null);
    assert.equal(access.at(-1).allowed,false,'a guest cannot inherit the previous administrator role');
    assert.equal(f.adminEntries(),1);
  } finally {f.dom.window.close();}
});

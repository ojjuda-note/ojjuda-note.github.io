const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const backSource = read('shared/navigation/section-back.js');

function fixture({section='hub', from='', embedded=false, returnLink=false, hash='', initialState=null, failReplace=false, failPush=false, previous='', referrer=previous, navigationEntries=null}={}) {
  const events = new Map(), replacements = [], warnings = [], emittedEvents = [];
  const window = {addEventListener(name, fn) { events.set(name, fn); }};
  window.top = embedded ? {} : window;
  const initialUrl='https://ojjuda.test/guide.html'+(from?'?from='+from:'')+hash;
  const entries=[...(previous?[{href:previous,state:null}]:[]),{href:initialUrl,state:initialState}];
  let cursor=entries.length-1;
  if(navigationEntries)window.navigation={currentEntry:{index:navigationEntries.length-1},entries:()=>navigationEntries};
  const location = {
    href:initialUrl,
    search:from?'?from='+from:'',
    replace(href) { replacements.push(href); }
  };
  function select(entry) {
    location.href=entry.href;
    location.search=new URL(entry.href).search;
  }
  function emitNavigation(previousHref, {popstate=true, hashchangeFirst=false, duplicatePopstate=false}={}) {
    const fragmentChanged=previousHref!==location.href && previousHref.split('#')[0]===location.href.split('#')[0];
    const emitPopstate=() => {
      emittedEvents.push('popstate');
      events.get('popstate')?.({state:history.state});
    };
    const emitHashchange=() => {
      if (!fragmentChanged) return;
      emittedEvents.push('hashchange');
      events.get('hashchange')?.({oldURL:previousHref,newURL:location.href});
    };
    if (hashchangeFirst) emitHashchange();
    if (popstate) emitPopstate();
    if (!hashchangeFirst) emitHashchange();
    if (popstate && duplicatePopstate) emitPopstate();
  }
  const history = {
    get state() { return entries[cursor].state; },
    get length() { return entries.length; },
    pushes:0, replaces:0, backCalls:0,
    back(){this.backCalls++;if(cursor>0){const before=location.href;cursor--;select(entries[cursor]);emitNavigation(before);}},
    replaceState(value, title, href=location.href) {
      if (failReplace) throw new Error('replaceState blocked');
      entries[cursor]={href:new URL(href,location.href).href,state:value};
      this.replaces++;
      select(entries[cursor]);
    },
    pushState(value, title, href=location.href) {
      if (failPush) throw new Error('pushState blocked');
      entries.splice(cursor+1);
      entries.push({href:new URL(href,location.href).href,state:value});
      cursor++;
      this.pushes++;
      select(entries[cursor]);
    }
  };
  const label = {textContent:''}, anchor = {href:'',querySelector(selector) {return selector==='[data-section-return-label]'?label:null;}};
  const document = {
    referrer,
    currentScript:{dataset:{returnTo:section}},
    addEventListener(name,fn){events.set('document:'+name,fn);},
    querySelectorAll(selector){return returnLink&&selector==='[data-section-return]'?[anchor]:[];},
    querySelector(selector) {return returnLink&&selector==='[data-section-return]'?anchor:null;}
  };
  vm.runInNewContext(backSource,{window,history,location,document,URL,URLSearchParams,console:{warn(...args) { warnings.push(args); }},Object});
  return {
    history,replacements,anchor,label,location,warnings,emittedEvents,
    clickReturn(){let prevented=false;events.get('document:click')?.({button:0,target:{closest:()=>anchor},preventDefault(){prevented=true;}});return prevented;},
    back(state) {
      if (arguments.length===0) return this.go(-1);
      events.get('popstate')?.({state});
    },
    hash(value, options) {
      const previousHref=location.href, next=new URL(previousHref);
      next.hash=value;
      const entry={href:next.href,state:null};
      // Reactivating the current fragment replaces its entry. It still emits
      // popstate with null classic history state, but no hashchange.
      if (next.href===previousHref) entries[cursor]=entry;
      else {
        entries.splice(cursor+1);
        entries.push(entry);
        cursor++;
      }
      select(entries[cursor]);
      emitNavigation(previousHref,options);
    },
    go(delta) {
      const next=cursor+delta;
      assert.ok(next>=0 && next<entries.length,'history target exists');
      const previousHref=location.href;
      cursor=next;
      select(entries[cursor]);
      emitNavigation(previousHref);
    },
    popTo(href, state=null) {
      select({href});
      events.get('popstate')?.({state});
    },
    get hasListener() { return events.has('popstate'); }
  };
}

test('a direct entry falls back to its owning section', () => {
  const cases = [
    ['hub','/world.html?tab=hub'],
    ['arcade','/world.html?tab=arcade'],
    ['park','/park/'],
    ['my','/world.html?tab=my'],
    ['pajang','/features/pajang/station.html?tab=profile'],
    ['admin','/world.html?admin=overview']
  ];
  for (const [section,target] of cases) {
    const f=fixture({section});
    assert.equal(f.history.pushes,1,section);
    f.back();
    assert.deepEqual(f.replacements,[target],section);
  }
});

test('a shared guide returns to the section that opened it', () => {
  const f=fixture({section:'hub',from:'park'});
  f.back();assert.deepEqual(f.replacements,['/park/']);
  const g=fixture({section:'hub',from:'my'});
  g.back();assert.deepEqual(g.replacements,['/world.html?tab=my']);
});

test('legal policy Back links keep their originating settings section', () => {
  const settings=fixture({section:'hub',from:'my',returnLink:true});
  assert.equal(settings.anchor.href,'/world.html?tab=my');
  assert.equal(settings.label.textContent,'설정으로 돌아가기');
  settings.back();
  assert.deepEqual(settings.replacements,['/world.html?tab=my']);
  const pajang=fixture({section:'hub',from:'pajang',returnLink:true});
  assert.equal(pajang.anchor.href,'/features/pajang/station.html?tab=profile');
  assert.equal(pajang.label.textContent,'내 파장으로 돌아가기');
  pajang.back();
  assert.deepEqual(pajang.replacements,['/features/pajang/station.html?tab=profile']);
  const general=fixture({section:'hub',returnLink:true});
  assert.equal(general.anchor.href,'/world.html?tab=hub');
});

test('in-page history entries and embedded game frames are not hijacked', () => {
  const f=fixture({section:'hub'});
  f.back(f.history.state);
  assert.deepEqual(f.replacements,[]);
  const embedded=fixture({section:'hub',embedded:true});
  assert.equal(embedded.history.pushes,0);
  assert.equal(embedded.history.replaces,0);
  assert.equal(embedded.hasListener,false);
});

test('native hash links and their Back/Forward history stay within the page', () => {
  const f=fixture({section:'hub'});
  f.hash('#profile');
  assert.equal(f.history.state,null,'native fragment entries have no application marker');
  assert.deepEqual(f.replacements,[],'opening the first section must not leave the page');
  f.hash('#photos');
  f.go(-1);
  assert.ok(f.location.href.endsWith('#profile'));
  f.go(1);
  assert.ok(f.location.href.endsWith('#photos'));
  assert.deepEqual(f.replacements,[],'Back and Forward among sections must remain local');
  f.go(-1);
  f.go(-1);
  assert.equal(new URL(f.location.href).hash,'');
  assert.deepEqual(f.replacements,[],'returning from a section to the page top is local');
  f.go(-1);
  assert.deepEqual(f.replacements,['/world.html?tab=hub'],'the original exit boundary still returns to the owner');
  assert.equal(f.history.pushes,1,'fragment navigation does not create extra guard entries');
});

test('hash navigation is tracked when a browser only emits hashchange', () => {
  const f=fixture({section:'park'});
  f.hash('#profile');
  f.hash('#photos',{popstate:false});
  f.go(-1);
  assert.ok(f.location.href.endsWith('#profile'));
  assert.deepEqual(f.replacements,[],'an earlier null-state fragment is not an exit');
  f.go(-1);
  f.go(-1);
  assert.deepEqual(f.replacements,['/park/']);
});

test('reactivating the current fragment stays local and preserves the real exit boundary', () => {
  for (const initialHash of ['', '#videos']) {
    const f=fixture({section:'hub',hash:initialHash});
    if (!initialHash) f.hash('#videos');
    const length=f.history.length, eventCount=f.emittedEvents.length;
    f.hash('#videos');
    assert.equal(f.history.length,length,'same-fragment activation replaces, rather than adds, an entry');
    assert.deepEqual(f.emittedEvents.slice(eventCount),['popstate'],'an unchanged fragment must not emit hashchange');
    assert.equal(f.history.state,null,'native fragment activation does not inherit the guard state');
    assert.deepEqual(f.replacements,[],`${initialHash || 'page top'}: activating the same anchor must not leave the page`);
    f.hash('#profile');
    f.go(-1);
    assert.ok(f.location.href.endsWith('#videos'));
    assert.deepEqual(f.replacements,[],'Back from another section must return to the reactivated anchor');
    if (!initialHash) f.go(-1);
    f.go(-1);
    assert.deepEqual(f.replacements,['/world.html?tab=hub'],'the explicitly marked exit still returns to the owner');
  }
});

test('a hashchange observed before popstate cannot turn a local anchor into an exit', () => {
  const f=fixture({section:'park'});
  f.hash('#videos',{hashchangeFirst:true});
  assert.deepEqual(f.emittedEvents,['hashchange','popstate']);
  assert.deepEqual(f.replacements,[],'event delivery order must not determine whether a local section is an exit');
  f.hash('#profile',{hashchangeFirst:true});
  assert.deepEqual(f.replacements,[],'a later unmarked fragment also remains local');
  f.go(-1);
  f.go(-1);
  f.go(-1);
  assert.deepEqual(f.replacements,['/park/']);
});

test('duplicate popstate notifications for a local fragment are harmless', () => {
  const f=fixture({section:'my'});
  f.hash('#videos');
  const eventCount=f.emittedEvents.length;
  f.hash('#profile',{duplicatePopstate:true});
  assert.deepEqual(f.emittedEvents.slice(eventCount),['popstate','hashchange','popstate']);
  assert.deepEqual(f.replacements,[],'a repeated null-state notification is not evidence of leaving the page');
  f.go(-1);
  f.go(-1);
  f.go(-1);
  assert.deepEqual(f.replacements,['/world.html?tab=my']);
});

test('a page opened at a hash preserves local history and its real exit', () => {
  const f=fixture({section:'my',hash:'#videos'});
  f.hash('#music');
  f.go(-1);
  assert.ok(f.location.href.endsWith('#videos'));
  assert.deepEqual(f.replacements,[]);
  f.go(-1);
  assert.deepEqual(f.replacements,['/world.html?tab=my']);
  const direct=fixture({section:'admin',hash:'#overview'});
  direct.go(-1);
  assert.deepEqual(direct.replacements,['/world.html?admin=overview'],'Back at an unchanged entry hash still exits');
});

test('multi-step Back recognizes the exit boundary even when the fragment changes', () => {
  for (const hash of ['', '#videos']) {
    for (const distance of [2,3]) {
      const f=fixture({section:'park',hash});
      f.hash('#profile');
      if (distance===3) f.hash('#photos');
      f.go(-distance);
      assert.deepEqual(f.replacements,['/park/'],`${hash || 'page top'}: go(-${distance})`);
    }
  }
  const middle=fixture({section:'my',hash:'#videos'});
  middle.hash('#profile');
  middle.hash('#photos');
  middle.go(-1);
  assert.deepEqual(middle.replacements,[],'an intermediate fragment remains local');
  middle.go(-2);
  assert.deepEqual(middle.replacements,['/world.html?tab=my']);
});

test('explicit history markers and other application state are preserved', () => {
  const original={filter:'girl',ojjudaSectionExit:true};
  const f=fixture({initialState:original});
  assert.equal(f.history.state.filter,'girl');
  assert.equal(f.history.state.ojjudaSectionBack,true);
  assert.equal(f.history.state.ojjudaSectionExit,undefined,'the active guard must never carry the exit flag');
  f.go(-1);
  assert.equal(f.history.state.filter,'girl');
  assert.equal(f.history.state.ojjudaSectionExit,true);
  assert.deepEqual(original,{filter:'girl',ojjudaSectionExit:true},'existing state is not mutated');
  const resumed=fixture({hash:'#photos',initialState:{ojjudaSectionBack:true,filter:'boy'}});
  assert.equal(resumed.history.pushes,0,'a marked page must not add a second guard on restore');
  assert.equal(resumed.history.replaces,0);
  resumed.back(resumed.history.state);
  assert.deepEqual(resumed.replacements,[]);
  assert.equal(resumed.history.state.filter,'boy');
});

test('blocked history APIs leave the page usable and restore its existing state', () => {
  for (const failure of [{failReplace:true},{failPush:true}]) {
    const original={filter:'girl'};
    const f=fixture({...failure,initialState:original});
    assert.equal(f.warnings.length,1);
    assert.equal(f.history.pushes,0);
    assert.deepEqual(f.history.state,original,'failed setup must not leave an exit flag on the live entry');
    assert.equal(f.history.state.ojjudaSectionExit,undefined);
    f.hash('#photos');
    assert.deepEqual(f.replacements,[],'page sections still work when history setup is blocked');
  }
});

test('unmarked SPA path and query entries retain their own navigation', () => {
  for (const href of ['https://ojjuda.test/other.html#photos','https://ojjuda.test/guide.html?other=1#photos']) {
    const f=fixture({section:'hub'});
    f.popTo(href);
    assert.deepEqual(f.replacements,[],href);
  }
});

test('every standalone return link points to its intended section', () => {
  const hubPages=[
    'features/arcade/monthly-ranking.html','groups/index.html',
    'features/fanpages/index.html','features/fanpages/artist.html',
    'games/certified-restaurants/index.html',
    'byeolcheonji/index.html','star/index.html',
    ...fs.readdirSync(path.join(root,'features/fanpages/idols'))
      .filter(name => name.endsWith('.html'))
      .map(name => `features/fanpages/idols/${name}`)
  ];
  for (const file of hubPages) {
    const html=read(file);
    assert.match(html,/href="\/world\.html\?tab=hub"/,file);
    assert.doesNotMatch(html,/href="\/world\.html\?tab=arcade"/,file);
  }
  for (const file of ['games/sacheonseong/index.html','games/spot-difference/index.html','games/ojjuda-tour/index.html']) {
    assert.match(read(file),/href="\/world\.html\?tab=arcade"/,file);
  }
  assert.match(read('games/solitaire/app.js'),/location\.assign\('\/world\.html\?tab=arcade'\)/);
  assert.match(read('gift.html'),/href="\/world\.html\?tab=my"/);
  assert.match(read('delete-account.html'),/href="\/world\.html\?tab=my"/);
  for (const file of ['terms.html','privacy.html']) {
    assert.match(read(file),/data-section-return/,file);
    assert.match(read(file),/section-back\.js/,file);
  }
  assert.match(read('park/glasses.html'),/href="\/park\/"/);
  assert.match(read('admin/rewards.html'),/href="\/world\.html\?admin=overview"/);
});

test('hub is a valid navigation tab, while direct games return to the arcade', () => {
  const world=read('world.html');
  assert.match(world,/\["hub","arcade","park","my","admin"\]\.includes\(t\.tab\)/);
  assert.match(world,/url\.searchParams\.set\('tab','hub'\)/);
  assert.match(world,/function worldGameCloseUrl\(\)/);
  assert.match(world,/url\.searchParams\.set\('tab','arcade'\)/);
  assert.match(world,/sr\.tab\(\{tab:'arcade'\}\);\s*Al\(game\.id\)/);
  assert.doesNotMatch(world,/isSectionRoot:\(\)=>\["park","my"\]\.includes\(worldMainTab\(\)\)/);
  assert.match(read('index.html'),/url\.searchParams\.set\('tab', 'hub'\)/);
  assert.match(read('guide.html'),/header-back/);
  assert.match(world,/guide\.html\?from=my/);
  assert.match(world,/terms\.html\?from=my/);
  assert.match(world,/privacy\.html\?from=my/);
  assert.match(read('park/index.html'),/guide\.html\?from=park" target="_top"/);
});

test('game refresh revision stays consistent across loader and manifest', () => {
  const expected=JSON.parse(read('game-release.json')).revision;
  assert.match(read('shared/games/world-game-assets.js'),new RegExp(`const revision='${expected}'`));
  assert.ok(read('world.html').includes(`/shared/games/world-game-assets.js?v=${expected}`));
});


test('Back follows the actual previous page across standalone sections', () => {
  for (const previous of ['https://ojjuda.test/features/fanpages/index.html?filter=girl', 'https://ojjuda.test/world.html?tab=my', 'https://ojjuda.test/admin/rewards.html']) {
    const f=fixture({previous});
    assert.equal(f.history.pushes,0,'normal navigation must not insert a duplicate');
    f.back();
    assert.equal(f.location.href,previous);
    assert.deepEqual(f.replacements,[],'the owning-section fallback must not replace real history');
  }
});

test('the visible Back link uses the same history as browser Back', () => {
  const previous='https://ojjuda.test/features/fanpages/index.html?filter=boy';
  const f=fixture({previous,returnLink:true});
  assert.equal(f.label.textContent,'이전 화면으로 돌아가기');
  assert.equal(f.clickReturn(),true);
  assert.equal(f.history.backCalls,1);
  assert.equal(f.location.href,previous);
  assert.deepEqual(f.replacements,[]);
});

test('a new tab cannot mistake its opener for a previous history entry', () => {
  const f=fixture({referrer:'https://ojjuda.test/world.html?tab=my'});
  assert.equal(f.history.pushes,1);
  f.back();
  assert.deepEqual(f.replacements,['/world.html?tab=hub']);
});

test('external previous pages do not count as in-app history', () => {
  const f=fixture({previous:'https://outside.test/',section:'park'});
  assert.equal(f.history.pushes,1);
  f.back();
  assert.deepEqual(f.replacements,['/park/']);
});

test('Navigation API entries recover same-origin history even without a referrer', () => {
  const previous='https://ojjuda.test/features/fanpages/index.html';
  const f=fixture({previous,referrer:'',navigationEntries:[{index:0,url:previous},{index:1,url:'https://ojjuda.test/guide.html'}]});
  assert.equal(f.history.pushes,0);
  f.back();
  assert.equal(f.location.href,previous);
  assert.deepEqual(f.replacements,[]);
});


test('direct administrator tools retain the service that opened them', () => {
  for(const from of ['park','pajang']) {
    const f=fixture({section:'admin',from,returnLink:true});
    const target='/world.html?admin=overview&from='+from;
    assert.equal(f.anchor.href,target);
    f.back();assert.deepEqual(f.replacements,[target]);
  }
});

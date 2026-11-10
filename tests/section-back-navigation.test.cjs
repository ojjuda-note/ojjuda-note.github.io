const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const backSource = read('shared/navigation/section-back.js');

function fixture({section='hub', from='', embedded=false, returnLink=false}={}) {
  const events = new Map(), replacements = [];
  const window = {addEventListener(name, fn) { events.set(name, fn); }};
  window.top = embedded ? {} : window;
  const history = {
    state: null, pushes:0,
    pushState(value) { this.state=value; this.pushes++; }
  };
  const location = {
    href:'https://ojjuda.test/guide.html'+(from?'?from='+from:''),
    search:from?'?from='+from:'',
    replace(href) { replacements.push(href); }
  };
  const label = {textContent:''}, anchor = {href:'',querySelector(selector) {return selector==='[data-section-return-label]'?label:null;}};
  const document = {
    currentScript:{dataset:{returnTo:section}},
    querySelector(selector) {return returnLink&&selector==='[data-section-return]'?anchor:null;}
  };
  vm.runInNewContext(backSource,{window,history,location,document,URLSearchParams,console,Object});
  return {
    history,replacements,anchor,label,
    back(state=null) { events.get('popstate')?.({state}); },
    get hasListener() { return events.has('popstate'); }
  };
}

test('standalone Back returns to the correct section, not the previous random page', () => {
  const cases = [
    ['hub','/world.html?tab=hub'],
    ['arcade','/world.html?tab=hub'],
    ['park','/world.html?tab=park'],
    ['my','/world.html?tab=my'],
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
  f.back();assert.deepEqual(f.replacements,['/world.html?tab=park']);
  const g=fixture({section:'hub',from:'my'});
  g.back();assert.deepEqual(g.replacements,['/world.html?tab=my']);
});

test('legal policy Back links keep their originating settings section', () => {
  const settings=fixture({section:'hub',from:'my',returnLink:true});
  assert.equal(settings.anchor.href,'/world.html?tab=my');
  assert.equal(settings.label.textContent,'설정으로 돌아가기');
  settings.back();
  assert.deepEqual(settings.replacements,['/world.html?tab=my']);
  const general=fixture({section:'hub',returnLink:true});
  assert.equal(general.anchor.href,'/world.html?tab=hub');
});

test('in-page history entries and embedded game frames are not hijacked', () => {
  const f=fixture({section:'hub'});
  f.back(f.history.state);
  assert.deepEqual(f.replacements,[]);
  const embedded=fixture({section:'hub',embedded:true});
  assert.equal(embedded.history.pushes,0);
  assert.equal(embedded.hasListener,false);
});

test('every standalone return link points to its intended section', () => {
  const hubPages=[
    'features/arcade/monthly-ranking.html','groups/index.html',
    'features/fanpages/index.html','features/fanpages/artist.html',
    'games/certified-restaurants/index.html',
    'byeolcheonji/index.html','star/index.html'
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
  assert.match(read('park/glasses.html'),/href="\/park\/\?embedded=1"/);
  assert.match(read('admin/meeting/index.html'),/href="\/world\.html\?admin=overview"/);
  assert.match(read('admin/rewards.html'),/href="\/world\.html\?admin=overview"/);
});

test('hub is a valid navigation tab, while direct games return to the arcade', () => {
  const world=read('world.html');
  assert.match(world,/\["hub","arcade","park","my","admin"\]\.includes\(t\.tab\)/);
  assert.match(world,/url\.searchParams\.set\('tab','hub'\)/);
  assert.match(world,/function worldGameCloseUrl\(\)/);
  assert.match(world,/url\.searchParams\.set\('tab','arcade'\)/);
  assert.match(world,/sr\.tab\(\{tab:'arcade'\}\);\s*Al\(game\.id\)/);
  assert.match(world,/isSectionRoot:\(\)=>\["park","my"\]\.includes\(worldMainTab\(\)\)/);
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
